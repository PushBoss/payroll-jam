import type { VercelRequest, VercelResponse } from '@vercel/node';
import { supabaseAdmin } from './_supabaseAdmin';
import {
  resolveDimePayEnvironment,
  updateDimePaySubscriptionCard
} from './_dimepay';

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

    if (!resolvedSubscriptionId || !localSubscriptionId) {
      const { data: subscription } = await supabaseAdmin
        .from('subscriptions')
        .select('id, dimepay_subscription_id')
        .eq('company_id', company_id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      resolvedSubscriptionId = resolvedSubscriptionId || subscription?.dimepay_subscription_id;
      localSubscriptionId = localSubscriptionId || subscription?.id;
    }

    if (!resolvedSubscriptionId) {
      return res.status(400).json({ error: 'No DimePay subscription found for this company' });
    }

    const dimePayEnvironment = resolveDimePayEnvironment(environment, req);
    const remoteUpdate = await updateDimePaySubscriptionCard({
      environment: dimePayEnvironment,
      subscriptionId: resolvedSubscriptionId,
      cardToken: card_token,
      cardRequestToken: card_request_token
    });

    const selectorField = localSubscriptionId ? 'id' : 'dimepay_subscription_id';
    const selectorValue = localSubscriptionId || resolvedSubscriptionId;

    const { data: existingSubscription } = await supabaseAdmin
      .from('subscriptions')
      .select('id, metadata')
      .eq('company_id', company_id)
      .eq(selectorField, selectorValue)
      .maybeSingle();

    const metadata = {
      ...(existingSubscription?.metadata || {}),
      dime_card_token: card_token,
      card_request_token,
      card_last4,
      card_brand,
      card_expiry,
      card_updated_at: new Date().toISOString(),
      card_update_status: remoteUpdate.ok ? 'updated' : 'pending_remote_confirmation'
    };

    const { error: subscriptionError } = await supabaseAdmin
      .from('subscriptions')
      .update({
        payment_method_last4: card_last4 || null,
        payment_method_brand: card_brand || null,
        metadata,
        ...(remoteUpdate.ok ? { status: 'active' } : {}),
        updated_at: new Date().toISOString()
      })
      .eq('company_id', company_id)
      .eq(selectorField, selectorValue);

    if (subscriptionError) {
      console.error('❌ Error updating local subscription card metadata:', subscriptionError);
      return res.status(500).json({ error: 'Failed to update local subscription metadata' });
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

    if (remoteUpdate.ok) {
      companyUpdate.status = 'ACTIVE';
    }

    await supabaseAdmin
      .from('companies')
      .update(companyUpdate)
      .eq('id', company_id);

    return res.status(remoteUpdate.ok ? 200 : 202).json({
      success: remoteUpdate.ok,
      remoteUpdate,
      message: remoteUpdate.ok
        ? 'Subscription payment method updated successfully'
        : 'Card saved locally, but DimePay subscription update is still pending confirmation.'
    });
  } catch (error: any) {
    console.error('❌ Error updating subscription payment method:', error);
    return res.status(500).json({ error: error.message || 'Failed to update subscription payment method' });
  }
}
