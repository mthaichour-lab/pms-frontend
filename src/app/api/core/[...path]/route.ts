import {
  createPmsApiClient,
  PmsApiProblem,
  type ApprovePoolOperationCommand,
} from '@bank/pms-api-client';
import { getToken } from 'next-auth/jwt';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

interface RouteContext {
  params: Promise<{ path: string[] }>;
}

async function authenticatedClient(request: NextRequest) {
  const sessionSecret = process.env['NEXTAUTH_SECRET'];
  if (!sessionSecret && process.env['NODE_ENV'] === 'production') {
    throw new Error('NEXTAUTH_SECRET is required in production');
  }
  const token = await getToken({
    req: request,
    secret: sessionSecret ?? 'local-development-secret-change-me',
    cookieName: '__Secure-pms.session-token',
  });
  if (typeof token?.accessToken !== 'string') return undefined;

  return createPmsApiClient({
    baseUrl: process.env['CORE_API_URL'] ?? 'http://localhost:3001',
    accessToken: () => token.accessToken as string,
  });
}

export async function GET(request: NextRequest, context: RouteContext) {
  const requestCorrelationId = correlationId(request);
  const client = await authenticatedClient(request);
  if (!client) return problem(401, 'Unauthenticated', requestCorrelationId);
  const { path } = await context.params;

  try {
    const tracing = {
      correlationId: requestCorrelationId,
      traceparent: request.headers.get('traceparent') ?? undefined,
    };
    if (path.length === 1 && path[0] === 'status') {
      return correlatedJson(await client.getApiStatus(tracing), requestCorrelationId);
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
    if (path.length === 2 && path[0] === 'investment-accounts') {
      const businessDate = request.nextUrl.searchParams.get('businessDate');
      if (!businessDate || !/^\d{4}-\d{2}-\d{2}$/.test(businessDate)) {
        return problem(400, 'Valid businessDate is required', requestCorrelationId);
      }
      return correlatedJson(await client.getInvestmentAccountSnapshot({
        ...tracing, accountId: path[1], businessDate,
      }), requestCorrelationId);
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
  if (
    path.length !== 4 ||
    path[0] !== 'pools' ||
    path[2] !== 'operations' ||
    path[3] !== 'approve'
  ) {
    return problem(404, 'Unknown contracted operation', requestCorrelationId);
  }
  const idempotencyKey = request.headers.get('idempotency-key');
  if (!idempotencyKey || idempotencyKey.length < 16) {
    return problem(400, 'Idempotency-Key is required', requestCorrelationId);
  }
  const command = await request.json().catch(() => undefined);
  if (!isApproveCommand(command)) return problem(400, 'Invalid request body', requestCorrelationId);

  try {
    return correlatedJson(await client.approvePoolOperation({
        poolId: path[1],
        command,
        correlationId: requestCorrelationId,
        idempotencyKey,
        traceparent: request.headers.get('traceparent') ?? undefined,
      }), requestCorrelationId);
  } catch (error) {
    return apiError(error, requestCorrelationId);
  }
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
