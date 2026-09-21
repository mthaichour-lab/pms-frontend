import { afterEach, expect, it, vi } from 'vitest';
import { backendFetch } from './backend-fetch';
afterEach(() => vi.restoreAllMocks());
it('preserves successful responses', async () => {
  const response = Response.json({ id: 'ok' }); vi.spyOn(globalThis, 'fetch').mockResolvedValue(response);
  expect(await backendFetch('http://test')).toBe(response);
});
it('preserves HTTP 403 when the backend returns a non-problem error', async () => {
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(Response.json({ code: 'AUTHORIZATION_DENIED', reasons: ['ROLE_NOT_ALLOWED'] }, { status: 403, headers: { 'content-length': '2', 'content-encoding': 'gzip' } }));
  const result = await backendFetch('http://test'); const body = await result.json();
  expect(result.status).toBe(403); expect(body.status).toBe(403); expect(body.detail).toBe('ROLE_NOT_ALLOWED');
  expect(result.headers.has('content-length')).toBe(false); expect(result.headers.has('content-encoding')).toBe(false);
});
