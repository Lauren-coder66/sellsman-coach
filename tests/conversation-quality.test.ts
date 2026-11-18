import { expect, test } from 'vitest';
import { repeatsCustomerQuestion } from '../src/lib/ai/conversation-quality';

test('blocks repeated timing questions but accepts confirmation and a different concern', () => {
  const history = ['报修多久能到？', '上门时效具体是几小时？'];
  expect(repeatsCustomerQuestion('你能保证多快响应吗？', [...history, '已经了解了。'])).toBe(false);
  expect(repeatsCustomerQuestion('上门响应速度能提前说明吗？', history)).toBe(true);
  expect(repeatsCustomerQuestion('清楚了，域名由谁管理？', history)).toBe(false);
  expect(repeatsCustomerQuestion('两小时响应已经说清楚了。', history)).toBe(false);
  expect(repeatsCustomerQuestion(history[0], [...history, '可以。', '明白了。', '发清单吧。'])).toBe(true);
});
