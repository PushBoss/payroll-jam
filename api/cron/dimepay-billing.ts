import type { VercelRequest, VercelResponse } from '@vercel/node';
import { supabaseAdmin as supabase } from '../_supabaseAdmin.js';
import { withCrashLogging } from '../_crashLogger.js';

const WARNING_WINDOW_DAYS = 3;
const WEBHOOK_RECONCILIATION_HOURS = 24;
const getGracePeriodDays = () => {
  const configured = Number(process.env.SUBSCRIPTION_GRACE_PERIOD_DAYS || 7);
  return Number.isFinite(configured) && configured >= 0 ? configured : 7;
};

const getSupabaseFunctionsUrl = () => {
  const base = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '').replace(/\/$/, '');
  return base ? `${base}/functions/v1/send-email` : null;
};

const sendEmail = async (to: string, subject: string, html: string) => {
  const functionsUrl = getSupabaseFunctionsUrl();
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!functionsUrl || !serviceRoleKey) return false;

  try {
    const response = await fetch(functionsUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${serviceRoleKey}` },
      body: JSON.stringify({ to, subject, html })
    });
    return response.ok;
  } catch (error) {
    console.error('Unable to send subscription billing email:', error);
    return false;
  }
};

const getCompanyContact = async (companyId: string) => {
  const { data } = await supabase
    .from('companies')
    .select('name, email')
    .eq('id', companyId)
    .maybeSingle();
  return { name: data?.name || 'Payroll-Jam customer', email: data?.email as string | undefined };
};

const sendOnce = async (subscription: any, key: string, subject: string, html: string) => {
  if (subscription.metadata?.[key]) return false;
  const contact = await getCompanyContact(subscription.company_id);
  if (!contact.email) return false;
  const sent = await sendEmail(contact.email, subject, html);
  if (sent) {
    await supabase
      .from('subscriptions')
      .update({
        metadata: { ...(subscription.metadata || {}), [key]: new Date().toISOString() },
        updated_at: new Date().toISOString()
      })
      .eq('id', subscription.id);
  }
  return sent;
};

const validDate = (value: unknown) => {
  const parsed = value ? new Date(String(value)) : null;
  return parsed && !Number.isNaN(parsed.getTime()) ? parsed : null;
};

/**
 * This is a reconciliation and dunning job, not a payment processor.
 *
 * DimePay owns recurring charges after a subscription schedule is created.
 * A signed invoice.payment_succeeded webhook is the only event that extends
 * paid access. This job only detects missing/late webhooks, reminds customers,
 * and removes paid access once the grace period has elapsed.
 */
async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST' && req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || req.headers.authorization !== `Bearer ${cronSecret}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const now = new Date();
    const nowIso = now.toISOString();
    const warningCutoff = new Date(now.getTime() + WARNING_WINDOW_DAYS * 24 * 60 * 60 * 1000);
    const reconciliationCutoff = new Date(now.getTime() - WEBHOOK_RECONCILIATION_HOURS * 60 * 60 * 1000);
    const gracePeriodDays = getGracePeriodDays();
    const graceCutoff = new Date(now.getTime() - gracePeriodDays * 24 * 60 * 60 * 1000);
    const results = {
      reminders: 0,
      reconciliationRequired: 0,
      markedPastDue: 0,
      downgradedToFree: 0,
      cancellationDowngrades: 0,
      errors: [] as string[]
    };

    const { data: subscriptions, error } = await supabase
      .from('subscriptions')
      .select('id, company_id, plan_name, status, auto_renew, access_until, next_billing_date, end_date, dime_subscription_id, dimepay_subscription_id, metadata')
      .in('status', ['active', 'past_due', 'pending', 'cancelled'])
      .order('updated_at', { ascending: true })
      .limit(250);
    if (error) throw error;

    for (const subscription of subscriptions || []) {
      const metadata = subscription.metadata || {};
      const dueAt = validDate(subscription.access_until || subscription.next_billing_date);
      const hasGatewaySubscription = Boolean(subscription.dime_subscription_id || subscription.dimepay_subscription_id);

      if (subscription.status === 'cancelled') {
        const cancellationEnd = validDate(subscription.end_date) || dueAt;
        if (!subscription.auto_renew && cancellationEnd && cancellationEnd < now && !metadata.downgraded_to_free_at) {
          const { error: companyError } = await supabase
            .from('companies')
            .update({ plan: 'Free', status: 'ACTIVE' })
            .eq('id', subscription.company_id);
          if (companyError) {
            results.errors.push(`Unable to downgrade cancelled subscription ${subscription.id}`);
          } else {
            await supabase.from('subscriptions').update({
              metadata: { ...metadata, downgraded_to_free_at: nowIso, downgrade_reason: 'cancelled_subscription_ended' },
              updated_at: nowIso
            }).eq('id', subscription.id);
            results.cancellationDowngrades += 1;
          }
        }
        continue;
      }

      // Bank-transfer / legacy accounts cannot renew automatically until a DimePay
      // schedule is created from a verified primary card. Warn before expiry, but
      // never manufacture a schedule here because that could cause an unexpected charge.
      if (subscription.status === 'active' && dueAt && !hasGatewaySubscription) {
        if (dueAt <= warningCutoff && dueAt >= now && !metadata.expiry_warning_sent_at) {
          const contact = await getCompanyContact(subscription.company_id);
          const sent = await sendOnce(
            subscription,
            'expiry_warning_sent_at',
            `Your Payroll-Jam ${subscription.plan_name} plan expires soon`,
            `<p>Hi ${contact.name},</p><p>Your plan expires on <strong>${dueAt.toLocaleDateString()}</strong>. Add a verified primary card in Settings &rarr; Billing to keep your subscription active.</p>`
          );
          if (sent) results.reminders += 1;
        }
        if (dueAt < now) {
          await supabase.from('subscriptions').update({
            status: 'past_due',
            metadata: { ...metadata, access_expired_at: metadata.access_expired_at || nowIso, gateway_reconciliation_required: true },
            updated_at: nowIso
          }).eq('id', subscription.id);
          await supabase.from('companies').update({ status: 'PAST_DUE' }).eq('id', subscription.company_id);
          results.markedPastDue += 1;
        }
        continue;
      }

      // The payment schedule is due but its success webhook has not arrived.
      // Do not infer payment success or re-charge the card. Flag it for DimePay
      // reconciliation only after a full-day delivery window.
      if (subscription.status === 'active' && hasGatewaySubscription && dueAt && dueAt < reconciliationCutoff) {
        await supabase.from('subscriptions').update({
          status: 'past_due',
          metadata: { ...metadata, webhook_reconciliation_required_at: metadata.webhook_reconciliation_required_at || nowIso },
          updated_at: nowIso
        }).eq('id', subscription.id);
        await supabase.from('companies').update({ status: 'PAST_DUE' }).eq('id', subscription.company_id);
        results.reconciliationRequired += 1;
        results.markedPastDue += 1;
        continue;
      }

      if (subscription.status !== 'past_due') continue;

      const failureDate = validDate(metadata.last_failed_date || metadata.access_expired_at || dueAt?.toISOString());
      if (!failureDate) continue;

      if (!metadata.payment_reminder_sent_at) {
        const contact = await getCompanyContact(subscription.company_id);
        const sent = await sendOnce(
          subscription,
          'payment_reminder_sent_at',
          `Action needed: your Payroll-Jam payment is overdue`,
          `<p>Hi ${contact.name},</p><p>We could not confirm payment for your <strong>${subscription.plan_name}</strong> plan. Add or update your primary card in Settings &rarr; Billing to keep payroll access active.</p>`
        );
        if (sent) results.reminders += 1;
      }

      if (failureDate <= graceCutoff && !metadata.downgraded_for_nonpayment_at) {
        const { error: companyError } = await supabase
          .from('companies')
          .update({ plan: 'Free', status: 'ACTIVE' })
          .eq('id', subscription.company_id);
        if (companyError) {
          results.errors.push(`Unable to downgrade overdue subscription ${subscription.id}`);
          continue;
        }
        await supabase.from('subscriptions').update({
          status: 'expired',
          metadata: {
            ...metadata,
            downgraded_for_nonpayment_at: nowIso,
            downgrade_reason: 'payment_overdue',
            grace_period_days: gracePeriodDays
          },
          updated_at: nowIso
        }).eq('id', subscription.id);
        results.downgradedToFree += 1;
      }
    }

    return res.status(200).json({ success: true, gracePeriodDays, ...results });
  } catch (error: any) {
    console.error('DimePay billing cron failed:', error);
    return res.status(500).json({ success: false, error: error.message || 'Cron failed' });
  }
}

export default withCrashLogging(handler, { endpoint: '/api/cron/dimepay-billing', critical: true });
