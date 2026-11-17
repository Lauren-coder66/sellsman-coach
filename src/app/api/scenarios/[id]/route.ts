import { NextRequest } from 'next/server';
import { getOwnerId } from '@/lib/auth/session';
import { failure, handleError, parseJson, success } from '@/lib/api';
import { savedScenarioSchema } from '@/lib/validation';
import { deleteOwnedScenario, getOwnedScenario, updateOwnedScenario } from '@/lib/scenarios';

type Context = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, { params }: Context) {
  try {
    const ownerId = await getOwnerId();
    const { id } = await params;
    const item = ownerId ? getOwnedScenario(id, ownerId) : undefined;
    return item ? success(item) : failure('NOT_FOUND', '场景不存在', 404);
  } catch (error) { return handleError(error); }
}

export async function PUT(request: NextRequest, { params }: Context) {
  try {
    const ownerId = await getOwnerId();
    if (!ownerId) return failure('NOT_FOUND', '场景不存在', 404);
    const { id } = await params;
    if (!getOwnedScenario(id, ownerId)) return failure('NOT_FOUND', '场景不存在', 404);
    const parsed = await parseJson(request, savedScenarioSchema);
    if (parsed.error) return parsed.error;
    const item = updateOwnedScenario(id, ownerId, parsed.data!);
    return item ? success(item) : failure('NOT_FOUND', '场景不存在', 404);
  } catch (error) { return handleError(error); }
}

export async function DELETE(_request: NextRequest, { params }: Context) {
  try {
    const ownerId = await getOwnerId();
    if (!ownerId) return failure('NOT_FOUND', '场景不存在', 404);
    const { id } = await params;
    return deleteOwnedScenario(id, ownerId) ? success({ deleted: true }) : failure('NOT_FOUND', '场景不存在', 404);
  } catch (error) { return handleError(error); }
}
