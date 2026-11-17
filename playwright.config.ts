import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { defineConfig } from '@playwright/test';

const inheritedDatabase = process.env.SALES_COACH_E2E_DB;
if (inheritedDatabase && (path.dirname(path.dirname(path.resolve(inheritedDatabase))) !== path.resolve(tmpdir()) || !path.basename(path.dirname(inheritedDatabase)).startsWith('sales-coach-e2e-'))) {
  throw new Error('E2E 数据库必须位于独立的临时目录');
}
const database = inheritedDatabase ?? path.join(mkdtempSync(path.join(tmpdir(), 'sales-coach-e2e-')), 'test.sqlite');
process.env.SALES_COACH_E2E_DB = database;
export default defineConfig({
  testDir: './e2e',
  use: { baseURL: 'http://localhost:3101', launchOptions: { executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe' } },
  webServer: {
    command: 'npm run dev -- --port 3101',
    url: 'http://localhost:3101',
    reuseExistingServer: false,
    timeout: 120_000,
    env: { DATABASE_URL: database, AI_MODE: 'mock', E2E_TEST: '1' },
  },
});
