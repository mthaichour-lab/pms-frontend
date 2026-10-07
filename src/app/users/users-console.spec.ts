import { describe, expect, it } from 'vitest';

import { filterPoolCatalog, poolCatalogItems, profileDraftChanged } from './users-console';

describe('user profile pool catalogue', () => {
  it('accepts the paginated investment-pool payload used by the BFF', () => {
    expect(poolCatalogItems({ items: [{ poolId: 'POOL_DZD', displayName: 'Pool Dinar', currency: 'DZD', status: 'ACTIVE' }], total: 1 })).toEqual([
      { poolId: 'POOL_DZD', displayName: 'Pool Dinar', currency: 'DZD', status: 'ACTIVE' },
    ]);
  });

  it('rejects incomplete catalogue rows before they can become authorizations', () => {
    expect(() => poolCatalogItems({ items: [{ poolId: 'POOL_DZD', displayName: 'Pool Dinar' }] })).toThrow('Pool invalide');
  });

  it('filters pool authorizations by code, label, currency or status without accent sensitivity', () => {
    const pools = poolCatalogItems({ items: [
      { poolId: 'POOL_DZD', displayName: 'Épargne participative', currency: 'DZD', status: 'ACTIVE' },
      { poolId: 'POOL_USD', displayName: 'International', currency: 'USD', status: 'SUSPENDED' },
    ] });
    expect(filterPoolCatalog(pools, 'epargne')).toEqual([pools[0]]);
    expect(filterPoolCatalog(pools, 'usd')).toEqual([pools[1]]);
    expect(filterPoolCatalog(pools, 'active')).toEqual([pools[0]]);
  });

  it('identifies unsaved profile changes before the selected account can be replaced', () => {
    const baseline = { username: 'nadia', firstName: 'Nadia', lastName: 'Benali', email: '', password: '', enabled: true, roles: ['FINANCE_CONTROLLER'], legalEntityIds: 'BEA', branchIds: '001', poolIds: 'POOL_DZD', delegationLevel: 3, maximumAmount: '1000' };
    expect(profileDraftChanged(baseline, baseline)).toBe(false);
    expect(profileDraftChanged({ ...baseline, poolIds: 'POOL_DZD, POOL_USD' }, baseline)).toBe(true);
  });
});
