# Phase 3.9 候选提交前审核

日期：2026-11-19。审查对象：`D:\Desktop\销售训练助手-candidate-text-v1-9c97d5c`。分支 `candidate/text-v1-9c97d5c`，HEAD `9c97d5c282b2d4c55d3a54305ce5b85e9272e109`。本轮只核对代码与配置，未重跑测试、未调用真实 AI、未提交或推送；本报告是本轮唯一新增文件。

## Git 与完整变更清单

独立 worktree 与主工作区分别指向候选和诊断分支。暂存区为空；现有候选改动均未暂存。相对基准 SHA 的已跟踪修改共 23 个：

`.env.production.example`、`drizzle/meta/_journal.json`、`e2e/account.spec.ts`、`e2e/api-stability.spec.ts`、`scripts/validate-release.mjs`、`src/app/account/page.tsx`、`src/app/account/usage/page.tsx`、`src/app/api/account/export/route.ts`、`src/app/api/sessions/[id]/route.ts`、`src/app/create/page.tsx`、`src/app/page.tsx`、`src/app/privacy/page.tsx`、`src/lib/ai/service.ts`、`src/lib/api.ts`、`src/lib/auth/accounts.ts`、`src/lib/db/schema.ts`、`src/lib/training-service.ts`、`src/lib/usage.ts`、`tests/migration.test.ts`、`tests/real-provider.test.ts`、`tests/release.test.ts`、`tests/training-service.test.ts`、`tests/usage.test.ts`。

审查前已有未跟踪文件共 14 个：`docs/release/AI_COST_PROTECTION.md`、`docs/release/FREE_BETA_PLAN.md`、`docs/release/PHASE_3_7_REVIEW.md`、`docs/release/PHASE_3_8_FIX_REPORT.md`、`docs/release/RELEASE_CHECKLIST.md`、`docs/release/RELEASE_REPORT.md`、`docs/release/SECURITY_REVIEW.md`、`drizzle/0006_product_feedback.sql`、`drizzle/meta/0006_snapshot.json`、`e2e/mobile-navigation.spec.ts`、`src/app/api/account/feedback/route.ts`、`src/app/feedback/page.tsx`、`src/lib/feedback.ts`、`tests/feedback.test.ts`。本报告新增后为 15 个未跟踪文件。

`git diff --check` 没有空白错误；只提示 `_journal.json` 与首页文件在 Windows 上可能发生 LF/CRLF 转换。未发现 `.env.local`、SQLite 文件或含值密钥进入差异；`.env.production.example` 只有空白凭据占位。提交时必须只暂存上述候选文件，再复核暂存区。

## 修复与一致性

- Phase 3.7 的 NO-GO 明确标记为修复前结论；同一文件末尾追加 Phase 3.8 修复状态。Phase 3.8 报告给出的 GO 只针对“可以申请候选提交与 Linux CI”，而 `RELEASE_REPORT.md` 的 NO-GO 针对“尚不能开放真实用户公网测试”。两者判断对象不同，不矛盾。
- `src/app/api/account/export/route.ts:8-22` 要求已验证会话，所有导出查询按 `accountOwner(session.user.id)` 过滤。会话同一行新增 `hidden_customer_profile`，空字符串转换为 `null`，原字段不变；E2E 在隔离数据库核对本人多条记录、第二用户空导出和删除后消失。导出文件包含个人训练详情，应由用户妥善保存。
- `src/lib/training-service.ts:18-22,67-73,112-119` 对未知异常返回固定 502 提示，日志仅记录操作、关联 UUID、受限错误类别与 SQLite 错误码；不记录原始异常、路径、完整对话或 Key。已分类的 409/429/503/504 和安全模型输出提示保持原语义。更外层 `src/lib/api.ts` 的兜底处理也只记录异常类别并返回通用 500。
- `src/lib/auth/session.ts:52-55` 按 ownerId 读取；`src/app/api/sessions/[id]/route.ts:31-37` 在最终 DELETE SQL 再校验 ownerId。反馈持久化和账户删除触发器见 `src/lib/feedback.ts:14-30`、`src/lib/auth/accounts.ts:66-75`。跨用户 API 行为由 `e2e/account.spec.ts` 与 `e2e/api-stability.spec.ts` 验证。
- `e2e/api-stability.spec.ts:69` 的 release 原始 SQLite 原连接 `customer count = 2` 断言完整保留；新增内容是跨用户 DELETE 404 检查，没有放宽旧断言。
- `src/lib/ai/service.ts:28-47,52-75` 的模型、输入/输出上限、服务端预留和有限格式重试均在服务端；`src/lib/usage.ts:23-42` 用 SQLite 即时事务把检查与预留写入同一个写锁。代码中没有失败后自动切换付费模型或其他 Provider 的分支；请求模型由服务端环境变量决定。供应商实际免费资格与账单尚未验证。

## 本地测试证据与可信度

Phase 3.8 在最终代码执行：Vitest 57/57、Playwright 14/14（workers=2）、`npx tsc --noEmit --incremental false`、`npm run lint`、`npm run build` 均通过。专项测试注入 Provider 异常及真实 SQLite 唯一约束冲突；导出 E2E 查询实际隔离数据库。Playwright 配置强制临时 SQLite 和 `AI_MODE=mock`，不使用正式数据库。邮件失败用例使用浏览器请求拦截，只验证 UI，不等于真实邮件投递验收。本轮没有重新执行测试，也没有用诊断分支 CI 结果代替当前未提交候选。

## Linux CI 进入条件与尚未验证事项

- `Dockerfile` 采用 Node 24 多阶段构建，最终以非 root `node` 运行并带健康检查。`compose.yaml` 为 SQLite 配置持久化卷，对应用容器设置只读根文件系统、临时目录、删除 capability 与禁增权；Caddy 配置 HTTP→HTTPS、请求体上限及请求日志字段过滤。`src/lib/db/index.ts` 使用 WAL、外键与启动迁移；`scripts/sqlite-copy.mjs` 有完整性检查。生产启动前 `scripts/validate-release.mjs` 核查账号、邮件、百炼固定模型、域名和开关。
- `.github/workflows/verify.yml` 的 push/PR 流程包含 `npm ci`、lint、Vitest、Playwright、TypeScript、build、Docker build 与容器 smoke，并上传 smoke 日志。它会在候选获准提交并推送后运行；当前工作区尚无代表本次修改的提交 SHA，故**当前候选的 Linux 镜像、Compose、迁移、重启持久化及备份恢复结果未验证**。
- 真实百炼免费额度/账单、真实 Resend 投递、公网 HTTPS、异机备份、法律与运营信息仍未验收。此前依赖审计：全部依赖 11 个中危，`--omit=dev` 4 个中危（构建工具链），独立 `deploy/runtime` 0 个；本轮未重新执行审计或升级依赖。

## 结论

**GO：当前代码与测试证据足以提交独立候选并申请该提交 SHA 的 Linux CI 验收。** 提交前仍须由操作者核对暂存文件清单及密钥；本报告不授权提交、推送或合并。Linux CI 及真实外部服务通过前，不能宣布公网正式上线。
