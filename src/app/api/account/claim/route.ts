import { cookies } from 'next/headers';
import { sqlite } from '@/lib/db';
import { accountOwner, anonymousCookie, anonymousOwner, canUseOwner, getAccountSession } from '@/lib/auth/session';
import { failure, handleError, success } from '@/lib/api';

export async function POST() {
  try {
    const session = await getAccountSession();
    if (!session?.user.emailVerified) return failure('ACCOUNT_REQUIRED', '请先登录已验证的账号', 401);
    const source = await anonymousOwner();
    if (!source) return success({ sessions: 0, scenarios: 0 });
    const target = accountOwner(session.user.id);
    const claim = sqlite.transaction(() => {
      if (!canUseOwner(target) || !canUseOwner(source)) return null;
      if (sqlite.prepare("SELECT 1 FROM training_sessions WHERE owner_id=? AND status IN ('replying','finishing') AND updated_at>?").get(source, Date.now() - 60_000)) {
        return null;
      }
      sqlite.prepare('INSERT INTO anonymous_owner_claims (owner_id) VALUES (?)').run(source);
      const sessions = sqlite.prepare('UPDATE training_sessions SET owner_id=? WHERE owner_id=?').run(target, source);
      const scenarios = sqlite.prepare('UPDATE saved_scenarios SET owner_id=? WHERE owner_id=?').run(target, source);
      sqlite.prepare('UPDATE ai_usage SET owner_id=? WHERE owner_id=?').run(target, source);
      return { sessions: sessions.changes, scenarios: scenarios.changes };
    }).immediate();
    if (!claim) return failure('CLAIM_CONFLICT', '有尚未完成的操作，请稍后再试', 409);
    (await cookies()).delete(anonymousCookie);
    return success(claim);
  } catch (error) { return handleError(error); }
}
