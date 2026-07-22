import type { VercelRequest, VercelResponse } from '@vercel/node';
import { supabaseAdmin } from './_supabaseAdmin.js';
import { resolveDimePayEnvironment, createDimePayRecurringSubscription, buildCardReferenceId } from './_dimepay.js';
import { appendDimePayLedgerEvent } from './_dimepayLedger.js';
import { upsertCardOnFile } from './_paymentMethods.js';
import { requireBillingAccess } from './_billingAuth.js';

const compact = <T extends Record<string, any>>(value: T) => Object.fromEntries(
  Object.entries(value).filter(([, entry]) => entry !== undefined)
) as Partial<T>;

/**
 * Upgrades a subscription by charging an already-saved card (skips the DimePay
 * hosted widget entirely). Used by Settings' upgrade flow when the user picks an
 * existing payment method instead of adding a new card.
 */
const upgradeWithExistingCard = async (req: VercelRequest, res: VercelResponse) => {
  try {
    const { company_id, payment_method_id, plan_name, plan_type, amount, currency, billing_frequency, environment } = req.body || {};

    if (!company_id || !payment_method_id || !plan_name || amount === undefined) {
      return res.status(400).json({ error: 'company_id, payment_method_id, plan_name and amount are required' });
    }
    await requireBillingAccess(req, company_id);

    const { data: paymentMethod, error: methodError } = await supabaseAdmin
      .from('payment_methods')
      .select('*')
      .eq('id', payment_method_id)
      .eq('company_id', company_id)
      .maybeSingle();

    if (methodError || !paymentMethod) {
      return res.status(404).json({ error: 'Payment method not found' });
    }

    const { data: subscription } = await supabaseAdmin
      .from('subscriptions')
      .select('id, dime_customer_id, dimepay_customer_id')
      .eq('company_id', company_id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    const dimePayEnvironment = resolveDimePayEnvironment(environment, req);
    const remoteCreate = await createDimePayRecurringSubscription({
      environment: dimePayEnvironment,
      companyId: company_id,
      planName: plan_name,
      planType: plan_type || plan_name.toLowerCase(),
      amount: Number(amount),
      currency: currency || 'JMD',
      customerId: subscription?.dime_customer_id || subscription?.dimepay_customer_id,
      cardToken: paymentMethod.dime_card_token,
      billingFrequency: billing_frequency || 'monthly',
      metadata: { source: 'upgrade_existing_card', payment_method_id }
    });

    if (!remoteCreate.ok) {
      return res.status(502).json({ error: remoteCreate.error || 'DimePay declined to charge this card for the upgrade.' });
    }

    const remoteData = remoteCreate.data?.data || remoteCreate.data || {};
    const remoteSubscriptionId = remoteData.subscription_id || remoteData.dime_subscription_id || remoteData.id;
    const accessUntil = remoteData.access_until || remoteData.next_billing_date || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
    const now = new Date().toISOString();

    const subscriptionPayload = compact({
      company_id,
      plan_name,
      plan_type: plan_type || plan_name.toLowerCase(),
      status: 'active',
      billing_frequency: billing_frequency || 'monthly',
      amount: Number(amount),
      currency: currency || 'JMD',
      dime_subscription_id: remoteSubscriptionId,
      dimepay_subscription_id: remoteSubscriptionId,
      dime_card_token: paymentMethod.dime_card_token,
      card_last_four: paymentMethod.card_last4,
      card_brand: paymentMethod.card_brand,
      payment_method_last4: paymentMethod.card_last4,
      payment_method_brand: paymentMethod.card_brand,
      next_billing_date: accessUntil,
      access_until: accessUntil,
      auto_renew: true,
      updated_at: now
    });

    if (subscription?.id) {
      await supabaseAdmin.from('subscriptions').update(subscriptionPayload).eq('id', subscription.id);
    } else {
      await supabaseAdmin.from('subscriptions').insert({ ...subscriptionPayload, start_date: now, created_at: now });
    }

    await supabaseAdmin.from('payment_history').insert({
      company_id,
      subscription_id: subscription?.id,
      amount: Number(amount),
      currency: currency || 'JMD',
      status: 'completed',
      payment_method: 'card',
      transaction_id: remoteData.transaction_id || `upgrade-${Date.now()}`,
      invoice_number: `INV-${Date.now()}`,
      description: `${plan_name} - Upgrade Payment`,
      payment_date: now,
      metadata: { subscription_id: remoteSubscriptionId, payment_method_id }
    });

    await upsertCardOnFile({
      companyId: company_id,
      dimeCardToken: paymentMethod.dime_card_token,
      cardLast4: paymentMethod.card_last4,
      cardBrand: paymentMethod.card_brand,
      forcePrimary: true
    });

    await supabaseAdmin
      .from('companies')
      .update({ status: 'ACTIVE', plan: plan_name })
      .eq('id', company_id);

    const ledgerReferenceId = buildCardReferenceId({
      companyId: company_id,
      flow: 'subscription_update',
      localSubscriptionId: subscription?.id,
      dimepaySubscriptionId: remoteSubscriptionId
    });

    await appendDimePayLedgerEvent(
      { type: 'invoice.payment_succeeded', data: { reference_id: ledgerReferenceId, company_id, amount, currency: currency || 'JMD' } },
      { source: 'upgrade-subscription', payment_method_id, plan_name }
    );

    return res.status(200).json({ success: true, subscriptionId: remoteSubscriptionId });
  } catch (error: any) {
    console.error('❌ Error upgrading subscription with existing card:', error);
    return res.status(500).json({ error: error.message || 'Failed to upgrade subscription' });
  }
};

/**
 * Records an upgrade-via-bank-transfer request: creates a pending billing intent that
 * SuperAdmin's `approve-payment` action (supabase/functions/admin-handler) picks up to
 * finalize the plan/amount once the transfer is manually verified. Mirrors the same
 * PENDING_APPROVAL pattern already used for bank-transfer signups.
 */
const upgradeWithBankTransfer = async (req: VercelRequest, res: VercelResponse) => {
  try {
    const { company_id, plan_name, plan_type, amount, currency } = req.body || {};
    if (!company_id || !plan_name || amount === undefined) {
      return res.status(400).json({ error: 'company_id, plan_name and amount are required' });
    }
    await requireBillingAccess(req, company_id);

    // A card must already be on file - bank transfer pays this cycle, but the account
    // still needs a card for renewals per the "card always required" rule.
    const { count: cardCount } = await supabaseAdmin
      .from('payment_methods')
      .select('id', { count: 'exact', head: true })
      .eq('company_id', company_id);

    if (!cardCount) {
      return res.status(400).json({ error: 'A card is required on file before paying by bank transfer. Add a card first.' });
    }

    const { data: subscription } = await supabaseAdmin
      .from('subscriptions')
      .select('id')
      .eq('company_id', company_id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    const idempotencyKey = `upgrade-bank-transfer-${company_id}-${Date.now()}`;

    const { error: intentError } = await supabaseAdmin
      .from('dimepay_billing_intents')
      .insert({
        flow: 'subscription_update',
        company_id,
        local_subscription_id: subscription?.id || null,
        plan_name,
        plan_type: plan_type || plan_name.toLowerCase(),
        amount,
        currency: currency || 'JMD',
        status: 'pending',
        idempotency_key: idempotencyKey
      });

    if (intentError) {
      console.error('❌ Error creating bank-transfer upgrade intent:', intentError);
      return res.status(500).json({ error: 'Failed to record upgrade request' });
    }

    await supabaseAdmin.from('payment_history').insert({
      company_id,
      subscription_id: subscription?.id || null,
      amount,
      currency: currency || 'JMD',
      status: 'pending',
      payment_method: 'bank_transfer',
      description: `${plan_name} - Upgrade (Bank Transfer)`,
      payment_date: new Date().toISOString(),
      metadata: { idempotency_key: idempotencyKey }
    });

    await supabaseAdmin
      .from('companies')
      .update({ status: 'PENDING_APPROVAL' })
      .eq('id', company_id);

    return res.status(200).json({ success: true, message: 'Upgrade request submitted. Your account will be updated once the transfer is verified.' });
  } catch (error: any) {
    console.error('❌ Error initiating bank-transfer upgrade:', error);
    return res.status(500).json({ error: error.message || 'Failed to initiate bank-transfer upgrade' });
  }
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const paymentMethod = req.body?.payment_method;
  if (paymentMethod === 'bank_transfer') return upgradeWithBankTransfer(req, res);
  return upgradeWithExistingCard(req, res);
}
