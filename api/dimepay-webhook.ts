import type { VercelRequest, VercelResponse } from '@vercel/node';
import crypto from 'crypto';
import { supabaseAdmin as supabase } from './_supabaseAdmin';

const updateCompanyBillingState = async (
  companyId: string,
  status: 'ACTIVE' | 'PAST_DUE' | 'SUSPENDED',
  paymentMethod?: string
) => {
  const { data: company, error: fetchError } = await supabase
    .from('companies')
    .select('settings')
    .eq('id', companyId)
    .single();

  if (fetchError) {
    console.error('❌ Error loading company billing settings:', fetchError);
    return;
  }

  const nextSettings = {
    ...(company?.settings || {}),
    ...(paymentMethod ? { paymentMethod } : {})
  };

  const { error: updateError } = await supabase
    .from('companies')
    .update({
      status,
      settings: nextSettings
    })
    .eq('id', companyId);

  if (updateError) {
    console.error('❌ Error updating company billing state:', updateError);
  }
};

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

    // Resolve both potential secrets
    const prodSecret = process.env.DIMEPAY_WEBHOOK_SECRET_PROD || process.env.DIMEPAY_WEBHOOK_SECRET;
    const sandboxSecret = process.env.DIMEPAY_WEBHOOK_SECRET_SANDBOX || process.env.DIMEPAY_WEBHOOK_SECRET;

    if (!prodSecret && !sandboxSecret) {
      console.error('❌ DIMEPAY_WEBHOOK_SECRET not configured');
      return res.status(500).json({ error: 'Webhook secret not configured' });
    }

    // Try verifying against both configured secrets. If one matches, the webhook is valid.
    let isValidSignature = false;
    let actualEnvironment = 'unknown';

    if (prodSecret && verifyWebhookSignature(req.body, signature as string, prodSecret)) {
      isValidSignature = true;
      actualEnvironment = 'production';
    } else if (sandboxSecret && verifyWebhookSignature(req.body, signature as string, sandboxSecret)) {
      isValidSignature = true;
      actualEnvironment = 'sandbox';
    }

    if (!isValidSignature) {
      console.error('❌ Invalid webhook signature (Tried Prod & Sandbox secrets)');
      return res.status(401).json({ error: 'Invalid signature' });
    }

    // You can now optionally use `actualEnvironment` below if needed


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

        const subscriptionPayload = {
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
          payment_method_last4: data.card_last4 || null,
          payment_method_brand: data.card_brand || null,
          metadata: {
            order_id: data.order_id,
            dime_card_token: data.card_token,
            card_request_token: data.card_request_token,
            card_last4: data.card_last4,
            card_brand: data.card_brand,
            card_expiry: data.card_expiry,
            billing_cycles: data.billing_cycles
          },
          updated_at: new Date().toISOString()
        };

        const { data: existingSubscription } = await supabase
          .from('subscriptions')
          .select('id')
          .eq('company_id', companyId)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        let storedSubscriptionId: string | null = existingSubscription?.id || null;

        if (existingSubscription?.id) {
          const { error: subError } = await supabase
            .from('subscriptions')
            .update(subscriptionPayload)
            .eq('id', existingSubscription.id);

          if (subError) {
            console.error('❌ Error updating subscription:', subError);
          } else {
            console.log('✅ Subscription updated in database');
          }
        } else {
          const { data: createdSubscription, error: subError } = await supabase
            .from('subscriptions')
            .insert(subscriptionPayload)
            .select('id')
            .single();

          if (subError) {
            console.error('❌ Error creating subscription:', subError);
          } else {
            storedSubscriptionId = createdSubscription.id;
            console.log('✅ Subscription created in database');
          }
        }

        await updateCompanyBillingState(companyId, 'ACTIVE', 'card');

        const transactionId = data.transaction_id || data.order_id;
        const { data: existingPayment } = await supabase
          .from('payment_history')
          .select('id')
          .eq('transaction_id', transactionId)
          .maybeSingle();

        // Record initial payment
        if (!existingPayment) {
          const { error: payError } = await supabase.from('payment_history').insert({
            company_id: companyId,
            subscription_id: storedSubscriptionId,
            amount: data.amount || 0,
            currency: data.currency || 'JMD',
            status: 'completed',
            payment_method: 'card',
            transaction_id: transactionId,
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
          payment_method_last4: data.card_last4 || subscription.payment_method_last4 || null,
          payment_method_brand: data.card_brand || subscription.payment_method_brand || null,
          metadata: {
            ...subscription.metadata,
            dime_card_token: data.card_token || subscription.metadata?.dime_card_token,
            card_request_token: data.card_request_token || subscription.metadata?.card_request_token,
            card_last4: data.card_last4 || subscription.metadata?.card_last4,
            card_brand: data.card_brand || subscription.metadata?.card_brand,
            card_expiry: data.card_expiry || subscription.metadata?.card_expiry,
            last_payment_date: new Date().toISOString(),
            total_payments: (subscription.metadata?.total_payments || 0) + 1
          },
          updated_at: new Date().toISOString()
        }).eq('id', subscription.id);

        if (updateError) {
          console.error('❌ Error updating subscription:', updateError);
        }

        await updateCompanyBillingState(subscription.company_id, 'ACTIVE', 'card');

        console.log('✅ Recurring payment recorded successfully');
        break;
      }

      case 'subscription.updated': {
        const data = event.data;
        console.log('🔁 Processing subscription update:', data.subscription_id);

        const { data: subscription, error: findError } = await supabase
          .from('subscriptions')
          .select('*')
          .eq('dimepay_subscription_id', data.subscription_id)
          .single();

        if (findError || !subscription) {
          console.error('❌ Subscription not found for update:', data.subscription_id, findError);
          return res.status(200).json({ received: true });
        }

        const { error: updateError } = await supabase
          .from('subscriptions')
          .update({
            status: 'active',
            next_billing_date: data.next_billing_date || subscription.next_billing_date,
            payment_method_last4: data.card_last4 || subscription.payment_method_last4 || null,
            payment_method_brand: data.card_brand || subscription.payment_method_brand || null,
            metadata: {
              ...subscription.metadata,
              dime_card_token: data.card_token || subscription.metadata?.dime_card_token,
              card_request_token: data.card_request_token || subscription.metadata?.card_request_token,
              card_last4: data.card_last4 || subscription.metadata?.card_last4,
              card_brand: data.card_brand || subscription.metadata?.card_brand,
              card_expiry: data.card_expiry || subscription.metadata?.card_expiry,
              retry_count: 0,
              subscription_updated_at: new Date().toISOString()
            },
            updated_at: new Date().toISOString()
          })
          .eq('id', subscription.id);

        if (updateError) {
          console.error('❌ Error processing subscription update:', updateError);
        }

        await updateCompanyBillingState(subscription.company_id, 'ACTIVE', 'card');
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

          await updateCompanyBillingState(subscription.company_id, 'SUSPENDED');

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

          await updateCompanyBillingState(subscription.company_id, 'PAST_DUE');

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
