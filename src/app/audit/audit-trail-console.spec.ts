import { createElement, isValidElement, type ReactElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { AuditEvent, AuditTrail } from '@bank/pms-api-client';
import { AuditTrailRequestManager, AuditTrailView } from './audit-trail-console';

const noop = () => undefined;

function event(id: string, occurredAt: string, action = `ACTION_${id}`): AuditEvent {
  return {
    auditEventId: id,
    eventHash: 'a'.repeat(64),
    signingKeyId: 'audit-key-1',
    signatureBase64: 'signature',
    correlationId: `correlation-${id}`,
    actorId: 'auditor-1',
    technicalIdentity: 'pms-api',
    action,
    resourceType: 'POOL',
    resourceId: `pool-${id}`,
    outcome: 'SUCCESS',
    businessDate: '2026-09-09',
    occurredAt,
    sourceApplication: 'pms-api',
  };
}

function render(trail?: AuditTrail, error = '', limit = 50): string {
  return renderToStaticMarkup(createElement(AuditTrailView, {
    trail,
    error,
    busy: false,
    limit,
    filters: {},
    onFiltersChange: noop,
    onApplyFilters: noop,
    onResetFilters: noop,
    onLimitChange: noop,
    onRefresh: noop,
  }));
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => { resolve = resolvePromise; reject = rejectPromise; });
  return { promise, resolve, reject };
}

function elementsOfType(node: ReactNode, type: string): ReactElement[] {
  if (Array.isArray(node)) return node.flatMap((child) => elementsOfType(child, type));
  if (!isValidElement(node)) return [];
  const element = node as ReactElement<{ children?: ReactNode }>;
  return [...(element.type === type ? [element] : []), ...elementsOfType(element.props.children, type)];
}

