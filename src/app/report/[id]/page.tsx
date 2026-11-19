'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';
import { api } from '@/lib/client';
import { focusDetails, focusDimensions, type FocusDimension } from '@/lib/focus';
import { reportSource, reportSourceLabels, type ScoredReport } from '@/lib/report';

type Report = Omit<ScoredReport, 'scores'> & { scores: ScoredReport['scores'] | null };
type Message = { id: string; role: string; content: string };
type SessionData = { session: { focus: { dimension: FocusDimension; sourceSessionId: string; sourceAvailable: boolean } | null }; messages: Message[] };

function ReportContent() {
  const { id } = useParams<{ id: string }>();
  const [report, setReport] = useState<Report | null>(null);
  const [session, setSession] = useState<SessionData['session'] | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [error, setError] = useState('');
  const [show, setShow] = useState(false);

  useEffect(() => {
    api<Report>(`/api/sessions/${id}/report`).then(setReport).catch(cause => setError((cause as Error).message));
    api<SessionData>(`/api/sessions/${id}`).then(data => { setSession(data.session); setMessages(data.messages); }).catch(cause => setError((cause as Error).message));
  }, [id]);

  const scores = report?.scores;
  const total = scores ? focusDimensions.reduce((sum, dimension) => sum + scores[dimension].score, 0) : null;
  const lowestScore = scores ? Math.min(...focusDimensions.map(dimension => scores[dimension].score)) : null;
  const lowest = scores ? focusDimensions.filter(dimension => scores[dimension].score === lowestScore) : [];
  const focus = session?.focus;
  const source = report ? reportSource(report) : null;

  return <main className="mx-auto max-w-5xl p-6 md:p-10">
    <header className="studio-nav"><Link href="/" className="studio-brand"><span className="studio-mark" aria-hidden="true"><i /><i /></span>销售陪练</Link><nav aria-label="报告导航" className="studio-links"><Link href="/history">训练历史</Link></nav></header>
    <h1 className="studio-page-title mt-8 md:mt-11">训练复盘</h1>
    {source && <p className="mt-3 text-sm text-amber-800">{source === 'real' ? `真实 AI 评分 · 基于本次对话的训练反馈${report?.scoringModel ? ` · ${report.scoringModel}` : ''}` : '演示报告：评分由本地规则生成，不属于真实 AI 评估。'}</p>}
    {error && <p role="alert" className="mt-6 text-red-700">{error}</p>}
    {!report && !error && <p className="mt-8">正在加载报告…</p>}
    {report && <>
      {focus && <section className="mt-8 rounded-xl bg-teal-50 p-5 text-teal-900"><b>本次训练重点：{focusDetails[focus.dimension].label}</b><p className="mt-2">{focusDetails[focus.dimension].instruction}</p>{focus.sourceAvailable && <Link href={`/train/${focus.sourceSessionId}`} className="mt-3 inline-block underline">返回来源训练</Link>}</section>}
      <section aria-label="本次训练总结" className="studio-score mt-8 p-6 md:p-8"><div className="flex flex-wrap items-center gap-6 md:flex-nowrap md:gap-9"><div className="shrink-0"><p className="mb-2 text-sm text-teal-200">训练总分</p><span className="text-6xl font-bold tracking-tight tabular-nums">{total ?? '—'}</span><span className="text-teal-200"> / 20</span></div><div className="min-w-0"><p className="text-lg font-bold">客户态度：{report.customer_outcome}</p><p className="mt-2 leading-relaxed text-slate-200">{report.summary}</p></div></div>{total === null && <p className="mt-5 border-t border-white/20 pt-4 text-amber-100">训练样本不足，少于3轮不生成正式能力评分。你仍可手动选择专项练习。</p>}</section>
      {report.scores && <section className="mt-10"><h2 className="text-2xl font-bold">四项能力</h2><div className="mt-5 grid gap-6 md:grid-cols-2">{focusDimensions.map(dimension => <div key={dimension}><div className="flex justify-between"><b>{focusDetails[dimension].label}</b><span>{report.scores![dimension].score}/5</span></div><div className="mt-2 h-2 rounded bg-slate-200"><div className="h-full rounded bg-teal-600" style={{ width: `${report.scores![dimension].score * 20}%` }} /></div><p className="mt-2 text-sm text-slate-600">{report.scores![dimension].reason}</p></div>)}</div></section>}
      <section className="mt-12"><h2 className="text-2xl font-bold">针对性练习</h2><p className="mt-2 text-sm text-slate-600">{source && lowest.length ? `根据${reportSourceLabels[source]}，${lowest.map(dimension => focusDetails[dimension].label).join('、')}${lowest.length > 1 ? '并列' : '为'}本次最低分。你可以选择任一维度。` : '本次没有正式评分，请自行选择练习重点。'}</p><div className="mt-5 grid gap-3 md:grid-cols-2">{focusDimensions.map(dimension => <Link key={dimension} href={`/create?from=${id}&focus=${dimension}`} className={`rounded-xl border p-5 hover:border-teal-600 ${lowest.includes(dimension) ? 'border-teal-600 bg-teal-50' : 'bg-white'}`}><div className="flex justify-between gap-3"><b>{focusDetails[dimension].label}</b>{lowest.includes(dimension) && <span className="text-xs text-teal-800">{source === 'mock' ? 'Mock 演示最低分' : '本次 AI 最低分'}</span>}</div><p className="mt-2 text-sm text-slate-600">{focusDetails[dimension].instruction}</p></Link>)}</div></section>
      <section className="mt-12"><h2 className="text-2xl font-bold">具体问题定位</h2>{report.issues.length ? report.issues.map((issue, index) => {
        const original = messages.find(message => message.id === issue.message_id && message.role === 'user');
        return <article key={`${issue.message_id}-${index}`} className="studio-sheet mt-4 p-5 [overflow-wrap:anywhere]">
          <blockquote className="border-l-3 border-teal-600 pl-3 text-lg font-semibold">「{issue.quote}」</blockquote>
          {original ? <details className="mt-2 text-sm text-slate-700"><summary className="cursor-pointer text-teal-700">查看引用的完整发言</summary><p className="mt-2 whitespace-pre-wrap">{original.content}</p></details> : <p className="mt-2 text-xs text-slate-500">原始消息 ID：{issue.message_id}</p>}
          <p className="mt-3">{issue.problem}：{issue.reason}</p><p className="mt-2 text-teal-800">建议：{issue.suggestion}</p><p className="mt-2 font-medium text-teal-800">推荐表达：{issue.better_expression}</p>
        </article>;
      }) : <p className="mt-4 text-slate-500">本次没有可引用的具体问题。</p>}</section>
      <section className="mt-12 grid gap-6 md:grid-cols-2"><div><h2 className="font-bold">做得好的地方</h2>{report.strengths.map(value => <p key={value} className="mt-2">• {value}</p>)}</div><div><h2 className="font-bold">需要改善</h2>{report.improvements.map(value => <p key={value} className="mt-2">• {value}</p>)}</div></section>
      <p className="mt-8 rounded-xl bg-teal-50 p-5">下一次训练：{report.next_training_suggestion}</p>
      <div className="mt-8 flex flex-wrap gap-3"><button onClick={() => setShow(!show)} className="rounded-lg border px-4 py-2">{show ? '收起' : '查看'}完整对话</button><Link href={`/create?from=${id}`} className="rounded-lg bg-teal-700 px-4 py-2 text-white">再次练习</Link>{focus && <Link href={`/create?from=${id}&focus=${focus.dimension}`} className="rounded-lg border px-4 py-2">再次进行同类专项练习</Link>}<Link href="/history" className="rounded-lg border px-4 py-2">历史训练</Link><Link href="/" className="rounded-lg border px-4 py-2">返回首页</Link></div>
      {show && <div className="mt-6 divide-y border-y">{messages.map(message => <div key={message.id} className="py-3"><b>{message.role === 'user' ? '销售人员' : '模拟客户'}：</b>{message.content}</div>)}</div>}
    </>}
  </main>;
}

export default function ReportPage() { return <Suspense fallback={<p className="p-6">加载报告…</p>}><ReportContent /></Suspense>; }

