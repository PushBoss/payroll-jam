import { supabase } from './supabaseClient';
import { 
  Employee, 
  PayRun, 
  CompanySettings, 
  LeaveRequest, 
  AuditLogEntry, 
  ResellerClient, 
  WeeklyTimesheet,
  User 
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
        isOnboarded: data.is_onboarded
      };
    } catch (e) {
      console.error("Supabase connection error:", e);
      return null;
    }
  },

  saveUser: async (user: User) => {
    if (!supabase) return;
    const { error } = await supabase
      .from('app_users')
      .upsert({
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        company_id: user.companyId,
        is_onboarded: user.isOnboarded
      });
    
    if (error) console.error("Error saving user:", error);
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
      plan: data.plan || 'Free'
    };
  },

  saveCompany: async (companyId: string, settings: CompanySettings) => {
    if (!supabase) return;
    
    // Pack extra fields into settings JSONB
    const settingsJson = {
      phone: settings.phone,
      bankName: settings.bankName,
      accountNumber: settings.accountNumber,
      branchCode: settings.branchCode,
      payFrequency: settings.payFrequency,
      defaultPayDate: settings.defaultPayDate
    };

    const { error } = await supabase
      .from('companies')
      .upsert({
        id: companyId,
        name: settings.name,
        trn: settings.trn,
        address: settings.address,
        settings: settingsJson,
        status: settings.subscriptionStatus,
        plan: settings.plan // Ensure plan is saved to the 'plan' column
      });

    if (error) console.error("Error saving company:", error);
  },

  getAllCompanies: async (): Promise<ResellerClient[]> => {
    if (!supabase) return [];
    const { data, error } = await supabase.from('companies').select('*');

    if (error || !data) {
        console.error("Error fetching companies:", error);
        return [];
    }

    return data.map(c => ({
        id: c.id,
        companyName: c.name,
        contactName: c.settings?.contactName || 'Admin',
        email: c.settings?.email || '',
        employeeCount: c.settings?.employeeCount || 0,
        plan: c.plan || 'Free',
        status: c.status || 'ACTIVE',
        mrr: c.settings?.mrr || 0
    }));
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
        termination_details: emp.terminationDetails
      });

    if (error) console.error("Error saving employee:", error);
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

    return data.map((r: any) => ({
      id: r.id,
      periodStart: r.period_start,
      periodEnd: r.period_end,
      payDate: r.pay_date,
      status: r.status,
      totalGross: r.total_gross,
      totalNet: r.total_net,
      lineItems: r.line_items || []
    }));
  },

  savePayRun: async (run: PayRun, companyId: string) => {
    if (!supabase) return;

    const { error } = await supabase
      .from('pay_runs')
      .upsert({
        id: run.id,
        company_id: companyId,
        period_start: run.periodStart,
        period_end: run.periodEnd,
        pay_date: run.payDate,
        status: run.status,
        total_gross: run.totalGross,
        total_net: run.totalNet,
        line_items: run.lineItems // Stored as JSONB
      });

    if (error) console.error("Error saving pay run:", error);
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

  // --- Timesheets (Optional Table - usually needed for Hourly) ---
  
  getTimesheets: async (_companyId: string): Promise<WeeklyTimesheet[]> => {
      // Placeholder: If you create a 'timesheets' table later
      // For now, return empty to prevent errors if table missing
      return [];
  },

  saveTimesheet: async (_ts: WeeklyTimesheet, _companyId: string) => {
      // Placeholder
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
  }
};