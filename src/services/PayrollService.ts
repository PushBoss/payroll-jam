import { supabase } from './supabaseClient';
import { CustomDeduction, PayRun, PayrollYtdSummary, WeeklyTimesheet, DbPayRunRow, toPayFrequency } from '../core/types';

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

const normalizeDbPeriodToApp = (start: string, end: string): { periodStart: string; periodEnd: string } => {
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

const invokeAdminHandler = async <T,>(payload: { action: string; payload: Record<string, unknown> }): Promise<T> => {
  const client = requireSupabase();
  const { data, error } = await client.functions.invoke('admin-handler', {
    body: payload,
  });

  if (error) {
    throw error;
  }

  return data as T;
};

const PAY_RUN_SUMMARY_SELECT = 'id,period_start,period_end,pay_date,pay_frequency,status,total_gross,total_net,employee_count';

interface GetPayRunsOptions {
  includeLineItems?: boolean;
}

export interface AttendanceBadge {
  id?: string;
  locationId: string;
  locationName?: string;
  passCode: string;
  expiresAt: string;
  codeVersion?: number;
}

export interface AttendanceClockPayload {
  companyId: string;
  employeeId: string;
  method: 'QR' | 'PASS_CODE';
  qrPayload?: string | null;
  locationId?: string;
  passCode?: string;
  position: {
    latitude: number;
    longitude: number;
    accuracy?: number;
  };
}

export interface AttendanceClockResult {
  success: boolean;
  action: 'clock_in' | 'clock_out';
  timesheet: WeeklyTimesheet;
}

const mapTimesheetRow = (row: Record<string, any>): WeeklyTimesheet => ({
  id: String(row.id || ''),
  employeeId: String(row.employee_id || row.employeeId || ''),
  employeeName: String(row.employee_name || row.employeeName || ''),
  weekStartDate: String(row.week_start_date || row.weekStartDate || ''),
  weekEndDate: String(row.week_end_date || row.weekEndDate || ''),
  status: (row.status || 'DRAFT') as WeeklyTimesheet['status'],
  totalRegularHours: Number(row.total_regular_hours ?? row.totalRegularHours ?? 0),
  totalOvertimeHours: Number(row.total_overtime_hours ?? row.totalOvertimeHours ?? 0),
  entries: Array.isArray(row.entries) ? row.entries : [],
  source: (row.source || 'MANUAL') as WeeklyTimesheet['source'],
  companyId: row.company_id || row.companyId || undefined,
  locationId: row.location_id || row.locationId || undefined,
  locationName: row.location_name || row.locationName || undefined,
  clockInAt: row.clock_in_at || row.clockInAt || undefined,
});

const toTimesheetPayload = (timesheet: WeeklyTimesheet, companyId: string) => ({
  id: timesheet.id,
  company_id: companyId,
  employee_id: timesheet.employeeId,
  employee_name: timesheet.employeeName,
  week_start_date: timesheet.weekStartDate,
  week_end_date: timesheet.weekEndDate,
  status: timesheet.status,
  total_regular_hours: timesheet.totalRegularHours,
  total_overtime_hours: timesheet.totalOvertimeHours,
  entries: timesheet.entries,
  source: timesheet.source || 'MANUAL',
  location_id: timesheet.locationId || null,
  location_name: timesheet.locationName || null,
  clock_in_at: timesheet.clockInAt || null,
  submitted_at: timesheet.status === 'SUBMITTED' ? new Date().toISOString() : null,
});

export const PayrollService = {
  getPayRuns: async (companyId: string, options: GetPayRunsOptions = {}): Promise<PayRun[]> => {
    if (!supabase) return [];
    const includeLineItems = options.includeLineItems ?? true;
    const { data, error } = await (supabase
      .from('pay_runs')
      .select(includeLineItems ? '*' : PAY_RUN_SUMMARY_SELECT)
      .eq('company_id', companyId)
      .order('period_start', { ascending: false }) as any);

    if (error) return [];
    return (data || []).map((r: DbPayRunRow) => ({
      id: r.id,
      ...normalizeDbPeriodToApp(r.period_start, r.period_end),
      payDate: r.pay_date,
      payFrequency: toPayFrequency(r.pay_frequency),
      status: r.status as PayRun['status'],
      totalGross: r.total_gross,
      totalNet: r.total_net,
      lineItems: r.line_items || []
    }));
  },

  savePayRun: async (run: PayRun, companyId: string) => {
    const payFrequency = run.payFrequency || 'MONTHLY';

    // Supabase schema expects DATE strings in `period_start` / `period_end`.
    // The app often uses YYYY-MM as a period label, so normalize on write.
    const periodStart = toDbPeriodStart(run.periodStart);
    const periodEnd = toDbPeriodEnd(run.periodEnd);

    await invokeAdminHandler<{ success: boolean; payRun?: DbPayRunRow }>({
      action: 'save-pay-run',
      payload: {
        companyId,
        payRun: {
          id: run.id,
          period_start: periodStart,
          period_end: periodEnd,
          pay_date: run.payDate,
          pay_frequency: payFrequency,
          status: run.status,
          total_gross: run.totalGross,
          total_net: run.totalNet,
          employee_count: run.lineItems?.length || 0,
          line_items: run.lineItems,
        },
      },
    });
  },

  bulkUpdateEmployeeDeductions: async (
    companyId: string,
    updates: { id: string; customDeductions: CustomDeduction[] }[]
  ): Promise<number> => {
    if (updates.length === 0) return 0;

    const result = await invokeAdminHandler<{ success: boolean; updatedCount?: number }>({
      action: 'bulk-update-employee-deductions',
      payload: {
        companyId,
        updates,
      },
    });

    return result.updatedCount ?? updates.length;
  },

  getPayrollYtdSummary: async (companyId: string, year: number): Promise<PayrollYtdSummary[]> => {
    const result = await invokeAdminHandler<{ success: boolean; summaries?: Record<string, unknown>[] }>({
      action: 'get-payroll-ytd-summary',
      payload: {
        companyId,
        year,
      },
    });

    return (result.summaries || []).map((row) => ({
      employeeId: String(row.employee_id || row.employeeId || ''),
      ytdGross: Number(row.ytd_gross ?? row.ytdGross ?? 0),
      ytdNIS: Number(row.ytd_nis ?? row.ytdNIS ?? 0),
      ytdTaxPaid: Number(row.ytd_tax_paid ?? row.ytdTaxPaid ?? 0),
      ytdPension: Number(row.ytd_pension ?? row.ytdPension ?? 0),
      ytdStatutoryIncome: Number(row.ytd_statutory_income ?? row.ytdStatutoryIncome ?? 0),
    })).filter((summary) => summary.employeeId);
  },

  deletePayRun: async (runId: string, companyId: string) => {
    const data = await invokeAdminHandler<{ success?: boolean }>({
      action: 'delete-pay-run',
      payload: {
        companyId,
        runId,
      },
    });

    return data?.success ?? true;
  },

  getTimesheets: async (companyId: string): Promise<WeeklyTimesheet[]> => {
    if (!supabase) return [];
    const { data, error } = await supabase
      .from('timesheets')
      .select('*')
      .eq('company_id', companyId)
      .order('week_start_date', { ascending: false });
    if (error) return [];
    return (data || []).map(mapTimesheetRow).filter((timesheet) => timesheet.id);
  },

  saveTimesheet: async (timesheet: WeeklyTimesheet, companyId: string): Promise<WeeklyTimesheet> => {
    const client = requireSupabase();
    const payload = toTimesheetPayload(timesheet, companyId);

    const { data, error } = await client
      .from('timesheets')
      .upsert(payload)
      .select('*')
      .single();

    if (error) throw error;
    return mapTimesheetRow(data || payload);
  },

  getAttendanceBadge: async (companyId: string, locationId: string): Promise<AttendanceBadge> => {
    const result = await invokeAdminHandler<{ success: boolean; badge?: AttendanceBadge }>({
      action: 'get-attendance-badge',
      payload: {
        companyId,
        locationId,
      },
    });

    if (!result.badge) throw new Error('Attendance badge could not be generated.');
    return result.badge;
  },

  clockAttendance: async (payload: AttendanceClockPayload): Promise<AttendanceClockResult> => {
    const result = await invokeAdminHandler<AttendanceClockResult>({
      action: 'clock-attendance',
      payload: payload as unknown as Record<string, unknown>,
    });

    return {
      ...result,
      timesheet: mapTimesheetRow(result.timesheet as unknown as Record<string, any>),
    };
  },
};
