import { z } from 'zod';
import { aiOwner, AIQuotaError, trainingModel } from './usage-context';

const responseSchema = z.object({
  model: z.string().optional(),
  choices: z.array(z.unknown()).optional(),
  error: z.object({ code: z.union([z.number().int(), z.string()]).optional() }).optional(),
  usage: z.object({ prompt_tokens: z.number().int().nonnegative().optional(), completion_tokens: z.number().int().nonnegative().optional(), total_tokens: z.number().int().nonnegative().optional(), cost: z.number().nonnegative().optional(), completion_tokens_details: z.object({ reasoning_tokens: z.number().int().nonnegative().nullish() }).nullish() }).optional(),
});
const choiceSchema = z.object({ message: z.object({ content: z.string().nullable() }), finish_reason: z.string().nullable().optional() });

export class AIRequestTimeoutError extends Error {
  constructor() { super('AI 服务响应超时，请重试'); }
}

export class AIRateLimitError extends Error {
  constructor() { super('AI 服务请求过多，请稍后重试（HTTP 429）'); }
}

export class AIProviderAccessError extends Error {
  constructor() { super('模型服务已拒绝请求；可能是免费额度、模型权限或账号配置问题，请联系管理员。'); }
}

export class AIModelOutputError extends Error {}
class AIInvalidJSONError extends AIModelOutputError {}
class AIInvalidStructureError extends AIModelOutputError {}

function configuredTrainingModels(): string[] {
  const { AI_CALLS_ENABLED, AI_PROVIDER, AI_API_URL, AI_API_KEY, AI_MODEL, AI_ALLOWED_MODELS, RELEASE_PROFILE } = process.env;
  if (RELEASE_PROFILE === 'friend-preview' || AI_CALLS_ENABLED === '0' ||
      !AI_PROVIDER || !AI_API_URL || !AI_API_KEY || !AI_MODEL) return [];
  if (RELEASE_PROFILE === 'production') {
    return AI_CALLS_ENABLED === '1' && AI_PROVIDER === 'bailian' && AI_MODEL === 'qwen3.7-flash' ? [AI_MODEL] : [];
  }
  return [...new Set([AI_MODEL, ...(AI_ALLOWED_MODELS?.split(',') ?? [])].map(model => model.trim()))]
    .filter(model => /^[a-zA-Z0-9][a-zA-Z0-9._:/-]{0,149}$/.test(model));
}

export function availableTrainingModels(): string[] {
  return process.env.AI_MODE === 'real' ? configuredTrainingModels() : [];
}

function configuration(operation: string) {
  if (process.env.RELEASE_PROFILE === 'production' && process.env.AI_CALLS_ENABLED !== '1') throw new AIProviderAccessError();
  const url = process.env.AI_API_URL;
  const selected = trainingModel.getStore();
  if (selected && !configuredTrainingModels().includes(selected)) throw new AIProviderAccessError();
  const model = selected ?? process.env.AI_MODEL;
  const key = process.env.AI_API_KEY;
  const provider = process.env.AI_PROVIDER;
  if (!provider || !url || !model || !key) throw new Error('真实 AI 未配置完整：需要 AI_PROVIDER、AI_API_URL、AI_MODEL 和 AI_API_KEY');
  const endpoint = new URL(url);
  if (endpoint.protocol !== 'https:' && !(endpoint.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(endpoint.hostname))) {
    throw new Error('AI_API_URL 必须使用 HTTPS（本机测试端点除外）');
  }
  if (provider === 'bailian' && endpoint.href !== 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions') {
    throw new Error('百炼模式需要使用华北2（北京）的 Chat Completions 接口');
  }
  if (process.env.RELEASE_PROFILE === 'production' && (provider !== 'bailian' || model !== 'qwen3.7-flash')) {
    throw new AIProviderAccessError();
  }
  const timeout = Number(process.env.AI_TIMEOUT_MS ?? (operation === 'report' ? 45_000 : 30_000));
  if (!Number.isInteger(timeout) || timeout < 1_000 || timeout > 45_000) throw new Error('AI_TIMEOUT_MS 必须介于 1000 与 45000 毫秒之间');
  return { provider, url: endpoint.toString(), model, key, timeout };
}

type ModelOptions = { retryFormat?: boolean; temperature?: number; openRouterReasoningEffort?: 'low'; onModel?: (model: string | null) => void };

export async function callModel<T>(operation: string, system: string, input: unknown, schema: z.ZodType<T>, maxOutputTokens: number, options: ModelOptions = {}): Promise<T> {
  if (!Number.isInteger(maxOutputTokens) || maxOutputTokens < 1 || maxOutputTokens > 3800) throw new AIQuotaError('单次模型输出额度配置无效。');
  const config = configuration(operation);
  const signal = AbortSignal.timeout(config.timeout);
  try {
    return await requestModel(config, operation, system, input, schema, maxOutputTokens, signal, options);
  } catch (error) {
    const recoverable = error instanceof AIInvalidJSONError || (['reply', 'report'].includes(operation) && error instanceof AIInvalidStructureError);
    if (!options.retryFormat || !recoverable || signal.aborted) throw error;
    const correction = operation === 'report' ? (config.provider === 'bailian' ? '引用只能选择已有的 evidence_ref，scores 必须有四个维度对象和各自的 score、reason。' : '原话必须逐字复制对应的销售消息。')
      : operation === 'reply' ? '回应最新销售发言里的新信息，不得原样复制上一轮客户发言。' : '';
    return requestModel(config, operation, system + '\n严格按上述字段输出一个可解析的 JSON 对象，不加代码围栏或说明。' + correction, input, schema, maxOutputTokens, signal, options);
  }
}

