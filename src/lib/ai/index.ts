import type { AIProvider } from './provider';
import { mockProvider } from './mock-provider';
import { realProvider } from './real-provider';

export function getAIMode(): 'mock' | 'real' {
  const mode = process.env.AI_MODE || 'mock';
  if (mode !== 'mock' && mode !== 'real') throw new Error('AI_MODE 必须为 mock 或 real');
  return mode;
}

export function getAIProvider(mode: 'mock' | 'real' = getAIMode()): AIProvider {
  return mode === 'real' ? realProvider : mockProvider;
}
