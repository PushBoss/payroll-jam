import type { VercelRequest, VercelResponse } from '@vercel/node';
import { supabaseAdmin } from './_supabaseAdmin.js';
import {
  resolveDimePayEnvironment,
  updateDimePaySubscriptionCard
} from './_dimepay.js';

const compact = <T extends Record<string, any>>(value: T) => Object.fromEntries(
  Object.entries(value).filter(([, entry]) => entry !== undefined)
) as Partial<T>;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const {
      company_id,
      local_subscription_id,
      subscription_id,
      card_token,
      card_request_token,
      card_last4,
      card_brand,
      card_expiry,
      environment
    } = req.body || {};

    if (!company_id || !card_token) {
      return res.status(400).json({ error: 'company_id and card_token are required' });
    }

    let resolvedSubscriptionId = subscription_id as string | undefined;
    let localSubscriptionId = local_subscription_id as string | undefined;

    const { data: latestIntent } = card_request_token
      ? await supabaseAdmin
        .from('dimepay_billing_intents')
        .select('*')
        .eq('company_id', company_id)
        .eq('card_request_token', card_request_token)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      : { data: null };

    let { data: subscription } = await supabaseAdmin
      .from('subscriptions')
      .select('id, dime_subscription_id, dimepay_subscription_id, metadata, plan_name, plan_type, status, billing_frequency, amount, currency, access_until, next_billing_date')
      .eq('company_id', company_id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!resolvedSubscriptionId || !localSubscriptionId) {
      resolvedSubscriptionId = resolvedSubscriptionId || subscription?.dime_subscription_id || subscription?.dimepay_subscription_id;
      localSubscriptionId = localSubscriptionId || subscription?.id;
    }

    let remoteUpdate: any = {
      ok: false,
      skipped: true,
      reason: 'No existing DimePay subscription; card saved locally for legacy catch-up.'
    };

    if (resolvedSubscriptionId) {
      const dimePayEnvironment = resolveDimePayEnvironment(environment, req);
      remoteUpdate = await updateDimePaySubscriptionCard({
        environment: dimePayEnvironment,
        subscriptionId: resolvedSubscriptionId,
        cardToken: card_token,
        cardRequestToken: card_request_token
      });
    }

    if (!subscription?.id) {
      const { data: inserted, error: insertError } = await supabaseAdmin
        .from('subscriptions')
        .insert(compact({
          company_id,
          plan_name: latestIntent?.plan_name || 'Subscription',
          plan_type: latestIntent?.plan_type || 'subscription',
          status: 'active',
          billing_frequency: 'monthly',
          amount: latestIntent?.amount ?? 0,
          currency: latestIntent?.currency || 'JMD',
          start_date: new Date().toISOString(),
          access_until: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
          next_billing_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
          auto_renew: true,
          metadata: {}
        }))
        .select('id, dime_subscription_id, dimepay_subscription_id, metadata, plan_name, plan_type, status, billing_frequency, amount, currency, access_until, next_billing_date')
        .single();

      if (insertError) {
        console.error('❌ Error creating legacy subscription for card metadata:', insertError);
        return res.status(500).json({ error: 'Failed to create local subscription metadata' });
      }

      subscription = inserted;
      localSubscriptionId = inserted.id;
    }

    const metadata = {
      ...(subscription?.metadata || {}),
      ...(latestIntent?.metadata || {}),
      dime_card_token: card_token,
      card_request_token,
      card_last4,
      card_brand,
      card_expiry,
      card_updated_at: new Date().toISOString(),
      card_update_status: remoteUpdate.ok ? 'updated' : 'stored_locally'
    };

    const { error: subscriptionError } = await supabaseAdmin
      .from('subscriptions')
      .update(compact({
        payment_method_last4: card_last4 || null,
        payment_method_brand: card_brand || null,
        card_last_four: card_last4 || null,
        card_brand: card_brand || null,
        dime_card_token: card_token,
        dime_subscription_id: resolvedSubscriptionId || null,
        dimepay_subscription_id: resolvedSubscriptionId || null,
        metadata,
        status: remoteUpdate.ok || !resolvedSubscriptionId ? 'active' : subscription?.status,
        updated_at: new Date().toISOString()
      }))
      .eq('company_id', company_id)
      .eq('id', localSubscriptionId);

    if (subscriptionError) {
      console.error('❌ Error updating local subscription card metadata:', subscriptionError);
      return res.status(500).json({ error: 'Failed to update local subscription metadata' });
    }

    if (card_request_token) {
      await supabaseAdmin
        .from('dimepay_billing_intents')
        .update({
          status: 'succeeded',
          dime_card_token: card_token,
          updated_at: new Date().toISOString()
        })
        .eq('company_id', company_id)
        .eq('card_request_token', card_request_token);
    }

    const { data: company } = await supabaseAdmin
      .from('companies')
      .select('settings')
      .eq('id', company_id)
      .maybeSingle();

    const companyUpdate: Record<string, any> = {
      settings: {
        ...(company?.settings || {}),
        paymentMethod: 'card'
      }
    };

    if (remoteUpdate.ok || !resolvedSubscriptionId) {
      companyUpdate.status = 'ACTIVE';
    }

    await supabaseAdmin
      .from('companies')
      .update(companyUpdate)
      .eq('id', company_id);

    return res.status(remoteUpdate.ok || remoteUpdate.skipped ? 200 : 202).json({
      success: remoteUpdate.ok || remoteUpdate.skipped,
      remoteUpdate,
      message: remoteUpdate.ok
        ? 'Subscription payment method updated successfully'
        : 'Card saved locally for legacy billing catch-up.'
    });
  } catch (error: any) {
    console.error('❌ Error updating subscription payment method:', error);
    return res.status(500).json({ error: error.message || 'Failed to update subscription payment method' });
  }
}
