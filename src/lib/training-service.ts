import { randomUUID } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { messages, trainingFocus, trainingReports, trainingSessions } from '@/lib/db/schema';
import { getAIProvider } from '@/lib/ai';
import { focusDetails } from '@/lib/focus';
import { reportSchema } from '@/lib/validation';
import type { AIProvider, CustomerProfile } from '@/lib/ai/provider';
import { AIRateLimitError, AIModelOutputError, AIProviderAccessError, AIRequestTimeoutError } from '@/lib/ai/service';
import { reportEvidenceMatches, type ScoredReport } from '@/lib/report';
import { aiOwner, AIQuotaError } from '@/lib/ai/usage-context';

type Problem = { ok: false; code: string; message: string; status: number };
type Result<T> = { ok: true; data: T } | Problem;
type Session = typeof trainingSessions.$inferSelect;
const leaseMs = 60_000;
const problem = (code: string, message: string, status: number): Problem => ({ ok: false, code, message, status });
function logUnexpected(operation: 'reply' | 'report', correlationId: string, error: unknown) {
  const category = error instanceof Error && /^[A-Za-z]{1,32}Error$/.test(error.name) ? error.name : 'Unknown';
  const code = error && typeof error === 'object' && 'code' in error && typeof error.code === 'string' && /^SQLITE_[A-Z_]+$/.test(error.code) ? error.code : undefined;
  console.error('[training-error]', JSON.stringify({ operation, correlationId, category, code }));
}
const owned = (id: string, ownerId: string) => and(eq(trainingSessions.id, id), eq(trainingSessions.ownerId, ownerId));
const lease = (session: Session) => and(owned(session.id, session.ownerId), eq(trainingSessions.status, session.status), eq(trainingSessions.updatedAt, session.updatedAt));
const nextStamp = (session: Session) => Math.max(Date.now(), session.updatedAt + 1);
const focusFor = (id: string) => {
  const row = db.select().from(trainingFocus).where(eq(trainingFocus.sessionId, id)).get();
  return row ? { dimension: row.dimension, instruction: focusDetails[row.dimension].instruction } : undefined;
};

export async function sendMessage(id: string, ownerId: string, content: string, requestId: string, provider?: AIProvider): Promise<Result<{ reply: string; alreadySaved: boolean }>> {
  const claimed = db.transaction(tx => {
    const session = tx.select().from(trainingSessions).where(owned(id, ownerId)).get();
    if (!session) return problem('NOT_FOUND', '会话不存在', 404);
    const history = tx.select().from(messages).where(eq(messages.sessionId, id)).orderBy(messages.sequence).all();
    const existing = history.find(message => message.id === requestId);
    if (existing) {
      if (existing.role !== 'user' || existing.content !== content) return problem('DUPLICATE', '请求 ID 冲突', 409);
      const following = history.find(message => message.sequence === existing.sequence + 1);
      if (following?.role === 'customer') return { ok: true as const, data: { reply: following.content, alreadySaved: true } };
      if (history.at(-1)?.id !== requestId) return problem('CONFLICT', '历史消息已更新，请刷新', 409);
    } else {
      if (history.at(-1)?.role === 'user') return problem('PENDING_REPLY', '上一条客户回复尚未完成，请先重试', 409);
      if (history.filter(message => message.role === 'user').length >= 30) return problem('LIMIT', '已达到30轮上限', 409);
    }
    if (session.status === 'replying' && Date.now() - session.updatedAt < leaseMs) return problem('IN_PROGRESS', '客户正在回复，请稍后重试', 409);
    if (session.status !== 'active' && session.status !== 'replying') return problem('NOT_ACTIVE', '训练已结束', 409);
    const stamp = nextStamp(session);
    const changed = tx.update(trainingSessions).set({ status: 'replying', updatedAt: stamp }).where(lease(session)).run();
    if (!changed.changes) return problem('IN_PROGRESS', '会话状态已更新，请重试', 409);
    if (!existing) tx.insert(messages).values({ id: requestId, sessionId: id, role: 'user', content, sequence: history.length, createdAt: Date.now() }).run();
    return { ok: true as const, stamp, session, history: existing ? history : [...history, { id: requestId, sessionId: id, role: 'user' as const, content, sequence: history.length, createdAt: Date.now() }] };
  });
  if (!claimed.ok) return claimed;
  if (claimed.data) return { ok: true, data: claimed.data };
  try {
    const profile = JSON.parse(claimed.session.customerProfileJson) as CustomerProfile;
    const reply = await aiOwner.run(ownerId, () => (provider ?? getAIProvider(profile.mode ?? 'mock')).generateCustomerReply(JSON.parse(claimed.session.scenarioJson), profile, claimed.history, focusFor(id)));
    if (!reply.trim()) throw new Error('客户回复为空');
    return db.transaction(tx => {
      const changed = tx.update(trainingSessions).set({ status: 'active', updatedAt: Date.now() }).where(and(owned(id, ownerId), eq(trainingSessions.status, 'replying'), eq(trainingSessions.updatedAt, claimed.stamp))).run();
      if (!changed.changes) return problem('IN_PROGRESS', '本次回复已由其他请求接管，请刷新', 409);
      tx.insert(messages).values({ id: randomUUID(), sessionId: id, role: 'customer', content: reply, sequence: claimed.history.length, createdAt: Date.now() }).run();
      return { ok: true as const, data: { reply, alreadySaved: false } };
    });
  } catch (error) {
    db.update(trainingSessions).set({ status: 'active', updatedAt: Date.now() }).where(and(owned(id, ownerId), eq(trainingSessions.status, 'replying'), eq(trainingSessions.updatedAt, claimed.stamp))).run();
    if (error instanceof AIRequestTimeoutError) return problem('AI_TIMEOUT', error.message, 504);
    if (error instanceof AIProviderAccessError) return problem('AI_UNAVAILABLE', error.message, 503);
    if (error instanceof AIQuotaError || error instanceof AIRateLimitError) return problem('AI_RATE_LIMIT', error.message, 429);
    if (error instanceof AIModelOutputError) return problem('CUSTOMER_REPLY_ERROR', error.message, 502);
    logUnexpected('reply', requestId, error);
    return problem('CUSTOMER_REPLY_ERROR', '客户回复暂时失败，请重试本条消息。', 502);
  }
}

