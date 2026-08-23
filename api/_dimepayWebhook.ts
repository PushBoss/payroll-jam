import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createHmac, timingSafeEqual } from 'crypto';
import { supabaseAdmin as supabase } from './_supabaseAdmin.js';
import {
  createDimePayRecurringSubscription,
  buildAbsoluteUrl,
  parseCardReferenceId,
  resolveDimePayEnvironment,
  updateDimePaySubscriptionCard
} from './_dimepay.js';
import {
  extractDimePayJwt,
  normalizeDimePayWebhookPayload,
  verifyDimePayJwt
} from './_dimepayJwt.js';
import { appendDimePayLedgerEvent } from './_dimepayLedger.js';
import { upsertCardOnFile } from './_paymentMethods.js';
import { redact } from './_redact.js';

const monthFromNow = () => new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

const compact = <T extends Record<string, any>>(value: T) => Object.fromEntries(
  Object.entries(value).filter(([, entry]) => entry !== undefined)
) as Partial<T>;

// Enterprise is the canonical subscription tier for reseller accounts.
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

const getWebhookSecrets = () => [
  process.env.DIMEPAY_SECRET_KEY,
  process.env.DIMEPAY_SECRET_KEY_PROD,
  process.env.DIMEPAY_SECRET_KEY_SANDBOX,
  process.env.DIMEPAY_WEBHOOK_SECRET,
  process.env.DIMEPAY_WEBHOOK_SECRET_PROD,
  process.env.DIMEPAY_WEBHOOK_SECRET_SANDBOX
].filter(Boolean) as string[];

const safeEqualHex = (left: string, right: string) => {
  const leftBuffer = Buffer.from(left, /^[0-9a-f]{64}$/i.test(left) ? 'hex' : 'utf8');
  const rightBuffer = Buffer.from(right, /^[0-9a-f]{64}$/i.test(right) ? 'hex' : 'utf8');
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
};

const verifyLegacyHmac = (payload: any, signature?: string) => {
  if (!signature) return false;
  const normalized = signature.trim().replace(/^sha256=/i, '');

  return getWebhookSecrets().some((secret) => {
    const expectedHex = createHmac('sha256', secret)
      .update(JSON.stringify(payload))
      .digest('hex');
    const expectedBase64 = Buffer.from(expectedHex, 'hex').toString('base64');

    return safeEqualHex(normalized, expectedHex) || normalized === expectedBase64;
  });
};

const verifyAndExtractEvent = (req: VercelRequest) => {
  const jwt = extractDimePayJwt(req.body, req.headers as Record<string, any>);

  if (jwt) {
    const errors: string[] = [];
    for (const secret of getWebhookSecrets()) {
      try {
        return {
          verified: true,
          verification: 'jwt',
          event: normalizeDimePayWebhookPayload(verifyDimePayJwt(jwt, secret))
        };
      } catch (error: any) {
        errors.push(error.message);
      }
    }

    throw new Error(errors[0] || 'Invalid DimePay JWT');
  }

  const signatureHeader = req.headers['dimepay-signature'] || req.headers['x-dimepay-signature'];
  const signature = Array.isArray(signatureHeader) ? signatureHeader[0] : signatureHeader;
  if (verifyLegacyHmac(req.body, signature as string | undefined)) {
    return {
      verified: true,
      verification: 'hmac',
      event: normalizeDimePayWebhookPayload(req.body)
    };
  }

  throw new Error('Missing or invalid DimePay webhook signature');
};

