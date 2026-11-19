'use client';

import Link from 'next/link';
import Image from 'next/image';
import { useEffect, useState } from 'react';
import { api } from '@/lib/client';

type Item = { id: string; scenario: { product: string; personality: string }; status: string; createdAt: number };
type Stats = { aiMode: 'mock' | 'real'; total: number; completed: number; last7: number; turns: number; recent: Item[] };

export default function Home() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [error, setError] = useState('');
  useEffect(() => { api<Stats>('/api/dashboard').then(setStats).catch(cause => setError((cause as Error).message)); }, []);

  return <main className="studio-home mx-auto max-w-[90rem] px-5 pb-10 sm:px-9 lg:px-14">
    <header className="studio-nav">
      <Link href="/" className="studio-brand"><span className="studio-mark" aria-hidden="true"><i /><i /></span>销售陪练</Link>
      <nav aria-label="主导航" className="studio-links"><Link href="/progress">我的成长</Link><Link href="/scenarios">我的场景</Link><Link href="/history">训练历史</Link><Link href="/create">创建训练</Link><Link href="/account">账号 <span aria-hidden="true">↗</span></Link></nav>
    </header>
    <section className="studio-hero" aria-labelledby="studio-title">
      <div className="studio-hero-copy">
        <h1 id="studio-title">重要的对话，<br /><em>先练一遍。</em></h1>
        <p className="studio-intro">把真实销售场景搬进排练室。和模拟客户过几招，再从自己的原话里找到改进方向。</p>
        <Link href="/create" className="studio-cta">开始训练 <span aria-hidden="true">↗</span></Link>
        <p className="studio-mode" role="status">{stats?.aiMode === 'real' ? '真实 AI 对练 · 根据本次对话生成反馈' : stats?.aiMode === 'mock' ? '演示模式 · 回复与评分由本地规则生成' : error ? '训练模式暂未读取' : '正在确认训练模式…'}</p>
      </div>
      <div className="studio-hero-image">
        <Image src="/rehearsal-room.webp" fill preload sizes="(min-width: 1024px) 54vw, (min-width: 768px) 50vw, 100vw" alt="" className="object-cover" />
      </div>
    </section>
    <section className="studio-stats" aria-label="训练概览">
      {error ? <p role="alert">统计暂时无法读取：{error}</p> : <dl>{[
        ['累计训练', stats?.total], ['已完成', stats?.completed], ['累计发言轮数', stats?.turns], ['最近 7 天训练', stats?.last7],
      ].map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value ?? '—'}</dd></div>)}</dl>}
    </section>
    {stats?.total === 0 && <section aria-label="第一次训练怎么开始" className="mt-12 rounded-2xl border bg-white p-6"><h2 className="text-2xl font-bold">第一次训练，按这三步开始</h2><ol className="mt-5 grid gap-4 md:grid-cols-3"><li><b>1. 准备账号</b><p className="mt-2 text-sm text-slate-600">正式文字版需要注册并验证邮箱。<Link href="/account" className="text-teal-700 underline">前往账号</Link></p></li><li><b>2. 选择场景</b><p className="mt-2 text-sm text-slate-600">从系统模板开始，确认产品与客户信息后创建训练。<Link href="/create" className="text-teal-700 underline">选择模板</Link></p></li><li><b>3. 对话并复盘</b><p className="mt-2 text-sm text-slate-600">与客户完成至少三轮对话，结束训练后查看有原话依据的报告。</p></li></ol></section>}
    <section className="mt-16"><div className="flex flex-wrap justify-between gap-3"><h2 className="text-2xl font-bold">最近训练</h2><Link href="/history" className="text-teal-700">查看全部 →</Link></div>{error ? <p className="mt-5 text-red-700">{error}</p> : stats?.recent.length ? <div className="mt-5 divide-y border-y">{stats.recent.map(item => <Link key={item.id} href={item.status === 'completed' ? `/report/${item.id}` : `/train/${item.id}`} className="flex flex-wrap justify-between gap-2 py-4 hover:text-teal-700"><span>{item.scenario.product} · {item.scenario.personality}</span><span>{new Date(item.createdAt).toLocaleDateString('zh-CN')}</span></Link>)}</div> : stats ? <p className="mt-6 rounded-2xl border border-dashed p-8 text-slate-500">暂无训练记录。选择一个场景开始第一次练习。</p> : <p className="mt-6 text-slate-500">正在加载训练记录…</p>}</section>
    <footer className="mt-14 flex flex-wrap gap-5 border-t pt-5 text-sm text-slate-600"><Link href="/feedback">反馈与建议</Link><Link href="/privacy">数据与隐私</Link><Link href="/terms">使用说明</Link></footer>
  </main>;
}
