# Phase 3.12：SQLite 500 故障诊断完善

日期：2026-11-19。候选 worktree：`D:\Desktop\销售训练助手-candidate-text-v1-9c97d5c`；分支 `candidate/text-v1-9c97d5c`；基准 HEAD `788a2b381c1c4b2acf540deb516710862506e421`。本轮未提交、推送、切换分支或部署。

## 修改范围

- `src/lib/e2e-diagnostics.ts`（新增）：非生产 E2E 开关、UUID 请求关联、安全错误字段白名单和结构化日志。
- `src/app/api/sessions/route.ts`：将创建训练的数据库操作分段，并在异常时用同一 correlationId 记录阶段、进程 PID、连接状态、错误类别及 SQLite code/errno。
- `src/lib/auth/session.ts`：给创建训练所用的 owner 获取链增加可选的诊断阶段回调；其他调用者不传回调，结果保持不变。
- `src/lib/auth/accounts.ts`：Better Auth 初始化失败时记录构建、迁移计划、迁移执行或附加表/触发器阶段；成功时记 ready。
- `src/lib/db/index.ts`：数据库模块初始化时记录父目录、打开连接、PRAGMA、迁移、Drizzle 创建及连接就绪阶段。失败时仍原样抛出异常；日志不含数据库路径。
- `src/lib/api.ts`：原有通用错误日志改为白名单错误类别，避免自定义 error.name 携带敏感文本。
- `e2e/history-pagination.spec.ts`：每次创建发送 UUID 诊断请求头，保留 201 断言与 21 条分页验证；失败消息显示创建 index、worker、repeat index、correlationId、HTTP 状态和安全错误代码。
- `tests/e2e-diagnostics.test.ts`（新增）：校验 UUID 接受范围、生产禁用、错误字段脱敏及客户端/服务端关联 ID 一致性。
- 本报告（新增）。既有 `PHASE_3_10_CI_REPORT.md` 和 `PHASE_3_11_DIAGNOSTIC.md` 保留，未覆盖。

## 覆盖点和可定位的操作

| 日志或 stage | 可定位的异常 |
| --- | --- |
| `db-init`: create-parent-directory、open-database、各 PRAGMA、run-drizzle-migrations、create-drizzle-connection、connection-ready/reused | 数据库模块加载时的文件目录、连接、配置、迁移或 ORM 初始化错误；此时 POST 尚未开始，故无请求 correlationId |
| `auth-init`: build-auth、plan-auth-migrations、run-auth-migrations、ensure-owner-schema、ready | Better Auth 首次初始化与迁移错误；并发等待同一初始化 Promise 的请求需结合 PID 和时间定位 |
| owner-init-before/after、owner-account-query、owner-anonymous-query、owner-cookie-read/create | 账号初始化、账号会话查询、匿名归属查询和 Cookie 操作 |
| idempotent-session-query、idempotent-focus-query、source-session-query | 创建前查重、专项关联和来源训练查询 |
| transaction-begin、owner-access-check、transaction-session-query、transaction-source-query | 事务进入、owner 权限和事务内二次检查 |
| training-sessions-insert、messages-insert、training-focus-insert、transaction-commit | 对应表的插入或事务提交；非专项训练不会执行 training-focus-insert |
| transaction-result-check、transaction-result-session-query/focus-query | 事务返回 false 后的幂等结果检查 |

服务端事件和阶段名固定，关联 ID 仅接受符合 UUID v4 格式的请求头。`sqliteCode` 只允许 `SQLITE_` 大写代码，`sqliteErrno` 只允许安全整数，`errorName` 仅允许 Error、TypeError、RangeError、SqliteError；其余为 Unknown。只有 `E2E_TEST=1` 且 `NODE_ENV` 不是 production 才输出上述诊断。生产环境忽略诊断请求头，不接受或记录用户自带的 ID。

## 仍存在的盲区

