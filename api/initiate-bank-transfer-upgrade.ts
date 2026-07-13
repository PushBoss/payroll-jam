import type { VercelRequest, VercelResponse } from '@vercel/node';
import { supabaseAdmin } from './_supabaseAdmin.js';

/**
 * Records an upgrade-via-bank-transfer request: creates a pending billing intent that
 * SuperAdmin's `approve-payment` action (supabase/functions/admin-handler) picks up to
 * finalize the plan/amount once the transfer is manually verified. Mirrors the same
 * PENDING_APPROVAL pattern already used for bank-transfer signups.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { company_id, plan_name, plan_type, amount, currency } = req.body || {};
    if (!company_id || !plan_name || amount === undefined) {
      return res.status(400).json({ error: 'company_id, plan_name and amount are required' });
    }

    // A card must already be on file - bank transfer pays this cycle, but the account
    // still needs a card for renewals per the "card always required" rule.
    const { count: cardCount } = await supabaseAdmin
      .from('payment_methods')
      .select('id', { count: 'exact', head: true })
      .eq('company_id', company_id);

    if (!cardCount) {
      return res.status(400).json({ error: 'A card is required on file before paying by bank transfer. Add a card first.' });
    }

    const { data: subscription } = await supabaseAdmin
      .from('subscriptions')
      .select('id')
      .eq('company_id', company_id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    const idempotencyKey = `upgrade-bank-transfer-${company_id}-${Date.now()}`;

    const { error: intentError } = await supabaseAdmin
      .from('dimepay_billing_intents')
      .insert({
        flow: 'subscription_update',
        company_id,
        local_subscription_id: subscription?.id || null,
        plan_name,
        plan_type: plan_type || plan_name.toLowerCase(),
        amount,
        currency: currency || 'JMD',
        status: 'pending',
        idempotency_key: idempotencyKey
      });

    if (intentError) {
      console.error('❌ Error creating bank-transfer upgrade intent:', intentError);
      return res.status(500).json({ error: 'Failed to record upgrade request' });
    }

    await supabaseAdmin.from('payment_history').insert({
      company_id,
      subscription_id: subscription?.id || null,
      amount,
      currency: currency || 'JMD',
      status: 'pending',
      payment_method: 'bank_transfer',
      description: `${plan_name} - Upgrade (Bank Transfer)`,
      payment_date: new Date().toISOString(),
      metadata: { idempotency_key: idempotencyKey }
    });

    await supabaseAdmin
      .from('companies')
      .update({ status: 'PENDING_APPROVAL' })
      .eq('id', company_id);

    return res.status(200).json({ success: true, message: 'Upgrade request submitted. Your account will be updated once the transfer is verified.' });
  } catch (error: any) {
    console.error('❌ Error initiating bank-transfer upgrade:', error);
    return res.status(500).json({ error: error.message || 'Failed to initiate bank-transfer upgrade' });
  }
}
