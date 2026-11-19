# Phase 3.10 候选提交与 Linux CI 验收

日期：2026-11-19。候选分支：`candidate/text-v1-9c97d5c`。基准 SHA：`9c97d5c282b2d4c55d3a54305ce5b85e9272e109`。功能候选提交：`a856a4a49d4a50c1a4e6293f1da285f613516d3f`，已普通推送至 `origin/candidate/text-v1-9c97d5c`。main 仍为 `2b8b170a109c4d6a47fbfd1f0abe8cdf4dcbed6c`，release 仍为基准 SHA；未合并、未部署公网。

## 提交范围与本地验收

提交包含 Phase 3.2–3.8 的产品、迁移、测试和发布文档，以及 Phase 3.9 审核报告，共 38 个文件。提交前逐项暂存；`git diff --cached --check` 无错误，未暂存/未跟踪文件为零。暂存文件不含 `.env.local`、SQLite 数据库、测试产物或实值密钥；原始 `e2e/api-stability.spec.ts` SQLite 客户消息数量断言仍为 2。

本地在 Mock 与隔离数据库执行：`npm test` 57/57、`npm run test:e2e -- --workers=2` 14/14、`npx tsc --noEmit --incremental false`、`npm run lint`、`npm run build` 均通过。本轮未调用真实百炼。

依赖审计：`npm audit` 为 11 个中危、0 高危/严重；`npm audit --omit=dev` 为 4 个中危；`npm audit --prefix deploy/runtime --omit=dev` 为 0。主锁文件的 omit 结果仍包含构建工具链，最终镜像使用独立运行时依赖清单；本轮未升级依赖。Linux Verify 运行的 runtime audit 设置 `--audit-level=high`，其绿色结果本身不等于“零中危”，应与上述数字分开理解。

## GitHub-hosted Linux Verify

- [Verify Run 44489347718](https://github.com/Lauren-coder66/sellsman-coach/actions/runs/44489347718)，Job `135440709637`，执行 SHA **`a856a4a49d4a50c1a4e6293f1da285f613516d3f`**，结论 success。
- GitHub Jobs API 的步骤状态显示：`npm ci`、运行时检查、运行时审计、ESLint、Vitest、Playwright、TypeScript、Next.js production build、production smoke、quota smoke、Docker build、Container smoke、Artifact 上传均 success。Linux Job 日志实际记录 Vitest 57/57、Playwright 14/14；容器日志记录健康检查、迁移、重启和重建持久化、在线备份及恢复均 PASS。
- [容器证据 Artifact 14511704187](https://github.com/Lauren-coder66/sellsman-coach/actions/runs/44489347718/artifacts/14511704187) 名称为 `linux-container-smoke-a856a4a49d4a50c1a4e6293f1da285f613516d3f`。已确认上传成功；本报告写入时未逐行读取 ZIP 中的日志，故容器细项依据 Container smoke 步骤成功及脚本检查，不声称人工逐行复核了 Artifact。
- `deploy/container-smoke.sh` 成功退出必须完成：Compose 启动及健康检查、本机 CA HTTPS 重定向、非 root 与只读文件系统、容器内迁移计数、会话创建、在线 SQLite 备份、应用重启与容器重建后的会话读取、恢复到新 SQLite 文件并核对原会话、运维指标采集。该脚本使用独立临时环境和 `AI_MODE=mock`，结束时删除自己的测试卷；不触碰正式数据库。CI success 证明该脚本在该 Runner 上退出 0，但不是公网证书或真实外部备份验收。

## 报告提交与最终 SHA

本报告作为单独的文档提交 `788a2b381c1c4b2acf540deb516710862506e421` 已普通推送，并触发 [Verify Run 44490706477](https://github.com/Lauren-coder66/sellsman-coach/actions/runs/44490706477)，Job `135445283137`。Jobs API 确认执行 SHA 与该提交一致，结论 **failure**。Linux `npm ci`、运行时审计、ESLint、Vitest 57/57 通过；Playwright 14 项中 13 通过、1 失败：`e2e/history-pagination.spec.ts:20` 的创建会话响应预期 201、实际 500。服务端同轮记录 `[api-error] SqliteError`，没有打印 SQLite 错误码或具体 SQL，故尚不能确认根因。TypeScript、正式构建、Docker build、Container smoke 等后续步骤均 **skipped**；该 Run 没有 Artifact。不得将功能提交的成功结果视为最终提交的验收结果。

## 仍未解决

真实百炼免费额度及账单、真实邮件投递、公网 HTTPS、异机备份、法律运营资料均未验收；本次没有购买资源或开放注册。结论只针对独立候选的代码与 Linux Mock 容器验收。

**结论：NO-GO。** 功能候选 SHA 曾在 Linux 完整通过，但最终报告提交 SHA 的 Playwright 发生一次 SQLite 相关 500。当前证据只能将故障定位至并发 E2E 中创建会话的服务端数据库操作；具体 SQLite 错误码、失败的插入语句及是否为锁竞争尚未记录。应使用隔离数据库针对该用例与并发组合采集安全诊断日志，确认根因后修复并在最终准确 SHA 重跑完整 Verify。没有改动断言或跳过失败用例；不开放注册、不部署公网。
