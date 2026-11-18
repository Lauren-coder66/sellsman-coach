import { sqlite } from '@/lib/db';
import { connection } from 'next/server';
import { getAccounts } from '@/lib/auth/accounts';

export async function GET() {
  await connection();
  try {
    sqlite.prepare('select 1').get();
    if (process.env.ACCOUNT_REQUIRED === '1' &&
        (!process.env.RESEND_API_KEY || !process.env.AUTH_MAIL_FROM || !await getAccounts())) {
      return Response.json({ status: 'unavailable' }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
    }
    return Response.json({ status: 'ok' }, { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return Response.json({ status: 'unavailable' }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
  }
}