describe('audit trail console', () => {
  it('renders an empty, valid chain', () => {
    const html = render({ events: [], integrity: 'HASH_CHAIN', chainValid: true, verifiedCount: 0 });
    expect(html).toContain('Chaîne de hachage valide.');
    expect(html).toContain('0 / 0');
    expect(html).toContain('Aucun événement d’audit dans ce segment.');
    expect(html).toContain('role="status"');
  });

  it('renders recent events newest first with their hashes', () => {
    const oldest = event('oldest', '2026-09-09T08:00:00.000Z');
    const newest = { ...event('newest', '2026-09-09T10:00:00.000Z'), previousHash: oldest.eventHash, eventHash: 'b'.repeat(64) };
    const html = render({ events: [oldest, newest], integrity: 'HASH_CHAIN', chainValid: true, verifiedCount: 2 });
    expect(html.indexOf('ACTION_newest')).toBeLessThan(html.indexOf('ACTION_oldest'));
    expect(html).toContain('b'.repeat(64));
    expect(html).toContain('Empreinte précédente');
  });

  it('announces a broken chain assertively and identifies the rupture', () => {
    const broken = event('broken-event', '2026-09-09T10:00:00.000Z');
    const html = render({ events: [broken], integrity: 'HASH_CHAIN', chainValid: false, verifiedCount: 0, brokenAtEventId: broken.auditEventId });
    expect(html).toContain('Rupture d’intégrité détectée.');
    expect(html).toContain('role="alert"');
    expect(html).toContain('aria-live="assertive"');
    expect(html).toContain('broken-event');
  });

  it('renders an API error', () => {
    const html = render(undefined, 'Accès au journal refusé');
    expect(html).toContain('role="alert"');
    expect(html).toContain('Accès au journal refusé');
  });

  it('marks audit sections busy while loading', () => {
    const html = renderToStaticMarkup(createElement(AuditTrailView, {
      trail: undefined, error: '', busy: true, limit: 50, filters: {},
      onFiltersChange: noop, onApplyFilters: noop, onResetFilters: noop, onLimitChange: noop, onRefresh: noop,
    }));
    expect(html).toContain('aria-busy="true"');
  });

  it('renders the selected limit and tolerates an invalid occurrence date', () => {
    const html = render({ events: [event('invalid-date', 'not-a-date')], integrity: 'HASH_CHAIN', chainValid: true, verifiedCount: 1 }, '', 100);
    expect(html).toContain('<option value="100" selected="">100 événements</option>');
    expect(html).toContain('Date indisponible');
  });

  it('wires limit changes and manual refresh to the view callbacks', () => {
    const limits: number[] = [];
    let refreshes = 0;
    const view = AuditTrailView({ trail: undefined, error: '', busy: false, limit: 50, filters: {}, onFiltersChange: noop, onApplyFilters: noop, onResetFilters: noop, onLimitChange: (limit) => limits.push(limit), onRefresh: () => { refreshes += 1; } });
    const select = elementsOfType(view, 'select').find((element) => element.props.value === 50)!;
    const button = elementsOfType(view, 'button').find((element) => element.props.type === 'button' && String(element.props.children).includes('Actualiser'))!;

    (select.props as { onChange: (event: { target: { value: string } }) => void }).onChange({ target: { value: '100' } });
    (button.props as { onClick: () => void }).onClick();

    expect(limits).toEqual([100]);
    expect(refreshes).toBe(1);
  });

  it('renders all backend filters in an accessible named form', () => {
    const html = renderToStaticMarkup(createElement(AuditTrailView, {
      trail: undefined, error: '', busy: false, limit: 50,
      filters: { action: 'READ_AUDIT_TRAIL', outcome: 'SUCCESS', businessDateFrom: '2026-09-01' },
      onFiltersChange: noop, onApplyFilters: noop, onResetFilters: noop, onLimitChange: noop, onRefresh: noop,
    }));
    expect(html).toContain('aria-label="Filtres du journal d’audit"');
    expect(html).toContain('value="READ_AUDIT_TRAIL"');
    expect(html).toContain('Identifiant de corrélation');
    expect(html).toContain('Date métier du');
    expect(html).toContain('Date métier au');
  });

  it('aborts an in-flight refresh and ignores its obsolete response', async () => {
    const first = deferred<AuditTrail>();
    const second = deferred<AuditTrail>();
    const signals: AbortSignal[] = [];
    let call = 0;
    const manager = new AuditTrailRequestManager((_limit, _filters, signal) => {
      signals.push(signal!);
      call += 1;
      return call === 1 ? first.promise : second.promise;
    });
    const successes: number[] = [];
    const failures: string[] = [];
    let settled = 0;
    const callbacks = { loading: noop, success: (trail: AuditTrail) => successes.push(trail.verifiedCount), failure: (message: string) => failures.push(message), settled: () => { settled += 1; } };

    const obsoleteLoad = manager.load(50, {}, callbacks);
    const currentLoad = manager.load(50, {}, callbacks);
    expect(signals[0]?.aborted).toBe(true);
    expect(signals[1]?.aborted).toBe(false);

    second.resolve({ events: [], integrity: 'HASH_CHAIN', chainValid: true, verifiedCount: 2 });
    await currentLoad;
    first.resolve({ events: [], integrity: 'HASH_CHAIN', chainValid: true, verifiedCount: 1 });
    await obsoleteLoad;

    expect(successes).toEqual([2]);
    expect(failures).toEqual([]);
    expect(settled).toBe(1);
  });

  it('uses the new limit and suppresses an aborted request failure', async () => {
    const first = deferred<AuditTrail>();
    const second = deferred<AuditTrail>();
    const requestedLimits: number[] = [];
    let call = 0;
    const manager = new AuditTrailRequestManager((limit) => {
      requestedLimits.push(limit);
      call += 1;
      return call === 1 ? first.promise : second.promise;
    });
    const failures: string[] = [];
    const callbacks = { loading: noop, success: noop, failure: (message: string) => failures.push(message), settled: noop };

    const obsoleteLoad = manager.load(50, {}, callbacks);
    const currentLoad = manager.load(200, { outcome: 'FAILURE' }, callbacks);
    first.reject(new Error('Requête annulée'));
    second.resolve({ events: [], integrity: 'HASH_CHAIN', chainValid: true, verifiedCount: 0 });
    await Promise.all([obsoleteLoad, currentLoad]);

    expect(requestedLimits).toEqual([50, 200]);
    expect(failures).toEqual([]);
  });

  it('suppresses callbacks after cancellation/unmount', async () => {
    const pending = deferred<AuditTrail>();
    const manager = new AuditTrailRequestManager(() => pending.promise);
    const success = () => { throw new Error('stale success callback'); };
    const failure = () => { throw new Error('stale failure callback'); };
    const running = manager.load(50, {}, { loading: noop, success, failure, settled: () => { throw new Error('stale settled callback'); } });
    manager.cancel();
    pending.resolve({ events: [], integrity: 'HASH_CHAIN', chainValid: true, verifiedCount: 0 });
    await running;
  });
});
