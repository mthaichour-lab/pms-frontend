import { afterEach, describe, expect, it, vi } from 'vitest';
import { audienceForRoles, dashboardItemLabel, dashboardItemValue, isAudienceDashboard, loadAudienceDashboard } from './dashboard-api';

afterEach(() => vi.restoreAllMocks());

describe('audience dashboard adapter', () => {
  it('selects the first supported audience from the authenticated roles', () => {
    expect(audienceForRoles(['RELATIONSHIP_MANAGER', 'RISK_ANALYST'])).toBe('RISK_ALM');
    expect(audienceForRoles(['SYSTEM_ADMIN'])).toBe('EXECUTIVE');
    expect(audienceForRoles(['RELATIONSHIP_MANAGER'])).toBeUndefined();
  });

  it('loads the contracted BFF route with an encoded pool scope', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ audience: 'FINANCE', generatedAt: '2026-09-19T12:00:00Z', items: [], queryDurationMs: 12, requiredItemCount: 0, complete: true, performanceBudgetMs: 3000 })));
    await loadAudienceDashboard('FINANCE', 'POOL:001');
    expect(fetchMock).toHaveBeenCalledWith('/api/core/reporting/dashboards/FINANCE?poolId=POOL%3A001', expect.any(Object));
  });

  it('formats available and unavailable indicators without interpreting business rules', () => {
    expect(dashboardItemLabel({ code: 'NET_COLLECTION', value: 12, availability: 'AVAILABLE' })).toBe('Net Collection');
    expect(dashboardItemValue({ code: 'OUTSTANDING', value: { amount: '18.4', currency: 'DZD' }, availability: 'AVAILABLE' })).toBe('18.4 DZD');
    expect(dashboardItemValue({ code: 'DCR', value: null, availability: 'UNAVAILABLE', justification: 'No closed period' })).toBe('Indisponible');
  });

  it('guards the runtime dashboard contract and forwards cancellation/correlation', async () => {
    expect(isAudienceDashboard({ audience: 'FINANCE', generatedAt: 'invalid', items: [] })).toBe(false);
    const controller = new AbortController();
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ audience: 'FINANCE', generatedAt: '2026-09-19T12:00:00Z', items: [], queryDurationMs: 12, requiredItemCount: 0, complete: true, performanceBudgetMs: 3000 })));
    await loadAudienceDashboard('FINANCE', undefined, { signal: controller.signal, correlationId: 'dashboard-correlation' });
    expect(fetchMock.mock.calls[0]?.[1]).toEqual(expect.objectContaining({ signal: controller.signal }));
    expect(new Headers(fetchMock.mock.calls[0]?.[1]?.headers).get('x-correlation-id')).toBe('dashboard-correlation');
  });
});
