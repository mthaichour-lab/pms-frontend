import {
  createPmsApiClient,
  PmsApiProblem,
  type ApprovePoolOperationCommand,
  type JournalReversalCommand,
  type ReconciliationCommand,
  type AccountingEventCommand,
  type AccountingAcknowledgementCommand,
  type ShariaDecision,
  type ShariaOpinion,
  type ShariaReviewSubmission,
  type DcrCalculationCommand,
  type StressScenarioCommand,
  type RegulatoryReportGeneration,
  type RegulatoryReportPublication,
  type WorkflowApprovalCommand,
  type CreateInvestmentProduct,
  type ProductTransitionCommand,
  type ProductTermsDraft,
  type PublishProductTerms,
  type AssociateProductReference,
  type AssetAllocation,
  type CreateInvestmentPool,
  type PoolFundingSource,
  type CreateSecureExport,
  type SecureExportGeneration,
  type CustomerProfile,
  type LegalRestriction,
  type CreateInvestmentSubscription,
  type InvestmentSubscriptionAction,
  type PoolCompositionInput,
  type AssetAnomaly,
  type ChargePolicy,
  type PoolCharge,
  type RecognizedIncome,
  type IncomeAdjustment,
  type PurificationCase,
  type QuotationCommand,
  type OpeningBalanceCertificationCommand,
  type TokenizeCommand,
  type TokenizeBatchCommand,
  type TokenOperationCommand,
  type TokenSearchCommand,
  type CreateComplianceReference,
  type ComplianceArbitration,
  type CreateExceptionCase,
  type ExceptionTransitionCommand,
  type DashboardAudience,
  type CreatePlanningScenario,
  type PlanningScenarioTransitionCommand,
  type DocumentArchiveRequestCommand,
} from '@bank/pms-api-client';
import { getToken } from 'next-auth/jwt';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { sessionCookieName } from '@/auth/options';
import { backendSession, forwardCore } from '@/auth/backend-session';
import { backendFetch } from '@/auth/backend-fetch';

interface RouteContext {
  params: Promise<{ path: string[] }>;
}

type CatalogKind = 'products' | 'customers' | 'investment-pools';

type CatalogEntry = {
  id: string;
  label: string;
  detail: string;
  status: string;
};

async function authenticatedClient(request: NextRequest) {
  const sessionSecret = process.env['NEXTAUTH_SECRET'];
  if (!sessionSecret && process.env['NODE_ENV'] === 'production') {
    throw new Error('NEXTAUTH_SECRET is required in production');
  }
  const token = await backendSession(request);
  if (typeof token?.accessToken !== 'string') return undefined;

  return createPmsApiClient({
    fetch: backendFetch,
    baseUrl: process.env['CORE_API_URL'] ?? 'http://localhost:3001',
    accessToken: () => token.accessToken as string,
  });
}

async function authenticatedCatalog(request: NextRequest, kind: CatalogKind, correlationId: string): Promise<Response | undefined> {
  const sessionSecret = process.env['NEXTAUTH_SECRET'];
  if (!sessionSecret && process.env['NODE_ENV'] === 'production') throw new Error('NEXTAUTH_SECRET is required in production');
  const token = await backendSession(request);
  if (typeof token?.accessToken !== 'string') return undefined;
  const baseUrl = process.env['CORE_API_URL'] ?? 'http://localhost:3001';
  return fetch(`${baseUrl.replace(/\/$/, '').replace(/\/api$/, '')}/api/${kind}?limit=100&offset=0`, {
    cache: 'no-store',
    headers: {
      accept: 'application/json',
      authorization: `Bearer ${token.accessToken}`,
      'x-correlation-id': correlationId,
    },
  });
}

function catalogEntries(kind: CatalogKind, payload: unknown): CatalogEntry[] {
  const items = typeof payload === 'object' && payload !== null && Array.isArray((payload as { items?: unknown }).items)
    ? (payload as { items: unknown[] }).items : [];
  return items.flatMap((item): CatalogEntry[] => {
    if (!item || typeof item !== 'object') return [];
    const value = item as Record<string, unknown>;
    if (kind === 'products' && typeof value.productId === 'string' && typeof value.code === 'string' && typeof value.name === 'string' && typeof value.status === 'string') {
      return [{ id: value.productId, label: value.code, detail: value.name, status: value.status }];
    }
    if (kind === 'customers' && typeof value.customerId === 'string' && typeof value.segment === 'string' && typeof value.kycStatus === 'string') {
      return [{ id: value.customerId, label: `Client ${value.customerId}`, detail: `${value.segment} · KYC ${value.kycStatus}`, status: value.kycStatus }];
    }
    if (kind === 'investment-pools' && typeof value.poolId === 'string' && typeof value.displayName === 'string' && typeof value.currency === 'string' && typeof value.status === 'string') {
      return [{ id: value.poolId, label: value.poolId, detail: `${value.displayName} · ${value.currency}`, status: value.status }];
    }
    return [];
  });
}

