'use client';

import Link from 'next/link';
import { createAuthClient } from 'better-auth/react';
import { useState } from 'react';
import { api } from '@/lib/client';

const auth = createAuthClient();
const fieldClass = 'mt-1 w-full rounded-lg border px-3 py-2';
const buttonClass = 'rounded-lg border px-4 py-2 disabled:opacity-50';
class AccountActionError extends Error {}

export default function AccountPage() {
  const { data: session, isPending } = auth.useSession();
  const [mode, setMode] = useState<'login' | 'register' | 'reset' | 'verify'>('login');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  async function run(task: () => Promise<string>) {
    setBusy(true);
    setNotice('');
    try { setNotice(await task()); }
    catch (error) { setNotice(error instanceof AccountActionError ? error.message : '操作未完成，请检查网络后重试。'); }
    finally { setBusy(false); }
  }

  return <main className="mx-auto max-w-xl space-y-5 px-4 py-8">
    <nav><Link href="/" className="text-teal-700">返回销售陪练</Link></nav>
    <h1 className="text-3xl font-bold">账号设置</h1>
    {isPending ? <p>正在检查登录状态…</p> : session?.user ? <>
      <p>当前邮箱 {session.user.email}</p>
      <form className="space-y-3" onSubmit={event => {
        event.preventDefault();
        const name = String(new FormData(event.currentTarget).get('name')).trim();
        void run(async () => {
          const result = await auth.updateUser({ name });
          if (result.error) throw new AccountActionError('无法保存姓名');
          return '已保存姓名';
        });
      }}>
        <label className="block">显示姓名<input className={fieldClass} name="name" defaultValue={session.user.name} required maxLength={80} /></label>
        <button className={buttonClass} disabled={busy}>保存姓名</button>
      </form>
      <form className="space-y-3" onSubmit={event => {
        event.preventDefault();
        const newEmail = String(new FormData(event.currentTarget).get('email'));
        void run(async () => {
          const result = await auth.changeEmail({ newEmail, callbackURL: '/account' });
          if (result.error) throw new AccountActionError('邮箱修改失败');
          return '请查看邮箱确认修改。';
        });
      }}>
        <label className="block">新邮箱<input className={fieldClass} name="email" type="email" required maxLength={254} /></label>
        <button className={buttonClass} disabled={busy}>修改邮箱</button>
      </form>
      <div className="flex flex-wrap gap-2">
        <button className={buttonClass} disabled={busy} onClick={() => void run(async () => {
          const result = await api<{sessions: number; scenarios: number}>('/api/account/claim', { method: 'POST' });
          return `已迁入 ${result.sessions} 条训练、${result.scenarios} 个场景`;
        })}>迁入本浏览器的匿名记录</button>
        <a className={buttonClass} href="/api/account/export" download>导出我的数据</a>
        <Link className={buttonClass} href="/account/usage">查看额度</Link>
        <Link className={buttonClass} href="/feedback">反馈与建议</Link>
        <button className={buttonClass} disabled={busy} onClick={() => void run(async () => {
          const result = await auth.signOut();
          if (result.error) throw new AccountActionError('退出失败');
          return '已退出登录';
        })}>退出登录</button>
      </div>
      <button className={`${buttonClass} text-red-800`} disabled={busy} onClick={() => {
        if (!window.confirm('申请删除账号及账号下的训练和场景？')) return;
        void run(async () => {
          const result = await auth.deleteUser({ callbackURL: '/' });
          if (result.error) throw new AccountActionError('删除申请失败');
          return '删除确认链接已发到你的邮箱。';
        });
      }}>申请删除账号</button>
    </> : <>
      <form className="space-y-4" onSubmit={event => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        const email = String(form.get('email')).trim();
        const password = String(form.get('password') ?? '');
        void run(async () => {
          if (mode === 'register') {
            const result = await auth.signUp.email({ email, password, name: String(form.get('name')).trim(), callbackURL: '/account' });
            if (result.error) throw new AccountActionError('注册暂不可用，请检查信息后重试。');
            return '请查收验证邮件，验证后登录。';
          }
          if (mode === 'reset') {
            const result = await auth.requestPasswordReset({ email, redirectTo: '/account/reset' });
            if (result.error) throw new AccountActionError('暂时无法发送重置邮件，请稍后重试。');
            return '如果邮箱已注册，将收到密码重置链接。';
          }
          if (mode === 'verify') {
            const result = await auth.sendVerificationEmail({ email, callbackURL: '/account' });
            if (result.error) throw new AccountActionError('暂时无法发送验证邮件，请稍后重试。');
            return '如果该邮箱尚待验证，请查收新链接。没有收到时可稍后重试。';
          }
          const result = await auth.signIn.email({ email, password });
          if (result.error) throw new AccountActionError('无法登录，请检查密码并确认邮箱已验证。');
          return '已登录';
        });
      }}>
        {mode === 'register' && <label className="block">显示姓名<input className={fieldClass} name="name" required maxLength={80} /></label>}
        <label className="block">邮箱<input className={fieldClass} name="email" type="email" autoComplete="email" required maxLength={254} /></label>
        {(mode === 'login' || mode === 'register') && <label className="block">密码<input className={fieldClass} name="password" type="password" minLength={12} maxLength={128} autoComplete={mode === 'register' ? 'new-password' : 'current-password'} required /></label>}
        <button className={buttonClass} disabled={busy}>{({ login: '登录', register: '发送验证并注册', reset: '发送密码重置链接', verify: '发送新验证链接' })[mode]}</button>
      </form>
      <div className="flex flex-wrap gap-3">
        {mode !== 'login' && <button onClick={() => setMode('login')}>返回登录</button>}
        {mode !== 'register' && <button onClick={() => setMode('register')}>注册账号</button>}
        {mode !== 'reset' && <button onClick={() => setMode('reset')}>忘记密码</button>}
        {mode !== 'verify' && <button onClick={() => setMode('verify')}>重发验证邮件</button>}
      </div>
    </>}
    {notice && <p role="status">{notice}</p>}
    <footer className="flex flex-wrap gap-4 text-sm"><Link href="/privacy">数据与隐私</Link><Link href="/terms">使用说明</Link><Link href="/feedback">反馈与建议</Link></footer>
  </main>;
}
