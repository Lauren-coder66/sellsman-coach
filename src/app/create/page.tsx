'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useRef, useState } from 'react';
import { ScenarioFields } from '@/components/scenario-fields';
import { templates } from '@/lib/templates';
import { api } from '@/lib/client';
import { focusDetails, type FocusDimension } from '@/lib/focus';
import type { Scenario } from '@/lib/ai/provider';

type SavedItem = { id: string; name: string; scenario: Scenario };
const blank: Scenario = { product: '', description: '', identity: '中小企业负责人', personality: '普通型', difficulty: '中等', goal: '了解客户需求' };

function Form() {
  const router = useRouter();
  const params = useSearchParams();
  const [scenario, setScenario] = useState<Scenario>(blank);
  const [name, setName] = useState('');
  const [personal, setPersonal] = useState<SavedItem[]>([]);
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [aiMode, setAiMode] = useState<'mock' | 'real'>(() => params.get('mode') === 'real' ? 'real' : 'mock');
  const [model, setModel] = useState(() => params.get('model') ?? '');
  const [models, setModels] = useState<string[] | null>(null);
  const canStart = aiMode === 'mock' || Boolean(models?.includes(model));
  const creation = useRef<{ requestId: string; body: string } | null>(null);
  const savedId = params.get('scenario');
  const sessionId = params.get('from');
  const sourceKey = savedId ? `scenario:${savedId}` : sessionId ? `session:${sessionId}` : null;
  const [loadedSource, setLoadedSource] = useState<string | null>(null);
  const sourceLoading = sourceKey !== null && loadedSource !== sourceKey;
  const focusParam = params.get('focus');
  const focus = focusParam && focusParam in focusDetails ? focusParam as FocusDimension : null;
  const sourceSessionId = sessionId;
  const focusError = focusParam && !focus ? '专项训练维度无效' : focus && !sourceSessionId ? '缺少来源训练' : '';

  useEffect(() => {
    api<{ items: SavedItem[] }>('/api/scenarios').then(data => setPersonal(data.items)).catch(cause => setError((cause as Error).message));
    api<{ models: string[] }>('/api/ai-mode').then(data => setModels(data.models)).catch(() => setModels([]));
  }, []);
  useEffect(() => {
    let current = true;
    if (savedId) {
      api<SavedItem>(`/api/scenarios/${savedId}`).then(item => { if (current) { setScenario(item.scenario); setName(item.name); } }).catch(cause => { if (current) setError((cause as Error).message); }).finally(() => { if (current) setLoadedSource(sourceKey); });
    } else if (sessionId) {
      api<{ session: { scenario: Scenario } }>(`/api/sessions/${sessionId}`).then(data => { if (current) setScenario(data.session.scenario); }).catch(cause => { if (current) setError((cause as Error).message); }).finally(() => { if (current) setLoadedSource(sourceKey); });
    }
    return () => { current = false; };
  }, [savedId, sessionId, sourceKey]);

  async function start(event: React.FormEvent) {
    event.preventDefault();
    if (busy || saving || sourceLoading || !canStart) return;
    if (focusError) { setError(focusError); return; }
    setBusy(true);
    setError('');
    try {
      const setup = { ...scenario, mode: aiMode, ...(aiMode === 'real' ? { model } : {}) };
      const payload = focus && sourceSessionId ? { ...setup, sourceSessionId, focusDimension: focus } : setup;
      const body = JSON.stringify(payload);
      const requestId = creation.current?.body === body ? creation.current.requestId : crypto.randomUUID();
      creation.current = { requestId, body };
      const created = await api<{ id: string }>('/api/sessions', { method: 'POST', body: JSON.stringify({ ...payload, requestId }) });
      creation.current = null;
      router.push(`/train/${created.id}`);
    } catch (cause) { setError((cause as Error).message); }
    finally { setBusy(false); }
  }

  async function save() {
    if (busy || saving || sourceLoading) return;
    if (!name.trim()) { setError('请填写场景名称'); return; }
    setSaving(true);
    setError('');
    setNotice('');
    try {
      const item = await api<SavedItem>('/api/scenarios', { method: 'POST', body: JSON.stringify({ name, ...scenario }) });
      setPersonal(previous => [item, ...previous]);
      setNotice('已保存到我的场景');
    } catch (cause) { setError((cause as Error).message); }
    finally { setSaving(false); }
  }

  function choose(item: { name: string; scenario: Scenario }) {
    setScenario({ ...item.scenario });
    setName(item.name);
    setError('');
    setNotice('');
  }

  return <main className="mx-auto max-w-5xl p-6 md:p-10">
    <header className="studio-nav"><Link href="/" className="studio-brand"><span className="studio-mark" aria-hidden="true"><i /><i /></span>销售陪练</Link><nav aria-label="训练导航" className="studio-links"><Link href="/scenarios">我的场景</Link><Link href="/history">历史训练</Link><Link href="/account">账号</Link></nav></header>
    <h1 className="studio-page-title mt-8 md:mt-11">创建训练场景</h1>
    <p className="mt-3 text-slate-600">先选择模板，或填写自己的产品与客户。每次训练都会新建会话。</p>
    {aiMode && <p className="mt-3 text-sm text-amber-800">{aiMode === 'real' ? '真实 AI 模式：客户回复和训练报告由已配置的模型生成。' : '演示模式：当前客户由本地规则模拟，并非真实 AI。'}</p>}
    {sourceLoading && <p role="status" className="mt-4 text-slate-600">正在载入训练场景…</p>}
    {focus && <div className="mt-6 rounded-xl border border-teal-200 bg-teal-50 p-5"><p className="font-bold text-teal-900">本次专项训练重点：{focusDetails[focus].label}</p><p className="mt-2 text-teal-800">{focusDetails[focus].instruction}</p></div>}
    <div className="mt-8 grid items-start gap-7 lg:grid-cols-[16rem_minmax(0,1fr)]">
      <aside className="min-w-0 space-y-6">
        <section><h2 className="text-xl font-bold">系统模板</h2><div className="mt-3 grid grid-cols-2 gap-2 lg:grid-cols-1">{templates.map(template => <button type="button" key={template.title} disabled={sourceLoading} onClick={() => choose({ name: template.title, scenario: template.scenario })} className="studio-template">{template.title}</button>)}</div></section>
        <section className="border-t border-black/10 pt-5"><h2 className="text-lg font-bold">个人模板</h2><Link href="/scenarios" className="mt-1 inline-block text-sm text-teal-700 underline-offset-4 hover:underline">管理我的场景 →</Link><div className="mt-3 grid grid-cols-2 gap-2 lg:grid-cols-1">{personal.length ? personal.map(item => <button type="button" key={item.id} disabled={sourceLoading} onClick={() => choose(item)} className="studio-template [overflow-wrap:anywhere]">{item.name}</button>) : <p className="col-span-full text-sm text-slate-600">保存自己的场景后，可在这里直接复用。</p>}</div></section>
      </aside>
    <form onSubmit={start} className="studio-sheet grid min-w-0 gap-5 p-5 md:grid-cols-2 md:p-7">
      <h2 className="border-b border-black/10 pb-4 text-xl font-bold md:col-span-2">排练设置</h2>
      <label className="grid gap-2">训练模式<select value={aiMode} onChange={event => {
        const next = event.target.value === 'real' ? 'real' : 'mock';
        setAiMode(next);
        if (next === 'real' && !models?.includes(model)) setModel(models?.[0] ?? '');
      }} className="min-h-11 rounded-lg border px-3">
        <option value="mock">Mock 模拟</option>
        <option value="real" disabled={!models?.length}>真实 AI{models?.length ? '' : '（当前不可用）'}</option>
      </select></label>
      {aiMode === 'real' && <label className="grid gap-2">AI 模型<select value={model} onChange={event => setModel(event.target.value)} className="min-h-11 rounded-lg border px-3">
        <option value="">选择模型</option>
        {models?.map(id => <option key={id} value={id}>{id}</option>)}
      </select></label>}
      <fieldset disabled={sourceLoading} className="contents"><label className="grid gap-2 md:col-span-2">场景名称（保存个人场景时必填）<input maxLength={80} value={name} onChange={event => setName(event.target.value)} className="rounded-lg border p-3" /></label>
      <ScenarioFields scenario={scenario} onChange={setScenario} /></fieldset>
      {(error || focusError) && <p role="alert" className="text-red-700 md:col-span-2">{error || focusError}</p>}
      {notice && <p role="status" className="text-teal-700 md:col-span-2">{notice}</p>}
      <div className="flex flex-wrap gap-3 md:col-span-2"><button type="button" onClick={save} disabled={busy || saving || sourceLoading} className="rounded-xl border border-teal-700 px-5 py-4 font-bold text-teal-700 disabled:opacity-50">{saving ? '正在保存…' : '保存为个人场景'}</button><button disabled={busy || saving || sourceLoading || !canStart} className="flex-1 rounded-xl bg-teal-700 p-4 font-bold text-white disabled:opacity-50">{busy ? (aiMode === 'real' ? '正在生成客户场景…' : '正在创建…') : aiMode === 'real' ? '开始文字训练 →' : '开始模拟训练 →'}</button></div>
    </form>
    </div>
  </main>;
}

export default function Create() { return <Suspense fallback={<p className="p-6">加载中…</p>}><Form /></Suspense>; }
