import { describe, expect, it } from 'vitest';

import { mapGroupsToRoles } from './roles';

describe('mapGroupsToRoles', () => {
  it('maps AD groups to stable PMS roles and ignores unknown groups', () => {
    expect(
      mapGroupsToRoles([
        '/pms-finance-analysts',
        'PMS-RISK-ANALYSTS',
        'unrelated-group',
        '/pms-finance-analysts',
      ]),
    ).toEqual(['FINANCE_ANALYST', 'RISK_ANALYST']);
  });

  it('rejects malformed group claims without granting a role', () => {
    expect(mapGroupsToRoles('pms-system-admins')).toEqual([]);
  });
});

