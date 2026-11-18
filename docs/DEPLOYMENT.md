# 部署与运维记录

当前尚未部署公开环境。默认准备单机 Linux、Docker Compose、Caddy HTTPS 和持久化 SQLite。应用端口留在容器网络内，只让 Caddy 对外接受 HTTPS。独立运行时依赖锁与构建版本一致，避免测试工具进入运行镜像。

## 本地

安装项目锁定依赖后，配置独立测试库。普通回归使用 Mock；真实验收使用已验证的北京百炼配置和测试语料。环境变量参考项目根目录的 `.env.production.example`；该文件仅为模板。密钥由服务端运行环境注入。SQLite 默认在项目的数据目录，真实测试通过 `DATABASE_URL` 使用独立绝对路径。

## 本地生产演练

用 24.x Node.js。设置 `AI_MODE=mock` 并将 `DATABASE_URL` 指向独立测试文件后执行 `npm run build`，再执行 `node scripts/production-smoke.mjs`。脚本单独使用临时数据库，验证健康、写入、重启、在线备份、异路径恢复和拒绝覆盖。

## 主机与发布

1. 复制 `.env.production.example` 成权限收紧的 `.env.production`。填写公开域名、HTTPS 账号 URL、随机账号密钥、邮件发件身份、邮件服务密钥与已授权的百炼密钥。确认 `BETTER_AUTH_URL` 与外部 HTTPS Origin 一致。不要公开 3000 端口，也不要设置不受信任的上游代理链。
2. 初始化持久化卷，校验卷权限和磁盘空间。数据库必须在持久化目录。启动时应用 Drizzle 迁移及 Better Auth 迁移。
3. 在获准的隔离环境运行 `sh deploy/release.sh build <commit-tag>`。检查 Compose 健康、TLS、邮件验证、重启、账单和应用级回归。GitHub Actions 包含自动化回归与容器健康检查，外部发布触发独立。
4. 配置监控探针访问 `/api/health`。使用账号管理员视图查看按服务商、模型分组的调用和失败，使用容器日志看延迟及错误。用主机监控记录磁盘、内存、CPU、证书和备份时间戳。费用缺失时留为未知。告警和外部日志归集需在真实环境启用并验证。

## 备份与回滚

- 在目标主机测试 `sh deploy/backup.sh` 后，用系统调度器每日运行并记录退出状态。在线备份使用 SQLite Backup API，并验证完整性和外键。备份卷与数据库卷分离，还需定期复制到访问受限的异机存储。
- 恢复先运行 `node scripts/sqlite-copy.mjs restore <backup.sqlite> <new.sqlite>`。工具拒绝覆盖，保留旧文件和 WAL。应用通过新的 `DATABASE_URL` 启动，核验账号、数据和迁移后才切换。生产切换需获准。
- 兼容迁移时用 `sh deploy/release.sh rollback <previous-tag>` 回退应用镜像。遇到不兼容迁移须先在隔离库实际恢复，再协调停机切换，防止丢失新写入。未经验证的发布禁止依赖自动破坏性回滚。
- 单机 SQLite 适合初期单写入节点。多实例或高并发写入需求需要重新验证或迁移到 PostgreSQL。

运行时配置已写入项目。实际 Linux 镜像、Compose、TLS、邮件投递、外部告警、异机备份与正式环境回滚都需要独立环境验证。
