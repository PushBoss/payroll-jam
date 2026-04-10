import { supabase } from './supabaseClient';
import { Employee, User, LeaveRequest } from '../core/types';

type EmployeeSaveMode = 'insert' | 'update' | 'upsert';

const requireSupabase = () => {
  if (!supabase) throw new Error('Supabase client not initialized');
  return supabase;
};

const coerceFiniteNumber = (value: any, fallback = 0) => {
  const num = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(num) ? num : fallback;
};

const parseJsonArrayIfNeeded = (value: any): any[] | null => {
  if (Array.isArray(value)) return value;
  if (typeof value !== 'string') return null;
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
};

const normalizeCustomDeductions = (value: any) => {
  const arr = parseJsonArrayIfNeeded(value) ?? (Array.isArray(value) ? value : []);
  return arr
    .filter(Boolean)
    .map((raw: any) => {
      const periodType = raw?.periodType === 'TARGET_BALANCE' ? 'TARGET_BALANCE' : 'FIXED_TERM';
      return {
        id: String(raw?.id ?? `deduction_${Date.now()}`),
        name: String(raw?.name ?? ''),
        amount: coerceFiniteNumber(raw?.amount, 0),
        periodType,
        remainingTerm: raw?.remainingTerm === undefined ? undefined : coerceFiniteNumber(raw?.remainingTerm, 0),
        periodFrequency: raw?.periodFrequency,
        currentBalance: raw?.currentBalance === undefined ? undefined : coerceFiniteNumber(raw?.currentBalance, 0),
        targetBalance: raw?.targetBalance === undefined ? undefined : coerceFiniteNumber(raw?.targetBalance, 0)
      };
    })
    .filter((d: any) => d.name && coerceFiniteNumber(d.amount, 0) > 0);
};

const normalizeSimpleDeductions = (value: any) => {
  const arr = parseJsonArrayIfNeeded(value) ?? (Array.isArray(value) ? value : []);
  return arr
    .filter(Boolean)
    .map((raw: any) => ({
      id: String(raw?.id ?? `other_${Date.now()}`),
      name: String(raw?.name ?? ''),
      amount: coerceFiniteNumber(raw?.amount, 0)
    }))
    .filter((d: any) => d.name && coerceFiniteNumber(d.amount, 0) > 0);
};

const getCustomDeductionsFromRow = (row: any) => {
  if (!row) return [];
  if (row.deductions !== undefined && row.deductions !== null) return normalizeCustomDeductions(row.deductions);
  if (row.custom_deductions !== undefined && row.custom_deductions !== null) return normalizeCustomDeductions(row.custom_deductions);
  return [];
};

const getPayDataFromRow = (row: any) => {
  if (!row) return {};
  if (row.pay_data && typeof row.pay_data === 'object') return row.pay_data;
  return {
    grossSalary: row.gross_salary,
    hourlyRate: row.hourly_rate,
    payType: row.pay_type,
    payFrequency: row.pay_frequency
  };
};

const isSchemaMismatchError = (error: any) => {
  const message = `${error?.message || ''} ${error?.details || ''} ${error?.hint || ''}`.toLowerCase();
  const code = String(error?.code || '').toUpperCase();

  return code === 'PGRST204'
    || message.includes('column') && message.includes('does not exist')
    || message.includes('could not find the')
    || message.includes('schema cache');
};

const mutateEmployeeRow = async (
  client: ReturnType<typeof requireSupabase>,
  payload: Record<string, any>,
  companyId: string,
  mode: EmployeeSaveMode,
) => {
  switch (mode) {
    case 'insert':
      return client.from('employees').insert(payload);
    case 'update':
      return client
        .from('employees')
        .update(payload)
        .eq('id', payload.id)
        .eq('company_id', companyId);
    default:
      return client.from('employees').upsert(payload);
  }
};


