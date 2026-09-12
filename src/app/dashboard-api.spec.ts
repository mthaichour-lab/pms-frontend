import { afterEach, describe, expect, it, vi } from 'vitest';
import { audienceForRoles, dashboardItemLabel, dashboardItemValue, loadAudienceDashboard } from './dashboard-api';

afterEach(() => vi.restoreAllMocks());

describe('audience dashboard adapter', () => {
  it('selects the first supported audience from the authenticated roles', () => {
    expect(audienceForRoles(['RELATIONSHIP_MANAGER', 'RISK_ANALYST'])).toBe('RISK_ALM');
    expect(audienceForRoles(['SYSTEM_ADMIN'])).toBe('EXECUTIVE');
    expect(audienceForRoles(['RELATIONSHIP_MANAGER'])).toBeUndefined();
  });

  it('loads the contracted BFF route with an encoded pool scope', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ audience: 'FINANCE', items: [] })));
    await loadAudienceDashboard('FINANCE', 'POOL:001');
    expect(fetchMock).toHaveBeenCalledWith('/api/core/reporting/dashboards/FINANCE?poolId=POOL%3A001', expect.any(Object));
  });

  it('formats available and unavailable indicators without interpreting business rules', () => {
    expect(dashboardItemLabel({ code: 'NET_COLLECTION', value: 12, availability: 'AVAILABLE' })).toBe('Net Collection');
    expect(dashboardItemValue({ code: 'OUTSTANDING', value: { amount: '18.4', currency: 'DZD' }, availability: 'AVAILABLE' })).toBe('18.4 DZD');
    expect(dashboardItemValue({ code: 'DCR', value: null, availability: 'UNAVAILABLE', justification: 'No closed period' })).toBe('Indisponible');
  });
});