const logWebhookEvent = async (event: any, verified: boolean, verification: string) => {
  const eventId = event.id || event.event_id || event.data?.id || event.data?.invoice_id || event.data?.transaction_id || event.data?.card_request_token;

  const { data: existing } = eventId
    ? await supabase
      .from('dimepay_webhook_events')
      .select('id')
      .eq('event_id', eventId)
      .maybeSingle()
    : { data: null };

  if (existing?.id) {
    return { duplicate: true, eventId };
  }

  const { error } = await supabase
    .from('dimepay_webhook_events')
    .insert({
      event_id: eventId || null,
      event_type: event.type || 'unknown',
      verified,
      verification,
      payload: redact(event),
      processed_at: new Date().toISOString()
    });

  if (error) {
    console.error('Error writing DimePay webhook audit log:', error);
  }

  return { duplicate: false, eventId };
};

const updateCompanyBillingState = async (
  companyId: string,
  status: 'ACTIVE' | 'PAST_DUE' | 'SUSPENDED',
  paymentMethod?: string
) => {
  const { data: company } = await supabase
    .from('companies')
    .select('settings')
    .eq('id', companyId)
    .maybeSingle();

  await supabase
    .from('companies')
    .update({
      status,
      settings: {
        ...(company?.settings || {}),
        ...(paymentMethod ? { paymentMethod } : {})
      }
    })
    .eq('id', companyId);
};

// The minimum a confirmed charge must meet before we trust a client-supplied plan name enough
// to grant it. Uses the flat/base monthly price as a floor rather than replicating the full
// per-employee pricing engine here - good enough to catch tampered metadata (e.g. claiming
// "Enterprise" against a trivial charge) without duplicating client-side pricing logic.
const getPlanPriceFloor = async (planName: string | undefined): Promise<number | null> => {
  if (!planName) return null;
  const { data } = await supabase
    .from('global_config')
    .select('config')
    .eq('id', 'platform')
    .maybeSingle();

  const plans = (data?.config as any)?.pricingPlans as Array<{ name: string; priceConfig: any }> | undefined;
  const plan = plans?.find((p) => sameBillingPlan(p.name, planName));
  if (!plan) return null;
  if (plan.priceConfig?.type === 'free') return 0;
  return plan.priceConfig?.monthly ?? plan.priceConfig?.baseFee ?? 0;
};

// Legacy subscriptions were backfilled without an amount because their prior
// gateway terms were unknown. A recurring DimePay schedule must never be
// created at zero (or with a browser-supplied amount), so derive a standard
// current price on the server when a valid local amount is unavailable.
const resolveRecurringChargeAmount = async (
  companyId: string,
  planName: string | undefined,
  billingFrequency: string | undefined,
  existingAmount: unknown
) => {
  const configuredAmount = Number(existingAmount);
  if (Number.isFinite(configuredAmount) && configuredAmount > 0) return configuredAmount;
  if (!planName || sameBillingPlan(planName, 'Free')) {
    throw new Error('A paid plan is required before recurring billing can be activated.');
  }

  const [{ data: configRow }, { count: employeeCount }, { count: resellerClientCount }] = await Promise.all([
    supabase.from('global_config').select('config').eq('id', 'platform').maybeSingle(),
    supabase.from('employees').select('id', { count: 'exact', head: true }).eq('company_id', companyId).eq('status', 'ACTIVE'),
    supabase.from('reseller_clients').select('client_company_id', { count: 'exact', head: true }).eq('reseller_id', companyId).eq('status', 'ACTIVE')
  ]);

  const plans = (configRow?.config as any)?.pricingPlans as Array<{ name: string; priceConfig: any }> | undefined;
  const plan = plans?.find((candidate) => sameBillingPlan(candidate.name, planName));
  if (!plan || plan.priceConfig?.type === 'free') {
    throw new Error('No current paid pricing is configured for this subscription plan.');
  }

  const price = plan.priceConfig || {};
  const employeeUnits = Math.max(1, Number(employeeCount) || 0);
  const companyUnits = Math.max(1, (Number(resellerClientCount) || 0) + 1);
  const baseAmount = Number(price.monthly ?? price.baseFee ?? 0);
  const perEmployeeAmount = Number(price.perUserFee ?? 0);
  let monthlyAmount = 0;

  if (price.type === 'per_emp') {
    monthlyAmount = baseAmount * employeeUnits;
  } else if (price.type === 'base') {
    // Enterprise is the reseller billing tier. Its company component is based
    // on managed client companies, while ordinary base plans have one company.
    const companyMultiplier = sameBillingPlan(planName, 'Enterprise') ? companyUnits : 1;
    monthlyAmount = (baseAmount * companyMultiplier) + (perEmployeeAmount * employeeUnits);
  } else {
    monthlyAmount = baseAmount;
  }

  if (!Number.isFinite(monthlyAmount) || monthlyAmount <= 0) {
    throw new Error('A valid recurring price could not be resolved for this subscription.');
  }

  const isAnnual = String(billingFrequency || '').toLowerCase() === 'annual' || String(billingFrequency || '').toLowerCase() === 'yearly';
  return isAnnual ? monthlyAmount * 12 * 0.9 : monthlyAmount;
};