export const EmployeeService = {
  // --- Users & Profiles ---
  
  getUserByEmail: async (email: string): Promise<User | null> => {
    if (!supabase) return null;
    const normalizedEmail = email.trim().toLowerCase();
    const { data, error } = await supabase
      .from('app_users')
      .select('*')
      .eq('email', normalizedEmail)
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

    const normalizedEmail = user.email.trim().toLowerCase();
    
    const preferences: any = {};
    if (user.onboardingToken) preferences.onboardingToken = user.onboardingToken;

    const { error } = await supabase
      .from('app_users')
      .upsert({
        id: user.id,
        auth_user_id: user.id,
        email: normalizedEmail,
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
    return (data || []).map((e: any) => {
      const payData = getPayDataFromRow(e);
      return ({
      id: e.id,
      firstName: e.first_name,
      lastName: e.last_name,
      email: e.email,
      trn: e.trn,
      nis: e.nis,
      employeeId: e.employee_number || e.employee_id || undefined,
      status: e.status,
      role: e.role,
      hireDate: e.hire_date,
      joiningDate: e.joining_date || undefined,
      jobTitle: e.job_title || undefined,
      department: e.department || undefined,
      phone: e.phone || undefined,
      address: e.address || undefined,
      emergencyContact: e.emergency_contact || undefined,

      grossSalary: payData?.grossSalary || 0,
      hourlyRate: payData?.hourlyRate,
      payType: payData?.payType || 'SALARIED',
      payFrequency: payData?.payFrequency || 'MONTHLY',

      bankDetails: e.bank_details || undefined,
      leaveBalance: e.leave_balance || undefined,
      allowances: e.allowances || [],
      customDeductions: getCustomDeductionsFromRow(e),

      pensionContributionRate: e.pension_contribution_rate || undefined,
      pensionProvider: e.pension_provider || undefined,

      terminationDetails: e.termination_details || undefined,
      onboardingToken: e.onboarding_token || undefined
    } as any);
    });
  },

  saveEmployee: async (emp: Employee, companyId: string, mode: EmployeeSaveMode = 'upsert') => {
    const client = requireSupabase();

    const payData = {
      grossSalary: emp.grossSalary,
      hourlyRate: emp.hourlyRate,
      payType: emp.payType,
      payFrequency: emp.payFrequency
    };

    const normalizedCustomDeductions = normalizeCustomDeductions(emp.customDeductions);
    const normalizedSimpleDeductions = normalizeSimpleDeductions(emp.deductions);
    const persistedDeductions = (normalizedCustomDeductions.length > 0)
      ? normalizedCustomDeductions
      : normalizedSimpleDeductions;

    const basePayload: Record<string, any> = {
        id: emp.id,
        company_id: companyId,
        first_name: emp.firstName,
        last_name: emp.lastName,
        email: emp.email,
        trn: emp.trn,
        nis: emp.nis,
      phone: emp.phone || null,
      address: emp.address || null,
      role: emp.role,
      status: emp.status,
      hire_date: emp.hireDate,
      joining_date: emp.joiningDate || emp.hireDate,
      job_title: emp.jobTitle || null,
      department: emp.department || null,
      emergency_contact: emp.emergencyContact || null,
      bank_details: emp.bankDetails || null,
      leave_balance: emp.leaveBalance || null,
      allowances: emp.allowances || [],
      termination_details: emp.terminationDetails || null,
      onboarding_token: emp.onboardingToken || null
    };

    const attemptLegacy = {
      ...basePayload,
      employee_id: emp.employeeId || null,
      gross_salary: emp.grossSalary,
      hourly_rate: emp.hourlyRate ?? null,
      pay_type: emp.payType,
      pay_frequency: emp.payFrequency,
      custom_deductions: persistedDeductions
    };

    const { error: legacyError } = await mutateEmployeeRow(client, attemptLegacy, companyId, mode);
    if (!legacyError) return;

    if (!isSchemaMismatchError(legacyError)) {
      throw legacyError;
    }

    const attemptNew = {
      ...basePayload,
      employee_number: emp.employeeId || null,
      pay_data: payData,
      deductions: persistedDeductions
    };

    const { error: newError } = await mutateEmployeeRow(client, attemptNew, companyId, mode);
    if (newError) throw newError;
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

    const payData = getPayDataFromRow(data);

    return {
      employee: {
        id: data.id,
        firstName: data.first_name,
        lastName: data.last_name,
        email: data.email,
        trn: data.trn || '',
        nis: data.nis || '',
        employeeId: data.employee_number || data.employee_id || undefined,
        status: data.status,
        role: data.role,
        hireDate: data.hire_date,
        jobTitle: data.job_title || undefined,
        department: data.department || undefined,
        phone: data.phone || undefined,
        address: data.address || undefined,
        emergencyContact: data.emergency_contact || undefined,
        grossSalary: payData?.grossSalary || 0,
        hourlyRate: payData?.hourlyRate,
        payType: payData?.payType || 'SALARIED',
        payFrequency: payData?.payFrequency || 'MONTHLY',
        bankDetails: data.bank_details || undefined,
        leaveBalance: data.leave_balance || undefined,
        allowances: data.allowances || [],
        customDeductions: getCustomDeductionsFromRow(data),
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
