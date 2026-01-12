export enum Role {
  OWNER = 'OWNER',
  ADMIN = 'ADMIN',
  MANAGER = 'MANAGER',
  EMPLOYEE = 'EMPLOYEE',
  RESELLER = 'RESELLER',
  SUPER_ADMIN = 'SUPER_ADMIN'
}

export enum PayFrequency {
  WEEKLY = 'WEEKLY',
  FORTNIGHTLY = 'FORTNIGHTLY',
  MONTHLY = 'MONTHLY'
}

export enum PayType {
  SALARIED = 'SALARIED',
  HOURLY = 'HOURLY',
  COMMISSION = 'COMMISSION'
}

export interface User {
  id: string;
  name: string;
  email: string;
  role: Role;
  companyId?: string;
  isOnboarded?: boolean;
  avatarUrl?: string;
  phone?: string;
  onboardingToken?: string; // For invite links
  // Used for Reseller Impersonation
  originalRole?: Role;
  isResellerView?: boolean;
}

export interface Department {
  id: string;
  name: string;
}

export interface Designation {
  id: string;
  title: string;
  departmentId: string;
}

export interface Allowance {
  id: string;
  name: string;
  amount: number;
  isTaxable: boolean;
}

export interface Deduction {
  id: string;
  name: string;
  amount: number;
}

export interface BankAccount {
  bankName: 'NCB' | 'BNS' | 'JN' | 'SAGICOR' | 'OTHER';
  accountNumber: string;
  accountType: 'SAVINGS' | 'CHEQUING';
  branchCode?: string; // Essential for some banks
  currency: 'JMD' | 'USD';
}

// HR Assets
export enum AssetType {
  LAPTOP = 'LAPTOP',
  MOBILE = 'MOBILE',
  VEHICLE = 'VEHICLE',
  UNIFORM = 'UNIFORM',
  OTHER = 'OTHER'
}

export enum AssetStatus {
  ASSIGNED = 'ASSIGNED',
  RETURNED = 'RETURNED',
  LOST = 'LOST',
  REPAIR = 'REPAIR'
}

export interface Asset {
  id: string;
  name: string;
  type: AssetType;
  serialNumber?: string;
  value?: number;
  employeeId: string;
  assignedDate: string;
  returnedDate?: string;
  status: AssetStatus;
  notes?: string;
}

// HR Performance
export interface PerformanceReview {
  id: string;
  employeeId: string;
  reviewerName: string;
  date: string;
  rating: number; // 1-5
  summary: string;
  goals: string[];
}

export interface TerminationDetails {
  date: string;
  reason: 'RESIGNATION' | 'REDUNDANCY' | 'DISMISSAL' | 'RETIREMENT' | 'OTHER';
  noticeDate?: string;
  payoutVacationDays?: number;
  severanceAmount?: number;
  notes?: string;
  p45Generated?: boolean;
}

export interface Employee {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  trn: string; // Tax Registration Number
  nis: string; // National Insurance Scheme
  employeeId?: string; // User-defined Employee ID (e.g., "EMP001", "12345")
  grossSalary: number; // Base Salary for Salaried/Commission
  hourlyRate?: number; // For hourly employees
  payType: PayType;
  payFrequency: PayFrequency;
  role: Role;
  status: 'ACTIVE' | 'ARCHIVED' | 'PENDING_ONBOARDING' | 'PENDING_VERIFICATION' | 'TERMINATED';
  hireDate: string;
  onboardingToken?: string;

  // Extended Profile Fields
  jobTitle?: string;
  department?: string;
  phone?: string;
  address?: string;
  emergencyContact?: string;

  // Verification Documents
  verificationDocuments?: {
    fileName: string;
    fileUrl: string;
    uploadedAt: string;
  }[];
  documentsVerifiedAt?: string; // When employer verified the documents
  documentsVerifiedBy?: string; // User ID who verified

  allowances?: Allowance[];
  deductions?: Deduction[];
  leaveBalance?: {
    vacation: number;
    sick: number;
    personal: number;
  };
  bankDetails?: BankAccount;

  // Exiting info
  terminationDetails?: TerminationDetails;
}

export enum LeaveType {
  VACATION = 'VACATION',
  SICK = 'SICK',
  MATERNITY = 'MATERNITY',
  UNPAID = 'UNPAID'
}

export interface LeaveRequest {
  id: string;
  employeeId: string;
  employeeName: string;
  type: LeaveType;
  startDate: string;
  endDate: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  reason: string;
  days: number;
  requestedDates?: string[];
  approvedDates?: string[];
}

