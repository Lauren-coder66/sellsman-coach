'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { Suspense, useEffect, useRef, useState } from 'react';
import { api } from '@/lib/client';
import type { Scenario } from '@/lib/ai/provider';

type Msg = { id: string; role: 'user' | 'customer'; content: string; sequence: number; createdAt: number };
type Data = { session: { id: string; scenario: Scenario; status: string }; messages: Msg[] };

function TrainContent() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [data, setData] = useState<Data | null>(null);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const bottom = useRef<HTMLDivElement>(null);
  const request = useRef<{ id: string; content: string } | null>(null);

  async function load(): Promise<Data | null> {
    try {
      const current = await api<Data>(`/api/sessions/${id}`);
      setData(current);
      setError('');
      return current;
    } catch (cause) {
      setError((cause as Error).message);
      return null;
    } finally { setLoading(false); }
  }
  useEffect(() => {
    api<Data>(`/api/sessions/${id}`).then(setData).catch(cause => setError((cause as Error).message)).finally(() => setLoading(false));
  }, [id]);
  useEffect(() => { bottom.current?.scrollIntoView({ behavior: 'smooth' }); }, [data?.messages.length, busy]);

  const pending = data?.messages.at(-1)?.role === 'user' ? data.messages.at(-1) : undefined;
  const turns = data?.messages.filter(message => message.role === 'user').length ?? 0;

  async function send(retry = false) {
    if (busy || !data) return;
    const content = retry && pending ? pending.content : input.trim();
    if (!content || content.length > 1000) return;
    if (retry ? !pending || !['active', 'replying'].includes(data.session.status) : data.session.status !== 'active' || !!pending || turns >= 30) return;
    const requestId = retry && pending ? pending.id : request.current?.content === content ? request.current.id : crypto.randomUUID();
    request.current = { id: requestId, content };
    setBusy(true);
    setError('');
    try {
      await api(`/api/sessions/${id}/messages`, { method: 'POST', body: JSON.stringify({ content, requestId }) });
      request.current = null;
      setInput('');
      await load();
    } catch (cause) {
      const current = await load();
      if (current?.messages.some(message => message.id === requestId)) setInput('');
      setError((cause as Error).message);
    } finally { setBusy(false); }
  }

  async function finish() {
    if (busy || !data || !['active', 'failed', 'finishing', 'completed'].includes(data.session.status)) return;
    if (data.session.status === 'active' && !confirm('确定结束本次训练并生成演示报告吗？')) return;
    setBusy(true);
    setError('');
    try {
      await api(`/api/sessions/${id}/finish`, { method: 'POST' });
      router.push(`/report/${id}`);
    } catch (cause) {
      await load();
      setError((cause as Error).message);
    } finally { setBusy(false); }
  }

  const finishLabel = data?.session.status === 'failed' ? '重试生成报告' : data?.session.status === 'finishing' ? '检查报告状态' : data?.session.status === 'completed' ? '查看或恢复报告' : '结束训练';
  return <main className="mx-auto flex h-dvh max-w-6xl flex-col p-4">
    <header className="flex items-center justify-between gap-3 border-b bg-white p-4">
      <div><Link href="/" className="text-sm text-teal-700">◈ 销售陪练</Link><h1 className="text-xl font-bold">{data?.session.scenario.product || '训练工作台'}</h1><p className="text-sm text-slate-500">{data?.session.scenario.identity} · {data?.session.scenario.personality} · {data?.session.scenario.difficulty} · {data?.session.status || '加载中'}</p></div>
      <button onClick={finish} disabled={busy || !data || !['active', 'failed', 'finishing', 'completed'].includes(data.session.status)} className="rounded-lg border px-4 py-2 disabled:opacity-50">{finishLabel}</button>
    </header>
    <p className="bg-amber-50 px-4 py-2 text-sm text-amber-900">演示模式：当前客户回复由本地规则模拟，并非真实 AI。 · {turns}/30 轮</p>
    <section className="min-h-0 flex-1 space-y-4 overflow-y-auto bg-slate-100 p-4">
      {loading && <p>正在恢复对话…</p>}
      {data?.messages.map(message => <div key={message.id} className={`max-w-[85%] rounded-xl p-4 ${message.role === 'user' ? 'ml-auto bg-teal-700 text-white' : 'bg-white'}`}><div className="mb-2 text-xs opacity-70">{message.role === 'user' ? '销售人员' : '模拟客户'} · {new Date(message.createdAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}</div>{message.content}</div>)}
      {busy && <p className="text-sm text-slate-500">正在处理请求…</p>}
      <div ref={bottom} />
    </section>
    {error && <div role="alert" className="bg-red-50 p-3 text-red-700">{error} <button onClick={load} className="underline">重新读取</button></div>}
    {pending && ['active', 'replying'].includes(data?.session.status ?? '') && <div className="bg-amber-50 p-3 text-amber-900">这条发言已保存，客户回复尚未完成。<button onClick={() => send(true)} disabled={busy} className="ml-2 underline disabled:opacity-50">重试客户回复</button></div>}
    {data?.session.status === 'completed' && <Link href={`/report/${id}`} className="p-3 text-teal-700">训练已结束，查看报告 →</Link>}
    <div className="flex gap-3 bg-white p-3"><textarea value={input} onChange={event => setInput(event.target.value)} onKeyDown={event => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); send(); } }} maxLength={1000} disabled={busy || !data || data.session.status !== 'active' || !!pending || turns >= 30} placeholder="输入回应 · Enter 发送，Shift+Enter 换行" className="min-h-20 flex-1 rounded-lg border p-3" /><button onClick={() => send()} disabled={busy || !data || data.session.status !== 'active' || !!pending || !input.trim() || turns >= 30} className="rounded-lg bg-teal-700 px-5 text-white disabled:opacity-50">发送</button></div>
  </main>;
}

export default function Train() { return <Suspense fallback={<p className="p-6">加载训练…</p>}><TrainContent /></Suspense>; }


