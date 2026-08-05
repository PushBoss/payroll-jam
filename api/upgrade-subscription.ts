import type { VercelRequest, VercelResponse } from '@vercel/node';
import { supabaseAdmin } from './_supabaseAdmin.js';
import { buildAbsoluteUrl, resolveDimePayEnvironment, createDimePayRecurringSubscription } from './_dimepay.js';
import { requireBillingAccess } from './_billingAuth.js';
import { withCrashLogging } from './_crashLogger.js';

const canonicalBillingPlanName = (value?: string | null) => {
  switch (String(value || '').trim().toLowerCase()) {
    case 'reseller':
    case 'enterprise': return 'Enterprise';
    case 'professional':
    case 'pro': return 'Pro';
    case 'starter': return 'Starter';
    case 'free': return 'Free';
    default: return String(value || '').trim();
  }
};

const sameBillingPlan = (left?: string | null, right?: string | null) =>
  canonicalBillingPlanName(left).toLowerCase() === canonicalBillingPlanName(right).toLowerCase();

const billingPlanRank = (value?: string | null) => ({
  free: 0,
  starter: 1,
  pro: 2,
  enterprise: 3,
} as Record<string, number>)[canonicalBillingPlanName(value).toLowerCase()];

const canUpgradeBillingPlan = (candidate?: string | null, current?: string | null) => {
  const candidateRank = billingPlanRank(candidate);
  const currentRank = billingPlanRank(current);
  return candidateRank === undefined || currentRank === undefined || candidateRank > currentRank;
};

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

    const { data: company, error: companyError } = await supabaseAdmin
      .from('companies')
      .select('plan')
      .eq('id', company_id)
      .maybeSingle();
    if (companyError || !company) {
      return res.status(404).json({ error: 'Company not found' });
    }
    if (sameBillingPlan(company.plan, plan_name)) {
      return res.status(409).json({ error: `You are already on the ${company.plan} plan.` });
    }
    if (!canUpgradeBillingPlan(plan_name, company.plan)) {
      return res.status(409).json({ error: `Your ${company.plan} plan already includes this tier.` });
    }

    const canonicalPlanName = canonicalBillingPlanName(plan_name);

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

    // Create the local intent before contacting DimePay. Its id is passed in
    // gateway metadata so the signed webhook can reconcile the exact request,
    // even if DimePay sends that webhook immediately after accepting it.
    const now = new Date().toISOString();
    const idempotencyKey = `upgrade-card-${company_id}-${payment_method_id}-${Date.now()}`;
    const { data: intent, error: intentError } = await supabaseAdmin
      .from('dimepay_billing_intents')
      .insert({
        flow: 'subscription_update',
        company_id,
        local_subscription_id: subscription?.id || null,
        dime_card_token: paymentMethod.dime_card_token,
        plan_name: canonicalPlanName,
        plan_type: plan_type || canonicalPlanName.toLowerCase(),
        amount: Number(amount),
        currency: currency || 'JMD',
        status: 'pending',
        idempotency_key: idempotencyKey,
        metadata: { source: 'upgrade_existing_card', payment_method_id, requested_at: now }
      })
      .select('id')
      .single();
    if (intentError || !intent) {
      return res.status(500).json({ error: 'Failed to prepare the upgrade payment request.' });
    }

    const dimePayEnvironment = resolveDimePayEnvironment(environment, req);
    const remoteCreate = await createDimePayRecurringSubscription({
      environment: dimePayEnvironment,
      companyId: company_id,
      planName: canonicalPlanName,
      planType: plan_type || canonicalPlanName.toLowerCase(),
      amount: Number(amount),
      currency: currency || 'JMD',
      customerId: subscription?.dime_customer_id || subscription?.dimepay_customer_id,
      cardToken: paymentMethod.dime_card_token,
      billingFrequency: billing_frequency || 'monthly',
      webhookUrl: buildAbsoluteUrl(req, '/api/dimepay-webhook'),
      metadata: { source: 'upgrade_existing_card', payment_method_id, billing_intent_id: intent.id }
    });

    if (!remoteCreate.ok) {
      await supabaseAdmin
        .from('dimepay_billing_intents')
        .update({ status: 'failed', updated_at: new Date().toISOString() })
        .eq('id', intent.id);
      return res.status(502).json({ error: remoteCreate.error || 'DimePay declined to charge this card for the upgrade.' });
    }

    const remoteData = remoteCreate.data?.data || remoteCreate.data || {};
    const remoteSubscriptionId = remoteData.subscription_id || remoteData.dime_subscription_id || remoteData.id;
    await supabaseAdmin
      .from('dimepay_billing_intents')
      .update({
        dime_subscription_id: remoteSubscriptionId || null,
        dime_customer_id: remoteData.customer_id || remoteData.dime_customer_id || null,
        updated_at: new Date().toISOString(),
        metadata: {
          source: 'upgrade_existing_card',
          payment_method_id,
          requested_at: now,
          remote_subscription_id: remoteSubscriptionId || null
        }
      })
      .eq('id', intent.id);

    // A successful API response only says DimePay accepted the request. Do not
    // write a subscription, payment history, primary-card change or company
    // plan here. Those are projected exclusively by the signed DimePay webhook.
    return res.status(202).json({
      success: true,
      confirmationPending: true,
      subscriptionId: remoteSubscriptionId,
      message: 'Payment request submitted. Your plan will update after DimePay confirms the charge.'
    });
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

    const { data: company, error: companyError } = await supabaseAdmin
      .from('companies')
      .select('plan')
      .eq('id', company_id)
      .maybeSingle();
    if (companyError || !company) {
      return res.status(404).json({ error: 'Company not found' });
    }
    if (sameBillingPlan(company.plan, plan_name) || !canUpgradeBillingPlan(plan_name, company.plan)) {
      return res.status(409).json({ error: `Your ${company.plan} plan already includes this tier.` });
    }
    const canonicalPlanName = canonicalBillingPlanName(plan_name);

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
        plan_name: canonicalPlanName,
        plan_type: plan_type || canonicalPlanName.toLowerCase(),
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
      description: `${canonicalPlanName} - Upgrade (Bank Transfer)`,
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

async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const paymentMethod = req.body?.payment_method;
  if (paymentMethod === 'bank_transfer') return upgradeWithBankTransfer(req, res);
  return upgradeWithExistingCard(req, res);
}

export default withCrashLogging(handler, { endpoint: '/api/upgrade-subscription', critical: true });
