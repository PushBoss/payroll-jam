import { supabase } from './supabaseClient';

type CardUpdateContext = {
  companyId?: string;
  subscription?: {
    id?: string;
    dimepaySubscriptionId?: string | null;
    planName?: string | null;
    planType?: string | null;
    amount?: number | null;
    currency?: string | null;
  } | null;
};

export const BillingService = {

  getSubscription: async (companyId: string) => {
    if (!supabase) return null;
    const { data, error } = await supabase
      .from('subscriptions')
      .select('*')
      .eq('company_id', companyId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error || !data) return null;
    return {
      id: data.id,
      companyId: data.company_id,
      planName: data.plan_name,
      planType: data.plan_type,
      status: data.status,
      billingFrequency: data.billing_frequency,
      amount: Number(data.amount) || 0,
      currency: data.currency,
      startDate: data.start_date,
      endDate: data.end_date,
      nextBillingDate: data.next_billing_date,
      accessUntil: data.access_until || data.next_billing_date,
      autoRenew: data.auto_renew,
      dimepaySubscriptionId: data.dime_subscription_id || data.dimepay_subscription_id,
      dimepayCustomerId: data.dime_customer_id || data.dimepay_customer_id,
      dimeCardToken: data.dime_card_token || data.metadata?.dime_card_token,
      paymentMethodLast4: data.card_last_four || data.payment_method_last4 || data.metadata?.card_last4,
      paymentMethodBrand: data.card_brand || data.payment_method_brand || data.metadata?.card_brand,
      metadata: data.metadata || {}
    };
  },

  initiateCardUpdate: async (userId: string, context: CardUpdateContext = {}) => {
    if (!supabase) throw new Error('Supabase client unavailable');

    let companyId = context.companyId;
    let subscription = context.subscription || null;

    if (!companyId) {
      const { data: user, error: userError } = await supabase
        .from('app_users')
        .select('id, company_id')
        .eq('id', userId)
        .maybeSingle();

      if (userError || !user?.company_id) {
        throw new Error('Unable to resolve user company for billing update');
      }

      companyId = user.company_id;
    }

    if (!subscription && companyId) {
      subscription = await BillingService.getSubscription(companyId);
    }

    const response = await fetch('/api/billing/dimepay/card-request', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        flow: subscription?.dimepaySubscriptionId ? 'subscription_update' : 'card_update',
        user_id: userId,
        company_id: companyId,
        local_subscription_id: subscription?.id,
        subscription_id: subscription?.dimepaySubscriptionId,
        plan_name: subscription?.planName,
        plan_type: subscription?.planType,
        amount: subscription?.amount,
        currency: subscription?.currency || 'JMD',
        redirect_url: `${window.location.origin}/api/billing/dimepay/card-return`
      })
    });

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data?.error || 'Failed to initiate card update');
    }

    return data;
  },

  getPaymentHistory: async (companyId: string, limit = 50) => {
    if (!supabase) return [];
    const { data, error } = await supabase
      .from('payment_history')
      .select('*')
      .eq('company_id', companyId)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) return [];
    return (data || []).map((p: any) => ({
      id: p.id,
      invoiceNumber: p.invoice_number,
      amount: p.amount,
      currency: p.currency,
      status: p.status,
      paymentDate: p.payment_date || p.created_at,
      description: p.description,
      paymentMethod: p.payment_method,
      transactionId: p.transaction_id
    }));
  },

  getAllSubscriptions: async () => {
    if (!supabase) return [];
    const { data, error } = await supabase
      .from('subscriptions')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) return [];
    return data || [];
  },

  getAllPayments: async (limit = 1000) => {
    if (!supabase) return [];
    const { data, error } = await supabase
      .from('payment_history')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit);
    if (error) return [];
    return data || [];
  }
};
