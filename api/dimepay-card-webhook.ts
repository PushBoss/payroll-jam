import type { VercelRequest, VercelResponse } from '@vercel/node';
import crypto from 'crypto';
import { supabaseAdmin } from './_supabaseAdmin';
import { parseCardReferenceId, resolveDimePayEnvironment, updateDimePaySubscriptionCard } from './_dimepay';

const verifyWebhookSignature = (payload: any, signature: string | undefined, secret: string) => {
  if (!signature) return false;

  const expectedSignature = crypto
    .createHmac('sha256', secret)
    .update(JSON.stringify(payload))
    .digest('hex');

  return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature));
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const signature = (req.headers['dimepay-signature'] || req.headers['x-dimepay-signature']) as string | undefined;
    const prodSecret = process.env.DIMEPAY_WEBHOOK_SECRET_PROD || process.env.DIMEPAY_WEBHOOK_SECRET;
    const sandboxSecret = process.env.DIMEPAY_WEBHOOK_SECRET_SANDBOX || process.env.DIMEPAY_WEBHOOK_SECRET;

    const valid = (prodSecret && verifyWebhookSignature(req.body, signature, prodSecret))
      || (sandboxSecret && verifyWebhookSignature(req.body, signature, sandboxSecret));

    if ((prodSecret || sandboxSecret) && !valid) {
      return res.status(401).json({ error: 'Invalid signature' });
    }

    const payload = req.body;
    const parsedReference = parseCardReferenceId(payload.reference_id);

    if (!parsedReference?.companyId) {
      return res.status(200).json({ received: true });
    }

    const selectorField = parsedReference.localSubscriptionId ? 'id' : 'company_id';
    const selectorValue = parsedReference.localSubscriptionId || parsedReference.companyId;

    const { data: existingSubscription } = await supabaseAdmin
      .from('subscriptions')
      .select('id, dimepay_subscription_id, metadata')
      .eq('company_id', parsedReference.companyId)
      .eq(selectorField, selectorValue)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    const metadata = {
      ...(existingSubscription?.metadata || {}),
      dime_card_token: payload.token,
      card_request_token: payload.card_request_token,
      card_last4: payload.last_four_digits,
      card_brand: payload.card_scheme,
      card_expiry: payload.card_expiry,
      card_verification_status: payload.status,
      card_verified_at: new Date().toISOString()
    };

    await supabaseAdmin
      .from('subscriptions')
      .update({
        payment_method_last4: payload.last_four_digits || null,
        payment_method_brand: payload.card_scheme || null,
        metadata,
        updated_at: new Date().toISOString()
      })
      .eq('company_id', parsedReference.companyId)
      .eq(existingSubscription?.id ? 'id' : 'company_id', existingSubscription?.id || parsedReference.companyId);

    if (payload.status === 'SUCCESS' && payload.token && (parsedReference.dimepaySubscriptionId || existingSubscription?.dimepay_subscription_id)) {
      const environment = resolveDimePayEnvironment(undefined, req);
      await updateDimePaySubscriptionCard({
        environment,
        subscriptionId: parsedReference.dimepaySubscriptionId || existingSubscription!.dimepay_subscription_id,
        cardToken: payload.token,
        cardRequestToken: payload.card_request_token
      });
    }

    return res.status(200).json({ received: true });
  } catch (error: any) {
    console.error('❌ Card webhook error:', error);
    return res.status(200).json({ error: error.message || 'Card webhook processing failed' });
  }
}
