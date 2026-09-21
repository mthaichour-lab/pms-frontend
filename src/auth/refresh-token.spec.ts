import { afterEach, describe, expect, it, vi } from 'vitest';
import { refreshAccessToken } from './refresh-token';
const jwt = (claims: object) => `header.${Buffer.from(JSON.stringify(claims)).toString('base64url')}.signature`;
afterEach(() => vi.restoreAllMocks());
describe('access token lifecycle', () => {
  it('retains an unexpired token without a network request', async () => {
    const fetch = vi.spyOn(globalThis, 'fetch');
    const token = { accessToken: jwt({ exp: Date.now() / 1000 + 300 }), roles: ['SYSTEM_ADMIN'] };
    expect(await refreshAccessToken(token)).toBe(token); expect(fetch).not.toHaveBeenCalled();
  });
  it('clears stale permissions when an old session cannot refresh', async () => {
    const result = await refreshAccessToken({ accessToken: jwt({ exp: 1 }), roles: ['SYSTEM_ADMIN'] });
    expect(result.error).toBe('SessionExpired'); expect(result.roles).toEqual([]); expect(result.accessToken).toBeUndefined();
  });
  it('rotates once for concurrent requests and replaces revoked roles', async () => {
    const access = jwt({ groups: ['pms-relationship-managers'] });
    const fetch = vi.spyOn(globalThis, 'fetch').mockResolvedValue(Response.json({ access_token: access, refresh_token: 'rotated', expires_in: 300 }));
    const token = { accessToken: jwt({ exp: 1 }), refreshToken: 'concurrent-token', roles: ['SYSTEM_ADMIN'] };
    const [a, b] = await Promise.all([refreshAccessToken(token), refreshAccessToken(token)]);
    expect(fetch).toHaveBeenCalledTimes(1); expect(a).toBe(b); expect(a.refreshToken).toBe('rotated');
    expect(a.roles).toEqual(['RELATIONSHIP_MANAGER']); expect(a.error).toBeUndefined();
  });
  it('fails closed when the identity provider rejects renewal', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(Response.json({ error: 'invalid_grant' }, { status: 400 }));
    const result = await refreshAccessToken({ accessToken: jwt({ exp: 1 }), refreshToken: 'revoked-token', roles: ['SYSTEM_ADMIN'] });
    expect(result.error).toBe('SessionExpired'); expect(result.accessToken).toBeUndefined(); expect(result.refreshToken).toBeUndefined(); expect(result.roles).toEqual([]);
  });
});
