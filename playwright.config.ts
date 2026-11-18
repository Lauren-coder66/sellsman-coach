import { mkdtempSync, mkdirSync, existsSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { defineConfig } from '@playwright/test';

const inheritedDatabase = process.env.SALES_COACH_E2E_DB;
if (inheritedDatabase && (path.dirname(path.dirname(path.resolve(inheritedDatabase))) !== path.resolve(tmpdir()) || !path.basename(path.dirname(inheritedDatabase)).startsWith('sales-coach-e2e-'))) {
  throw new Error('E2E 数据库必须位于独立的临时目录');
}
const database = inheritedDatabase ?? path.join(mkdtempSync(path.join(tmpdir(), 'sales-coach-e2e-')), 'test.sqlite');
process.env.SALES_COACH_E2E_DB = database;
const mailDirectory = path.join(path.dirname(database), 'mail');
mkdirSync(mailDirectory, { recursive: true });
process.env.SALES_COACH_E2E_MAIL = mailDirectory;
const chrome = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
export default defineConfig({
  testDir: './e2e',
  workers: 2,
  use: { baseURL: 'http://localhost:3101', launchOptions: existsSync(chrome) ? { executablePath: chrome } : {} },
  webServer: {
    command: 'npm run dev -- --port 3101',
    url: 'http://localhost:3101',
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      DATABASE_URL: database, AI_MODE: 'mock', E2E_TEST: '1', ACCOUNT_REQUIRED: '0',
      ACCOUNT_TEST_MAIL_DIR: mailDirectory, BETTER_AUTH_URL: 'http://localhost:3101', BETTER_AUTH_SECRET: randomBytes(36).toString('hex'),
    },
  },
});
