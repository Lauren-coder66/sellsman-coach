import { randomUUID } from 'node:crypto';
import { test, expect } from '@playwright/test';

const scenario = {
  product: `[QA-TEST] 专项训练 ${randomUUID().slice(0, 8)}`,
  description: '给中小企业提供网站建设和维护服务。',
  identity: '中小企业负责人',
  personality: '普通型',
  difficulty: '中等',
  goal: '了解客户需求',
} as const;
const dimensions = ['need_discovery', 'value_expression', 'objection_handling', 'next_step'] as const;
const labels = ['需求挖掘', '价值表达', '异议处理', '推进下一步'] as const;

test('report leads to focused practice without changing the source training', async ({ page, browser }) => {
  const outsider = await browser.newContext();
  let sourceId: string | undefined;
  let childId: string | undefined;
  let outsiderId: string | undefined;
  try {
    await page.goto('/');
    const sourceCreated = await page.request.post('/api/sessions', { data: scenario });
    expect(sourceCreated.status()).toBe(201);
    sourceId = (await sourceCreated.json()).data.id;
    const outsiderCreated = await outsider.request.post('/api/sessions', { data: scenario });
    expect(outsiderCreated.status()).toBe(201);
    outsiderId = (await outsiderCreated.json()).data.id;
    expect((await page.request.post('/api/sessions', { data: { ...scenario, sourceSessionId: outsiderId, focusDimension: 'objection_handling' } })).status()).toBe(404);
    expect((await page.request.post('/api/sessions', { data: { ...scenario, focusDimension: 'objection_handling' } })).status()).toBe(422);

    const userId = randomUUID();
    expect((await page.request.post(`/api/sessions/${sourceId}/messages`, { data: { content: '我想了解您的需求', requestId: userId } })).status()).toBe(200);
    expect((await page.request.post(`/api/sessions/${sourceId}/finish`)).status()).toBe(200);
    const sourceReport = (await page.request.get(`/api/sessions/${sourceId}/report`).then(response => response.json())).data;
    expect(sourceReport.scores).toBeNull();
    const sourceBefore = (await page.request.get(`/api/sessions/${sourceId}`).then(response => response.json())).data;
    expect(sourceBefore.session.focus).toBeNull();

    for (let index = 0; index < dimensions.length; index++) {
      await page.goto(`/report/${sourceId}`);
      await expect(page.getByText('本次没有正式评分，请自行选择练习重点。')).toBeVisible();
      await page.locator(`a[href="/create?from=${sourceId}&focus=${dimensions[index]}"]`).click();
      await page.waitForURL(`**/create?from=${sourceId}&focus=${dimensions[index]}`);
      await expect(page.getByText(`本次专项训练重点：${labels[index]}`)).toBeVisible();
    }

    await page.goto(`/report/${sourceId}`);
    await page.locator(`a[href="/create?from=${sourceId}&focus=objection_handling"]`).click();
    const product = page.getByRole('textbox', { name: '产品或服务名称' }).last();
    await expect(product).toHaveValue(scenario.product);
    await product.fill('[QA-TEST] 训练时调整的产品');
    await page.getByLabel('客户性格').selectOption('价格敏感型');
    await page.getByLabel('训练难度').selectOption('困难');
    await page.getByRole('button', { name: /开始模拟训练/ }).click();
    await page.waitForURL('**/train/**');
    childId = new URL(page.url()).pathname.split('/').at(-1);
    expect(childId).toBeTruthy();
    await expect(page.getByText(/本次训练重点：异议处理/)).toBeVisible();
    const child = (await page.request.get(`/api/sessions/${childId}`).then(response => response.json())).data;
    expect(child.session.focus).toMatchObject({ dimension: 'objection_handling', sourceSessionId: sourceId, sourceAvailable: true });
    expect(child.session.scenario).toMatchObject({ product: '[QA-TEST] 训练时调整的产品', personality: '价格敏感型', difficulty: '困难', description: scenario.description, identity: scenario.identity });
    expect(child.messages).toHaveLength(1);
    expect((await outsider.request.get(`/api/sessions/${childId}`)).status()).toBe(404);
    expect((await page.request.get(`/api/sessions/${sourceId}/report`).then(response => response.json())).data).toEqual(sourceReport);
    expect((await page.request.get(`/api/sessions/${sourceId}`).then(response => response.json())).data).toEqual(sourceBefore);

    for (let index = 0; index < 3; index++) {
      expect((await page.request.post(`/api/sessions/${childId}/messages`, { data: { content: `第${index + 1}轮：请说说您的问题和预算`, requestId: randomUUID() } })).status()).toBe(200);
    }
    await page.reload();
    await expect(page.getByText('第3轮：请说说您的问题和预算')).toBeVisible();
    page.once('dialog', dialog => dialog.accept());
    await page.getByRole('button', { name: '结束训练' }).click();
    await page.waitForURL(`**/report/${childId}`);
    await expect(page.getByRole('heading', { name: '训练复盘' })).toBeVisible();
    await expect(page.locator('main:visible').getByText('本次训练重点：异议处理')).toBeVisible();
    await expect(page.getByRole('link', { name: '返回来源训练' })).toHaveAttribute('href', `/train/${sourceId}`);
    await expect(page.getByRole('link', { name: '再次进行同类专项练习' })).toHaveAttribute('href', `/create?from=${childId}&focus=objection_handling`);
    await expect(page.getByText('Mock 演示最低分')).toBeVisible();
    await page.goto('/history');
    await expect(page.locator('article').filter({ hasText: '[QA-TEST] 训练时调整的产品' })).toContainText('专项训练：异议处理');

    expect((await page.request.delete(`/api/sessions/${sourceId}`)).status()).toBe(200);
    expect((await page.request.get(`/api/sessions/${childId}`).then(response => response.json())).data.session.focus.sourceAvailable).toBe(false);
    expect((await page.request.get(`/api/sessions/${childId}/report`)).status()).toBe(200);
    await page.goto(`/report/${childId}`);
    await expect(page.getByRole('link', { name: '再次进行同类专项练习' })).toBeVisible();
    await expect(page.getByRole('link', { name: '返回来源训练' })).toHaveCount(0);
  } finally {
    if (childId) await page.request.delete(`/api/sessions/${childId}`);
    if (sourceId) await page.request.delete(`/api/sessions/${sourceId}`);
    if (outsiderId) await outsider.request.delete(`/api/sessions/${outsiderId}`);
    await outsider.close();
  }
});
