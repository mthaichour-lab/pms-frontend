import { describe, expect, it } from 'vitest';
import { prepareReportDownload } from './report-download';

const report = {
  regulatoryReportId: 'report/../../septembre',
  state: 'GENERATED' as const,
  snapshot: { period: '2026-09', postedCalculationCount: 2, reconciliationVarianceCount: 1, dcrBreachCount: 0, approvedShariaReviewCount: 3, rejectedShariaReviewCount: 0 },
  sourceChecksumSha256: 'a'.repeat(64),
  outputChecksumSha256: 'b'.repeat(64),
};

describe('regulatory report download', () => {
  it('creates a UTF-8 JSON artifact with a filesystem-safe filename', async () => {
    const artifact = prepareReportDownload(report);
    expect(artifact.filename).toBe('rapport-reglementaire-report_.._.._septembre.json');
    expect(artifact.blob.type).toBe('application/json;charset=utf-8');
    expect(JSON.parse(await artifact.blob.text())).toEqual(report);
  });
});
