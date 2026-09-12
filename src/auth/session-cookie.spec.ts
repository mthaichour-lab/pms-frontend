import { describe, expect, it } from 'vitest';

import { sessionCookieName, usesSecureSessionCookie } from './options';

describe('session cookie configuration', () => {
  it('uses the host-only cookie during local HTTP development', () => {
    expect(usesSecureSessionCookie('http://localhost:3000')).toBe(false);
    expect(sessionCookieName('http://localhost:3000')).toBe('pms.session-token');
  });

  it('uses a Secure-prefixed cookie behind HTTPS', () => {
    expect(usesSecureSessionCookie('https://pms.example.bank')).toBe(true);
    expect(sessionCookieName('https://pms.example.bank')).toBe('__Secure-pms.session-token');
  });
});
