export const focusDimensions = ['need_discovery', 'value_expression', 'objection_handling', 'next_step'] as const;
export type FocusDimension = typeof focusDimensions[number];

export const focusDetails: Record<FocusDimension, { label: string; instruction: string }> = {
  need_discovery: { label: '需求挖掘', instruction: '先了解客户目前的情况、问题和目标，再介绍方案。' },
  value_expression: { label: '价值表达', instruction: '把产品功能对应到客户已经表达的需求与实际收益。' },
  objection_handling: { label: '异议处理', instruction: '先理解客户疑虑，再针对具体顾虑作出回应。' },
  next_step: { label: '推进下一步', instruction: '确认下一次沟通的时间，或约定一个具体行动。' },
};
