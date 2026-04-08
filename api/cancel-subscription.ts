import type { VercelRequest, VercelResponse } from '@vercel/node';
import { supabaseAdmin } from './_supabaseAdmin';
import { cancelDimePaySubscription, resolveDimePayEnvironment } from './_dimepay';

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
    const { subscription_id, company_id } = req.body;

    if (!subscription_id || !company_id) {
      return res.status(400).json({ error: 'Missing subscription_id or company_id' });
    }

    console.log('🔄 Cancelling DimePay subscription:', subscription_id);

    const environment = resolveDimePayEnvironment(undefined, req);
    const remoteCancellation = await cancelDimePaySubscription({
      environment,
      subscriptionId: subscription_id
    });

    if (!remoteCancellation.ok) {
      console.warn('⚠️ Remote DimePay cancellation did not confirm:', remoteCancellation.error);
    }

    const { data: currentSubscription } = await supabaseAdmin
      .from('subscriptions')
      .select('next_billing_date, metadata')
      .eq('dimepay_subscription_id', subscription_id)
      .eq('company_id', company_id)
      .maybeSingle();

    const { error: updateError } = await supabaseAdmin
      .from('subscriptions')
      .update({
        status: 'cancelled',
        end_date: currentSubscription?.next_billing_date || null,
        auto_renew: false,
        updated_at: new Date().toISOString(),
        metadata: {
          ...(currentSubscription?.metadata || {}),
          cancelled_at: new Date().toISOString(),
          cancelled_by: 'user',
          cancel_at_period_end: true
        }
      })
      .eq('dimepay_subscription_id', subscription_id)
      .eq('company_id', company_id);

    if (updateError) {
      console.error('❌ Error updating subscription in database:', updateError);
      return res.status(500).json({ error: 'Failed to update subscription status' });
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
