import { describe, expect, it } from 'vitest';
import { deriveTruePaymentState, mapDimePayEventToLedgerState } from './_dimepayLedger.js';

describe('DimePay ledger utilities', () => {
  it('derives true state without trusting insertion order', () => {
    expect(deriveTruePaymentState([
      { state: 'failed' },
      { state: 'authorized' },
      { state: 'captured' }
    ])).toBe('captured');

    expect(deriveTruePaymentState([
      { state: 'captured' },
      { state: 'refunded' }
    ])).toBe('refunded');

    expect(deriveTruePaymentState([
      { state: 'initiated' },
      { state: 'authorized' }
    ])).toBe('authorized');
  });

  it('maps known DimePay webhook events to ledger states', () => {
    expect(mapDimePayEventToLedgerState('invoice.payment_succeeded')).toBe('captured');
    expect(mapDimePayEventToLedgerState('invoice.payment_failed')).toBe('failed');
    expect(mapDimePayEventToLedgerState('subscription.created')).toBe('subscription_created');
    expect(mapDimePayEventToLedgerState('card_request.succeeded', { status: 'SUCCESS' })).toBe('card_bound');
  });
});
