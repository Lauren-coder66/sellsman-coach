import { NextRequest } from 'next/server';
import { unstable_rethrow } from 'next/navigation';
import { getOwnerId } from '@/lib/auth/session';
import { failure, handleError, success } from '@/lib/api';
import { getProgress, type TrendDays } from '@/lib/progress';

export async function GET(request: NextRequest) {
  try {
    const raw = request.nextUrl.searchParams.get('days') ?? '30';
    if (!['7', '30', '90'].includes(raw)) return failure('INVALID_DAYS', '时间范围必须为7、30或90天', 422);
    return success(getProgress(await getOwnerId(), Number(raw) as TrendDays));
  } catch (error) { unstable_rethrow(error); return handleError(error); }
}
