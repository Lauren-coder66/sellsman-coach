import { NextRequest, NextResponse } from 'next/server';
import { createHash, timingSafeEqual } from 'node:crypto';

export function proxy(request: NextRequest) {
  const preview = process.env.RELEASE_PROFILE === 'friend-preview';
  if (preview && !(['GET', 'HEAD'].includes(request.method) && request.nextUrl.pathname === '/api/health')) {
    const digest = process.env.PREVIEW_AUTH_SHA256;
    const header = request.headers.get('authorization') ?? '';
    if (!digest || !/^[0-9a-f]{64}$/.test(digest) ||
        !timingSafeEqual(createHash('sha256').update(header).digest(), Buffer.from(digest, 'hex'))) {
      return new NextResponse('需要好友内测口令', {
        status: 401,
        headers: { 'WWW-Authenticate': 'Basic realm="Sales Practice Preview"', 'Cache-Control': 'no-store' },
      });
    }
  }
  if (!request.nextUrl.pathname.startsWith('/api/') || ['GET', 'HEAD', 'OPTIONS'].includes(request.method)) return NextResponse.next();
  const origin = request.headers.get('origin');
  const expected = preview ? process.env.RENDER_EXTERNAL_URL : process.env.BETTER_AUTH_URL ?? request.nextUrl.origin;
  if (request.headers.get('sec-fetch-site') === 'cross-site' || (origin !== null && origin !== expected)) {
    return NextResponse.json({ success: false, error: { code: 'CROSS_ORIGIN', message: '不允许跨站操作' } }, { status: 403 });
  }
  return NextResponse.next();
}

export const config = { matcher: ['/:path*'] };