export interface StatutoryDeductions {
  nis: number;
  nht: number;
  edTax: number;
  paye: number;
  totalDeductions: number;
  netPay: number;
}

export interface EmployerContributions {
  employerNIS: number;
  employerNHT: number;
  employerEdTax: number;
  employerHEART: number;
  totalEmployerCost: number;
}

export interface PayrollItemDetail {
  id: string;
  name: string;
  amount: number;
  isTaxable?: boolean; // Added to support tax logic
}

export interface PayRunLineItem extends StatutoryDeductions {
  employeeId: string;
  employeeName: string;
  employeeCustomId?: string; // User-defined Employee ID (e.g., "EMP001")
  grossPay: number;
  additions: number; // Total Bonuses
  deductions: number; // Total Other deductions

  // Detailed Breakdowns
  additionsBreakdown?: PayrollItemDetail[];
  deductionsBreakdown?: PayrollItemDetail[];

  // Proration Info
  prorationDetails?: {
    isProrated: boolean;
    daysWorked: number;
    totalWorkDays: number;
    originalGross: number;
  };

  // Tax Override Flags (for editable calculations)
  isTaxOverridden?: boolean;
  isGrossOverridden?: boolean;
  originalCalculatedGross?: number;
  taxOverrideReason?: string;

  // Employer contributions (for S01/S02 reporting)
  employerContributions?: EmployerContributions;

  // Bank details for payment file generation
  bankName?: string;
  accountNumber?: string;
}

export interface PayRun {
  id: string;
  periodStart: string;
  periodEnd: string;
  payDate: string;
  status: 'DRAFT' | 'APPROVED' | 'FINALIZED';
  totalGross: number;
  totalNet: number;
  lineItems: PayRunLineItem[];
  payFrequency?: 'WEEKLY' | 'FORTNIGHTLY' | 'MONTHLY'; // Optional for backward compatibility
}

export interface ChatMessage {
  role: 'user' | 'model';
  text: string;
  timestamp: number;
}

export interface Payslip {
  id: string;
  date: string;
  period: string;
  netPay: number;
  downloadUrl: string;
}

export interface ResellerClient {
  id: string;
  companyName: string;
  contactName: string;
  email: string;
  employeeCount: number;
  plan: 'Free' | 'Starter' | 'Pro' | 'Enterprise' | 'Reseller';
  status: 'ACTIVE' | 'PENDING' | 'SUSPENDED';
  subscriptionStatus?: 'ACTIVE' | 'PAST_DUE' | 'SUSPENDED' | 'PENDING_PAYMENT';
  mrr: number;
  createdAt?: string;
}

export interface PricingPlan {
  id: string;
  name: string;
  priceConfig: {
    type: 'free' | 'flat' | 'per_emp' | 'base';
    monthly: number;
    annual: number;
    baseFee?: number;
    perUserFee?: number;
    resellerCommission?: number; // Percentage commission for resellers
  };
  description: string;
  limit: string; // "5", "25", "100", "Unlimited"
  features: string[];
  cta: string;
  highlight: boolean;
  color: string;
  textColor: string;
  isActive: boolean;
}

export interface PaymentRecord {
  id: string;
  amount: number;
  date: string;
  plan: string;
  method: 'Card' | 'PayPal' | 'Bank Transfer';
  status: 'COMPLETED' | 'FAILED' | 'REFUNDED';
  referenceId: string;
}

// Time & Attendance Types
export interface TimeEntry {
  id: string;
  date: string;
  startTime: string;
  endTime: string;
  breakDuration: number; // in minutes
  totalHours: number;
  isOvertime: boolean;
}

export interface WeeklyTimesheet {
  id: string;
  employeeId: string;
  employeeName: string;
  weekStartDate: string; // Monday
  weekEndDate: string;   // Sunday
  status: 'DRAFT' | 'SUBMITTED' | 'APPROVED' | 'REJECTED';
  totalRegularHours: number;
  totalOvertimeHours: number;
  entries: TimeEntry[];
}

// Accounting Integration Types
export interface GLMapping {
  id: string;
  payrollItem: string; // e.g., 'Gross Salary', 'Employer NIS'
  glCode: string; // e.g., '6000', '2100'
  accountName: string;
}

export interface IntegrationConfig {
  provider: 'QuickBooks' | 'Xero' | 'CSV';
  mappings: GLMapping[];
}

