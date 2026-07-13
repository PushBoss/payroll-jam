import type { VercelRequest, VercelResponse } from '@vercel/node';
import { supabaseAdmin } from '../_supabaseAdmin.js';
import { resolveDimePayEnvironment, updateDimePaySubscriptionCard, buildCardReferenceId } from '../_dimepay.js';
import { appendDimePayLedgerEvent } from '../_dimepayLedger.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { company_id, payment_method_id, environment } = req.body || {};
    if (!company_id || !payment_method_id) {
      return res.status(400).json({ error: 'company_id and payment_method_id are required' });
    }

    const { data: target, error: targetError } = await supabaseAdmin
      .from('payment_methods')
      .select('*')
      .eq('id', payment_method_id)
      .eq('company_id', company_id)
      .maybeSingle();

    if (targetError || !target) {
      return res.status(404).json({ error: 'Payment method not found' });
    }

    if (target.is_primary) {
      return res.status(200).json({ success: true, message: 'Already the primary card.', paymentMethod: target });
    }

    const { data: subscription } = await supabaseAdmin
      .from('subscriptions')
      .select('id, dime_subscription_id, dimepay_subscription_id')
      .eq('company_id', company_id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    const resolvedSubscriptionId = subscription?.dime_subscription_id || subscription?.dimepay_subscription_id;

    let remoteUpdate: any = { ok: false, skipped: true, reason: 'No active DimePay subscription to rebind.' };
    if (resolvedSubscriptionId) {
      const dimePayEnvironment = resolveDimePayEnvironment(environment, req);
      remoteUpdate = await updateDimePaySubscriptionCard({
        environment: dimePayEnvironment,
        subscriptionId: resolvedSubscriptionId,
        cardToken: target.dime_card_token,
        cardRequestToken: target.card_request_token || undefined
      });

      if (!remoteUpdate.ok) {
        return res.status(502).json({ error: remoteUpdate.error || 'DimePay declined to rebind this card as primary.' });
      }
    }

    // Demote current primary first so the partial unique index (one primary per company) never sees two rows true at once.
    const { error: demoteError } = await supabaseAdmin
      .from('payment_methods')
      .update({ is_primary: false, updated_at: new Date().toISOString() })
      .eq('company_id', company_id)
      .eq('is_primary', true);

    if (demoteError) {
      console.error('❌ Error demoting current primary payment method:', demoteError);
      return res.status(500).json({ error: 'Failed to update primary payment method' });
    }

    const { data: promoted, error: promoteError } = await supabaseAdmin
      .from('payment_methods')
      .update({ is_primary: true, updated_at: new Date().toISOString() })
      .eq('id', payment_method_id)
      .select('*')
      .single();

    if (promoteError) {
      console.error('❌ Error promoting new primary payment method:', promoteError);
      return res.status(500).json({ error: 'Failed to update primary payment method' });
    }

    if (subscription?.id) {
      await supabaseAdmin
        .from('subscriptions')
        .update({
          dime_card_token: target.dime_card_token,
          card_last_four: target.card_last4,
          card_brand: target.card_brand,
          payment_method_last4: target.card_last4,
          payment_method_brand: target.card_brand,
          updated_at: new Date().toISOString()
        })
        .eq('id', subscription.id);
    }

    const ledgerReferenceId = buildCardReferenceId({
      companyId: company_id,
      flow: 'subscription_update',
      localSubscriptionId: subscription?.id,
      dimepaySubscriptionId: resolvedSubscriptionId
    });

    await appendDimePayLedgerEvent(
      { type: 'card_request.succeeded', data: { reference_id: ledgerReferenceId, company_id, action: 'set_primary' } },
      { source: 'payment-methods/set-primary', payment_method_id, card_last4: target.card_last4, card_brand: target.card_brand }
    );

    return res.status(200).json({ success: true, paymentMethod: promoted });
  } catch (error: any) {
    console.error('❌ Error setting primary payment method:', error);
    return res.status(500).json({ error: error.message || 'Failed to set primary payment method' });
  }
}
