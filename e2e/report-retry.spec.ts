import { randomUUID } from 'node:crypto';
import { test, expect } from '@playwright/test';

test('failed report exposes retry and retains the request error', async ({ page }) => {
  let id: string | undefined;
  try {
    await page.goto('/');
    const response = await page.request.post('/api/sessions', {
      data: {
        product: `[QA-TEST] 报告重试 ${randomUUID().slice(0, 8)}`,
        description: '用于验证报告重试入口。',
        identity: '企业负责人',
        personality: '普通型',
        difficulty: '简单',
        goal: '了解客户需求',
      },
    });
    expect(response.status()).toBe(201);
    id = (await response.json()).data.id;
    const sessionResponse = await page.request.get(`/api/sessions/${id}`);
    const sessionBody = await sessionResponse.json();
    sessionBody.data.session.status = 'failed';
    await page.route(`**/api/sessions/${id}`, async route => {
      if (route.request().method() !== 'GET') return route.continue();
      await route.fulfill({ status: 200, json: sessionBody });
    });
    let retries = 0;
    await page.route(`**/api/sessions/${id}/finish`, async route => {
      retries++;
      await route.fulfill({ status: 502, json: { success: false, error: { code: 'REPORT_ERROR', message: '测试报告生成失败' } } });
    });
    await page.goto(`/train/${id}`);
    const retry = page.getByRole('button', { name: '重试生成报告' });
    await expect(retry).toBeEnabled();
    await retry.click();
    await expect(page.getByText('测试报告生成失败')).toBeVisible();
    await expect(retry).toBeEnabled();
    await retry.click();
    await expect.poll(() => retries).toBe(2);
  } finally {
    if (id) await page.request.delete(`/api/sessions/${id}`);
  }
});
