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

运行时配置已写入项目。本机 Caddy 与私有测试 CA 的 TLS 已验证。Linux 镜像、Compose、公网 TLS、真实邮件投递、外部告警、异机备份与正式环境回滚仍需独立环境验证。

## 最终候选部署操作

在符合组织要求的 Linux 主机上安装 Docker Engine、Compose v2，以及 Git。容器演练使用独立主机或独立 Docker 环境。这里的 `sales.example.com` 需替换为实际域名。

```sh
git clone https://github.com/Lauren-coder66/sellsman-coach.git /srv/sales-coach/repo
cd /srv/sales-coach/repo
git checkout --detach '<通过 Verify 的完整 SHA>'
install -d -m 700 /srv/sales-coach/shared /srv/sales-coach/releases
test -e /srv/sales-coach/shared/.env.production || install -m 600 .env.production.example /srv/sales-coach/shared/.env.production
test -L .env.production || ln -s /srv/sales-coach/shared/.env.production .env.production
# 在安全编辑器中填入生产配置。BETTER_AUTH_URL 形如 https://sales.example.com。
# 生成随机认证密钥并保存到受限文件，不发送到共享日志。
docker compose --env-file .env.production config --quiet
sh deploy/release.sh build "$(git rev-parse HEAD)"
docker compose -p sales-coach --env-file .env.production ps
curl -fsSI http://sales.example.com/api/health
curl -fsS https://sales.example.com/api/health
docker compose -p sales-coach --env-file .env.production logs --since 10m app caddy
```

配置正式域、Resend 发件身份、账号密钥、百炼密钥和管理员邮箱。容器启动预检会拒绝缺失的必要配置。隔离回归以 `RELEASE_PROFILE=staging` 使用测试配置；正式 Compose 强制生产配置。预发布请先配置独立域名、邮箱和数据库卷，在真实收件箱验证链接，确认外部 TLS、账号流程、额度、导出和跨用户隔离，避免共用正式数据库。

自动发布只接受通过 Verify 的 main SHA。配置 GitHub `production` environment 和审批后，管理员在主机安装审阅过的 `deploy/host-release.sh` 到 `/usr/local/bin/sales-coach-release`，为专用服务账号配置强制命令公钥，并验证该账号只能触发发布。Docker 访问权限等同于可管理主机，应限制服务账号和部署主机的访问范围。配置 `DEPLOY_HOST`、`DEPLOY_USER`、`DEPLOY_KEY`、`DEPLOY_KNOWN_HOSTS`，后者应从可信渠道核对主机公钥。公钥示例：

```text
restrict,command="/usr/local/bin/sales-coach-release" ssh-ed25519 <部署公钥>
```

在 GitHub Actions 选择 **Production release → Run workflow**，传入完整 SHA，并由指定审核人确认。工作流不触发自动支付、DNS 或服务商账号变更。

在主机定时任务中显式指定发布目录与 Compose 项目。删除旧备份前核对保留期和异机副本。恢复应在故障演练环境启动独立应用，验证对应的认证密钥和真实业务数据一致性：

```sh
sh deploy/backup.sh
docker compose -p sales-coach --env-file .env.production exec -T app ls -l /var/backups/sales-coach/
backup_name='替换为列表中的实际 SQLite 文件名'
docker compose -p sales-coach --env-file .env.production cp "app:/var/backups/sales-coach/$backup_name" /path/to/protected/export.sqlite
docker compose -p sales-coach --env-file .env.production exec -T app node scripts/sqlite-copy.mjs restore "/var/backups/sales-coach/$backup_name" /var/lib/sales-coach/restored.sqlite
# 核验独立恢复库后，获准再在生产环境切换 DATABASE_URL。
# 回退前检查现有数据与旧镜像兼容，并保留最新备份。
sh deploy/release.sh rollback '<上次已验收的镜像标签>'
curl -fsS https://sales.example.com/api/health
```

每日从外部检查 HTTPS 健康、账号错误率、数据库卷可写及剩余磁盘空间、模型 429 和超时。运维提供商确认备份调度与失败告警，限制访问备份并定期演练异机恢复。验收界限及成本见[最终候选报告](RELEASE_REPORT.md)。

## Linux 预发布门槛

先在清空测试卷的独立 Linux 环境运行 Verify。当前工作流使用 Node 24、`npm ci`、类型检查、ESLint、Vitest、Playwright、正式构建和 Docker Compose 验收。GitHub 保留每步日志，另外上传 `linux-container-smoke-<SHA>` 记录容器验收结果。容器验收使用 Mock、私有 CA 和新卷，并检查迁移、非 root、卷读写边界、重启、重建及恢复。

```sh
npm ci
npm run lint && npm test
npx playwright install --with-deps chromium
npm run test:e2e && npx tsc --noEmit --incremental false
AI_MODE=mock DATABASE_URL="$(mktemp -d)/build.sqlite" npm run build
docker build -t sales-coach:ci .
sh deploy/container-smoke.sh
```

