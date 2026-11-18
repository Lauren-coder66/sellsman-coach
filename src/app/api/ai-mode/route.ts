import { connection } from 'next/server';
import { success, handleError } from '@/lib/api';
import { getAIMode } from '@/lib/ai';

export async function GET() {
  await connection();
  try { return success({ mode: getAIMode() }); }
  catch (error) { return handleError(error); }
}