export async function GET(request: NextRequest, context: RouteContext) {
  const requestedPath = (await context.params).path;
  if (requestedPath.length === 3 && requestedPath[0] === 'products' && requestedPath[2] === 'terms' && isUuid(requestedPath[1])) {
    return forwardCore(request, `products/${encodeURIComponent(requestedPath[1])}/terms`);
  }
  const requestCorrelationId = correlationId(request);
  const client = await authenticatedClient(request);
  if (!client) return problem(401, 'Unauthenticated', requestCorrelationId);
  const { path } = await context.params;

  try {
    const tracing = {
      correlationId: requestCorrelationId,
      traceparent: request.headers.get('traceparent') ?? undefined,
    };
    if (path.length === 1 && (path[0] === 'products' || path[0] === 'customers' || path[0] === 'investment-pools')) {
      const kind = path[0] as CatalogKind;
      const response = await authenticatedCatalog(request, kind, requestCorrelationId);
      if (!response) return problem(401, 'Unauthenticated', requestCorrelationId);
      const payload: unknown = await response.json().catch(() => undefined);
      if (!response.ok) return NextResponse.json(payload ?? { type: 'about:blank', title: 'Backend unavailable', status: response.status }, {
        status: response.status,
        headers: { 'content-type': 'application/problem+json', 'x-correlation-id': requestCorrelationId },
      });
      return correlatedJson({ items: catalogEntries(kind, payload) }, requestCorrelationId);
    }
    if (path.length === 2 && path[0] === 'audit' && path[1] === 'events') {
      const parameters = request.nextUrl.searchParams;
      const requestedLimit = parameters.get('limit');
      const limit = requestedLimit === null ? 50 : Number(requestedLimit);
      if (!Number.isInteger(limit) || limit < 1 || limit > 200) {
        return problem(400, 'Invalid audit event limit', requestCorrelationId);
      }
      const action = parameters.get('action') ?? undefined;
      const resourceType = parameters.get('resourceType') ?? undefined;
      const outcome = parameters.get('outcome') ?? undefined;
      const auditCorrelationId = parameters.get('auditCorrelationId') ?? undefined;
      const businessDateFrom = parameters.get('businessDateFrom') ?? undefined;
      const businessDateTo = parameters.get('businessDateTo') ?? undefined;
      if ((action !== undefined && !/^[A-Z][A-Z0-9_.:-]{0,127}$/.test(action)) ||
        (resourceType !== undefined && !/^[A-Za-z][A-Za-z0-9_.:-]{0,127}$/.test(resourceType)) ||
        (outcome !== undefined && !isAuditOutcome(outcome)) ||
        (auditCorrelationId !== undefined && !isUuid(auditCorrelationId)) ||
        (businessDateFrom !== undefined && !isExactDate(businessDateFrom)) ||
        (businessDateTo !== undefined && !isExactDate(businessDateTo)) ||
        (businessDateFrom !== undefined && businessDateTo !== undefined && businessDateFrom > businessDateTo)) {
        return problem(400, 'Invalid audit event filters', requestCorrelationId);
      }
      return correlatedJson(await client.getAuditTrail({
        ...tracing, limit, action, resourceType, outcome, auditCorrelationId, businessDateFrom, businessDateTo,
      }), requestCorrelationId);
    }
    if (path.length === 3 && path[0] === 'reporting' && path[1] === 'dashboards') {
      if (!isDashboardAudience(path[2])) return problem(400, 'Invalid dashboard audience', requestCorrelationId);
      const poolId = request.nextUrl.searchParams.get('poolId') ?? undefined;
      if (poolId !== undefined && !/^[A-Za-z0-9._:-]{2,64}$/.test(poolId)) return problem(400, 'Invalid dashboard pool identifier', requestCorrelationId);
      return correlatedJson(await client.getAudienceDashboard({ ...tracing, audience: path[2], poolId }), requestCorrelationId);
    }
    if (path.length === 5 && path[0] === 'reporting' && path[1] === 'profit-explanations' && path[3] === 'accounts') {
      if (!isUuid(path[2]) || !isUuid(path[4])) return problem(400, 'Valid run and account identifiers are required', requestCorrelationId);
      const requestedView = request.nextUrl.searchParams.get('view') ?? 'SIMPLIFIED';
      if (requestedView !== 'SIMPLIFIED' && requestedView !== 'DETAILED') return problem(400, 'Invalid profit explanation view', requestCorrelationId);
      return correlatedJson(await client.getProfitExplanation({ ...tracing, runId: path[2], accountId: path[4], view: requestedView }), requestCorrelationId);
    }
    if (path.length === 3 && path[0] === 'reporting' && path[1] === 'tenor-curves') {
      const poolId = path[2], customerToken = request.nextUrl.searchParams.get('customerToken') ?? undefined;
      if (!/^[A-Za-z0-9._:-]{2,64}$/.test(poolId ?? '')) return problem(400, 'Invalid curve pool identifier', requestCorrelationId);
      if (customerToken !== undefined && !/^tok_[A-Za-z0-9_-]{16,}$/.test(customerToken)) return problem(400, 'Invalid tokenized customer identifier', requestCorrelationId);
      return correlatedJson(await client.getTenorYieldCurve({ ...tracing, poolId, customerToken }), requestCorrelationId);
    }
    if (path.length === 3 && path[0] === 'risk' && path[1] === 'dashboard') {
      if (!/^[A-Za-z0-9][A-Za-z0-9._-]{1,63}$/.test(path[2] ?? '')) return problem(400, 'Invalid risk dashboard pool identifier', requestCorrelationId);
      return correlatedJson(await client.getPublishedRiskDashboard({ ...tracing, poolId: path[2] }), requestCorrelationId);
    }
    if (path.length === 3 && path[0] === 'documents' && path[1] === 'archive-requests') {
      if (!isUuid(path[2])) return problem(400, 'Invalid document archive request identifier', requestCorrelationId);
      return correlatedJson(await client.getDocumentArchiveRequest({ ...tracing, requestId: path[2] }), requestCorrelationId);
    }
    if (path.length === 1 && path[0] === 'status') {
      return correlatedJson(await client.getApiStatus(tracing), requestCorrelationId);
    }
    if (path.length === 3 && path[0] === 'cbs' && path[1] === 'data-quality' && path[2] === 'batches') {
      const integer = (name: string) => { const value = request.nextUrl.searchParams.get(name); return value === null ? undefined : Number(value); };
      return correlatedJson(await client.listCbsDataQualityBatches({ ...tracing,
        businessDate: request.nextUrl.searchParams.get('businessDate') ?? undefined,
        state: request.nextUrl.searchParams.get('state') ?? undefined,
        limit: integer('limit'), offset: integer('offset'),
      }), requestCorrelationId);
    }
    if (path.length === 3 && path[0] === 'reference-data' && path[1] === 'currencies') {
      const businessDate = request.nextUrl.searchParams.get('businessDate');
      if (!businessDate || !/^\d{4}-\d{2}-\d{2}$/.test(businessDate)) {
        return problem(400, 'Valid businessDate is required', requestCorrelationId);
      }
      return correlatedJson(await client.getEffectiveCurrency({
        ...tracing, code: path[2], businessDate,
      }), requestCorrelationId);
    }
    if (path.length === 3 && path[0] === 'reference-data' && path[1] === 'regulatory-rules') {
      const businessDate = request.nextUrl.searchParams.get('businessDate');
      if (!isDate(businessDate)) return problem(400, 'Valid businessDate is required', requestCorrelationId);
      return correlatedJson(await client.getEffectiveRegulatoryRule({ ...tracing, ruleCode: path[2], businessDate }), requestCorrelationId);
    }
    if (path.length === 2 && path[0] === 'investment-accounts') {
      const businessDate = request.nextUrl.searchParams.get('businessDate');
      if (!businessDate || !/^\d{4}-\d{2}-\d{2}$/.test(businessDate)) {
        return problem(400, 'Valid businessDate is required', requestCorrelationId);
      }
      return correlatedJson(await client.getInvestmentAccountSnapshot({
        ...tracing, accountId: path[1], businessDate,
      }), requestCorrelationId);
    }
    if (path.length === 2 && path[0] === 'calculations') {
      return correlatedJson(await client.getCalculationRun({
        ...tracing, runId: path[1],
      }), requestCorrelationId);
    }
    if (path.length === 2 && path[0] === 'products') {
      return correlatedJson(await client.getInvestmentProduct({
        ...tracing, productId: path[1],
      }), requestCorrelationId);
    }
    if (path.length === 2 && path[0] === 'investment-pools') {
      return correlatedJson(await client.getInvestmentPool({
        ...tracing, poolId: path[1],
      }), requestCorrelationId);
    }
    if (path.length === 4 && path[0] === 'investment-pools' && path[1] === 'assets' && path[3] === 'allocations') {
      return correlatedJson(await client.getAssetAllocationHistory({ ...tracing, assetId: path[2], asOf: request.nextUrl.searchParams.get('asOf') ?? undefined }), requestCorrelationId);
    }
    if (path.length === 4 && path[0] === 'investment-pools' && path[1] === 'assets' && path[3] === 'anomalies') {
      return correlatedJson(await client.listAssetAnomalies({ ...tracing, assetId: path[2] }), requestCorrelationId);
    }
    if (path.length === 4 && path[0] === 'investment-pools' && path[2] === 'compositions') {
      return correlatedJson(await client.getPoolComposition({ ...tracing, poolId: path[1], businessDate: path[3] }), requestCorrelationId);
    }
    if (path.length === 2 && path[0] === 'customers') {
      return correlatedJson(await client.getCustomerProfile({ ...tracing, customerId: path[1] }), requestCorrelationId);
    }
    if (path.length === 3 && path[0] === 'products' && path[2] === 'references') {
      return correlatedJson(await client.listProductReferences({
        ...tracing, productId: path[1],
      }), requestCorrelationId);
    }
    if (path.length === 1 && path[0] === 'revenues') {
      const query = revenueQuery(request);
      if (!query) return problem(400, 'Valid poolId and businessDate are required', requestCorrelationId);
      return correlatedJson(await client.listRecognizedIncome({ ...tracing, ...query }), requestCorrelationId);
    }
    if (path.length === 2 && path[0] === 'charges' && path[1] === 'evaluation') {
      const query = revenueQuery(request);
      if (!query) return problem(400, 'Valid poolId and businessDate are required', requestCorrelationId);
      return correlatedJson(await client.evaluatePoolCharges({ ...tracing, ...query }), requestCorrelationId);
    }
    if (path.length === 2 && path[0] === 'purifications' && path[1] === 'statement') {
      const poolId = request.nextUrl.searchParams.get('poolId'), from = request.nextUrl.searchParams.get('from'), to = request.nextUrl.searchParams.get('to');
      if (!poolId?.trim() || !isDate(from) || !isDate(to) || from > to) return problem(400, 'Valid poolId and period are required', requestCorrelationId);
      return correlatedJson(await client.getPurificationStatement({ ...tracing, poolId, from, to }), requestCorrelationId);
    }
    return problem(404, 'Unknown contracted operation', requestCorrelationId);
  } catch (error) {
    return apiError(error, requestCorrelationId);
  }
}

