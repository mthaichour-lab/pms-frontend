export const dashboardKpis = [
  { label: 'Encours participatifs', value: '18,42 Md DZD', detail: '+4,8 % sur la période', tone: 'positive' },
  { label: 'Revenus distribuables', value: '327,6 M DZD', detail: 'Période août 2026', tone: 'positive' },
  { label: 'DCR portefeuille', value: '1,24×', detail: 'Seuil interne : 1,10×', tone: 'positive' },
  { label: 'Actions à traiter', value: '7', detail: '2 contrôles prioritaires', tone: 'warning' },
] as const;

export const navGroups = [
  { label: 'Pilotage', items: [
    { label: 'Tableau de bord', icon: '⌂', href: '#dashboard' },
    { label: 'Arrêtés', icon: '◫', href: '#closings' },
  ] },
  { label: 'Gestion', items: [
    { label: 'Produits', icon: '◇', href: '/products' },
    { label: 'Allocations', icon: '⇄', href: '#allocations' },
    { label: 'Calcul et partage', icon: '∑', href: '#calculations' },
  ] },
  { label: 'Contrôle', items: [
    { label: 'Risque et ALM', icon: '△', href: '#risk' },
    { label: 'Conformité Charia', icon: '✓', href: '#sharia' },
    { label: 'Rapprochements', icon: '≡', href: '#reconciliation' },
  ] },
  { label: 'Restitution', items: [
    { label: 'Reporting', icon: '▤', href: '#reporting' },
    { label: 'Piste d’audit', icon: '◎', href: '#audit' },
  ] },
] as const;

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return (parts.length > 1
    ? `${parts[0]![0]}${parts.at(-1)?.[0]}`
    : parts[0]?.slice(0, 2) || 'U').toUpperCase();
}
