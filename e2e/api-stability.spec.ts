import { randomUUID } from 'node:crypto';
import { test, expect } from '@playwright/test';
import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';

type Message = { id: string; role: 'user' | 'customer'; sequence: number };

function sqliteSnapshot(file: string, sqlite: Database.Database) {
  const realpath = fs.realpathSync(file);
  const stat = fs.statSync(file);
  const snapshot = {
    databaseUrl: path.resolve(file), realpath, dev: stat.dev, ino: stat.ino,
    databaseList: sqlite.pragma('database_list'),
    journalMode: sqlite.pragma('journal_mode', { simple: true }),
    walExists: fs.existsSync(`${file}-wal`),
    walSize: fs.existsSync(`${file}-wal`) ? fs.statSync(`${file}-wal`).size : 0,
  };
  return snapshot;
}

test('real API keeps concurrent sends and finishes idempotent and isolated', async ({ page, browser }) => {
  let id: string | undefined;
  const outsider = await browser.newContext();
  try {
    await page.goto('/');
    const created = await page.request.post('/api/sessions', {
      data: { product: `[QA-TEST] API并发 ${randomUUID().slice(0, 8)}`, description: '并发接口测试', identity: '负责人', personality: '普通型', difficulty: '简单', goal: '了解客户需求' },
    });
    expect(created.status()).toBe(201);
    id = (await created.json()).data.id;
    expect((await outsider.request.get(`/api/sessions/${id}`)).status()).toBe(404);
    expect((await outsider.request.post(`/api/sessions/${id}/messages`, { data: { content: '越权发送', requestId: randomUUID() } })).status()).toBe(404);
    expect((await outsider.request.post(`/api/sessions/${id}/finish`)).status()).toBe(404);
    expect((await outsider.request.get(`/api/sessions/${id}/report`)).status()).toBe(404);

    const requestId = randomUUID();
    const sends = await Promise.all(Array.from({ length: 8 }, () => page.request.post(`/api/sessions/${id}/messages`, { data: { content: '我想了解您的需求', requestId } })));
    expect(sends.some(response => response.status() === 200)).toBe(true);
    expect(sends.every(response => [200, 409].includes(response.status()))).toBe(true);
    const detail = await page.request.get(`/api/sessions/${id}`);
    const saved = (await detail.json()).data.messages as Message[];
    expect(saved.filter(message => message.id === requestId)).toHaveLength(1);
    expect(saved.filter(message => message.role === 'customer')).toHaveLength(2);
    expect(saved.map(message => message.sequence)).toEqual([0, 1, 2]);

    const finishes = await Promise.all(Array.from({ length: 8 }, () => page.request.post(`/api/sessions/${id}/finish`)));
    expect(finishes.some(response => response.status() === 200)).toBe(true);
    expect(finishes.every(response => [200, 409].includes(response.status()))).toBe(true);
    expect((await page.request.get(`/api/sessions/${id}/report`)).status()).toBe(200);
    expect((await page.request.post(`/api/sessions/${id}/messages`, { data: { content: '结束后发送', requestId: randomUUID() } })).status()).toBe(409);
  } finally {
    if (id) await page.request.delete(`/api/sessions/${id}`);
    await outsider.close();
  }
});

test('real API recovers a persisted pending reply and a failed report', async ({ page }) => {
  const file = process.env.SALES_COACH_E2E_DB;
  if (!file) throw new Error('隔离测试数据库未配置');
  let id: string | undefined;
  let sqlite: Database.Database | undefined;
  try {
    await page.goto('/');
    const created = await page.request.post('/api/sessions', {
      data: { product: `[QA-TEST] API恢复 ${randomUUID().slice(0, 8)}`, description: '失败恢复测试', identity: '负责人', personality: '普通型', difficulty: '简单', goal: '了解客户需求' },
    });
    expect(created.status()).toBe(201);
    id = (await created.json()).data.id;
    sqlite = new Database(file);
    sqlite.pragma('busy_timeout = 30000');
    const requestId = randomUUID();
    sqlite.prepare('INSERT INTO messages (id, session_id, role, content, sequence, created_at) VALUES (?, ?, ?, ?, ?, ?)').run(requestId, id, 'user', '已经保存的发言', 1, Date.now());
    await page.goto(`/train/${id}`);
    const retryButton = page.getByRole('button', { name: '重试客户回复' });
    await expect(retryButton).toBeVisible();
    const [retry] = await Promise.all([
      page.waitForResponse(response => response.url().endsWith(`/api/sessions/${id}/messages`) && response.request().method() === 'POST'),
      retryButton.click(),
    ]);
    const retryJson = await retry.json();
    console.log(JSON.stringify({ diagnostic: 'retry-response', status: retry.status(), requestId, response: retryJson }));
    expect(retry.status()).toBe(200);
    await expect(retryButton).toHaveCount(0);
    const detailAfterRetry = await page.request.get(`/api/sessions/${id}`);
    const detailJson = await detailAfterRetry.json();
    console.log(JSON.stringify({ diagnostic: 'retry-get', status: detailAfterRetry.status(), session: detailJson.data?.session?.status, messages: detailJson.data?.messages?.map((message: Message) => ({ id: message.id, role: message.role, sequence: message.sequence })) }));
    const originalSnapshot = sqliteSnapshot(file, sqlite);
    const originalCounts = {
      total: sqlite.prepare('SELECT COUNT(*) AS count FROM messages WHERE session_id = ?').get(id),
      customers: sqlite.prepare('SELECT COUNT(*) AS count FROM messages WHERE session_id = ? AND role = ?').get(id, 'customer'),
      last: sqlite.prepare('SELECT id, role, sequence FROM messages WHERE session_id = ? ORDER BY sequence DESC LIMIT 1').get(id),
    };
    sqlite.close();
    sqlite = new Database(file);
    sqlite.pragma('busy_timeout = 30000');
    const reopenedSnapshot = sqliteSnapshot(file, sqlite);
    const reopenedCounts = {
      total: sqlite.prepare('SELECT COUNT(*) AS count FROM messages WHERE session_id = ?').get(id),
      customers: sqlite.prepare('SELECT COUNT(*) AS count FROM messages WHERE session_id = ? AND role = ?').get(id, 'customer'),
      last: sqlite.prepare('SELECT id, role, sequence FROM messages WHERE session_id = ? ORDER BY sequence DESC LIMIT 1').get(id),
    };
    console.log(JSON.stringify({ diagnostic: 'sqlite-comparison', originalSnapshot, originalCounts, reopenedSnapshot, reopenedCounts }));
    expect(reopenedCounts.customers).toMatchObject({ count: 2 });
    sqlite.prepare('UPDATE training_sessions SET status = ?, updated_at = ? WHERE id = ?').run('failed', Date.now(), id);
    const recovered = await page.request.post(`/api/sessions/${id}/finish`);
    expect(recovered.status()).toBe(200);
    expect((await page.request.get(`/api/sessions/${id}/report`)).status()).toBe(200);
    expect(sqlite.prepare('SELECT COUNT(*) AS count FROM training_reports WHERE session_id = ?').get(id)).toMatchObject({ count: 1 });
  } finally {
    sqlite?.close();
    if (id) await page.request.delete(`/api/sessions/${id}`);
  }
});
