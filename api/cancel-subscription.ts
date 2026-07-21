import type { VercelRequest, VercelResponse } from '@vercel/node';
import { supabaseAdmin } from './_supabaseAdmin.js';
import { cancelDimePaySubscription, resolveDimePayEnvironment } from './_dimepay.js';

/**
 * Cancel DimePay Subscription API Endpoint
 * 
 * Cancels a subscription in DimePay and updates local database.
 * 
 * POST /api/cancel-subscription
 * Body: { subscription_id: string, company_id: string }
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Only accept POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { subscription_id, company_id, request_refund } = req.body;

    if (!company_id) {
      return res.status(400).json({ error: 'Missing company_id' });
    }

    const { data: subscriptionRecord, error: subscriptionError } = await supabaseAdmin
      .from('subscriptions')
      .select('id, dime_subscription_id, dimepay_subscription_id, next_billing_date, metadata')
      .eq('company_id', company_id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (subscriptionError || !subscriptionRecord) {
      return res.status(404).json({ error: 'No subscription was found for this company' });
    }

    const resolvedSubscriptionId = subscription_id && subscription_id !== 'legacy'
      ? subscription_id
      : (subscriptionRecord.dime_subscription_id || subscriptionRecord.dimepay_subscription_id);

    if (!resolvedSubscriptionId) {
      return res.status(409).json({ error: 'This subscription has no DimePay reference yet. Add a payment method or contact support.' });
    }

    console.log(`🔄 Cancelling DimePay subscription: ${subscription_id} (refund requested: ${!!request_refund})`);

    const environment = resolveDimePayEnvironment(undefined, req);
    const remoteCancellation = await cancelDimePaySubscription({
      environment,
      subscriptionId: resolvedSubscriptionId
    });

    if (!remoteCancellation.ok) {
      console.warn('⚠️ Remote DimePay cancellation did not confirm:', remoteCancellation.error);
    }

    if (!remoteCancellation.ok) {
      return res.status(502).json({ error: remoteCancellation.error || 'DimePay did not confirm cancellation. Your subscription was not changed.' });
    }

    const { data: currentSubscription } = await supabaseAdmin
      .from('subscriptions')
      .select('next_billing_date, metadata')
      .or(`dime_subscription_id.eq.${resolvedSubscriptionId},dimepay_subscription_id.eq.${resolvedSubscriptionId}`)
      .eq('company_id', company_id)
      .maybeSingle();

    const isRefundRequested = !!request_refund;

    const { error: updateError } = await supabaseAdmin
      .from('subscriptions')
      .update({
        status: 'cancelled',
        end_date: isRefundRequested ? new Date().toISOString() : (currentSubscription?.next_billing_date || null),
        auto_renew: false,
        updated_at: new Date().toISOString(),
        metadata: {
          ...(currentSubscription?.metadata || {}),
          cancelled_at: new Date().toISOString(),
          cancelled_by: 'user',
          cancel_at_period_end: !isRefundRequested,
          refund_requested: isRefundRequested,
          refund_status: isRefundRequested ? 'pending' : undefined
        }
      })
      .eq('id', currentSubscription?.id || subscriptionRecord.id);

    if (updateError) {
      console.error('❌ Error updating subscription in database:', updateError);
      return res.status(500).json({ error: 'Failed to update subscription status' });
    }

    // Downgrade company plan to Free immediately if refund is requested
    if (isRefundRequested) {
      console.log(`📉 Immediately downgrading company ${company_id} to Free plan due to refund request`);
      const { error: companyUpdateError } = await supabaseAdmin
        .from('companies')
        .update({
          plan: 'Free',
          status: 'ACTIVE'
        })
        .eq('id', company_id);

      if (companyUpdateError) {
        console.error('❌ Error downgrading company plan to free:', companyUpdateError);
      }
    }

    console.log('✅ Subscription marked for cancellation in database');

    return res.status(200).json({
      success: true,
      remoteCancellation,
      message: 'Subscription cancelled successfully. You will retain access until the end of your current billing period.'
    });

  } catch (error: any) {
    console.error('❌ Error cancelling subscription:', error);
    return res.status(500).json({
      error: 'Failed to cancel subscription',
      message: error.message
    });
  }
}
