export type DashboardChartPeriod = 'monthly' | 'annual';
export type DashboardChartPoint = Readonly<{ label: string; income: number; distributed: number }>;
export type DashboardChart = Readonly<{ points: readonly DashboardChartPoint[]; value: string; change: string }>;
const point = ([label, income, distributed]: readonly [string, number, number]): DashboardChartPoint => ({ label, income, distributed });
const monthly = ([['Jan',42,31],['Fév',49,37],['Mar',53,42],['Avr',58,45],['Mai',62,49],['Juin',66,52],['Juil',74,59],['Août',69,57],['Sep',79,63],['Oct',83,68],['Nov',88,73],['Déc',94,78]] as const).map(point);
const annual = ([['2022',48,36],['2023',59,45],['2024',71,57],['2025',83,68],['2026',94,78]] as const).map(point);
export function dashboardChartData(period: DashboardChartPeriod): DashboardChart {
  return period === 'annual'
    ? { points: annual, value: '3,42 Md', change: '+12,6 %' }
    : { points: monthly, value: '327,6 M', change: '+4,9 %' };
}
