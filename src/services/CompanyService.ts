import { supabase } from './supabaseClient';
import { CompanySettings, GlobalConfig } from '../core/types';


export const CompanyService = {
  getCompany: async (companyId: string): Promise<CompanySettings | null> => {
    if (!supabase) return null;
    const { data, error } = await supabase
      .from('companies')
      .select('*')
      .eq('id', companyId)
      .maybeSingle();

    if (error || !data) return null;

    const settings = data.settings || {};
    return {
      id: data.id,
      name: data.name,
      trn: data.trn,
      address: data.address,
      phone: settings.phone || '',
      bankName: settings.bankName || 'NCB',
      accountNumber: settings.accountNumber || '',
      branchCode: settings.branchCode || '',
      plan: data.plan as any,
      subscriptionStatus: data.status || 'ACTIVE',
      paymentMethod: settings.paymentMethod,
      policies: settings.policies,
      taxConfig: settings.taxConfig
    } as any;
  },

  saveCompany: async (companyId: string, settings: CompanySettings) => {
    if (!supabase) return null;
    const { error } = await supabase
      .from('companies')
      .upsert({
        id: companyId,
        name: settings.name,
        trn: settings.trn,
        address: settings.address,
        settings: {
          phone: settings.phone,
          bankName: settings.bankName,
          accountNumber: settings.accountNumber,
          branchCode: settings.branchCode,
          paymentMethod: settings.paymentMethod,
          policies: settings.policies
        },
        status: settings.subscriptionStatus || 'ACTIVE',
        plan: settings.plan
      });
    if (error) throw error;
  },

  getGlobalConfig: async (): Promise<GlobalConfig | null> => {
    if (!supabase) return null;
    const { data, error } = await supabase
      .from('global_config')
      .select('config')
      .eq('id', 'platform')
      .maybeSingle();

    if (error || !data) return null;
    return data.config as GlobalConfig;
  },

  acceptResellerInvite: async (token: string, companyId: string) => {
    if (!supabase) return false;
    const { error } = await supabase
      .from('reseller_clients')
      .update({ status: 'ACTIVE' })
      .eq('token', token)
      .eq('client_company_id', companyId);
    
    return !error;
  }
};
