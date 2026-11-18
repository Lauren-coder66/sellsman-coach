# 技术决策记录

## Phase 2.2

- 沿用 AIProvider、评分租约与会话归属。只在上游请求适配层区分北京百炼和 OpenRouter；Mock 保持独立。
- 北京百炼首选 `enable_thinking=false` 和 Chat Completions JSON Object 模式。应用继续使用 Zod 检查必填字段、范围和数据库证据。JSON Object 模式不等同于模型端强制 JSON Schema。
- Report 使用 1400 输出 Token 上限。画像和开场白仍顺序执行，对话和报告继续沿用统一超时、有限重试及日志。
- 百炼接口固定为北京官方端点，HTTP 请求拒绝重定向。密钥只由服务端读取。服务商未返回费用则记未知。
- 真实验收与 Mock 回归分离。测试账户免费额度和用完即停需要在控制台确认。

参考 [百炼 Chat Completions](https://help.aliyun.com/zh/model-studio/qwen-api-via-openai-chat-completions) 和 [结构化输出](https://help.aliyun.com/zh/model-studio/qwen-structured-output)。

## Phase 2.3

- 百炼评分请求只让模型选择服务器给出的销售证据编号。编号经过枚举校验，服务端从存储的销售消息回填 ID 和原句，再执行原有的引用校验。模型不能提交自写的引用文本。
- 难度影响客户愿意推进的条件和需要的证据。一轮聚焦一个问题；相邻的逐字重复最多重试一次，共用原超时。
- [固定语料](../tests/fixtures/sales-quality-v1.json)由合成对话组成，用于比较行为、来源与失败条件。评分趋势要结合提示词版本和样本分布解释。

## Phase 3 候选方案（文档调研）

| 方案 | 适用性与待测事项 |
| --- | --- |
| 百炼实时语音 | 北京地域支持 WebRTC / WebSocket，服务端可检测轮次和打断。需实测中文业务词、首音延迟、凭据隔离及实际账单。[实时接口](https://help.aliyun.com/zh/model-studio/realtime-api-overview) |
| 独立 STT + 现有模型 + TTS | 分段控制转写和音频，能复用现有会话数据；应用须自行协调三段流、取消播放和中断处理，并分别计算费用。[识别事件](https://help.aliyun.com/zh/model-studio/paraformer-client-events) · [合成接口](https://help.aliyun.com/zh/model-studio/cosyvoice-websocket-api) |
| OpenAI Realtime | 浏览器可用 WebRTC，须核对目标地区可用性、成本和数据处理边界。[WebRTC 指南](https://developers.openai.com/api/docs/guides/voice-webrtc?voice-api=realtime) |

优先用百炼实时接口做中文短流程实测，独立 STT/TTS 作为需要更多转写控制时的候选。Windows Chrome/Edge 兼容性、中文识别率、P50/P95、打断、回声、每分钟费用和音频保留策略都需要实测。当前未调用任何语音服务。
