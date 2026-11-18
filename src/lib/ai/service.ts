import { z } from 'zod';

const responseSchema = z.object({
  model: z.string().optional(),
  choices: z.array(z.object({ message: z.object({ content: z.string() }), finish_reason: z.string().nullable().optional() })).min(1),
  usage: z.object({ prompt_tokens: z.number().int().nonnegative().optional(), completion_tokens: z.number().int().nonnegative().optional(), total_tokens: z.number().int().nonnegative().optional(), cost: z.number().nonnegative().optional() }).optional(),
});

export class AIRequestTimeoutError extends Error {
  constructor() { super('AI 服务响应超时，请重试'); }
}

export class AIModelOutputError extends Error {}

function configuration() {
  const url = process.env.AI_API_URL;
  const model = process.env.AI_MODEL;
  const key = process.env.AI_API_KEY;
  const provider = process.env.AI_PROVIDER;
  if (!provider || !url || !model || !key) throw new Error('真实 AI 未配置完整：需要 AI_PROVIDER、AI_API_URL、AI_MODEL 和 AI_API_KEY');
  const endpoint = new URL(url);
  if (endpoint.protocol !== 'https:' && !(endpoint.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(endpoint.hostname))) {
    throw new Error('AI_API_URL 必须使用 HTTPS（本机测试端点除外）');
  }
  const timeout = Number(process.env.AI_TIMEOUT_MS ?? 30_000);
  if (!Number.isInteger(timeout) || timeout < 1_000 || timeout > 45_000) throw new Error('AI_TIMEOUT_MS 必须介于 1000 与 45000 毫秒之间');
  return { provider, url: endpoint.toString(), model, key, timeout };
}

export async function callModel<T>(operation: string, system: string, input: unknown, schema: z.ZodType<T>, maxOutputTokens: number): Promise<T> {
  const config = configuration();
  const start = Date.now();
  let usage: z.infer<typeof responseSchema>['usage'];
  let actualModel: string | null = null;
  let finishReason: string | null = null;
  let outcome = 'error';
  try {
    const response = await fetch(config.url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${config.key}`, 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(config.timeout),
      body: JSON.stringify({ model: config.model, max_tokens: maxOutputTokens, response_format: { type: 'json_object' }, messages: [{ role: 'system', content: system }, { role: 'user', content: JSON.stringify(input) }] }),
    });
    if (response.status === 408 || response.status === 504) { outcome = 'timeout'; throw new AIRequestTimeoutError(); }
    if (!response.ok) throw new Error(`AI 服务请求失败（HTTP ${response.status}）`);
    const data = responseSchema.parse(await response.json());
    usage = data.usage;
    actualModel = data.model ?? null;
    finishReason = data.choices[0].finish_reason ?? null;
    if (finishReason === 'length') throw new AIModelOutputError('AI 输出达到 Token 上限，请重试');
    let content: unknown;
    try { content = JSON.parse(data.choices[0].message.content); }
    catch { throw new AIModelOutputError('AI 返回了无效的 JSON，请重试'); }
    const result = schema.parse(content);
    outcome = 'ok';
    return result;
  } catch (error) {
    if (error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError')) { outcome = 'timeout'; throw new AIRequestTimeoutError(); }
    if (error instanceof z.ZodError) throw new AIModelOutputError('AI 返回内容不符合预期格式，请重试');
    if (error instanceof Error && error.message.startsWith('AI ')) throw error;
    throw new Error('AI 服务暂时不可用，请重试');
  } finally {
    console.info('[ai-call]', JSON.stringify({ operation, provider: config.provider, requestedModel: config.model, actualModel, outcome, durationMs: Date.now() - start, maxOutputTokens, finishReason, promptTokens: usage?.prompt_tokens ?? null, completionTokens: usage?.completion_tokens ?? null, totalTokens: usage?.total_tokens ?? null, cost: usage?.cost ?? null }));
  }
}
