import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';

const scenario = {
  product: `[QA-TEST] 成长统计 ${randomUUID().slice(0, 8)}`,
  description: '测试成长统计的服务。',
  identity: '企业负责人',
  personality: '普通型',
  difficulty: '中等',
  goal: '了解客户需求',
} as const;

test('progress follows real sessions and isolates anonymous owners', async ({ page, browser }) => {
  test.setTimeout(60_000);
  const outsider = await browser.newContext();
  let sourceId: string | undefined;
  let focusedId: string | undefined;
  let outsiderId: string | undefined;
  try {
    await page.goto('/progress');
    await expect(page.getByRole('heading', { name: '我的成长' })).toBeVisible();
    const empty = (await page.request.get('/api/progress').then(response => response.json())).data;
    expect(empty.summary).toMatchObject({ total: 0, completed: 0, last7: 0, last30: 0, activeDays: 0, userTurns: 0, normalCount: 0, focusedCount: 0 });
    expect(empty.trend).toHaveLength(30);
    expect(empty.trend.every((day: { count: number }) => day.count === 0)).toBe(true);
    expect((await page.request.get('/api/progress?days=8')).status()).toBe(422);

    const created = await page.request.post('/api/sessions', { data: scenario });
    expect(created.status()).toBe(201);
    sourceId = (await created.json()).data.id;
    const afterCreate = (await page.request.get('/api/progress').then(response => response.json())).data;
    expect(afterCreate.summary).toMatchObject({ total: 1, completed: 0, last7: 1, normalCount: 1, focusedCount: 0 });
    expect(Object.values(afterCreate.focusCounts).every(count => count === 0)).toBe(true);
    await page.reload();
    await expect(page.getByText(scenario.product)).toBeVisible();

    expect((await page.request.post(`/api/sessions/${sourceId}/messages`, { data: { content: '我想了解您的需求', requestId: randomUUID() } })).status()).toBe(200);
    expect((await page.request.post(`/api/sessions/${sourceId}/finish`)).status()).toBe(200);
    const afterFinish = (await page.request.get('/api/progress').then(response => response.json())).data;
    expect(afterFinish.summary).toMatchObject({ total: 1, completed: 1, userTurns: 1 });
    await page.reload();
    await expect(page.getByRole('link', { name: '从报告选择专项训练' })).toHaveAttribute('href', `/report/${sourceId}`);

    const focused = await page.request.post('/api/sessions', { data: { ...scenario, sourceSessionId: sourceId, focusDimension: 'objection_handling' } });
    expect(focused.status()).toBe(201);
    focusedId = (await focused.json()).data.id;
    const withFocus = (await page.request.get('/api/progress').then(response => response.json())).data;
    expect(withFocus.summary).toMatchObject({ total: 2, completed: 1, last7: 2, userTurns: 1, normalCount: 1, focusedCount: 1 });
    expect(withFocus.focusCounts).toEqual({ need_discovery: 0, value_expression: 0, objection_handling: 1, next_step: 0 });

    const other = await outsider.request.post('/api/sessions', { data: scenario });
    expect(other.status()).toBe(201);
    outsiderId = (await other.json()).data.id;
    expect((await outsider.request.get('/api/progress').then(response => response.json())).data.summary).toMatchObject({ total: 1, completed: 0, focusedCount: 0 });
    expect((await page.request.get('/api/progress').then(response => response.json())).data.summary.total).toBe(2);
    expect((await outsider.request.get(`/api/sessions/${sourceId}`)).status()).toBe(404);

    for (const days of [7, 30, 90] as const) {
      const response = await page.request.get(`/api/progress?days=${days}`);
      expect(response.status()).toBe(200);
      const body = (await response.json()).data;
      expect(body.trend).toHaveLength(days);
      expect(body.trend.at(-1).count).toBe(2);
      await page.getByRole('button', { name: `最近${days}天` }).click();
      await expect(page.getByRole('img', { name: `最近${days}天每日训练次数` })).toBeVisible();
    }

    expect((await page.request.delete(`/api/sessions/${focusedId}`)).status()).toBe(200);
    focusedId = undefined;
    expect((await page.request.get('/api/progress').then(response => response.json())).data.summary).toMatchObject({ total: 1, focusedCount: 0 });
    expect((await page.request.delete(`/api/sessions/${sourceId}`)).status()).toBe(200);
    sourceId = undefined;
    await page.reload();
    await expect(page.getByText('暂无训练记录。创建一条训练后，数据会显示在这里。')).toBeVisible();
    expect((await page.request.get('/api/progress').then(response => response.json())).data.summary).toMatchObject({ total: 0, completed: 0, userTurns: 0 });
  } finally {
    if (focusedId) await page.request.delete(`/api/sessions/${focusedId}`);
    if (sourceId) await page.request.delete(`/api/sessions/${sourceId}`);
    if (outsiderId) await outsider.request.delete(`/api/sessions/${outsiderId}`);
    await outsider.close();
  }
});
