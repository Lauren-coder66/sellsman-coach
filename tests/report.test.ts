import { expect, test } from 'vitest';
import { reportEvidenceMatches, reportSource } from '../src/lib/report';

test('only a nonblank verbatim excerpt from the identified seller message counts as evidence', () => {
  const history = [
    { id: 'seller', role: 'user', content: '预算　需要再确认。', sequence: 0 } as const,
    { id: 'buyer', role: 'customer', content: '预算　需要再确认。', sequence: 1 } as const,
  ];
  const issue = { message_id: 'seller', quote: '需要再确认。', problem: 'p', reason: 'r', suggestion: 's', better_expression: 'b' };
  expect(reportEvidenceMatches([issue], history)).toBe(true);
  for (const invalid of [{ message_id: 'buyer' }, { message_id: 'missing' }, { quote: '' }, { quote: '预算需要再确认' }]) {
    expect(reportEvidenceMatches([{ ...issue, ...invalid }], history)).toBe(false);
  }
});

test('historical scores remain Mock and a sample without scores has no rating source', () => {
  expect(reportSource({ scores: { next_step: {} } })).toBe('mock');
  expect(reportSource({ scores: { next_step: {} }, scoringSource: 'real' })).toBe('real');
  expect(reportSource({ scores: null, scoringSource: 'real' })).toBeNull();
});
