import { getToken } from 'next-auth/jwt';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { rolesFromOidcTokens, sessionCookieName } from '@/auth/options';
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
    const publicRequestUrl = externalRequestUrl(request);
    const signIn = new URL('/api/auth/signin/oidc', publicRequestUrl);
    signIn.searchParams.set('callbackUrl', publicRequestUrl.href);
    return NextResponse.redirect(signIn);
  }
  const roles = Array.isArray(token.roles) && token.roles.length > 0
    ? token.roles
    : rolesFromOidcTokens(typeof token.accessToken === 'string' ? token.accessToken : undefined);
  if (!canAccessNavigationRoute(path, roles)) {
    return NextResponse.redirect(new URL('/forbidden', externalRequestUrl(request)));
  }
  return NextResponse.next();
}

export function externalRequestUrl(request: NextRequest): URL {
  const publicOrigin = process.env['NEXTAUTH_URL'];
  if (!publicOrigin) return new URL(request.url);
  return new URL(`${request.nextUrl.pathname}${request.nextUrl.search}`, publicOrigin);
}

export const config = { matcher: ['/((?!api|_next/static|_next/image|favicon.ico).*)'] };
