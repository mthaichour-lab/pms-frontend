import { afterEach, describe, expect, it, vi } from 'vitest';
import { getDocumentArchiveRequest, requestDocumentArchive, validDocumentArchiveRequest } from './audit-api';

afterEach(() => vi.restoreAllMocks());
const command = { objectKey: 'landing/audit/proof.pdf', businessType: 'AUDIT_EVIDENCE', businessId: 'closing-1', classification: 'CONFIDENTIAL', evidentiary: true } as const;
describe('document archive API', () => {
  it('rejects unsafe landing paths before submission', () => { expect(validDocumentArchiveRequest(command)).toBe(true); expect(validDocumentArchiveRequest({ ...command, objectKey: 'landing/../secret' })).toBe(false); });
  it('queues idempotently then reads the archive status', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response(JSON.stringify({ requestId: '00000000-0000-4000-8000-000000000001', status: 'QUEUED' }))).mockResolvedValueOnce(new Response(JSON.stringify({ requestId: '00000000-0000-4000-8000-000000000001', status: 'ARCHIVED' })));
    await requestDocumentArchive(command);
    await getDocumentArchiveRequest('00000000-0000-4000-8000-000000000001');
    expect(new Headers(fetchMock.mock.calls[0]![1]?.headers).get('idempotency-key')).toMatch(/^[0-9a-f-]{36}$/);
    expect(fetchMock.mock.calls[1]?.[0]).toContain('/documents/archive-requests/00000000-0000-4000-8000-000000000001');
  });
});
