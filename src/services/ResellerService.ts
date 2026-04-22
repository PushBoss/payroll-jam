import { supabase } from './supabaseClient';
import { ResellerClient } from '../core/types';
import { normalizePlanToFrontend } from '../utils/planNames';


const mapResellerClient = (row: any): ResellerClient => {
  const company = row.client_company || row.client_company_id || row.companies || row.company || {};
  return {
    id: company?.id || row.client_company_id,
    companyName: company?.name || company?.companyName || 'Unknown Company',
    contactName: company?.email || row.contact_name || '',
    email: company?.email || row.email || '',
    plan: normalizePlanToFrontend(company?.plan || row.plan || 'Free') as any,
    employeeCount: company?.employees?.[0]?.count || company?.settings?.employeeCount || row.employeeCount || 0,
    status: row.status || company?.status || 'ACTIVE',
    mrr: (row.monthly_base_fee || 0) + ((row.per_employee_fee || 0) * (company?.settings?.employeeCount || row.employeeCount || 0)),
    createdAt: row.created_at,
  } as ResellerClient;
};

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

  saveResellerInvite: async (
    resellerId: string,
    clientEmail: string,
    inviteToken?: string,
    contactName?: string,
    companyName?: string
  ): Promise<boolean> => {
    if (!supabase) return false;
    const payload: Record<string, any> = {
      reseller_id: resellerId,
      invite_email: clientEmail.toLowerCase(),
      client_email: clientEmail.toLowerCase(),
      invite_token: inviteToken || null,
      contact_name: contactName || null,
      company_name: companyName || null,
      status: 'PENDING',
      created_at: new Date().toISOString(),
    };

    const { error } = await supabase
      .from('reseller_invites')
      .upsert(payload, { onConflict: 'reseller_id,invite_email' });

    if (!error) return true;

    console.warn('Primary reseller invite upsert failed, retrying with fallback columns:', error);
    const { error: fallbackError } = await supabase
      .from('reseller_invites')
      .upsert({
        reseller_id: resellerId,
        client_email: clientEmail.toLowerCase(),
        company_name: companyName || null,
        status: 'PENDING',
        created_at: new Date().toISOString(),
      }, { onConflict: 'reseller_id,client_email' });

    return !fallbackError;
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

  getResellerClients: async (resellerId: string): Promise<ResellerClient[]> => {
    if (!supabase) return [];
    try {
      const { data, error } = await supabase
        .from('reseller_clients')
        .select(`
          *,
          client_company:companies!reseller_clients_client_company_id_fkey (
            id,
            name,
            email,
            plan,
            status,
            settings,
            employees(count)
          )
        `)
        .eq('reseller_id', resellerId)
        .order('created_at', { ascending: false });

      if (error || !data) {
        console.error('Error fetching reseller clients:', error);
        return [];
      }

      return data.map(mapResellerClient);
    } catch (error) {
      console.error('Error fetching reseller clients:', error);
      return [];
    }
  },

  removeResellerClient: async (resellerId: string, clientCompanyId: string): Promise<boolean> => {
    if (!supabase) return false;
    try {
      const { data: rpcResult, error: rpcError } = await supabase.rpc('remove_reseller_client_secure', {
        p_reseller_id: resellerId,
        p_client_company_id: clientCompanyId,
      });

      if (!rpcError && rpcResult === true) {
        return true;
      }

      const { error } = await supabase
        .from('reseller_clients')
        .delete()
        .eq('reseller_id', resellerId)
        .eq('client_company_id', clientCompanyId);

      if (error) {
        console.error('Error deleting reseller client relationship:', error);
        return false;
      }

      await supabase.from('companies').update({ reseller_id: null }).eq('id', clientCompanyId).eq('reseller_id', resellerId);
      return true;
    } catch (error) {
      console.error('Exception in removeResellerClient:', error);
      return false;
    }
  },

  cancelResellerInvite: async (inviteId: string): Promise<boolean> => {
    if (!supabase) return false;

    try {
      const { data: rpcResult, error: rpcError } = await supabase.rpc('cancel_reseller_invite_secure', {
        p_invite_id: inviteId,
      });

      if (!rpcError && rpcResult === true) {
        return true;
      }

      const { error } = await supabase.from('reseller_invites').delete().eq('id', inviteId);
      if (error) {
        console.error('Error canceling reseller invite:', error);
        return false;
      }

      return true;
    } catch (error) {
      console.error('Exception in cancelResellerInvite:', error);
      return false;
    }
  },

  saveResellerClientWithServiceRole: async (
    resellerId: string,
    clientCompanyId: string,
    data?: {
      status?: 'ACTIVE' | 'SUSPENDED' | 'TERMINATED';
      accessLevel?: 'VIEW_ONLY' | 'MANAGE' | 'FULL';
      monthlyBaseFee?: number;
      perEmployeeFee?: number;
      discountRate?: number;
    }
  ): Promise<boolean> => {
    if (!supabase) return false;

    try {
      const { data: result, error } = await supabase.functions.invoke('admin-handler', {
        body: {
          action: 'save-reseller-client',
          payload: { resellerId, clientCompanyId, data }
        }
      });

      if (error) {
        console.warn('Edge Function reseller client save failed, falling back:', error);
        return ResellerService.saveResellerClient(resellerId, clientCompanyId, data);
      }

      return result?.success === true;
    } catch (error) {
      console.warn('Edge Function reseller client save failed, falling back:', error);
      return ResellerService.saveResellerClient(resellerId, clientCompanyId, data);
    }
  },

  getComplianceOverview: async (resellerId: string): Promise<Record<string, any>> => {
    if (!supabase) return {};

    try {
      const { data: clients } = await supabase
        .from('reseller_clients')
        .select('client_company_id')
        .eq('reseller_id', resellerId);

      if (!clients?.length) return {};

      const clientIds = clients.map((client: any) => client.client_company_id);
      const threeMonthsAgo = new Date();
      threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);

      const { data: runs, error } = await supabase
        .from('pay_runs')
        .select('company_id, period_end, status, pay_date')
        .in('company_id', clientIds)
        .eq('status', 'FINALIZED')
        .gte('period_end', threeMonthsAgo.toISOString().split('T')[0])
        .order('period_end', { ascending: false });

      if (error) {
        console.error('Error fetching compliance runs:', error);
        return {};
      }

      const overview: Record<string, any> = {};
      (runs || []).forEach((run: any) => {
        if (!overview[run.company_id]) {
          overview[run.company_id] = {
            lastPayRunDate: run.pay_date || run.period_end,
            periodEnd: run.period_end,
            status: 'FILED',
          };
        }
      });

      return overview;
    } catch (error) {
      console.error('Error fetching compliance overview:', error);
      return {};
    }
  },
};
