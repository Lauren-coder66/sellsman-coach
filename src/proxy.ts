import { NextRequest, NextResponse } from 'next/server';

export function proxy(request: NextRequest) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(request.method)) return NextResponse.next();
  const origin = request.headers.get('origin');
  const expected = process.env.BETTER_AUTH_URL ?? request.nextUrl.origin;
  if (request.headers.get('sec-fetch-site') === 'cross-site' || (origin !== null && origin !== expected)) {
    return NextResponse.json({ success: false, error: { code: 'CROSS_ORIGIN', message: '不允许跨站操作' } }, { status: 403 });
  }
  return NextResponse.next();
}

export const config = { matcher: ['/api/:path*'] };
