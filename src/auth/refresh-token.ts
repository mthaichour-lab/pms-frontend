import type { JWT } from 'next-auth/jwt';
import { mapGroupsToRoles } from './roles';

function claims(value?: string): Record<string, unknown> {
  try { return JSON.parse(Buffer.from(value?.split('.')[1] ?? '', 'base64url').toString('utf8')); } catch { return {}; }
}
const pending = new Map<string, Promise<JWT>>();

export async function refreshAccessToken(token: JWT): Promise<JWT> {
  const payload = claims(token.accessToken);
  const expiresAt = Number(token.accessTokenExpires ?? Number(payload.exp) * 1000);
  if (typeof token.accessToken !== 'string') return { ...token, error: 'SessionExpired' };
  if (Number.isFinite(expiresAt) && expiresAt > Date.now() + 30_000) return token;
  if (typeof token.refreshToken !== 'string') return { ...token, accessToken: undefined, roles: [], error: 'SessionExpired' };
  const key = token.refreshToken;
  if (pending.has(key)) return pending.get(key)!;
  const operation = (async (): Promise<JWT> => {
    try {
      const body = new URLSearchParams({ grant_type: 'refresh_token', client_id: process.env.OIDC_CLIENT_ID ?? 'pms-web', refresh_token: key });
      if (process.env.OIDC_CLIENT_SECRET) body.set('client_secret', process.env.OIDC_CLIENT_SECRET);
      const response = await fetch(`${process.env.OIDC_ISSUER ?? 'http://localhost:8080/realms/pms-dev'}/protocol/openid-connect/token`, {
        method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body, cache: 'no-store', signal: AbortSignal.timeout(10_000),
      });
      const data = await response.json();
      if (!response.ok || typeof data.access_token !== 'string' || !Number.isFinite(data.expires_in)) throw new Error('Refresh failed');
      return { ...token, accessToken: data.access_token, refreshToken: data.refresh_token ?? key, accessTokenExpires: Date.now() + data.expires_in * 1000, roles: mapGroupsToRoles(claims(data.access_token).groups), error: undefined };
    } catch { return { ...token, accessToken: undefined, refreshToken: undefined, roles: [], error: 'SessionExpired' }; }
  })();
  pending.set(key, operation);
  // Concurrent requests sharing a rotated refresh token reuse the same result.
  void operation.finally(() => { setTimeout(() => pending.delete(key), 30_000).unref?.(); });
  return operation;
}
