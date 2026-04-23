import type { VercelRequest, VercelResponse } from '@vercel/node';
import { supabaseAdmin as supabase } from './_supabaseAdmin';

const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const resolveHost = (req: VercelRequest) => {
  const forwardedHost = req.headers['x-forwarded-host'];
  const hostHeader = (Array.isArray(forwardedHost) ? forwardedHost[0] : forwardedHost) || req.headers.host;
  return (hostHeader || '').split(':')[0].toLowerCase();
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const host = resolveHost(req);
  const isProductionHost = host === 'payrolljam.com' || host === 'www.payrolljam.com';

  // Never expose debug endpoints on production host.
  if (isProductionHost) {
    return res.status(404).json({ error: 'Not found' });
  }

  const companyId = (req.query.company_id as string | undefined) || (req.query.companyId as string | undefined);
  if (!companyId || !uuidRegex.test(companyId)) {
    return res.status(400).json({ error: 'Valid company_id is required' });
  }

  // Optional shared secret for extra safety (recommended). If set, it must match.
  const configuredToken = process.env.DIMEPAY_WEBHOOK_DEBUG_TOKEN;
  const providedToken = (req.query.token as string | undefined) || (req.headers['x-debug-token'] as string | undefined);

  if (configuredToken && providedToken !== configuredToken) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  try {
    const secrets = {
      hasProdSecret: Boolean(process.env.DIMEPAY_WEBHOOK_SECRET_PROD || process.env.DIMEPAY_WEBHOOK_SECRET),
      hasSandboxSecret: Boolean(process.env.DIMEPAY_WEBHOOK_SECRET_SANDBOX || process.env.DIMEPAY_WEBHOOK_SECRET)
    };

    const [{ data: subscription, error: subError }, { data: payments, error: payError }] = await Promise.all([
      supabase
        .from('subscriptions')
        .select('id, company_id, plan_name, status, billing_frequency, amount, currency, dimepay_subscription_id, dimepay_customer_id, payment_method_last4, payment_method_brand, next_billing_date, start_date, end_date, auto_renew, metadata, created_at, updated_at')
        .eq('company_id', companyId)
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from('payment_history')
        .select('id, company_id, subscription_id, amount, currency, status, payment_method, transaction_id, invoice_number, description, payment_date, metadata, created_at')
        .eq('company_id', companyId)
        .order('payment_date', { ascending: false })
        .limit(5)
    ]);

    if (subError) {
      console.error('❌ webhook-debug: subscription query error', subError);
    }

    if (payError) {
      console.error('❌ webhook-debug: payment query error', payError);
    }

    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Access-Control-Allow-Origin', '*');

    return res.status(200).json({
      ok: true,
      host,
      vercelEnv: process.env.VERCEL_ENV,
      timestamp: new Date().toISOString(),
      secrets,
      subscription: subscription || null,
      payments: payments || [],
      hints: {
        expected: 'After a successful checkout, subscription.created should create/update subscriptions and payment_history rows.',
        ifMissing: 'If subscription is null and payments are empty, DimePay is not calling the webhook (or the webhook is erroring before DB writes).'
      }
    });
  } catch (error: any) {
    console.error('❌ webhook-debug: unhandled error', error);
    return res.status(500).json({ error: 'Internal error' });
  }
}