// Persistence Types
export interface CompanySettings {
  id?: string; // Optional company ID
  name: string;
  email?: string; // Added for associations
  trn: string;
  address: string;
  phone: string;
  bankName: string;
  accountNumber: string;
  branchCode: string;
  payFrequency?: string;
  defaultPayDate?: string;
  subscriptionStatus?: 'ACTIVE' | 'PAST_DUE' | 'SUSPENDED' | 'PENDING_PAYMENT';
  plan?: string;
  billingCycle?: 'MONTHLY' | 'ANNUAL';
  employeeLimit?: string;
  paymentMethod?: 'card' | 'direct-deposit';
}

export interface TaxConfig {
  nisRate: number;
  nisCap: number;
  nhtRate: number;
  edTaxRate: number;
  payeThreshold: number;
  payeRateStd: number;
  payeRateHigh: number;
}

export interface GlobalConfig {
  dataSource?: 'LOCAL' | 'SUPABASE';
  currency: 'JMD' | 'USD';
  pricingPlans?: PricingPlan[];
  emailjs?: {
    serviceId: string;
    templateId: string;
    publicKey: string;
  };
  smtp?: {
    host: string;
    port: number;
    user: string;
    pass: string;
    fromName: string;
    fromEmail: string;
  };
  paypal: {
    enabled: boolean;
    mode: 'sandbox' | 'live';
    clientId: string;
    secret: string;
  };
  dimepay: {
    enabled: boolean;
    environment: 'sandbox' | 'production';
    sandbox: {
      apiKey: string;
      secretKey: string;
      merchantId: string;
      domain: string;
    };
    production: {
      apiKey: string;
      secretKey: string;
      merchantId: string;
      domain: string;
    };
    passFeesTo: 'MERCHANT' | 'CUSTOMER';
  };
  stripe: {
    enabled: boolean;
    publishableKey: string;
    secretKey: string;
  };
  manual: {
    enabled: boolean;
    instructions: string;
  };
  maintenanceMode?: boolean;
  systemBanner?: {
    active: boolean;
    message: string;
    type: 'INFO' | 'WARNING' | 'ERROR';
  };
}

// Document Templates
export enum TemplateCategory {
  CONTRACT = 'Contract',
  LETTER = 'Letter',
  NOTICE = 'Notice',
  FORM = 'Form',
  JOB_LETTER = 'JOB_LETTER',
  SALARY_CERTIFICATE = 'SALARY_CERTIFICATE',
  TERMINATION = 'TERMINATION'
}

export interface DocumentTemplate {
  id: string;
  name: string;
  category: TemplateCategory;
  content: string; // HTML or Markdown content
  lastModified: string;
  requiresApproval?: boolean;
}

export interface DocumentRequest {
  id: string;
  employeeId: string;
  employeeName: string;
  templateId: string;
  documentType: string;
  purpose: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'GENERATED' | 'DELIVERED';
  requestedAt: string;
  reviewedBy?: string;
  reviewedAt?: string;
  rejectionReason?: string;
  generatedContent?: string;
  fileUrl?: string;
}

export interface ExpertReferral {
  id: string;
  companyId: string;
  userId: string;
  userName: string;
  question: string;
  category: 'TAX' | 'LABOUR_LAW' | 'PAYROLL' | 'COMPLIANCE';
  urgency: 'LOW' | 'NORMAL' | 'HIGH';
  status: 'PENDING' | 'ASSIGNED' | 'RESPONDED' | 'CLOSED';
  assignedResellerId?: string;
  assignedExpertId?: string;
  expertResponse?: string;
  createdAt: string;
  respondedAt?: string;
}

// Audit & Security Types
export interface AuditLogEntry {
  id: string;
  timestamp: string; // ISO String
  actorId: string;
  actorName: string;
  action: 'CREATE' | 'UPDATE' | 'DELETE' | 'APPROVE' | 'REJECT' | 'LOGIN' | 'EXPORT' | 'SETTINGS' | 'VERIFY' | 'ARCHIVE';
  entity: string; // e.g. 'Employee', 'PayRun'
  description: string;
  ipAddress?: string; // Mocked
}

// Available Placeholders for Documents
export const DOCUMENT_PLACEHOLDERS = [
  { key: '{{firstName}}', label: 'First Name' },
  { key: '{{lastName}}', label: 'Last Name' },
  { key: '{{address}}', label: 'Employee Address' },
  { key: '{{trn}}', label: 'TRN' },
  { key: '{{grossSalary}}', label: 'Salary Amount' },
  { key: '{{role}}', label: 'Job Title' },
  { key: '{{hireDate}}', label: 'Start Date' },
  { key: '{{companyName}}', label: 'Company Name' },
  { key: '{{currentDate}}', label: 'Current Date' },
];