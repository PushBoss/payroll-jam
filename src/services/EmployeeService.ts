import { supabase } from './supabaseClient';
import { Employee, User, LeaveRequest } from '../core/types';


const requireSupabase = () => {
  if (!supabase) throw new Error('Supabase client not initialized');
  return supabase;
};


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
      companyId: data.company_id,
      isOnboarded: data.is_onboarded,
      avatarUrl: data.avatar_url,
      phone: data.phone,
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
    const { data, error } = await requireSupabase()
      .from('employees')
      .select('*')
      .eq('company_id', companyId);

    if (error) throw error;
    return (data || []).map((e: any) => ({
      id: e.id,
      firstName: e.first_name,
      lastName: e.last_name,
      email: e.email,
      trn: e.trn,
      nis: e.nis,
      employeeId: e.employee_number || undefined,
      status: e.status,
      role: e.role,
      hireDate: e.hire_date,
      joiningDate: e.joining_date || undefined,
      jobTitle: e.job_title || undefined,
      department: e.department || undefined,
      phone: e.phone || undefined,
      address: e.address || undefined,
      emergencyContact: e.emergency_contact || undefined,

      grossSalary: e.pay_data?.grossSalary || 0,
      hourlyRate: e.pay_data?.hourlyRate,
      payType: e.pay_data?.payType || 'SALARIED',
      payFrequency: e.pay_data?.payFrequency || 'MONTHLY',

      bankDetails: e.bank_details || undefined,
      leaveBalance: e.leave_balance || undefined,
      allowances: e.allowances || [],
      customDeductions: e.deductions || [],

      pensionContributionRate: e.pension_contribution_rate || undefined,
      pensionProvider: e.pension_provider || undefined,

      terminationDetails: e.termination_details || undefined,
      onboardingToken: e.onboarding_token || undefined
    } as any));
  },

  saveEmployee: async (emp: Employee, companyId: string) => {
    const client = requireSupabase();

    const payData = {
      grossSalary: emp.grossSalary,
      hourlyRate: emp.hourlyRate,
      payType: emp.payType,
      payFrequency: emp.payFrequency
    };

    const { error } = await client
      .from('employees')
      .upsert({
        id: emp.id,
        company_id: companyId,
        first_name: emp.firstName,
        last_name: emp.lastName,
        email: emp.email,
        trn: emp.trn,
        nis: emp.nis,
        employee_number: emp.employeeId || null,
        phone: emp.phone || null,
        address: emp.address || null,
        role: emp.role,
        status: emp.status,
        hire_date: emp.hireDate,
        job_title: emp.jobTitle || null,
        department: emp.department || null,
        pay_data: payData,
        bank_details: emp.bankDetails || null,
        leave_balance: emp.leaveBalance || null,
        allowances: emp.allowances || [],
        deductions: emp.customDeductions || [],
        termination_details: emp.terminationDetails || null,
        onboarding_token: emp.onboardingToken || null
      });
    if (error) throw error;
  },

  deleteEmployee: async (employeeId: string, companyId: string) => {
    if (!supabase) return null;
    const { error } = await requireSupabase()
      .from('employees')
      .delete()
      .eq('id', employeeId)
      .eq('company_id', companyId);
    if (error) throw error;
  },

  getEmployeeByToken: async (token: string, email?: string): Promise<{ employee: Employee; companyName: string; companyId: string } | null> => {
    if (!supabase) return null;
    let query = requireSupabase()
      .from('employees')
      .select('*, companies(name)')
      .eq('onboarding_token', token);

    if (email) query = query.eq('email', email);

    const { data, error } = await query.maybeSingle();
    if (error || !data) return null;

    return {
      employee: {
        id: data.id,
        firstName: data.first_name,
        lastName: data.last_name,
        email: data.email,
        trn: data.trn || '',
        nis: data.nis || '',
        employeeId: data.employee_number || undefined,
        status: data.status,
        role: data.role,
        hireDate: data.hire_date,
        jobTitle: data.job_title || undefined,
        department: data.department || undefined,
        phone: data.phone || undefined,
        address: data.address || undefined,
        emergencyContact: data.emergency_contact || undefined,
        grossSalary: data.pay_data?.grossSalary || 0,
        hourlyRate: data.pay_data?.hourlyRate,
        payType: data.pay_data?.payType || 'SALARIED',
        payFrequency: data.pay_data?.payFrequency || 'MONTHLY',
        bankDetails: data.bank_details || undefined,
        leaveBalance: data.leave_balance || undefined,
        allowances: data.allowances || [],
        customDeductions: data.deductions || [],
        terminationDetails: data.termination_details || undefined,
        onboardingToken: data.onboarding_token || undefined
      } as any,
      companyName: (data.companies as any)?.name || 'Unknown',
      companyId: data.company_id
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
