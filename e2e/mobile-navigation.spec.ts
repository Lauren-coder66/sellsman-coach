import { expect, test } from '@playwright/test';

test('first-time mobile user can find the account, template and feedback paths without horizontal overflow', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: '第一次训练，按这三步开始' })).toBeVisible();
  for (const route of ['/', '/account', '/create', '/history', '/feedback']) {
    await page.goto(route);
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  }
  await page.goto('/create');
  await expect(page.getByRole('heading', { name: '系统模板' })).toBeVisible();
  await page.getByRole('button', { name: '企业网站开发' }).click();
  await expect(page.getByLabel('产品或服务名称')).toHaveValue('企业网站开发服务');
});
