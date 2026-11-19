import { NextRequest } from 'next/server';
import { accountOwner, getAccountSession } from '@/lib/auth/session';
import { failure, handleError, parseJson, success } from '@/lib/api';
import { feedbackInput, listFeedback, saveFeedback } from '@/lib/feedback';
import { sqlite } from '@/lib/db';

export async function GET(request: NextRequest) {
  try {
    const session = await getAccountSession();
    if (!session?.user.emailVerified) return failure('ACCOUNT_REQUIRED', '请先登录已验证的账号', 401);
    if (request.nextUrl.searchParams.get('scope') === 'system') {
      const adminEmail = process.env.USAGE_ADMIN_EMAIL?.trim().toLowerCase();
      if (!adminEmail || session.user.email.toLowerCase() !== adminEmail) return failure('NOT_FOUND', '未找到', 404);
      const items = sqlite.prepare(`SELECT f.id, f.category, f.content, f.created_at AS createdAt, u.email
        FROM product_feedback f LEFT JOIN "user" u ON f.owner_id = 'account:' || u.id
        ORDER BY f.created_at DESC LIMIT 100`).all();
      return success({ items });
    }
    return success({ items: listFeedback(accountOwner(session.user.id)) });
  } catch (error) { return handleError(error); }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getAccountSession();
    if (!session?.user.emailVerified) return failure('ACCOUNT_REQUIRED', '请先登录已验证的账号', 401);
    const parsed = await parseJson(request, feedbackInput);
    if (parsed.error) return parsed.error;
    const outcome = saveFeedback(accountOwner(session.user.id), parsed.data!);
    if (outcome === 'conflict') return failure('DUPLICATE', '提交 ID 已被使用', 409);
    if (outcome === 'limited') return failure('RATE_LIMIT', '反馈提交过于频繁，请稍后再试', 429);
    return success({ id: parsed.data!.requestId, replayed: outcome === 'replayed' }, outcome === 'created' ? 201 : 200);
  } catch (error) { return handleError(error); }
}
