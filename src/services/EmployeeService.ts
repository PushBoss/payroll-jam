import { supabase } from './supabaseClient';
import { Employee, User, LeaveRequest, DbAppUserRow, DbEmployeeRow, toRole, toPayType, toPayFrequency, toEmployeeStatus, CustomDeduction, Deduction } from '../core/types';

type EmployeeSaveMode = 'insert' | 'update' | 'upsert';
type EmployeeSaveOptions = {
  useAdminHandler?: boolean;
  _trace?: { correlationId: string };
};

const requireSupabase = () => {
  if (!supabase) throw new Error('Supabase client not initialized');
  return supabase;
};

const coerceFiniteNumber = (value: unknown, fallback = 0) => {
  const num = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(num) ? num : fallback;
};

const parseJsonArrayIfNeeded = (value: unknown): unknown[] | null => {
  if (Array.isArray(value)) return value;
  if (typeof value !== 'string') return null;
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
};

const normalizeCustomDeductions = (value: unknown): CustomDeduction[] => {
  const arr = parseJsonArrayIfNeeded(value) ?? (Array.isArray(value) ? value : []);
  return arr
    .filter(Boolean)
    .map((raw: Record<string, unknown>) => {
      const periodType = raw?.periodType === 'TARGET_BALANCE' ? 'TARGET_BALANCE' as const : 'FIXED_TERM' as const;
      return {
        id: String(raw?.id ?? `deduction_${Date.now()}`),
        name: String(raw?.name ?? ''),
        amount: coerceFiniteNumber(raw?.amount, 0),
        periodType,
        remainingTerm: raw?.remainingTerm === undefined ? undefined : coerceFiniteNumber(raw?.remainingTerm, 0),
        periodFrequency: raw?.periodFrequency as CustomDeduction['periodFrequency'],
        currentBalance: raw?.currentBalance === undefined ? undefined : coerceFiniteNumber(raw?.currentBalance, 0),
        targetBalance: raw?.targetBalance === undefined ? undefined : coerceFiniteNumber(raw?.targetBalance, 0)
      };
    })
    .filter((d) => d.name && coerceFiniteNumber(d.amount, 0) > 0);
};

const normalizeSimpleDeductions = (value: unknown): Deduction[] => {
  const arr = parseJsonArrayIfNeeded(value) ?? (Array.isArray(value) ? value : []);
  return arr
    .filter(Boolean)
    .map((raw: Record<string, unknown>) => ({
      id: String(raw?.id ?? `other_${Date.now()}`),
      name: String(raw?.name ?? ''),
      amount: coerceFiniteNumber(raw?.amount, 0)
    }))
    .filter((d) => d.name && coerceFiniteNumber(d.amount, 0) > 0);
};

const getCustomDeductionsFromRow = (row: DbEmployeeRow | null): CustomDeduction[] => {
  if (!row) return [];
  if (row.deductions !== undefined && row.deductions !== null) return normalizeCustomDeductions(row.deductions);
  if (row.custom_deductions !== undefined && row.custom_deductions !== null) return normalizeCustomDeductions(row.custom_deductions);
  return [];
};

const getPayDataFromRow = (row: DbEmployeeRow | null) => {
  if (!row) return {};
  if (row.pay_data && typeof row.pay_data === 'object') return row.pay_data;
  return {
    grossSalary: row.gross_salary,
    hourlyRate: row.hourly_rate,
    pieceRateAmount: row.pay_data && typeof row.pay_data === 'object' ? (row.pay_data as any).pieceRateAmount : undefined,
    payType: row.pay_type,
    payFrequency: row.pay_frequency
  };
};

const isSchemaMismatchError = (error: { message?: string; details?: string; hint?: string; code?: string }) => {
  const message = `${error?.message || ''} ${error?.details || ''} ${error?.hint || ''}`.toLowerCase();
  const code = String(error?.code || '').toUpperCase();

  return code === 'PGRST204'
    || message.includes('column') && message.includes('does not exist')
    || message.includes('could not find the')
    || message.includes('schema cache');
};

