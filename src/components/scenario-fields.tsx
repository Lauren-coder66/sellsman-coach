import type { Scenario } from '@/lib/ai/provider';

type Props = { scenario: Scenario; onChange: (scenario: Scenario) => void };

export function ScenarioFields({ scenario, onChange }: Props) {
  function field(key: keyof Scenario, value: string) {
    onChange({ ...scenario, [key]: value });
  }
  return <>
    <label className="grid gap-2">产品或服务名称<input required minLength={2} maxLength={80} value={scenario.product} onChange={event => field('product', event.target.value)} className="rounded-lg border p-3" /></label>
    <label className="grid gap-2">客户身份（可自定义）<input required maxLength={80} value={scenario.identity} onChange={event => field('identity', event.target.value)} className="rounded-lg border p-3" /></label>
    <label className="grid gap-2 md:col-span-2">产品或服务介绍（最多500字）<textarea required maxLength={500} value={scenario.description} onChange={event => field('description', event.target.value)} className="min-h-28 rounded-lg border p-3" /></label>
    <label className="grid gap-2">客户性格<select value={scenario.personality} onChange={event => field('personality', event.target.value)} className="rounded-lg border p-3">{['普通型', '冷淡型', '价格敏感型', '怀疑型', '强势型'].map(value => <option key={value}>{value}</option>)}</select></label>
    <label className="grid gap-2">训练难度<select value={scenario.difficulty} onChange={event => field('difficulty', event.target.value)} className="rounded-lg border p-3">{['简单', '中等', '困难'].map(value => <option key={value}>{value}</option>)}</select></label>
    <label className="grid gap-2 md:col-span-2">训练目标<select value={scenario.goal} onChange={event => field('goal', event.target.value)} className="rounded-lg border p-3">{['了解客户需求', '介绍产品价值', '处理客户异议', '争取下一次沟通', '尝试成交'].map(value => <option key={value}>{value}</option>)}</select></label>
  </>;
}
