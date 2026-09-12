import { describe, expect, it } from 'vitest';
import { canAccessNavigationRoute, isManagedNavigationRoute } from './navigation-access';

describe('role-aware navigation', () => {
  it('always exposes the dashboard and gives administrators full navigation', () => {
    expect(canAccessNavigationRoute('#dashboard', [])).toBe(true);
    expect(canAccessNavigationRoute('/data-protection', ['SYSTEM_ADMIN'])).toBe(true);
  });
  it('separates relationship, risk and Sharia journeys', () => {
    expect(canAccessNavigationRoute('/customers', ['RELATIONSHIP_MANAGER'])).toBe(true);
    expect(canAccessNavigationRoute('/risk', ['RELATIONSHIP_MANAGER'])).toBe(false);
    expect(canAccessNavigationRoute('/risk', ['RISK_ANALYST'])).toBe(true);
    expect(canAccessNavigationRoute('/compliance', ['SHARIA_AUDITOR'])).toBe(true);
  });
  it('aligns audit navigation with the backend authorization policy', () => {
    expect(canAccessNavigationRoute('/audit', ['FINANCE_ANALYST'])).toBe(false);
    expect(canAccessNavigationRoute('/audit', ['FINANCE_CONTROLLER'])).toBe(true);
    expect(canAccessNavigationRoute('/audit', ['RISK_ANALYST'])).toBe(true);
    expect(canAccessNavigationRoute('/audit', ['SHARIA_AUDITOR'])).toBe(true);
    expect(canAccessNavigationRoute('/audit', ['SYSTEM_ADMIN'])).toBe(true);
  });
  it('fails closed for an unclassified route', () => {
    expect(canAccessNavigationRoute('/future-sensitive-screen', ['SYSTEM_ADMIN'])).toBe(false);
    expect(isManagedNavigationRoute('/future-sensitive-screen')).toBe(false);
    expect(isManagedNavigationRoute('/compliance')).toBe(true);
  });
});
