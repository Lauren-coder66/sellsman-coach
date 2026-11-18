import { getAccounts } from '@/lib/auth/accounts';

async function handler(request: Request) {
  const auth = await getAccounts();
  if (!auth) return Response.json({ message: '账号暂不可用' }, { status: 503 });
  return auth.handler(request);
}

export { handler as GET, handler as POST };
