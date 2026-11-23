import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';

test('the start dialog lists available models and passes the selected model to creation', async ({ page }) => {
  await page.route('**/api/ai-mode', route => route.fulfill({ json: { success: true, data: { mode: 'real', models: ['fixture-fast', 'fixture-quality'] } } }));
  await page.goto('/');
  await page.getByRole('button', { name: /开始训练/ }).click();
  const dialog = page.getByRole('dialog', { name: '选择训练模式' });
  await dialog.getByRole('radio', { name: /真实 AI/ }).check();
  await dialog.getByLabel('AI 模型').selectOption('fixture-quality');
  await dialog.getByRole('button', { name: '继续选择场景' }).click();
  await expect(page.getByLabel('AI 模型')).toHaveValue('fixture-quality');
  await page.getByRole('button', { name: '价格异议' }).click();
  const created = page.waitForResponse(response => response.url().endsWith('/api/sessions') && response.request().method() === 'POST');
  await page.getByRole('button', { name: /开始文字训练/ }).click();
  const response = await created;
  expect(response.request().postDataJSON()).toMatchObject({ mode: 'real', model: 'fixture-quality' });
  expect(response.status()).toBe(503); // The Mock server must reject a model a browser claims is available.
  await expect(page.getByRole('alert').filter({ hasText: '所选模型当前不可用' })).toBeVisible();
});

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
