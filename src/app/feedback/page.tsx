'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { api } from '@/lib/client';

type Category = 'problem' | 'suggestion' | 'other';
type Feedback = { id: string; category: Category; content: string; createdAt: number };
const labels: Record<Category, string> = { problem: '遇到问题', suggestion: '改进建议', other: '其他反馈' };

export default function FeedbackPage() {
  const [category, setCategory] = useState<Category>('problem');
  const [content, setContent] = useState('');
  const [items, setItems] = useState<Feedback[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const request = useRef<{ key: string; id: string } | null>(null);

  useEffect(() => {
    let current = true;
    api<{ items: Feedback[] }>('/api/account/feedback')
      .then(result => { if (current) setItems(result.items); })
      .catch(cause => { if (current) setError((cause as Error).message); });
    return () => { current = false; };
  }, []);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;
    const text = content.trim();
    if (text.length < 10 || text.length > 1500) return;
    const key = JSON.stringify({ category, content: text });
    const requestId = request.current?.key === key ? request.current.id : crypto.randomUUID();
    request.current = { key, id: requestId };
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await api('/api/account/feedback', { method: 'POST', body: JSON.stringify({ requestId, category, content: text }) });
      request.current = null;
      setContent('');
      setNotice('反馈已保存。感谢你说明具体问题。');
      const latest = await api<{ items: Feedback[] }>('/api/account/feedback').catch(() => null);
      if (latest) setItems(latest.items);
    } catch (cause) { setError((cause as Error).message); }
    finally { setBusy(false); }
  }

  return <main className="mx-auto max-w-2xl space-y-6 p-5 md:p-10">
    <Link href="/" className="text-teal-700">返回销售陪练</Link>
    <h1 className="text-3xl font-bold">反馈与建议</h1>
    <p className="text-slate-600">描述遇到的问题或希望改善的地方。请勿填写真实客户资料、密码或密钥。反馈会保存在你的账号下，每天最多提交 3 条。</p>
    <form onSubmit={submit} className="space-y-4 rounded-xl border bg-white p-5">
      <label className="block">反馈类型<select value={category} onChange={event => setCategory(event.target.value as Category)} className="mt-2 block w-full rounded-lg border p-3">{Object.entries(labels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      <label className="block">具体内容<textarea required minLength={10} maxLength={1500} value={content} onChange={event => setContent(event.target.value)} className="mt-2 min-h-36 w-full rounded-lg border p-3" placeholder="例如：在哪个页面、做了什么、实际出现了什么" /></label>
      {error && <p role="alert" className="text-red-700">{error} <Link href="/account" className="underline">检查登录状态</Link></p>}
      {notice && <p role="status" className="text-teal-700">{notice}</p>}
      <button disabled={busy || content.trim().length < 10} className="rounded-lg bg-teal-700 px-5 py-3 text-white disabled:opacity-50">{busy ? '正在提交…' : '提交反馈'}</button>
    </form>
    <section><h2 className="text-xl font-semibold">我提交的反馈</h2>{items.length ? <ul className="mt-3 space-y-3">{items.map(item => <li key={item.id} className="rounded-lg border p-4"><b>{labels[item.category]}</b><span className="ml-3 text-sm text-slate-500">{new Date(item.createdAt).toLocaleString('zh-CN')}</span><p className="mt-2 whitespace-pre-wrap [overflow-wrap:anywhere]">{item.content}</p></li>)}</ul> : <p className="mt-3 text-slate-500">暂无反馈记录。</p>}</section>
  </main>;
}