1. Next.js/WebServer 进程尚未加载应用模块时的启动失败、静态 import 求值失败、进程崩溃，无法由 POST 或数据库初始化的 catch 捕获；应查看 Playwright WebServer 和 Runner 启动日志。
2. Better Auth 内部若包装原始 SQLite 异常且不保留 code/errno，只能看到安全类别和初始化阶段。多个请求共用初始化 Promise，`auth-init` 日志不带某个请求的 correlationId。
3. 对于客户端网络失败、显式 400/404/409/422 或事务返回 false，没有异常日志；测试断言仍显示 HTTP 状态和响应错误代码。只有走 POST catch 的异常才能产生 session-create 日志。
4. 某些阶段包含一条以上内部操作（例如 owner-account-query 由 Better Auth 实现），并未记录 SQL 或参数；可以定位代码区间，但不能凭日志重建确切 SQL。
5. 原始失败的 SHA 不含本轮诊断，因此旧 Run `44490706477` 的 SQLite code/errno 仍未知。新诊断只有在未来准确 SHA 的 Linux Runner 执行且故障重现时才能验证实际定位能力。
6. `verify.yml` 已配置失败时上传 Playwright `test-results`，Playwright 已配置仅失败时保留 trace；若失败发生在测试启动前，可能没有 trace。仍须及时保存 Job 日志，以获取服务端诊断输出。

## 生产影响、数据与隐私

未修改 Schema、迁移语句、事务内容与执行顺序、额度、消息或报告逻辑；未增加 busy_timeout 或 HTTP 重试。`src/lib/auth/session.ts` 的可选回调不改变返回值；数据库目录创建仍发生于建立连接前。诊断字段不包含 SQL 参数、用户消息、画像、Cookie、邮件、密码、Token、密钥、数据库路径或原始异常文本。通用 `[api-error]` 现在也只记录白名单类别。生产模式下诊断请求头被忽略，诊断日志禁用。

## 本地测试证据

全部使用 Playwright 的独立临时 SQLite 和 `AI_MODE=mock`；正式构建另用独立系统临时 SQLite 路径。未调用真实百炼。

| 命令 | 实际结果 |
| --- | --- |
| `npx tsc --noEmit --incremental false` | 退出 0 |
| `npm run lint` | 退出 0 |
| `npm test` | 20 个测试文件、59/59 通过 |
| `npx playwright test e2e/history-pagination.spec.ts --workers=1` | 1/1 通过 |
| `npx playwright test e2e/history-pagination.spec.ts --workers=2` | 1/1 通过；仅一个用例，实际运行 1 worker |
| `npx playwright test e2e/history-pagination.spec.ts --workers=2 --repeat-each=2` | 2/2 通过，实际运行 2 workers |
| `npx playwright test e2e/api-stability.spec.ts --workers=2` | 2/2 通过；原始 SQLite customer count = 2 断言未改 |
| `npx playwright test e2e/history-pagination.spec.ts e2e/api-stability.spec.ts --workers=2`，最终代码 | 3/3 通过 |
| `npm run build` | 退出 0，Next.js 16.4.6 正式构建通过 |

上述分页测试没有出现 500，不能把通过结果当作原始 Linux 故障已修复。`git diff --check` 和最终 Git 状态见交付消息。本轮只改善诊断，仍无已确认根因。

## Linux 下一步

经人工审核后，将诊断提交到独立候选分支并在 GitHub-hosted Linux Runner 运行准确 SHA 的 E2E。若再次出现 500，在 Playwright 失败消息中取 correlationId、worker、repeat index 和创建序号；在服务端 `[session-create-diagnostic]` 中查同一 ID，读取 stage、pid、SQLite code/errno、连接状态；若只有 `[db-init-diagnostic]` 或 `[auth-init-diagnostic]`，检查模块/账号初始化日志及 Runner 时间线。及时保存失败 Job 日志和 E2E trace Artifact。确认根因后再决定最小业务修复。未经实际 Linux 执行，本报告不宣称 Linux 验收通过。

**结论：本地诊断完善完成；原始 SQLite 500 根因仍未确认，候选仍为 NO-GO。**
