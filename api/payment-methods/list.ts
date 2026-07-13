import type { VercelRequest, VercelResponse } from '@vercel/node';
import { supabaseAdmin } from '../_supabaseAdmin.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const companyId = typeof req.query.company_id === 'string' ? req.query.company_id : undefined;
  if (!companyId) {
    return res.status(400).json({ error: 'company_id is required' });
  }

  const { data, error } = await supabaseAdmin
    .from('payment_methods')
    .select('id, dime_card_token, card_last4, card_brand, card_expiry_month, card_expiry_year, is_primary, created_at')
    .eq('company_id', companyId)
    .order('is_primary', { ascending: false })
    .order('created_at', { ascending: false });

  if (error) {
    console.error('❌ Error listing payment methods:', error);
    return res.status(500).json({ error: 'Failed to list payment methods' });
  }

  return res.status(200).json({ paymentMethods: data || [] });
}
