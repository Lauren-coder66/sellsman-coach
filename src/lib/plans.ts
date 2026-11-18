export const plans = {
  trial: { label: '免费试用', day: 60_000, month: 500_000, voiceMinutes: 0 },
  standard: { label: '标准版', day: 120_000, month: 1_600_000, voiceMinutes: 30 },
  premium: { label: '专业版', day: 240_000, month: 4_000_000, voiceMinutes: 90 },
} as const;
export type PlanId = keyof typeof plans;

export function activePlan(subscription: { plan: string; state: string; validUntil: number } | undefined, now: number): PlanId {
  if (subscription && subscription.state === 'active' && subscription.validUntil > now &&
      Object.hasOwn(plans, subscription.plan)) return subscription.plan as PlanId;
  return 'trial';
}
