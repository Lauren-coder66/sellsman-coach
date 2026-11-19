# Phase 3.7 独立代码审查

日期：2026-11-19。范围：候选 worktree `D:\Desktop\销售训练助手-candidate-text-v1-9c97d5c` 相对 `9c97d5c282b2d4c55d3a54305ce5b85e9272e109` 的未提交变更及其调用链。只做静态审查，未运行新测试、未调用真实模型、未改业务代码。本文是本轮唯一新增文件。

## Git 与变更边界

- 分支 `candidate/text-v1-9c97d5c`，HEAD 为指定基准 SHA。暂存区为空；22 个已跟踪文件有未暂存修改，原有 12 个未跟踪候选文件，加上本报告。未发现本轮改动落在 main、release 或 diagnostic worktree。
- 已跟踪差异：`.env.production.example`、`drizzle/meta/_journal.json`、`e2e/account.spec.ts`、`e2e/api-stability.spec.ts`、`scripts/validate-release.mjs`、`src/app/account/page.tsx`、`src/app/account/usage/page.tsx`、`src/app/api/account/export/route.ts`、`src/app/api/sessions/[id]/route.ts`、`src/app/create/page.tsx`、`src/app/page.tsx`、`src/app/privacy/page.tsx`、`src/lib/ai/service.ts`、`src/lib/api.ts`、`src/lib/auth/accounts.ts`、`src/lib/db/schema.ts`、`src/lib/training-service.ts`、`src/lib/usage.ts`、`tests/migration.test.ts`、`tests/real-provider.test.ts`、`tests/release.test.ts`、`tests/usage.test.ts`。
- 原有未跟踪候选文件：`docs/release/AI_COST_PROTECTION.md`、`FREE_BETA_PLAN.md`、`RELEASE_CHECKLIST.md`、`RELEASE_REPORT.md`、`SECURITY_REVIEW.md`，`drizzle/0006_product_feedback.sql`、`drizzle/meta/0006_snapshot.json`、`e2e/mobile-navigation.spec.ts`、`src/app/api/account/feedback/route.ts`、`src/app/feedback/page.tsx`、`src/lib/feedback.ts`、`tests/feedback.test.ts`。
- `git diff --check` 未报告空白错误；仅有两处 Windows 换行转换提示。未发现被暂存的环境文件、密钥或数据库。`e2e/api-stability.spec.ts:69` 仍保留 release 的原连接 `customer count = 2` 断言；此次只新增跨用户 DELETE 404 断言。

## 必须在提交前解决

1. **数据导出缺少隐藏客户画像**。风险 P2。位置：`src/app/api/account/export/route.ts:11`，`src/lib/db/schema.ts:7`。会话导出只选择 `scenario_config`，但每场训练还存储 `hidden_customer_profile`；账号导出因此不是所保存训练数据的完整副本。可由静态查询列清单直接确认，未运行新的导出重建试验。建议明确产品政策：若属于用户可导出数据，在结束的训练中导出该列并验证权限及格式；若有意不导出，修改导出说明并记录原因，避免承诺完整导出。

2. **训练失败可能暴露底层异常文本**。风险 P2。位置：`src/lib/training-service.ts:66,110`。客户回复或报告生成抛出不属于已分类 AI 错误的异常时，`error.message` 会进入公开 API 的 502 响应；例如报告校验异常或 SQLite 写入异常，用户可看到内部实现文本。代码路径可静态确认；未在本轮注入数据库故障实际复现。建议返回固定、可操作的用户提示，保留脱敏错误类别供服务端排查，并为该分支增加失败注入测试。

## 非阻塞但需明确的风险

3. **管理员入口对普通用户可见**。风险 P3。位置：`src/app/account/usage/page.tsx:26`，服务端保护在 `src/app/api/account/usage/route.ts:9-13`。普通已验证用户点“管理员用量”会收到 404 并显示错误；这不是越权漏洞，但造成误导。可通过页面逻辑直接复现，未在本轮打开浏览器。建议只给经服务端确认的管理员显示入口；继续保持 API 端鉴权。

4. **并发额度只在当前架构和已测试场景内得到证明**。风险 P2，验收缺口。位置：`src/lib/usage.ts:23-42`，`tests/usage.test.ts:12-26`。SQLite `immediate` 事务把额度检查与预留写入同一写锁，代码上没有明显的并发穿透路径；但新增测试只在单进程内顺序调用两次，没有多进程同库竞争或供应商返回超预留 Token 的实际验证。建议在 Linux 容器 CI 上加多进程同库并发测试与供应商用量核对，再把“并发不能绕过”作为已验收结论。

