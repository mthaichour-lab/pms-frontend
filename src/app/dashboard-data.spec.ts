import { describe, expect, it } from 'vitest';
import { dashboardKpis, initials, navGroups } from './dashboard-data';

describe('dashboard data', () => {
  it('has unique navigation targets', () => {
    const hrefs = navGroups.flatMap((group) => group.items.map((item) => item.href));
    expect(new Set(hrefs).size).toBe(hrefs.length);
  });

  it('links the delivered product journey to its real route', () => {
    const products = navGroups.flatMap((group) => group.items).find((item) => item.label === 'Produits');
    expect(products?.href).toBe('/products');
  });

  it('has four primary indicators', () => expect(dashboardKpis).toHaveLength(4));

  it.each([['Nadia Benali', 'NB'], ['Nadia', 'NA'], ['', 'U']])(
    'derives initials',
    (name, expected) => expect(initials(name)).toBe(expected),
  );
});