## Resend 生产邮件

使用专用发信子域，按 Resend 控制台提供的值配置 SPF 和 DKIM，等待域名验证通过。创建限定该域的 Sending access 密钥。生产 `.env.production` 填写 `AUTH_MAIL_TRANSPORT=resend`、`AUTH_MAIL_FROM` 和 `RESEND_API_KEY`。验证找回密码和注册链接直接返回当前环境的 HTTPS Origin，并关闭账号验证和重置邮件的点击追踪，避免改写令牌链接。测试邮箱只允许隔离 staging 或显式浏览器回归。预发布须在实际收件箱验证投递、退信和限流。 [Resend 已验证域](https://resend.com/docs/dashboard/domains/introduction) · [发信权限](https://resend.com/changelog/new-api-key-permissions)

## R2 或 S3 异地备份

R2 使用 S3 兼容接口，配置区域 `auto` 和专用账户端点。S3 使用 AWS 区域与默认服务端加密，可结合组织已有 IAM 和 KMS。使用任何一方前都要确认私有桶、数据地域、取回成本和传输路径。初期选择已有账户且能完成独立恢复演练的一方。 [R2 S3 接口](https://developers.cloudflare.com/r2/api/s3/api/) · [S3 默认加密](https://docs.aws.amazon.com/AmazonS3/latest/userguide/default-encryption-faq.html)

将运维环境保存在主机共享目录，例如 `/srv/sales-coach/shared/.env.ops`，权限为 600。凭据由命令单独传入备份或监控进程。使用独立私有桶和环境前缀，备份凭据仅需写入、回读对应备份。管理员另行配置生命周期规则。以下为可填模板：

```sh
BACKUP_PROVIDER=r2
BACKUP_BUCKET=replace-with-private-bucket
BACKUP_ENDPOINT=https://REPLACE_WITH_ACCOUNT_ID.r2.cloudflarestorage.com
# AWS S3 时用 BACKUP_PROVIDER=s3 和 BACKUP_REGION=ap-southeast-1，并移除 BACKUP_ENDPOINT。
BACKUP_PREFIX=sales-coach/staging/
BACKUP_KEEP_DAYS=30
AWS_ACCESS_KEY_ID=
AWS_SECRET_ACCESS_KEY=
# 使用 AWS 临时凭证时填 AWS_SESSION_TOKEN。
OPS_OFFSITE_REQUIRED=1
OPS_ALERT_URL=''
```

先生成生命周期规则，审阅后由存储管理员在对应平台配置。使用具备读取生命周期权限的独立配置执行 `sh deploy/offsite.sh check-retention`，确认规则 ID、前缀和保留天数生效。规则仅覆盖选定前缀，默认保留 30 天。若从 CLI 更新生命周期，先合并已有规则，避免整份覆盖同桶规则。日常备份凭据无需删除对象或修改生命周期。 [R2 生命周期](https://developers.cloudflare.com/r2/buckets/object-lifecycles/) · [S3 生命周期](https://docs.aws.amazon.com/AmazonS3/latest/userguide/object-lifecycle-mgmt.html)

```sh
export OPS_ENV_FILE=/srv/sales-coach/shared/.env.ops
sh deploy/offsite.sh lifecycle
sh deploy/backup.sh
sh deploy/offsite.sh backup
sh deploy/offsite.sh restore '替换为成功上传输出的对象键' /var/lib/sales-coach/restore-drill.sqlite
sh deploy/monitor.sh
```

每日通过主机调度器先做本地在线备份，再做异地备份。远程快照上传后立即回读，对照本地 SHA-256，再做 SQLite 完整性和外键校验，三项通过才更新最后验证时间。上传拒绝覆盖，恢复只能写入新文件。演练时用恢复库启动隔离实例并核对账号、训练和报告，确认后才申请切换。恢复涉及已删除用户时，按运营方审定的保留及删除流程核对。

## 监控与故障处理

- 外部探针请求 `https://实际域名/api/health`，在应用、代理或整机掉线时独立告警。
- 主机每 15 分钟运行 `sh deploy/monitor.sh`，保留汇总 JSON 和退出状态。监控读取 Caddy 过去一小时的 API 状态码及 SQLite 的文字模型调用账本，提供 5xx、429、成功率、平均耗时、已知 Token、未知用量、库与 WAL 大小、可用磁盘、异地备份状态、邮件失败和系统异常。无样本指标显示空值。
- 监控和备份可向 `OPS_ALERT_URL` 指定的 HTTPS 接收端发送固定事件代码。接收端需支持 JSON，请在预发布测试投递与去重。调度器监控非零退出和定时任务缺失，以覆盖 Docker 不可用的情况。
- Caddy API 访问日志仅保留操作指标，移除全部请求信息和响应头。日志轮转可能缩短一小时统计窗口。日志归集不得添加邮箱、会话标识、令牌或对话内容。
