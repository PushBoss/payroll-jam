import { supabase } from './supabaseClient';
import { CompanySettings, Employee, PayRun, LeaveRequest, User, toPlanLabel, toRole, toPayType, toPayFrequency } from '../core/types';
import { getEffectiveSubscriptionStatus, toBillingGift } from '../utils/billingGift';

const normalizeDbPeriodToApp = (start: string, end: string): { periodStart: string; periodEnd: string } => {
  const isDate = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value);
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
    if (startDay === '01' && endStr.startsWith(ym) && endDay === lastDay) {
      return { periodStart: ym, periodEnd: ym };
    }
  }

  return {
    periodStart: startStr || String(start ?? ''),
    periodEnd: endStr || String(end ?? '')
  };
};

export const AdminService = {
  getCompanyContext: async (companyId: string): Promise<{
    company: CompanySettings | null,
    employees: Employee[],
    payRuns: PayRun[],
    leaveRequests: LeaveRequest[],
    users: User[]
  }> => {
    try {
      if (!supabase) throw new Error('Supabase client not initialized');
      const { data, error } = await supabase.functions.invoke('admin-handler', {
        body: { action: 'get-company-context', payload: { companyId } }
      });

      if (error || !data) throw error || new Error('No data returned');

      // Map Company
      const dbCompany = data.company;
      const settings = dbCompany?.settings || {};
      const billingGift = toBillingGift(settings.billingGift);
      const company: CompanySettings | null = dbCompany ? {
        id: dbCompany.id,
        name: dbCompany.name,
        trn: dbCompany.trn,
        address: dbCompany.address,
        phone: settings.phone || '',
        bankName: settings.bankName || 'NCB',
        accountNumber: settings.accountNumber || '',
        branchCode: settings.branchCode || '',
        plan: toPlanLabel(dbCompany.plan),
        subscriptionStatus: getEffectiveSubscriptionStatus({
          subscriptionStatus: dbCompany.status || 'ACTIVE',
          billingGift,
        }),
        policies: settings.policies,
        taxConfig: settings.taxConfig,
        departments: dbCompany.departments || [],
        designations: dbCompany.designations || [],
        billingGift,
      } as CompanySettings : null;

      // Map Employees
      const employees: Employee[] = (data.employees || []).map((e: Record<string, unknown>) => ({
        ...e,
        firstName: e.first_name,
        lastName: e.last_name,
        grossSalary: (e.pay_data as Record<string, unknown>)?.grossSalary ?? e.gross_salary,
        hourlyRate: (e.pay_data as Record<string, unknown>)?.hourlyRate ?? e.hourly_rate,
        payFrequency: toPayFrequency(((e.pay_data as Record<string, unknown>)?.payFrequency ?? e.pay_frequency) as string),
        payType: toPayType(((e.pay_data as Record<string, unknown>)?.payType ?? e.pay_type) as string),
        employeeId: e.employee_number || e.employee_id,
        hireDate: e.hire_date,
        bankDetails: e.bank_details,
        allowances: (e.allowances as unknown[]) || [],
        customDeductions: (e.deductions as unknown[]) || (e.custom_deductions as unknown[]) || []
      } as Employee));

      // Map Pay Runs
      const payRuns: PayRun[] = (data.payRuns || []).map((r: Record<string, unknown>) => ({
        id: r.id as string,
        ...normalizeDbPeriodToApp(r.period_start as string, r.period_end as string),
        payDate: r.pay_date as string,
        status: r.status as PayRun['status'],
        totalGross: r.total_gross as number,
        totalNet: r.total_net as number,
        lineItems: (r.line_items as unknown[]) || []
      } as PayRun));

      // Map Users
      const users: User[] = (data.users || []).map((u: Record<string, unknown>) => ({
        id: u.id as string,
        name: u.name as string,
        email: u.email as string,
        role: toRole(u.role as string),
        companyId: u.company_id as string | undefined,
        isOnboarded: u.is_onboarded as boolean,
      }));

      return {
        company,
        employees,
        payRuns,
        leaveRequests: data.leaveRequests || [],
        users
      };
    } catch (error) {
      console.error('Error fetching company context via AdminService:', error);
      throw error;
    }
  }
};
