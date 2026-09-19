import { createElement, isValidElement, type FormEvent, type ReactElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { AccountingEventOperationManager, AccountingEventView, accountingCommand, allowedAcknowledgementActions } from './accounting-event-console';
import { ReconciliationOperationManager } from './async-operation';
import { accountingEventFieldErrors, type AccountingEventCommand, type AccountingEventResult } from './reconciliation-api';

const validCommand: AccountingEventCommand = {
  runId: 'run-1', poolId: 'pool-1', productId: 'product-1', eventType: 'REVENUE', eventId: 'event-1', entityId: 'entity-1',
  businessDate: '2026-09-13', currencyScale: 2,
  lines: [
    { accountCode: 'POOL:REVENUE', currency: 'DZD', debit: '100.25', credit: '0' },
    { accountCode: 'GL:REVENUE', currency: 'DZD', debit: '0', credit: '100.25' },
  ],
};
const noop = () => undefined;
function props(overrides: Partial<Parameters<typeof AccountingEventView>[0]> = {}): Parameters<typeof AccountingEventView>[0] {
  return {
    command: validCommand,
    acknowledgement: { action: 'ACKNOWLEDGED', externalReference: 'GL-1' },
    acknowledgementState: '', errors: accountingEventFieldErrors(validCommand), showErrors: false,
    busy: false, error: '', message: '', onCommandChange: noop, onLineChange: noop,
    onAddLine: noop, onRemoveLine: noop, onEmit: noop, onAcknowledgementChange: noop,
    onUpdateAcknowledgement: noop, ...overrides,
  };
}
function elementsOfType(node: ReactNode, type: string): ReactElement[] {
  if (Array.isArray(node)) return node.flatMap((child) => elementsOfType(child, type));
  if (!isValidElement(node)) return [];
  const element = node as ReactElement<{ children?: ReactNode }>;
  return [...(element.type === type ? [element] : []), ...elementsOfType(element.props.children, type)];
}
function textOf(node: ReactNode): string {
  if (Array.isArray(node)) return node.map(textOf).join('');
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  return isValidElement(node) ? textOf((node as ReactElement<{ children?: ReactNode }>).props.children) : '';
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

describe('accounting acknowledgement lifecycle', () => {
  it('exposes only legal actions for each state', () => {
    expect(allowedAcknowledgementActions('PENDING')).toEqual(['ACKNOWLEDGED', 'REJECTED']);
    expect(allowedAcknowledgementActions('ACKNOWLEDGED')).toEqual([]);
    expect(allowedAcknowledgementActions('REJECTED')).toEqual(['RETRIED']);
    expect(allowedAcknowledgementActions('RETRIED')).toEqual(['ACKNOWLEDGED', 'REJECTED', 'REVERSED']);
    expect(allowedAcknowledgementActions('REVERSED')).toEqual([]);
    expect(allowedAcknowledgementActions('UNKNOWN')).toEqual([]);
  });
});

describe('accounting event operation boundary', () => {
  it('aborts stale work and suppresses callbacks after unmount cancellation', async () => {
    const pending = deferred<string>(); const manager = new AccountingEventOperationManager(); let signal: AbortSignal | undefined; const success = vi.fn();
    const run = manager.run((current) => { signal = current; return pending.promise; }, { loading: noop, success, failure: noop, settled: noop });
    manager.cancel(); pending.resolve('stale'); await run;
    expect(signal?.aborted).toBe(true); expect(success).not.toHaveBeenCalled();
  });

  it('forwards abort, idempotency and correlation metadata and rejects malformed success', async () => {
    const controller = new AbortController(); const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ acknowledgementState: 'ACKNOWLEDGED' })));
    await accountingCommand('/api/core/accounting/events', { event: 'command' }, (value): value is { acknowledgementState: string } => Boolean(value && typeof value === 'object' && (value as { acknowledgementState?: unknown }).acknowledgementState === 'ACKNOWLEDGED'), controller.signal);
    const init = fetchMock.mock.calls[0]?.[1]; const headers = new Headers(init?.headers);
    expect(init?.signal).toBe(controller.signal); expect(headers.get('idempotency-key')).toMatch(/^[0-9a-f-]{36}$/); expect(headers.get('x-correlation-id')).toMatch(/^[0-9a-f-]{36}$/);
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ acknowledgementState: 42 })));
    await expect(accountingCommand('/api/core/accounting/events', {}, (value): value is { acknowledgementState: string } => Boolean(value && typeof value === 'object' && typeof (value as { acknowledgementState?: unknown }).acknowledgementState === 'string'), controller.signal)).rejects.toThrow('Réponse comptable invalide.');
  });
});