async function requestModel<T>(config: ReturnType<typeof configuration>, operation: string, system: string, input: unknown, schema: z.ZodType<T>, maxOutputTokens: number, signal: AbortSignal, options: ModelOptions): Promise<T> {
  const owner = aiOwner.getStore();
  if (!owner && process.env.ACCOUNT_REQUIRED === '1') throw new AIQuotaError('该操作需要账号与用量记录。');
  const payload = JSON.stringify(input);
  if (Buffer.byteLength(system + payload, 'utf8') > 60_000) throw new AIQuotaError('本次对话内容过长，请缩短场景内容或开始新训练。');
  const ledger = owner ? await import('@/lib/usage') : null;
  const reservation = owner && ledger
    ? ledger.reserveUsage(owner, config.provider, config.model, operation, Buffer.byteLength(system + payload, 'utf8') + maxOutputTokens + 128)
    : null;
  const start = Date.now();
  let usage: z.infer<typeof responseSchema>['usage'];
  let actualModel: string | null = null;
  let finishReason: string | null = null;
  let upstreamCode: number | null = null;
  let outputError: 'envelope' | 'choice' | 'empty' | 'length' | 'json' | 'schema' | null = null;
  let outcome = 'error';
  try {
    const response = await fetch(config.url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${config.key}`, 'Content-Type': 'application/json' },
      redirect: 'error',
      signal,
      body: JSON.stringify({
        model: config.model,
        max_tokens: maxOutputTokens,
        temperature: options.temperature,
        reasoning: config.provider === 'openrouter' && options.openRouterReasoningEffort ? { effort: options.openRouterReasoningEffort } : undefined,
        enable_thinking: config.provider === 'bailian' ? false : undefined,
        response_format: { type: 'json_object' },
        messages: [{ role: 'system', content: system }, { role: 'user', content: payload }],
      }),
    });
    if (response.status === 408 || response.status === 504) { outcome = 'timeout'; throw new AIRequestTimeoutError(); }
    if (response.status === 429) { upstreamCode = 429; throw new AIRateLimitError(); }
    if (response.status === 403) { upstreamCode = 403; outcome = 'denied'; throw new AIProviderAccessError(); }
    if (!response.ok) {
      const errorBody = responseSchema.safeParse(await response.json().catch(() => null));
      if (errorBody.success && errorBody.data.error?.code === 'AllocationQuota.FreeTierOnly') {
        outcome = 'denied';
        throw new AIProviderAccessError();
      }
      throw new Error(`AI 服务请求失败（HTTP ${response.status}）`);
    }
    outputError = 'envelope';
    const data = responseSchema.parse(await response.json());
    usage = data.usage;
    actualModel = data.model ?? null;
    upstreamCode = typeof data.error?.code === 'number' ? data.error.code : null;
    if (upstreamCode === 408 || upstreamCode === 504) { outcome = 'timeout'; throw new AIRequestTimeoutError(); }
    if (upstreamCode === 429) throw new AIRateLimitError();
    if (upstreamCode === 403 || data.error?.code === 'AllocationQuota.FreeTierOnly') { outcome = 'denied'; throw new AIProviderAccessError(); }
    outputError = 'choice';
    const choice = choiceSchema.parse(data.choices?.[0]);
    finishReason = choice.finish_reason ?? null;
    if (finishReason === 'length') {
      outputError = 'length';
      throw new AIModelOutputError('AI 输出达到 Token 上限，请重试');
    }
    if (choice.message.content === null) {
      outputError = 'empty';
      throw new AIModelOutputError('AI 没有返回可用文本，请重试');
    }
    let content: unknown;
    outputError = 'json';
    try { content = JSON.parse(choice.message.content); }
    catch { throw new AIInvalidJSONError('AI 返回了无效的 JSON，请重试'); }
    outputError = 'schema';
    const result = schema.parse(content);
    options.onModel?.(actualModel);
    outputError = null;
    outcome = 'ok';
    return result;
  } catch (error) {
    if (error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError')) { outcome = 'timeout'; throw new AIRequestTimeoutError(); }
    if (error instanceof z.ZodError) {
      if (operation === 'report' && outputError === 'schema') {
        console.info('[ai-report-validation]', JSON.stringify(error.issues.map(issue => ({ code: issue.code, path: issue.path }))));
      }
      const OutputError = outputError === 'schema' ? AIInvalidStructureError : AIModelOutputError;
      throw new OutputError('AI 返回内容不符合预期格式，请重试');
    }
    if (error instanceof AIProviderAccessError || (error instanceof Error && error.message.startsWith('AI '))) throw error;
    throw new Error('AI 服务暂时不可用，请重试');
  } finally {
    if (ledger && reservation) ledger.closeUsage(reservation, {
      model: actualModel, promptTokens: usage?.prompt_tokens, completionTokens: usage?.completion_tokens,
      totalTokens: usage?.total_tokens, cost: usage?.cost, outcome,
    });
    console.info('[ai-call]', JSON.stringify({ operation, provider: config.provider, requestedModel: config.model, actualModel, outcome, durationMs: Date.now() - start, maxOutputTokens, finishReason, upstreamCode, outputError, promptTokens: usage?.prompt_tokens ?? null, completionTokens: usage?.completion_tokens ?? null, reasoningTokens: usage?.completion_tokens_details?.reasoning_tokens ?? null, totalTokens: usage?.total_tokens ?? null, cost: usage?.cost ?? null }));
  }
}