export async function finishSession(id: string, ownerId: string, provider?: AIProvider): Promise<Result<{ report: ScoredReport | InsufficientReport }>> {
  const claimed = db.transaction(tx => {
    const session = tx.select().from(trainingSessions).where(owned(id, ownerId)).get();
    if (!session) return problem('NOT_FOUND', '会话不存在', 404);
    const saved = tx.select().from(trainingReports).where(eq(trainingReports.sessionId, id)).get();
    if (saved) return { ok: true as const, data: { report: JSON.parse(saved.reportJson) as ScoredReport | InsufficientReport } };
    if (session.status === 'replying') return problem('IN_PROGRESS', '客户回复尚未完成，请稍后结束训练', 409);
    if (session.status === 'finishing' && Date.now() - session.updatedAt < leaseMs) return problem('IN_PROGRESS', '报告正在生成，请稍后重试', 409);
    if (!['active', 'failed', 'finishing', 'completed'].includes(session.status)) return problem('CONFLICT', '训练状态无效', 409);
    const history = tx.select().from(messages).where(eq(messages.sessionId, id)).orderBy(messages.sequence).all();
    const stamp = nextStamp(session);
    const changed = tx.update(trainingSessions).set({ status: 'finishing', updatedAt: stamp }).where(lease(session)).run();
    if (!changed.changes) return problem('IN_PROGRESS', '会话状态已更新，请重试', 409);
    return { ok: true as const, stamp, session, history };
  });
  if (!claimed.ok) return claimed;
  if (claimed.data) return { ok: true, data: claimed.data };
  try {
    let report: ScoredReport | InsufficientReport;
    if (claimed.history.filter(message => message.role === 'user').length < 3) {
      report = { summary: '训练样本不足，不生成正式能力评分。', customer_outcome: '样本不足', scores: null, issues: [], strengths: [], improvements: [], next_training_suggestion: '至少完成三轮训练。', sample_insufficient: true };
    } else {
      const profile = JSON.parse(claimed.session.customerProfileJson) as CustomerProfile;
      const scoringSource = profile.mode ?? 'mock';
      const generated = await aiOwner.run(ownerId, () => (provider ?? getAIProvider(scoringSource)).generateTrainingReport(JSON.parse(claimed.session.scenarioJson), claimed.history, focusFor(id)));
      const validated = reportSchema.parse(generated);
      if (!reportEvidenceMatches(validated.issues, claimed.history)) throw new Error('报告引用与原始消息不符');
      report = { ...validated, scoringSource, scoringModel: scoringSource === 'real' ? generated.scoringModel : undefined };
    }
    return db.transaction(tx => {
      const changed = tx.update(trainingSessions).set({ status: 'completed', updatedAt: Date.now() }).where(and(owned(id, ownerId), eq(trainingSessions.status, 'finishing'), eq(trainingSessions.updatedAt, claimed.stamp))).run();
      if (!changed.changes) return problem('IN_PROGRESS', '报告生成已由其他请求接管，请刷新', 409);
      tx.insert(trainingReports).values({ id: randomUUID(), sessionId: id, reportJson: JSON.stringify(report), createdAt: Date.now() }).run();
      return { ok: true as const, data: { report } };
    });
  } catch (error) {
    db.update(trainingSessions).set({ status: 'failed', updatedAt: Date.now() }).where(and(owned(id, ownerId), eq(trainingSessions.status, 'finishing'), eq(trainingSessions.updatedAt, claimed.stamp))).run();
    if (error instanceof AIRequestTimeoutError) return problem('REPORT_TIMEOUT', '报告生成超时，请重试', 504);
    if (error instanceof AIProviderAccessError) return problem('REPORT_UNAVAILABLE', error.message, 503);
    if (error instanceof AIQuotaError || error instanceof AIRateLimitError) return problem('REPORT_RATE_LIMIT', error.message, 429);
    if (error instanceof AIModelOutputError) return problem('REPORT_ERROR', error.message, 502);
    logUnexpected('report', id, error);
    return problem('REPORT_ERROR', '报告生成暂时失败，请重试。', 502);
  }
}

type InsufficientReport = {
  summary: string;
  customer_outcome: string;
  scores: null;
  issues: [];
  strengths: [];
  improvements: [];
  next_training_suggestion: string;
  sample_insufficient: true;
};
