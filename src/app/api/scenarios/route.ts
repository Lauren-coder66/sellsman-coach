import { NextRequest } from 'next/server';
import { getOrCreateOwnerId, getOwnerId } from '@/lib/auth/session';
import { failure, handleError, parseJson, success } from '@/lib/api';
import { savedScenarioSchema } from '@/lib/validation';
import { createScenario, listOwnedScenarios } from '@/lib/scenarios';

export async function GET() {
  try {
    const ownerId = await getOwnerId();
    return success({ items: ownerId ? listOwnedScenarios(ownerId) : [] });
  } catch (error) { return handleError(error); }
}

export async function POST(request: NextRequest) {
  try {
    const parsed = await parseJson(request, savedScenarioSchema);
    if (parsed.error) return parsed.error;
    const ownerId = await getOrCreateOwnerId();
    if (!ownerId) return failure('OWNER_REQUIRED', '无法创建匿名用户', 500);
    return success(createScenario(ownerId, parsed.data!), 201);
  } catch (error) { return handleError(error); }
}
