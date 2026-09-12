import type { PmsRole } from './roles';

const accessByRoute: Readonly<Record<string, readonly PmsRole[]>> = {
  '/closings': ['FINANCE_CONTROLLER', 'SYSTEM_ADMIN'],
  '/opening-balances': ['FINANCE_CONTROLLER', 'SYSTEM_ADMIN'],
  '/products': ['FINANCE_ANALYST', 'FINANCE_CONTROLLER', 'SHARIA_AUDITOR', 'SYSTEM_ADMIN'],
  '/customers': ['RELATIONSHIP_MANAGER', 'FINANCE_CONTROLLER', 'SYSTEM_ADMIN'],
  '/subscriptions': ['RELATIONSHIP_MANAGER', 'FINANCE_CONTROLLER', 'SYSTEM_ADMIN'],
  '/allocations': ['FINANCE_ANALYST', 'FINANCE_CONTROLLER', 'SHARIA_AUDITOR', 'SYSTEM_ADMIN'],
  '/revenues': ['FINANCE_ANALYST', 'FINANCE_CONTROLLER', 'SHARIA_AUDITOR', 'SYSTEM_ADMIN'],
  '/calculations': ['FINANCE_CONTROLLER', 'SYSTEM_ADMIN'],
  '/quotations': ['RELATIONSHIP_MANAGER', 'FINANCE_ANALYST', 'FINANCE_CONTROLLER', 'SYSTEM_ADMIN'],
  '/risk': ['RISK_ANALYST', 'FINANCE_ANALYST', 'SYSTEM_ADMIN'],
  '/sharia': ['FINANCE_ANALYST', 'SHARIA_AUDITOR', 'SYSTEM_ADMIN'],
  '/compliance': ['SHARIA_AUDITOR', 'SYSTEM_ADMIN'],
  '/purifications': ['SHARIA_AUDITOR', 'FINANCE_CONTROLLER', 'SYSTEM_ADMIN'],
  '/reconciliation': ['FINANCE_CONTROLLER', 'SYSTEM_ADMIN'],
  '/cbs-quality': ['FINANCE_ANALYST', 'FINANCE_CONTROLLER', 'SYSTEM_ADMIN'],
  '/data-protection': ['FINANCE_ANALYST', 'SYSTEM_ADMIN'],
  '/reporting': ['FINANCE_CONTROLLER', 'RISK_ANALYST', 'SYSTEM_ADMIN'],
  '/audit': ['FINANCE_CONTROLLER', 'RISK_ANALYST', 'SHARIA_AUDITOR', 'SYSTEM_ADMIN'],
  '/exceptions': ['FINANCE_CONTROLLER', 'RISK_ANALYST', 'SHARIA_AUDITOR', 'SYSTEM_ADMIN'],
};

export function canAccessNavigationRoute(href: string, roles: readonly string[]): boolean {
  if (href.startsWith('#')) return true;
  const allowed = accessByRoute[href];
  return allowed ? roles.some((role) => allowed.includes(role as PmsRole)) : false;
}

export function isManagedNavigationRoute(href: string): boolean { return Object.hasOwn(accessByRoute, href); }
