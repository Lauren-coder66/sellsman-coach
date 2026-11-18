export async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  if (!headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  const response = await fetch(url, { ...init, headers }).catch(error => {
    if (error instanceof TypeError) throw new Error('网络连接失败，请检查网络后重试');
    throw error;
  });
  const result = await response.json().catch(() => null) as { success?: boolean; data?: T; error?: { message?: string } } | null;
  if (!response.ok || result?.success === false) {
    const fallback = response.status === 504 ? '请求超时，请稍后重试'
      : response.status === 429 ? '请求过于频繁，请稍后重试'
      : response.status === 413 ? '提交内容过长，请缩短后重试'
      : '请求失败，请稍后重试';
    throw new Error(result?.error?.message || fallback);
  }
  if (result?.success !== true || !('data' in result)) throw new Error('服务响应异常，请稍后重试');
  return result.data as T;
}
