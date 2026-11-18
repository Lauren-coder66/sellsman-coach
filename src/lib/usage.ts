import { randomUUID } from 'node:crypto';
import { sqlite } from '@/lib/db';
import { AIQuotaError } from '@/lib/ai/usage-context';
import { activePlan, plans } from '@/lib/plans';

const systemDay = 1_000_000;
const concurrency = { owner: 1, system: 4 };

export function planFor(owner: string, now: number) {
  const record = sqlite.prepare('SELECT plan,state,valid_until AS validUntil FROM subscriptions WHERE owner_id=?')
    .get(owner) as { plan: string; state: string; validUntil: number } | undefined;
  const id = activePlan(record, now);
  return { id, ...plans[id] };
}

export function reserveUsage(owner: string, provider: string, model: string, operation: string, tokens: number) {
  const now = Date.now();
  const utc = new Date(now);
  const day = Date.UTC(utc.getUTCFullYear(), utc.getUTCMonth(), utc.getUTCDate());
  const month = Date.UTC(utc.getUTCFullYear(), utc.getUTCMonth());
  const activeAfter = now - 90_000;
  const id = randomUUID();
  sqlite.transaction(() => {
    const tokenLimits = planFor(owner, now);
    const count = (sql: string, ...args: (number | string)[]) => (sqlite.prepare(sql).get(...args) as { n: number }).n;
    const pending = 'completed_at IS NULL AND started_at > ?';
    if (count(`SELECT count(*) n FROM ai_usage WHERE owner_id=? AND ${pending}`, owner, activeAfter) >= concurrency.owner ||
        count(`SELECT count(*) n FROM ai_usage WHERE ${pending}`, activeAfter) >= concurrency.system) {
      throw new AIQuotaError('模型请求正在处理，请稍后再试。');
    }
    const minute = now - 60_000;
    if (count('SELECT count(*) n FROM ai_usage WHERE owner_id=? AND started_at>?', owner, minute) >= 24 ||
        count('SELECT count(*) n FROM ai_usage WHERE started_at>?', minute) >= 90) {
      throw new AIQuotaError('请求太频繁，请稍后再试。');
    }
    const sum = 'SELECT coalesce(sum(coalesce(tokens,reserved_tokens)),0) n FROM ai_usage';
    if (count(`${sum} WHERE owner_id=? AND started_at>=?`, owner, day) + tokens > tokenLimits.day ||
        count(`${sum} WHERE owner_id=? AND started_at>=?`, owner, month) + tokens > tokenLimits.month ||
        count(`${sum} WHERE started_at>=?`, day) + tokens > systemDay) throw new AIQuotaError();
    sqlite.prepare('INSERT INTO ai_usage (id,owner_id,provider,model,operation,started_at,reserved_tokens) VALUES (?,?,?,?,?,?,?)')
      .run(id, owner, provider, model, operation, now, tokens);
  }).immediate();
  return id;
}

export function closeUsage(id: string, result: {
  model: string | null; promptTokens?: number; completionTokens?: number; totalTokens?: number; cost?: number; outcome: string;
}) {
  const { promptTokens, completionTokens, totalTokens, cost, outcome } = result;
  const tokens = totalTokens ?? (promptTokens !== undefined && completionTokens !== undefined ? promptTokens + completionTokens : null);
  sqlite.prepare('UPDATE ai_usage SET completed_at=?, model=coalesce(?,model), prompt_tokens=?, completion_tokens=?, tokens=?, cost=?, outcome=? WHERE id=? AND completed_at IS NULL')
    .run(Date.now(), result.model, promptTokens ?? null, completionTokens ?? null, tokens, cost ?? null, outcome, id);
}

export function usageSummary(owner?: string) {
  const now = new Date();
  const day = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const month = Date.UTC(now.getUTCFullYear(), now.getUTCMonth());
  const scope = owner ? 'owner_id=? AND' : '';
  const args = owner ? [owner] : [];
  const sql = `SELECT count(*) calls, coalesce(sum(tokens),0) measuredTokens,
    coalesce(sum(coalesce(tokens,reserved_tokens)),0) budgetTokens,
    coalesce(sum(CASE WHEN operation='voice-turn' THEN reserved_tokens ELSE 0 END),0) voiceSeconds,
    count(*)-count(tokens) unknownUsageCalls FROM ai_usage WHERE ${scope} started_at>=?`;
  const rollup = sqlite.prepare(`SELECT provider,model,count(*) calls,count(*)-count(cost) unknownCostCalls,
    SUM(cost) reportedCost,count(*)-sum(CASE WHEN outcome='ok' THEN 1 ELSE 0 END) nonSuccessCalls
    FROM ai_usage WHERE ${scope} started_at>=? GROUP BY provider,model ORDER BY provider,model`).all(...args, month);
  return { day: sqlite.prepare(sql).get(...args, day), month: sqlite.prepare(sql).get(...args, month),
    limits: owner ? planFor(owner, now.getTime()) : { day: systemDay }, byModel: rollup };
}
