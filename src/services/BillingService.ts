import { supabase } from './supabaseClient';

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
      amount: data.amount,
      currency: data.currency,
      nextBillingDate: data.next_billing_date,
      dimepaySubscriptionId: data.dimepay_subscription_id,
      dimepayCustomerId: data.dimepay_customer_id,
      metadata: data.metadata || {}
    };
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
