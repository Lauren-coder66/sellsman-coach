import { desc, eq } from 'drizzle-orm';
import { z } from 'zod';
import { db, sqlite } from '@/lib/db';
import { productFeedback } from '@/lib/db/schema';

export const feedbackInput = z.strictObject({
  requestId: z.string().uuid(),
  category: z.enum(['problem', 'suggestion', 'other']),
  content: z.string().trim().min(10).max(1500),
});

type Input = z.infer<typeof feedbackInput>;

export function saveFeedback(ownerId: string, input: Input): 'created' | 'replayed' | 'conflict' | 'limited' {
  return sqlite.transaction(() => {
    const existing = db.select().from(productFeedback).where(eq(productFeedback.id, input.requestId)).get();
    if (existing) return existing.ownerId === ownerId && existing.category === input.category && existing.content === input.content ? 'replayed' : 'conflict';
    const now = Date.now();
    const day = Date.UTC(new Date(now).getUTCFullYear(), new Date(now).getUTCMonth(), new Date(now).getUTCDate());
    const activity = sqlite.prepare('SELECT count(*) AS total, max(created_at) AS latest FROM product_feedback WHERE owner_id = ? AND created_at >= ?')
      .get(ownerId, day) as { total: number; latest: number | null };
    if (activity.total >= 3 || (activity.latest !== null && now - activity.latest < 30_000)) return 'limited';
    db.insert(productFeedback).values({ id: input.requestId, ownerId, category: input.category, content: input.content, createdAt: now }).run();
    return 'created';
  }).immediate();
}

export function listFeedback(ownerId: string) {
  return db.select({ id: productFeedback.id, category: productFeedback.category, content: productFeedback.content, createdAt: productFeedback.createdAt })
    .from(productFeedback).where(eq(productFeedback.ownerId, ownerId)).orderBy(desc(productFeedback.createdAt)).limit(20).all();
}
