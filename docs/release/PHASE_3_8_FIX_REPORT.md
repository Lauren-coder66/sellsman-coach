# Phase 3.8 两项阻塞修复验收

日期：2026-11-19。分支 `candidate/text-v1-9c97d5c`；HEAD 仍为基准 `9c97d5c282b2d4c55d3a54305ce5b85e9272e109`，修复均未提交。只在独立候选 worktree 修改，未触碰正式数据库、main、release 或 diagnostic，未调用真实 AI。

## 原因与修复

1. `src/app/api/account/export/route.ts` 的会话 SELECT 遗漏 `training_sessions.hidden_customer_profile`。现仅在原 `sessions` 每项增加 `hidden_customer_profile`，不删除或重命名现有字段；`NULLIF` 把历史空字符串表示为 JSON `null`。原数据按 ownerId 过滤，画像和 session ID 位于同一行，不会跨用户混配。导出仍不含 API Key、密码哈希、Cookie、认证令牌或系统提示词。
2. `src/lib/training-service.ts` 的两处兜底 catch 曾把未知异常 `message` 当作 API 文案。现对未知回复/报告异常返回固定 502 提示，保留已分类业务错误的 409、429、503、504 与安全的模型输出 502 文案；日志只输出操作、关联 UUID、符合短格式的错误类别和 `SQLITE_*` 错误码，不输出原始异常、消息、路径或密钥。请求失败后既有状态恢复和幂等逻辑未改。

修改文件：`src/app/api/account/export/route.ts`、`src/lib/training-service.ts`、`tests/training-service.test.ts`、`e2e/account.spec.ts`、`docs/release/PHASE_3_7_REVIEW.md`；本报告为新增文件。没有修改 Schema、依赖或 `e2e/api-stability.spec.ts` 原始 SQLite customer count 断言。

## 实际测试

| 检查 | 结果 |
| --- | --- |
| 训练服务专项单元测试 | 11/11 通过；注入 Provider 内部错误和真实 SQLite sequence 唯一约束冲突，检查客户端与日志无敏感详情；报告失败仍可恢复。 |
| 账号导出专项 E2E | `e2e/account.spec.ts` 2/2 通过；验证本人画像、多训练、空画像、已删除训练、第二用户空导出、结构兼容和无密码明文。 |
| `npm test` | 首轮发现原报告 Token 上限提示被归入通用错误；修复分类后完整复测 57/57 通过。 |
| `npm run test:e2e -- --workers=2` | 14/14 通过，最终代码再次完整复测通过。 |
| `npx tsc --noEmit --incremental false` | 退出码 0。 |
| `npm run lint` | 退出码 0。 |
| `npm run build` | 退出码 0；Mock 与独立临时数据库。 |

## 安全与剩余风险

导出中的隐藏画像只随已验证账号本人数据返回；下载文件包含训练详情，用户需自行妥善保管。旧训练的空画像不会使导出失败。异常日志不包含原文或原始异常文本，但关联 UUID 仍属于运维数据，应限制日志访问及保留期。

本轮不验证真实百炼、真实邮件、公网 HTTPS、Linux 容器、多进程同库额度竞争、供应商账单或异机恢复。现有依赖审计中的中危工具链问题也未在本轮升级；应在候选 Linux CI 上继续核实。

**GO：两个已指出的代码阻塞问题已解决，可以提交给人工审核，之后进入候选提交与 Linux CI 验收。** 这不表示已达到公网正式上线条件。
