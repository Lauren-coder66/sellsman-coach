# 销售陪练 Phase 1 · 演示版

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

Playwright 在本机使用安装的 Google Chrome。如路径不同，请调整 `playwright.config.ts` 中的 `executablePath`。

## 数据库

默认文件 `data/sales-coach.sqlite`，启动时只创建缺失表，不清空现有数据。Schema 位于 `src/lib/db/schema.ts`，迁移位于 `drizzle/`。变更 Schema 后运行 `npm run db:generate` 和 `npm run db:migrate`。备份时停止服务后复制 SQLite 文件；运行中备份应使用 SQLite Online Backup API。

匿名用户由 HttpOnly Cookie 区分。清除 Cookie 会失去原训练访问权。删除训练时，消息和报告通过外键级联删除。

## 当前限制

- Mock 回复和评分仅供产品演示，不代表真实客户行为或销售能力评估。
- 本版没有真实 AI Provider；`src/lib/ai/provider.ts` 定义了未来适配接口，`AI_MODE` 当前仅接受 `mock`。
- 历史列表一次最多返回 50 条；大量训练记录的翻页尚未实现。
