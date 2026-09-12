import type { CbsDataQualityBatch } from '@bank/pms-api-client';
export type { CbsDataQualityBatch };
export async function loadCbsQuality(filters: { businessDate?: string; state?: string }, signal?: AbortSignal): Promise<readonly CbsDataQualityBatch[]> {
  const query = new URLSearchParams({ limit: '100', offset: '0' });
  if (filters.businessDate) query.set('businessDate', filters.businessDate); if (filters.state) query.set('state', filters.state);
  const response = await fetch(`/api/core/cbs/data-quality/batches?${query}`, { signal }); const body: unknown = await response.json().catch(() => undefined);
  if (!response.ok) { const problem = (body ?? {}) as { title?: string; detail?: string }; throw new Error(problem.detail ?? problem.title ?? `Erreur HTTP ${response.status}`); }
  return body as readonly CbsDataQualityBatch[];
}
export function qualitySummary(rows: readonly CbsDataQualityBatch[]) { return rows.reduce((s, row) => ({ batches:s.batches+1, rejected:s.rejected+Number(['REJECTED','QUARANTINED'].includes(row.state)), errors:s.errors+row.errorCount, warnings:s.warnings+row.warningCount }), { batches:0,rejected:0,errors:0,warnings:0 }); }
