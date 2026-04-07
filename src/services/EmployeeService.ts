import { supabase } from './supabaseClient';
import { Employee, User, LeaveRequest } from '../core/types';


export const EmployeeService = {
  // --- Users & Profiles ---
  
  getUserByEmail: async (email: string): Promise<User | null> => {
    if (!supabase) return null;
    const { data, error } = await supabase
      .from('app_users')
      .select('*')
      .eq('email', email)
      .maybeSingle();
    
    if (error || !data) return null;
    return {
      id: data.id,
      name: data.name,
      email: data.email,
      role: data.role as any,
      onboardingToken: data.onboarding_token
    } as any;
  },

  saveUser: async (user: User) => {
    if (!supabase) throw new Error("Supabase client not initialized");
    
    const preferences: any = {};
    if (user.onboardingToken) preferences.onboardingToken = user.onboardingToken;

    const { error } = await supabase
      .from('app_users')
      .upsert({
        id: user.id,
        auth_user_id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        company_id: user.companyId,
        is_onboarded: user.isOnboarded,
        avatar_url: user.avatarUrl || null,
        phone: user.phone || null,
        preferences: preferences
      });

    if (error) throw error;
  },

  getCompanyUsers: async (companyId: string): Promise<User[]> => {
    if (!supabase) return [];
    const { data, error } = await supabase
      .from('app_users')
      .select('*')
      .eq('company_id', companyId);

    if (error) return [];
    return (data || []).map((u: any) => ({
      id: u.id,
      name: u.name,
      email: u.email,
      role: u.role as any,
      companyId: u.company_id,
      isOnboarded: u.is_onboarded,
    }));
  },

  // --- Employees ---

  getEmployees: async (companyId: string): Promise<Employee[]> => {
    if (!supabase) return [];
    const { data, error } = await supabase
      .from('employees')
      .select('*')
      .eq('company_id', companyId);

    if (error) return [];
    return data.map((e: any) => ({
      ...e,
      firstName: e.first_name,
      lastName: e.last_name,
      grossSalary: e.gross_salary,
      payFrequency: e.pay_frequency as any,
      payType: e.pay_type as any,
      employeeId: e.employee_id,
      hireDate: e.hire_date,
      bankDetails: e.bank_details,
      customDeductions: e.custom_deductions || []
    } as any));
  },

  saveEmployee: async (emp: Employee, companyId: string) => {
    if (!supabase) return;
    const { error } = await supabase
      .from('employees')
      .upsert({
        id: emp.id,
        company_id: companyId,
        first_name: emp.firstName,
        last_name: emp.lastName,
        email: emp.email,
        trn: emp.trn,
        nis: emp.nis,
        gross_salary: emp.grossSalary,
        pay_type: emp.payType,
        pay_frequency: emp.payFrequency,
        role: emp.role,
        status: emp.status,
        hire_date: emp.hireDate,
        bank_details: emp.bankDetails,
        custom_deductions: emp.customDeductions
      });
    if (error) throw error;
  },

  deleteEmployee: async (employeeId: string, companyId: string) => {
    if (!supabase) return null;
    const { error } = await supabase
      .from('employees')
      .delete()
      .eq('id', employeeId)
      .eq('account_id', companyId);
    if (error) throw error;
  },

  getEmployeeByToken: async (token: string, email?: string): Promise<{ employee: Employee; companyName: string; companyId: string } | null> => {
    if (!supabase) return null;
    const query = supabase
      .from('employees')
      .select('*, companies(name)')
      .eq('onboarding_token', token);
    
    if (email) query.eq('email', email);
    
    const { data, error } = await query.maybeSingle();
    if (error || !data) return null;
    
    return {
      employee: {
        id: data.id,
        firstName: data.first_name,
        lastName: data.last_name,
        email: data.email,
        onboardingToken: data.onboarding_token
      } as any,
      companyName: (data.companies as any)?.name || 'Unknown',
      companyId: data.account_id
    };
  },

  // --- Leave & Docs ---

  getLeaveRequests: async (companyId: string): Promise<LeaveRequest[]> => {
    if (!supabase) return [];
    const { data, error } = await supabase
      .from('leave_requests')
      .select('*')
      .eq('company_id', companyId);
    if (error) return [];
    return data as any[];
  },

  saveLeaveRequest: async (req: LeaveRequest, companyId: string) => {
    if (!supabase) return;
    const { error } = await supabase
      .from('leave_requests')
      .upsert({ ...req, company_id: companyId });
    if (error) throw error;
  }
};
