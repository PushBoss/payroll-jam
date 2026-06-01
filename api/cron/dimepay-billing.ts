import type { VercelRequest, VercelResponse } from '@vercel/node';
import { supabaseAdmin as supabase } from '../_supabaseAdmin.js';
import { createDimePayRecurringSubscription, resolveDimePayEnvironment } from '../_dimepay.js';

const monthFromNow = () => new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST' && req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const authHeader = req.headers.authorization;
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const now = new Date().toISOString();
    const environment = resolveDimePayEnvironment(
      typeof req.query.environment === 'string' ? req.query.environment : undefined,
      req
    );

    const { data: subscriptions, error } = await supabase
      .from('subscriptions')
      .select('*')
      .eq('status', 'active')
      .not('dime_card_token', 'is', null)
      .or('dime_subscription_id.is.null,dimepay_subscription_id.is.null')
      .lte('access_until', now)
      .limit(50);

    if (error) throw error;

    const results = [];

    for (const subscription of subscriptions || []) {
      const cardToken = subscription.dime_card_token || subscription.metadata?.dime_card_token;
      if (!cardToken) continue;

      const remoteCreate = await createDimePayRecurringSubscription({
        environment,
        companyId: subscription.company_id,
        planName: subscription.plan_name,
        planType: subscription.plan_type,
        amount: Number(subscription.amount || 0),
        currency: subscription.currency || 'JMD',
        customerId: subscription.dime_customer_id || subscription.dimepay_customer_id,
        cardToken,
        billingFrequency: subscription.billing_frequency || 'monthly',
        metadata: {
          source: 'legacy_access_until_cron',
          local_subscription_id: subscription.id
        }
      });

      if (remoteCreate.ok) {
        const remoteData = remoteCreate.data?.data || remoteCreate.data || {};
        const remoteSubscriptionId = remoteData.subscription_id || remoteData.dime_subscription_id || remoteData.id;
        const accessUntil = remoteData.access_until || remoteData.next_billing_date || monthFromNow();

        await supabase.from('subscriptions').update({
          dime_subscription_id: remoteSubscriptionId,
          dimepay_subscription_id: remoteSubscriptionId,
          access_until: accessUntil,
          next_billing_date: accessUntil,
          status: 'active',
          metadata: {
            ...(subscription.metadata || {}),
            retry_count: 0,
            cron_transitioned_at: new Date().toISOString(),
            cron_subscription_create_path: remoteCreate.path
          },
          updated_at: new Date().toISOString()
        }).eq('id', subscription.id);

        await supabase.from('companies').update({ status: 'ACTIVE' }).eq('id', subscription.company_id);
        results.push({ id: subscription.id, status: 'transitioned', remoteSubscriptionId });
      } else {
        const retryCount = Number(subscription.metadata?.retry_count || 0) + 1;

        await supabase.from('payment_history').insert({
          company_id: subscription.company_id,
          subscription_id: subscription.id,
          amount: subscription.amount || 0,
          currency: subscription.currency || 'JMD',
          status: 'failed',
          payment_method: 'card',
          transaction_id: `cron-transition-${subscription.id}-${Date.now()}`,
          description: `${subscription.plan_name} - Automated Billing Transition Failed`,
          payment_date: new Date().toISOString(),
          metadata: {
            retry_number: retryCount,
            error: remoteCreate.error
          }
        });

        await supabase.from('subscriptions').update({
          status: 'past_due',
          metadata: {
            ...(subscription.metadata || {}),
            retry_count: retryCount,
            last_failed_date: new Date().toISOString(),
            cron_transition_error: remoteCreate.error
          },
          updated_at: new Date().toISOString()
        }).eq('id', subscription.id);

        await supabase.from('companies').update({
          status: retryCount >= 3 ? 'SUSPENDED' : 'PAST_DUE'
        }).eq('id', subscription.company_id);

        results.push({ id: subscription.id, status: 'failed', retryCount });
      }
    }

    return res.status(200).json({ success: true, processed: results.length, results });
  } catch (error: any) {
    console.error('DimePay billing cron failed:', error);
    return res.status(500).json({ success: false, error: error.message || 'Cron failed' });
  }
}
