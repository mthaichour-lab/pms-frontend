import type {
  DetokenizedValue,
  TokenOperationCommand,
  TokenSearchCommand,
  TokenizeBatchCommand,
  TokenizeCommand,
  TokenizedValue,
} from '@bank/pms-api-client';

export type { DetokenizedValue, TokenOperationCommand, TokenSearchCommand, TokenizeBatchCommand, TokenizeCommand, TokenizedValue };

export const tokenModes = ['tokenize', 'search', 'detokenize', 'rotate'] as const;
export type TokenMode = typeof tokenModes[number];
export const personalDataClasses = ['CUSTOMER_ID', 'NATIONAL_ID', 'ACCOUNT_HOLDER_NAME', 'CONTACT'] as const;
export type PersonalDataClass = typeof personalDataClasses[number];
export type TokenField = 'value' | 'dataClass' | 'purpose';
export type TokenFieldErrors = Partial<Record<TokenField, string>>;

export const tokenActionSpec: Record<TokenMode, { readonly needsDataClass: boolean; readonly input: 'clear' | 'digest' | 'token'; readonly result: 'token' | 'clear' }> = {
  tokenize: { needsDataClass: true, input: 'clear', result: 'token' },
  search: { needsDataClass: true, input: 'digest', result: 'token' },
  detokenize: { needsDataClass: false, input: 'token', result: 'clear' },
  rotate: { needsDataClass: false, input: 'token', result: 'token' },
};

export interface TokenFormValue {
  readonly value: string;
  readonly dataClass: string;
  readonly purpose: string;
}

export interface TokenRequestOptions {
  readonly signal?: AbortSignal;
  readonly idempotencyKey?: string;
  readonly correlationId?: string;
}

export class TokenRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly correlationId?: string,
  ) {
    super(correlationId ? `${message} (référence : ${correlationId})` : message);
    this.name = 'TokenRequestError';
  }
}

export const validPurpose = (value: string) => /^[A-Z][A-Z0-9_]{4,63}$/.test(value.trim());
export const validToken = (value: string) => /^tok_[A-Za-z0-9_-]{16,128}$/.test(value.trim());
export const validDigest = (value: string) => /^[0-9a-f]{64}$/.test(value.trim());
export const validVaultKeyVersion = (value: string) => /^[A-Za-z0-9._-]{1,64}$/.test(value);

export function tokenFieldErrors(mode: TokenMode, value: TokenFormValue): TokenFieldErrors {
  const errors: TokenFieldErrors = {};
  const specification = tokenActionSpec[mode];
  if (!validPurpose(value.purpose)) {
    errors.purpose = 'La finalité doit contenir 5 à 64 caractères majuscules, chiffres ou « _ ».';
  }
  if (specification.needsDataClass && !personalDataClasses.includes(value.dataClass as PersonalDataClass)) {
    errors.dataClass = 'Sélectionnez une classe de données autorisée.';
  }
  if (specification.input === 'clear' && (value.value.length < 1 || value.value.length > 4096)) {
    errors.value = 'La valeur à protéger est obligatoire et limitée à 4 096 caractères.';
  } else if (specification.input === 'token' && !validToken(value.value)) {
    errors.value = 'Le jeton doit respecter le format sécurisé attendu.';
  } else if (specification.input === 'digest' && !validDigest(value.value)) {
    errors.value = 'L’empreinte doit contenir 64 caractères hexadécimaux minuscules.';
  }
  return errors;
}

export function maskToken(value: string): string {
  if (!value) return '';
  const suffix = value.slice(-4);
  return `${value.startsWith('tok_') ? 'tok_' : ''}••••••••${suffix}`;
}

function isTokenizedValue(value: unknown): value is TokenizedValue {
  if (!value || typeof value !== 'object') return false;
  const tokenized = value as Record<string, unknown>;
  return typeof tokenized.token === 'string' && validToken(tokenized.token) &&
    typeof tokenized.dataClass === 'string' && personalDataClasses.includes(tokenized.dataClass as PersonalDataClass) &&
    typeof tokenized.vaultKeyVersion === 'string' && validVaultKeyVersion(tokenized.vaultKeyVersion);
}

function isDetokenizedValue(value: unknown): value is DetokenizedValue {
  if (!value || typeof value !== 'object') return false;
  const clearValue = (value as Record<string, unknown>).value;
  return typeof clearValue === 'string' && clearValue.length > 0 && clearValue.length <= 4096;
}

async function command<T>(
  operation: string,
  body: unknown,
  validate: (value: unknown) => value is T,
  options: TokenRequestOptions,
): Promise<T> {
  const correlationId = options.correlationId ?? crypto.randomUUID();
  const response = await fetch(`/api/core/tokenization/${operation}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'idempotency-key': options.idempotencyKey ?? crypto.randomUUID(),
      'x-correlation-id': correlationId,
    },
    body: JSON.stringify(body),
    signal: options.signal,
  });
  const payload: unknown = await response.json().catch(() => undefined);
  const responseCorrelationId =
    (payload && typeof payload === 'object' && typeof (payload as Record<string, unknown>).correlationId === 'string'
      ? (payload as Record<string, string>).correlationId
      : undefined) ?? response.headers.get('x-correlation-id') ?? correlationId;
  if (!response.ok) {
    const problem = (payload ?? {}) as { detail?: string; title?: string };
    throw new TokenRequestError(
      problem.detail ?? problem.title ?? `Erreur HTTP ${response.status}`,
      response.status,
      responseCorrelationId,
    );
  }
  if (!validate(payload)) {
    throw new TokenRequestError('Réponse de protection des données invalide.', response.status, responseCorrelationId);
  }
  return payload;
}

const isTokenizedBatch = (value: unknown): value is readonly TokenizedValue[] =>
  Array.isArray(value) && value.every(isTokenizedValue);

export const tokenize = (body: TokenizeCommand, options: TokenRequestOptions = {}) =>
  command('tokenize', body, isTokenizedValue, options);
export const tokenizeBatch = (body: TokenizeBatchCommand, options: TokenRequestOptions = {}) =>
  command('tokenize-batch', body, isTokenizedBatch, options);
export const detokenize = (body: TokenOperationCommand, options: TokenRequestOptions = {}) =>
  command('detokenize', body, isDetokenizedValue, options);
export const searchToken = (body: TokenSearchCommand, options: TokenRequestOptions = {}) =>
  command('search', body, isTokenizedValue, options);
export const rotateToken = (body: TokenOperationCommand, options: TokenRequestOptions = {}) =>
  command('rotate', body, isTokenizedValue, options);
