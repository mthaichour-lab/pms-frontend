import { describe, expect, it } from 'vitest';
import { dashboardChartData } from './dashboard-chart';
describe('dashboard chart period', () => {
  it('returns twelve labeled monthly observations', () => { const chart=dashboardChartData('monthly'); expect(chart.points).toHaveLength(12); expect(chart.points[0]?.label).toBe('Jan'); expect(chart.points.at(-1)?.label).toBe('Déc'); expect(chart.value).toBe('327,6 M'); });
  it('switches values and observations to the five-year annual series', () => { const chart=dashboardChartData('annual'); expect(chart.points.map(p=>p.label)).toEqual(['2022','2023','2024','2025','2026']); expect(chart.value).toBe('3,42 Md'); expect(chart.change).toBe('+12,6 %'); });
  it.each(['monthly','annual'] as const)('keeps percentages valid for %s', period => { expect(dashboardChartData(period).points.every(p=>p.income>=p.distributed&&p.income<=100)).toBe(true); });
});