export async function POST(request: NextRequest, context: RouteContext) {
  const requestCorrelationId = correlationId(request);
  const client = await authenticatedClient(request);
  if (!client) return problem(401, 'Unauthenticated', requestCorrelationId);
  const { path } = await context.params;
  const idempotencyKey = request.headers.get('idempotency-key');
  if (!idempotencyKey || idempotencyKey.length < 16) {
    return problem(400, 'Idempotency-Key is required', requestCorrelationId);
  }
  const body: unknown = await request.json().catch(() => undefined);

  try {
    const common = {
      correlationId: requestCorrelationId, idempotencyKey,
      traceparent: request.headers.get('traceparent') ?? undefined,
    };
    if (path.length === 3 && path[0] === 'reporting' && path[1] === 'historical-yield-forecasts') {
      if (!/^[A-Za-z0-9._:-]{2,64}$/.test(path[2] ?? '')) return problem(400, 'Invalid forecast pool identifier', requestCorrelationId);
      return correlatedJson(await client.generateHistoricalYieldForecast({ ...common, poolId: path[2] }), requestCorrelationId);
    }
    if (path.length === 2 && path[0] === 'reporting' && path[1] === 'planning-scenarios') {
      if (!isCreatePlanningScenario(body)) return problem(400, 'Invalid request body', requestCorrelationId);
      return correlatedJson(await client.createPlanningScenario({ ...common, command: body }), requestCorrelationId);
    }
    if (path.length === 4 && path[0] === 'reporting' && path[1] === 'planning-scenarios' && path[3] === 'transitions') {
      if (!isPlanningScenarioTransition(body)) return problem(400, 'Invalid request body', requestCorrelationId);
      return correlatedJson(await client.transitionPlanningScenario({ ...common, scenarioId: path[2], command: body }), requestCorrelationId);
    }
    if (path.length === 1 && path[0] === 'investment-pools') {
      if (!isCreateInvestmentPool(body)) return problem(400, 'Invalid request body', requestCorrelationId);
      return correlatedJson(await client.createInvestmentPool({ ...common, command: body }), requestCorrelationId);
    }
    if (path.length === 1 && path[0] === 'exceptions') {
      if (!isCreateExceptionCase(body)) return problem(400, 'Invalid request body', requestCorrelationId);
      return correlatedJson(await client.createExceptionCase({ ...common, command: body }), requestCorrelationId);
    }
    if (path.length === 3 && path[0] === 'exceptions' && path[2] === 'transitions') {
      if (!isExceptionTransition(body)) return problem(400, 'Invalid request body', requestCorrelationId);
      return correlatedJson(await client.transitionExceptionCase({ ...common, exceptionId: path[1], command: body }), requestCorrelationId);
    }
    if (path.length === 1 && path[0] === 'simulations') {
      if (!isQuotationCommand(body)) return problem(400, 'Invalid request body', requestCorrelationId);
      return correlatedJson(await client.solveQuotationTarget({ ...common, command: body }), requestCorrelationId);
    }
    if (path.length === 3 && path[0] === 'accounting' && path[1] === 'opening-balances' && path[2] === 'certifications') {
      if (!isOpeningBalanceCertification(body)) return problem(400, 'Invalid request body', requestCorrelationId);
      return correlatedJson(await client.certifyOpeningBalances({ ...common, command: body }), requestCorrelationId);
    }
    if (path.length === 2 && path[0] === 'tokenization' && path[1] === 'tokenize') {
      if (!isTokenizeCommand(body)) return problem(400, 'Invalid request body', requestCorrelationId);
      return correlatedJson(await client.tokenizePersonalData({ ...common, command: body }), requestCorrelationId);
    }
    if (path.length === 2 && path[0] === 'tokenization' && path[1] === 'tokenize-batch') {
      if (!isTokenizeBatchCommand(body)) return problem(400, 'Invalid request body', requestCorrelationId);
      return correlatedJson(await client.tokenizePersonalDataBatch({ ...common, command: body }), requestCorrelationId);
    }
    if (path.length === 2 && path[0] === 'tokenization' && path[1] === 'detokenize') {
      if (!isTokenOperationCommand(body)) return problem(400, 'Invalid request body', requestCorrelationId);
      return correlatedJson(await client.detokenizePersonalData({ ...common, command: body }), requestCorrelationId);
    }
    if (path.length === 2 && path[0] === 'tokenization' && path[1] === 'search') {
      if (!isTokenSearchCommand(body)) return problem(400, 'Invalid request body', requestCorrelationId);
      return correlatedJson(await client.searchTokenizedData({ ...common, command: body }), requestCorrelationId);
    }
    if (path.length === 2 && path[0] === 'tokenization' && path[1] === 'rotate') {
      if (!isTokenOperationCommand(body)) return problem(400, 'Invalid request body', requestCorrelationId);
      return correlatedJson(await client.rotatePersonalDataToken({ ...common, command: body }), requestCorrelationId);
    }
    if (path.length === 2 && path[0] === 'revenues' && path[1] === 'imports') {
      if (!isRecognizedIncome(body)) return problem(400, 'Invalid request body', requestCorrelationId);
      return correlatedJson(await client.importRecognizedIncome({ ...common, command: body }), requestCorrelationId);
    }
    if (path.length === 2 && path[0] === 'revenues' && path[1] === 'adjustments') {
      if (!isIncomeAdjustment(body)) return problem(400, 'Invalid request body', requestCorrelationId);
      return correlatedJson(await client.adjustRecognizedIncome({ ...common, command: body }), requestCorrelationId);
    }
    if (path.length === 2 && path[0] === 'charges' && path[1] === 'policies') {
      if (!isChargePolicy(body)) return problem(400, 'Invalid request body', requestCorrelationId);
      return correlatedJson(await client.configureChargePolicy({ ...common, command: body }), requestCorrelationId);
    }
    if (path.length === 2 && path[0] === 'charges' && path[1] === 'imports') {
      if (!isPoolCharge(body)) return problem(400, 'Invalid request body', requestCorrelationId);
      return correlatedJson(await client.importPoolCharge({ ...common, command: body }), requestCorrelationId);
    }
    if (path.length === 1 && path[0] === 'purifications') {
      if (!isPurificationCase(body)) return problem(400, 'Invalid request body', requestCorrelationId);
      return correlatedJson(await client.identifyPurification({ ...common, command: body }), requestCorrelationId);
    }
    if (path.length === 3 && path[0] === 'purifications' && path[2] === 'document') {
      if (!isPurificationDocumentation(body)) return problem(400, 'Invalid request body', requestCorrelationId);
      await client.documentPurification({ ...common, purificationId: path[1], command: body });
      return correlatedJson({ documented: true }, requestCorrelationId);
    }
    if (path.length === 3 && path[0] === 'purifications' && path[2] === 'payments') {
      if (!isPurificationPayment(body)) return problem(400, 'Invalid request body', requestCorrelationId);
      await client.payPurification({ ...common, purificationId: path[1], command: body });
      return correlatedJson({ paid: true }, requestCorrelationId);
    }
    if (path.length === 1 && path[0] === 'customers') {
      if (!isCustomerProfile(body)) return problem(400, 'Invalid request body', requestCorrelationId);
      return correlatedJson(await client.createCustomerProfile({ ...common, command: body }), requestCorrelationId);
    }
    if (path.length === 2 && path[0] === 'investment-accounts' && path[1] === 'subscriptions') {
      if (!isCreateInvestmentSubscription(body)) return problem(400, 'Invalid request body', requestCorrelationId);
      return correlatedJson(await client.createInvestmentSubscription({ ...common, command: body }), requestCorrelationId);
    }
    if (path.length === 4 && path[0] === 'investment-accounts' && path[1] === 'subscriptions' && path[3] === 'actions') {
      if (!isInvestmentSubscriptionAction(body)) return problem(400, 'Invalid request body', requestCorrelationId);
      return correlatedJson(await client.transitionInvestmentSubscription({ ...common, accountId: path[2], command: body }), requestCorrelationId);
    }
    if (path.length === 3 && path[0] === 'customers' && path[2] === 'restrictions') {
      if (!isLegalRestriction(body)) return problem(400, 'Invalid request body', requestCorrelationId);
      await client.addCustomerRestriction({ ...common, customerId: path[1], command: body });
      return correlatedJson({ restricted: true }, requestCorrelationId);
    }
    if (path.length === 5 && path[0] === 'customers' && path[2] === 'restrictions' && path[4] === 'lift') {
      if (!isUuid(path[1]) || !isUuid(path[3]) || !isRestrictionLift(body)) return problem(400, 'Valid identifiers and liftedAt date are required', requestCorrelationId);
      return correlatedJson(await client.liftCustomerRestriction({ ...common, customerId: path[1], restrictionId: path[3], command: body }), requestCorrelationId);
    }
    if (path.length === 2 && path[0] === 'reporting' && path[1] === 'exports') {
      if (!isCreateSecureExport(body)) return problem(400, 'Invalid request body', requestCorrelationId);
      return correlatedJson(await client.createSecureExport({ ...common, command: body }), requestCorrelationId);
    }
    if (path.length === 4 && path[0] === 'reporting' && path[1] === 'exports' && path[3] === 'approvals') {
      return correlatedJson(await client.approveSecureExport({ ...common, exportId: path[2] }), requestCorrelationId);
    }
    if (path.length === 4 && path[0] === 'reporting' && path[1] === 'exports' && path[3] === 'generation') {
      if (!isSecureExportGeneration(body)) return problem(400, 'Invalid request body', requestCorrelationId);
      return correlatedJson(await client.generateSecureExport({ ...common, exportId: path[2], command: body }), requestCorrelationId);
    }
    if (path.length === 3 && path[0] === 'investment-pools' && path[2] === 'funding-sources') {
      if (!isPoolFundingSource(body)) return problem(400, 'Invalid request body', requestCorrelationId);
      return correlatedJson(await client.addInvestmentPoolFunding({ ...common, poolId: path[1], command: body }), requestCorrelationId);
    }
    if (path.length === 3 && path[0] === 'investment-pools' && isPoolAction(path[2])) {
      return correlatedJson(await client.transitionInvestmentPool({ ...common, poolId: path[1], action: path[2] }), requestCorrelationId);
    }
    if (path.length === 3 && path[0] === 'investment-pools' && path[2] === 'compositions') {
      if (!isPoolComposition(body)) return problem(400, 'Invalid request body', requestCorrelationId);
      return correlatedJson(await client.recordPoolComposition({ ...common, poolId: path[1], command: body }), requestCorrelationId);
    }
    if (path.length === 4 && path[0] === 'investment-pools' && path[1] === 'assets' && path[3] === 'anomalies') {
      if (!isAssetAnomaly(body)) return problem(400, 'Invalid request body', requestCorrelationId);
      return correlatedJson(await client.reportAssetAnomaly({ ...common, assetId: path[2], command: body }), requestCorrelationId);
    }
    if (path.length === 6 && path[0] === 'investment-pools' && path[1] === 'assets' && path[3] === 'anomalies' && path[5] === 'resolve') {
      if (!isAnomalyResolution(body)) return problem(400, 'Invalid request body', requestCorrelationId);
      return correlatedJson(await client.resolveAssetAnomaly({ ...common, assetId: path[2], anomalyId: path[4], command: body }), requestCorrelationId);
    }
    if (path.length === 4 && path[0] === 'investment-pools' && path[2] === 'allocations' && path[3] === 'simulate') {
      if (!isAssetAllocation(body)) return problem(400, 'Invalid request body', requestCorrelationId);
      return correlatedJson(await client.simulateAssetAllocation({ ...common, poolId: path[1], command: body }), requestCorrelationId);
    }
    if (path.length === 3 && path[0] === 'investment-pools' && path[2] === 'allocations') {
      if (!isAssetAllocation(body)) return problem(400, 'Invalid request body', requestCorrelationId);
      return correlatedJson(await client.allocateAssetToPool({ ...common, poolId: path[1], command: body }), requestCorrelationId);
    }
    if (path.length === 1 && path[0] === 'products') {
      if (!isCreateProduct(body)) return problem(400, 'Invalid request body', requestCorrelationId);
      return correlatedJson(await client.createInvestmentProduct({ ...common, command: body }), requestCorrelationId);
    }
    if (path.length === 2 && path[0] === 'products' && path[1] === 'compliance-references') {
      if (!isCreateComplianceReference(body)) return problem(400, 'Invalid request body', requestCorrelationId);
      return correlatedJson(await client.createComplianceReference({ ...common, command: body }), requestCorrelationId);
    }
    if (path.length === 3 && path[0] === 'products' && path[2] === 'compliance-arbitrations') {
      if (!isComplianceArbitration(body)) return problem(400, 'Invalid request body', requestCorrelationId);
      await client.arbitrateProductCompliance({ ...common, productId: path[1], command: body });
      return correlatedJson({ arbitrated: true }, requestCorrelationId);
    }
    if (path.length === 4 && path[0] === 'products' && path[2] === 'terms' && path[3] === 'simulate') {
      if (!isProductTermsDraft(body)) return problem(400, 'Invalid request body', requestCorrelationId);
      return correlatedJson(await client.simulateProductTerms({ ...common, productId: path[1], command: body }), requestCorrelationId);
    }
    if (path.length === 3 && path[0] === 'products' && path[2] === 'terms') {
      if (!isProductTermsDraft(body)) return problem(400, 'Invalid request body', requestCorrelationId);
      return correlatedJson(await client.createProductTermsDraft({ ...common, productId: path[1], command: body }), requestCorrelationId);
    }
    if (path.length === 5 && path[0] === 'products' && path[2] === 'terms' && path[4] === 'publish') {
      if (!isPublishProductTerms(body)) return problem(400, 'Invalid request body', requestCorrelationId);
      return correlatedJson(await client.publishProductTerms({ ...common, productId: path[1], termsVersionId: path[3], command: body }), requestCorrelationId);
    }
    if (path.length === 3 && path[0] === 'products' && isProductAction(path[2])) {
      if (!isProductTransition(body)) return problem(400, 'Invalid request body', requestCorrelationId);
      return correlatedJson(await client.transitionInvestmentProduct({ ...common, productId: path[1], action: path[2], command: body }), requestCorrelationId);
    }
    if (path.length === 3 && path[0] === 'products' && path[2] === 'references') {
      if (!isAssociateProductReference(body)) return problem(400, 'Invalid request body', requestCorrelationId);
      await client.associateProductReference({ ...common, productId: path[1], command: body });
      return correlatedJson({ associated: true }, requestCorrelationId);
    }
    if (path.length === 3 && path[0] === 'calculations' && path[2] === 'control') {
      if (!isWorkflowApprovalCommand(body)) return problem(400, 'Invalid request body', requestCorrelationId);
      return correlatedJson(await client.controlCalculationRun({
        ...common, runId: path[1], command: body,
      }), requestCorrelationId);
    }
    if (path.length === 3 && path[0] === 'calculations' && path[2] === 'approve') {
      if (!isWorkflowApprovalCommand(body)) return problem(400, 'Invalid request body', requestCorrelationId);
      return correlatedJson(await client.approveCalculationRun({
        ...common, runId: path[1], command: body,
      }), requestCorrelationId);
    }
    if (path.length === 3 && path[0] === 'closings' && path[2] === 'approve') {
      if (!isWorkflowApprovalCommand(body)) return problem(400, 'Invalid request body', requestCorrelationId);
      return correlatedJson(await client.approveClosingPeriod({
        ...common, closingId: path[1], command: body,
      }), requestCorrelationId);
    }
    if (path.length === 3 && path[0] === 'closings' && path[2] === 'reject') {
      if (!isWorkflowApprovalCommand(body)) return problem(400, 'Invalid request body', requestCorrelationId);
      return correlatedJson(await client.rejectClosingPeriod({ ...common, closingId: path[1], command: body }), requestCorrelationId);
    }
    if (
      path.length === 4 && path[0] === 'accounting' &&
      path[1] === 'runs' && path[3] === 'post'
    ) {
      if (!isWorkflowApprovalCommand(body)) return problem(400, 'Invalid request body', requestCorrelationId);
      return correlatedJson(await client.postApprovedCalculation({
        ...common, runId: path[2], command: body,
      }), requestCorrelationId);
    }
    if (path.length === 2 && path[0] === 'accounting' && path[1] === 'reconciliations') {
      if (!isReconciliationCommand(body)) return problem(400, 'Invalid request body', requestCorrelationId);
      return correlatedJson(await client.reconcileGeneralLedger({
        ...common, command: body,
      }), requestCorrelationId);
    }
    if (path.length === 2 && path[0] === 'accounting' && path[1] === 'events') {
      if (!isAccountingEventCommand(body)) return problem(400, 'Invalid request body', requestCorrelationId);
      return correlatedJson(await client.emitAccountingEvent({ ...common, command: body }), requestCorrelationId);
    }
    if (path.length === 2 && path[0] === 'documents' && path[1] === 'archive-requests') {
      if (!isDocumentArchiveRequest(body)) return problem(400, 'Invalid request body', requestCorrelationId);
      return correlatedJson(await client.requestDocumentArchive({ ...common, command: body }), requestCorrelationId);
    }
    if (path.length === 4 && path[0] === 'accounting' && path[1] === 'journals' && path[3] === 'acknowledgements') {
      if (!isUuid(path[2]) || !isAccountingAcknowledgementCommand(body)) return problem(400, 'Invalid request body', requestCorrelationId);
      return correlatedJson(await client.acknowledgeAccountingEvent({ ...common, journalEntryId: path[2], command: body }), requestCorrelationId);
    }
    if (path.length === 2 && path[0] === 'compliance' && path[1] === 'sharia-reviews') {
      if (!isShariaSubmission(body)) return problem(400, 'Invalid request body', requestCorrelationId);
      return correlatedJson(await client.submitShariaReview({ ...common, command: body }), requestCorrelationId);
    }
    if (path.length === 4 && path[0] === 'compliance' && path[1] === 'sharia-reviews' && path[3] === 'review') {
      if (!isShariaOpinion(body)) return problem(400, 'Invalid request body', requestCorrelationId);
      return correlatedJson(await client.reviewShariaCase({ ...common, reviewId: path[2], command: body }), requestCorrelationId);
    }
    if (path.length === 4 && path[0] === 'compliance' && path[1] === 'sharia-reviews' && path[3] === 'decide') {
      if (!isShariaDecision(body)) return problem(400, 'Invalid request body', requestCorrelationId);
      return correlatedJson(await client.decideShariaCase({ ...common, reviewId: path[2], command: body }), requestCorrelationId);
    }
    if (path.length === 2 && path[0] === 'risk' && path[1] === 'dcr-calculations') {
      if (!isDcrCommand(body)) return problem(400, 'Invalid request body', requestCorrelationId);
      return correlatedJson(await client.calculateDcr({ ...common, command: body }), requestCorrelationId);
    }
    if (path.length === 2 && path[0] === 'risk' && path[1] === 'stress-scenarios') {
      if (!isStressCommand(body)) return problem(400, 'Invalid request body', requestCorrelationId);
      return correlatedJson(await client.runStressScenario({ ...common, command: body }), requestCorrelationId);
    }
    if (path.length === 3 && path[0] === 'reporting' && path[1] === 'regulatory-reports' && path[2] === 'generate') {
      if (!isReportGeneration(body)) return problem(400, 'Invalid request body', requestCorrelationId);
      return correlatedJson(await client.generateRegulatoryReport({ ...common, command: body }), requestCorrelationId);
    }
    if (path.length === 4 && path[0] === 'reporting' && path[1] === 'regulatory-reports' && path[3] === 'publish') {
      if (!isReportPublication(body)) return problem(400, 'Invalid request body', requestCorrelationId);
      return correlatedJson(await client.publishRegulatoryReport({
        ...common, regulatoryReportId: path[2], command: body,
      }), requestCorrelationId);
    }
    if (
      path.length === 4 && path[0] === 'accounting' &&
      path[1] === 'journals' && path[3] === 'reverse'
    ) {
      if (!isJournalReversalCommand(body)) return problem(400, 'Invalid request body', requestCorrelationId);
      return correlatedJson(await client.reversePostedJournal({
        ...common, journalEntryId: path[2], command: body,
      }), requestCorrelationId);
    }
    if (path.length === 4 && path[0] === 'pools' && path[2] === 'operations' && path[3] === 'approve') {
      if (!isApproveCommand(body)) return problem(400, 'Invalid request body', requestCorrelationId);
      return correlatedJson(await client.approvePoolOperation({
        poolId: path[1],
        command: body,
        ...common,
      }), requestCorrelationId);
    }
    return problem(404, 'Unknown contracted operation', requestCorrelationId);
  } catch (error) {
    return apiError(error, requestCorrelationId);
  }
}

