'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { Suspense, useEffect, useRef, useState } from 'react';
import { api } from '@/lib/client';
import { useStudioConfirm } from '@/components/studio-confirm';
import type { Scenario } from '@/lib/ai/provider';
import { focusDetails, type FocusDimension } from '@/lib/focus';

type Msg = { id: string; role: 'user' | 'customer'; content: string; sequence: number; createdAt: number };
type Data = { session: { id: string; scenario: Scenario; status: string; aiMode: 'mock' | 'real'; aiModel?: string; focus: { dimension: FocusDimension; sourceSessionId: string; sourceAvailable: boolean } | null }; messages: Msg[] };

function TrainContent() {
  const { ask, confirmation } = useStudioConfirm();
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [data, setData] = useState<Data | null>(null);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const transcript = useRef<HTMLElement>(null);
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
  useEffect(() => {
    const panel = transcript.current;
    if (panel) panel.scrollTop = panel.scrollHeight;
  }, [data?.messages.length, busy]);

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
      const saved = current?.messages.find(message => message.id === requestId);
      if (saved) {
        request.current = null;
        setInput('');
      }
      if (!saved || !current?.messages.some(message => message.role === 'customer' && message.sequence === saved.sequence + 1)) {
        setError((cause as Error).message);
      }
    } finally { setBusy(false); }
  }

  async function finish() {
    if (busy || !data || !['active', 'failed', 'finishing', 'completed'].includes(data.session.status)) return;
    if (data.session.status === 'active' && !await ask('确定结束本次训练并生成报告吗？')) return;
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
  return <main className="mx-auto flex h-dvh max-w-6xl flex-col p-2.5 sm:p-5">
    {confirmation}
    <header className="flex items-center justify-between gap-3 rounded-t-xl border border-black/10 bg-white p-3 sm:p-5">
      <div className="min-w-0 [overflow-wrap:anywhere]"><Link href="/" className="text-sm font-bold text-teal-700">销售陪练</Link><h1 className="mt-1 text-lg font-bold sm:text-2xl">{data?.session.scenario.product || '训练工作台'}</h1>{data && <p className="text-xs text-slate-600 sm:text-sm">{data.session.scenario.identity} · {data.session.scenario.personality} · {data.session.scenario.difficulty}</p>}</div>
      <div className="flex shrink-0 flex-col items-end gap-1 sm:flex-row sm:items-center sm:gap-3">
        {data?.session.status === 'active' && <Link className="text-sm text-teal-700 underline" href={`/train/${id}/voice`}>语音练习</Link>}
        <button onClick={finish} disabled={busy || !data || !['active', 'failed', 'finishing', 'completed'].includes(data.session.status)} className="min-h-11 rounded-lg border border-slate-400 bg-white px-3 py-2 text-sm font-semibold hover:bg-teal-50 disabled:opacity-50">{finishLabel}</button>
      </div>
    </header>
    {data && <p className="bg-amber-50 px-4 py-2 text-sm text-amber-900 [overflow-wrap:anywhere]">{data.session.aiMode === 'real' ? `真实 AI 客户对练${data.session.aiModel ? ` · ${data.session.aiModel}` : ''}` : '演示模式：当前客户回复由本地规则模拟，并非真实 AI。'} · {turns}/30 轮</p>}
    {data?.session.focus && <p className="bg-teal-50 px-4 py-3 text-sm text-teal-900"><b>本次训练重点：{focusDetails[data.session.focus.dimension].label}</b> · {focusDetails[data.session.focus.dimension].instruction}</p>}
    <section ref={transcript} aria-label="训练对话" className="studio-transcript min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain p-4 sm:px-8">
      {loading && <p>正在恢复对话…</p>}
      {data?.messages.map(message => <div key={message.id} data-role={message.role} className={`studio-message w-fit max-w-[88%] p-3.5 shadow-sm [overflow-wrap:anywhere] sm:max-w-[72%] ${message.role === 'user' ? 'ml-auto bg-teal-700 text-white' : 'bg-white'}`}><div className={`mb-1 text-xs font-semibold ${message.role === 'user' ? 'text-teal-100' : 'text-teal-800'}`}>{message.role === 'user' ? '销售人员' : '模拟客户'} · {new Date(message.createdAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}</div><p className="whitespace-pre-wrap leading-relaxed">{message.content}</p></div>)}
      {busy && <p role="status" className="text-sm text-slate-500">正在处理请求…</p>}
    </section>
    {error && <div role="alert" className="bg-red-50 p-3 text-red-700">{error} <button onClick={load} className="underline">重新读取</button></div>}
    {pending && ['active', 'replying'].includes(data?.session.status ?? '') && <div className="bg-amber-50 p-3 text-amber-900">这条发言已保存，客户回复尚未完成。<button onClick={() => send(true)} disabled={busy} className="ml-2 underline disabled:opacity-50">重试客户回复</button></div>}
    {data?.session.status === 'completed' && <Link href={`/report/${id}`} className="p-3 text-teal-700">训练已结束，查看报告 →</Link>}
    <div className="flex items-end gap-2 rounded-b-xl border border-black/10 bg-white p-2.5 sm:gap-3 sm:p-4">
      <textarea aria-label="输入回应" value={input} onChange={event => setInput(event.target.value)} onKeyDown={event => {
        if (event.key !== 'Enter' || event.shiftKey || event.nativeEvent.isComposing || event.nativeEvent.keyCode === 229) return;
        event.preventDefault();
        void send();
      }} maxLength={1000} disabled={busy || !data || data.session.status !== 'active' || !!pending || turns >= 30} placeholder="输入回应 · Enter 发送，Shift+Enter 换行" className="h-18 min-w-0 flex-1 resize-none rounded-lg border border-slate-400 bg-slate-50 p-2.5 sm:h-22" />
      <button onClick={() => send()} disabled={busy || !data || data.session.status !== 'active' || !!pending || !input.trim() || turns >= 30} className="min-h-11 shrink-0 rounded-lg bg-teal-700 px-4 font-semibold text-white hover:bg-teal-800 disabled:opacity-50">发送</button>
    </div>
  </main>;
}

export default function Train() { return <Suspense fallback={<p className="p-6">加载训练…</p>}><TrainContent /></Suspense>; }