const getMissingColumnFromError = (error: { message?: string; details?: string; hint?: string }) => {
  const message = `${error?.message || ''} ${error?.details || ''}`.toLowerCase();
  
  const matchPostgrest = message.match(/could not find the ['"]?([^'"]+)['"]?/i);
  if (matchPostgrest?.[1]) return matchPostgrest[1];

  const matchPostgres = message.match(/column ['"]?([^'"]+)['"]? (?:of relation|does not exist|in)/i);
  if (matchPostgres?.[1]) return matchPostgres[1];

  console.error('getMissingColumnFromError: Failed to parse missing column from:', message, error);
  return null;
};

const mutateEmployeeRow = async (
  client: ReturnType<typeof requireSupabase>,
  payload: Record<string, any>,
  companyId: string,
  employeeId: string,
  mode: EmployeeSaveMode,
) => {
  switch (mode) {
    case 'insert':
      return client.from('employees').insert(payload);
    case 'update':
      return client
        .from('employees')
        .update(payload)
        .eq('id', employeeId)
        .eq('company_id', companyId);
    default:
      return client.from('employees').upsert(payload);
  }
};

const mutateEmployeeRowWithSchemaFallback = async (
  client: ReturnType<typeof requireSupabase>,
  payload: Record<string, any>,
  companyId: string,
  employeeId: string,
  mode: EmployeeSaveMode,
) => {
  const nextPayload = { ...payload };

  for (let attempt = 0; attempt < 8; attempt += 1) {
    const result = await mutateEmployeeRow(client, nextPayload, companyId, employeeId, mode);
    if (!result.error) return result;

    if (!isSchemaMismatchError(result.error)) {
      return result;
    }

    const missingColumn = getMissingColumnFromError(result.error);
    if (!missingColumn || !(missingColumn in nextPayload)) {
      console.error('Fallback loop aborting on matching schema error:', { missingColumn, error: result.error, payloadKeys: Object.keys(nextPayload) });
      return result;
    }

    delete nextPayload[missingColumn];
  }

  const finalResult = await mutateEmployeeRow(client, nextPayload, companyId, employeeId, mode);
  if (finalResult.error) {
    console.error('Final attempt failed:', finalResult.error);
  }
  return finalResult;
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
    const row = data as DbAppUserRow;
    return {
      id: row.id,
      name: row.name,
      email: row.email,
      role: toRole(row.role),
      companyId: row.company_id ?? undefined,
      isOnboarded: row.is_onboarded,
      avatarUrl: row.avatar_url ?? undefined,
      phone: row.phone ?? undefined,
      onboardingToken: row.onboarding_token ?? (typeof row.preferences?.onboardingToken === 'string' ? row.preferences.onboardingToken : undefined)
    };
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
    return (data || []).map((u: DbAppUserRow) => ({
      id: u.id,
      name: u.name,
      email: u.email,
      role: toRole(u.role),
      companyId: u.company_id ?? undefined,
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
    return (data || []).map((e: DbEmployeeRow) => {
      const payData = getPayDataFromRow(e);
      return {
      id: e.id,
      companyId: e.company_id,
      firstName: e.first_name,
      lastName: e.last_name,
      email: e.email,
      trn: e.trn,
      nis: e.nis,
      employeeId: e.employee_number || e.employee_id || undefined,
      status: toEmployeeStatus(e.status),
      role: toRole(e.role),
      hireDate: e.hire_date,
      joiningDate: e.joining_date || undefined,
      jobTitle: e.job_title || undefined,
      department: e.department || undefined,
      phone: e.phone || undefined,
      address: e.address || undefined,
      emergencyContact: e.emergency_contact || undefined,

      grossSalary: payData?.grossSalary || 0,
      hourlyRate: payData?.hourlyRate,
      pieceRateAmount: payData?.pieceRateAmount,
      payType: toPayType(payData?.payType),
      payFrequency: toPayFrequency(payData?.payFrequency),

      bankDetails: e.bank_details || undefined,
      leaveBalance: e.leave_balance || undefined,
      allowances: e.allowances || [],
      customDeductions: getCustomDeductionsFromRow(e),

      pensionContributionRate: e.pension_contribution_rate || undefined,
      pensionProvider: e.pension_provider || undefined,

      terminationDetails: e.termination_details || undefined,
      onboardingToken: e.onboarding_token || undefined
    } as Employee;
    });
  },

  saveEmployee: async (
    emp: Employee,
    companyId: string,
    mode: EmployeeSaveMode = 'upsert',
    options: EmployeeSaveOptions = { useAdminHandler: true }
  ) => {
    const client = requireSupabase();

    if (options.useAdminHandler) {
      const { data, error } = await client.functions.invoke('admin-handler', {
        body: {
          action: 'save-employee-for-company',
          payload: {
            companyId,
            employee: emp,
            mode,
          },
        },
        ...(options._trace ? { headers: { 'x-correlation-id': options._trace.correlationId } } : {}),
      });

      if (error) {
        // supabase-js wraps non-2xx responses as FunctionsHttpError.
        // The actual error message is in the response body JSON.
        let errorMessage = 'Failed to save employee';
        try {
          if (error.context?.body) {
            const reader = error.context.body.getReader();
            const { value } = await reader.read();
            const text = new TextDecoder().decode(value);
            const parsed = JSON.parse(text);
            errorMessage = parsed?.error || errorMessage;
          }
        } catch {
          // Fallback: use the raw error message
          errorMessage = error.message || errorMessage;
        }
        console.error('Admin handler employee save failed:', errorMessage);
        throw new Error(errorMessage);
      }
      
      if (data?.error) {
        console.error('Admin handler returned error in data:', data.error);
        throw new Error(data.error);
      }

      return;
    }

    const payData = {
      grossSalary: emp.grossSalary,
      hourlyRate: emp.hourlyRate,
      pieceRateAmount: emp.payType === 'PIECE_RATE' ? emp.pieceRateAmount : undefined,
      payType: emp.payType,
      payFrequency: emp.payFrequency
    };

    const normalizedCustomDeductions = normalizeCustomDeductions(emp.customDeductions);
    const normalizedSimpleDeductions = normalizeSimpleDeductions(emp.deductions);
    const persistedDeductions = (normalizedCustomDeductions.length > 0)
      ? normalizedCustomDeductions
      : normalizedSimpleDeductions;

    const basePayload: Record<string, any> = {
      ...(mode === 'update' ? {} : { id: emp.id, company_id: companyId }),
      first_name: emp.firstName,
      last_name: emp.lastName,
      email: emp.email,
      trn: emp.trn,
      nis: emp.nis,
      phone: emp.phone || null,
      address: emp.address || null,
      role: emp.role,
      status: toEmployeeStatus(emp.status),
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

    const comprehensivePayload: Record<string, any> = {
      ...basePayload,
      // Legacy individual columns
      gross_salary: emp.grossSalary,
      hourly_rate: emp.hourlyRate ?? null,
      pay_type: emp.payType,
      pay_frequency: emp.payFrequency,
      // JSONB unified columns
      pay_data: payData,
      // Handle the deduction column renaming
      custom_deductions: persistedDeductions,
      deductions: persistedDeductions,
      // Handle the employee ID column renaming
      employee_id: emp.employeeId || null,
      employee_number: emp.employeeId || null
    };

    const { error } = await mutateEmployeeRowWithSchemaFallback(client, comprehensivePayload, companyId, emp.id, mode);
    if (error) {
      if (error.code === '42501') {
        console.warn('RLS policy violation. Retrying employee save via admin-handler...');
        const { error: adminError } = await client.functions.invoke('admin-handler', {
          body: {
            action: 'save-employee-for-company',
            payload: {
              companyId,
              employee: emp,
              mode,
            },
          },
          ...(options._trace ? { headers: { 'x-correlation-id': options._trace.correlationId } } : {}),
        });
        if (!adminError) {
          console.log('Employee saved successfully via admin-handler fallback.');
          return;
        }
        console.error('Admin-handler fallback also failed:', adminError);
      }
      console.error('Final Supabase Employee Save Error:', error);
      throw error;
    }
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

    try {
      // Route through admin-handler to bypass RLS. New employees clicking
      // invite links don't have a role or auth_user_id linkage yet, so
      // direct client queries against the employees table return 0 rows.
      const { data: result, error: invokeError } = await requireSupabase().functions.invoke('admin-handler', {
        body: {
          action: 'get-employee-by-token',
          payload: { token, email },
        },
      });

      if (invokeError || !result?.employee) return null;

      const row = result.employee as DbEmployeeRow;
      const payData = getPayDataFromRow(row);

      return {
        employee: {
          id: row.id,
          companyId: row.company_id,
          firstName: row.first_name,
          lastName: row.last_name,
          email: row.email,
          trn: row.trn || '',
          nis: row.nis || '',
          employeeId: row.employee_number || row.employee_id || undefined,
          status: toEmployeeStatus(row.status),
          role: toRole(row.role),
          hireDate: row.hire_date,
          jobTitle: row.job_title || undefined,
          department: row.department || undefined,
          phone: row.phone || undefined,
          address: row.address || undefined,
          emergencyContact: row.emergency_contact || undefined,
          grossSalary: payData?.grossSalary || 0,
          hourlyRate: payData?.hourlyRate,
          payType: toPayType(payData?.payType),
          payFrequency: toPayFrequency(payData?.payFrequency),
          bankDetails: row.bank_details || undefined,
          leaveBalance: row.leave_balance || undefined,
          allowances: row.allowances || [],
          customDeductions: getCustomDeductionsFromRow(row),
          terminationDetails: row.termination_details || undefined,
          onboardingToken: row.onboarding_token || undefined
        } as Employee,
        companyName: row.companies?.name || 'Unknown',
        companyId: row.company_id
      };
    } catch (err) {
      console.error('Error in getEmployeeByToken:', err);
      return null;
    }
  },

  completeEmployeeInvite: async (input: { token: string; email: string; password: string }): Promise<{ user: User; companyId: string }> => {
    if (!supabase) throw new Error('Supabase client not initialized');

    const normalizedEmail = input.email.trim().toLowerCase();
    const { data: result, error } = await requireSupabase().functions.invoke('admin-handler', {
      body: {
        action: 'complete-employee-invite',
        payload: {
          token: input.token,
          email: normalizedEmail,
          password: input.password,
        },
      },
    });

    if (error) {
      let message = error.message || 'Employee invite setup failed.';
      const context = (error as any).context;
      if (context && typeof context.clone === 'function') {
        try {
          const body = await context.clone().json();
          message = body?.error || body?.message || message;
        } catch {
          // Keep the Supabase function error message if the response is not JSON.
        }
      }
      throw new Error(message);
    }
    if (!result?.success || !result?.user || !result?.companyId) {
      throw new Error(result?.error || 'Employee invite setup failed.');
    }

    const row = result.user as DbAppUserRow;
    return {
      user: {
        id: row.id,
        name: row.name,
        email: row.email,
        role: toRole(row.role),
        companyId: row.company_id ?? undefined,
        isOnboarded: row.is_onboarded,
        avatarUrl: row.avatar_url ?? undefined,
        phone: row.phone ?? undefined,
        onboardingToken: row.onboarding_token ?? undefined,
      },
      companyId: result.companyId,
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
    return (data || []) as LeaveRequest[];
  },

  saveLeaveRequest: async (req: LeaveRequest, companyId: string) => {
    const client = requireSupabase();

    const { error } = await client.functions.invoke('admin-handler', {
      body: {
        action: 'save-leave-request',
        payload: {
          companyId,
          leaveRequest: req,
        },
      },
    });

    if (error) {
      console.error('Error saving leave request via admin-handler:', error);
      throw error;
    }
  }
};
