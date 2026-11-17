import { randomUUID } from 'node:crypto';
import { test, expect } from '@playwright/test';

test('personal scenarios persist, stay private, and never rewrite training snapshots', async ({ page, browser }) => {
  const name = `[QA-TEST] 自定义场景 ${randomUUID().slice(0, 8)}`;
  const outsider = await browser.newContext();
  let scenarioId: string | undefined;
  let sessionId: string | undefined;
  try {
    await page.goto('/create');
    await expect(page.getByText('系统模板')).toBeVisible();
    await expect(page.getByRole('button', { name: '企业网站开发' })).toBeVisible();
    await page.getByRole('button', { name: '企业网站开发' }).click();
    await page.getByLabel('场景名称（保存个人场景时必填）').fill(name);
    await page.getByRole('button', { name: '保存为个人场景' }).click();
    await expect(page.getByText('已保存到我的场景')).toBeVisible();

    const listed = await page.request.get('/api/scenarios');
    expect(listed.status()).toBe(200);
    const item = (await listed.json()).data.items.find((entry: { name: string }) => entry.name === name);
    expect(item).toBeTruthy();
    scenarioId = item.id;
    expect((await outsider.request.get(`/api/scenarios/${scenarioId}`)).status()).toBe(404);
    expect((await outsider.request.put(`/api/scenarios/${scenarioId}`, { data: { name, ...item.scenario } })).status()).toBe(404);
    expect((await outsider.request.delete(`/api/scenarios/${scenarioId}`)).status()).toBe(404);
    expect((await outsider.request.get('/api/scenarios')).status()).toBe(200);
    expect((await outsider.request.get('/api/scenarios').then(response => response.json())).data.items).toHaveLength(0);

    await page.goto('/scenarios');
    let record = page.locator('article').filter({ hasText: name });
    await expect(record).toBeVisible();
    await record.getByRole('button', { name: '编辑' }).click();
    await page.getByLabel('产品或服务名称').fill('编辑后的产品');
    await page.getByRole('button', { name: '保存修改' }).click();
    await expect(page.getByText('场景已保存')).toBeVisible();
    await page.reload();
    record = page.locator('article').filter({ hasText: name });
    await expect(record).toContainText('编辑后的产品');
    expect((await page.request.get(`/api/scenarios/${scenarioId}`).then(response => response.json())).data.scenario.product).toBe('编辑后的产品');

    await record.getByRole('link', { name: '使用场景开始训练' }).click();
    await page.waitForURL(`**/create?scenario=${scenarioId}`);
    await expect(page.getByRole('heading', { name: '创建训练场景' })).toBeVisible();
    const productField = page.getByRole('textbox', { name: '产品或服务名称' }).last();
    await expect(productField).toHaveValue('编辑后的产品');
    await productField.fill('训练时临时修改的产品');
    await page.getByRole('button', { name: /开始模拟训练/ }).click();
    await page.waitForURL('**/train/**');
    sessionId = new URL(page.url()).pathname.split('/').at(-1);
    expect(sessionId).toBeTruthy();
    const snapshot = (await page.request.get(`/api/sessions/${sessionId}`).then(response => response.json())).data.session.scenario;
    expect(snapshot.product).toBe('训练时临时修改的产品');

    await page.goto('/scenarios');
    record = page.locator('article').filter({ hasText: name });
    await record.getByRole('button', { name: '编辑' }).click();
    await page.getByLabel('产品或服务名称').fill('再次编辑的产品');
    await page.getByRole('button', { name: '保存修改' }).click();
    expect((await page.request.get(`/api/sessions/${sessionId}`).then(response => response.json())).data.session.scenario).toEqual(snapshot);
    page.once('dialog', dialog => dialog.accept());
    await record.getByRole('button', { name: '删除' }).click();
    await expect(record).toHaveCount(0);
    expect((await page.request.get(`/api/scenarios/${scenarioId}`)).status()).toBe(404);
    expect((await page.request.get(`/api/sessions/${sessionId}`).then(response => response.json())).data.session.scenario).toEqual(snapshot);
    expect((await page.request.post(`/api/sessions/${sessionId}/finish`)).status()).toBe(200);
    expect((await page.request.get(`/api/sessions/${sessionId}/report`)).status()).toBe(200);
    expect((await page.request.put('/api/scenarios/system-template', { data: { name, ...snapshot } })).status()).toBe(404);
    expect((await page.request.delete('/api/scenarios/system-template')).status()).toBe(404);
  } finally {
    if (sessionId) await page.request.delete(`/api/sessions/${sessionId}`);
    if (scenarioId) await page.request.delete(`/api/scenarios/${scenarioId}`);
    await outsider.close();
  }
});
