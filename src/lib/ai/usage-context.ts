import { AsyncLocalStorage } from 'node:async_hooks';

export const aiOwner = new AsyncLocalStorage<string>();
export const trainingModel = new AsyncLocalStorage<string | undefined>();

export function runTrainingAI<T>(owner: string, model: string | undefined, run: () => T): T {
  return aiOwner.run(owner, () => trainingModel.run(model, run));
}

export class AIQuotaError extends Error {
  constructor(message = '已达到训练额度，请稍后再试。') { super(message); }
}
