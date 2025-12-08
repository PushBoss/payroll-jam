

import { Employee, PayRun, WeeklyTimesheet, User, CompanySettings, TaxConfig, DocumentTemplate, IntegrationConfig, LeaveRequest, GlobalConfig, ResellerClient, PricingPlan, Department, Designation, AuditLogEntry, Asset, PerformanceReview } from '../types';

const STORAGE_KEYS = {
  EMPLOYEES: 'payroll_jam_employees',
  TIMESHEETS: 'payroll_jam_timesheets',
  PAY_RUNS: 'payroll_jam_payruns',
  COMPANY_DATA: 'payroll_jam_company',
  TAX_CONFIG: 'payroll_jam_tax_config',
  USER: 'payroll_jam_user',
  TEMPLATES: 'payroll_jam_templates',
  INTEGRATION: 'payroll_jam_integration',
  LEAVE_REQUESTS: 'payroll_jam_leave_requests',
  GLOBAL_CONFIG: 'payroll_jam_global_config',
  TENANTS: 'payroll_jam_tenants',
  PRICING_PLANS: 'payroll_jam_pricing_plans',
  COMPANY_USERS: 'payroll_jam_company_users',
  SUPER_ADMINS: 'payroll_jam_super_admins',
  DEPARTMENTS: 'payroll_jam_departments',
  DESIGNATIONS: 'payroll_jam_designations',
  AUDIT_LOGS: 'payroll_jam_audit_logs',
  ASSETS: 'payroll_jam_assets',
  REVIEWS: 'payroll_jam_reviews'
};

