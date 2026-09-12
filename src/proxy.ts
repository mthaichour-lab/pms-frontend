import { getToken } from 'next-auth/jwt';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { sessionCookieName } from '@/auth/options';
import { canAccessNavigationRoute, isManagedNavigationRoute } from '@/auth/navigation-access';

export async function proxy(request: NextRequest) {
  const path = request.nextUrl.pathname.replace(/\/$/, '') || '/';
  if (!isManagedNavigationRoute(path)) return NextResponse.next();
  const token = await getToken({
    req: request,
    secret: process.env['NEXTAUTH_SECRET'] ?? 'local-development-secret-change-me',
    cookieName: sessionCookieName(),
  });
  if (!token) {
    const signIn = new URL('/api/auth/signin/oidc', request.url);
    signIn.searchParams.set('callbackUrl', request.url);
    return NextResponse.redirect(signIn);
  }
  const roles = Array.isArray(token.roles) ? token.roles : [];
  if (!canAccessNavigationRoute(path, roles)) return NextResponse.redirect(new URL('/forbidden', request.url));
  return NextResponse.next();
}

export const config = { matcher: ['/((?!api|_next/static|_next/image|favicon.ico).*)'] };
