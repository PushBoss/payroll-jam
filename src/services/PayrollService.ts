import { supabase } from './supabaseClient';
import { PayRun, WeeklyTimesheet } from '../core/types';

const isYearMonth = (value: string) => /^\d{4}-\d{2}$/.test(value);
const isDate = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value);

const toDbPeriodStart = (value: string) => {
  if (isYearMonth(value)) return `${value}-01`;
  return value;
};

const toDbPeriodEnd = (value: string) => {
  if (!isYearMonth(value)) return value;
  const [yearStr, monthStr] = value.split('-');
  const year = Number(yearStr);
  const month = Number(monthStr);
  const lastDay = new Date(year, month, 0).getDate();
  return `${value}-${String(lastDay).padStart(2, '0')}`;
};

const normalizeDbPeriodToApp = (start: any, end: any): { periodStart: string; periodEnd: string } => {
  const startStr = typeof start === 'string' ? start : '';
  const endStr = typeof end === 'string' ? end : '';

  if (isDate(startStr) && isDate(endStr)) {
    const ym = startStr.substring(0, 7);
    const startDay = startStr.substring(8, 10);
    const endDay = endStr.substring(8, 10);
    const [yearStr, monthStr] = ym.split('-');
    const year = Number(yearStr);
    const month = Number(monthStr);
    const lastDay = String(new Date(year, month, 0).getDate()).padStart(2, '0');

    // If DB stored a full month as date range, present it as YYYY-MM in the app.
    if (startDay === '01' && endStr.startsWith(ym) && endDay === lastDay) {
      return { periodStart: ym, periodEnd: ym };
    }
  }

  return {
    periodStart: startStr || String(start ?? ''),
    periodEnd: endStr || String(end ?? '')
  };
};

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
      ...normalizeDbPeriodToApp(r.period_start, r.period_end),
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
    const payFrequency = run.payFrequency || 'MONTHLY';

    // Supabase schema expects DATE strings in `period_start` / `period_end`.
    // The app often uses YYYY-MM as a period label, so normalize on write.
    const periodStart = toDbPeriodStart(run.periodStart);
    const periodEnd = toDbPeriodEnd(run.periodEnd);

    const { error } = await client
      .from('pay_runs')
      .upsert({
        id: run.id,
        company_id: companyId,
        period_start: periodStart,
        period_end: periodEnd,
        pay_date: run.payDate,
        pay_frequency: payFrequency,
        status: run.status,
        total_gross: run.totalGross,
        total_net: run.totalNet,
        employee_count: run.lineItems?.length || 0,
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
