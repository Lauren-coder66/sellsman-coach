# 销售陪练 Phase 1.1 · 演示版

基于 Next.js、React、TypeScript、Tailwind、SQLite/Drizzle 的个人销售训练产品。当前仅实现 `AI_MODE=mock`，客户回复与报告评分由本地规则生成；页面均明确标为演示模式。无需 API Key。

## Windows 启动

```powershell
npm install
Copy-Item .env.example .env.local
npm run dev
```

打开 http://localhost:3000。页面：`/` 工作台、`/create` 创建训练、`/train/:id` 对话、`/report/:id` 报告、`/history` 历史。

## 测试与构建

```powershell
npx tsc --noEmit --incremental false
npm run lint
npm test
npm run test:e2e
npm run build
npm run start
```

Vitest 每次使用独立的临时 SQLite 数据库。Playwright 会在 3101 端口启动独立开发服务，并使用独立的临时 SQLite 数据库及 `.next-e2e` 构建目录；不会连接默认的训练数据库。Playwright 在本机使用安装的 Google Chrome。如路径不同，请调整 `playwright.config.ts` 中的 `executablePath`。

## 数据库

默认文件 `data/sales-coach.sqlite`，启动时只创建缺失表，不清空现有数据。Schema 位于 `src/lib/db/schema.ts`，迁移位于 `drizzle/`。变更 Schema 后运行 `npm run db:generate` 和 `npm run db:migrate`。备份时停止服务后复制 SQLite 文件；运行中备份应使用 SQLite Online Backup API。

匿名用户由 HttpOnly Cookie 区分。清除 Cookie 会失去原训练访问权。删除训练时，消息和报告通过外键级联删除。

## 会话与失败恢复

- 同一训练同时只处理一条客户回复或一份报告。并发请求会返回 409；同一个 `requestId` 重试不会重复保存用户发言或客户回复。
- 用户发言保存后如客户回复失败，训练页会显示已保存的发言和“重试客户回复”；刷新页面后仍可用原消息 ID 重试。回复未完成时不能再发送新发言。用户也可选择结束训练。
- 结束训练期间不接受新消息。报告生成失败后状态为 `failed`，可以从训练页重试。已完成训练再次请求结束时返回同一份报告；数据库对每个训练只允许一份报告。
- 处理进程中断可能留下 `replying` 或 `finishing` 状态。占用超过 60 秒后，原消息或报告请求可以重新接管；旧请求的结果不会再写入。报告引用会与真实用户消息核对。
- 历史记录每页最多 50 条，页面按 20 条加载，使用“加载更多”查看后续记录。

## 当前限制

- Mock 回复和评分仅供产品演示，不代表真实客户行为或销售能力评估。
- 本版没有真实 AI Provider；`src/lib/ai/provider.ts` 定义了未来适配接口，`AI_MODE` 当前仅接受 `mock`。
- 匿名 Cookie 丢失后，原训练无法找回；本版没有账号恢复功能。
