import { supabase } from './supabaseClient';
import { CompanySettings, GlobalConfig, ResellerClient, DbCompanyRow, toPlanLabel, toCompanyStatus } from '../core/types';
import { normalizePlanToDatabase, normalizePlanToFrontend } from '../utils/planNames';
import { getEffectiveSubscriptionStatus, isBillingGiftActive, toBillingGift } from '../utils/billingGift';

const parseEmployeeLimit = (limit?: string): number | null => {
  if (!limit || limit === 'Unlimited') return 999999;
  const match = limit.match(/\d+/);
  return match ? Number(match[0]) : null;
};


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
    const billingGift = toBillingGift(settings.billingGift);
    return {
      id: data.id,
      name: data.name,
      trn: data.trn,
      address: data.address,
      phone: settings.phone || '',
      bankName: settings.bankName || 'NCB',
      accountNumber: settings.accountNumber || '',
      branchCode: settings.branchCode || '',
      logoUrl: settings.logoUrl || '',
      billingCycle: data.billing_cycle === 'ANNUAL' ? 'ANNUAL' : 'MONTHLY',
      employeeLimit: data.employee_limit && data.employee_limit < 999999 ? `${data.employee_limit} Employees` : 'Unlimited',
      plan: toPlanLabel(normalizePlanToFrontend(data.plan)),
      subscriptionStatus: getEffectiveSubscriptionStatus({
        subscriptionStatus: data.status || 'ACTIVE',
        billingGift,
      }),
      paymentMethod: settings.paymentMethod,
      resellerId: data.reseller_id,
      policies: settings.policies,
      reseller_defaults: settings.reseller_defaults,
      taxConfig: settings.taxConfig,
      departments: settings.departments || data.departments || [],
      designations: settings.designations || data.designations || [],
      locations: settings.locations || [],
      billingGift,
    };
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

    const updatedSettings = {
      ...existingSettings,
      email: settings.email ?? existingSettings.email,
      phone: settings.phone,
      bankName: settings.bankName,
      accountNumber: settings.accountNumber,
      branchCode: settings.branchCode,
      logoUrl: settings.logoUrl ?? existingSettings.logoUrl,
      paymentMethod: settings.paymentMethod,
      city: settings.city ?? existingSettings.city,
      parish: settings.parish ?? existingSettings.parish,
      signupDetails: settings.signupDetails ?? existingSettings.signupDetails,
      payFrequency: settings.payFrequency ?? existingSettings.payFrequency,
      defaultPayDate: settings.defaultPayDate ?? existingSettings.defaultPayDate,
      policies: settings.policies ?? existingSettings.policies,
      reseller_defaults: settings.reseller_defaults ?? existingSettings.reseller_defaults,
      taxConfig: settings.taxConfig ?? existingSettings.taxConfig,
      departments: settings.departments ?? existingSettings.departments ?? [],
      designations: settings.designations ?? existingSettings.designations ?? [],
      locations: settings.locations ?? existingSettings.locations ?? []
    };

    const payload = {
      companyId,
      name: settings.name,
      trn: settings.trn,
      address: settings.address,
      settings: updatedSettings,
      status: (settings as any).status || settings.subscriptionStatus || 'ACTIVE',
      plan: normalizePlanToDatabase(settings.plan),
      billingCycle: settings.billingCycle || 'MONTHLY',
      employeeLimit: parseEmployeeLimit(settings.employeeLimit)
    };

    // Prefer admin-handler to bypass RLS constraints. Fall back to the direct
    // update path so settings remain editable if the frontend deploys before
    // the matching edge function version is redeployed.
    const { data, error } = await supabase.functions.invoke('admin-handler', {
      body: {
        action: 'update-company',
        payload
      }
    });

    if (!error && data?.company) {
      return data.company;
    }

    console.warn('Admin-handler company update failed; falling back to direct update:', error || data);

    const { data: fallbackData, error: fallbackError } = await supabase
      .from('companies')
      .update({
        name: settings.name,
        trn: settings.trn,
        address: settings.address,
        settings: updatedSettings,
        status: (settings as any).status || settings.subscriptionStatus || 'ACTIVE',
        plan: normalizePlanToDatabase(settings.plan),
        billing_cycle: settings.billingCycle || 'MONTHLY',
        employee_limit: parseEmployeeLimit(settings.employeeLimit)
      })
      .eq('id', companyId)
      .select('*')
      .single();

    if (fallbackError) throw fallbackError;
    return fallbackData;
  },

  savePaymentGatewaySettings: async (companyId: string, paymentConfig: Record<string, unknown>) => {
    if (!supabase) return;

    const { data: company, error: fetchError } = await supabase
      .from('companies')
      .select('settings')
      .eq('id', companyId)
      .single();

    if (fetchError) {
      console.error('Error fetching company for payment settings:', fetchError);
      return;
    }

    const { error } = await supabase
      .from('companies')
      .update({
        settings: {
          ...(company?.settings || {}),
          paymentGateway: paymentConfig,
        },
      })
      .eq('id', companyId);

    if (error) {
      console.error('Error saving payment gateway settings:', error);
    }
  },

  getAllCompanies: async (): Promise<ResellerClient[]> => {
    if (!supabase) return [];

    const { data, error } = await supabase
      .from('companies')
      .select('*, employees(status)');
    if (error || !data) {
      console.error('Error fetching companies:', error);
      return [];
    }

    return data.map((company: DbCompanyRow) => {
      const companyWithEmployees = company as DbCompanyRow & { employees?: Array<{ status?: string | null }> };
      const settings = (company.settings || {}) as Record<string, unknown>;
      const activeEmployeeCount = Array.isArray(companyWithEmployees.employees)
        ? companyWithEmployees.employees.filter(employee => String(employee.status || '').toUpperCase() === 'ACTIVE').length
        : ((settings.employeeCount as number) || 0);
      const billingGift = toBillingGift(settings.billingGift);
      return {
      id: company.id,
      companyName: company.name,
      contactName: (settings.contactName as string) || 'Admin',
      email: (settings.email as string) || '',
      employeeCount: activeEmployeeCount,
      plan: toPlanLabel(normalizePlanToFrontend(company.plan || 'Free')),
      status: toCompanyStatus(company.status) as ResellerClient['status'],
      billingGift,
      hasActiveBillingGift: isBillingGiftActive(billingGift),
      mrr: (settings.mrr as number) || 0,
    };
    });
  },

  updateCompanyStatus: async (companyId: string, status: 'ACTIVE' | 'PAST_DUE' | 'SUSPENDED' | 'PENDING_PAYMENT') => {
    if (!supabase) return;

    const { error } = await supabase.from('companies').update({ status }).eq('id', companyId);
    if (error) throw error;
  },

  deleteCompany: async (companyId: string, confirmationName?: string) => {
    if (!supabase) return false;

    const { data, error } = await supabase.functions.invoke('admin-handler', {
      body: {
        action: 'delete-company-deep',
        payload: {
          companyId,
          confirmationName,
        },
      },
    });

    if (error) {
      console.error('Error deep deleting company:', error);
      return false;
    }

    return Boolean(data?.success);
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
          monthly_signup_goal: config.monthlySignupGoal || 10,
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

      await Promise.all((companies || []).map((company: { id: string; settings?: Record<string, unknown> }) => {
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
    try {
      const { data, error } = await supabase.rpc('accept_reseller_invite', {
        p_invite_token: token,
        p_company_id: companyId,
      });
      if (error) {
        console.error('Failed to accept reseller invite:', error);
        return false;
      }
      return data === true;
    } catch (e) {
      console.error('Exception in acceptResellerInvite:', e);
      return false;
    }
  }
};
