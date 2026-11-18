import { randomUUID } from 'node:crypto';
import { test, expect, devices } from '@playwright/test';

test.use({ ...devices['iPhone 13'], defaultBrowserType: 'chromium' });

test('Chinese composition and network recovery preserve a single mobile training turn', async ({ page }) => {
  const product = '移动端训练'.repeat(13);
  const created = await page.request.post('/api/sessions', { data: {
    product, description: '用于测试移动端文字训练。', identity: '企业负责人',
    personality: '普通型', difficulty: '简单', goal: '了解客户需求',
  } });
  expect(created.status()).toBe(201);
  const { id } = (await created.json()).data;
  const requests: string[] = [];
  await page.route(`**/api/sessions/${id}/messages`, async route => {
    requests.push(route.request().postDataJSON().requestId);
    if (requests.length === 1) {
      await route.fulfill({ status: 504, contentType: 'text/html', body: '<p>Gateway timeout</p>' });
    } else if (requests.length === 3) {
      expect((await route.fetch()).ok()).toBeTruthy();
      await route.fulfill({ status: 504, contentType: 'text/html', body: '<p>Response lost after save</p>' });
    } else {
      await route.continue();
    }
  });

  await page.goto(`/train/${id}`);
  const draft = '您目前最希望改善什么？';
  const composer = page.getByPlaceholder(/输入回应/);
  await expect(composer).toBeEnabled();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await composer.fill(draft);
  await composer.dispatchEvent('keydown', { key: 'Enter', isComposing: true, keyCode: 229 });
  await expect(composer).toHaveValue(draft);
  await composer.press('Shift+Enter');
  await expect(composer).toHaveValue(draft + '\n');
  await composer.press('Enter');
  await expect(page.getByRole('main').getByRole('alert')).toContainText('请求超时，请稍后重试');
  await expect(composer).toHaveAccessibleName('输入回应');
  await expect(composer).toHaveValue(draft + '\n');
  await page.getByRole('button', { name: '发送', exact: true }).click();
  await expect(page.getByText('1/30 轮')).toBeVisible();
  expect(requests).toHaveLength(2);
  expect(new Set(requests).size).toBe(1);

  const repeatedDraft = '好的，我明白了。';
  await composer.fill(repeatedDraft);
  await page.getByRole('button', { name: '发送', exact: true }).click();
  await expect(page.getByText('2/30 轮')).toBeVisible();
  await expect(page.getByRole('main').getByRole('alert')).toHaveCount(0);
  await composer.fill(repeatedDraft);
  await page.getByRole('button', { name: '发送', exact: true }).click();
  await expect(page.getByText('3/30 轮')).toBeVisible();
  expect(requests[3]).not.toBe(requests[2]);
  await page.reload();
  await expect(page.getByText(draft, { exact: true })).toHaveCount(1);
  await expect(page.getByText(repeatedDraft, { exact: true })).toHaveCount(2);
});

test('mobile report lists tied dimensions and opens the full original evidence', async ({ page }) => {
  const created = await page.request.post('/api/sessions', { data: {
    product: '移动端报告', description: '用于测试报告解释。', identity: '企业负责人',
    personality: '普通型', difficulty: '简单', goal: '了解客户需求',
  } });
  expect(created.status()).toBe(201);
  const { id } = (await created.json()).data;
  const original = '我们提供网站设计。'.repeat(10) + '此句为引用长度之外的原话。';
  for (const content of [original, '也提供网站维护。', '可以约下次沟通。']) {
    expect((await page.request.post(`/api/sessions/${id}/messages`, {
      data: { content, requestId: randomUUID() },
    })).ok()).toBeTruthy();
  }
  expect((await page.request.post(`/api/sessions/${id}/finish`)).ok()).toBeTruthy();
  await page.goto(`/report/${id}`);
  await expect(page.getByText('需求挖掘、价值表达、异议处理并列本次最低分', { exact: false })).toBeVisible();
  await expect(page.getByText('Mock 演示最低分', { exact: true })).toHaveCount(3);
  await expect(page.locator('blockquote')).toHaveText(`「${original.slice(0, 80)}」`);
  await page.getByText('查看引用的完整发言', { exact: true }).click();
  await expect(page.getByText(original, { exact: true })).toBeVisible();
});