5. **零账单不能由代码保证**。风险 P1，运营阻塞。位置：`src/lib/ai/service.ts:28-47,67-96`、`src/lib/usage.ts:16-42`、`scripts/validate-release.mjs:17-19`。生产配置固定百炼模型、服务端预留额度、关闭开关和有限重试；代码没有自动切换 Provider。供应商免费资格、实际模型计费、免费额度用尽行为仍由外部账户控制。本轮未调用真实 API，因此没有新账单证据。开启真实调用前必须由运营方在后台确认“用完即停”、模型免费资格与余额，并做小流量账单核对。

## 已核对的正向证据与边界

- 邮件：`src/app/account/page.tsx:89-97` 对密码重置和重发验证检查 Better Auth 的 `result.error`；`e2e/account.spec.ts:99` 使用请求拦截验证失败提示，不证明真实 Resend 投递。
- 会话权限：`src/lib/auth/session.ts:52-55` 按 ownerId 取会话；`src/app/api/sessions/[id]/route.ts:31-37` 的 DELETE 在最终 SQL 再加 ownerId；`e2e/api-stability.spec.ts:17-21` 覆盖跨用户 404。没有发现仅凭 sessionId 越权读取或删除的新增路径。
- 反馈：`src/lib/feedback.ts:14-25` 在 SQLite 即时事务中执行幂等、限流和插入；`src/app/api/account/feedback/route.ts:9-32` 要求已验证账户并按 ownerId 读取；迁移 `drizzle/0006_product_feedback.sql` 提供持久表。`e2e/account.spec.ts:49-61,82-94` 检查实际 API、导出和删号后的数据库行；`tests/feedback.test.ts` 使用独立临时数据库。
- 账号删除：`src/lib/auth/accounts.ts:66-75` 有独立的反馈删除触发器，避免旧触发器 `IF NOT EXISTS` 不更新；在线训练和场景也有原触发器。备份和第三方留存不会自动删除，已在隐私页披露，须有运营删除流程。
- AI：`src/lib/ai/service.ts:52-64` 结构化重试最多一次且共享超时信号；输入和输出设上限；`src/lib/usage.ts:23-42` 在模型请求前预留；429、超时、403 和免费额度错误有分类处理；`src/app/account/usage/page.tsx:35-39` 对未知费用展示“未知”。固定模型只是请求参数约束，不能证明供应商实际账单为零。
- 测试：Playwright 配置将数据库设为独立临时文件、`AI_MODE=mock`、workers=2；原始 SQLite 计数断言未降低。新增邮件错误用例是前端拦截，真实邮件失败恢复仍待外部环境测试。既有本地验收记录为 Vitest 55/55、Playwright 14/14、TypeScript、ESLint、构建通过；本轮没有重跑，不把既有结果当成当前外部环境验收。
- 依赖：既有 `npm audit` 为 11 个中危，`--omit=dev` 为 4 个中危（`drizzle-kit` / `@esbuild-kit` / `esbuild` 链）；独立 `deploy/runtime` 清单为 0。主锁文件的 omit 分类仍含构建工具，不能直接据此断言镜像装有这些包；Dockerfile 最终镜像复制独立运行时依赖。未升级依赖，最终镜像本 SHA 尚未构建验收。

## 结论

**NO-GO：先解决问题 1 与 2，再申请提交和 Linux CI。** 问题 3 可随后修复。问题 4 是 Linux CI 的验收项目；问题 5 是开放真实 AI 前的外部运营门槛。当前候选仍可在隔离 Mock 环境审阅，但不能把本地测试结果等同真实服务、Linux 容器或零费用保证。

## Phase 3.8 修复后状态（2026-11-19）

- 问题 1 已修复：导出会话现增加 `hidden_customer_profile` 字段，仍按 ownerId 筛选；空字符串导出为 `null`。E2E 验证本人多条画像、第二用户空导出、空画像、删除训练后不出现和原字段兼容。
- 问题 2 已修复：未知异常只返回固定 502 提示；已分类的超时、额度、服务拒绝与模型输出错误保留原状态码和安全文案。诊断日志只记录操作、UUID 关联标识、受限错误类别及受限 SQLite 错误码。单元测试注入 Provider 异常和实际 SQLite 唯一约束冲突，验证无原始错误内容泄露。
- 原 NO-GO 结论仅适用于修复前版本。修复后的候选经 Vitest 57/57、Playwright 14/14、TypeScript、ESLint、正式构建通过，可以进入人工审阅后的候选提交与 Linux CI；公网测试的外部条件仍未验收。详情见 `PHASE_3_8_FIX_REPORT.md`。
