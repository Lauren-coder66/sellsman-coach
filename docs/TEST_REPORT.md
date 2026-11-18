# 阶段测试报告

## 既有 Phase 2.2

- 本地恢复点重跑 Vitest 33/33。此前已通过 TypeScript、ESLint、Mock Playwright 9/9 和正式构建。
- 之前的 OpenRouter A/B/C 均在 3000 输出 Token 截断，之后返回 429；0 份失败报告落库。3 次有用量的调用输入 3362、输出 9000，返回费用 USD 0。3 次限流调用用量与费用未知。

## 北京百炼

- 本地配置核对通过：real / bailian / qwen3.7-flash / 北京 Chat Completions / sequential / 45000 ms。密钥存在且未跟踪。
- 本轮本地回归：`npx tsc --noEmit --incremental false`、`npm run lint`、`npm test`（34/34）、`npm run test:e2e`（9/9）、`npm run build` 全部通过。生产构建和浏览器测试使用独立数据库。
- 模拟上游验证百炼的请求参数、JSON 模式、拒绝重定向，以及向非北京端点发送百炼请求前拒绝配置。
- 单次最小请求脚本和真实 A/B/C 测试脚本已准备；脚本语法校验通过。未确认免费额度时，最小请求脚本本地拒绝执行，没有向上游发出请求。
- 等待额度确认期间，最小真实请求、A/B/C、真实引用与评分差异均未验收。百炼本阶段真实用量 0 Token，未发生调用费用。
