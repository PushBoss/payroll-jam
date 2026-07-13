import { supabaseAdmin } from './_supabaseAdmin.js';

export const MAX_PAYMENT_METHODS = 5;

export interface UpsertCardParams {
  companyId: string;
  dimeCardToken: string;
  cardRequestToken?: string | null;
  cardLast4?: string | null;
  cardBrand?: string | null;
  cardExpiryMonth?: number | null;
  cardExpiryYear?: number | null;
  /**
   * Set when DimePay has ALREADY charged/bound this exact card as the live recurring
   * card (the embedded payment widget, not the tokenize-only card-request flow) - the
   * local primary designation must match what DimePay actually charged, so it forces
   * primary regardless of how many other cards the company already has saved.
   */
  forcePrimary?: boolean;
}

export interface PaymentMethodRow {
  id: string;
  company_id: string;
  dime_card_token: string;
  card_request_token: string | null;
  card_last4: string | null;
  card_brand: string | null;
  card_expiry_month: number | null;
  card_expiry_year: number | null;
  is_primary: boolean;
  created_at: string;
  updated_at: string;
}

const compact = <T extends Record<string, any>>(value: T) => Object.fromEntries(
  Object.entries(value).filter(([, entry]) => entry !== undefined && entry !== null)
) as Partial<T>;

/**
 * Idempotently records a tokenized card against a company's payment_methods vault.
 * A card only becomes primary if it's the company's first saved card - callers must
 * only rebind the live DimePay subscription / sync `subscriptions` card fields when
 * `isNewPrimary` is true, otherwise a 2nd+ card add would silently hijack billing.
 */
export const upsertCardOnFile = async (params: UpsertCardParams): Promise<
  | { ok: true; capped: false; method: PaymentMethodRow; isNewPrimary: boolean; isNewRow: boolean }
  | { ok: false; capped: true }
> => {
  const { data: existing } = await supabaseAdmin
    .from('payment_methods')
    .select('*')
    .eq('company_id', params.companyId)
    .eq('dime_card_token', params.dimeCardToken)
    .maybeSingle();

  const makePrimary = async () => {
    await supabaseAdmin
      .from('payment_methods')
      .update({ is_primary: false, updated_at: new Date().toISOString() })
      .eq('company_id', params.companyId)
      .eq('is_primary', true);
  };

  if (existing) {
    if (params.forcePrimary && !existing.is_primary) {
      await makePrimary();
    }

    const { data: updated, error: updateError } = await supabaseAdmin
      .from('payment_methods')
      .update(compact({
        card_request_token: params.cardRequestToken,
        card_last4: params.cardLast4,
        card_brand: params.cardBrand,
        card_expiry_month: params.cardExpiryMonth,
        card_expiry_year: params.cardExpiryYear,
        is_primary: params.forcePrimary ? true : undefined,
        updated_at: new Date().toISOString()
      }))
      .eq('id', existing.id)
      .select('*')
      .single();

    if (updateError) throw updateError;
    return {
      ok: true,
      capped: false,
      method: updated as PaymentMethodRow,
      isNewPrimary: !!params.forcePrimary && !existing.is_primary,
      isNewRow: false
    };
  }

  const { count } = await supabaseAdmin
    .from('payment_methods')
    .select('id', { count: 'exact', head: true })
    .eq('company_id', params.companyId);

  if ((count || 0) >= MAX_PAYMENT_METHODS && !params.forcePrimary) {
    return { ok: false, capped: true };
  }
  // forcePrimary means DimePay already charged this card - always record it even if
  // that transiently exceeds the 5-card cap (losing track of a real charge is worse).

  const isNewPrimary = params.forcePrimary || (count || 0) === 0;
  if (params.forcePrimary && (count || 0) > 0) {
    await makePrimary();
  }

  const { data: inserted, error: insertError } = await supabaseAdmin
    .from('payment_methods')
    .insert(compact({
      company_id: params.companyId,
      dime_card_token: params.dimeCardToken,
      card_request_token: params.cardRequestToken,
      card_last4: params.cardLast4,
      card_brand: params.cardBrand,
      card_expiry_month: params.cardExpiryMonth,
      card_expiry_year: params.cardExpiryYear,
      is_primary: isNewPrimary
    }))
    .select('*')
    .single();

  if (insertError) throw insertError;
  return { ok: true, capped: false, method: inserted as PaymentMethodRow, isNewPrimary, isNewRow: true };
};

export const countPaymentMethods = async (companyId: string) => {
  const { count } = await supabaseAdmin
    .from('payment_methods')
    .select('id', { count: 'exact', head: true })
    .eq('company_id', companyId);
  return count || 0;
};
