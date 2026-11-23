'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { api } from '@/lib/client';
import { StudioChoice } from '@/components/studio-choice';
import { useStudioConfirm } from '@/components/studio-confirm';
import { focusDetails, type FocusDimension } from '@/lib/focus';

import { reportSourceLabels, type ReportSource } from '@/lib/report';

type Item = {id:string;scenario:{product:string;personality:string;difficulty:string};status:string;createdAt:number;score:number|null;scoreSource:ReportSource|null;focusDimension:FocusDimension|null};
type Page = {items:Item[];nextCursor:string|null};

export default function History() {
  const { ask, confirmation } = useStudioConfirm();
  const [items,setItems] = useState<Item[]>([]);
  const [status,setStatus] = useState('');
  const [cursor,setCursor] = useState<string|null>(null);
  const [loading,setLoading] = useState(true);
  const [loadingMore,setLoadingMore] = useState(false);
  const [error,setError] = useState('');

  useEffect(() => {
    let current = true;
    api<Page>(`/api/sessions?limit=20${status ? `&status=${status}` : ''}`)
      .then(page => { if (current) { setItems(page.items); setCursor(page.nextCursor); } })
      .catch(cause => { if (current) setError((cause as Error).message); })
      .finally(() => { if (current) setLoading(false); });
    return () => { current = false; };
  }, [status]);

  async function loadMore() {
    if (!cursor || loadingMore) return;
    setLoadingMore(true);
    setError('');
    try {
      const page = await api<Page>(`/api/sessions?limit=20${status ? `&status=${status}` : ''}&cursor=${encodeURIComponent(cursor)}`);
      setItems(previous => [...previous, ...page.items.filter(item => !previous.some(existing => existing.id === item.id))]);
      setCursor(page.nextCursor);
    } catch (cause) { setError((cause as Error).message); }
    finally { setLoadingMore(false); }
  }

  async function remove(id:string) {
    if (!await ask('确定删除这条训练及其全部消息和报告吗？')) return;
    try {
      await api(`/api/sessions/${id}`, {method:'DELETE'});
      setItems(previous => previous.filter(item => item.id !== id));
    } catch (cause) { setError((cause as Error).message); }
  }

  return <main className="mx-auto max-w-6xl p-6 md:p-10">
    {confirmation}
    <header className="flex justify-between"><Link href="/" className="font-bold text-teal-800">◈ 销售陪练</Link><Link href="/create" className="text-teal-700">新建训练 →</Link></header>
    <h1 className="mt-12 text-4xl font-bold">训练历史</h1>
    <p className="mt-3 text-slate-600">回看每一次对话和改进建议。</p>
    <StudioChoice label="状态筛选" className="mt-8" value={status} onChange={next => {setStatus(next);setItems([]);setCursor(null);setError('');setLoading(true)}} options={[
      { value: '', label: '全部' }, { value: 'active', label: '进行中' }, { value: 'replying', label: '回复中' },
      { value: 'completed', label: '已完成' }, { value: 'failed', label: '失败' }, { value: 'finishing', label: '生成中' },
    ]} />
    {loading ? <p className="mt-8">正在加载…</p> : items.length === 0 && !error ? <div className="mt-8 rounded-xl border border-dashed p-10 text-slate-500">暂无训练记录。<Link href="/create" className="text-teal-700 underline">开始第一次练习</Link></div> : <div className="mt-6 divide-y border-y">{items.map(item => <article key={item.id} className="flex flex-wrap items-center justify-between gap-4 py-5"><div><h2 className="text-lg font-bold">{item.scenario.product}</h2><p className="text-sm text-slate-500">{item.focusDimension ? `专项训练：${focusDetails[item.focusDimension].label}` : '普通训练'} · {item.scenario.personality} · {item.scenario.difficulty} · {new Date(item.createdAt).toLocaleString('zh-CN')} · {item.status} · {item.score === null ? '未评分' : `${reportSourceLabels[item.scoreSource ?? 'mock']} ${item.score}/20`}</p></div><div className="flex flex-wrap gap-3 text-sm"><Link href={`/train/${item.id}`} className="text-teal-700">训练详情</Link>{item.status === 'completed' && <Link href={`/report/${item.id}`} className="text-teal-700">报告</Link>}<Link href={`/create?from=${item.id}`} className="text-teal-700">再次练习</Link><button onClick={() => remove(item.id)} className="text-red-700">删除</button></div></article>)}</div>}
    {error && <p role="alert" className="mt-4 text-red-700">{error}</p>}
    {cursor && !loading && <button onClick={loadMore} disabled={loadingMore} className="mt-6 rounded-lg border px-5 py-2 text-teal-700 disabled:opacity-50">{loadingMore ? '正在加载…' : '加载更多'}</button>}
  </main>;
}
