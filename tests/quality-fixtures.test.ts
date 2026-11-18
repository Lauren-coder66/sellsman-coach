import { expect, test } from 'vitest';
import corpus from './fixtures/sales-quality-v1.json';
import { reportEvidenceMatches } from '../src/lib/report';
import type { ConversationMessage } from '../src/lib/ai/provider';

test('quality corpus covers the versioned short, long, evidence and behavior cases', () => {
  expect(corpus.version).toBe('sales-quality-v1');
  expect(corpus.cases.map(item => item.id)).toEqual(['A', 'B', 'C', 'no_demand', 'resolved', 'short', 'long', 'quote_trap']);
  for (const item of corpus.cases) {
    expect(item.dialogue.every((message, i) => message.role === (i % 2 ? 'user' : 'customer') && message.content.trim())).toBe(true);
  }
  expect(corpus.cases.find(item => item.id === 'short')!.dialogue.filter(message => message.role === 'user')).toHaveLength(2);
  expect(corpus.cases.find(item => item.id === 'long')!.dialogue.filter(message => message.role === 'user').length).toBeGreaterThanOrEqual(10);
});

test('a similar customer statement or edited quotation is not evidence', () => {
  const dialogue = corpus.cases.find(item => item.id === 'quote_trap')!.dialogue;
  const history = dialogue.map(({ role, content }, sequence) => ({ id: String(sequence), role, content, sequence })) as ConversationMessage[];
  const issue = { message_id: '1', quote: '首付款：待双方确认。', problem: 'p', reason: 'r', suggestion: 's', better_expression: 'e' };
  expect(reportEvidenceMatches([issue], history)).toBe(true);
  expect(reportEvidenceMatches([{ ...issue, quote: '首付款:待双方确认。' }], history)).toBe(false);
  expect(reportEvidenceMatches([{ ...issue, message_id: '0', quote: history[0].content }], history)).toBe(false);
});
