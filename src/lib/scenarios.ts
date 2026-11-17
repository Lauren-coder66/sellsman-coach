import { randomUUID } from 'node:crypto';
import { and, desc, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { savedScenarios } from '@/lib/db/schema';
import type { z } from 'zod';
import { savedScenarioSchema } from '@/lib/validation';

export type SavedScenarioInput = z.infer<typeof savedScenarioSchema>;
type Row = typeof savedScenarios.$inferSelect;

function present(row: Row) {
  return {
    id: row.id,
    name: row.name,
    scenario: {
      product: row.product,
      description: row.description,
      identity: row.identity,
      personality: row.personality,
      difficulty: row.difficulty,
      goal: row.goal,
    },
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export function listOwnedScenarios(ownerId: string) {
  return db.select().from(savedScenarios).where(eq(savedScenarios.ownerId, ownerId))
    .orderBy(desc(savedScenarios.updatedAt), desc(savedScenarios.id)).all().map(present);
}

export function getOwnedScenario(id: string, ownerId: string) {
  const row = db.select().from(savedScenarios).where(and(eq(savedScenarios.id, id), eq(savedScenarios.ownerId, ownerId))).get();
  return row ? present(row) : undefined;
}

export function createScenario(ownerId: string, input: SavedScenarioInput) {
  const now = Date.now();
  const row = { id: randomUUID(), ownerId, ...input, createdAt: now, updatedAt: now };
  db.insert(savedScenarios).values(row).run();
  return present(row);
}

export function updateOwnedScenario(id: string, ownerId: string, input: SavedScenarioInput) {
  const changed = db.update(savedScenarios).set({ ...input, updatedAt: Date.now() })
    .where(and(eq(savedScenarios.id, id), eq(savedScenarios.ownerId, ownerId))).run();
  return changed.changes ? getOwnedScenario(id, ownerId) : undefined;
}

export function deleteOwnedScenario(id: string, ownerId: string) {
  return db.delete(savedScenarios).where(and(eq(savedScenarios.id, id), eq(savedScenarios.ownerId, ownerId))).run().changes > 0;
}
