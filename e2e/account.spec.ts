import { test, expect } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import Database from 'better-sqlite3';

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
  expect((await page.request.post('/api/account/feedback', { data: { requestId: randomUUID(), category: 'problem', content: '未登录反馈应被拒绝' } })).status()).toBe(401);
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
  await page.getByRole('link', { name: '反馈与建议' }).first().click();
  await page.getByLabel('具体内容').fill('手机上创建训练后，我希望更清楚地看到等待状态。');
  await page.getByRole('button', { name: '提交反馈' }).click();
  await expect(page.getByRole('status')).toContainText('反馈已保存');
  const feedbackList = await page.request.get('/api/account/feedback');
  expect(feedbackList.status()).toBe(200);
  const feedback = (await feedbackList.json()).data.items;
  expect(feedback).toHaveLength(1);
  expect((await page.request.post('/api/account/feedback', { data: { requestId: feedback[0].id, category: 'problem', content: feedback[0].content } })).status()).toBe(200);
  expect((await (await page.request.get('/api/account/feedback')).json()).data.items).toHaveLength(1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.goto('/account');
  const exported = await page.request.get('/api/account/export');
  expect(exported.status()).toBe(200);
  expect((await exported.json()).sessions.map((item: { id: string }) => item.id)).toEqual([id]);
  expect((await exported.json()).feedback).toHaveLength(1);
  const firstExport = await exported.json();
  expect(JSON.stringify(firstExport)).not.toContain(password);
  const ownDatabase = new Database(process.env.SALES_COACH_E2E_DB!, { readonly: true });
  try {
    const saved = ownDatabase.prepare('SELECT hidden_customer_profile AS profile FROM training_sessions WHERE id=?').get(id) as { profile: string };
    expect(firstExport.sessions[0]).toMatchObject({ id, scenario_config: expect.any(String), hidden_customer_profile: saved.profile });
  } finally { ownDatabase.close(); }
  const second = await page.request.post('/api/sessions', { data: { ...scene, product: '第二个画像测试训练' } });
  expect(second.status()).toBe(201);
  const secondId = (await second.json()).data.id;
  const writable = new Database(process.env.SALES_COACH_E2E_DB!);
  try { writable.prepare("UPDATE training_sessions SET hidden_customer_profile='' WHERE id=?").run(secondId); }
  finally { writable.close(); }
  const emptyProfileExport = await (await page.request.get('/api/account/export')).json();
  expect(emptyProfileExport.sessions.map((item: { id: string }) => item.id).sort()).toEqual([id, secondId].sort());
  expect(emptyProfileExport.sessions.find((item: { id: string }) => item.id === secondId).hidden_customer_profile).toBeNull();
  expect((await page.request.delete(`/api/sessions/${secondId}`)).status()).toBe(200);
  expect(((await (await page.request.get('/api/account/export')).json()).sessions as { id: string }[]).map(item => item.id)).toEqual([id]);
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
    const otherExport = await (await fresh.request.get(origin + '/api/account/export')).json();
    expect(otherExport.sessions).toEqual([]);
    expect(otherExport).toHaveProperty('feedback');
    expect((await (await fresh.request.get(origin + '/api/account/feedback')).json()).data.items).toEqual([]);
    expect((await fresh.request.get(origin + '/api/account/feedback?scope=system')).status()).toBe(404);
  } finally { await fresh.close(); }

  expect((await page.request.post('/api/auth/sign-in/email', { headers: deletionDevice, data: { email, password } })).status()).toBe(200);
  expect((await page.request.post('/api/auth/delete-user', { headers: deletionDevice, data: { callbackURL: '/' } })).status()).toBe(200);
  await page.goto(await mailLink(email, '确认删除销售陪练账号'));
  expect((await page.request.get(`/api/sessions/${id}`)).status()).toBe(404);
  expect((await page.request.post('/api/auth/sign-in/email', { headers: deletionDevice, data: { email, password } })).status()).toBe(401);
  const sqlite = new Database(process.env.SALES_COACH_E2E_DB!, { readonly: true });
  try { expect(sqlite.prepare('SELECT id FROM product_feedback WHERE id = ?').get(feedback[0].id)).toBeUndefined(); }
  finally { sqlite.close(); }
});

test('mail failures are shown as retryable, non-sensitive account errors', async ({ page }) => {
  await page.goto('/account');
  await page.route('**/api/auth/request-password-reset', route => route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ code: 'SERVICE_UNAVAILABLE', message: 'internal-mail-error' }) }));
  await page.getByRole('button', { name: '忘记密码' }).click();
  await page.getByLabel('邮箱').fill('missing@example.invalid');
  await page.getByRole('button', { name: '发送密码重置链接' }).click();
  await expect(page.getByRole('status')).toContainText('暂时无法发送重置邮件');
  await expect(page.getByRole('status')).not.toContainText('internal-mail-error');
  await page.route('**/api/auth/send-verification-email', route => route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ code: 'SERVICE_UNAVAILABLE', message: 'internal-mail-error' }) }));
  await page.getByRole('button', { name: '重发验证邮件' }).click();
  await page.getByLabel('邮箱').fill('missing@example.invalid');
  await page.getByRole('button', { name: '发送新验证链接' }).click();
  await expect(page.getByRole('status')).toContainText('暂时无法发送验证邮件');
  await expect(page.getByRole('status')).not.toContainText('internal-mail-error');
});
