import { z } from 'zod';
import { accountOwner, getAccountSession, getOwnedSession } from '@/lib/auth/session';
import { failure, handleError, success } from '@/lib/api';
import { bailianVoice, maxAudioBytes, wavDuration } from '@/lib/voice/bailian';
import { beginVoice, claimSynthesis, endVoice, storeVoiceTranscript, VoiceConflictError } from '@/lib/voice/turn';
import { sendMessage } from '@/lib/training-service';
import { planFor } from '@/lib/usage';

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const session = await getOwnedSession(id);
    if (!session) return failure('NOT_FOUND', '训练不存在', 404);
    const account = await getAccountSession();
    return success({ enabled: Boolean(session.status === 'active' && process.env.VOICE_BAILIAN_API_KEY && account?.user.emailVerified &&
      planFor(accountOwner(account.user.id), Date.now()).voiceMinutes > 0) });
  } catch (error) { return handleError(error); }
}

async function readAudio(body: ReadableStream<Uint8Array>) {
  const reader = body.getReader();
  let bytes = 0;
  const chunks: Uint8Array[] = [];
  try {
    while (true) {
      const result = await reader.read();
      if (result.done) break;
      bytes += result.value.length;
      if (bytes > maxAudioBytes) throw Error('音频过长');
      chunks.push(result.value);
    }
    return Buffer.concat(chunks);
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const account = await getAccountSession();
    if (!account?.user.emailVerified || !await getOwnedSession(id)) return failure('NOT_FOUND', '训练不存在', 404);
    const secret = process.env.VOICE_BAILIAN_API_KEY;
    if (!secret) return failure('VOICE_DISABLED', '尚未启用语音服务', 503);
    const key = z.uuid().safeParse(request.headers.get('x-request-id'));
    if (!key.success || request.headers.get('content-type') !== 'audio/wav' || !request.body) {
      return failure('INVALID_AUDIO', '录音格式不正确', 422);
    }
    let audio: Buffer;
    let seconds: number;
    try { audio = await readAudio(request.body); seconds = Math.ceil(wavDuration(audio)); }
    catch { return failure('INVALID_AUDIO', '录音格式不正确或超过 15 秒', 422); }
    const owner = accountOwner(account.user.id);
    const voice = bailianVoice(secret);
    const attempt = beginVoice(key.data, owner, id, seconds);
    let text = attempt.transcript;
    if (!text) {
      try { text = await voice.transcribe(audio, request.signal); storeVoiceTranscript(key.data, text); }
      catch { endVoice(key.data, 'asr-failed'); return failure('ASR_FAILED', '语音未能识别，请重录', 502); }
    }
    const result = await sendMessage(id, owner, text, key.data);
    if (!result.ok) {
      endVoice(key.data, 'reply-failed');
      return failure(result.code, result.message, result.status);
    }
    if (!claimSynthesis(key.data)) return new Response(null, { status: 204, headers: { 'Cache-Control': 'no-store' } });
    try {
      const audioStream = await voice.synthesize([...result.data.reply].slice(0, 180).join(''), request.signal);
      endVoice(key.data, 'ok');
      return new Response(audioStream, { headers: { 'Content-Type': 'audio/wav', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } });
    } catch {
      endVoice(key.data, 'tts-failed');
      return failure('TTS_FAILED', '对话文字已保存，语音播放暂不可用', 502);
    }
  } catch (error) {
    if (error instanceof VoiceConflictError) return failure('VOICE_CONFLICT', error.message, 409);
    return handleError(error);
  }
}
