import { supabase } from './supabaseClient';
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
  DocumentTemplate
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
    if (!supabase) {
      console.error("❌ Supabase client not available");
      throw new Error("Supabase client not initialized");
    }
    
    console.log("💾 Saving user to Supabase:", { id: user.id, email: user.email, companyId: user.companyId });
    
    const { data, error } = await supabase
      .from('app_users')
      .upsert({
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        company_id: user.companyId,
        is_onboarded: user.isOnboarded
      })
      .select();
    
    if (error) {
      console.error("❌ Error saving user:", error);
      throw error;
    }
    
    console.log("✅ User saved successfully:", data);
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
  }
};