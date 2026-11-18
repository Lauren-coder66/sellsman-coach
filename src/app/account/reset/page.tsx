'use client';
import Link from 'next/link';
import { createAuthClient } from 'better-auth/react';
import { useState } from 'react';

const auth = createAuthClient();
export default function ResetPasswordPage() {
  const [notice, setNotice] = useState('');
  return <main className="mx-auto max-w-lg space-y-5 p-6">
    <h1 className="text-3xl font-bold">重置密码</h1>
    <form className="space-y-4" onSubmit={async event => {
      event.preventDefault();
      const token = new URLSearchParams(window.location.search).get('token');
      if (!token) { setNotice('链接缺失或已过期。'); return; }
      const newPassword = String(new FormData(event.currentTarget).get('password'));
      try {
        const result = await auth.resetPassword({ token, newPassword });
        setNotice(result.error ? '重置失败，请重新申请链接。' : '密码已重置，请重新登录。');
      } catch { setNotice('暂时无法重置，请稍后再试。'); }
    }}>
      <label className="block">新密码<input className="block w-full rounded-lg border p-2" type="password" name="password" required minLength={12} maxLength={128} autoComplete="new-password" /></label>
      <button className="rounded-lg border px-4 py-2">重置密码</button>
    </form>
    {notice && <p role="status">{notice}</p>}
    <Link href="/account">返回账号设置</Link>
  </main>;
}
