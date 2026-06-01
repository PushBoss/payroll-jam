import type { VercelRequest, VercelResponse } from '@vercel/node';
import { randomUUID } from 'crypto';
import { supabaseAdmin } from './_supabaseAdmin.js';
import {
  buildAbsoluteUrl,
  buildCardReferenceId,
  getDimePayCredentials,
  normalizeDimePayExternalUrl,
  postSignedDimePayRequest,
  resolveDimePayEnvironment
} from './_dimepay.js';

type BillingFlow = 'signup' | 'card_update' | 'subscription_update';

const normalizeFlow = (flow?: string, subscriptionId?: string): BillingFlow => {
  if (flow === 'signup' || flow === 'card_update' || flow === 'subscription_update') return flow;
  return subscriptionId ? 'subscription_update' : 'card_update';
};

const normalizeCardRequestResponse = (data: any) => {
  const parsedBody = typeof data?.body === 'string'
    ? safeJsonParse(data.body)
    : data?.body;
  const source = data?.data?.response || data?.data || parsedBody?.response || data?.response || data || {};
  return {
    ...data,
    token: source.token || source.card_request_token || data?.token,
    card_request_token: source.card_request_token || source.token || data?.card_request_token,
    card_url: source.card_url || source.url || source.redirect_url || data?.card_url
  };
};

const safeJsonParse = (value: string) => {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
};

export default async function cardRequestHandler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const {
      user_id,
      userId,
      company_id,
      companyId,
      local_subscription_id,
      localSubscriptionId,
      subscription_id,
      subscriptionId,
      redirect_url,
      redirectUrl,
      environment,
      flow,
      plan_name,
      planName,
      plan_type,
      planType,
      amount,
      currency,
      metadata
    } = req.body || {};

    const resolvedUserId = user_id || userId || null;
    let resolvedCompanyId = company_id || companyId || null;
    const resolvedLocalSubscriptionId = local_subscription_id || localSubscriptionId || null;
    const resolvedSubscriptionId = subscription_id || subscriptionId || null;
    const resolvedPlanName = plan_name || planName || metadata?.plan_name || metadata?.planName || null;
    const resolvedPlanType = plan_type || planType || metadata?.plan_type || metadata?.planType || null;
    const resolvedCurrency = String(currency || metadata?.currency || 'JMD').trim().toUpperCase();
    const numericAmount = typeof amount === 'number' ? amount : Number(amount);

    if (!resolvedCompanyId && resolvedUserId) {
      const { data: user, error: userLookupError } = await supabaseAdmin
        .from('app_users')
        .select('company_id')
        .or(`id.eq.${resolvedUserId},auth_user_id.eq.${resolvedUserId}`)
        .maybeSingle();

      if (userLookupError) {
        console.error('Error resolving DimePay card request user company:', userLookupError);
      }

      resolvedCompanyId = user?.company_id || null;
    }

    if (!resolvedCompanyId) {
      return res.status(400).json({ error: 'company_id is required' });
    }

    const billingFlow = normalizeFlow(flow, resolvedSubscriptionId);
    const intentId = randomUUID();
    const idempotencyKey = `${billingFlow}:${resolvedCompanyId}:${resolvedLocalSubscriptionId || 'none'}:${intentId}`;
    const dimePayEnvironment = resolveDimePayEnvironment(environment, req);
    const credentials = getDimePayCredentials(dimePayEnvironment);
    const webhookUrl = buildAbsoluteUrl(req, '/api/webhooks/dimepay');
    const resolvedRedirectUrl = normalizeDimePayExternalUrl(req, redirect_url || redirectUrl, '/dashboard/billing');
    const referenceId = buildCardReferenceId({
      flow: billingFlow,
      companyId: resolvedCompanyId,
      localSubscriptionId: resolvedLocalSubscriptionId,
      dimepaySubscriptionId: resolvedSubscriptionId,
      intentId
    });

    const intentPayload = {
      id: intentId,
      flow: billingFlow,
      user_id: resolvedUserId,
      company_id: resolvedCompanyId,
      local_subscription_id: resolvedLocalSubscriptionId,
      dime_subscription_id: resolvedSubscriptionId,
      plan_name: resolvedPlanName,
      plan_type: resolvedPlanType,
      amount: Number.isFinite(numericAmount) ? numericAmount : null,
      currency: resolvedCurrency,
      status: 'pending',
      idempotency_key: idempotencyKey,
      metadata: metadata || {}
    };

    const { error: intentError } = await supabaseAdmin
      .from('dimepay_billing_intents')
      .insert(intentPayload);

    if (intentError) {
      console.error('Error creating DimePay billing intent:', intentError);
      return res.status(500).json({ error: 'Failed to create billing intent' });
    }

    const response = await postSignedDimePayRequest(
      '/card-request',
      {
        id: referenceId,
        webhookUrl,
        webhook_url: webhookUrl,
        redirectUrl: resolvedRedirectUrl,
        redirect_url: resolvedRedirectUrl,
        currency: resolvedCurrency,
        metadata: {
          ...(metadata || {}),
          flow: billingFlow,
          intent_id: intentId,
          company_id: resolvedCompanyId,
          local_subscription_id: resolvedLocalSubscriptionId,
          dime_subscription_id: resolvedSubscriptionId,
          plan_name: resolvedPlanName,
          plan_type: resolvedPlanType,
          currency: resolvedCurrency
        }
      },
      dimePayEnvironment
    );

    const data = await response.json().catch(() => null);
    const normalized = normalizeCardRequestResponse(data);

    if (!response.ok) {
      await supabaseAdmin
        .from('dimepay_billing_intents')
        .update({
          status: 'failed',
          metadata: {
            ...(intentPayload.metadata || {}),
            dimepay_error: data
          },
          updated_at: new Date().toISOString()
        })
        .eq('id', intentId);

      return res.status(response.status).json({
        error: 'Failed to create card request',
        details: data
      });
    }

    await supabaseAdmin
      .from('dimepay_billing_intents')
      .update({
        card_request_token: normalized.card_request_token || normalized.token || null,
        metadata: {
          ...(intentPayload.metadata || {}),
          dimepay_response: {
            token: normalized.card_request_token || normalized.token || null,
            has_card_url: Boolean(normalized.card_url)
          }
        },
        updated_at: new Date().toISOString()
      })
      .eq('id', intentId);

    return res.status(200).json({
      ...normalized,
      billing_intent_id: intentId,
      flow: billingFlow,
      environment: dimePayEnvironment,
      client_key: credentials.clientKey,
      client_id: credentials.clientKey,
      webhook_url: webhookUrl,
      redirect_url: resolvedRedirectUrl
    });
  } catch (error: any) {
    console.error('Error creating DimePay card request:', error);
    return res.status(500).json({ error: error.message || 'Failed to create card request' });
  }
}
