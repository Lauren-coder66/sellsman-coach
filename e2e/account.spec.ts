import { test, expect } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

test('mobile signup, verified login, anonymous migration and cross-device history', async ({ page, browser }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const origin = 'http://localhost:3101';
  const otherDevice = { origin, 'x-forwarded-for': '192.0.2.10' };
  const deletionDevice = { origin, 'x-forwarded-for': '192.0.2.11' };
  const email = `${randomUUID()}@example.com`;
  const password = 'Example-Test-Password-17';
  const directory = process.env.SALES_COACH_E2E_MAIL!;
  async function mailLink(to: string, subject: string) {
    let url: string | undefined;
    await expect.poll(async () => {
      for (const file of await readdir(directory)) {
        const message = JSON.parse(await readFile(path.join(directory, file), 'utf8'));
        if (message.to === to && message.subject === subject) url = message.url;
      }
      return Boolean(url);
    }).toBe(true);
    return url!;
  }
  const scene = { product: '咖啡设备维护', description: '检测和维护服务', identity: '咖啡店主', difficulty: '简单', personality: '普通型', goal: '了解客户需求' };
  const created = await page.request.post('/api/sessions', { data: scene });
  expect(created.status()).toBe(201);
  const id = (await created.json()).data.id;
  const anonymous = (await page.context().cookies()).find(cookie => cookie.name === 'sales_coach_owner')!;
  await page.goto('/account');
  await page.getByRole('button', { name: '注册账号' }).click();
  await page.getByLabel('显示姓名').fill('测试销售');
  await page.getByLabel('邮箱').fill(email);
  await page.getByLabel('密码', { exact: true }).fill(password);
  await page.getByRole('button', { name: '发送验证并注册' }).click();
  await expect(page.getByRole('status')).toContainText('查收验证邮件');
  const blocked = await page.request.post('/api/auth/sign-in/email', { headers: { origin }, data: { email, password } });
  expect(blocked.status()).toBe(403);
  await page.goto(await mailLink(email, '验证销售陪练邮箱'));
  await page.getByLabel('邮箱').fill(email);
  await page.getByLabel('密码', { exact: true }).fill(password);
  await page.getByRole('button', { name: '登录', exact: true }).click();
  await expect(page.getByText(email, { exact: false })).toBeVisible();
  expect((await page.request.get(`/api/sessions/${id}`)).status()).toBe(404);
  expect((await page.request.post('/api/account/claim', { headers: { origin: 'https://example.com' } })).status()).toBe(403);
  await page.getByRole('button', { name: '迁入本浏览器的匿名记录' }).click();
  await expect(page.getByRole('status')).toContainText('已迁入 1 条训练');
  expect((await page.request.get(`/api/sessions/${id}`)).status()).toBe(200);
  expect((await (await page.request.get(`/api/sessions/${id}/voice`)).json()).data.enabled).toBe(false);
  const exported = await page.request.get('/api/account/export');
  expect(exported.status()).toBe(200);
  expect((await exported.json()).sessions.map((item: { id: string }) => item.id)).toEqual([id]);
  await page.getByRole('button', { name: '退出登录' }).click();
  await expect(page.getByRole('button', { name: '登录', exact: true })).toBeVisible();
  const fresh = await browser.newContext();
  try {
    await fresh.addCookies([anonymous]);
    expect((await fresh.request.get(origin + `/api/sessions/${id}`)).status()).toBe(404);
    const login = await fresh.request.post(origin + '/api/auth/sign-in/email', { headers: { origin }, data: { email, password } });
    expect(login.status()).toBe(200);
    expect((await fresh.request.get(origin + `/api/sessions/${id}`)).status()).toBe(200);
    expect((await fresh.request.get(origin + '/api/account/usage?scope=system')).status()).toBe(404);
    await fresh.request.post(origin + '/api/auth/sign-out', { headers: { origin } });
    const otherEmail = `${randomUUID()}@example.com`;
    expect((await fresh.request.post(origin + '/api/auth/sign-up/email', { headers: otherDevice, data: { email: otherEmail, password, name: '其他销售', callbackURL: '/account' } })).status()).toBe(200);
    expect((await fresh.request.get(await mailLink(otherEmail, '验证销售陪练邮箱'))).status()).toBe(200);
    expect((await fresh.request.post(origin + '/api/auth/sign-in/email', { headers: otherDevice, data: { email: otherEmail, password } })).status()).toBe(200);
    expect((await fresh.request.get(origin + `/api/sessions/${id}`)).status()).toBe(404);
    expect((await (await fresh.request.get(origin + '/api/account/export')).json()).sessions).toEqual([]);
  } finally { await fresh.close(); }

  expect((await page.request.post('/api/auth/sign-in/email', { headers: deletionDevice, data: { email, password } })).status()).toBe(200);
  expect((await page.request.post('/api/auth/delete-user', { headers: deletionDevice, data: { callbackURL: '/' } })).status()).toBe(200);
  await page.goto(await mailLink(email, '确认删除销售陪练账号'));
  expect((await page.request.get(`/api/sessions/${id}`)).status()).toBe(404);
  expect((await page.request.post('/api/auth/sign-in/email', { headers: deletionDevice, data: { email, password } })).status()).toBe(401);
});
