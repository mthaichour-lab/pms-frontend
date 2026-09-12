import { readFile } from 'node:fs/promises';
import { operationIds } from '@bank/pms-api-client';

const routeUrl = new URL('../../src/app/api/core/[...path]/route.ts', import.meta.url);
const source = await readFile(routeUrl, 'utf8');
const exposed = new Set([...source.matchAll(/\bclient\.([A-Za-z][A-Za-z0-9]*)\s*\(/g)].map((match) => match[1]));
const expected = new Set(operationIds);
const missing = operationIds.filter((operationId) => !exposed.has(operationId));
const unknown = [...exposed].filter((operationId) => !expected.has(operationId));
const auditRouteContract = [
  "path.length === 2 && path[0] === 'audit' && path[1] === 'events'",
  'requestedLimit === null ? 50 : Number(requestedLimit)',
  'Number.isInteger(limit) || limit < 1 || limit > 200',
  "const auditCorrelationId = parameters.get('auditCorrelationId') ?? undefined",
  'client.getAuditTrail({',
  '...tracing, limit, action, resourceType, outcome, auditCorrelationId, businessDateFrom, businessDateTo',
  "problem(400, 'Invalid audit event filters'",
];
const missingAuditRouteContract = auditRouteContract.filter((fragment) => !source.includes(fragment));

if (missing.length || unknown.length || missingAuditRouteContract.length) {
  if (missing.length) console.error(`SDK operations missing from the BFF: ${missing.join(', ')}`);
  if (unknown.length) console.error(`Unknown SDK client calls in the BFF: ${unknown.join(', ')}`);
  if (missingAuditRouteContract.length) console.error(`Audit BFF contract missing: ${missingAuditRouteContract.join(', ')}`);
  process.exitCode = 1;
} else {
  console.log(`BFF operation coverage: ${exposed.size}/${operationIds.length}.`);
}
