import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';

test('mock mode remains explicit and session APIs omit the hidden profile', async ({ page }) => {
  let id: string | undefined;
  try {
    await page.goto('/create');
    expect((await page.request.get('/api/ai-mode').then(response => response.json())).data.mode).toBe('mock');
    await expect(page.getByText('演示模式：当前客户由本地规则模拟，并非真实 AI。')).toBeVisible();
    const created = await page.request.post('/api/sessions', { data: {
      product: `[QA-TEST] 画像隔离 ${randomUUID().slice(0, 8)}`,
      description: '测试会话接口', identity: '负责人', personality: '价格敏感型', difficulty: '中等', goal: '处理客户异议',
    } });
    expect(created.status()).toBe(201);
    const creation = await created.json();
    id = creation.data.id;
    const loaded = await page.request.get(`/api/sessions/${id}`);
    expect(loaded.status()).toBe(200);
    const body = await loaded.json();
    expect(body.data.session.aiMode).toBe('mock');
    for (const payload of [creation, body]) {
      const serialized = JSON.stringify(payload);
      expect(serialized).not.toContain('customerProfileJson');
      expect(serialized).not.toContain('hidden_customer_profile');
      expect(serialized).not.toContain('"concern"');
    }
  } finally {
    if (id) await page.request.delete(`/api/sessions/${id}`);
  }
});
