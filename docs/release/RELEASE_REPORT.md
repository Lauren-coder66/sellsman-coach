# Phase 3.2–3.6 本地候选验收报告

日期：2026-11-19。候选工作区：`D:\Desktop\销售训练助手-candidate-text-v1-9c97d5c`；分支 `candidate/text-v1-9c97d5c`；基准及当前 HEAD 均为 `9c97d5c282b2d4c55d3a54305ce5b85e9272e109`。所有本轮改动未提交、未推送。主工作区、main、release 未被修改。

## 已修复或补充

- 账号重置密码和重发验证邮件现在检查 Better Auth 返回错误；意外异常不再直接展示内部消息。
- 会话删除在最终 SQL 上复核 ownerId，减少归属状态变化时的越权窗口。
- 新增 `product_feedback` 兼容迁移、账号反馈 API/页面、幂等及限流；导出与删除覆盖反馈。没有接入第三方付费服务。
- 首页新增简短新手步骤和加载失败提示；移动端导航及主要页面的无横向溢出检查通过。
- 真实模式创建文案区分演示与模型调用；Mock 模式保留原始“开始模拟训练”按钮文案，原有 E2E 断言完整保留。
- AI 服务增加生产调用开关、固定生产模型检查、单次输入/输出硬限制、免费额度拒绝的明确错误；用量页增加按模型成功/失败与平均耗时。供应商账单仍需人工验证。
- 额外核对 HTTP 400 且错误码为 `AllocationQuota.FreeTierOnly` 的上游响应，修复其被当成普通 502 错误的分支；新增模拟用例，之后完整 Vitest、Playwright 和构建再次通过。
- 隐私页明确未验证邮箱也会保存，以及备份和供应商留存不会随主库自动清除。

## 文件清单

修改：`.env.production.example`、`drizzle/meta/_journal.json`、`e2e/account.spec.ts`、`e2e/api-stability.spec.ts`、`scripts/validate-release.mjs`、`src/app/account/page.tsx`、`src/app/account/usage/page.tsx`、`src/app/api/account/export/route.ts`、`src/app/api/sessions/[id]/route.ts`、`src/app/create/page.tsx`、`src/app/page.tsx`、`src/app/privacy/page.tsx`、`src/lib/ai/service.ts`、`src/lib/api.ts`、`src/lib/auth/accounts.ts`、`src/lib/db/schema.ts`、`src/lib/training-service.ts`、`src/lib/usage.ts`、`tests/migration.test.ts`、`tests/real-provider.test.ts`、`tests/release.test.ts`、`tests/usage.test.ts`。

新增：`drizzle/0006_product_feedback.sql`、`drizzle/meta/0006_snapshot.json`、`e2e/mobile-navigation.spec.ts`、`src/app/api/account/feedback/route.ts`、`src/app/feedback/page.tsx`、`src/lib/feedback.ts`、`tests/feedback.test.ts`，以及 `docs/release/` 下五份发布文档。

## 实际执行结果

| 命令 | 结果 |
| --- | --- |
| `npm ci` | 退出码 0；安装 456 个包。 |
| `npm audit` | 退出码 1；11 个中危、0 高危/严重。 |
| `npm audit --omit=dev` | 退出码 1；4 个中危，涉及 drizzle-kit / esbuild 构建工具链。 |
| `npm audit --prefix deploy/runtime --omit=dev` | 退出码 0；0 个漏洞。 |
| `npx tsc --noEmit --incremental false` | 退出码 0。 |
| `npm run lint` | 退出码 0。 |
| `npm test` | 19 个文件、55 项测试通过。 |
| `npm run test:e2e -- --workers=2` | 首轮 11/14，因创建按钮文案变更造成 3 项超时；修正文案后，定向 3/3，完整复测 14/14。原始 SQLite 计数断言保留且通过。 |
| `npm run build` | 退出码 0；Next.js 16.4.6 正式构建成功。 |
| 正式构建本地启动 | 使用独立临时 SQLite 和 Mock；`npm run start -- --port 3110` 启动成功，`/` 与 `/api/health` 均返回 HTTP 200；随后主动停止服务。 |
| Docker/Compose | 本机找不到 Docker 或 Podman；未执行镜像和容器验收。 |

以上所有应用测试均以 Mock 和隔离数据库运行。没有真实 AI、真实邮件、公网 HTTPS、真实外部备份或真实账单验收。旧 Linux 诊断分支的结果不代表本候选的验证。

## 结论

**NO-GO：尚不能邀请外部真实用户注册受控测试。** 当前可以进行本地、隔离、有人监督的 Mock 试用。阻塞项是候选 SHA 尚未接受 Linux 容器验收、真实邮件与 HTTPS 未验证、百炼免费额度和账单边界未在当前环境重新核实、隐私与协议运营信息尚未补齐。零新增成本约束下可继续在已有免费且无自动扣费资源中验证；不能用代码限额代替供应商费用保证。

后续顺序：人工审阅候选 diff → 获授权后提交独立候选并做该 SHA 的 Linux CI → 隔离预发布验收邮件/HTTPS/备份恢复 → 核实百炼免费账户并做受控小流量账单核对 → 法务和运营资料完成 → 再决定是否开放第一批测试。无需购买资源的步骤可以继续准备，但本轮不提交或部署。
