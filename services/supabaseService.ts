import { supabase } from './supabaseClient';
import { generateUUID } from '../utils/uuid';
import { 
  Employee, 
  PayRun, 
  CompanySettings, 
  LeaveRequest, 
  AuditLogEntry, 
  ResellerClient, 
  WeeklyTimesheet,
  User,
  DocumentRequest,
  ExpertReferral,
  DocumentTemplate,
  GlobalConfig
} from '../types';

export const supabaseService = {
  
  // --- Users (Auth) ---

  getUserByEmail: async (email: string): Promise<User | null> => {
    if (!supabase) return null;
    try {
      const { data, error } = await supabase
        .from('app_users')
        .select('*')
        .eq('email', email)
        .maybeSingle();

      if (error) {
          console.error("Error fetching user:", error);
          return null;
      }
      if (!data) return null;

      return {
        id: data.id,
        name: data.name,
        email: data.email,
        role: data.role as any,
        companyId: data.company_id,
        isOnboarded: data.is_onboarded,
        avatarUrl: data.avatar_url || undefined,
        phone: data.phone || undefined,
        onboardingToken: data.preferences?.onboardingToken || undefined
      };
    } catch (e) {
      console.error("Supabase connection error:", e);
      return null;
    }
  },

  // Get company by email (finds company through user email)
  getCompanyByEmail: async (email: string): Promise<CompanySettings | null> => {
    if (!supabase) return null;
    try {
      // First find user by email
      const { data: user, error: userError } = await supabase
        .from('app_users')
        .select('company_id')
        .eq('email', email)
        .maybeSingle();

      if (userError || !user || !user.company_id) {
        return null;
      }

      // Then get company
      const { data: company, error: companyError } = await supabase
        .from('companies')
        .select('*')
        .eq('id', user.company_id)
        .maybeSingle();

      if (companyError || !company) {
        return null;
      }

      return {
        id: company.id, // Include company ID
        name: company.name,
        trn: company.trn || '',
        address: company.address || '',
        phone: company.phone || '',
        bankName: company.settings?.bankName || '',
        accountNumber: company.settings?.accountNumber || '',
        branchCode: company.settings?.branchCode || '',
        plan: company.plan as any,
        subscriptionStatus: company.status === 'ACTIVE' ? 'ACTIVE' : 'SUSPENDED' as any
      };
    } catch (e) {
      console.error("Error fetching company by email:", e);
      return null;
    }
  },

  saveUser: async (user: User) => {
    if (!supabase) {
      console.error("❌ Supabase client not available");
      throw new Error("Supabase client not initialized");
    }
    
    console.log("💾 Saving user to Supabase:", { id: user.id, email: user.email, companyId: user.companyId });
    
    // Prepare preferences JSONB with onboardingToken if present
    const preferences: any = {};
    if (user.onboardingToken) {
      preferences.onboardingToken = user.onboardingToken;
    }
    
    // Check if user exists by ID or email
    const { data: existing } = await supabase
      .from('app_users')
      .select('id, preferences')
      .or(`id.eq.${user.id},email.eq.${user.email}`)
      .maybeSingle();
    
    if (existing) {
      // Merge existing preferences with new ones
      const existingPrefs = existing.preferences || {};
      const mergedPrefs = { ...existingPrefs, ...preferences };
      
      // Update existing user (use the existing ID if different from the provided one)
      const updateId = existing.id;
      const { data, error } = await supabase
        .from('app_users')
        .update({
          id: user.id, // Update to new auth ID if changed
          name: user.name,
          role: user.role,
          company_id: user.companyId,
          is_onboarded: user.isOnboarded,
          avatar_url: user.avatarUrl || null,
          phone: user.phone || null,
          preferences: mergedPrefs
        })
        .eq('id', updateId)
        .select();
      
      if (error) {
        console.error("❌ Error updating user:", error);
        throw error;
      }
      console.log("✅ User updated successfully:", data);
    } else {
      // Insert new user
      console.log("📝 Inserting new user into app_users table...");
      const { data, error } = await supabase
        .from('app_users')
        .upsert({
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          company_id: user.companyId,
          is_onboarded: user.isOnboarded,
          avatar_url: user.avatarUrl || null,
          phone: user.phone || null,
          preferences: preferences
        }, {
          onConflict: 'id',
          ignoreDuplicates: false
        })
        .select();
      
      if (error) {
        console.error("❌ Error inserting user into app_users:", error);
        console.error("Error details:", {
          message: error.message,
          code: error.code,
          details: error.details,
          hint: error.hint
        });
        throw error;
      }
      console.log("✅ User created successfully in app_users table:", data);
    }
  },

  // --- Companies (Tenants) ---
  
  getCompany: async (companyId: string): Promise<CompanySettings | null> => {
    if (!supabase) return null;
    const { data, error } = await supabase
      .from('companies')
      .select('*')
      .eq('id', companyId)
      .single();
    
    if (error || !data) return null;

    // Map database fields + JSON settings to App types
    const settings = data.settings || {};
    
    // Map database plan format back to app format
    const mapPlanFromDbFormat = (dbPlan: string | undefined): string => {
      if (!dbPlan) return 'Free';
      const planMap: Record<string, string> = {
        'Free': 'Free',
        'Starter': 'Starter',
        'Professional': 'Pro',
        'Enterprise': 'Enterprise'
      };
      return planMap[dbPlan] || 'Free';
    };

    return {
      name: data.name,
      trn: data.trn,
      address: data.address,
      phone: settings.phone || '',
      bankName: settings.bankName || 'NCB',
      accountNumber: settings.accountNumber || '',
      branchCode: settings.branchCode || '',
      payFrequency: settings.payFrequency || 'Monthly',
      defaultPayDate: settings.defaultPayDate || '',
      subscriptionStatus: data.status || 'ACTIVE',
      plan: mapPlanFromDbFormat(data.plan) as any
    };
  },

  saveCompany: async (companyId: string, settings: CompanySettings) => {
    if (!supabase) return null;
    
    // Map plan names to match database constraint: ('Free', 'Starter', 'Professional', 'Enterprise')
    const mapPlanToDbFormat = (plan: string | undefined): string => {
      if (!plan) return 'Free';
      const planMap: Record<string, string> = {
        'Free': 'Free',
        'Starter': 'Starter',
        'Pro': 'Professional',
        'Professional': 'Professional',
        'Reseller': 'Enterprise', // Map Reseller to Enterprise for now
        'Enterprise': 'Enterprise'
      };
      return planMap[plan] || 'Free';
    };
    
    // Pack extra fields into settings JSONB
    const settingsJson = {
      phone: settings.phone,
      bankName: settings.bankName,
      accountNumber: settings.accountNumber,
      branchCode: settings.branchCode,
      payFrequency: settings.payFrequency,
      defaultPayDate: settings.defaultPayDate
    };

    const dbPlan = mapPlanToDbFormat(settings.plan);
    
    const { data, error } = await supabase
      .from('companies')
      .upsert({
        id: companyId,
        name: settings.name,
        trn: settings.trn,
        address: settings.address,
        settings: settingsJson,
        status: settings.subscriptionStatus,
        plan: dbPlan // Map to database format
      }, {
        onConflict: 'id'
      })
      .select()
      .single();

    if (error) {
      console.error("Error saving company:", error);
      return null;
    }
    
    return data;
  },

  // Save payment gateway settings to company settings JSONB
  savePaymentGatewaySettings: async (companyId: string, paymentConfig: any) => {
    if (!supabase) return;
    try {
      // Get current company settings
      const { data: company, error: fetchError } = await supabase
        .from('companies')
        .select('settings')
        .eq('id', companyId)
        .single();

      if (fetchError) {
        console.error("Error fetching company for payment settings:", fetchError);
        return;
      }

      const currentSettings = company?.settings || {};
      const updatedSettings = {
        ...currentSettings,
        paymentGateway: paymentConfig
      };

      const { error } = await supabase
        .from('companies')
        .update({ settings: updatedSettings })
        .eq('id', companyId);

      if (error) {
        console.error("Error saving payment gateway settings:", error);
      } else {
        console.log("✅ Payment gateway settings saved to Supabase");
      }
    } catch (e) {
      console.error("Error saving payment gateway settings:", e);
    }
  },

  // Get payment gateway settings from company settings
  getPaymentGatewaySettings: async (companyId: string) => {
    if (!supabase) return null;
    try {
      const { data, error } = await supabase
        .from('companies')
        .select('settings')
        .eq('id', companyId)
        .single();

      if (error || !data) return null;
      return data.settings?.paymentGateway || null;
    } catch (e) {
      console.error("Error fetching payment gateway settings:", e);
      return null;
    }
  },

  // Get global config from Supabase (stored in a system company or first company)
  getGlobalConfig: async (): Promise<GlobalConfig | null> => {
    if (!supabase) return null;
    try {
      // Try to get from a system company first (if exists)
      // Otherwise, get from the first company's settings
      const { data, error } = await supabase
        .from('companies')
        .select('settings')
        .order('created_at', { ascending: true })
        .limit(1)
        .single();

      if (error) {
        console.error("Error fetching global config:", error);
        return null;
      }

      // Global config is stored in settings.globalConfig
      return data?.settings?.globalConfig || null;
    } catch (e) {
      console.error("Error fetching global config:", e);
      return null;
    }
  },

  // Save global config to Supabase (save to all companies or a system company)
  saveGlobalConfig: async (config: GlobalConfig): Promise<boolean> => {
    if (!supabase) return false;
    try {
      // Get all companies
      const { data: companies, error: fetchError } = await supabase
        .from('companies')
        .select('id, settings');

      if (fetchError) {
        console.error("Error fetching companies for global config:", fetchError);
        return false;
      }

      // Update all companies with global config
      if (!supabase) return false;
      const updates = (companies || []).map(company => {
        const currentSettings = company.settings || {};
        const updatedSettings = {
          ...currentSettings,
          globalConfig: config
        };

        if (!supabase) return Promise.resolve();
        return supabase
          .from('companies')
          .update({ settings: updatedSettings })
          .eq('id', company.id);
      });

      await Promise.all(updates);
      console.log("✅ Global config saved to Supabase");
      return true;
    } catch (e) {
      console.error("Error saving global config:", e);
      return false;
    }
  },

  // Get all users for a company
  getCompanyUsers: async (companyId: string): Promise<User[]> => {
    if (!supabase) return [];
    try {
      const { data, error } = await supabase
        .from('app_users')
        .select('*')
        .eq('company_id', companyId);

      if (error) {
        console.error("Error fetching company users:", error);
        return [];
      }

      return (data || []).map(u => ({
        id: u.id,
        name: u.name,
        email: u.email,
        role: u.role as any,
        companyId: u.company_id,
        isOnboarded: u.is_onboarded,
        avatarUrl: u.avatar_url || undefined,
        phone: u.phone || undefined,
        onboardingToken: u.preferences?.onboardingToken || undefined
      }));
    } catch (e) {
      console.error("Error fetching company users:", e);
      return [];
    }
  },

  getAllCompanies: async (): Promise<ResellerClient[]> => {
    if (!supabase) return [];
    const { data, error } = await supabase.from('companies').select('*');

    if (error || !data) {
        console.error("Error fetching companies:", error);
        return [];
    }

    // Map database plan format back to app format
    const mapPlanFromDbFormat = (dbPlan: string | undefined): string => {
      if (!dbPlan) return 'Free';
      const planMap: Record<string, string> = {
        'Free': 'Free',
        'Starter': 'Starter',
        'Professional': 'Pro',
        'Enterprise': 'Enterprise'
      };
      return planMap[dbPlan] || 'Free';
    };

    return data.map(c => ({
        id: c.id,
        companyName: c.name,
        contactName: c.settings?.contactName || 'Admin',
        email: c.settings?.email || '',
        employeeCount: c.settings?.employeeCount || 0,
        plan: (mapPlanFromDbFormat(c.plan) || 'Free') as 'Free' | 'Starter' | 'Pro' | 'Enterprise' | 'Reseller',
        status: c.status || 'ACTIVE',
        mrr: c.settings?.mrr || 0
    }));
  },

  getCompanyById: async (companyId: string): Promise<CompanySettings | null> => {
    if (!supabase) return null;
    const { data, error } = await supabase
      .from('companies')
      .select('*')
      .eq('id', companyId)
      .single();

    if (error || !data) {
        console.error("Error fetching company:", error);
        return null;
    }

    // Map database plan format back to app format
    const mapPlanFromDbFormat = (dbPlan: string | undefined): string => {
      if (!dbPlan) return 'Free';
      const planMap: Record<string, string> = {
        'Free': 'Free',
        'Starter': 'Starter',
        'Professional': 'Pro',
        'Enterprise': 'Enterprise'
      };
      return planMap[dbPlan] || 'Free';
    };

    return {
      name: data.name,
      trn: data.trn || '',
      address: data.address || '',
      phone: data.settings?.phone || '',
      bankName: data.settings?.bankName || '',
      accountNumber: data.settings?.accountNumber || '',
      branchCode: data.settings?.branchCode || '',
      payFrequency: data.settings?.payFrequency || 'Monthly',
      defaultPayDate: data.settings?.defaultPayDate,
      subscriptionStatus: data.status,
      plan: mapPlanFromDbFormat(data.plan) as any,
      paymentMethod: data.settings?.paymentMethod
    };
  },

  updateCompanyStatus: async (companyId: string, status: 'ACTIVE' | 'PAST_DUE' | 'SUSPENDED' | 'PENDING_PAYMENT'): Promise<void> => {
    if (!supabase) return;
    
    const { error } = await supabase
      .from('companies')
      .update({ status: status })
      .eq('id', companyId);

    if (error) {
      console.error("Error updating company status:", error);
      throw error;
    }
  },

  // --- Employees ---

  getEmployees: async (companyId: string): Promise<Employee[]> => {
    if (!supabase) return [];
    const { data, error } = await supabase
      .from('employees')
      .select('*')
      .eq('company_id', companyId);

    if (error) {
      console.error("Error loading employees:", error);
      return [];
    }

    return data.map((e: any) => ({
      id: e.id,
      firstName: e.first_name,
      lastName: e.last_name,
      email: e.email,
      trn: e.trn,
      nis: e.nis,
      employeeId: e.employee_number || undefined, // Map employee_number to employeeId
      status: e.status,
      role: e.role,
      hireDate: e.hire_date,
      jobTitle: e.job_title,
      department: e.department,
      // Unpack JSONB fields
      grossSalary: e.pay_data?.grossSalary || 0,
      hourlyRate: e.pay_data?.hourlyRate,
      payType: e.pay_data?.payType || 'SALARIED',
      payFrequency: e.pay_data?.payFrequency || 'MONTHLY',
      bankDetails: e.bank_details || {},
      leaveBalance: e.leave_balance || { vacation: 0, sick: 0, personal: 0 },
      allowances: e.allowances || [],
      deductions: e.deductions || [],
      terminationDetails: e.termination_details || undefined,
      onboardingToken: e.onboarding_token
    }));
  },

  /**
   * Get a specific employee by ID (for public payslip download)
   */
  getEmployeeById: async (employeeId: string): Promise<{ id: string; companyId: string; firstName: string; lastName: string; email: string } | null> => {
    if (!supabase) return null;
    const { data, error } = await supabase
      .from('employees')
      .select('id, company_id, first_name, last_name, email')
      .eq('id', employeeId)
      .single();

    if (error) {
      console.error("Error loading employee:", error);
      return null;
    }

    if (!data) return null;

    return {
      id: data.id,
      companyId: data.company_id,
      firstName: data.first_name,
      lastName: data.last_name,
      email: data.email
    };
  },

  getEmployeeByToken: async (token: string, email?: string): Promise<{ employee: Employee; companyName: string; companyId: string } | null> => {
    if (!supabase) return null;
    try {
      let query = supabase
        .from('employees')
        .select(`
          *,
          companies!employees_company_id_fkey(name)
        `)
        .eq('onboarding_token', token);
      
      if (email) {
        query = query.eq('email', email);
      }

      const { data, error } = await query.maybeSingle();

      if (error) {
        console.error("Error fetching employee by token:", error);
        return null;
      }

      if (!data) return null;

      const employee: Employee = {
        id: data.id,
        firstName: data.first_name,
        lastName: data.last_name,
        email: data.email,
        trn: data.trn || '',
        nis: data.nis || '',
        employeeId: data.employee_number || undefined, // Map employee_number to employeeId
        status: data.status,
        role: data.role as any,
        hireDate: data.hire_date,
        jobTitle: data.job_title,
        department: data.department,
        phone: data.phone,
        address: data.address,
        grossSalary: data.pay_data?.grossSalary || 0,
        hourlyRate: data.pay_data?.hourlyRate,
        payType: data.pay_data?.payType || 'SALARIED',
        payFrequency: data.pay_data?.payFrequency || 'MONTHLY',
        bankDetails: data.bank_details || {},
        leaveBalance: data.leave_balance || { vacation: 0, sick: 0, personal: 0 },
        allowances: data.allowances || [],
        deductions: data.deductions || [],
        terminationDetails: data.termination_details || undefined,
        onboardingToken: data.onboarding_token
      };

      // Extract company name and ID from the data
      const companyName = (data.companies as any)?.name || 'Your Company';
      const companyId = data.company_id || '';

      return { employee, companyName, companyId };
    } catch (e) {
      console.error("Error fetching employee by token:", e);
      return null;
    }
  },

  saveEmployee: async (emp: Employee, companyId: string) => {
    if (!supabase) return;

    // Pack JSONB fields
    const payData = {
      grossSalary: emp.grossSalary,
      hourlyRate: emp.hourlyRate,
      payType: emp.payType,
      payFrequency: emp.payFrequency
    };

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
        employee_number: emp.employeeId || null, // Save employeeId to employee_number column
        phone: emp.phone || null,
        address: emp.address || null,
        status: emp.status,
        role: emp.role,
        hire_date: emp.hireDate,
        job_title: emp.jobTitle,
        department: emp.department,
        pay_data: payData,
        bank_details: emp.bankDetails,
        leave_balance: emp.leaveBalance,
        allowances: emp.allowances,
        deductions: emp.deductions,
        termination_details: emp.terminationDetails,
        onboarding_token: emp.onboardingToken || null
      });

    if (error) console.error("Error saving employee:", error);
  },

  deleteEmployee: async (employeeId: string, companyId: string) => {
    if (!supabase) return;
    
    const { error } = await supabase
      .from('employees')
      .delete()
      .eq('id', employeeId)
      .eq('company_id', companyId);

    if (error) {
      console.error("Error deleting employee:", error);
      throw error;
    }
  },

  // --- Pay Runs ---

  getPayRuns: async (companyId: string): Promise<PayRun[]> => {
    if (!supabase) return [];
    const { data, error } = await supabase
      .from('pay_runs')
      .select('*')
      .eq('company_id', companyId)
      .order('period_start', { ascending: false });

    if (error) {
      console.error("Error loading pay runs:", error);
      return [];
    }

    // Normalize status: map database statuses to app statuses
    const normalizeStatus = (dbStatus: string): 'DRAFT' | 'APPROVED' | 'FINALIZED' => {
      if (dbStatus === 'FINALIZED' || dbStatus === 'CANCELLED') return 'FINALIZED';
      if (dbStatus === 'APPROVED' || dbStatus === 'PROCESSING') return 'APPROVED';
      // DRAFT, REVIEW, or any other status -> DRAFT
      return 'DRAFT';
    };

    return data.map((r: any) => ({
      id: r.id,
      periodStart: r.period_start,
      periodEnd: r.period_end,
      payDate: r.pay_date,
      payFrequency: r.pay_frequency || 'MONTHLY',
      status: normalizeStatus(r.status),
      totalGross: r.total_gross || 0,
      totalNet: r.total_net || 0,
      lineItems: r.line_items || []
    }));
  },

  /**
   * Get a specific pay run by ID (for public payslip download)
   */
  getPayRunById: async (runId: string): Promise<PayRun | null> => {
    if (!supabase) return null;
    const { data, error } = await supabase
      .from('pay_runs')
      .select('*')
      .eq('id', runId)
      .single();

    if (error) {
      console.error("Error loading pay run:", error);
      return null;
    }

    if (!data) return null;

    // Normalize status
    const normalizeStatus = (dbStatus: string): 'DRAFT' | 'APPROVED' | 'FINALIZED' => {
      if (dbStatus === 'FINALIZED' || dbStatus === 'CANCELLED') return 'FINALIZED';
      if (dbStatus === 'APPROVED' || dbStatus === 'PROCESSING') return 'APPROVED';
      return 'DRAFT';
    };

    return {
      id: data.id,
      periodStart: data.period_start,
      periodEnd: data.period_end,
      payDate: data.pay_date,
      payFrequency: data.pay_frequency || 'MONTHLY',
      status: normalizeStatus(data.status),
      totalGross: data.total_gross || 0,
      totalNet: data.total_net || 0,
      lineItems: data.line_items || []
    };
  },

  savePayRun: async (run: PayRun, companyId: string, options?: { allowMultiple?: boolean }) => {
    if (!supabase) return;
    const allowMultiple = options?.allowMultiple ?? false;

    // Determine pay_frequency - default to MONTHLY if not specified
    // If payFrequency is not set, we'll default to MONTHLY (most common)
    const payFrequency = run.payFrequency || 'MONTHLY';

    // Convert period_start to first day of month if in YYYY-MM format
    let periodStart = run.periodStart;
    if (periodStart.match(/^\d{4}-\d{2}$/)) {
      periodStart = `${periodStart}-01`;
    }

    // Convert period_end to last day of month if in YYYY-MM format
    let periodEnd = run.periodEnd;
    if (periodEnd.match(/^\d{4}-\d{2}$/)) {
      const [yearStr, monthStr] = periodEnd.split('-');
      const year = parseInt(yearStr);
      const month = parseInt(monthStr);
      const lastDay = new Date(year, month, 0).getDate();
      periodEnd = `${periodEnd}-${lastDay.toString().padStart(2, '0')}`;
    }

    // Check if THIS SPECIFIC pay run exists (by ID) and pull notes for token reuse
    const { data: existingById } = await supabase
      .from('pay_runs')
      .select('id, notes')
      .eq('id', run.id)
      .maybeSingle();
    
    // Also check if a pay run exists for this period/frequency combination (for logging)
    const { data: existingByPeriod } = await supabase
      .from('pay_runs')
      .select('id')
      .eq('company_id', companyId)
      .eq('period_start', periodStart)
      .eq('period_end', periodEnd)
      .eq('pay_frequency', payFrequency)
      .maybeSingle();

    // Ensure we include a finalized token inside `notes` when a run is finalized.
    // We store it in the existing `notes` TEXT column to avoid schema changes.
    let finalizedToken: string | null = null;
    if (run.status === 'FINALIZED') {
      // Try to reuse existing token if present on the same run
      if (existingById && (existingById as any).notes) {
        const match = ((existingById as any).notes as string).match(/finalized_token:([0-9a-fA-F-]+)/);
        if (match) finalizedToken = match[1];
      }
      if (!finalizedToken) finalizedToken = generateUUID();
    }

    const payRunData: any = {
      company_id: companyId,
      period_start: periodStart,
      period_end: periodEnd,
      pay_date: run.payDate,
      pay_frequency: payFrequency,
      status: run.status,
      total_gross: run.totalGross,
      total_net: run.totalNet,
      employee_count: run.lineItems?.length || 0,
      line_items: run.lineItems || [] // Stored as JSONB
    };

    if (finalizedToken) {
      const tokenNote = `finalized_token:${finalizedToken}`;
      // Preserve any existing notes while appending token if not present
      const existingNotes = (existingById && (existingById as any).notes) ? (existingById as any).notes : '';
      if (!existingNotes || !existingNotes.includes('finalized_token:')) {
        payRunData.notes = existingNotes ? `${existingNotes}\n${tokenNote}` : tokenNote;
      } else {
        payRunData.notes = existingNotes;
      }
    }

    let error;
    let result;
    if (existingById && existingById.id === run.id) {
      // Update existing record (same ID)
      console.log('📝 Updating existing pay run:', existingById.id);
      result = await supabase
        .from('pay_runs')
        .update(payRunData)
        .eq('id', run.id);
      error = result.error;
    } else {
      // No existing ID match; decide whether to update an existing period or insert
      // a new record. Default (allowMultiple=false) will update the existing period
      // run if present to avoid creating duplicate runs unexpectedly. If callers
      // explicitly pass { allowMultiple: true } we will insert a new run even
      // when a run for the same period already exists.
      if (existingByPeriod && !allowMultiple) {
        console.log('ℹ️ Existing pay run for this period found; updating it to avoid duplicates:', existingByPeriod.id);
        result = await supabase
          .from('pay_runs')
          .update(payRunData)
          .eq('id', existingByPeriod.id);
        error = result.error;
      } else {
        console.log(`➕ Inserting new pay run (allowMultiple=${allowMultiple}):`, run.id);
        result = await supabase
          .from('pay_runs')
          .insert({
            id: run.id,
            ...payRunData
          });
        error = result.error;

        // If insert fails due to unique constraint (existing UNIQUE on company+period+frequency),
        // handle based on allowMultiple setting
        if (error && (error.code === '23505' || /duplicate key|unique constraint|already exists/i.test(error.message || ''))) {
          if (allowMultiple) {
            // User wants multiple runs for same period - treat constraint error as success
            console.log('ℹ️ Unique constraint hit but allowMultiple=true; multiple pay runs for same period are allowed. Treating as success.');
            error = null;
            result = { data: { id: run.id }, status: 200, statusText: 'Multiple runs allowed' };
          } else {
            // Original behavior: attempt a safe fallback to update the existing period run
            console.warn('⚠️ Insert failed due to unique constraint; attempting to update existing period run instead.');
            console.warn('Conflicting pay run details:', {
              attemptedId: run.id,
              status: run.status,
              period: `${periodStart} to ${periodEnd}`,
              frequency: payFrequency
            });
            
            try {
              const { data: existingForPeriod } = await supabase
                .from('pay_runs')
                .select('id, status')
                .eq('company_id', companyId)
                .eq('period_start', periodStart)
                .eq('period_end', periodEnd)
                .eq('pay_frequency', payFrequency)
                .maybeSingle();

              const targetId = existingForPeriod?.id || (existingByPeriod && (existingByPeriod as any).id);
              if (targetId) {
                // Only update if the new status is more advanced (DRAFT < APPROVED < FINALIZED)
                // or if statuses are the same
                const statusPriority: any = { 'DRAFT': 1, 'APPROVED': 2, 'FINALIZED': 3 };
                const existingPriority = statusPriority[existingForPeriod?.status] || 1;
                const newPriority = statusPriority[run.status] || 1;
                
                if (newPriority >= existingPriority) {
                  console.log('🔁 Updating existing pay run for period as fallback:', targetId, `(${existingForPeriod?.status} → ${run.status})`);
                  const updateResult = await supabase
                    .from('pay_runs')
                    .update(payRunData)
                    .eq('id', targetId)
                    .select();
                  
                  if (!updateResult.error) {
                    // Fallback succeeded - clear the original error and use the update result
                    error = null;
                    result = updateResult;
                    console.log('✅ Successfully updated existing pay run instead of creating duplicate');
                  } else {
                    error = updateResult.error;
                    result = updateResult;
                  }
                } else {
                  console.log('ℹ️ Skipping update - existing run has higher priority status:', existingForPeriod?.status);
                  // Clear error since we're intentionally not updating
                  error = null;
                  result = { data: existingForPeriod, status: 200, statusText: 'Skipped - existing run preserved' };
                }
              } else {
                console.warn('⚠️ Could not find existing pay run to update after unique constraint failure.');
              }
            } catch (fallbackErr) {
              console.error('❌ Fallback update after unique constraint failed:', fallbackErr);
            }
          }
        }
      }
    }

    console.log('📊 Save result:', {
      error: error ? JSON.stringify(error) : 'none',
      data: result?.data,
      count: result?.count,
      status: result?.status,
      statusText: result?.statusText
    });

    if (error) {
      // This should not happen if fallback logic worked correctly
      console.error("❌ Error saving pay run to Supabase:", error);
      console.error("Pay run data:", {
        id: run.id,
        period_start: periodStart,
        period_end: periodEnd,
        pay_date: run.payDate,
        pay_frequency: payFrequency,
        status: run.status,
        company_id: companyId
      });
      throw new Error(`Failed to save pay run: ${error.message || error.code || 'Unknown error'}`);
    } else {
      console.log("✅ Pay run save reported success:", {
        id: run.id,
        status: run.status,
        period: periodStart,
        resultData: result?.data,
        resultCount: result?.count
      });
      
      // Verify the save by querying it back (this will fail if RLS blocks read)
      console.log('🔍 Verifying pay run exists in database...');
      const { data: verifyData, error: verifyError } = await supabase
        .from('pay_runs')
        .select('id, status, company_id')
        .eq('id', run.id)
        .eq('company_id', companyId) // Add company_id filter to help RLS
        .maybeSingle(); // Use maybeSingle instead of single to avoid error on 0 rows
      
      if (verifyError) {
        console.error("⚠️ WARNING: Pay run save reported success but verification query failed:", {
          verifyError: JSON.stringify(verifyError),
          runId: run.id,
          companyId: companyId,
          errorCode: verifyError.code,
          errorMessage: verifyError.message
        });
        // Don't throw - RLS might block read even though write succeeded
        // The Edge Function will use SERVICE_ROLE_KEY to read it
        console.warn("⚠️ Verification failed but save succeeded. Edge Function will use SERVICE_ROLE_KEY to read.");
      } else if (!verifyData) {
        console.warn("⚠️ WARNING: Pay run save reported success but not found in database (RLS may be blocking read):", {
          runId: run.id,
          companyId: companyId
        });
        console.warn("⚠️ This is OK - Edge Function uses SERVICE_ROLE_KEY to bypass RLS");
      } else {
        console.log("✅ Verified: Pay run exists in database:", {
          id: verifyData.id,
          status: verifyData.status,
          company_id: verifyData.company_id
        });
      }
      // If finalized, persist a lightweight snapshot record with the finalized token.
      if (finalizedToken) {
        try {
          let savedId: string | undefined = undefined;
          if (result?.data && Array.isArray(result.data) && result.data.length > 0 && typeof result.data[0] === 'object' && 'id' in result.data[0]) {
            savedId = (result.data as any[])[0].id;
          } else if (run.id) {
            savedId = run.id;
          } else if (existingByPeriod && (existingByPeriod as any).id) {
            savedId = (existingByPeriod as any).id;
          }
          const snapshotPayload = {
            pay_run_id: savedId,
            company_id: companyId,
            finalized_token: finalizedToken,
            snapshot_data: {
              id: savedId,
              period_start: periodStart,
              period_end: periodEnd,
              pay_date: run.payDate,
              status: run.status,
              total_gross: run.totalGross,
              total_net: run.totalNet,
              employee_count: run.lineItems?.length || 0,
              line_items: run.lineItems || []
            },
            notes: payRunData.notes || null
          };

          const { error: snapErr } = await supabase
            .from('pay_run_snapshots')
            .insert(snapshotPayload);

          if (snapErr) {
            console.warn('⚠️ Failed to write pay_run_snapshots record:', snapErr);
          } else {
            console.log('✅ pay_run_snapshots record created for finalized run', { pay_run_id: savedId, finalizedToken });
          }
        } catch (snapEx) {
          console.warn('⚠️ Exception while creating pay_run_snapshots record:', snapEx);
        }
      }
    }
    // Return the saved data and token where available
    return { data: result?.data, finalizedToken: payRunData._finalized_token || null };
  },

  deletePayRun: async (runId: string, companyId: string): Promise<boolean> => {
    if (!supabase) return false;

    const { error } = await supabase
      .from('pay_runs')
      .delete()
      .eq('id', runId)
      .eq('company_id', companyId);

    if (error) {
      console.error("Error deleting pay run:", error);
      return false;
    }

    return true;
  },

  // --- Leave Requests ---

  getLeaveRequests: async (companyId: string): Promise<LeaveRequest[]> => {
    if (!supabase) return [];
    const { data, error } = await supabase
      .from('leave_requests')
      .select('*')
      .eq('company_id', companyId);

    if (error) return [];

    return data.map((r: any) => ({
      id: r.id,
      employeeId: r.employee_id,
      employeeName: r.employee_name,
      type: r.type,
      startDate: r.start_date,
      endDate: r.end_date,
      days: r.days,
      reason: r.reason,
      status: r.status,
      requestedDates: r.requested_dates || [],
      approvedDates: r.approved_dates || []
    }));
  },

  saveLeaveRequest: async (req: LeaveRequest, companyId: string) => {
    if (!supabase) return;

    const { error } = await supabase
      .from('leave_requests')
      .upsert({
        id: req.id,
        company_id: companyId,
        employee_id: req.employeeId,
        employee_name: req.employeeName,
        type: req.type,
        start_date: req.startDate,
        end_date: req.endDate,
        days: req.days,
        reason: req.reason,
        status: req.status,
        requested_dates: req.requestedDates,
        approved_dates: req.approvedDates
      });

    if (error) console.error("Error saving leave request:", error);
  },

  // --- Timesheets ---
  
  getTimesheets: async (companyId: string): Promise<WeeklyTimesheet[]> => {
    if (!supabase) return [];
    try {
      const { data, error } = await supabase
        .from('timesheets')
        .select('*')
        .eq('company_id', companyId)
        .order('week_start_date', { ascending: false });

      if (error) {
        console.error("Error fetching timesheets:", error);
        return [];
      }

      return (data || []).map((ts: any) => ({
        id: ts.id,
        employeeId: ts.employee_id,
        employeeName: ts.employee_name || '',
        weekStartDate: ts.week_start_date,
        weekEndDate: ts.week_end_date,
        status: ts.status,
        totalRegularHours: ts.total_regular_hours || 0,
        totalOvertimeHours: ts.total_overtime_hours || 0,
        entries: ts.entries || []
      }));
    } catch (e) {
      console.error("Error fetching timesheets:", e);
      return [];
    }
  },

  saveTimesheet: async (ts: WeeklyTimesheet, companyId: string) => {
    if (!supabase) return;
    try {
      const { error } = await supabase
        .from('timesheets')
        .upsert({
          id: ts.id,
          company_id: companyId,
          employee_id: ts.employeeId,
          employee_name: ts.employeeName,
          week_start_date: ts.weekStartDate,
          week_end_date: ts.weekEndDate,
          status: ts.status,
          total_regular_hours: ts.totalRegularHours,
          total_overtime_hours: ts.totalOvertimeHours,
          entries: ts.entries,
          submitted_at: ts.status === 'SUBMITTED' ? new Date().toISOString() : null
        });

      if (error) console.error("Error saving timesheet:", error);
    } catch (e) {
      console.error("Error saving timesheet:", e);
    }
  },

  approveTimesheet: async (timesheetId: string, reviewerId: string) => {
    if (!supabase) return;
    const { error } = await supabase
      .from('timesheets')
      .update({
        status: 'APPROVED',
        reviewed_by: reviewerId,
        reviewed_at: new Date().toISOString()
      })
      .eq('id', timesheetId);

    if (error) console.error("Error approving timesheet:", error);
  },

  rejectTimesheet: async (timesheetId: string, reviewerId: string, reason: string) => {
    if (!supabase) return;
    const { error } = await supabase
      .from('timesheets')
      .update({
        status: 'REJECTED',
        reviewed_by: reviewerId,
        reviewed_at: new Date().toISOString(),
        rejection_reason: reason
      })
      .eq('id', timesheetId);

    if (error) console.error("Error rejecting timesheet:", error);
  },

  // --- Document Requests ---
  
  getDocumentRequests: async (companyId: string): Promise<DocumentRequest[]> => {
    if (!supabase) return [];
    try {
      const { data, error } = await supabase
        .from('document_requests')
        .select('*')
        .eq('company_id', companyId)
        .order('created_at', { ascending: false });

      if (error) {
        console.error("Error fetching document requests:", error);
        return [];
      }

      return (data || []).map((req: any) => ({
        id: req.id,
        employeeId: req.employee_id,
        employeeName: req.employee_name || '',
        templateId: req.template_id,
        documentType: req.document_type,
        purpose: req.purpose || '',
        status: req.status,
        requestedAt: req.created_at,
        reviewedBy: req.reviewed_by,
        reviewedAt: req.reviewed_at,
        rejectionReason: req.rejection_reason,
        generatedContent: req.generated_content,
        fileUrl: req.file_url
      }));
    } catch (e) {
      console.error("Error fetching document requests:", e);
      return [];
    }
  },

  saveDocumentRequest: async (request: DocumentRequest, companyId: string) => {
    if (!supabase) return;
    try {
      const { error } = await supabase
        .from('document_requests')
        .upsert({
          id: request.id,
          company_id: companyId,
          employee_id: request.employeeId,
          template_id: request.templateId,
          document_type: request.documentType,
          purpose: request.purpose,
          status: request.status,
          reviewed_by: request.reviewedBy,
          reviewed_at: request.reviewedAt,
          rejection_reason: request.rejectionReason,
          generated_content: request.generatedContent,
          file_url: request.fileUrl
        });

      if (error) console.error("Error saving document request:", error);
    } catch (e) {
      console.error("Error saving document request:", e);
    }
  },

  approveDocumentRequest: async (requestId: string, reviewerId: string, generatedContent: string) => {
    if (!supabase) return;
    const { error } = await supabase
      .from('document_requests')
      .update({
        status: 'APPROVED',
        reviewed_by: reviewerId,
        reviewed_at: new Date().toISOString(),
        generated_content: generatedContent,
        generated_at: new Date().toISOString()
      })
      .eq('id', requestId);

    if (error) console.error("Error approving document request:", error);
  },

  rejectDocumentRequest: async (requestId: string, reviewerId: string, reason: string) => {
    if (!supabase) return;
    const { error } = await supabase
      .from('document_requests')
      .update({
        status: 'REJECTED',
        reviewed_by: reviewerId,
        reviewed_at: new Date().toISOString(),
        rejection_reason: reason
      })
      .eq('id', requestId);

    if (error) console.error("Error rejecting document request:", error);
  },

  // --- Document Templates ---
  
  getDocumentTemplates: async (companyId: string): Promise<DocumentTemplate[]> => {
    if (!supabase) return [];
    try {
      const { data, error } = await supabase
        .from('document_templates')
        .select('*')
        .or(`company_id.eq.${companyId},is_global.eq.true`)
        .order('name');

      if (error) {
        console.error("Error fetching document templates:", error);
        return [];
      }

      return (data || []).map((tpl: any) => ({
        id: tpl.id,
        name: tpl.name,
        category: tpl.category,
        content: tpl.content,
        lastModified: tpl.updated_at,
        requiresApproval: tpl.requires_approval
      }));
    } catch (e) {
      console.error("Error fetching document templates:", e);
      return [];
    }
  },

  // --- Expert Referrals (Ask an Expert) ---
  
  getExpertReferrals: async (companyId: string): Promise<ExpertReferral[]> => {
    if (!supabase) return [];
    try {
      const { data, error } = await supabase
        .from('expert_referrals')
        .select('*')
        .eq('company_id', companyId)
        .order('created_at', { ascending: false });

      if (error) {
        console.error("Error fetching expert referrals:", error);
        return [];
      }

      return (data || []).map((ref: any) => ({
        id: ref.id,
        companyId: ref.company_id,
        userId: ref.user_id,
        userName: ref.user_name || '',
        question: ref.question,
        category: ref.category,
        urgency: ref.urgency,
        status: ref.status,
        assignedResellerId: ref.assigned_reseller_id,
        assignedExpertId: ref.assigned_expert_id,
        expertResponse: ref.expert_response,
        createdAt: ref.created_at,
        respondedAt: ref.responded_at
      }));
    } catch (e) {
      console.error("Error fetching expert referrals:", e);
      return [];
    }
  },

  saveExpertReferral: async (referral: ExpertReferral) => {
    if (!supabase) return;
    try {
      const { error } = await supabase
        .from('expert_referrals')
        .upsert({
          id: referral.id,
          company_id: referral.companyId,
          user_id: referral.userId,
          question: referral.question,
          category: referral.category,
          urgency: referral.urgency,
          status: referral.status,
          assigned_reseller_id: referral.assignedResellerId,
          assigned_expert_id: referral.assignedExpertId,
          expert_response: referral.expertResponse,
          responded_at: referral.respondedAt
        });

      if (error) console.error("Error saving expert referral:", error);
    } catch (e) {
      console.error("Error saving expert referral:", e);
    }
  },

  // --- YTD (Year-to-Date) Tracking ---
  
  getEmployeeYTD: async (employeeId: string, taxYear: number) => {
    if (!supabase) return null;
    try {
      const { data, error } = await supabase
        .from('employee_ytd')
        .select('*')
        .eq('employee_id', employeeId)
        .eq('tax_year', taxYear)
        .maybeSingle();

      if (error) {
        console.error("Error fetching YTD:", error);
        return null;
      }

      return data ? {
        ytdGross: data.ytd_gross || 0,
        ytdTaxableGross: data.ytd_taxable_gross || 0,
        ytdNIS: data.ytd_nis || 0,
        ytdNHT: data.ytd_nht || 0,
        ytdEdTax: data.ytd_education_tax || 0,
        ytdPAYE: data.ytd_paye || 0,
        ytdEmployerNIS: data.ytd_employer_nis || 0,
        ytdEmployerNHT: data.ytd_employer_nht || 0,
        ytdEmployerEdTax: data.ytd_employer_education_tax || 0,
        ytdEmployerHEART: data.ytd_employer_heart || 0,
        periodsPaid: data.periods_paid || 0
      } : null;
    } catch (e) {
      console.error("Error fetching YTD:", e);
      return null;
    }
  },

  updateEmployeeYTD: async (employeeId: string, companyId: string, taxYear: number, ytdData: any) => {
    if (!supabase) return;
    try {
      const { error } = await supabase
        .from('employee_ytd')
        .upsert({
          employee_id: employeeId,
          company_id: companyId,
          tax_year: taxYear,
          ytd_gross: ytdData.ytdGross,
          ytd_taxable_gross: ytdData.ytdTaxableGross,
          ytd_nis: ytdData.ytdNIS,
          ytd_nht: ytdData.ytdNHT,
          ytd_education_tax: ytdData.ytdEdTax,
          ytd_paye: ytdData.ytdPAYE,
          ytd_employer_nis: ytdData.ytdEmployerNIS,
          ytd_employer_nht: ytdData.ytdEmployerNHT,
          ytd_employer_education_tax: ytdData.ytdEmployerEdTax,
          ytd_employer_heart: ytdData.ytdEmployerHEART,
          periods_paid: ytdData.periodsPaid,
          last_pay_date: ytdData.lastPayDate
        });

      if (error) console.error("Error updating YTD:", error);
    } catch (e) {
      console.error("Error updating YTD:", e);
    }
  },

  // --- Audit Logs ---
  
  saveAuditLog: async (log: AuditLogEntry, companyId: string) => {
    if (!supabase) return;
    await supabase.from('audit_logs').insert({
        id: log.id,
        company_id: companyId,
        actor_id: log.actorId,
        actor_name: log.actorName,
        action: log.action,
        entity: log.entity,
        description: log.description,
        timestamp: log.timestamp,
        ip_address: log.ipAddress
    });
  },

  getAuditLogs: async (companyId: string | null, userRole?: string): Promise<AuditLogEntry[]> => {
    if (!supabase) return [];
    
    try {
      let query = supabase
        .from('audit_logs')
        .select('*')
        .order('timestamp', { ascending: false })
        .limit(500);

      // Super admins can see all audit logs, companies only see their own
      if (userRole !== 'SUPER_ADMIN' && companyId) {
        query = query.eq('company_id', companyId);
      }
      // If no companyId and not super admin, return empty (shouldn't happen)
      else if (!companyId && userRole !== 'SUPER_ADMIN') {
        return [];
      }

      const { data, error } = await query;

      if (error) {
        console.error("Error fetching audit logs:", error);
        return [];
      }

      if (!data) return [];

      return data.map((log: any) => ({
        id: log.id,
        timestamp: log.timestamp,
        actorId: log.actor_id,
        actorName: log.actor_name,
        action: log.action,
        entity: log.entity,
        description: log.description,
        ipAddress: log.ip_address
      }));
    } catch (error) {
      console.error("Error fetching audit logs:", error);
      return [];
    }
  },

  // --- Subscriptions ---
  
  getSubscription: async (companyId: string) => {
    if (!supabase) return null;
    try {
      const { data, error } = await supabase
        .from('subscriptions')
        .select('*')
        .eq('company_id', companyId)
        .eq('status', 'active')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) {
        console.error("Error fetching subscription:", error);
        return null;
      }

      if (!data) return null;

      return {
        id: data.id,
        companyId: data.company_id,
        planName: data.plan_name,
        planType: data.plan_type,
        status: data.status,
        billingFrequency: data.billing_frequency,
        amount: parseFloat(data.amount),
        currency: data.currency,
        startDate: data.start_date,
        endDate: data.end_date,
        nextBillingDate: data.next_billing_date,
        autoRenew: data.auto_renew,
        metadata: data.metadata || {},
        createdAt: data.created_at,
        updatedAt: data.updated_at
      };
    } catch (e) {
      console.error("Error fetching subscription:", e);
      return null;
    }
  },

  createSubscription: async (subscriptionData: {
    companyId: string;
    planName: string;
    planType: string;
    billingFrequency: string;
    amount: number;
    currency?: string;
    startDate?: string;
    nextBillingDate?: string;
    metadata?: any;
  }) => {
    if (!supabase) return null;
    try {
      const { data, error } = await supabase
        .from('subscriptions')
        .insert({
          company_id: subscriptionData.companyId,
          plan_name: subscriptionData.planName,
          plan_type: subscriptionData.planType,
          billing_frequency: subscriptionData.billingFrequency,
          amount: subscriptionData.amount,
          currency: subscriptionData.currency || 'JMD',
          start_date: subscriptionData.startDate || new Date().toISOString(),
          next_billing_date: subscriptionData.nextBillingDate,
          metadata: subscriptionData.metadata || {}
        })
        .select()
        .single();

      if (error) {
        console.error("Error creating subscription:", error);
        return null;
      }

      // Update company's current_subscription_id
      await supabase
        .from('companies')
        .update({ current_subscription_id: data.id })
        .eq('id', subscriptionData.companyId);

      return data;
    } catch (e) {
      console.error("Error creating subscription:", e);
      return null;
    }
  },

  updateSubscription: async (subscriptionId: string, updates: {
    status?: string;
    planName?: string;
    planType?: string;
    amount?: number;
    nextBillingDate?: string;
    autoRenew?: boolean;
    metadata?: any;
  }) => {
    if (!supabase) return null;
    try {
      const { data, error } = await supabase
        .from('subscriptions')
        .update({
          ...(updates.status && { status: updates.status }),
          ...(updates.planName && { plan_name: updates.planName }),
          ...(updates.planType && { plan_type: updates.planType }),
          ...(updates.amount !== undefined && { amount: updates.amount }),
          ...(updates.nextBillingDate && { next_billing_date: updates.nextBillingDate }),
          ...(updates.autoRenew !== undefined && { auto_renew: updates.autoRenew }),
          ...(updates.metadata && { metadata: updates.metadata })
        })
        .eq('id', subscriptionId)
        .select()
        .single();

      if (error) {
        console.error("Error updating subscription:", error);
        return null;
      }

      return data;
    } catch (e) {
      console.error("Error updating subscription:", e);
      return null;
    }
  },

  // --- Payment History ---

  getPaymentHistory: async (companyId: string, limit: number = 50) => {
    if (!supabase) return [];
    try {
      const { data, error } = await supabase
        .from('payment_history')
        .select('*')
        .eq('company_id', companyId)
        .order('payment_date', { ascending: false })
        .limit(limit);

      if (error) {
        console.error("Error fetching payment history:", error);
        return [];
      }

      if (!data || !Array.isArray(data)) {
        return [];
      }

      return data.map(payment => ({
        id: payment.id,
        companyId: payment.company_id,
        subscriptionId: payment.subscription_id,
        amount: parseFloat(payment.amount),
        currency: payment.currency,
        status: payment.status,
        paymentMethod: payment.payment_method,
        transactionId: payment.transaction_id,
        invoiceNumber: payment.invoice_number,
        description: payment.description,
        paymentDate: payment.payment_date,
        metadata: payment.metadata || {},
        createdAt: payment.created_at
      }));
    } catch (e) {
      console.error("Error fetching payment history:", e);
      return [];
    }
  },

  createPaymentRecord: async (paymentData: {
    companyId: string;
    subscriptionId?: string;
    amount: number;
    currency?: string;
    status: string;
    paymentMethod?: string;
    transactionId?: string;
    invoiceNumber?: string;
    description?: string;
    paymentDate?: string;
    metadata?: any;
  }) => {
    if (!supabase) return null;
    try {
      const { data, error } = await supabase
        .from('payment_history')
        .insert({
          company_id: paymentData.companyId,
          subscription_id: paymentData.subscriptionId,
          amount: paymentData.amount,
          currency: paymentData.currency || 'JMD',
          status: paymentData.status,
          payment_method: paymentData.paymentMethod || 'card',
          transaction_id: paymentData.transactionId,
          invoice_number: paymentData.invoiceNumber,
          description: paymentData.description,
          payment_date: paymentData.paymentDate || new Date().toISOString(),
          metadata: paymentData.metadata || {}
        })
        .select()
        .single();

      if (error) {
        console.error("Error creating payment record:", error);
        return null;
      }

      return data;
    } catch (e) {
      console.error("Error creating payment record:", e);
      return null;
    }
  },

  getAllSubscriptions: async () => {
    if (!supabase) return [];
    try {
      const { data, error } = await supabase
        .from('subscriptions')
        .select('*, companies(name)')
        .order('created_at', { ascending: false });

      if (error) {
        console.error("Error fetching all subscriptions:", error);
        return [];
      }

      return data;
    } catch (e) {
      console.error("Error fetching all subscriptions:", e);
      return [];
    }
  },

  getAllPayments: async (limit: number = 1000) => {
    if (!supabase) return [];
    try {
      const { data, error } = await supabase
        .from('payment_history')
        .select('*, companies(name)')
        .eq('status', 'completed')
        .order('payment_date', { ascending: false })
        .limit(limit);

      if (error) {
        console.error("Error fetching all payments:", error);
        return [];
      }

      return data;
    } catch (e) {
      console.error("Error fetching all payments:", e);
      return [];
    }
  },

  getAllSuperAdmins: async (): Promise<User[]> => {
    if (!supabase) return [];
    try {
      const { data, error } = await supabase
        .from('app_users')
        .select('*')
        .eq('role', 'SUPER_ADMIN')
        .order('created_at', { ascending: false });

      if (error) {
        console.error("Error fetching super admins:", error);
        return [];
      }

      if (!data) return [];

      return data.map(u => ({
        id: u.id,
        name: u.name,
        email: u.email,
        role: u.role as any,
        companyId: u.company_id,
        isOnboarded: u.is_onboarded,
        avatarUrl: u.avatar_url || undefined,
        phone: u.phone || undefined
      }));
    } catch (e) {
      console.error("Error fetching super admins:", e);
      return [];
    }
  },

  deleteUser: async (userId: string): Promise<boolean> => {
    if (!supabase) return false;
    try {
      const { error } = await supabase
        .from('app_users')
        .delete()
        .eq('id', userId);

      if (error) {
        console.error("Error deleting user:", error);
        return false;
      }

      return true;
    } catch (e) {
      console.error("Error deleting user:", e);
      return false;
    }
  },

  // Delete user account and all associated data
  deleteAccount: async (userId: string, userRole: string, companyId?: string): Promise<boolean> => {
    if (!supabase) return false;
    try {
      // 1. Get user's auth_user_id before deletion
      const { data: userData, error: fetchError } = await supabase
        .from('app_users')
        .select('auth_user_id, company_id')
        .eq('id', userId)
        .maybeSingle();

      if (fetchError) {
        console.error("Error fetching user for deletion:", fetchError);
        return false;
      }

      const authUserId = userData?.auth_user_id;
      const userCompanyId = companyId || userData?.company_id;

      // 2. If user is OWNER, delete the company (cascade will delete employees, pay runs, etc.)
      if (userRole === 'OWNER' && userCompanyId) {
        const { error: companyError } = await supabase
          .from('companies')
          .delete()
          .eq('id', userCompanyId);

        if (companyError) {
          console.error("Error deleting company:", companyError);
          // Continue with user deletion even if company deletion fails
        } else {
          console.log("✅ Company deleted (cascade will handle related data)");
        }
      }

      // 3. Delete app_users record
      const { error: userError } = await supabase
        .from('app_users')
        .delete()
        .eq('id', userId);

      if (userError) {
        console.error("Error deleting app_users record:", userError);
        return false;
      }

      // 4. Delete auth user if auth_user_id exists (requires service role)
      if (authUserId) {
        try {
          const serviceRoleKey = import.meta.env?.VITE_SUPABASE_SERVICE_ROLE_KEY;
          const supabaseUrl = import.meta.env?.VITE_SUPABASE_URL || localStorage.getItem('VITE_SUPABASE_URL');
          
          if (serviceRoleKey && supabaseUrl) {
            const { createClient } = await import('@supabase/supabase-js');
            const adminClient = createClient(supabaseUrl, serviceRoleKey, {
              auth: {
                autoRefreshToken: false,
                persistSession: false
              }
            });

            const { error: authError } = await adminClient.auth.admin.deleteUser(authUserId);
            if (authError) {
              console.warn("Could not delete auth user:", authError);
              // Continue - user is already deleted from app_users
            } else {
              console.log("✅ Auth user deleted");
            }
          } else {
            console.warn("Service role key not available - auth user may still exist");
          }
        } catch (authDeleteError) {
          console.warn("Error deleting auth user:", authDeleteError);
          // Continue - user is already deleted from app_users
        }
      }

      return true;
    } catch (e) {
      console.error("Error deleting account:", e);
      return false;
    }
  },

  // --- Reseller Client Management ---

  // Save a reseller invite (pending client)
  saveResellerInvite: async (
    resellerId: string,
    email: string,
    token: string,
    contactName?: string,
    companyName?: string
  ): Promise<boolean> => {
    if (!supabase) return false;
    try {
      const { error } = await supabase
        .from('reseller_invites')
        .upsert({
          reseller_id: resellerId,
          invite_email: email,
          invite_token: token,
          contact_name: contactName,
          company_name: companyName,
          status: 'PENDING',
        }, {
          onConflict: 'reseller_id,invite_email',
        });

      if (error) {
        console.error('Error saving reseller invite:', error);
        return false;
      }

      return true;
    } catch (e) {
      console.error('Exception in saveResellerInvite:', e);
      return false;
    }
  },

  // Get all reseller invites (pending clients)
  getResellerInvites: async (resellerId: string): Promise<any[]> => {
    if (!supabase) return [];
    try {
      const { data, error } = await supabase
        .from('reseller_invites')
        .select('*')
        .eq('reseller_id', resellerId)
        .eq('status', 'PENDING')
        .order('invited_at', { ascending: false });

      if (error) {
        console.error('Error fetching reseller invites:', error);
        return [];
      }

      return data || [];
    } catch (e) {
      console.error('Exception in getResellerInvites:', e);
      return [];
    }
  },

  // Accept a reseller invite and create the client relationship
  acceptResellerInvite: async (token: string, clientCompanyId: string): Promise<boolean> => {
    if (!supabase) return false;
    try {
      // Get the invite
      const { data: invite, error: fetchError } = await supabase
        .from('reseller_invites')
        .select('*')
        .eq('invite_token', token)
        .eq('status', 'PENDING')
        .single();

      if (fetchError || !invite) {
        console.error('Invite not found or already accepted:', fetchError);
        return false;
      }

      // Check if expired
      if (new Date(invite.expires_at) < new Date()) {
        console.error('Invite has expired');
        return false;
      }

      // Create the reseller-client relationship
      const { error: clientError } = await supabase
        .from('reseller_clients')
        .insert({
          reseller_id: invite.reseller_id,
          client_company_id: clientCompanyId,
          status: 'ACTIVE',
          access_level: 'FULL',
        });

      if (clientError) {
        console.error('Error creating reseller-client relationship:', clientError);
        return false;
      }

      // Mark invite as accepted
      const { error: updateError } = await supabase
        .from('reseller_invites')
        .update({
          status: 'ACCEPTED',
          accepted_at: new Date().toISOString(),
        })
        .eq('id', invite.id);

      if (updateError) {
        console.error('Error updating invite status:', updateError);
      }

      return true;
    } catch (e) {
      console.error('Exception in acceptResellerInvite:', e);
      return false;
    }
  },

  // Create or update reseller-client relationship
  saveResellerClient: async (resellerId: string, clientCompanyId: string, data?: {
    status?: 'ACTIVE' | 'SUSPENDED' | 'TERMINATED' | 'PENDING';
    accessLevel?: 'VIEW_ONLY' | 'MANAGE' | 'FULL';
    monthlyBaseFee?: number;
    perEmployeeFee?: number;
    discountRate?: number;
  }): Promise<boolean> => {
    if (!supabase) return false;
    try {
      const { error } = await supabase
        .from('reseller_clients')
        .upsert({
          reseller_id: resellerId,
          client_company_id: clientCompanyId,
          status: data?.status || 'ACTIVE',
          access_level: data?.accessLevel || 'FULL',
          monthly_base_fee: data?.monthlyBaseFee || 3000.00,
          per_employee_fee: data?.perEmployeeFee || 100.00,
          discount_rate: data?.discountRate || 0.00,
          relationship_start_date: new Date().toISOString().split('T')[0],
          updated_at: new Date().toISOString()
        }, {
          onConflict: 'reseller_id,client_company_id'
        });

      if (error) {
        console.error("Error saving reseller-client relationship:", error);
        return false;
      }

      // Also update the company's reseller_id field
      const { error: updateError } = await supabase
        .from('companies')
        .update({ reseller_id: resellerId })
        .eq('id', clientCompanyId);

      if (updateError) {
        console.error("Error updating company reseller_id:", updateError);
        // Don't fail the whole operation if this fails
      }

      return true;
    } catch (e) {
      console.error("Error saving reseller-client relationship:", e);
      return false;
    }
  },

  // Save reseller client with service role (bypasses RLS)
  saveResellerClientWithServiceRole: async (resellerId: string, clientCompanyId: string, data?: {
    status?: 'ACTIVE' | 'SUSPENDED' | 'TERMINATED';
    accessLevel?: 'VIEW_ONLY' | 'MANAGE' | 'FULL';
    monthlyBaseFee?: number;
    perEmployeeFee?: number;
    discountRate?: number;
  }): Promise<boolean> => {
    // Try with service role key if available
    const serviceRoleKey = import.meta.env?.VITE_SUPABASE_SERVICE_ROLE_KEY;
    const supabaseUrl = import.meta.env?.VITE_SUPABASE_URL || localStorage.getItem('VITE_SUPABASE_URL');
    
    if (serviceRoleKey && supabaseUrl) {
      try {
        const { createClient } = await import('@supabase/supabase-js');
        const adminClient = createClient(supabaseUrl, serviceRoleKey, {
          auth: {
            autoRefreshToken: false,
            persistSession: false
          }
        });

        const { error } = await adminClient
          .from('reseller_clients')
          .upsert({
            reseller_id: resellerId,
            client_company_id: clientCompanyId,
            status: data?.status || 'ACTIVE',
            access_level: data?.accessLevel || 'FULL',
            monthly_base_fee: data?.monthlyBaseFee || 3000.00,
            per_employee_fee: data?.perEmployeeFee || 100.00,
            discount_rate: data?.discountRate || 0.00,
            relationship_start_date: new Date().toISOString().split('T')[0],
            updated_at: new Date().toISOString()
          }, {
            onConflict: 'reseller_id,client_company_id'
          });

        if (error) {
          console.error("Error saving reseller-client relationship (service role):", error);
          return false;
        }

        // Also update the company's reseller_id field
        const { error: updateError } = await adminClient
          .from('companies')
          .update({ reseller_id: resellerId })
          .eq('id', clientCompanyId);

        if (updateError) {
          console.error("Error updating company reseller_id:", updateError);
          // Don't fail the whole operation if this fails
        }

        return true;
      } catch (e) {
        console.error("Error with service role client:", e);
        // Fall through to regular client
      }
    }

    // Fallback to regular client (may fail due to RLS)
    return await supabaseService.saveResellerClient(resellerId, clientCompanyId, data);
  },

  // Cancel a reseller invite
  cancelResellerInvite: async (inviteId: string): Promise<boolean> => {
    if (!supabase) return false;
    try {
      const { error } = await supabase
        .from('reseller_invites')
        .delete()
        .eq('id', inviteId);

      if (error) {
        console.error('Error canceling reseller invite:', error);
        return false;
      }

      return true;
    } catch (e) {
      console.error('Exception in cancelResellerInvite:', e);
      return false;
    }
  },

  // Get reseller clients
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
            settings
          )
        `)
        .eq('reseller_id', resellerId)
        .order('created_at', { ascending: false });

      if (error) {
        console.error("Error fetching reseller clients:", error);
        return [];
      }

      if (!data || !Array.isArray(data)) {
        return [];
      }

      return data.map((rc: any) => {
        const company = rc.client_company;
        return {
          id: company?.id || rc.client_company_id,
          companyName: company?.name || 'Unknown Company',
          contactName: company?.email || '',
          email: company?.email || '',
          plan: company?.plan || 'Free',
          employeeCount: company?.settings?.employeeCount || 0,
          status: rc.status || 'ACTIVE',
          mrr: (rc.monthly_base_fee || 0) + ((rc.per_employee_fee || 0) * (company?.settings?.employeeCount || 0))
        };
      });
    } catch (e) {
      console.error("Error fetching reseller clients:", e);
      return [];
    }
  }
};