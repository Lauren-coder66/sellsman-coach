import { connection } from 'next/server';
import { success, handleError } from '@/lib/api';
import { getAIMode } from '@/lib/ai';
import { availableTrainingModels } from '@/lib/ai/service';

export async function GET() {
  await connection();
  try { return success({ mode: getAIMode(), models: availableTrainingModels() }); }
  catch (error) { return handleError(error); }
}
