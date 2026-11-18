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

待执行。需要记录 Run ID、Job ID、每轮退出码、测试总数、失败用例及 artifact 地址。

| 轮次 | 退出码 | 通过/失败 | 数据库身份 | SQLite 计数 | 事务日志 | Artifact |
|---|---:|---|---|---|---|---|
| 1 | 待填 | 待填 | 待填 | 待填 | 待填 | 待填 |
| 2 | 待填 | 待填 | 待填 | 待填 | 待填 | 待填 |
| 3 | 待填 | 待填 | 待填 | 待填 | 待填 | 待填 |

## 根因判断

待完整 E2E 三轮结果。重点回答：

1. 完整 E2E 是否稳定复现 customer count 由 2 变 1。
2. `workers=2` 是否引入异常。
3. 测试之间是否共享或污染 SQLite 文件。
4. 是否存在 SQLite 并发读写问题。
5. 异常发生在 POST、GET、事务提交还是测试查询阶段。
6. 是否有证据支持修改业务逻辑。

## 当前已知基线

单项恢复测试在 Linux 五次复测中均通过：POST 200、`alreadySaved=false`、GET 包含 sequence 2 客户消息，SQLite 原连接与重开连接均为 customer count 2，事务 `messageChanges=1` 且提交成功。该结果不能替代完整 E2E 并发诊断。