describe('accounting event interactive view', () => {
  it('renders business date, scale and every field of every configurable line', () => {
    const html = renderToStaticMarkup(createElement(AccountingEventView, props()));
    expect(html).toContain('id="accounting-business-date"');
    expect(html).toContain('id="accounting-currency-scale"');
    expect(html).toContain('Lignes du journal (2)');
    expect(html).toContain('id="accounting-line-0-currency"');
    expect(html).toContain('id="accounting-line-1-debit"');
    expect(html).toContain('id="accounting-line-1-credit"');
    expect(html).toContain('Ajouter une ligne');
  });

  it('announces busy state and acknowledgement updates accessibly', () => {
    const html = renderToStaticMarkup(createElement(AccountingEventView, props({ busy: true, emitted: { journalEntryId: 'journal-1', acknowledgementState: 'PENDING' } as AccountingEventResult, acknowledgementState: 'PENDING' })));
    expect(html).toContain('aria-busy="true"');
    expect(html).toContain('aria-live="polite"');
    expect(html).toContain('aria-atomic="true"');
  });

  it('connects required invalid fields to accessible error messages', () => {
    const invalid = { ...validCommand, businessDate: '2026-02-30', currencyScale: 7, lines: [{ ...validCommand.lines[0], currency: 'dz' }, validCommand.lines[1]] };
    const html = renderToStaticMarkup(createElement(AccountingEventView, props({ command: invalid, errors: accountingEventFieldErrors(invalid), showErrors: true })));
    expect(html).toContain('id="accounting-business-date"');
    expect(html).toContain('aria-invalid="true"');
    expect(html).toContain('aria-describedby="accounting-business-date-error"');
    expect(html).toContain('id="accounting-business-date-error" role="alert"');
    expect(html).toContain('aria-describedby="accounting-currency-scale-error"');
    expect(html).toContain('aria-describedby="accounting-line-0-currency-error"');
    expect(html).toContain('required=""');
  });

  it('wires clicks and field edits to add, remove and update a line', () => {
    const add = vi.fn(), remove = vi.fn(), changeLine = vi.fn();
    const view = AccountingEventView(props({ onAddLine: add, onRemoveLine: remove, onLineChange: changeLine }));
    const buttons = elementsOfType(view, 'button');
    const addButton = buttons.find((button) => button.props.children === 'Ajouter une ligne')!;
    const removeButton = buttons.find((button) => textOf(button.props.children) === 'Supprimer la ligne 1')!;
    const currency = elementsOfType(view, 'input').find((input) => input.props.id === 'accounting-line-0-currency')!;
    (addButton.props as { onClick: () => void }).onClick();
    (removeButton.props as { onClick: () => void }).onClick();
    (currency.props as { onChange: (event: { target: { value: string } }) => void }).onChange({ target: { value: 'eur' } });
    expect(add).toHaveBeenCalledOnce();
    expect(remove).toHaveBeenCalledWith(0);
    expect(changeLine).toHaveBeenCalledWith(0, 'currency', 'EUR');
  });

  it('prevents a double form submission and ignores the stale response after unmount', async () => {
    const pending = deferred<string>();
    const manager = new ReconciliationOperationManager();
    const successes: string[] = [];
    const runs: Promise<boolean>[] = [];
    let requests = 0;
    const onEmit = (event: FormEvent) => {
      event.preventDefault();
      runs.push(manager.run(() => { requests += 1; return pending.promise; }, { loading: noop, success: (value) => successes.push(value), failure: noop, settled: noop }));
    };
    const view = AccountingEventView(props({ onEmit }));
    const form = elementsOfType(view, 'form')[0]!;
    const event = { preventDefault: vi.fn() } as unknown as FormEvent;
    (form.props as { onSubmit: (event: FormEvent) => void }).onSubmit(event);
    (form.props as { onSubmit: (event: FormEvent) => void }).onSubmit(event);
    expect(requests).toBe(1);
    manager.cancel();
    pending.resolve('obsolete');
    await Promise.all(runs);
    expect(successes).toEqual([]);
  });
});
