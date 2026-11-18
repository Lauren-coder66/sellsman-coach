# 技术决策记录

## Phase 2.2

- 沿用 AIProvider、评分租约与会话归属。只在上游请求适配层区分北京百炼和 OpenRouter；Mock 保持独立。
- 北京百炼首选 `enable_thinking=false` 和 Chat Completions JSON Object 模式。应用继续使用 Zod 检查必填字段、范围和数据库证据。JSON Object 模式不等同于模型端强制 JSON Schema。
- Report 使用 1400 输出 Token 上限。画像和开场白仍顺序执行，对话和报告继续沿用统一超时、有限重试及日志。
- 百炼接口固定为北京官方端点，HTTP 请求拒绝重定向。密钥只由服务端读取。服务商未返回费用则记未知。
- 真实验收与 Mock 回归分离。测试账户免费额度和用完即停需要在控制台确认。

参考 [百炼 Chat Completions](https://help.aliyun.com/zh/model-studio/qwen-api-via-openai-chat-completions) 和 [结构化输出](https://help.aliyun.com/zh/model-studio/qwen-structured-output)。
