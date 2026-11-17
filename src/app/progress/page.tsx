'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { api } from '@/lib/client';
import { focusDetails, focusDimensions, type FocusDimension } from '@/lib/focus';
import type { TrendDays } from '@/lib/progress';

type Progress = {
  timeZone: string;
  asOfDate: string;
  days: TrendDays;
  summary: {
    total: number;
    completed: number;
    last7: number;
    last30: number;
    activeDays: number;
    userTurns: number;
    normalCount: number;
    focusedCount: number;
  };
  trend: { date: string; count: number }[];
  focusCounts: Record<FocusDimension, number>;
  latestCompletedId: string | null;
  recent: { id: string; product: string; status: string; createdAt: number; focusDimension: FocusDimension | null }[];
};

const dateTime = new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
const statusNames: Record<string, string> = { active: '进行中', replying: '回复中', finishing: '生成报告中', failed: '报告失败', completed: '已完成' };

export default function ProgressPage() {
  const [days, setDays] = useState<TrendDays>(30);
  const [data, setData] = useState<Progress | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let current = true;
    api<Progress>(`/api/progress?days=${days}`)
      .then(result => { if (current) setData(result); })
      .catch(cause => { if (current) setError((cause as Error).message); })
      .finally(() => { if (current) setLoading(false); });
    return () => { current = false; };
  }, [days]);

  const maxCount = Math.max(1, ...(data?.trend.map(day => day.count) ?? []));
  const stats = data?.summary;
  const cards = stats ? [
    ['累计训练', stats.total],
    ['已完成训练', stats.completed],
    ['最近7天', stats.last7],
    ['最近30天', stats.last30],
    ['活跃训练天数', stats.activeDays],
    ['累计发言轮数', stats.userTurns],
    ['普通训练', stats.normalCount],
    ['专项训练', stats.focusedCount],
  ] as const : [];

  return <main className="mx-auto max-w-6xl p-6 md:p-10">
    <header className="flex flex-wrap justify-between gap-4 border-b pb-5"><Link href="/" className="font-bold text-teal-800">◈ 销售陪练</Link><nav className="flex flex-wrap gap-4 text-sm"><Link href="/create">创建新训练</Link><Link href="/history">训练历史</Link><Link href="/scenarios">我的场景</Link></nav></header>
    <h1 className="mt-10 text-4xl font-bold">我的成长</h1>
    <p className="mt-3 text-slate-600">这里记录真实训练行为。训练次数与活跃天数反映练习频率，不代表销售能力提升。</p>
    <p className="mt-2 text-sm text-amber-800">当前报告评分由 Mock 规则生成，未纳入成长统计。匿名 Cookie 丢失后，历史训练暂时无法找回。</p>
    <div className="mt-6 flex flex-wrap gap-3"><Link href="/history" className="rounded-lg border px-4 py-2 text-teal-700">查看历史训练</Link><Link href="/create" className="rounded-lg bg-teal-700 px-4 py-2 text-white">创建新训练</Link>{data?.latestCompletedId ? <Link href={`/report/${data.latestCompletedId}`} className="rounded-lg border px-4 py-2 text-teal-700">从报告选择专项训练</Link> : <span className="self-center text-sm text-slate-500">完成一次训练后，可从报告开始专项练习。</span>}</div>
    {error && <p role="alert" className="mt-6 text-red-700">{error}</p>}
    {loading && <p className="mt-6">正在读取训练记录…</p>}
    {data && !loading && <>
      <section className="mt-10"><h2 className="text-2xl font-bold">训练概览</h2><div className="mt-5 grid grid-cols-2 gap-4 md:grid-cols-4">{cards.map(([label, value]) => <div key={label} className="rounded-xl border bg-white p-5"><p className="text-sm text-slate-600">{label}</p><b className="mt-2 block text-3xl text-teal-800">{value}</b></div>)}</div></section>
      <section className="mt-12"><div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-2xl font-bold">每日训练次数</h2><p className="mt-1 text-sm text-slate-500">按 Asia/Shanghai 自然日统计，含今天；没有训练的日期显示 0。</p></div><div className="flex gap-2">{([7, 30, 90] as const).map(value => <button key={value} onClick={() => { setDays(value); setLoading(true); setError(''); }} aria-pressed={days === value} className={`rounded-lg border px-3 py-2 text-sm ${days === value ? 'border-teal-700 bg-teal-50 text-teal-800' : ''}`}>最近{value}天</button>)}</div></div>
        <div className="mt-5 overflow-x-auto rounded-xl border bg-white p-5"><div role="img" aria-label={`最近${days}天每日训练次数`} className="flex h-56 min-w-full items-end gap-1">{data.trend.map((day, index) => <div key={day.date} className="flex h-full flex-1 flex-col items-center justify-end gap-2" style={{ minWidth: days === 90 ? 12 : days === 30 ? 22 : 48 }} title={`${day.date}：${day.count}次`} aria-label={`${day.date}：${day.count}次`}><span className="text-xs text-slate-600">{day.count || ''}</span><div className={`w-full rounded-t ${day.count ? 'bg-teal-600' : 'bg-slate-200'}`} style={{ height: day.count ? `${Math.max(4, day.count / maxCount * 78)}%` : 2 }} /><span className="h-4 text-[10px] text-slate-500">{index === 0 || index === data.trend.length - 1 || (days === 7 ? true : index % (days === 30 ? 5 : 15) === 0) ? day.date.slice(5) : ''}</span></div>)}</div></div>
      </section>
      <section className="mt-12"><h2 className="text-2xl font-bold">专项训练分布</h2><p className="mt-1 text-sm text-slate-500">统计选择过的练习方向，不包含普通训练。</p><div className="mt-5 grid gap-3 md:grid-cols-4">{focusDimensions.map(dimension => <div key={dimension} className="rounded-xl border bg-white p-5"><p>{focusDetails[dimension].label}</p><b className="mt-2 block text-3xl text-teal-800">{data.focusCounts[dimension]}</b></div>)}</div></section>
      <section className="mt-12"><div className="flex justify-between"><h2 className="text-2xl font-bold">最近训练时间线</h2><Link href="/history" className="text-teal-700">查看全部 →</Link></div>{data.recent.length ? <div className="mt-5 divide-y border-y">{data.recent.map(item => <article key={item.id} className="flex flex-wrap items-center justify-between gap-3 py-4"><div><p className="font-bold">{item.product}</p><p className="mt-1 text-sm text-slate-500">{dateTime.format(item.createdAt)} · {item.focusDimension ? `专项：${focusDetails[item.focusDimension].label}` : '普通训练'} · {statusNames[item.status] ?? item.status}</p></div><div className="flex gap-3 text-sm"><Link href={`/train/${item.id}`} className="text-teal-700">训练详情</Link>{item.status === 'completed' && <Link href={`/report/${item.id}`} className="text-teal-700">报告</Link>}</div></article>)}</div> : <p className="mt-5 rounded-xl border border-dashed p-8 text-slate-500">暂无训练记录。创建一条训练后，数据会显示在这里。</p>}</section>
    </>}
  </main>;
}
