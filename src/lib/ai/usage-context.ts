import { AsyncLocalStorage } from 'node:async_hooks';

export const aiOwner = new AsyncLocalStorage<string>();

export class AIQuotaError extends Error {
  constructor(message = '已达到训练额度，请稍后再试。') { super(message); }
}