// Grants plan access only once a confirmed DimePay charge (verified amount, signed webhook
// payload) meets the plan's floor price. This is the server-side source of truth for
// companies.plan - it must never be set by the browser off a client-side SDK callback alone.
const grantPlanIfChargeConfirmed = async (
  companyId: string,
  planName: string | undefined,
  chargedAmount: number | undefined,
  context: { endpoint: string; eventType?: string }
) => {
  if (!planName) return;

  const floor = await getPlanPriceFloor(planName);
  if (floor === null) {
    console.warn(`⚠️ Unknown plan "${planName}" in webhook metadata - not granting.`);
    return;
  }

  const amount = Number(chargedAmount) || 0;
  if (amount < floor) {
    console.error(`❌ Charged amount ${amount} is below the floor price ${floor} for plan "${planName}" - refusing to grant.`);
    try {
      const { logCrash } = await import('./_crashLogger.js');
      await logCrash({
        source: 'vercel-api',
        endpoint: context.endpoint,
        severity: 'critical',
        error: new Error(`DimePay webhook (${context.eventType || 'unknown'}) reported plan "${planName}" but charged amount ${amount} is below the ${floor} floor price for company ${companyId} - plan NOT granted.`),
        context: { companyId, planName, amount, floor }
      });
    } catch (logError) {
      console.error('Failed to log crash for plan/amount mismatch:', logError);
    }
    return;
  }

  const { error } = await supabase
    .from('companies')
    .update({ plan: canonicalBillingPlanName(planName) })
    .eq('id', companyId);
  if (error) throw error;
};

