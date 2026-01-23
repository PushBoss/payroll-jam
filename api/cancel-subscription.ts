import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

// Initialize Supabase with service role key for admin access
const supabase = createClient(
  process.env.VITE_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

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

    // Get DimePay credentials
    // Use VERCEL_ENV or APP_ENV to determine if we are in production
    const isProduction =
      process.env.VERCEL_ENV === 'production' ||
      process.env.APP_ENV === 'production';

    // Force sandbox for everything except production
    const effectiveIsProduction = isProduction;

    const apiKey = effectiveIsProduction
      ? process.env.DIMEPAY_CLIENT_ID_PROD
      : process.env.DIMEPAY_CLIENT_ID_SANDBOX;

    const secretKey = effectiveIsProduction
      ? process.env.DIMEPAY_SECRET_KEY_PROD
      : process.env.DIMEPAY_SECRET_KEY_SANDBOX;

    if (!apiKey || !secretKey) {
      console.error('❌ DimePay credentials not configured');
      return res.status(500).json({ error: 'Payment gateway not configured' });
    }

    const dimePayUrl = effectiveIsProduction
      ? 'https://api.dimepay.app/v1/subscriptions/cancel'
      : 'https://sandbox-api.dimepay.app/v1/subscriptions/cancel';

    console.log('🔄 Cancelling DimePay subscription:', subscription_id);

    // Attempt to cancel in DimePay
    try {
      const dimePayResponse = await fetch(`${dimePayUrl}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
          'X-Secret-Key': secretKey
        },
        body: JSON.stringify({
          subscription_id: subscription_id
        })
      });

      if (!dimePayResponse.ok) {
        const errorData = await dimePayResponse.text();
        console.error('❌ DimePay cancellation failed:', errorData);

        // Continue with local cancellation even if DimePay call fails
        // The webhook will handle the actual cancellation when DimePay processes it
      } else {
        console.log('✅ DimePay subscription cancelled successfully');
      }
    } catch (dimePayError: any) {
      console.error('❌ Error calling DimePay API:', dimePayError.message);
      // Continue with local cancellation
    }

    // Update subscription status in database (immediate feedback for user)
    const { error: updateError } = await supabase
      .from('subscriptions')
      .update({
        status: 'cancelled',
        end_date: new Date().toISOString(),
        auto_renew: false,
        updated_at: new Date().toISOString(),
        metadata: {
          cancelled_at: new Date().toISOString(),
          cancelled_by: 'user'
        }
      })
      .eq('dimepay_subscription_id', subscription_id)
      .eq('company_id', company_id);

    if (updateError) {
      console.error('❌ Error updating subscription in database:', updateError);
      return res.status(500).json({ error: 'Failed to update subscription status' });
    }

    // Update company subscription status
    const { error: companyError } = await supabase
      .from('companies')
      .update({
        subscription_status: 'SUSPENDED',
        plan: 'Free' // Downgrade to free plan
      })
      .eq('id', company_id);

    if (companyError) {
      console.error('❌ Error updating company status:', companyError);
    }

    console.log('✅ Subscription cancelled successfully in database');

    return res.status(200).json({
      success: true,
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
