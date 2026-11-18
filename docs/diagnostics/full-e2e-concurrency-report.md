# Linux 完整 E2E 并发诊断报告

## 诊断范围

本流程用于验证原始 CI 故障是否与完整 E2E 的测试顺序、`workers=2` 并发执行或共享 SQLite 有关。使用 Ubuntu 26.04、Node.js 24、`AI_MODE=mock`，不修改业务逻辑、Schema 或既有断言。

## 执行方式

- 每轮执行完整 `npm run test:e2e`，不使用 `--grep`。
- 保持 Playwright `workers=2`。
- 连续执行 3 轮，每轮独立启动 Playwright 进程。
- 每轮使用 `/tmp/sales-coach-e2e-full-N/test.sqlite`。
- 成功轮次清理临时数据库；失败轮次保留数据库、trace 和错误上下文。
- Artifact 包含每轮完整日志和测试结果目录。

## Linux 结果

最终 Linux full E2E Run：[44348096616](https://github.com/Lauren-coder66/sellsman-coach/actions/runs/44348096616)，Job `134955922204`，提交 `f861a3d4da9ea574b7412cd0cbaa96183c689d4a`，结果成功。

三轮完整 E2E 均使用 workers=2，每轮执行 12 个测试，全部通过，共 36/36 通过：

| 轮次 | 退出码 | 通过/失败 | 数据库身份 | SQLite 计数 | 事务日志 | Artifact |
|---|---:|---|---|---|---|---|
| 1 | 0 | 12/12 通过 | `/tmp/sales-coach-e2e-full-1/test.sqlite` | 未发生 customer count 异常 | 未发生失败事务 | [full artifact](https://github.com/Lauren-coder66/sellsman-coach/actions/runs/44348096616/artifacts/14446214703) |
| 2 | 0 | 12/12 通过 | `/tmp/sales-coach-e2e-full-2/test.sqlite` | 未发生 customer count 异常 | 未发生失败事务 | [full artifact](https://github.com/Lauren-coder66/sellsman-coach/actions/runs/44348096616/artifacts/14446214703) |
| 3 | 0 | 12/12 通过 | `/tmp/sales-coach-e2e-full-3/test.sqlite` | 未发生 customer count 异常 | 未发生失败事务 | [full artifact](https://github.com/Lauren-coder66/sellsman-coach/actions/runs/44348096616/artifacts/14446214703) |

对应 Verify Run：[44348096346](https://github.com/Lauren-coder66/sellsman-coach/actions/runs/44348096346)，Job `134955913836`，结果成功。Vitest 为 51/51，Playwright 为 12/12；TypeScript、ESLint、production build、Docker build、Compose 健康检查、迁移、备份恢复和容器重启均通过。容器 artifact：[linux-container-smoke](https://github.com/Lauren-coder66/sellsman-coach/actions/runs/44348096346/artifacts/14447701418)。

## 后续提交验证

报告更新提交 `9daa2ab4788062e7f3c3f16533020b3324949f5c` 的后续 CI 也已完成，两个 workflow 实际执行的提交 SHA 均为该 SHA。

- Verify Run：[44350197100](https://github.com/Lauren-coder66/sellsman-coach/actions/runs/44350197100)，Job `134963413213`，结果 success。
  - TypeScript：通过。
  - ESLint：通过。
  - Vitest：18 个测试文件、51/51 通过。
  - Playwright：12/12 通过。
  - Production build：通过。
  - Docker build：通过。
  - Container smoke：通过 HTTPS/健康检查、非 root、只读文件系统、迁移、备份、容器重启、容器重建后数据保持、恢复和运行指标检查。
- Linux full E2E Run：[44350197087](https://github.com/Lauren-coder66/sellsman-coach/actions/runs/44350197087)，Job `134963411255`，结果 success。
  - 日志确认三轮均执行完整 `npm run test:e2e`，每轮 `Running 12 tests using 2 workers`，每轮 12/12 通过。
  - 三轮数据库分别为 `/tmp/sales-coach-e2e-full-1/test.sqlite`、`/tmp/sales-coach-e2e-full-2/test.sqlite`、`/tmp/sales-coach-e2e-full-3/test.sqlite`，服务端 realpath、dev/inode 与各轮路径一致。
  - 日志包含 `send-reply-transaction messageChanges=1`、`send-reply-committed ok=true` 和恢复测试的 customer count 2；未出现 SQLite 并发错误或 customer count 异常。

## 根因判断

完整 E2E 三轮未复现原始 customer count 由 2 变 1 的故障。重点结论：

1. 完整 E2E 三轮均通过，未复现 customer count 异常。
2. `workers=2` 未引入可观察异常。
3. 三轮使用独立 SQLite 路径，未发现测试之间的数据干扰。
4. 未发现 SQLite 并发读写错误。
5. 本次没有异常环节可定位。
6. 没有证据支持修改业务逻辑。

原始发布候选的完整验收是 Run `44348096616` / Verify Run `44348096346`，后续报告更新提交的验证是 Run `44350197087` / Verify Run `44350197100`。两者均成功，但后续验证不替代原始三轮 36/36 记录。

旧的 `linux-diagnostic.yml` 未因本次分支推送触发；本次仅触发了 Verify 和 Linux full E2E diagnostic。

## 当前已知基线

单项恢复测试在 Linux 五次复测中均通过：POST 200、`alreadySaved=false`、GET 包含 sequence 2 客户消息，SQLite 原连接与重开连接均为 customer count 2，事务 `messageChanges=1` 且提交成功。该结果不能替代完整 E2E 并发诊断。
