import type { GeneratedRegulatoryReport } from './reporting-api';

export interface ReportDownload {
  readonly filename: string;
  readonly blob: Blob;
}

export function prepareReportDownload(report: GeneratedRegulatoryReport): ReportDownload {
  const safeId = report.regulatoryReportId.replace(/[^A-Za-z0-9._-]/g, '_').slice(0, 120) || 'rapport';
  return {
    filename: `rapport-reglementaire-${safeId}.json`,
    blob: new Blob([`${JSON.stringify(report, null, 2)}\n`], { type: 'application/json;charset=utf-8' }),
  };
}

export function downloadReport(report: GeneratedRegulatoryReport): void {
  const artifact = prepareReportDownload(report);
  const objectUrl = URL.createObjectURL(artifact.blob);
  const link = document.createElement('a');
  link.href = objectUrl;
  link.download = artifact.filename;
  link.hidden = true;
  document.body.appendChild(link);
  try { link.click(); }
  finally { link.remove(); setTimeout(() => URL.revokeObjectURL(objectUrl), 0); }
}
