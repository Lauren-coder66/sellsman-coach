import { sqlite } from '@/lib/db';
import { planFor } from '@/lib/usage';
import { AIQuotaError } from '@/lib/ai/usage-context';

export class VoiceConflictError extends Error {}
type Attempt = { owner_id: string; session_id: string; transcript: string | null };

export function beginVoice(id: string, owner: string, session: string, seconds: number) {
  return sqlite.transaction(() => {
    const existing = sqlite.prepare('SELECT owner_id,session_id,transcript FROM voice_attempts WHERE id=?').get(id) as Attempt | undefined;
    if (existing) {
      if (existing.owner_id !== owner || existing.session_id !== session || !existing.transcript) {
        throw new VoiceConflictError('该录音已提交或未能识别，请等待结果或重新录音。');
      }
      return { transcript: existing.transcript };
    }
    if (!sqlite.prepare("SELECT 1 FROM training_sessions WHERE id=? AND owner_id=? AND status='active'").get(session, owner)) {
      throw new VoiceConflictError('当前训练无法继续录音。');
    }
    const latest = sqlite.prepare('SELECT role FROM messages WHERE session_id=? ORDER BY sequence DESC LIMIT 1').get(session) as {role: string} | undefined;
    if (latest?.role === 'user') {
      throw new VoiceConflictError('请先在文字训练页恢复上一条未完成的回复。');
    }
    const now = Date.now();
    if (sqlite.prepare('SELECT 1 FROM voice_attempts WHERE owner_id=? AND ended_at IS NULL AND started_at>?').get(owner, now - 90_000)) {
      throw new VoiceConflictError('已有语音请求正在处理。');
    }
    const date = new Date(now);
    const start = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
    const duration = (who?: string) => (sqlite.prepare(`SELECT coalesce(sum(reserved_tokens),0) n FROM ai_usage
      WHERE operation='voice-turn' AND started_at>=? ${who ? 'AND owner_id=?' : ''}`).get(...(who ? [start, who] : [start])) as { n: number }).n;
    const allowance = planFor(owner, now).voiceMinutes * 60;
    if (!allowance || duration(owner) + seconds > allowance || duration() + seconds > 3600) throw new AIQuotaError('语音时长已达上限或当前套餐不包含语音。');
    sqlite.prepare('INSERT INTO voice_attempts (id,owner_id,session_id,started_at,seconds) VALUES (?,?,?,?,?)')
      .run(id, owner, session, now, seconds);
    sqlite.prepare("INSERT INTO ai_usage (id,owner_id,model,provider,operation,started_at,completed_at,reserved_tokens,tokens,outcome) VALUES(?,?,?,'bailian','voice-turn',?,?,?,0,'pending')")
      .run('voice:' + id, owner, 'qwen3-asr-flash + qwen3-tts-flash', now, now, seconds);
    return { transcript: null };
  }).immediate();
}

export function storeVoiceTranscript(id: string, transcript: string) {
  const result = sqlite.prepare('UPDATE voice_attempts SET transcript=? WHERE id=? AND transcript IS NULL AND ended_at IS NULL').run(transcript, id);
  if (!result.changes) throw new VoiceConflictError('训练已结束或不可用。');
}

export function claimSynthesis(id: string) {
  return sqlite.prepare(`UPDATE ai_usage SET outcome='synthesizing'
    WHERE id=? AND outcome='pending' AND EXISTS (SELECT 1 FROM voice_attempts WHERE id=? AND ended_at IS NULL)`)
    .run('voice:' + id, id).changes > 0;
}

export function endVoice(id: string, outcome: string) {
  sqlite.prepare('UPDATE voice_attempts SET ended_at=coalesce(ended_at,?) WHERE id=?').run(Date.now(), id);
  sqlite.prepare("UPDATE ai_usage SET outcome=? WHERE id=? AND operation='voice-turn'").run(outcome, 'voice:' + id);
}
