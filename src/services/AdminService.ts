import { supabase } from './supabaseClient';
import { CompanySettings, Employee, PayRun, LeaveRequest, User } from '../core/types';

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
      const company: CompanySettings | null = dbCompany ? {
        id: dbCompany.id,
        name: dbCompany.name,
        trn: dbCompany.trn,
        address: dbCompany.address,
        phone: settings.phone || '',
        bankName: settings.bankName || 'NCB',
        accountNumber: settings.accountNumber || '',
        branchCode: settings.branchCode || '',
        plan: dbCompany.plan as any,
        subscriptionStatus: dbCompany.status || 'ACTIVE',
        policies: settings.policies,
        taxConfig: settings.taxConfig,
        departments: dbCompany.departments || [],
        designations: dbCompany.designations || []
      } as any : null;

      // Map Employees
      const employees = (data.employees || []).map((e: any) => ({
        ...e,
        firstName: e.first_name,
        lastName: e.last_name,
        grossSalary: e.pay_data?.grossSalary ?? e.gross_salary,
        hourlyRate: e.pay_data?.hourlyRate ?? e.hourly_rate,
        payFrequency: (e.pay_data?.payFrequency ?? e.pay_frequency) as any,
        payType: (e.pay_data?.payType ?? e.pay_type) as any,
        employeeId: e.employee_number || e.employee_id,
        hireDate: e.hire_date,
        bankDetails: e.bank_details,
        allowances: e.allowances || [],
        customDeductions: e.deductions || e.custom_deductions || []
      }));

      // Map Pay Runs
      const payRuns = (data.payRuns || []).map((r: any) => ({
        id: r.id,
        periodStart: r.period_start,
        periodEnd: r.period_end,
        payDate: r.pay_date,
        status: r.status,
        totalGross: r.total_gross,
        totalNet: r.total_net,
        lineItems: r.line_items || []
      }));

      // Map Users
      const users = (data.users || []).map((u: any) => ({
        id: u.id,
        name: u.name,
        email: u.email,
        role: u.role as any,
        companyId: u.company_id,
        isOnboarded: u.is_onboarded,
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
