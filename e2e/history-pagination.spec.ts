import { randomUUID } from 'node:crypto';
import { test, expect } from '@playwright/test';

test('history loads all pages without duplicate sessions', async ({ page }, testInfo) => {
  const ids: string[] = [];
  const prefix = `[QA-TEST] 分页 ${randomUUID().slice(0, 8)}`;
  try {
    await page.goto('/history');
    for (let index = 0; index < 21; index++) {
      const correlationId = randomUUID();
      const response = await page.request.post('/api/sessions', {
        headers: { 'x-sales-coach-e2e-correlation-id': correlationId },
        data: {
          product: `${prefix} ${index}`,
          description: '用于验证历史记录分页。',
          identity: '企业负责人',
          personality: '普通型',
          difficulty: '简单',
          goal: '了解客户需求',
        },
      });
      const errorCode = response.status() === 201 ? undefined : (await response.json().catch(() => null))?.error?.code;
      expect(response.status(), `create index=${index}, worker=${testInfo.workerIndex}, repeat=${testInfo.repeatEachIndex}, correlationId=${correlationId}, status=${response.status()}, errorCode=${typeof errorCode === 'string' ? errorCode : 'unknown'}`).toBe(201);
      ids.push((await response.json()).data.id);
    }

    const first = await page.request.get('/api/sessions?limit=20');
    expect(first.ok()).toBeTruthy();
    const firstPage = (await first.json()).data;
    expect(firstPage.items).toHaveLength(20);
    expect(firstPage.nextCursor).toBeTruthy();
    const second = await page.request.get(`/api/sessions?limit=20&cursor=${encodeURIComponent(firstPage.nextCursor)}`);
    const secondPage = (await second.json()).data;
    expect(secondPage.items).toHaveLength(1);
    expect(secondPage.nextCursor).toBeNull();
    expect(new Set([...firstPage.items, ...secondPage.items].map(item => item.id)).size).toBe(21);

    await page.reload();
    await expect(page.getByRole('button', { name: '加载更多' })).toBeVisible();
    await page.getByRole('button', { name: '加载更多' }).click();
    await expect(page.locator('article')).toHaveCount(21);
    for (const id of ids) await expect(page.locator(`article:has(a[href="/train/${id}"])`)).toHaveCount(1);
  } finally {
    for (const id of ids) await page.request.delete(`/api/sessions/${id}`);
  }
});
