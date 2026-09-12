import { describe, expect, it } from 'vitest';
import { allowedAcknowledgementActions } from './accounting-event-console';

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
