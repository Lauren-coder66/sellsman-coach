import type { AIProvider } from './provider';
import { mockProvider } from './mock-provider';

export function getAIProvider(): AIProvider {
  if ((process.env.AI_MODE || 'mock') !== 'mock') throw new Error('当前版本仅支持 AI_MODE=mock');
  return mockProvider;
}
