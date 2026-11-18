import { sqlite } from '@/lib/db';
import { connection } from 'next/server';
import { getAccounts } from '@/lib/auth/accounts';
import { mailConfiguration } from '@/lib/auth/mail';

export async function GET() {
  await connection();
  try {
    sqlite.prepare('SELECT id FROM training_sessions LIMIT 1').get();
    if (process.env.ACCOUNT_REQUIRED === '1') {
      mailConfiguration();
      if (!await getAccounts()) throw new Error('Account not configured');
    }
    return Response.json({ status: 'ok' }, { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return Response.json({ status: 'unavailable' }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
  }
}
