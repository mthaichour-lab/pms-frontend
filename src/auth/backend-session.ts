import { cookies } from 'next/headers';
import { encode, getToken } from 'next-auth/jwt';
import type { NextRequest } from 'next/server';
import { sessionCookieName, usesSecureSessionCookie } from './options';
import { refreshAccessToken } from './refresh-token';

export async function backendSession(request: NextRequest) {
  const secret = process.env.NEXTAUTH_SECRET;
  if (!secret && process.env.NODE_ENV === 'production') throw new Error('NEXTAUTH_SECRET is required');
  const signingSecret = secret ?? 'local-development-secret-change-me';
  const token = await getToken({ req: request, secret: signingSecret, cookieName: sessionCookieName() });
  if (!token) return undefined;
  const fresh = await refreshAccessToken(token);
  if (fresh !== token) {
    const jar = await cookies();
    // Remove old chunks before replacing the session to avoid joining stale tokens.
    for (const cookie of jar.getAll()) if (cookie.name === sessionCookieName() || cookie.name.startsWith(`${sessionCookieName()}.`)) jar.delete(cookie.name);
    const value = await encode({ secret: signingSecret, token: fresh, maxAge: 8 * 3600 });
    const parts = value.match(/.{1,3800}/g) ?? [];
    parts.forEach((part, index) => jar.set(parts.length === 1 ? sessionCookieName() : `${sessionCookieName()}.${index}`, part, { httpOnly: true, sameSite: 'lax', secure: usesSecureSessionCookie(), path: '/', maxAge: 8 * 3600 }));
  }
  return fresh.error || !fresh.accessToken ? undefined : fresh;
}

export async function forwardCore(request: NextRequest, path: string, method = 'GET', body?: unknown) {
  const session = await backendSession(request);
  if (!session) return Response.json({ title: 'Session expirée. Reconnectez-vous.', status: 401 }, { status: 401 });
  const headers = new Headers({ authorization: `Bearer ${session.accessToken}`, accept: 'application/json', 'x-correlation-id': request.headers.get('x-correlation-id') ?? crypto.randomUUID() });
  if (body !== undefined) headers.set('content-type', 'application/json');
  if (method !== 'GET') headers.set('idempotency-key', request.headers.get('idempotency-key') ?? crypto.randomUUID());
  const base = (process.env.CORE_API_URL ?? 'http://localhost:3001').replace(/\/$/, '').replace(/\/api$/, '');
  const response = await fetch(`${base}/api/${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body), cache: 'no-store', signal: AbortSignal.timeout(15_000) });
  return Response.json(await response.json().catch(() => ({ title: 'Réponse serveur invalide' })), { status: response.status, headers: { 'cache-control': 'no-store' } });
}
