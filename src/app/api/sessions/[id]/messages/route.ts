import { NextRequest } from 'next/server';
import { z } from 'zod';
import { getOwnerId } from '@/lib/auth/session';
import { success, failure, handleError, parseJson } from '@/lib/api';
import { sendMessage } from '@/lib/training-service';

const inputSchema = z.object({ content: z.string().trim().min(1).max(1000), requestId: z.string().uuid() });

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const ownerId = await getOwnerId();
    if (!ownerId) return failure('NOT_FOUND', '会话不存在', 404);
    const parsed = await parseJson(request, inputSchema);
    if (parsed.error) return parsed.error;
    const { content, requestId } = parsed.data!;
    const result = await sendMessage(id, ownerId, content, requestId);
    return result.ok ? success(result.data) : failure(result.code, result.message, result.status);
  } catch (error) { return handleError(error); }
}
