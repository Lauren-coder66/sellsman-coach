# 销售陪练 Phase 2.1 · 文字客户对练

基于 Next.js、React、TypeScript、Tailwind、SQLite/Drizzle 的个人销售训练产品。`AI_MODE=mock` 使用本地规则；`AI_MODE=real` 使用服务端配置的 OpenAI 兼容 Chat Completions 接口生成客户画像与回复。两种模式的报告评分仍由本地 Mock 规则生成，不代表真实能力评估。

## Windows 启动

```powershell
npm install
Copy-Item .env.example .env.local
npm run dev
```

打开 http://localhost:3000。页面：`/` 工作台、`/progress` 我的成长、`/create` 创建训练、`/scenarios` 管理个人场景、`/train/:id` 对话、`/report/:id` 报告、`/history` 历史。

## 真实 AI 文字客户

在 `.env.local` 中设置 `AI_MODE=real`、`AI_PROVIDER`（供应商标识）、`AI_API_URL`（供应商提供的完整 Chat Completions 地址）、`AI_MODEL` 和 `AI_API_KEY`，然后重启服务。`AI_TIMEOUT_MS` 默认 30000，允许 1000–45000 毫秒，短于 60 秒的对话租约。生产接口使用 HTTPS，本机测试端点允许 HTTP。密钥只由服务端读取，不能设置为 `NEXT_PUBLIC_` 变量。接口须兼容 `model`、`messages`、`max_tokens`、`response_format: { type: "json_object" }` 和 `choices[0].message.content`。输出截断或结构不合格会返回 502，已识别的超时返回 504。

真实模式默认顺序生成隐藏画像和开场白，分别限制 1400 和 1050 Token，并各自计算超时。开场白仍要求最多 60 字，Token 预算也需容纳模型推理。可用 `AI_CREATE_STRATEGY=combined` 在测试时尝试单次调用，输出上限 1600 Token。固定免费模型实测曾在此上限截断，合并路径目前为实验选项。两部分通过服务端校验后才写入 SQLite，前端只收到可见对话和会话信息。普通对话回复限制 1200 Token。合并创建遇到无法解析的 JSON，或回复遇到 JSON 解析或字段错误时，最多重试一次，与第一次共享超时预算，始终使用配置中的模型。

每次回复都传入画像、训练场景、专项重点和完整历史。客户根据卖方已经提供的答复更新顾虑和购买意愿。接口不会返回原始画像、提示词或密钥。切换默认模式后，已有会话仍沿用其创建时的模式。真实模型失败会返回错误，已保存的用户发言可以使用同一个请求 ID 重试。

服务端对每次真实调用记录 `[ai-call]` 日志：操作、供应商、模型、成功或失败、耗时毫秒数和供应商返回的 Token 用量；未返回用量时记录 `null`。日志不记录密钥、画像、完整提示词或对话。若没有配置可用的真实 API Key，无法完成真实模型 10 轮验收，也无法报告实际 Token 消耗；单元测试中的模拟用量不代表真实消耗。

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

默认文件 `data/sales-coach.sqlite`，启动时只创建缺失表，不清空现有数据。Schema 位于 `src/lib/db/schema.ts`，迁移位于 `drizzle/`。个人场景保存在 `saved_scenarios` 表，通过 `owner_id` 隔离；表与训练会话没有外键，因此编辑或删除个人场景不会改写历史训练的场景快照。专项训练关联保存在 `training_focus` 表：`session_id` 指向当前训练，`source_session_id` 保留来源训练 ID，`dimension` 是四项能力之一。来源归属在创建时检查；来源删除后，专项训练和报告仍保留，只隐藏返回来源入口。变更 Schema 后运行 `npm run db:generate` 和 `npm run db:migrate`。现有迁移使用可重复执行的建表语句，兼容过去由应用自动创建但没有迁移日志的数据库。备份时停止服务后复制 SQLite 文件；运行中备份应使用 SQLite Online Backup API。

匿名用户由 HttpOnly Cookie 区分。清除 Cookie 会失去原训练访问权。删除训练时，消息和报告通过外键级联删除。

## 自定义场景

创建训练页可选六个只读系统模板或自己的个人模板，也可将当前表单保存为个人场景。`/scenarios` 支持新建、编辑、删除、复制系统模板和使用个人场景开始训练。开始训练前仍可修改参数；每次创建新会话并保存当时的参数快照。

个人场景 API：`GET/POST /api/scenarios`、`GET/PUT/DELETE /api/scenarios/:id`。写入时使用 Zod 验证所有字段；读取和修改均按匿名 Cookie 的所有者校验。系统模板仅存在于代码常量中，不能通过个人场景 API 修改或删除。

## 针对性重复训练

结束训练后，在报告的“针对性练习”区选择需求挖掘、价值表达、异议处理或推进下一步。报告有评分时会标出 Mock 演示最低分；样本不足时仍可手动选择。创建页载入来源场景，显示本次练习说明，允许调整参数后创建独立会话；原消息和报告不会复制或改写。训练页、专项报告和历史记录会标明训练重点。专项报告提供返回仍存在的来源训练、再次进行同类专项练习和历史入口。

`POST /api/sessions` 沿用普通场景字段；专项训练额外同时提交 `sourceSessionId` 与 `focusDimension`。服务端核对来源归属，并在创建会话时保存关联。训练重点作为可选上下文传给 `AIProvider`，供以后接入真实模型；当前 Mock 回复和评分仍由本地规则生成，不能用两次 Mock 分数差异判断能力提升。

## 我的成长

`/progress` 和 `GET /api/progress?days=7|30|90` 只统计当前匿名 Cookie 所属的 SQLite 记录。累计训练是现存会话数；已完成是状态为 `completed` 的会话数；最近 7/30 天按会话创建日计算，包含今天；活跃训练天数是所有会话创建日期的去重数；累计发言轮数只计 `role=user` 的消息。普通训练没有 `training_focus` 记录，专项训练及四项方向分布以该表为准。最近时间线展示最近 10 条训练。

每日趋势按 `Asia/Shanghai` 自然日统计，7/30/90 天范围都包含今天；没有训练的日期补 0。删除训练后，以上统计随数据库记录同步变化。本版不展示能力成长曲线，也不使用 Mock 报告评分推断能力提升。匿名 Cookie 丢失后无法恢复原训练。

## 会话与失败恢复

- 同一训练同时只处理一条客户回复或一份报告。并发请求会返回 409；同一个 `requestId` 重试不会重复保存用户发言或客户回复。
- 用户发言保存后如客户回复失败，训练页会显示已保存的发言和“重试客户回复”；刷新页面后仍可用原消息 ID 重试。回复未完成时不能再发送新发言。用户也可选择结束训练。
- 结束训练期间不接受新消息。报告生成失败后状态为 `failed`，可以从训练页重试。已完成训练再次请求结束时返回同一份报告；数据库对每个训练只允许一份报告。
- 处理进程中断可能留下 `replying` 或 `finishing` 状态。占用超过 60 秒后，原消息或报告请求可以重新接管；旧请求的结果不会再写入。报告引用会与真实用户消息核对。
- 历史记录每页最多 50 条，页面按 20 条加载，使用“加载更多”查看后续记录。

## 当前限制

- Mock 回复和评分仅供产品演示，不代表真实客户行为或销售能力评估；真实客户回复也不等于真实能力评分。
- 真实模式依赖所配置供应商的可用性、接口兼容性与费用；目前没有真实 AI 报告评分。
- 匿名 Cookie 丢失后，原训练无法找回；本版没有账号恢复功能。
