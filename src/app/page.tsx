'use client';

import Link from 'next/link';
import Image from 'next/image';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/client';

type Item = { id: string; scenario: { product: string; personality: string }; status: string; createdAt: number };
type Stats = { aiMode: 'mock' | 'real'; total: number; completed: number; last7: number; turns: number; recent: Item[] };

export default function Home() {
  const router = useRouter();
  const dialog = useRef<HTMLDialogElement>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [error, setError] = useState('');
  const [models, setModels] = useState<string[] | null>(null);
  const [mode, setMode] = useState<'mock' | 'real'>('mock');
  const [model, setModel] = useState('');
  useEffect(() => { api<Stats>('/api/dashboard').then(setStats).catch(cause => setError((cause as Error).message)); }, []);

  function openTraining() {
    setMode('mock');
    dialog.current?.showModal();
    void api<{ models: string[] }>('/api/ai-mode').then(data => {
      setModels(data.models);
      setModel(data.models[0] ?? '');
    }).catch(() => setModels([]));
  }

  return <main className="studio-home mx-auto max-w-[90rem] px-5 pb-10 sm:px-9 lg:px-14">
    <header className="studio-nav">
      <Link href="/" className="studio-brand"><span className="studio-mark" aria-hidden="true"><i /><i /></span>销售陪练</Link>
      <nav aria-label="主导航" className="studio-links"><Link href="/progress">我的成长</Link><Link href="/scenarios">我的场景</Link><Link href="/history">训练历史</Link><Link href="/create">创建训练</Link><Link href="/account">账号 <span aria-hidden="true">↗</span></Link></nav>
    </header>
    <section className="studio-hero" aria-labelledby="studio-title">
      <div className="studio-hero-copy">
        <h1 id="studio-title">重要的对话，<br /><em>先练一遍。</em></h1>
        <p className="studio-intro">把真实销售场景搬进排练室。和模拟客户过几招，再从自己的原话里找到改进方向。</p>
        <button type="button" onClick={openTraining} aria-haspopup="dialog" className="studio-cta">开始训练 <span aria-hidden="true">↗</span></button>
        <p className="studio-mode" role="status">{stats?.aiMode === 'real' ? '真实 AI 对练 · 根据本次对话生成反馈' : stats?.aiMode === 'mock' ? '演示模式 · 回复与评分由本地规则生成' : error ? '训练模式暂未读取' : '正在确认训练模式…'}</p>
      </div>
      <div className="studio-hero-image">
        <Image src="/rehearsal-room.webp" fill preload sizes="(min-width: 1024px) 54vw, (min-width: 768px) 50vw, 100vw" alt="" className="object-cover" />
      </div>
    </section>
    <dialog ref={dialog} aria-labelledby="training-mode-title" className="studio-sheet m-auto w-[min(92vw,29rem)] max-h-[88dvh] p-6 shadow-2xl backdrop:bg-slate-950/55">
      <div className="flex items-center justify-between gap-4">
        <h2 id="training-mode-title" className="text-2xl font-bold tracking-tight">选择训练模式</h2>
        <button type="button" aria-label="关闭" onClick={() => dialog.current?.close()} className="grid size-11 place-items-center rounded-lg text-xl hover:bg-slate-100">×</button>
      </div>
      <fieldset aria-label="训练模式" className="mt-4 grid gap-3">
        <label className="studio-template flex cursor-pointer gap-3 has-checked:border-teal-600 has-checked:bg-teal-50">
          <input type="radio" name="training-mode" checked={mode === 'mock'} onChange={() => setMode('mock')} className="accent-teal-700" />
          <span><strong className="block">Mock 模拟</strong><span className="text-sm text-slate-600">用本地规则体验客户对话和复盘。</span></span>
        </label>
        <label className="studio-template flex gap-3 has-checked:border-teal-600 has-checked:bg-teal-50">
          <input type="radio" name="training-mode" checked={mode === 'real'} disabled={!models?.length} onChange={() => setMode('real')} className="accent-teal-700" />
          <span><strong className="block">真实 AI</strong><span className="text-sm text-slate-600">{models === null ? '正在读取可用模型…' : models.length ? '由所选模型生成客户回复和复盘。' : '当前环境尚未配置可用模型。'}</span></span>
        </label>
      </fieldset>
      {mode === 'real' && <label className="mt-4 grid gap-2 text-sm font-bold">AI 模型<select value={model} onChange={event => setModel(event.target.value)} className="min-h-11 rounded-lg border border-slate-400 bg-white px-3 font-normal">{models?.map(id => <option key={id} value={id}>{id}</option>)}</select></label>}
      <button type="button" disabled={mode === 'real' && !model} className="mt-5 min-h-11 w-full rounded-lg bg-teal-700 px-4 font-bold text-white hover:bg-teal-800 disabled:opacity-50" onClick={() => {
        const query = new URLSearchParams({ mode });
        if (mode === 'real') query.set('model', model);
        dialog.current?.close();
        router.push(`/create?${query}`);
      }}>继续选择场景</button>
    </dialog>
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
