import { supabase } from './supabaseClient';

export const ResellerService = {

  getResellerInvites: async (resellerId: string): Promise<any[]> => {
    if (!supabase) return [];
    const { data, error } = await supabase
      .from('reseller_invites')
      .select('*')
      .eq('reseller_id', resellerId)
      .order('created_at', { ascending: false });
    if (error) return [];
    return data || [];
  },

  saveResellerInvite: async (resellerId: string, clientEmail: string, companyName?: string): Promise<boolean> => {
    if (!supabase) return false;
    const { error } = await supabase
      .from('reseller_invites')
      .upsert({
        reseller_id: resellerId,
        client_email: clientEmail.toLowerCase(),
        company_name: companyName || null,
        status: 'PENDING',
        created_at: new Date().toISOString()
      }, { onConflict: 'reseller_id,client_email' });
    return !error;
  },

  saveResellerClient: async (
    resellerId: string,
    clientCompanyId: string,
    data?: { status?: string; accessLevel?: string; monthlyBaseFee?: number; perEmployeeFee?: number; discountRate?: number }
  ): Promise<boolean> => {
    if (!supabase) return false;
    const { error } = await supabase
      .from('reseller_clients')
      .upsert({
        reseller_id: resellerId,
        client_company_id: clientCompanyId,
        status: data?.status || 'ACTIVE',
        access_level: data?.accessLevel || 'FULL',
        monthly_base_fee: data?.monthlyBaseFee ?? 0,
        per_employee_fee: data?.perEmployeeFee ?? 0,
        discount_rate: data?.discountRate ?? 0
      }, { onConflict: 'reseller_id,client_company_id' });
    return !error;
  },

  getResellerClients: async (resellerId: string): Promise<any[]> => {
    if (!supabase) return [];
    const { data, error } = await supabase
      .from('reseller_clients')
      .select('*, companies:client_company_id(id, name, plan, status)')
      .eq('reseller_id', resellerId)
      .eq('status', 'ACTIVE');
    if (error) return [];
    return data || [];
  },

  removeResellerClient: async (resellerId: string, clientCompanyId: string): Promise<boolean> => {
    if (!supabase) return false;
    const { error } = await supabase
      .from('reseller_clients')
      .update({ status: 'REMOVED' })
      .eq('reseller_id', resellerId)
      .eq('client_company_id', clientCompanyId);
    return !error;
  }
};
