import type { AudienceDashboard, DashboardAudience, DashboardItem } from '@bank/pms-api-client';

const audienceByRole: Readonly<Record<string, DashboardAudience>> = {
  SYSTEM_ADMIN: 'EXECUTIVE',
  FINANCE_CONTROLLER: 'FINANCE',
  FINANCE_ANALYST: 'FINANCE',
  RISK_ANALYST: 'RISK_ALM',
  SHARIA_AUDITOR: 'SHARIA',
};

export function audienceForRoles(roles: readonly string[]): DashboardAudience | undefined {
  for (const role of roles) {
    const audience = audienceByRole[role];
    if (audience) return audience;
  }
  return undefined;
}

export async function loadAudienceDashboard(audience: DashboardAudience, poolId?: string): Promise<AudienceDashboard> {
  const query = new URLSearchParams();
  if (poolId) query.set('poolId', poolId);
  const suffix = query.size ? `?${query}` : '';
  const response = await fetch(`/api/core/reporting/dashboards/${encodeURIComponent(audience)}${suffix}`, { headers: { accept: 'application/json' } });
  const payload: unknown = await response.json().catch(() => undefined);
  if (!response.ok) {
    const problem = (payload ?? {}) as { detail?: string; title?: string };
    throw new Error(problem.detail ?? problem.title ?? `Erreur HTTP ${response.status}`);
  }
  return payload as AudienceDashboard;
}

export function dashboardItemLabel(item: DashboardItem): string {
  return item.code.toLowerCase().split('_').map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(' ');
}

export function dashboardItemValue(item: DashboardItem): string {
  if (item.availability === 'UNAVAILABLE' || item.value === null) return 'Indisponible';
  if (typeof item.value === 'string' || typeof item.value === 'number') return String(item.value);
  if (typeof item.value === 'boolean') return item.value ? 'Oui' : 'Non';
  if (typeof item.value === 'object') {
    const value = item.value as Record<string, unknown>;
    const preferred = value['displayValue'] ?? value['value'] ?? value['amount'] ?? value['status'];
    if (typeof preferred === 'string' || typeof preferred === 'number') {
      const unit = typeof value['unit'] === 'string' ? ` ${value['unit']}` : typeof value['currency'] === 'string' ? ` ${value['currency']}` : '';
      return `${preferred}${unit}`;
    }
  }
  return 'Disponible';
}