function isWorkflowApprovalCommand(value: unknown): value is WorkflowApprovalCommand {
  if (!value || typeof value !== 'object') return false;
  const justification = (value as Record<string, unknown>)['justification'];
  return typeof justification === 'string' && justification.trim().length >= 10 && justification.length <= 1000;
}

function isQuotationCommand(value: unknown): value is QuotationCommand {
  if (!value || typeof value !== 'object') return false;
  const command = value as Record<string, unknown>, basis = command['basis'];
  if (!isDecimal(command['placementAmount']) || Number(command['placementAmount']) <= 0 || !isDecimal(command['targetNetRatePercent']) || Number(command['targetNetRatePercent']) <= 0 || !basis || typeof basis !== 'object') return false;
  const selection = basis as Record<string, unknown>, type = String(selection['type']);
  return ['GLOBAL_POOL', 'FINANCING_TYPE', 'DESIGNATED_FINANCING', 'CUSTOMER', 'SECTOR'].includes(type) && (type === 'GLOBAL_POOL' || typeof selection['reference'] === 'string' && selection['reference'].trim().length > 0);
}

function isOpeningBalanceCertification(value: unknown): value is OpeningBalanceCertificationCommand {
  if (!value || typeof value !== 'object') return false;
  const command = value as Record<string, unknown>, lines = command['lines'];
  if (typeof command['certificationId'] !== 'string' || !/^[0-9a-f-]{36}$/i.test(command['certificationId']) || typeof command['signedAt'] !== 'string' || Number.isNaN(Date.parse(command['signedAt'])) || !Array.isArray(lines) || lines.length !== 4) return false;
  const components = new Set(lines.map((line) => line && typeof line === 'object' ? (line as Record<string, unknown>)['component'] : undefined));
  return ['HISTORICAL_ACCOUNTS', 'PER', 'IRR', 'PAST_DISTRIBUTIONS'].every((component) => components.has(component)) && lines.every((line) => { if (!line || typeof line !== 'object') return false; const item = line as Record<string, unknown>; return typeof item['currencyCode'] === 'string' && /^[A-Z]{3}$/.test(item['currencyCode']) && isDecimal(item['migratedAmount']) && item['migratedAmount'] === item['generalLedgerAmount'] && typeof item['evidenceReference'] === 'string' && item['evidenceReference'].trim().length > 0; });
}

