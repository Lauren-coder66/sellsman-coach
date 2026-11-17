import { randomUUID } from 'node:crypto';
import { test, expect } from '@playwright/test';

test('mock training workflow', async ({ page }) => {
  const product = `[QA-TEST] 业务咨询服务 ${randomUUID()}`;
  let sessionId: string | undefined;
  try {
    await page.goto('/');
    await expect(page.getByRole('link', { name: /开始训练/ })).toBeVisible();
    await page.getByRole('link', { name: /开始训练/ }).click();
    await page.getByRole('button', { name: '价格异议' }).click();
    await expect(page.getByLabel('产品或服务名称')).toHaveValue('业务咨询服务');
    await page.getByLabel('产品或服务名称').fill(product);
    await page.getByRole('button', { name: /开始模拟训练/ }).click();
    await page.waitForURL('**/train/**');
    sessionId = new URL(page.url()).pathname.split('/').at(-1);
    expect(sessionId).toBeTruthy();
    await expect(page.getByText(/先说一下大概费用吧/)).toBeVisible();
    await page.getByPlaceholder(/输入回应/).fill('价格是多少？');
    await page.getByRole('button', { name: '发送' }).click();
    await expect(page.getByText(/超出我的预算/)).toBeVisible();
    await page.reload();
    await expect(page.getByText('价格是多少？')).toBeVisible();
    page.once('dialog', dialog => dialog.accept());
    await page.getByRole('button', { name: '结束训练' }).click();
    await page.waitForURL('**/report/**');
    await expect(page.getByText(/演示报告：评分由本地规则生成/)).toBeVisible();
    await page.getByRole('link', { name: '再次练习' }).click();
    await expect(page.getByLabel('产品或服务名称')).toHaveValue(product);
    await page.goto('/history');
    const record = page.locator('article').filter({ hasText: product });
    await expect(record).toBeVisible();
    page.once('dialog', dialog => dialog.accept());
    await record.getByRole('button', { name: '删除' }).click();
    await expect(record).toHaveCount(0);
  } finally {
    if (sessionId) await page.request.delete(`/api/sessions/${sessionId}`);
  }
});
