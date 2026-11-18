import { z } from 'zod';

const asrURL = 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions';
const ttsURL = 'https://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation';
export const maxAudioBytes = 480044;
const transcription = z.object({ choices: z.array(z.object({ message: z.object({ content: z.string().trim().min(1).max(1000) }) })).min(1) });
const synthesis = z.object({ output: z.object({ audio: z.object({ url: z.string().url() }) }) });

export function wavDuration(input: Uint8Array) {
  const data = Buffer.from(input);
  if (data.length <= 44 || data.length > maxAudioBytes || data.toString('ascii', 0, 4) !== 'RIFF' ||
      data.toString('ascii', 8, 16) !== 'WAVEfmt ' || data.readUInt32LE(16) !== 16 ||
      data.readUInt16LE(20) !== 1 || data.readUInt16LE(22) !== 1 || data.readUInt32LE(24) !== 16000 ||
      data.readUInt32LE(28) !== 32000 || data.readUInt16LE(32) !== 2 || data.readUInt16LE(34) !== 16 ||
      data.toString('ascii', 36, 40) !== 'data' || data.readUInt32LE(40) !== data.length - 44 ||
      data.readUInt32LE(4) !== data.length - 8 || (data.length - 44) % 2) throw Error('无效音频格式');
  return (data.length - 44) / 32000;
}

async function upstream(url: string, key: string, body: object, signal?: AbortSignal) {
  const timeout = AbortSignal.timeout(12_000);
  const result = await fetch(url, {
    method: 'POST', redirect: 'error', signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!result.ok) throw Error(`语音服务暂不可用（${result.status}）`);
  return result.json();
}

export function safeAudioURL(address: string) {
  const url = new URL(address);
  if (url.protocol !== 'https:' || url.port || url.username || url.password ||
      !/^[a-z0-9-]+\.oss-cn-beijing\.aliyuncs\.com$/i.test(url.hostname)) {
    throw Error('语音服务返回了不受信任的音频地址');
  }
  return url.href;
}

export function bailianVoice(key: string) {
  return {
    async transcribe(audio: Uint8Array, signal?: AbortSignal) {
      wavDuration(audio);
      const data = `data:audio/wav;base64,${Buffer.from(audio).toString('base64')}`;
      const raw = await upstream(asrURL, key, {
        model: 'qwen3-asr-flash', stream: false, asr_options: { language: 'zh', enable_itn: false },
        messages: [{ role: 'user', content: [{ type: 'input_audio', input_audio: { data } }] }],
      }, signal);
      return transcription.parse(raw).choices[0].message.content;
    },
    async synthesize(text: string, signal?: AbortSignal) {
      const raw = await upstream(ttsURL, key, { model: 'qwen3-tts-flash', input: { text, voice: 'Cherry', language_type: 'Chinese' } }, signal);
      const audio = await fetch(safeAudioURL(synthesis.parse(raw).output.audio.url), {
        redirect: 'error', signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(8000)]) : AbortSignal.timeout(8000),
      });
      if (!audio.ok || !audio.body) throw Error('无法读取合成音频');
      return audio.body;
    },
  };
}