function hasTokenPurpose(value: unknown): value is Record<string, unknown> { return !!value && typeof value === 'object' && typeof (value as Record<string, unknown>)['purpose'] === 'string' && String((value as Record<string, unknown>)['purpose']).trim().length >= 3; }
function isTokenizeCommand(value: unknown): value is TokenizeCommand { return hasTokenPurpose(value) && typeof value['value'] === 'string' && value['value'].length > 0 && typeof value['dataClass'] === 'string' && value['dataClass'].trim().length > 0; }
function isTokenizeBatchCommand(value: unknown): value is TokenizeBatchCommand { return hasTokenPurpose(value) && Array.isArray(value['values']) && value['values'].length > 0 && value['values'].length <= 1000 && value['values'].every((item) => typeof item === 'string' && item.length > 0) && typeof value['dataClass'] === 'string' && value['dataClass'].trim().length > 0; }
function isTokenOperationCommand(value: unknown): value is TokenOperationCommand { return hasTokenPurpose(value) && typeof value['token'] === 'string' && /^tok_[A-Za-z0-9_-]{16,128}$/.test(value['token']); }
function isTokenSearchCommand(value: unknown): value is TokenSearchCommand { return hasTokenPurpose(value) && typeof value['searchDigestSha256'] === 'string' && /^[0-9a-f]{64}$/.test(value['searchDigestSha256']) && typeof value['dataClass'] === 'string' && value['dataClass'].trim().length > 0; }
function isCreateComplianceReference(value: unknown): value is CreateComplianceReference { if (!value || typeof value !== 'object') return false; const item = value as Record<string, unknown>; return ['BA', 'SHARIA_COMMITTEE', 'AAOIFI', 'IFSB'].includes(String(item['source'])) && typeof item['referenceCode'] === 'string' && /^[A-Za-z0-9._/-]{2,80}$/.test(item['referenceCode']) && typeof item['version'] === 'string' && item['version'].trim().length > 0 && typeof item['title'] === 'string' && item['title'].trim().length >= 3 && isDate(item['effectiveFrom']) && (item['effectiveTo'] === undefined || isDate(item['effectiveTo']) && item['effectiveTo'] >= item['effectiveFrom']); }
function isComplianceArbitration(value: unknown): value is ComplianceArbitration { if (!value || typeof value !== 'object') return false; const item = value as Record<string, unknown>; return typeof item['selectedReferenceId'] === 'string' && /^[0-9a-f-]{36}$/i.test(item['selectedReferenceId']) && typeof item['rejectedReferenceId'] === 'string' && /^[0-9a-f-]{36}$/i.test(item['rejectedReferenceId']) && item['selectedReferenceId'] !== item['rejectedReferenceId'] && typeof item['rationale'] === 'string' && item['rationale'].trim().length >= 10; }
function isCreateExceptionCase(value: unknown): value is CreateExceptionCase { if (!value || typeof value !== 'object') return false; const item = value as Record<string, unknown>; return ['sourceType', 'sourceId', 'resourceType', 'resourceId'].every((key) => typeof item[key] === 'string' && String(item[key]).trim().length > 0) && ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'].includes(String(item['severity'])) && typeof item['title'] === 'string' && item['title'].trim().length >= 5 && typeof item['description'] === 'string' && item['description'].trim().length >= 10; }
function isExceptionTransition(value: unknown): value is ExceptionTransitionCommand { if (!value || typeof value !== 'object') return false; const item = value as Record<string, unknown>; return ['QUALIFIED', 'ASSIGNED', 'IN_PROGRESS', 'CORRECTED', 'CONTROLLED', 'CLOSED', 'ACCEPTED_RISK'].includes(String(item['targetStatus'])) && typeof item['comment'] === 'string' && item['comment'].trim().length >= 10 && (item['targetStatus'] !== 'ACCEPTED_RISK' || typeof item['riskAcceptanceReference'] === 'string' && item['riskAcceptanceReference'].trim().length > 0); }

function revenueQuery(request: NextRequest): { poolId: string; businessDate: string } | undefined {
  const poolId = request.nextUrl.searchParams.get('poolId'), businessDate = request.nextUrl.searchParams.get('businessDate');
  return poolId?.trim() && businessDate && /^\d{4}-\d{2}-\d{2}$/.test(businessDate) ? { poolId, businessDate } : undefined;
}

function isDate(value: unknown): value is string { return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`)); }
function isUuid(value: unknown): value is string { return typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value); }
function isExactDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}
function isAuditOutcome(value: string): value is 'SUCCESS' | 'DENIED' | 'FAILURE' {
  return value === 'SUCCESS' || value === 'DENIED' || value === 'FAILURE';
}

function isPurificationCase(value: unknown): value is PurificationCase {
  if (!value || typeof value !== 'object') return false;
  const item = value as Record<string, unknown>;
  return ['purificationId', 'incomeId'].every((key) => typeof item[key] === 'string' && /^[0-9a-f-]{36}$/i.test(String(item[key]))) && typeof item['poolId'] === 'string' && item['poolId'].trim().length > 0 && isDate(item['businessDate']) && typeof item['currency'] === 'string' && /^[A-Z]{3}$/.test(item['currency']) && isDecimal(item['amount']) && Number(item['amount']) > 0 && typeof item['reason'] === 'string' && item['reason'].trim().length > 0 && item['status'] === 'PENDING_DOCUMENTATION' && item['paidAmount'] === '0';
}

function isPurificationDocumentation(value: unknown): value is { charityBeneficiaryId: string; shariaDecisionReference: string } {
  if (!value || typeof value !== 'object') return false;
  const item = value as Record<string, unknown>;
  return typeof item['charityBeneficiaryId'] === 'string' && item['charityBeneficiaryId'].trim().length > 0 && typeof item['shariaDecisionReference'] === 'string' && item['shariaDecisionReference'].trim().length > 0;
}

function isPurificationPayment(value: unknown): value is { amount: string; evidenceId: string } {
  if (!value || typeof value !== 'object') return false;
  const item = value as Record<string, unknown>;
  return isDecimal(item['amount']) && Number(item['amount']) > 0 && typeof item['evidenceId'] === 'string' && item['evidenceId'].trim().length > 0;
}

function isRecognizedIncome(value: unknown): value is RecognizedIncome {
  if (!value || typeof value !== 'object') return false;
  const income = value as Record<string, unknown>;
  return ['incomeId', 'assetId'].every((key) => typeof income[key] === 'string' && /^[0-9a-f-]{36}$/i.test(String(income[key]))) && ['sourceSystem', 'sourceReference', 'poolId', 'incomeType'].every((key) => typeof income[key] === 'string' && String(income[key]).trim().length > 0) && typeof income['businessDate'] === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(income['businessDate']) && typeof income['currency'] === 'string' && /^[A-Z]{3}$/.test(income['currency']) && isNonZeroDecimal(income['amount']) && ['ACCRUED', 'RECEIVED'].includes(String(income['cashStatus'])) && ['REALIZED', 'UNREALIZED'].includes(String(income['realizationStatus']));
}

function isIncomeAdjustment(value: unknown): value is IncomeAdjustment {
  if (!value || typeof value !== 'object') return false;
  const adjustment = value as Record<string, unknown>;
  return ['adjustmentId', 'incomeId'].every((key) => typeof adjustment[key] === 'string' && /^[0-9a-f-]{36}$/i.test(String(adjustment[key]))) && isNonZeroDecimal(adjustment['amount']) && typeof adjustment['reason'] === 'string' && adjustment['reason'].trim().length >= 10 && typeof adjustment['approvalId'] === 'string' && adjustment['approvalId'].length >= 16 && typeof adjustment['actorId'] === 'string' && adjustment['actorId'].trim().length > 0 && typeof adjustment['businessDate'] === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(adjustment['businessDate']);
}

function isChargePolicy(value: unknown): value is ChargePolicy {
  if (!value || typeof value !== 'object') return false;
  const policy = value as Record<string, unknown>;
  return typeof policy['policyId'] === 'string' && /^[0-9a-f-]{36}$/i.test(policy['policyId']) && typeof policy['categoryCode'] === 'string' && /^[A-Z][A-Z0-9_]{1,63}$/.test(policy['categoryCode']) && ['POOL', 'MUDARIB', 'OTHER'].includes(String(policy['responsibility'])) && typeof policy['effectiveFrom'] === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(policy['effectiveFrom']) && (policy['effectiveTo'] === undefined || typeof policy['effectiveTo'] === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(policy['effectiveTo']) && policy['effectiveTo'] >= policy['effectiveFrom']) && (policy['shariaApprovalId'] === undefined || typeof policy['shariaApprovalId'] === 'string' && policy['shariaApprovalId'].length >= 16) && Number.isInteger(policy['version']) && Number(policy['version']) >= 1;
}

function isPoolCharge(value: unknown): value is PoolCharge {
  if (!value || typeof value !== 'object') return false;
  const charge = value as Record<string, unknown>;
  return typeof charge['chargeId'] === 'string' && /^[0-9a-f-]{36}$/i.test(charge['chargeId']) && typeof charge['poolId'] === 'string' && charge['poolId'].trim().length > 0 && typeof charge['categoryCode'] === 'string' && /^[A-Z][A-Z0-9_]{1,63}$/.test(charge['categoryCode']) && typeof charge['businessDate'] === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(charge['businessDate']) && typeof charge['currency'] === 'string' && /^[A-Z]{3}$/.test(charge['currency']) && isDecimal(charge['amount']) && Number(charge['amount']) > 0 && typeof charge['sourceReference'] === 'string' && charge['sourceReference'].trim().length > 0;
}

function isNonZeroDecimal(value: unknown): value is string { return isDecimal(value) && Number(value) !== 0; }

function isCustomerProfile(value: unknown): value is CustomerProfile {
  if (!value || typeof value !== 'object') return false;
  const profile = value as Record<string, unknown>, token = (item: unknown) => typeof item === 'string' && /^tok_[A-Za-z0-9_-]{16,128}$/.test(item);
  return typeof profile['customerId'] === 'string' && /^[0-9a-f-]{36}$/i.test(profile['customerId']) && token(profile['identityToken']) && Array.isArray(profile['beneficialOwnerTokens']) && profile['beneficialOwnerTokens'].every(token) && Array.isArray(profile['representativeTokens']) && profile['representativeTokens'].every(token) && ['RETAIL', 'SME', 'CORPORATE', 'INSTITUTIONAL'].includes(String(profile['segment'])) && ['PENDING', 'VERIFIED', 'EXPIRED', 'REJECTED'].includes(String(profile['kycStatus'])) && ['legalForm', 'sectorCode', 'branchCode'].every((key) => typeof profile[key] === 'string' && String(profile[key]).trim().length > 0) && Array.isArray(profile['restrictions']);
}

function isCreateInvestmentSubscription(value: unknown): value is CreateInvestmentSubscription {
  if (!value || typeof value !== 'object') return false;
  const command = value as Record<string, unknown>;
  return ['accountId', 'customerId', 'productId', 'productTermsVersionId'].every((key) => typeof command[key] === 'string' && /^[0-9a-f-]{36}$/i.test(String(command[key]))) && typeof command['contractVersion'] === 'string' && command['contractVersion'].trim().length > 0 && isNisbaPair(command['investorNisba'], command['bankNisba']) && typeof command['currency'] === 'string' && /^[A-Z]{3}$/.test(command['currency']);
}

function isInvestmentSubscriptionAction(value: unknown): value is InvestmentSubscriptionAction {
  if (!value || typeof value !== 'object') return false;
  const command = value as Record<string, unknown>;
  return typeof command['type'] === 'string' && command['type'].trim().length > 0 && typeof command['businessDate'] === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(command['businessDate']) && (command['amount'] === undefined || isDecimal(command['amount']));
}

function isLegalRestriction(value: unknown): value is LegalRestriction {
  if (!value || typeof value !== 'object') return false;
  const restriction = value as Record<string, unknown>;
  return typeof restriction['restrictionId'] === 'string' && /^[0-9a-f-]{36}$/i.test(restriction['restrictionId']) && ['SEIZURE', 'OPPOSITION', 'BLOCK'].includes(String(restriction['kind'])) && typeof restriction['reason'] === 'string' && restriction['reason'].trim().length > 0 && typeof restriction['effectiveFrom'] === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(restriction['effectiveFrom']);
}

function isRestrictionLift(value: unknown): value is { liftedAt: string } {
  return !!value && typeof value === 'object' && isDate((value as Record<string, unknown>)['liftedAt']);
}

function isCreateSecureExport(value: unknown): value is CreateSecureExport {
  if (!value || typeof value !== 'object') return false;
  const command = value as Record<string, unknown>;
  return typeof command['reportType'] === 'string' && /^[A-Z][A-Z0-9_]{2,63}$/.test(command['reportType']) && ['PDF', 'XLSX', 'CSV', 'API'].includes(String(command['format'])) && ['SINGLE', 'BULK'].includes(String(command['scope']));
}

function isSecureExportGeneration(value: unknown): value is SecureExportGeneration {
  if (!value || typeof value !== 'object') return false;
  const dataset = (value as Record<string, unknown>)['dataset'];
  if (!dataset || typeof dataset !== 'object') return false;
  const record = dataset as Record<string, unknown>;
  return Array.isArray(record['columns']) && record['columns'].length > 0 && Array.isArray(record['rows']);
}

function isCreateInvestmentPool(value: unknown): value is CreateInvestmentPool {
  if (!value || typeof value !== 'object') return false;
  const command = value as Record<string, unknown>;
  return typeof command['poolId'] === 'string' && command['poolId'].trim().length > 0 &&
    typeof command['displayName'] === 'string' && command['displayName'].trim().length >= 3 &&
    typeof command['currency'] === 'string' && /^[A-Z]{3}$/.test(command['currency']) &&
    typeof command['strategyCode'] === 'string' && command['strategyCode'].trim().length > 0 &&
    typeof command['validFrom'] === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(command['validFrom']) &&
    Array.isArray(command['eligibleAssetCodes']) && command['eligibleAssetCodes'].length > 0 &&
    command['eligibleAssetCodes'].every((code) => typeof code === 'string' && code.trim().length > 0) &&
    isDecimal(command['mudaribProfitShare']);
}

function isPoolFundingSource(value: unknown): value is PoolFundingSource {
  if (!value || typeof value !== 'object') return false;
  const command = value as Record<string, unknown>;
  return typeof command['sourceId'] === 'string' && command['sourceId'].trim().length > 0 &&
    typeof command['type'] === 'string' && command['type'].trim().length > 0 &&
    isDecimal(command['amount']) && Number(command['amount']) > 0 &&
    Array.isArray(command['mandateAssetCodes']) && command['mandateAssetCodes'].every((code) => typeof code === 'string');
}

function isPoolComposition(value: unknown): value is PoolCompositionInput {
  if (!value || typeof value !== 'object') return false;
  const command = value as Record<string, unknown>;
  return typeof command['businessDate'] === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(command['businessDate']) && typeof command['currency'] === 'string' && /^[A-Z]{3}$/.test(command['currency']) && ['bankEquity', 'iahRestricted', 'iahUnrestricted', 'investedAmount'].every((key) => isDecimal(command[key])) && Array.isArray(command['maturityGaps']) && Array.isArray(command['currencyGaps']);
}

function isAssetAllocation(value: unknown): value is AssetAllocation {
  if (!value || typeof value !== 'object') return false;
  const command = value as Record<string, unknown>;
  return typeof command['allocationId'] === 'string' && command['allocationId'].trim().length > 0 &&
    typeof command['assetId'] === 'string' && command['assetId'].trim().length > 0 &&
    isDecimal(command['percentage']) && Number(command['percentage']) > 0 && Number(command['percentage']) <= 100 &&
    typeof command['effectiveFrom'] === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(command['effectiveFrom']) &&
    typeof command['justification'] === 'string' && command['justification'].trim().length >= 10;
}

function isAssetAnomaly(value: unknown): value is AssetAnomaly {
  if (!value || typeof value !== 'object') return false;
  const anomaly = value as Record<string, unknown>;
  return typeof anomaly['anomalyId'] === 'string' && /^[0-9a-f-]{36}$/i.test(anomaly['anomalyId']) && typeof anomaly['kind'] === 'string' && anomaly['kind'].trim().length > 0 && typeof anomaly['reason'] === 'string' && anomaly['reason'].trim().length >= 10 && typeof anomaly['detectedAt'] === 'string' && !Number.isNaN(Date.parse(anomaly['detectedAt'])) && anomaly['status'] === 'OPEN';
}

function isAnomalyResolution(value: unknown): value is { resolvedAt: string; resolutionEvidenceId: string } {
  if (!value || typeof value !== 'object') return false;
  const resolution = value as Record<string, unknown>;
  return typeof resolution['resolvedAt'] === 'string' && !Number.isNaN(Date.parse(resolution['resolvedAt'])) && typeof resolution['resolutionEvidenceId'] === 'string' && /^[0-9a-f-]{36}$/i.test(resolution['resolutionEvidenceId']);
}

function isCreateProduct(value: unknown): value is CreateInvestmentProduct {
  if (!value || typeof value !== 'object') return false;
  const command = value as Record<string, unknown>;
  return typeof command['code'] === 'string' && /^[A-Za-z0-9_-]{2,32}$/.test(command['code']) &&
    typeof command['name'] === 'string' && command['name'].trim().length >= 3 && command['name'].length <= 160 &&
    isNisbaPair(command['investorNisba'], command['bankNisba']) &&
    (command['shariaReference'] === undefined || typeof command['shariaReference'] === 'string');
}

function isProductTransition(value: unknown): value is ProductTransitionCommand {
  return isWorkflowApprovalCommand(value);
}

function isAssociateProductReference(value: unknown): value is AssociateProductReference {
  if (!value || typeof value !== 'object') return false;
  const command = value as Record<string, unknown>;
  return ['CONTRACTUAL_DOCUMENT', 'REGULATORY_DOCUMENT', 'SHARIA_DOCUMENT', 'ACCOUNTING_SCHEMA'].includes(String(command['kind'])) &&
    typeof command['referenceId'] === 'string' && /^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(command['referenceId']);
}

function isProductAction(value: string): value is 'validate' | 'publish' | 'suspend' | 'resume' | 'close' {
  return ['validate', 'publish', 'suspend', 'resume', 'close'].includes(value);
}

function isProductTermsDraft(value: unknown): value is ProductTermsDraft {
  if (!value || typeof value !== 'object') return false;
  const command = value as Record<string, unknown>;
  return typeof command['effectiveFrom'] === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(command['effectiveFrom']) &&
    (command['effectiveTo'] === undefined || typeof command['effectiveTo'] === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(command['effectiveTo'])) &&
    isNisbaPair(command['investorNisba'], command['bankNisba']) &&
    (command['indicativeTargetRate'] === undefined || isDecimal(command['indicativeTargetRate']));
}

function isPublishProductTerms(value: unknown): value is PublishProductTerms {
  if (!value || typeof value !== 'object') return false;
  const command = value as Record<string, unknown>;
  return typeof command['businessDate'] === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(command['businessDate']) &&
    typeof command['simulationChecksumSha256'] === 'string' && /^[0-9a-f]{64}$/.test(command['simulationChecksumSha256']) &&
    typeof command['justification'] === 'string' && command['justification'].trim().length >= 10 &&
    (command['retroactiveApprovalId'] === undefined || typeof command['retroactiveApprovalId'] === 'string');
}

function isNisbaPair(investor: unknown, bank: unknown): boolean {
  if (!isDecimal(investor) || !isDecimal(bank)) return false;
  return Number(investor) >= 0 && Number(bank) >= 0 && Math.abs(Number(investor) + Number(bank) - 100) < 0.000001;
}

function isJournalReversalCommand(value: unknown): value is JournalReversalCommand {
  if (!isWorkflowApprovalCommand(value)) return false;
  const businessDate = (value as Record<string, unknown>)['reversalBusinessDate'];
  return typeof businessDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(businessDate);
}

function isReconciliationCommand(value: unknown): value is ReconciliationCommand {
  if (!value || typeof value !== 'object') return false;
  const command = value as Record<string, unknown>;
  return typeof command['businessDate'] === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(command['businessDate']) &&
    typeof command['currency'] === 'string' && /^[A-Z]{3}$/.test(command['currency']) &&
    typeof command['generalLedgerAmount'] === 'string' && /^-?\d+(?:\.\d+)?$/.test(command['generalLedgerAmount']) &&
    typeof command['sourceReference'] === 'string' && command['sourceReference'].trim().length >= 3 &&
    typeof command['sourceChecksumSha256'] === 'string' && /^[0-9a-f]{64}$/.test(command['sourceChecksumSha256']);
}

function isAccountingEventCommand(value: unknown): value is AccountingEventCommand {
  if (!value || typeof value !== 'object') return false;
  const command = value as Record<string, unknown>, lines = command['lines'];
  return ['runId', 'poolId', 'productId', 'eventId', 'entityId'].every((key) => typeof command[key] === 'string' && String(command[key]).trim().length > 0) &&
    ['REVENUE', 'PROFIT_SHARE', 'PER_MOVEMENT', 'IRR_MOVEMENT', 'PURIFICATION', 'WITHHOLDING_TAX', 'REMAINDER', 'CORRECTION'].includes(String(command['eventType'])) &&
    isDate(command['businessDate']) && Number.isInteger(command['currencyScale']) && Number(command['currencyScale']) >= 0 && Number(command['currencyScale']) <= 6 &&
    Array.isArray(lines) && lines.length >= 2 && lines.length <= 1000 && lines.every((line) => {
      if (!line || typeof line !== 'object') return false;
      const item = line as Record<string, unknown>;
      return typeof item['accountCode'] === 'string' && /^[A-Z0-9a-f:_-]{2,128}$/.test(item['accountCode']) && typeof item['currency'] === 'string' && /^[A-Z]{3}$/.test(item['currency']) && isUnsignedDecimal(item['debit']) && isUnsignedDecimal(item['credit']) && (Number(item['debit']) > 0) !== (Number(item['credit']) > 0);
    });
}

function isDocumentArchiveRequest(value: unknown): value is DocumentArchiveRequestCommand {
  if (!value || typeof value !== 'object') return false;
  const command = value as Record<string, unknown>, objectKey = command['objectKey'];
  return typeof objectKey === 'string' && /^[A-Za-z0-9][A-Za-z0-9._/-]{2,511}$/.test(objectKey) && !objectKey.includes('..') &&
    typeof command['businessType'] === 'string' && /^[A-Z][A-Z0-9_]{1,63}$/.test(command['businessType']) &&
    typeof command['businessId'] === 'string' && /^[A-Za-z0-9][A-Za-z0-9._:-]{1,127}$/.test(command['businessId']) &&
    typeof command['classification'] === 'string' && /^[A-Z][A-Z0-9_]{1,63}$/.test(command['classification']) &&
    typeof command['evidentiary'] === 'boolean';
}

function isAccountingAcknowledgementCommand(value: unknown): value is AccountingAcknowledgementCommand {
  if (!value || typeof value !== 'object') return false;
  const command = value as Record<string, unknown>;
  return ['ACKNOWLEDGED', 'REJECTED', 'RETRIED', 'REVERSED'].includes(String(command['action'])) && typeof command['externalReference'] === 'string' && command['externalReference'].trim().length > 0 &&
    (command['reason'] === undefined || typeof command['reason'] === 'string' && command['reason'].trim().length >= 10) &&
    (command['action'] !== 'REJECTED' || typeof command['reason'] === 'string' && command['reason'].trim().length >= 10);
}

function isShariaSubmission(value: unknown): value is ShariaReviewSubmission {
  if (!value || typeof value !== 'object') return false;
  const command = value as Record<string, unknown>;
  return typeof command['resourceType'] === 'string' && /^[A-Za-z][A-Za-z0-9_-]{1,63}$/.test(command['resourceType']) &&
    typeof command['resourceId'] === 'string' && command['resourceId'].trim().length > 0 && command['resourceId'].length <= 128;
}

function isShariaOpinion(value: unknown): value is ShariaOpinion {
  if (!value || typeof value !== 'object') return false;
  const opinion = (value as Record<string, unknown>)['opinion'];
  return typeof opinion === 'string' && opinion.trim().length >= 10 && opinion.length <= 4000;
}

function isShariaDecision(value: unknown): value is ShariaDecision {
  if (!value || typeof value !== 'object') return false;
  const command = value as Record<string, unknown>;
  return (command['decision'] === 'APPROVED' || command['decision'] === 'REJECTED') &&
    typeof command['justification'] === 'string' && command['justification'].trim().length >= 10 &&
    typeof command['evidenceDocumentId'] === 'string' && /^[0-9a-f-]{36}$/i.test(command['evidenceDocumentId']);
}

function isDcrCommand(value: unknown): value is DcrCalculationCommand {
  if (!value || typeof value !== 'object') return false;
  const command = value as Record<string, unknown>;
  return typeof command['poolId'] === 'string' && command['poolId'].trim().length > 0 &&
    typeof command['businessDate'] === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(command['businessDate']) &&
    typeof command['currency'] === 'string' && /^[A-Z]{3}$/.test(command['currency']) &&
    isDecimal(command['capitalDurationAmount']) && isDecimal(command['riskWeightedDurationAmount']) &&
    isDecimal(command['threshold']) && typeof command['formulaVersion'] === 'string' &&
    typeof command['inputChecksumSha256'] === 'string' && /^[0-9a-f]{64}$/.test(command['inputChecksumSha256']);
}

function isStressCommand(value: unknown): value is StressScenarioCommand {
  if (!value || typeof value !== 'object') return false;
  const command = value as Record<string, unknown>;
  return typeof command['scenarioCode'] === 'string' && /^[A-Z][A-Z0-9_-]{1,63}$/.test(command['scenarioCode']) &&
    typeof command['businessDate'] === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(command['businessDate']) &&
    typeof command['currency'] === 'string' && /^[A-Z]{3}$/.test(command['currency']) && isDecimal(command['baseAmount']) &&
    Array.isArray(command['shocks']) && command['shocks'].length >= 1 && command['shocks'].length <= 100 &&
    command['shocks'].every((shock) => !!shock && typeof shock === 'object' &&
      typeof (shock as Record<string, unknown>)['bucket'] === 'string' &&
      Number.isInteger((shock as Record<string, unknown>)['basisPoints'])) &&
    typeof command['engineVersion'] === 'string' && typeof command['inputChecksumSha256'] === 'string' &&
    /^[0-9a-f]{64}$/.test(command['inputChecksumSha256']);
}

function isDecimal(value: unknown): value is string {
  return typeof value === 'string' && /^-?(?:0|[1-9]\d*)(?:\.\d+)?$/.test(value);
}
function isUnsignedDecimal(value: unknown): value is string { return typeof value === 'string' && /^(?:0|[1-9]\d*)(?:\.\d+)?$/.test(value); }

function isDashboardAudience(value: string | undefined): value is DashboardAudience {
  return value !== undefined && ['EXECUTIVE', 'FINANCE', 'RISK_ALM', 'SHARIA'].includes(value);
}

function isPoolAction(value: string | undefined): value is 'activate' | 'suspend' | 'close' {
  return value !== undefined && ['activate', 'suspend', 'close'].includes(value);
}

function isCreatePlanningScenario(value: unknown): value is CreatePlanningScenario {
  if (!value || typeof value !== 'object') return false;
  const command = value as Record<string, unknown>, assumptions = command['assumptions'];
  return typeof command['poolId'] === 'string' && command['poolId'].trim().length > 0 &&
    ['CENTRAL', 'OPTIMISTIC', 'STRESSED'].includes(String(command['kind'])) &&
    Number.isInteger(command['version']) && Number(command['version']) >= 1 &&
    typeof command['startMonth'] === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(command['startMonth']) &&
    !!assumptions && typeof assumptions === 'object' &&
    ['monthlyResourceGrowthPercent', 'annualYieldPercent', 'monthlyPlacementGrowthPercent'].every((key) => isDecimal((assumptions as Record<string, unknown>)[key]));
}

function isPlanningScenarioTransition(value: unknown): value is PlanningScenarioTransitionCommand {
  return !!value && typeof value === 'object' && ['SUBMITTED', 'VALIDATED', 'OFFICIAL_BUDGET'].includes(String((value as Record<string, unknown>)['targetStatus']));
}

function isReportGeneration(value: unknown): value is RegulatoryReportGeneration {
  if (!value || typeof value !== 'object') return false;
  const command = value as Record<string, unknown>;
  return typeof command['reportType'] === 'string' && /^[A-Z][A-Z0-9_-]{1,63}$/.test(command['reportType']) &&
    typeof command['period'] === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(command['period']);
}

function isReportPublication(value: unknown): value is RegulatoryReportPublication {
  if (!value || typeof value !== 'object') return false;
  const command = value as Record<string, unknown>;
  return typeof command['evidenceDocumentId'] === 'string' && /^[0-9a-f-]{36}$/i.test(command['evidenceDocumentId']) &&
    typeof command['justification'] === 'string' && command['justification'].trim().length >= 10 && command['justification'].length <= 1000;
}

function correlationId(request: NextRequest): string {
  return request.headers.get('x-correlation-id') ?? crypto.randomUUID();
}

function isApproveCommand(value: unknown): value is ApprovePoolOperationCommand {
  if (!value || typeof value !== 'object') return false;
  const command = value as Record<string, unknown>;
  return (
    typeof command['amount'] === 'string' &&
    /^(?:0|[1-9][0-9]*)(?:\.[0-9]+)?$/.test(command['amount']) &&
    typeof command['currency'] === 'string' &&
    /^[A-Z]{3}$/.test(command['currency']) &&
    typeof command['legalEntityId'] === 'string' &&
    typeof command['branchId'] === 'string' &&
    command['workflowStatus'] === 'PENDING_APPROVAL'
  );
}

function apiError(error: unknown, correlationId: string): NextResponse {
  if (error instanceof PmsApiProblem) {
    return NextResponse.json(error.problem, {
      status: error.problem.status,
      headers: { 'content-type': 'application/problem+json', 'x-correlation-id': correlationId },
    });
  }
  return problem(502, 'Backend unavailable', correlationId);
}

function problem(status: number, title: string, correlationId: string): NextResponse {
  return NextResponse.json(
    { type: 'about:blank', title, status },
    { status, headers: { 'content-type': 'application/problem+json', 'x-correlation-id': correlationId } },
  );
}

function correlatedJson(body: unknown, correlationId: string): NextResponse {
  return NextResponse.json(body, { headers: { 'x-correlation-id': correlationId } });
}
