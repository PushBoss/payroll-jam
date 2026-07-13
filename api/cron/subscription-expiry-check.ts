import type { VercelRequest, VercelResponse } from '@vercel/node';
import { supabaseAdmin as supabase } from '../_supabaseAdmin.js';

const WARNING_WINDOW_DAYS = 3;

const getSupabaseFunctionsUrl = () => {
  const base = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '').replace(/\/$/, '');
  if (!base) return null;
  return `${base}/functions/v1/send-email`;
};

const sendNotificationEmail = async (to: string, subject: string, html: string) => {
  const functionsUrl = getSupabaseFunctionsUrl();
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_SERVICE_ROLE_KEY;
  if (!functionsUrl || !serviceRoleKey) {
    console.error('Cannot send expiry email: SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY not configured');
    return false;
  }

  try {
    const response = await fetch(functionsUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${serviceRoleKey}`
      },
      body: JSON.stringify({ to, subject, html })
    });
    return response.ok;
  } catch (error) {
    console.error('Failed to send expiry email:', error);
    return false;
  }
};

const getCompanyAdminEmail = async (companyId: string) => {
  const { data: company } = await supabase
    .from('companies')
    .select('name, email')
    .eq('id', companyId)
    .maybeSingle();
  return { companyName: company?.name || 'your company', email: company?.email as string | undefined };
};

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
    const now = new Date();
    const warningCutoff = new Date(now.getTime() + WARNING_WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString();
    const nowIso = now.toISOString();

    const results = { expiringWarned: 0, expiredNotified: 0, errors: [] as string[] };

    // "Expiring soon": no live DimePay recurring subscription bound (bank-transfer
    // accounts, or any account without a working card) - nothing will auto-renew these.
    const { data: expiringSoon, error: expiringError } = await supabase
      .from('subscriptions')
      .select('id, company_id, plan_name, access_until, metadata, dime_subscription_id, dimepay_subscription_id')
      .eq('status', 'active')
      .is('dime_subscription_id', null)
      .is('dimepay_subscription_id', null)
      .not('access_until', 'is', null)
      .lte('access_until', warningCutoff)
      .gte('access_until', nowIso);

    if (expiringError) throw expiringError;

    for (const subscription of expiringSoon || []) {
      if (subscription.metadata?.expiry_warning_sent_at) continue;

      const { companyName, email } = await getCompanyAdminEmail(subscription.company_id);
      if (!email) {
        results.errors.push(`No admin email for company ${subscription.company_id}`);
        continue;
      }

      const expiryDate = new Date(subscription.access_until).toLocaleDateString();
      const sent = await sendNotificationEmail(
        email,
        `Your Payroll-Jam ${subscription.plan_name} plan expires soon`,
        `<p>Hi ${companyName},</p><p>Your <strong>${subscription.plan_name}</strong> plan is set to expire on <strong>${expiryDate}</strong>. Please renew via bank transfer or add a card on file in Settings &rarr; Billing to avoid an interruption to your payroll access.</p>`
      );

      if (sent) {
        await supabase
          .from('subscriptions')
          .update({ metadata: { ...(subscription.metadata || {}), expiry_warning_sent_at: nowIso } })
          .eq('id', subscription.id);
        results.expiringWarned += 1;
      } else {
        results.errors.push(`Failed to send expiring-soon email for subscription ${subscription.id}`);
      }
    }

    // "Expired": access has already lapsed and the grace period is exhausted.
    const { data: expired, error: expiredError } = await supabase
      .from('subscriptions')
      .select('id, company_id, plan_name, access_until, metadata, status')
      .in('status', ['past_due', 'pending'])
      .not('access_until', 'is', null)
      .lt('access_until', nowIso);

    if (expiredError) throw expiredError;

    for (const subscription of expired || []) {
      if (subscription.metadata?.expiry_notice_sent_at) continue;

      const { companyName, email } = await getCompanyAdminEmail(subscription.company_id);
      if (!email) {
        results.errors.push(`No admin email for company ${subscription.company_id}`);
        continue;
      }

      const sent = await sendNotificationEmail(
        email,
        `Your Payroll-Jam ${subscription.plan_name} plan has expired`,
        `<p>Hi ${companyName},</p><p>Your <strong>${subscription.plan_name}</strong> plan has expired and payroll access has been paused. Renew via bank transfer or add a card on file in Settings &rarr; Billing to restore access.</p>`
      );

      if (sent) {
        await supabase
          .from('subscriptions')
          .update({ metadata: { ...(subscription.metadata || {}), expiry_notice_sent_at: nowIso } })
          .eq('id', subscription.id);
        results.expiredNotified += 1;
      } else {
        results.errors.push(`Failed to send expired email for subscription ${subscription.id}`);
      }
    }

    return res.status(200).json({ success: true, ...results });
  } catch (error: any) {
    console.error('Subscription expiry check failure:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
}
