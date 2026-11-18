import { expect, test } from 'vitest';
import { activePlan } from '../src/lib/plans';

test('only known active subscriptions before their expiry change entitlements', () => {
  const standard = { plan: 'standard', state: 'active', validUntil: 2000 };
  expect(activePlan(standard, 1999)).toBe('standard');
  expect(activePlan(standard, 2000)).toBe('trial');
  expect(activePlan({ ...standard, state: 'cancelled' }, 1999)).toBe('trial');
  expect(activePlan({ ...standard, plan: 'unrecognized' }, 1999)).toBe('trial');
});
