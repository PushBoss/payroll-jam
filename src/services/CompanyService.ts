import { supabase } from './supabaseClient';
import { CompanySettings, GlobalConfig } from '../core/types';
import { normalizePlanToDatabase, normalizePlanToFrontend } from '../utils/planNames';


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
      plan: normalizePlanToFrontend(data.plan) as any,
      subscriptionStatus: data.status || 'ACTIVE',
      paymentMethod: settings.paymentMethod,
      resellerId: data.reseller_id,
      policies: settings.policies,
      reseller_defaults: settings.reseller_defaults,
      taxConfig: settings.taxConfig
    } as any;
  },

  getCompanyById: async (companyId: string): Promise<CompanySettings | null> => {
    return CompanyService.getCompany(companyId);
  },

  saveCompany: async (companyId: string, settings: CompanySettings) => {
    if (!supabase) return null;

    const { data: existingCompany } = await supabase
      .from('companies')
      .select('settings')
      .eq('id', companyId)
      .maybeSingle();

    const existingSettings = existingCompany?.settings || {};

    const { error } = await supabase
      .from('companies')
      .upsert({
        id: companyId,
        name: settings.name,
        trn: settings.trn,
        address: settings.address,
        settings: {
          ...existingSettings,
          phone: settings.phone,
          bankName: settings.bankName,
          accountNumber: settings.accountNumber,
          branchCode: settings.branchCode,
          paymentMethod: settings.paymentMethod,
          payFrequency: settings.payFrequency ?? existingSettings.payFrequency,
          defaultPayDate: settings.defaultPayDate ?? existingSettings.defaultPayDate,
          policies: settings.policies ?? existingSettings.policies,
          reseller_defaults: settings.reseller_defaults ?? existingSettings.reseller_defaults,
          taxConfig: settings.taxConfig ?? existingSettings.taxConfig
        },
        status: settings.subscriptionStatus || 'ACTIVE',
        plan: normalizePlanToDatabase(settings.plan)
      });
    if (error) throw error;
  },

  getGlobalConfig: async (): Promise<GlobalConfig | null> => {
    if (!supabase) return null;
    try {
      const { data, error } = await supabase
        .from('global_config')
        .select('config')
        .eq('id', 'platform')
        .maybeSingle();

      if (!error && data) {
        return data.config as GlobalConfig;
      }

      const { data: publicData, error: publicError } = await supabase
        .from('public_settings')
        .select('config')
        .eq('id', 'platform')
        .maybeSingle();

      if (!publicError && publicData) {
        return publicData.config as GlobalConfig;
      }

      const { data: companyData, error: companyError } = await supabase
        .from('companies')
        .select('settings')
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle();

      if (companyError || !companyData) return null;
      return companyData.settings?.globalConfig as GlobalConfig;
    } catch {
      return null;
    }
  },

  saveGlobalConfig: async (config: GlobalConfig): Promise<boolean> => {
    const client = supabase;
    if (!client) return false;

    try {
      const { error } = await client
        .from('global_config')
        .upsert({
          id: 'platform',
          config,
          updated_at: new Date().toISOString()
        });

      if (!error) {
        return true;
      }

      const { data: companies, error: fetchError } = await client
        .from('companies')
        .select('id, settings');

      if (fetchError) {
        return false;
      }

      await Promise.all((companies || []).map((company: any) => {
        const currentSettings = company.settings || {};
        return client
          .from('companies')
          .update({
            settings: {
              ...currentSettings,
              globalConfig: config
            }
          })
          .eq('id', company.id);
      }));

      return true;
    } catch {
      return false;
    }
  },

  getPaymentGatewaySettings: async (companyId: string) => {
    if (!supabase || !companyId) return null;

    try {
      const { data, error } = await supabase
        .from('companies')
        .select('settings')
        .eq('id', companyId)
        .maybeSingle();

      if (error || !data) return null;
      return data.settings?.paymentGateway || null;
    } catch {
      return null;
    }
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
