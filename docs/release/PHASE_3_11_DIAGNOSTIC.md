# Phase 3.11：Linux 创建训练 HTTP 500 诊断

日期：2026-11-19。分支：`candidate/text-v1-9c97d5c`。诊断基线 HEAD：`788a2b381c1c4b2acf540deb516710862506e421`。本轮未提交、推送或修改正式数据库。

## 原始故障与证据

- [GitHub Verify Run 44490706477](https://github.com/Lauren-coder66/sellsman-coach/actions/runs/44490706477)，Job `135445283137`，准确 SHA `788a2b381c1c4b2acf540deb516710862506e421`，结论 failure。
- Linux Playwright 运行 14 项、2 workers：`e2e/history-pagination.spec.ts:20` 创建训练预期 HTTP 201、实际 HTTP 500，最终 13 通过、1 失败。服务端同轮只记录 `[api-error] SqliteError`；没有 SQLite `code`、`errno`、失败 SQL 或事务阶段。该 Run 没有 Artifact。
- 前一功能提交 `a856a4a49d4a50c1a4e6293f1da285f613516d3f` 的 [Run 44489347718](https://github.com/Lauren-coder66/sellsman-coach/actions/runs/44489347718) 在 Linux 通过 14/14；两次运行之间的提交只更改验收文档。这支持“间歇性”判断，但不证明具体数据库原因。

## 本地复现

Playwright 配置每次启动创建独立的系统临时目录 `sales-coach-e2e-*`，使用 `test.sqlite`，强制服务端 `AI_MODE=mock`、`E2E_TEST=1`。本轮没有访问正式数据库或真实模型。

| 命令 | 实际结果 |
| --- | --- |
| `npx playwright test e2e/history-pagination.spec.ts --workers=1 --repeat-each=10` | 10/10，通过 |
| `npx playwright test e2e/history-pagination.spec.ts --workers=2 --repeat-each=10` | 10/10，通过 |
| `npm run test:e2e -- --workers=1` | 14/14，通过 |
| `npm run test:e2e -- --workers=2`，原代码 | 14/14，通过 |
| `npm run test:e2e -- --workers=2`，加入诊断后连续 5 轮 | 每轮 14/14，合计 70/70，通过；未出现诊断错误日志 |

诊断改动后的本地静态与单元回归：`npm test` 57/57、`npx tsc --noEmit --incremental false` 退出 0、`npm run lint` 退出 0、`npm run build` 退出 0。构建使用另建的系统临时 SQLite 路径与 `AI_MODE=mock`；没有调用真实百炼。Docker 在本机不可用，本轮也没有提交或触发新的 Linux CI。

没有失败轮次，因此无法记录失败发生于第几个创建请求；本地所有这些请求均按原断言返回 HTTP 201。不能据此宣称 Linux 故障已修复。

## 诊断改动与安全边界

- `src/app/api/sessions/route.ts`：仅在 `E2E_TEST=1` 且抛出异常时记录固定路由、方法、操作阶段、随机 correlationId、受限错误类别、格式校验后的 `SQLITE_*` 错误码和数字型 errno。阶段覆盖请求解析、身份、客户生成、事务开始、归属校验、会话与首条消息插入、提交。客户端仍经 `handleError` 返回原有安全错误，不返回底层异常。
- `e2e/history-pagination.spec.ts`：保留原 HTTP 201 断言，失败时在断言消息中增加循环 index、HTTP 状态和安全错误代码；未降低预期或增加重试。
- 未记录 SQL 参数、用户消息、画像、邮箱、密码、Cookie、Token、密钥或原始异常文本。原 `e2e/api-stability.spec.ts` 的 SQLite 客户消息数量断言未改动。
- `docs/release/PHASE_3_10_CI_REPORT.md` 的上轮未提交修改原样保留。

## 错误码、失败操作和根因

**SQLite 错误码：未知。具体失败操作：未知。根因：未确认。** 原始日志只有 `SqliteError` 类型，既不能区分 `SQLITE_BUSY`、约束错误或其他 SQLite 错误，也不能将它定位到身份查询、会话插入、消息插入或提交。2 workers 本地复测未复现，不能证明 workers 数量、Better Auth、迁移或测试间共享数据就是原因。目前没有足够证据支持修改业务事务逻辑、增加超时或 HTTP 重试。

## 后续验证条件

在 GitHub-hosted Linux 的隔离测试库上运行包含上述诊断的完整 E2E，并保留服务端日志及失败上下文。若再次出现 500，使用日志的 correlationId、stage、SQLite code/errno 和失败的循环 index 定位操作；随后才能实施最小业务修复并增加对应回归测试。修复后执行 Vitest、1/2 workers 完整 E2E、2 workers 至少五轮、TypeScript、ESLint、正式构建，并在准确的新提交 SHA 上重新运行 Linux Verify。

**本阶段结论：未确认根因，未实施业务修复；最终候选仍为 NO-GO。**
