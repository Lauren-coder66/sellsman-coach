'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { api } from '@/lib/client';

type Period = { calls: number; budgetTokens: number; measuredTokens: number; unknownUsageCalls: number; voiceSeconds: number };
type Usage = {
  day: Period; month: Period; limits: { day: number; month: number; label?: string; voiceMinutes?: number };
  byModel: { provider: string; model: string; calls: number; unknownCostCalls: number; reportedCost: number | null; nonSuccessCalls: number }[];
};

export default function AccountUsage() {
  const [usage, setUsage] = useState<Usage | null>(null);
  const [error, setError] = useState('');
  const [system, setSystem] = useState(false);
  useEffect(() => {
    let live = true;
    api<Usage>(`/api/account/usage${system ? '?scope=system' : ''}`)
      .then(result => { if (live) setUsage(result); })
      .catch(failure => { if (live) setError(failure.message); });
    return () => { live = false; };
  }, [system]);
  return <main className="mx-auto max-w-2xl space-y-5 p-5">
    <Link href="/account">返回账号设置</Link>
    <h1 className="text-3xl font-bold">{system ? '系统用量' : '我的训练额度'}</h1>
    <button className="rounded border px-3 py-2" onClick={() => { setUsage(null); setError(''); setSystem(!system); }}>{system ? '查看个人额度' : '管理员用量'}</button>
    {error ? <p role="alert">{error}</p> : usage ? <>
      {!system && <p>当前套餐 {usage.limits.label}</p>}
      <p>今日使用 {usage.day.budgetTokens.toLocaleString()} Token{!system && ` / ${usage.limits.day.toLocaleString()}`}</p>
      <p>今日语音输入 {usage.day.voiceSeconds} 秒{!system && ` / ${(usage.limits.voiceMinutes ?? 0) * 60} 秒`}</p>
      <p>本月使用 {usage.month.budgetTokens.toLocaleString()} Token{!system && ` / ${usage.limits.month.toLocaleString()}`}</p>
      <p>已计量 {usage.month.measuredTokens.toLocaleString()} Token。另有 {usage.month.unknownUsageCalls} 次请求保留预留额度。统计按 UTC 重置。</p>
      <h2 className="text-xl font-semibold">本月按模型统计</h2>
      {usage.byModel.length === 0 && <p>暂无真实模型调用。</p>}
      {usage.byModel.map(row => <article className="rounded-lg border p-3" key={`${row.provider}:${row.model}`}>
        <h3 className="font-semibold">{row.model}</h3>
        <p>{row.calls} 次调用，{row.nonSuccessCalls} 次未成功。已报告费用 {row.reportedCost === null ? '未知' : row.reportedCost.toString()}，{row.unknownCostCalls} 次未报告费用。</p>
      </article>)}
    </> : <p>正在读取用量…</p>}
  </main>;
}
