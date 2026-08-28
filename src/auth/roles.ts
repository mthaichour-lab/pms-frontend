export type PmsRole =
  | 'FINANCE_ANALYST'
  | 'FINANCE_CONTROLLER'
  | 'RELATIONSHIP_MANAGER'
  | 'RISK_ANALYST'
  | 'SHARIA_AUDITOR'
  | 'SYSTEM_ADMIN';

const defaultMapping: Readonly<Record<string, PmsRole>> = {
  'pms-finance-analysts': 'FINANCE_ANALYST',
  'pms-finance-controllers': 'FINANCE_CONTROLLER',
  'pms-relationship-managers': 'RELATIONSHIP_MANAGER',
  'pms-risk-analysts': 'RISK_ANALYST',
  'pms-sharia-auditors': 'SHARIA_AUDITOR',
  'pms-system-admins': 'SYSTEM_ADMIN',
};

export function mapGroupsToRoles(
  groups: unknown,
  mapping: Readonly<Record<string, PmsRole>> = defaultMapping,
): PmsRole[] {
  if (!Array.isArray(groups)) return [];

  return [
    ...new Set(
      groups.flatMap((group) => {
        if (typeof group !== 'string') return [];
        const normalized = group.replace(/^\//, '').toLowerCase();
        return mapping[normalized] ? [mapping[normalized]] : [];
      }),
    ),
  ].sort();
}