export const storage = {
  saveEmployees: (data: Employee[]) => localStorage.setItem(STORAGE_KEYS.EMPLOYEES, JSON.stringify(data)),
  getEmployees: (): Employee[] | null => {
    const data = localStorage.getItem(STORAGE_KEYS.EMPLOYEES);
    return data ? JSON.parse(data) : null;
  },

  saveTimesheets: (data: WeeklyTimesheet[]) => localStorage.setItem(STORAGE_KEYS.TIMESHEETS, JSON.stringify(data)),
  getTimesheets: (): WeeklyTimesheet[] | null => {
    const data = localStorage.getItem(STORAGE_KEYS.TIMESHEETS);
    return data ? JSON.parse(data) : null;
  },

  savePayRuns: (data: PayRun[]) => localStorage.setItem(STORAGE_KEYS.PAY_RUNS, JSON.stringify(data)),
  getPayRuns: (): PayRun[] | null => {
    const data = localStorage.getItem(STORAGE_KEYS.PAY_RUNS);
    return data ? JSON.parse(data) : null;
  },

  saveCompanyData: (data: CompanySettings) => localStorage.setItem(STORAGE_KEYS.COMPANY_DATA, JSON.stringify(data)),
  getCompanyData: (): CompanySettings | null => {
    const data = localStorage.getItem(STORAGE_KEYS.COMPANY_DATA);
    return data ? JSON.parse(data) : null;
  },

  saveTaxConfig: (data: TaxConfig) => localStorage.setItem(STORAGE_KEYS.TAX_CONFIG, JSON.stringify(data)),
  getTaxConfig: (): TaxConfig | null => {
    const data = localStorage.getItem(STORAGE_KEYS.TAX_CONFIG);
    return data ? JSON.parse(data) : null;
  },

  saveIntegrationConfig: (data: IntegrationConfig) => localStorage.setItem(STORAGE_KEYS.INTEGRATION, JSON.stringify(data)),
  getIntegrationConfig: (): IntegrationConfig | null => {
    const data = localStorage.getItem(STORAGE_KEYS.INTEGRATION);
    return data ? JSON.parse(data) : null;
  },

  saveTemplates: (data: DocumentTemplate[]) => localStorage.setItem(STORAGE_KEYS.TEMPLATES, JSON.stringify(data)),
  getTemplates: (): DocumentTemplate[] | null => {
    const data = localStorage.getItem(STORAGE_KEYS.TEMPLATES);
    return data ? JSON.parse(data) : null;
  },

  saveLeaveRequests: (data: LeaveRequest[]) => localStorage.setItem(STORAGE_KEYS.LEAVE_REQUESTS, JSON.stringify(data)),
  getLeaveRequests: (): LeaveRequest[] | null => {
    const data = localStorage.getItem(STORAGE_KEYS.LEAVE_REQUESTS);
    return data ? JSON.parse(data) : null;
  },

  saveGlobalConfig: (data: GlobalConfig) => localStorage.setItem(STORAGE_KEYS.GLOBAL_CONFIG, JSON.stringify(data)),
  getGlobalConfig: (): GlobalConfig | null => {
    const data = localStorage.getItem(STORAGE_KEYS.GLOBAL_CONFIG);
    return data ? JSON.parse(data) : null;
  },

  saveTenants: (data: ResellerClient[]) => localStorage.setItem(STORAGE_KEYS.TENANTS, JSON.stringify(data)),
  getTenants: (): ResellerClient[] | null => {
    const data = localStorage.getItem(STORAGE_KEYS.TENANTS);
    return data ? JSON.parse(data) : null;
  },

  savePricingPlans: (data: PricingPlan[]) => localStorage.setItem(STORAGE_KEYS.PRICING_PLANS, JSON.stringify(data)),
  getPricingPlans: (): PricingPlan[] | null => {
    const data = localStorage.getItem(STORAGE_KEYS.PRICING_PLANS);
    return data ? JSON.parse(data) : null;
  },

  saveCompanyUsers: (data: User[]) => localStorage.setItem(STORAGE_KEYS.COMPANY_USERS, JSON.stringify(data)),
  getCompanyUsers: (): User[] | null => {
    const data = localStorage.getItem(STORAGE_KEYS.COMPANY_USERS);
    return data ? JSON.parse(data) : null;
  },

  saveSuperAdmins: (data: User[]) => localStorage.setItem(STORAGE_KEYS.SUPER_ADMINS, JSON.stringify(data)),
  getSuperAdmins: (): User[] | null => {
    const data = localStorage.getItem(STORAGE_KEYS.SUPER_ADMINS);
    return data ? JSON.parse(data) : null;
  },

  saveDepartments: (data: Department[]) => localStorage.setItem(STORAGE_KEYS.DEPARTMENTS, JSON.stringify(data)),
  getDepartments: (): Department[] | null => {
    const data = localStorage.getItem(STORAGE_KEYS.DEPARTMENTS);
    return data ? JSON.parse(data) : null;
  },

  saveDesignations: (data: Designation[]) => localStorage.setItem(STORAGE_KEYS.DESIGNATIONS, JSON.stringify(data)),
  getDesignations: (): Designation[] | null => {
    const data = localStorage.getItem(STORAGE_KEYS.DESIGNATIONS);
    return data ? JSON.parse(data) : null;
  },

  saveAuditLogs: (data: AuditLogEntry[]) => localStorage.setItem(STORAGE_KEYS.AUDIT_LOGS, JSON.stringify(data)),
  getAuditLogs: (): AuditLogEntry[] | null => {
    const data = localStorage.getItem(STORAGE_KEYS.AUDIT_LOGS);
    return data ? JSON.parse(data) : null;
  },

  saveAssets: (data: Asset[]) => localStorage.setItem(STORAGE_KEYS.ASSETS, JSON.stringify(data)),
  getAssets: (): Asset[] | null => {
    const data = localStorage.getItem(STORAGE_KEYS.ASSETS);
    return data ? JSON.parse(data) : null;
  },

  saveReviews: (data: PerformanceReview[]) => localStorage.setItem(STORAGE_KEYS.REVIEWS, JSON.stringify(data)),
  getReviews: (): PerformanceReview[] | null => {
    const data = localStorage.getItem(STORAGE_KEYS.REVIEWS);
    return data ? JSON.parse(data) : null;
  },

  saveUser: (data: User | null) => {
    if (data) localStorage.setItem(STORAGE_KEYS.USER, JSON.stringify(data));
    else localStorage.removeItem(STORAGE_KEYS.USER);
  },
  getUser: (): User | null => {
    const data = localStorage.getItem(STORAGE_KEYS.USER);
    return data ? JSON.parse(data) : null;
  },
  
  clearAll: () => {
    localStorage.clear();
  }
};
