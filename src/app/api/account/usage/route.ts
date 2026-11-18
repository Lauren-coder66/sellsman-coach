import { accountOwner, getAccountSession } from '@/lib/auth/session';
import { failure, handleError, success } from '@/lib/api';
import { usageSummary } from '@/lib/usage';

export async function GET(request: Request) {
  try {
    const session = await getAccountSession();
    if (!session?.user.emailVerified) return failure('ACCOUNT_REQUIRED', '请先登录已验证的账号', 401);
    const admin = new URL(request.url).searchParams.get('scope') === 'system';
    if (admin && session.user.email.toLowerCase() !== process.env.USAGE_ADMIN_EMAIL?.trim().toLowerCase()) {
      return failure('NOT_FOUND', '未找到', 404);
    }
    return success(usageSummary(admin ? undefined : accountOwner(session.user.id)));
  } catch (error) { return handleError(error); }
}
