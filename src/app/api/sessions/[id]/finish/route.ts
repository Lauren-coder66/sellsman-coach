import { NextRequest } from 'next/server';
import { getOwnerId } from '@/lib/auth/session';
import { success, failure, handleError } from '@/lib/api';
import { finishSession } from '@/lib/training-service';

export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const ownerId = await getOwnerId();
    if (!ownerId) return failure('NOT_FOUND', '会话不存在', 404);
    const result = await finishSession(id, ownerId);
    return result.ok ? success(result.data) : failure(result.code, result.message, result.status);
  } catch (error) { return handleError(error); }
}
