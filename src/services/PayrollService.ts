import { supabase } from './supabaseClient';
import { PayRun, WeeklyTimesheet } from '../core/types';

const requireSupabase = () => {
  if (!supabase) {
    throw new Error('Supabase client not initialized. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY (or configure local overrides).');
  }
  return supabase;
};

export const PayrollService = {
  getPayRuns: async (companyId: string): Promise<PayRun[]> => {
    if (!supabase) return [];
    const { data, error } = await supabase
      .from('pay_runs')
      .select('*')
      .eq('company_id', companyId)
      .order('period_start', { ascending: false });

    if (error) return [];
    return data.map((r: any) => ({
      id: r.id,
      periodStart: r.period_start,
      periodEnd: r.period_end,
      payDate: r.pay_date,
      payFrequency: r.pay_frequency,
      status: r.status,
      totalGross: r.total_gross,
      totalNet: r.total_net,
      lineItems: r.line_items || []
    }));
  },

  savePayRun: async (run: PayRun, companyId: string) => {
    const client = requireSupabase();
    const { error } = await client
      .from('pay_runs')
      .upsert({
        id: run.id,
        company_id: companyId,
        period_start: run.periodStart,
        period_end: run.periodEnd,
        pay_date: run.payDate,
        pay_frequency: run.payFrequency,
        status: run.status,
        total_gross: run.totalGross,
        total_net: run.totalNet,
        line_items: run.lineItems
      });
    if (error) throw error;
  },

  deletePayRun: async (runId: string, companyId: string) => {
    const client = requireSupabase();
    const { error } = await client
      .from('pay_runs')
      .delete()
      .eq('id', runId)
      .eq('company_id', companyId);
    
    return !error;
  },

  getTimesheets: async (companyId: string): Promise<WeeklyTimesheet[]> => {
    if (!supabase) return [];
    const { data, error } = await supabase
      .from('timesheets')
      .select('*')
      .eq('company_id', companyId);
    if (error) return [];
    return data as any[];
  }
};
