import Link from 'next/link';

export default function TermsPage() {
  return <main className="mx-auto max-w-2xl space-y-5 p-6">
    <Link href="/">返回销售陪练</Link>
    <h1 className="text-3xl font-bold">测试版使用说明</h1>
    <p>销售陪练提供练习对话和反馈。AI 可能误解场景或给出不准确的评分，请以原始对话作为复盘依据。</p>
    <p>请使用有权提供的练习内容，尊重他人隐私。为了保障服务稳定，真实请求受到账号和系统用量限制。</p>
    <p>当前测试版没有正式支付入口。账号和训练数据的处理方式见 <Link className="text-teal-700 underline" href="/privacy">数据与隐私说明</Link>。</p>
  </main>;
}
