'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { ScenarioFields } from '@/components/scenario-fields';
import { api } from '@/lib/client';
import { templates } from '@/lib/templates';
import type { Scenario } from '@/lib/ai/provider';

type Item = { id: string; name: string; scenario: Scenario; createdAt: number; updatedAt: number };
const blank: Scenario = { product: '', description: '', identity: '中小企业负责人', personality: '普通型', difficulty: '中等', goal: '了解客户需求' };

export default function Scenarios() {
  const [items, setItems] = useState<Item[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [scenario, setScenario] = useState<Scenario>(blank);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  useEffect(() => {
    api<{ items: Item[] }>('/api/scenarios').then(data => setItems(data.items)).catch(cause => setError((cause as Error).message)).finally(() => setLoading(false));
  }, []);

  function choose(item: { id?: string; name: string; scenario: Scenario }) {
    setSelectedId(item.id ?? null);
    setName(item.name);
    setScenario({ ...item.scenario });
    setError('');
    setNotice('');
  }

  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const item = await api<Item>(selectedId ? `/api/scenarios/${selectedId}` : '/api/scenarios', {
        method: selectedId ? 'PUT' : 'POST',
        body: JSON.stringify({ name, ...scenario }),
      });
      setItems(previous => selectedId ? previous.map(existing => existing.id === item.id ? item : existing) : [item, ...previous]);
      setSelectedId(item.id);
      setNotice('场景已保存');
    } catch (cause) { setError((cause as Error).message); }
    finally { setBusy(false); }
  }

  async function remove(id: string) {
    if (!confirm('确定删除这个个人场景吗？历史训练不会被删除。')) return;
    setError('');
    try {
      await api(`/api/scenarios/${id}`, { method: 'DELETE' });
      setItems(previous => previous.filter(item => item.id !== id));
      if (selectedId === id) choose({ name: '', scenario: blank });
      setNotice('场景已删除，历史训练不受影响');
    } catch (cause) { setError((cause as Error).message); }
  }

  return <main className="mx-auto max-w-6xl p-6 md:p-10">
    <header className="flex justify-between"><Link href="/" className="font-bold text-teal-800">◈ 销售陪练</Link><nav className="flex gap-4"><Link href="/create">创建训练</Link><Link href="/history">训练历史</Link></nav></header>
    <h1 className="mt-12 text-4xl font-bold">我的场景</h1>
    <p className="mt-3 text-slate-600">保存常用产品与客户设定。训练时可以再调整，历史训练保留当时的场景快照。</p>

    <section className="mt-10"><h2 className="text-2xl font-bold">个人模板</h2>
      {loading ? <p className="mt-4">正在加载…</p> : items.length === 0 ? <p className="mt-4 rounded-xl border border-dashed p-6 text-slate-500">暂无个人场景。可以从空白开始，或复制下方系统模板。</p> : <div className="mt-4 grid gap-3 md:grid-cols-2">{items.map(item => <article key={item.id} className="rounded-xl border bg-white p-5"><h3 className="text-lg font-bold">{item.name}</h3><p className="mt-2 text-sm text-slate-600">{item.scenario.product} · {item.scenario.identity} · {item.scenario.personality} · {item.scenario.difficulty} · {item.scenario.goal}</p><div className="mt-4 flex flex-wrap gap-4 text-sm"><button type="button" onClick={() => choose(item)} className="text-teal-700">编辑</button><Link href={`/create?scenario=${item.id}`} className="text-teal-700">使用场景开始训练</Link><button type="button" onClick={() => remove(item.id)} className="text-red-700">删除</button></div></article>)}</div>}
    </section>

    <section className="mt-10"><h2 className="text-2xl font-bold">系统模板</h2><p className="mt-2 text-sm text-slate-500">系统模板不可修改或删除；可以复制后保存为个人场景。</p><div className="mt-4 grid gap-3 md:grid-cols-3">{templates.map(template => <article key={template.title} className="rounded-xl border bg-white p-5"><h3 className="font-bold">{template.title}</h3><p className="mt-2 text-sm text-slate-600">{template.scenario.product} · {template.scenario.identity}</p><button type="button" onClick={() => choose({ name: template.title, scenario: template.scenario })} className="mt-4 text-sm text-teal-700">复制并编辑</button></article>)}</div></section>

    <section className="mt-10 rounded-2xl bg-white p-6"><div className="flex items-center justify-between"><h2 className="text-2xl font-bold">{selectedId ? '编辑个人场景' : '创建个人场景'}</h2><button type="button" onClick={() => choose({ name: '', scenario: blank })} className="text-teal-700">新建空白场景</button></div>
      <form onSubmit={save} className="mt-5 grid gap-5 md:grid-cols-2"><label className="grid gap-2 md:col-span-2">场景名称<input required maxLength={80} value={name} onChange={event => setName(event.target.value)} className="rounded-lg border p-3" /></label><ScenarioFields scenario={scenario} onChange={setScenario} />{error && <p role="alert" className="text-red-700 md:col-span-2">{error}</p>}{notice && <p role="status" className="text-teal-700 md:col-span-2">{notice}</p>}<button disabled={busy} className="rounded-xl bg-teal-700 p-4 font-bold text-white disabled:opacity-50 md:col-span-2">{busy ? '正在保存…' : selectedId ? '保存修改' : '保存个人场景'}</button></form>
    </section>
  </main>;
}
