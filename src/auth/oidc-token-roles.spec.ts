import { describe, expect, it } from 'vitest';

import { rolesFromOidcTokens } from './options';

function unsignedToken(payload: Record<string, unknown>): string {
  const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `header.${encoded}.signature`;
}

describe('rolesFromOidcTokens', () => {
  it('maps Keycloak groups from the access token', () => {
    expect(
      rolesFromOidcTokens(unsignedToken({ groups: ['pms-system-admins'] })),
    ).toEqual(['SYSTEM_ADMIN']);
  });

  it('merges groups from access and ID tokens without duplicates', () => {
    expect(
      rolesFromOidcTokens(
        unsignedToken({ groups: ['/pms-system-admins'] }),
        unsignedToken({ groups: ['pms-finance-analysts', 'pms-system-admins'] }),
      ),
    ).toEqual(['FINANCE_ANALYST', 'SYSTEM_ADMIN']);
  });

  it('ignores malformed tokens', () => {
    expect(rolesFromOidcTokens('not-a-jwt', 'also-invalid')).toEqual([]);
  });
});
