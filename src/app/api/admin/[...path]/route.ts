import type { NextRequest } from 'next/server';
import { backendSession, forwardCore } from '@/auth/backend-session';

type Context = { params: Promise<{ path: string[] }> };
async function handle(request: NextRequest, context: Context) {
  const session = await backendSession(request);
  if (!session) return Response.json({ title: 'Session expirée. Reconnectez-vous.' }, { status: 401 });
  if (!session.roles?.includes('SYSTEM_ADMIN')) return Response.json({ title: 'Administration réservée aux administrateurs.' }, { status: 403 });
  const { path } = await context.params;
  const route = path.join('/');
  const allowed = request.method === 'GET' ? ['users', 'roles'].includes(route)
    : request.method === 'POST' ? route === 'users' : request.method === 'PUT' && /^users\/[a-f0-9-]{36}$/i.test(route);
  if (!allowed) return Response.json({ title: 'Opération inconnue' }, { status: 404 });
  if (request.method !== 'GET') {
    const origin = request.headers.get('origin');
    if (!origin || origin !== new URL(process.env.NEXTAUTH_URL ?? request.url).origin) return Response.json({ title: 'Origine invalide' }, { status: 403 });
  }
  try {
    const body = request.method === 'GET' ? undefined : await request.json();
    const query = new URLSearchParams();
    for (const key of ['search', 'limit', 'offset']) { const value = request.nextUrl.searchParams.get(key); if (value !== null) query.set(key, value); }
    return await forwardCore(request, `admin/${route}${query.size ? `?${query}` : ''}`, request.method, body);
  } catch { return Response.json({ title: 'Le service des utilisateurs est indisponible. Réessayez.' }, { status: 502 }); }
}
export const GET = handle;
export const POST = handle;
export const PUT = handle;
