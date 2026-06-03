export type DimePayLedgerState =
  | 'initiated'
  | 'authorized'
  | 'captured'
  | 'failed'
  | 'refunded'
  | 'card_bound'
  | 'subscription_created'
  | 'subscription_cancelled'
  | 'subscription_paused';

export interface DimePayLedgerRow {
  id?: string;
  dimepay_reference_id: string;
  company_id?: string | null;
  subscription_id?: string | null;
  event_id?: string | null;
  event_type?: string | null;
  state: DimePayLedgerState;
  amount?: number | null;
  currency?: string | null;
  occurred_at?: string | null;
  payload?: Record<string, any>;
  created_at?: string;
}

const TERMINAL_PRIORITY: DimePayLedgerState[] = [
  'refunded',
  'captured',
  'failed',
  'authorized',
  'initiated'
];

export const deriveTruePaymentState = (ledgerRows: Pick<DimePayLedgerRow, 'state'>[]): DimePayLedgerState => {
  if (!ledgerRows || ledgerRows.length === 0) return 'initiated';

  const states = new Set(ledgerRows.map((row) => row.state));
  for (const state of TERMINAL_PRIORITY) {
    if (states.has(state)) return state;
  }

  if (states.has('subscription_cancelled')) return 'subscription_cancelled';
  if (states.has('subscription_paused')) return 'subscription_paused';
  if (states.has('subscription_created')) return 'subscription_created';
  if (states.has('card_bound')) return 'card_bound';

  return 'initiated';
};

export const mapDimePayEventToLedgerState = (eventType?: string, data: Record<string, any> = {}): DimePayLedgerState => {
  const normalized = String(eventType || '').trim().toLowerCase();
  const status = String(data.status || data.payment_status || '').trim().toLowerCase();

  if (normalized.includes('card_request') || normalized.includes('card.request')) return 'card_bound';
  if (normalized.includes('refund') || status === 'refunded') return 'refunded';
  if (normalized === 'invoice.payment_succeeded' || normalized.includes('captured') || status === 'captured' || status === 'success') {
    return 'captured';
  }
  if (normalized === 'invoice.payment_failed' || normalized.includes('failed') || status === 'failed' || status === 'declined') {
    return 'failed';
  }
  if (normalized.includes('authorized') || status === 'authorized') return 'authorized';
  if (normalized === 'subscription.created' || normalized === 'subscription.updated') return 'subscription_created';
  if (normalized === 'subscription.canceled' || normalized === 'subscription.cancelled') return 'subscription_cancelled';
  if (normalized === 'subscription.paused') return 'subscription_paused';

  return 'initiated';
};

export const getDimePayReferenceId = (event: any): string => {
  const data = event?.data || {};
  return String(
    data.invoice_id ||
    data.transaction_id ||
    data.payment_id ||
    data.order_id ||
    data.subscription_id ||
    data.dime_subscription_id ||
    data.dimepay_subscription_id ||
    data.card_request_token ||
    data.request_token ||
    data.reference_id ||
    event?.id ||
    event?.event_id ||
    `dimepay-${Date.now()}`
  );
};

export const appendDimePayLedgerEvent = async (event: any, payload: Record<string, any>) => {
  const { supabaseAdmin: supabase } = await import('./_supabaseAdmin.js');
  const data = event?.data || {};
  const referenceId = getDimePayReferenceId(event);
  const eventId = event?.id || event?.event_id || data.event_id || null;
  const state = mapDimePayEventToLedgerState(event?.type, data);

  const row = {
    dimepay_reference_id: referenceId,
    company_id: data.metadata?.company_id || data.company_id || null,
    subscription_id: data.local_subscription_id || null,
    dime_subscription_id: data.subscription_id || data.dime_subscription_id || data.dimepay_subscription_id || null,
    event_id: eventId,
    event_type: event?.type || 'unknown',
    state,
    amount: data.amount ?? null,
    currency: data.currency || 'JMD',
    occurred_at: data.occurred_at || data.created_at || event?.created_at || new Date().toISOString(),
    payload
  };

  const { error } = await supabase
    .from('dimepay_ledger')
    .insert(row);

  if (error) {
    const duplicate = error.code === '23505';
    if (!duplicate) {
      console.error('Error appending DimePay ledger event:', error);
    }
    return { ok: duplicate, duplicate, state, referenceId, derivedState: state, error };
  }

  const { data: rows } = await supabase
    .from('dimepay_ledger')
    .select('state')
    .eq('dimepay_reference_id', referenceId);

  return {
    ok: true,
    duplicate: false,
    state,
    referenceId,
    derivedState: deriveTruePaymentState(rows || [])
  };
};
