import type { AIProvider, Report } from './provider';

const has = (text: string, words: string[]) => words.some(word => text.includes(word));
export const mockProvider: AIProvider = {
  async generateCustomerProfile(scenario) {
    return { identity: scenario.identity, concern: scenario.personality === '价格敏感型' ? '预算' : scenario.personality === '怀疑型' ? '可信度' : '价值', stance: scenario.difficulty === '困难' ? -2 : 0 };
  },
  async generateCustomerOpening(scenario) {
    const line = scenario.personality === '冷淡型' ? '我时间有限，请直接说重点。' : scenario.personality === '价格敏感型' ? '先说一下大概费用吧。' : scenario.personality === '怀疑型' ? '你们有什么证据说明这能解决问题？' : scenario.personality === '强势型' ? '我需要一个明确理由，为什么要听这个方案？' : '你好，我想了解一下。';
    return `${line}你说的${scenario.product}具体适合我吗？`;
  },
  async generateCustomerReply(scenario, profile, messages) {
    const users = messages.filter(m => m.role === 'user');
    const last = users.at(-1)?.content ?? '';
    const turn = users.length;
    const earlier = users.slice(0, -1).map(m => m.content).join(' ');
    if (has(earlier, ['价格', '预算']) && has(last, ['下次', '联系', '沟通'])) return '可以继续沟通，但请先把预算和具体价值说明清楚。';
    if (has(last, ['价格', '费用', '报价', '便宜', '优惠'])) return scenario.personality === '价格敏感型' ? '这个价格还是超出我的预算。具体能带来多少价值？' : '我更关心这个费用是否值得，能具体说明吗？';
    if (has(last, ['案例', '证明', '效果', '保证'])) return scenario.personality === '怀疑型' ? '案例能核实吗？和我的情况有多相似？' : '听起来不错，不过能给我更具体的依据吗？';
    if (has(last, ['需求', '目前', '困扰', '问题', '目标'])) return profile.concern === '预算' ? '目前主要担心预算，投入之后多久能看到价值？' : '我现在确实有些顾虑。你会先了解我的实际情况再给建议吗？';
    if (has(last, ['购买', '签约', '成交', '下单'])) return '我现在还不能决定。先把方案和关键条件说清楚。';
    if (scenario.personality === '冷淡型') return turn > 2 ? '请直接告诉我，下一步需要我做什么？' : '这和我现在的情况有什么关系？';
    if (scenario.personality === '强势型') return '这个说法太笼统。你能针对我的情况给出明确价值吗？';
    if (scenario.personality === '怀疑型') return '我需要看到更可信的依据。你有什么具体说明？';
    return turn > 3 ? '我愿意继续了解，不过还需要想清楚是否适合。' : '明白了。你能进一步解释它如何解决我的问题吗？';
  },
  async generateTrainingReport(_scenario, messages): Promise<Report> {
    const users = messages.filter(m => m.role === 'user');
    const all = users.map(m => m.content).join(' ');
    const need = has(all, ['需求', '目前', '困扰', '问题', '目标']) ? 4 : 2;
    const value = has(all, ['帮助', '解决', '价值', '节省', '提升']) ? 4 : 2;
    const objection = has(all, ['理解', '担心', '顾虑', '预算', '价格']) ? 4 : 2;
    const next = has(all, ['下次', '预约', '沟通', '联系', '安排']) ? 4 : 1;
    const first = users[0];
    return {
      summary: '这是基于本次真实发言的演示复盘，建议继续练习针对客户顾虑的追问。',
      customer_outcome: '继续考虑',
      scores: { need_discovery: { score: need, reason: need === 4 ? '发言中包含需求探索。' : '需求探索较少。' }, value_expression: { score: value, reason: value === 4 ? '提到了客户价值。' : '价值表达较少。' }, objection_handling: { score: objection, reason: objection === 4 ? '回应了顾虑或价格。' : '对顾虑的回应较少。' }, next_step: { score: next, reason: next === 4 ? '提出了后续沟通。' : '没有明确下一步。' } },
      issues: first ? [{ message_id: first.id, quote: first.content.slice(0, 80), problem: '可以进一步追问客户背景', reason: '当前表达未必充分了解客户实际需求。', suggestion: '先确认需求再介绍方案。', better_expression: '方便说说您目前最想解决的具体问题吗？' }] : [],
      strengths: need === 4 ? ['主动询问客户情况'] : ['完成了本次模拟对话'],
      improvements: ['增加需求追问', '明确下一步行动'],
      next_training_suggestion: '下一次练习先问两个开放式问题，再针对答案介绍价值。',
    };
  },
};

