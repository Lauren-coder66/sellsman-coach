import { sqlite } from '@/lib/db';
import { accountOwner, getAccountSession } from '@/lib/auth/session';
import { failure, handleError } from '@/lib/api';

export async function GET() {
  try {
    const session = await getAccountSession();
    if (!session?.user.emailVerified) return failure('ACCOUNT_REQUIRED', '请先登录已验证的账号', 401);
    const owner = accountOwner(session.user.id);
    const records = sqlite.transaction(() => ({
      sessions: sqlite.prepare("SELECT id, status, scenario_config, NULLIF(hidden_customer_profile, '') AS hidden_customer_profile, created_at, updated_at FROM training_sessions WHERE owner_id=?").all(owner),
      messages: sqlite.prepare('SELECT m.* FROM messages m JOIN training_sessions s ON m.session_id=s.id WHERE s.owner_id=? ORDER BY m.session_id, m.sequence').all(owner),
      reports: sqlite.prepare('SELECT r.* FROM training_reports r JOIN training_sessions s ON r.session_id=s.id WHERE s.owner_id=?').all(owner),
      focus: sqlite.prepare('SELECT f.* FROM training_focus f JOIN training_sessions s ON f.session_id=s.id WHERE s.owner_id=?').all(owner),
      scenarios: sqlite.prepare('SELECT id,name,product,description,identity,personality,difficulty,goal,created_at,updated_at FROM saved_scenarios WHERE owner_id=?').all(owner),
      feedback: sqlite.prepare('SELECT id,category,content,created_at FROM product_feedback WHERE owner_id=? ORDER BY created_at DESC').all(owner),
      usage: sqlite.prepare('SELECT provider,model,operation,started_at,completed_at,tokens,cost,outcome FROM ai_usage WHERE owner_id=?').all(owner),
      subscription: sqlite.prepare('SELECT plan,state,valid_until FROM subscriptions WHERE owner_id=?').get(owner) ?? null,
      orders: sqlite.prepare('SELECT id,plan,state,provider,created_at FROM billing_orders WHERE owner_id=?').all(owner),
    }))();
    return Response.json({ version: 1, account: { email: session.user.email, name: session.user.name }, ...records }, {
      headers: { 'Cache-Control': 'no-store', 'Content-Disposition': 'attachment; filename="sales-coach-export.json"', 'X-Content-Type-Options': 'nosniff' },
    });
  } catch (error) { return handleError(error); }
}