const findSubscription = async (data: any) => {
  const dimeSubscriptionId = data.subscription_id || data.dime_subscription_id || data.dimepay_subscription_id;
  if (dimeSubscriptionId) {
    const { data: subscription } = await supabase
      .from('subscriptions')
      .select('*')
      .or(`dime_subscription_id.eq.${dimeSubscriptionId},dimepay_subscription_id.eq.${dimeSubscriptionId}`)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (subscription) return subscription;
  }

  const companyId = data.metadata?.company_id || data.company_id;
  if (!companyId) return null;

  const { data: subscription } = await supabase
    .from('subscriptions')
    .select('*')
    .eq('company_id', companyId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  return subscription || null;
};

const saveSubscription = async (companyId: string, payload: Record<string, any>, existingId?: string) => {
  if (existingId) {
    const { data, error } = await supabase
      .from('subscriptions')
      .update(payload)
      .eq('id', existingId)
      .select('id')
      .single();
    if (error) throw error;
    return data.id as string;
  }

  const { data, error } = await supabase
    .from('subscriptions')
    .insert({ company_id: companyId, ...payload })
    .select('id')
    .single();

  if (error) throw error;
  return data.id as string;
};

const applySubscriptionCreated = async (data: any) => {
  const companyId = data.metadata?.company_id || data.company_id;
  if (!companyId) throw new Error('Missing company_id in DimePay subscription event');

  const billingIntentId = data.metadata?.billing_intent_id;
  const subscriptionId = data.subscription_id || data.dime_subscription_id || data.dimepay_subscription_id;
  const accessUntil = data.access_until || data.next_billing_date || monthFromNow();
  const existing = await findSubscription(data);

  // The embedded payment widget charges + binds this card immediately at DimePay -
  // our local primary designation must match what was actually charged.
  const chargedCardToken = data.card_token || data.token || data.payment_method_token;
  if (chargedCardToken) {
    await upsertCardOnFile({
      companyId,
      dimeCardToken: chargedCardToken,
      cardRequestToken: data.card_request_token,
      cardLast4: data.card_last4 || data.last_four_digits,
      cardBrand: data.card_brand || data.card_scheme,
      forcePrimary: true
    });
  }

  const metadata = {
    ...(existing?.metadata || {}),
    ...(data.metadata || {}),
    order_id: data.order_id,
    dime_card_token: chargedCardToken || existing?.dime_card_token || existing?.metadata?.dime_card_token,
    card_request_token: data.card_request_token,
    card_last4: data.card_last4 || data.last_four_digits,
    card_brand: data.card_brand || data.card_scheme,
    billing_cycles: data.billing_cycles,
    retry_count: 0
  };

  await saveSubscription(companyId, compact({
    dime_subscription_id: subscriptionId,
    dimepay_subscription_id: subscriptionId,
    dime_customer_id: data.customer_id || data.dime_customer_id,
    dimepay_customer_id: data.customer_id || data.dime_customer_id,
    dime_card_token: chargedCardToken || existing?.dime_card_token || existing?.metadata?.dime_card_token,
    plan_name: canonicalBillingPlanName(data.metadata?.plan_name || existing?.plan_name || 'Unknown Plan'),
    plan_type: data.metadata?.plan_type || existing?.plan_type || 'subscription',
    // Creating a schedule is not a payment confirmation. Keep a new schedule
    // pending until DimePay sends invoice.payment_succeeded.
    status: existing?.status || 'pending',
    billing_frequency: (data.recurring_frequency || data.frequency || existing?.billing_frequency || 'monthly').toLowerCase(),
    amount: data.amount || existing?.amount || 0,
    currency: data.currency || existing?.currency || 'JMD',
    next_billing_date: accessUntil,
    access_until: existing?.access_until || null,
    start_date: existing?.start_date || new Date().toISOString(),
    auto_renew: true,
    payment_method_last4: data.card_last4 || data.last_four_digits || existing?.payment_method_last4,
    payment_method_brand: data.card_brand || data.card_scheme || existing?.payment_method_brand,
    card_last_four: data.card_last4 || data.last_four_digits || existing?.card_last_four,
    card_brand: data.card_brand || data.card_scheme || existing?.card_brand,
    metadata,
    updated_at: new Date().toISOString()
  }), existing?.id);

  if (billingIntentId) {
    await supabase
      .from('dimepay_billing_intents')
      .update({
        status: 'pending',
        dime_subscription_id: subscriptionId || null,
        dime_customer_id: data.customer_id || data.dime_customer_id || null,
        dime_card_token: chargedCardToken || null,
        updated_at: new Date().toISOString()
      })
      .eq('id', billingIntentId)
      .eq('company_id', companyId);
  }
};

const applyPaymentSucceeded = async (data: any) => {
  const subscription = await findSubscription(data);
  if (!subscription) return;
  const billingIntentId = data.metadata?.billing_intent_id;

  const transactionId = data.invoice_id || data.transaction_id;
  if (transactionId) {
    const { data: existing } = await supabase
      .from('payment_history')
      .select('id')
      .eq('transaction_id', transactionId)
      .maybeSingle();

    if (!existing) {
      await supabase.from('payment_history').insert({
        company_id: subscription.company_id,
        subscription_id: subscription.id,
        amount: data.amount || subscription.amount || 0,
        currency: data.currency || subscription.currency || 'JMD',
        status: 'completed',
        payment_method: 'card',
        transaction_id: transactionId,
        invoice_number: data.invoice_number || `INV-${Date.now()}`,
        description: `${subscription.plan_name} - Recurring Payment`,
        payment_date: new Date().toISOString(),
        metadata: { cycle_number: data.cycle_number, subscription_id: data.subscription_id }
      });
    }
  }

  const nextBillingDate = data.access_until || data.next_billing_date || monthFromNow();
  const chargedCardToken = data.card_token || data.token || data.payment_method_token || subscription.dime_card_token;
  if (chargedCardToken) {
    await upsertCardOnFile({
      companyId: subscription.company_id,
      dimeCardToken: chargedCardToken,
      cardRequestToken: data.card_request_token || data.request_token,
      cardLast4: data.card_last4 || data.last_four_digits || subscription.card_last_four,
      cardBrand: data.card_brand || data.card_scheme || subscription.card_brand,
      forcePrimary: true
    });
  }
  await supabase.from('subscriptions').update(compact({
    next_billing_date: nextBillingDate,
    access_until: nextBillingDate,
    status: 'active',
    payment_method_last4: data.card_last4 || subscription.payment_method_last4,
    payment_method_brand: data.card_brand || subscription.payment_method_brand,
    card_last_four: data.card_last4 || subscription.card_last_four,
    card_brand: data.card_brand || subscription.card_brand,
    dime_card_token: chargedCardToken,
    metadata: {
      ...(subscription.metadata || {}),
      dime_card_token: chargedCardToken || subscription.metadata?.dime_card_token,
      card_last4: data.card_last4 || subscription.metadata?.card_last4,
      card_brand: data.card_brand || subscription.metadata?.card_brand,
      last_payment_date: new Date().toISOString(),
      retry_count: 0,
      total_payments: Number(subscription.metadata?.total_payments || 0) + 1
    },
    updated_at: new Date().toISOString()
  })).eq('id', subscription.id);

  await updateCompanyBillingState(subscription.company_id, 'ACTIVE', 'card');
  await grantPlanIfChargeConfirmed(subscription.company_id, subscription.plan_name, data.amount || subscription.amount, {
    endpoint: '/api/dimepay-webhook',
    eventType: 'invoice.payment_succeeded'
  });

  if (billingIntentId) {
    await supabase
      .from('dimepay_billing_intents')
      .update({ status: 'succeeded', updated_at: new Date().toISOString() })
      .eq('id', billingIntentId)
      .eq('company_id', subscription.company_id);
  }
};

const applyPaymentFailed = async (data: any) => {
  const subscription = await findSubscription(data);
  if (!subscription) return;

  const retryCount = Number(subscription.metadata?.retry_count || 0) + 1;
  const transactionId = data.invoice_id || data.transaction_id || `failed-${Date.now()}`;

  await supabase.from('payment_history').insert({
    company_id: subscription.company_id,
    subscription_id: subscription.id,
    amount: data.amount || subscription.amount || 0,
    currency: data.currency || subscription.currency || 'JMD',
    status: 'failed',
    payment_method: 'card',
    transaction_id: transactionId,
    description: `${subscription.plan_name} - Payment Failed (Attempt ${retryCount})`,
    payment_date: new Date().toISOString(),
    metadata: {
      error: data.failure_reason || data.error || 'Payment declined',
      retry_number: retryCount,
      subscription_id: data.subscription_id
    }
  });

  await supabase.from('subscriptions').update({
    status: 'past_due',
    metadata: {
      ...(subscription.metadata || {}),
      retry_count: retryCount,
      last_failed_date: new Date().toISOString(),
      ...(retryCount >= 3 ? { suspended_at: new Date().toISOString() } : {})
    },
    updated_at: new Date().toISOString()
  }).eq('id', subscription.id);

  await updateCompanyBillingState(subscription.company_id, retryCount >= 3 ? 'SUSPENDED' : 'PAST_DUE');
};

const applyCardRequestSucceeded = async (data: any, req: VercelRequest) => {
  const cardToken = data.token || data.card_token;
  if (!cardToken) throw new Error('Card request webhook missing reusable card token');

  const parsedReference = parseCardReferenceId(data.reference_id || data.id || data.request_id);
  const intentId = data.metadata?.intent_id || parsedReference?.intentId;
  const { data: intent } = intentId
    ? await supabase.from('dimepay_billing_intents').select('*').eq('id', intentId).maybeSingle()
    : { data: null };

  const companyId = intent?.company_id || data.metadata?.company_id || parsedReference?.companyId || data.company_id;
  if (!companyId) throw new Error('Card request webhook missing company_id');

  const existing = await findSubscription({
    company_id: companyId,
    subscription_id: intent?.dime_subscription_id || parsedReference?.dimepaySubscriptionId
  });

  const flow = intent?.flow || data.metadata?.flow || parsedReference?.flow || 'card_update';
  const cardLastFour = data.last_four_digits || data.card_last4 || data.card_last_four;
  const cardBrand = data.card_scheme || data.card_brand;
  const customerId = data.customer_id || data.dime_customer_id;
  const cardRequestToken = data.card_request_token || data.request_token;

  // Record the card in the vault first. Only a primary card may be used to
  // activate or rebind recurring billing; secondary cards are only stored.
  const upsertResult = await upsertCardOnFile({
    companyId,
    dimeCardToken: cardToken,
    cardRequestToken,
    cardLast4: cardLastFour,
    cardBrand
  });

  if (!upsertResult.ok) {
    if (intentId) {
      await supabase
        .from('dimepay_billing_intents')
        .update({ status: 'failed', updated_at: new Date().toISOString() })
        .eq('id', intentId);
    }
    console.warn('DimePay card_request webhook: payment_methods cap reached for company', companyId);
    return;
  }

  if (!upsertResult.method.is_primary) {
    // Saved as a secondary card - active billing/subscription state is unaffected.
    if (intentId) {
      await supabase
        .from('dimepay_billing_intents')
        .update({
          status: 'succeeded',
          card_request_token: cardRequestToken || intent?.card_request_token,
          dime_card_token: cardToken,
          updated_at: new Date().toISOString()
        })
        .eq('id', intentId);
    }
    return;
  }

  const metadata = {
    ...(existing?.metadata || {}),
    ...(intent?.metadata || {}),
    dime_card_token: cardToken,
    card_request_token: cardRequestToken,
    card_last4: cardLastFour,
    card_brand: cardBrand,
    card_verification_status: data.status,
    card_verified_at: new Date().toISOString()
  };

  let remoteSubscriptionId = existing?.dime_subscription_id || existing?.dimepay_subscription_id || intent?.dime_subscription_id;
  let accessUntil = existing?.access_until || existing?.next_billing_date || monthFromNow();
  let resolvedAmount = Number(intent?.amount || existing?.amount || data.amount || 0);
  const isInitialActivation = flow === 'signup' || flow === 'subscription_activation';

  if (isInitialActivation && !remoteSubscriptionId) {
    const environment = resolveDimePayEnvironment(undefined, req);
    const billingFrequency = intent?.metadata?.billing_frequency || existing?.billing_frequency || 'monthly';
    const recurringAmount = await resolveRecurringChargeAmount(
      companyId,
      intent?.plan_name || data.metadata?.plan_name || existing?.plan_name,
      billingFrequency,
      intent?.amount || existing?.amount || data.amount
    );
    resolvedAmount = recurringAmount;
    const remoteCreate = await createDimePayRecurringSubscription({
      environment,
      companyId,
      planName: intent?.plan_name || data.metadata?.plan_name || existing?.plan_name || 'Subscription',
      planType: intent?.plan_type || data.metadata?.plan_type || existing?.plan_type || 'subscription',
      amount: recurringAmount,
      currency: intent?.currency || existing?.currency || data.currency || 'JMD',
      customerId,
      cardToken,
      billingFrequency,
      webhookUrl: buildAbsoluteUrl(req, '/api/dimepay-webhook'),
      metadata: {
        source: flow === 'signup' ? 'card_request_signup' : 'legacy_subscription_activation',
        billing_intent_id: intentId
      }
    });

    if (remoteCreate.ok) {
      const remoteData = remoteCreate.data?.data || remoteCreate.data || {};
      remoteSubscriptionId = remoteData.subscription_id || remoteData.dime_subscription_id || remoteData.id || remoteSubscriptionId;
      accessUntil = remoteData.access_until || remoteData.next_billing_date || accessUntil;
      metadata.subscription_create_response = {
        path: remoteCreate.path,
        subscription_id: remoteSubscriptionId
      };
    } else {
      metadata.subscription_create_error = remoteCreate.error;
      throw new Error(remoteCreate.error || 'Failed to create recurring DimePay subscription');
    }
  } else if (flow === 'subscription_update' && remoteSubscriptionId) {
    const environment = resolveDimePayEnvironment(undefined, req);
    const remoteUpdate = await updateDimePaySubscriptionCard({
      environment,
      subscriptionId: remoteSubscriptionId,
      cardToken,
      cardRequestToken: data.card_request_token
    });
    metadata.card_update_status = remoteUpdate.ok ? 'updated' : 'pending_remote_confirmation';
    metadata.card_update_response = remoteUpdate;
  }

  await saveSubscription(companyId, compact({
    plan_name: intent?.plan_name || existing?.plan_name || data.metadata?.plan_name || 'Subscription',
    plan_type: intent?.plan_type || existing?.plan_type || data.metadata?.plan_type || 'subscription',
    // A verified card and a newly-created schedule are both required, but paid
    // access waits for the signed invoice.payment_succeeded webhook.
    status: isInitialActivation
      ? (existing?.status === 'active' && existing?.access_until && new Date(existing.access_until) > new Date() ? 'active' : 'pending')
      : (existing?.status || 'pending'),
    billing_frequency: intent?.metadata?.billing_frequency || existing?.billing_frequency || 'monthly',
    amount: resolvedAmount || undefined,
    currency: intent?.currency || existing?.currency || data.currency || 'JMD',
    dime_customer_id: customerId || existing?.dime_customer_id,
    dimepay_customer_id: customerId || existing?.dimepay_customer_id,
    dime_card_token: cardToken,
    dime_subscription_id: remoteSubscriptionId,
    dimepay_subscription_id: remoteSubscriptionId,
    card_last_four: cardLastFour,
    payment_method_last4: cardLastFour,
    card_brand: cardBrand,
    payment_method_brand: cardBrand,
    next_billing_date: accessUntil,
    access_until: isInitialActivation ? (existing?.access_until || null) : accessUntil,
    auto_renew: true,
    metadata,
    updated_at: new Date().toISOString()
  }), existing?.id);

  if (intentId) {
    await supabase
      .from('dimepay_billing_intents')
      .update({
        status: isInitialActivation ? 'pending' : 'succeeded',
        card_request_token: cardRequestToken || intent?.card_request_token,
        dime_card_token: cardToken,
        dime_customer_id: customerId || null,
        dime_subscription_id: remoteSubscriptionId || null,
        updated_at: new Date().toISOString()
      })
      .eq('id', intentId);
  }

  // A legacy account whose locally granted period has ended must not keep paid
  // access merely because its card is now verified. It stays past due until
  // DimePay confirms the first invoice; an existing unexpired manual period is
  // preserved until its normal end date.
  if (flow === 'subscription_activation' && (!existing?.access_until || new Date(existing.access_until) <= new Date())) {
    await updateCompanyBillingState(companyId, 'PAST_DUE', 'card');
  }

  // Do not change plan or access here. The card-request event proves a card
  // was verified, not that its first subscription invoice was paid.
};

export default async function dimePayWebhookHandler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { event, verification } = verifyAndExtractEvent(req);
    const audit = await logWebhookEvent(event, true, verification);

    // A subscription event can arrive before Signup has created its company row.
    // Do not let the audit row turn that transient failure into permanent data loss:
    // all projections below are idempotent (payment history is keyed by transaction
    // id and subscriptions are upserted), so a gateway retry is safe.
    if (audit.duplicate) {
      console.warn('Reprocessing duplicate DimePay webhook event to reconcile an earlier incomplete projection.');
    }

    const ledger = await appendDimePayLedgerEvent(event, redact(event));
    if (!ledger.ok) {
      console.warn('DimePay ledger append did not complete cleanly:', ledger.error);
    }

    switch (event.type) {
      case 'subscription.created':
      case 'subscription.updated':
        await applySubscriptionCreated(event.data);
        break;
      case 'invoice.payment_succeeded':
        await applyPaymentSucceeded(event.data);
        break;
      case 'invoice.payment_failed':
        if (ledger.derivedState === 'captured' || ledger.derivedState === 'refunded') {
          console.log('Skipping failed projection because ledger derived state is terminal:', ledger.derivedState);
          break;
        }
        await applyPaymentFailed(event.data);
        break;
      case 'card_request.succeeded':
      case 'card.request_succeeded':
      case 'card_request.success':
        await applyCardRequestSucceeded(event.data, req);
        break;
      case 'subscription.canceled':
      case 'subscription.cancelled':
        // A cancellation at period end must retain access until the already-paid
        // period ends. Gateway callbacks commonly omit that distinction, so use
        // the local cancellation record when it exists rather than shortening
        // access to the webhook delivery time.
        {
          const remoteSubscriptionId = event.data.subscription_id || event.data.dime_subscription_id || event.data.dimepay_subscription_id;
          const { data: cancelledSubscription } = await supabase
            .from('subscriptions')
            .select('id, next_billing_date, access_until, metadata')
            .or(`dime_subscription_id.eq.${remoteSubscriptionId},dimepay_subscription_id.eq.${remoteSubscriptionId}`)
            .maybeSingle();
          const cancelAtPeriodEnd = Boolean(cancelledSubscription?.metadata?.cancel_at_period_end);
          const endDate = cancelAtPeriodEnd
            ? (cancelledSubscription?.access_until || cancelledSubscription?.next_billing_date || new Date().toISOString())
            : new Date().toISOString();
        await supabase.from('subscriptions').update({
          status: 'cancelled',
          end_date: endDate,
          auto_renew: false,
          metadata: { ...(cancelledSubscription?.metadata || {}), cancelled_at: new Date().toISOString(), cancel_at_period_end: cancelAtPeriodEnd },
          updated_at: new Date().toISOString()
        }).or(`dime_subscription_id.eq.${remoteSubscriptionId},dimepay_subscription_id.eq.${remoteSubscriptionId}`);
        }
        break;
      case 'subscription.paused':
        await supabase.from('subscriptions').update({
          status: 'paused',
          metadata: { paused_at: new Date().toISOString() },
          updated_at: new Date().toISOString()
        }).or(`dime_subscription_id.eq.${event.data.subscription_id},dimepay_subscription_id.eq.${event.data.subscription_id}`);
        break;
      default:
        console.log('Unhandled DimePay webhook event:', event.type);
    }

    return res.status(200).json({ received: true });
  } catch (error: any) {
    console.error('DimePay webhook processing error:', error);
    return res.status(error.message?.includes('signature') || error.message?.includes('JWT') ? 401 : 500).json({
      received: false,
      error: error.message || 'DimePay webhook processing failed'
    });
  }
}
