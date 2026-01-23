import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';

// Initialize Supabase with service role key for admin access
const supabase = createClient(
  process.env.VITE_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY! // Admin key to bypass RLS
);

/**
 * DimePay Webhook Handler for Recurring Subscriptions
 * 
 * Handles webhook events from DimePay for subscription lifecycle:
 * - subscription.created: Initial subscription setup after first payment
 * - invoice.payment_succeeded: Recurring payment successful
 * - invoice.payment_failed: Recurring payment failed
 * - subscription.canceled: Subscription cancelled
 * - subscription.paused: Subscription temporarily paused
 * 
 * Docs: https://docs.dimepay.net/%EF%B8%8F-dime-apis/z-recurring-payments
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Only accept POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // 1. VERIFY WEBHOOK SIGNATURE (Critical for security!)
    const signature = req.headers['dimepay-signature'] || req.headers['x-dimepay-signature'];

    // Determine environment
    const isProduction =
      process.env.VERCEL_ENV === 'production' ||
      process.env.APP_ENV === 'production';

    const webhookSecret = isProduction
      ? (process.env.DIMEPAY_WEBHOOK_SECRET_PROD || process.env.DIMEPAY_WEBHOOK_SECRET)
      : (process.env.DIMEPAY_WEBHOOK_SECRET_SANDBOX || process.env.DIMEPAY_WEBHOOK_SECRET);

    if (!webhookSecret) {
      console.error('❌ DIMEPAY_WEBHOOK_SECRET not configured for environment');
      return res.status(500).json({ error: 'Webhook secret not configured' });
    }

    if (!verifyWebhookSignature(req.body, signature as string, webhookSecret)) {
      console.error('❌ Invalid webhook signature');
      return res.status(401).json({ error: 'Invalid signature' });
    }

    const event = req.body;
    console.log('🔔 DimePay Webhook received:', event.type);

    // 2. HANDLE DIFFERENT EVENT TYPES
    switch (event.type) {

      // ✅ Subscription created after first checkout succeeds
      case 'subscription.created': {
        const data = event.data;
        console.log('📝 Creating subscription:', data.subscription_id);

        // Extract company_id from metadata
        const companyId = data.metadata?.company_id;
        if (!companyId) {
          console.error('❌ No company_id in subscription metadata');
          return res.status(400).json({ error: 'Missing company_id in metadata' });
        }

        // Create subscription record in database
        const { error: subError } = await supabase.from('subscriptions').insert({
          company_id: companyId,
          dimepay_subscription_id: data.subscription_id,
          dimepay_customer_id: data.customer_id,
          plan_name: data.metadata?.plan_name || 'Unknown Plan',
          plan_type: data.metadata?.plan_type || 'subscription',
          status: 'active',
          billing_frequency: data.recurring_frequency?.toLowerCase() || 'monthly',
          amount: data.amount || 0,
          currency: data.currency || 'JMD',
          next_billing_date: data.next_billing_date || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
          start_date: new Date().toISOString(),
          auto_renew: true,
          metadata: {
            order_id: data.order_id,
            card_last4: data.card_last4,
            card_brand: data.card_brand,
            billing_cycles: data.billing_cycles
          }
        });

        if (subError) {
          console.error('❌ Error creating subscription:', subError);
          // Don't fail the webhook - log and continue
        } else {
          console.log('✅ Subscription created in database');
        }

        // Record initial payment
        const { error: payError } = await supabase.from('payment_history').insert({
          company_id: companyId,
          amount: data.amount || 0,
          currency: data.currency || 'JMD',
          status: 'completed',
          payment_method: 'card',
          transaction_id: data.transaction_id || data.order_id,
          invoice_number: data.invoice_number || `INV-${Date.now()}`,
          description: `${data.metadata?.plan_name || 'Subscription'} - Initial Payment`,
          payment_date: new Date().toISOString(),
          metadata: {
            subscription_id: data.subscription_id,
            card_last4: data.card_last4
          }
        });

        if (payError) {
          console.error('❌ Error recording initial payment:', payError);
        }

        break;
      }

      // ✅ Recurring payment succeeded
      case 'invoice.payment_succeeded': {
        const data = event.data;
        console.log('💰 Processing successful payment:', data.invoice_id);

        // Find subscription in database
        const { data: subscription, error: findError } = await supabase
          .from('subscriptions')
          .select('*')
          .eq('dimepay_subscription_id', data.subscription_id)
          .single();

        if (findError || !subscription) {
          console.error('❌ Subscription not found:', data.subscription_id, findError);
          return res.status(200).json({ received: true }); // Still acknowledge
        }

        // Check for duplicate payment (idempotency)
        const { data: existing } = await supabase
          .from('payment_history')
          .select('id')
          .eq('transaction_id', data.invoice_id)
          .single();

        if (existing) {
          console.log('ℹ️ Payment already recorded:', data.invoice_id);
          return res.status(200).json({ message: 'Already processed' });
        }

        // Record successful payment
        const { error: payError } = await supabase.from('payment_history').insert({
          company_id: subscription.company_id,
          subscription_id: subscription.id,
          amount: data.amount,
          currency: data.currency || 'JMD',
          status: 'completed',
          payment_method: 'card',
          transaction_id: data.invoice_id,
          invoice_number: data.invoice_number || `INV-${Date.now()}`,
          description: `${subscription.plan_name} - Recurring Payment`,
          payment_date: new Date().toISOString(),
          metadata: {
            cycle_number: data.cycle_number,
            card_last4: data.card_last4,
            subscription_id: data.subscription_id
          }
        });

        if (payError) {
          console.error('❌ Error recording payment:', payError);
        }

        // Update subscription next_billing_date and ensure active
        const nextBillingDate = data.next_billing_date || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
        const { error: updateError } = await supabase.from('subscriptions').update({
          next_billing_date: nextBillingDate,
          status: 'active',
          metadata: {
            ...subscription.metadata,
            last_payment_date: new Date().toISOString(),
            total_payments: (subscription.metadata?.total_payments || 0) + 1
          },
          updated_at: new Date().toISOString()
        }).eq('id', subscription.id);

        if (updateError) {
          console.error('❌ Error updating subscription:', updateError);
        }

        // Ensure company subscription status is ACTIVE
        const { error: companyError } = await supabase.from('companies').update({
          subscription_status: 'ACTIVE'
        }).eq('id', subscription.company_id);

        if (companyError) {
          console.error('❌ Error updating company status:', companyError);
        }

        console.log('✅ Recurring payment recorded successfully');
        break;
      }

      // ❌ Recurring payment failed
      case 'invoice.payment_failed': {
        const data = event.data;
        console.log('⚠️ Processing failed payment:', data.invoice_id);

        const { data: subscription, error: findError } = await supabase
          .from('subscriptions')
          .select('*')
          .eq('dimepay_subscription_id', data.subscription_id)
          .single();

        if (findError || !subscription) {
          console.error('❌ Subscription not found:', data.subscription_id);
          return res.status(200).json({ received: true });
        }

        // Get retry count
        const retryCount = (subscription.metadata?.retry_count || 0) + 1;

        // Record failed payment
        const { error: payError } = await supabase.from('payment_history').insert({
          company_id: subscription.company_id,
          subscription_id: subscription.id,
          amount: data.amount,
          currency: data.currency || 'JMD',
          status: 'failed',
          payment_method: 'card',
          transaction_id: data.invoice_id,
          description: `${subscription.plan_name} - Payment Failed (Attempt ${retryCount})`,
          payment_date: new Date().toISOString(),
          metadata: {
            error: data.failure_reason || 'Payment declined',
            retry_number: retryCount,
            subscription_id: data.subscription_id
          }
        });

        if (payError) {
          console.error('❌ Error recording failed payment:', payError);
        }

        // Determine action based on retry count
        if (retryCount >= 3) {
          // Suspend after 3 failed attempts
          console.log('🚫 Suspending subscription after 3 failed attempts');

          await supabase.from('subscriptions').update({
            status: 'past_due',
            metadata: {
              ...subscription.metadata,
              retry_count: retryCount,
              suspended_at: new Date().toISOString()
            }
          }).eq('id', subscription.id);

          await supabase.from('companies').update({
            subscription_status: 'SUSPENDED'
          }).eq('id', subscription.company_id);

          // TODO: Send suspension email notification
        } else {
          // Mark as past_due but allow retries
          console.log(`⚠️ Payment failed (attempt ${retryCount}/3) - marking past due`);

          await supabase.from('subscriptions').update({
            status: 'past_due',
            metadata: {
              ...subscription.metadata,
              retry_count: retryCount,
              last_failed_date: new Date().toISOString()
            }
          }).eq('id', subscription.id);

          await supabase.from('companies').update({
            subscription_status: 'PAST_DUE'
          }).eq('id', subscription.company_id);

          // TODO: Send payment failed email with retry info
        }
        break;
      }

      // 🚫 Subscription cancelled
      case 'subscription.canceled':
      case 'subscription.cancelled': { // Handle both spellings
        const data = event.data;
        console.log('🚫 Processing subscription cancellation:', data.subscription_id);

        const { error: subError } = await supabase.from('subscriptions')
          .update({
            status: 'cancelled',
            end_date: new Date().toISOString(),
            auto_renew: false
          })
          .eq('dimepay_subscription_id', data.subscription_id);

        if (subError) {
          console.error('❌ Error cancelling subscription:', subError);
        }

        // Get company_id to update status
        const { data: subscription } = await supabase
          .from('subscriptions')
          .select('company_id')
          .eq('dimepay_subscription_id', data.subscription_id)
          .single();

        if (subscription) {
          await supabase.from('companies').update({
            subscription_status: 'SUSPENDED'
          }).eq('id', subscription.company_id);
        }

        console.log('✅ Subscription cancelled successfully');
        break;
      }

      // ⏸️ Subscription paused
      case 'subscription.paused': {
        const data = event.data;
        console.log('⏸️ Processing subscription pause:', data.subscription_id);

        const { error } = await supabase.from('subscriptions')
          .update({
            status: 'paused',
            metadata: {
              paused_at: new Date().toISOString()
            }
          })
          .eq('dimepay_subscription_id', data.subscription_id);

        if (error) {
          console.error('❌ Error pausing subscription:', error);
        } else {
          console.log('✅ Subscription paused successfully');
        }
        break;
      }

      default:
        console.log('ℹ️ Unhandled webhook event type:', event.type);
    }

    // Always respond 200 to acknowledge receipt
    return res.status(200).json({ received: true });

  } catch (error: any) {
    console.error('❌ Webhook processing error:', error);
    // Still return 200 to prevent DimePay from retrying
    return res.status(200).json({ error: 'Processing failed', message: error.message });
  }
}

/**
 * Verify webhook signature from DimePay
 * Uses HMAC-SHA256 to ensure webhook is authentic
 */
function verifyWebhookSignature(payload: any, signature: string, secret: string): boolean {
  if (!signature) {
    console.error('No signature provided in webhook');
    return false;
  }

  try {
    const payloadString = JSON.stringify(payload);
    const expectedSignature = crypto
      .createHmac('sha256', secret)
      .update(payloadString)
      .digest('hex');

    // Use timing-safe comparison to prevent timing attacks
    return crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(expectedSignature)
    );
  } catch (error) {
    console.error('Error verifying signature:', error);
    return false;
  }
}
