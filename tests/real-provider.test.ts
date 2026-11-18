import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { getAIProvider } from '../src/lib/ai';
import { realProvider } from '../src/lib/ai/real-provider';
import { AIModelOutputError, AIRequestTimeoutError } from '../src/lib/ai/service';
import { handleError } from '../src/lib/api';
import type { ConversationMessage, Scenario } from '../src/lib/ai/provider';

const scenario: Scenario = { product: '网站建设', description: '为企业建设官方网站', identity: '企业负责人', personality: '价格敏感型', difficulty: '困难', goal: '处理客户异议' };
const profile = { identity: '企业负责人', needs: '增加线上询盘', budget: '每年两万元', concerns: '投入后没有效果', purchaseIntent: '愿意比较方案', decisionCriteria: '先看同类案例与报价', mode: 'real' as const };
const original = { ...process.env };

beforeEach(() => {
  process.env.AI_MODE = 'real';
  process.env.AI_PROVIDER = 'test-provider';
  process.env.AI_API_URL = 'http://localhost:3999/v1/chat/completions';
  process.env.AI_MODEL = 'test-model';
  process.env.AI_API_KEY = 'unit-secret';
  process.env.AI_TIMEOUT_MS = '1000';
  vi.spyOn(console, 'info').mockImplementation(() => {});
});
afterEach(() => {
  process.env = { ...original };
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function modelResponse(content: unknown, status = 200) {
  return Response.json({ choices: [{ message: { content: JSON.stringify(content) } }], usage: { prompt_tokens: 30, completion_tokens: 12, total_tokens: 42 } }, { status });
}

test('real provider sends hidden profile and full conversation only to the configured endpoint', async () => {
  const fetcher = vi.fn().mockResolvedValueOnce(modelResponse({ ...profile, identity: '其他身份' })).mockResolvedValueOnce(modelResponse({ reply: '你好，我在比较建站方案。' })).mockResolvedValueOnce(modelResponse({ reply: '您刚才提到案例，能给我看同类企业的效果吗？' }));
  vi.stubGlobal('fetch', fetcher);
  expect(getAIProvider()).toBe(realProvider);
  const created = await realProvider.generateCustomerProfile(scenario);
  expect(created).toEqual(profile);
  const opening = await realProvider.generateCustomerOpening(scenario, created);
  expect(opening).toContain('建站方案');
  const history: ConversationMessage[] = [
    { id: '1', role: 'customer', content: opening, sequence: 0 },
    { id: '2', role: 'user', content: '我们有制造业的案例。', sequence: 1 },
    { id: '3', role: 'customer', content: '案例可以看看吗？', sequence: 2 },
    { id: '4', role: 'user', content: '刚才提到的案例有询盘数据。', sequence: 3 },
  ];
  const reply = await realProvider.generateCustomerReply(scenario, created, history);
  expect(reply).toContain('案例');
  expect(fetcher).toHaveBeenCalledTimes(3);
  const [url, init] = fetcher.mock.calls[2] as [string, RequestInit];
  expect(url).toBe(process.env.AI_API_URL);
  expect((init.headers as Record<string, string>).Authorization).toBe('Bearer unit-secret');
  const request = JSON.parse(init.body as string);
  expect(request.model).toBe('test-model');
  expect(request.response_format).toEqual({ type: 'json_object' });
  expect(fetcher.mock.calls.map(([, options]) => JSON.parse((options as RequestInit).body as string).max_tokens)).toEqual([1400, 650, 1200]);
  const input = JSON.parse(request.messages[1].content);
  expect(input.profile).toEqual(created);
  expect(input.history).toEqual(history.map(({ role, content }) => ({ role, content })));
  expect(request.messages[0].content).toContain('不是提供产品或服务的销售方');
  const logs = vi.mocked(console.info).mock.calls.map(call => call.join(' ')).join(' ');
  expect(logs).toContain('"totalTokens":42');
  expect(logs).toContain('"durationMs":');
  expect(logs).not.toContain('unit-secret');
  expect(logs).not.toContain(profile.budget);
});

test('real mode never falls back to mock when configuration or response fails', async () => {
  delete process.env.AI_API_KEY;
  expect(getAIProvider()).toBe(realProvider);
  await expect(realProvider.generateCustomerOpening(scenario, profile)).rejects.toThrow('AI_API_KEY');
  process.env.AI_API_KEY = 'unit-secret';
  const fetcher = vi.fn()
    .mockResolvedValueOnce(new Response('secret provider error', { status: 429 }))
    .mockResolvedValueOnce(Response.json({ choices: [{ message: { content: 'not json' } }] }))
    .mockResolvedValueOnce(modelResponse({ reply: '' }));
  vi.stubGlobal('fetch', fetcher);
  await expect(realProvider.generateCustomerOpening(scenario, profile)).rejects.toThrow('HTTP 429');
  await expect(realProvider.generateCustomerOpening(scenario, profile)).rejects.toThrow('无效的 JSON');
  await expect(realProvider.generateCustomerOpening(scenario, profile)).rejects.toThrow('不符合预期格式');
  expect(vi.mocked(console.info).mock.calls.flat().join(' ')).not.toContain('secret provider error');
  expect(fetcher).toHaveBeenCalledTimes(3);
});

test('a truncated or incomplete profile is rejected and a known timeout maps to 504', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(Response.json({ choices: [{ message: { content: JSON.stringify(profile) }, finish_reason: 'length' }] }))
    .mockResolvedValueOnce(modelResponse({ identity: '企业负责人' })));
  await expect(realProvider.generateCustomerProfile(scenario)).rejects.toThrow('Token 上限');
  await expect(realProvider.generateCustomerProfile(scenario)).rejects.toThrow('不符合预期格式');
  const response = handleError(new AIRequestTimeoutError());
  expect(response.status).toBe(504);
  expect(await response.json()).toMatchObject({ success: false, error: { code: 'AI_TIMEOUT' } });
  const invalid = handleError(new AIModelOutputError('AI 返回了无效的 JSON，请重试'));
  expect(invalid.status).toBe(502);
  expect(await invalid.json()).toMatchObject({ success: false, error: { code: 'AI_INVALID_OUTPUT' } });
});

test('upstream gateway timeout is returned as an AI timeout', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('gateway timeout', { status: 504 })));
  await expect(realProvider.generateCustomerProfile(scenario)).rejects.toBeInstanceOf(AIRequestTimeoutError);
  expect(vi.mocked(console.info).mock.calls.flat().join(' ')).toContain('"outcome":"timeout"');
});

test('timeout is shorter than the session lease and aborts the request', async () => {
  process.env.AI_TIMEOUT_MS = '60000';
  await expect(realProvider.generateCustomerOpening(scenario, profile)).rejects.toThrow('45000');
  process.env.AI_TIMEOUT_MS = '1000';
  vi.stubGlobal('fetch', vi.fn((_url: string, init: RequestInit) => new Promise((_resolve, reject) => {
    init.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
  })));
  await expect(realProvider.generateCustomerOpening(scenario, profile)).rejects.toThrow('响应超时');
});

test('mock and real modes are explicit', () => {
  process.env.AI_MODE = 'mock';
  expect(getAIProvider()).not.toBe(realProvider);
  process.env.AI_MODE = 'unexpected';
  expect(() => getAIProvider()).toThrow('AI_MODE');
});
