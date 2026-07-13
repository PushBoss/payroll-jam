import type { VercelRequest, VercelResponse } from '@vercel/node';
import { supabaseAdmin } from '../_supabaseAdmin.js';
import { buildCardReferenceId } from '../_dimepay.js';
import { appendDimePayLedgerEvent } from '../_dimepayLedger.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { company_id, payment_method_id } = req.body || {};
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
      const { data: subscription } = await supabaseAdmin
        .from('subscriptions')
        .select('id, status')
        .eq('company_id', company_id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (subscription?.status === 'active') {
        return res.status(400).json({ error: 'Set another card as primary before removing this one.' });
      }
    }

    const { error: deleteError } = await supabaseAdmin
      .from('payment_methods')
      .delete()
      .eq('id', payment_method_id)
      .eq('company_id', company_id);

    if (deleteError) {
      console.error('❌ Error removing payment method:', deleteError);
      return res.status(500).json({ error: 'Failed to remove payment method' });
    }

    const ledgerReferenceId = buildCardReferenceId({
      companyId: company_id,
      flow: 'card_update',
      intentId: payment_method_id
    });

    await appendDimePayLedgerEvent(
      { type: 'card_request.succeeded', data: { reference_id: ledgerReferenceId, company_id, action: 'removed' } },
      { source: 'payment-methods/remove', payment_method_id, card_last4: target.card_last4, card_brand: target.card_brand, action: 'removed' }
    );

    return res.status(200).json({ success: true });
  } catch (error: any) {
    console.error('❌ Error removing payment method:', error);
    return res.status(500).json({ error: error.message || 'Failed to remove payment method' });
  }
}
