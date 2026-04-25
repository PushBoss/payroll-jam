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

export enum EmployeeType {
  STAFF = 'STAFF',
  HOURLY = 'HOURLY',
  CONTRACTOR = 'CONTRACTOR'
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

export interface CustomDeduction {
  id: string;
  name: string;
  amount: number;
  periodType: 'FIXED_TERM' | 'TARGET_BALANCE';
  remainingTerm?: number; // For fixed-term deductions
  periodFrequency?: 'WEEKLY' | 'FORTNIGHTLY' | 'MONTHLY'; // Period frequency for remaining terms
  currentBalance?: number; // For target-balance deductions
  targetBalance?: number; // Target to reach
}

export interface PAYEBracket {
  threshold: number;
  rateStd: number;
  rateHigh: number;
  effectiveFrom: string;
  effectiveUntil?: string;
}

export interface Jamaica2026TaxConfig {
  nisRate: number;
  nisEmployerRate: number;
  nisCap: number;
  nisMaxContribution: number;
  nhtRate: number;
  nhtEmployeeRate: number;
  nhtEmployerRate: number;
  nhtCap: number;
  edTaxRate: number;
  payeThresholdPre: number;
  payeThresholdPost: number;
  payeRateStd: number;
  payeRateHigh: number;
  payeThreshold: number;
  payeBracketsPre: PAYEBracket[];
  payeBracketsPost: PAYEBracket[];
  estateLevyRate: number;
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
  joiningDate?: string; // When employee joined (for pro-rating)
  employeeType?: EmployeeType; // STAFF, HOURLY, CONTRACTOR
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
  customDeductions?: CustomDeduction[];
  leaveBalance?: {
    vacation: number;
    sick: number;
    personal: number;
  };
  bankDetails?: BankAccount;

  // Pension Details
  pensionContributionRate?: number; // e.g., 5 for 5%
  pensionProvider?: string; // Name of pension provider

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
  pension: number;
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

export interface BillingGift {
  giftedUntil: string;
  grantedAt: string;
  grantedBy: string;
  grantedByName?: string;
  monthsGranted: number;
  note?: string;
  employeeLimitOverride?: string;
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
  billingGift?: BillingGift;
  hasActiveBillingGift?: boolean;
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
  resellerId?: string;
  policies?: Record<string, any>;
  reseller_defaults?: Record<string, any>;
  taxConfig?: TaxConfig;
  departments?: Department[];
  designations?: Designation[];
  billingGift?: BillingGift;
}


export interface TaxConfig {
  nisRateEmployee: number;
  nisRateEmployer: number;
  nisCap: number;
  nhtRateEmployee: number;
  nhtRateEmployer: number;
  nhtCap: number;
  edTaxRateEmployee: number;
  edTaxRateEmployer: number;
  heartRateEmployer: number;
  payeThreshold: number;
  payeThresholdHigh: number;
  payeRateStd: number;
  payeRateHigh: number;
}



export interface GlobalConfig {
  dataSource?: 'LOCAL' | 'SUPABASE';
  currency: 'JMD' | 'USD';
  pricingPlans?: PricingPlan[];
  supportEmail?: string;
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

// ─── DB Row Types ────────────────────────────────────────────────
// These represent the raw shapes returned by Supabase queries.
// Use these as the type parameter for `.map()` callbacks instead of `any`.

export interface DbAppUserRow {
  id: string;
  auth_user_id?: string;
  name: string;
  email: string;
  role: string;
  company_id?: string | null;
  is_onboarded?: boolean;
  avatar_url?: string | null;
  phone?: string | null;
  onboarding_token?: string | null;
  preferences?: Record<string, unknown>;
  created_at?: string;
}

export interface DbEmployeeRow {
  id: string;
  company_id: string;
  first_name: string;
  last_name: string;
  email: string;
  trn: string;
  nis: string;
  role: string;
  status: string;
  hire_date: string;
  joining_date?: string | null;
  job_title?: string | null;
  department?: string | null;
  phone?: string | null;
  address?: string | null;
  emergency_contact?: string | null;
  employee_number?: string | null;
  employee_id?: string | null;
  gross_salary?: number;
  hourly_rate?: number | null;
  pay_type?: string;
  pay_frequency?: string;
  pay_data?: {
    grossSalary?: number;
    hourlyRate?: number;
    payType?: string;
    payFrequency?: string;
  } | null;
  bank_details?: BankAccount | null;
  leave_balance?: { vacation: number; sick: number; personal: number } | null;
  allowances?: Allowance[] | null;
  deductions?: unknown;
  custom_deductions?: unknown;
  pension_contribution_rate?: number | null;
  pension_provider?: string | null;
  termination_details?: TerminationDetails | null;
  onboarding_token?: string | null;
  companies?: { name: string } | null;
}

export interface DbPayRunRow {
  id: string;
  company_id: string;
  period_start: string;
  period_end: string;
  pay_date: string;
  pay_frequency?: string;
  status: string;
  total_gross: number;
  total_net: number;
  employee_count?: number;
  line_items?: PayRunLineItem[] | null;
}

export interface DbCompanyRow {
  id: string;
  name: string;
  email?: string | null;
  trn?: string;
  address?: string;
  plan?: string | null;
  status?: string;
  owner_id?: string | null;
  reseller_id?: string | null;
  settings?: Record<string, unknown>;
  departments?: Department[];
  designations?: Designation[];
  created_at?: string;
}

export interface DbResellerClientRow {
  id?: string;
  reseller_id: string;
  client_company_id: string;
  status?: string;
  access_level?: string;
  monthly_base_fee?: number;
  per_employee_fee?: number;
  discount_rate?: number;
  created_at?: string;
  client_company?: DbCompanyRow | null;
  companies?: DbCompanyRow | null;
}

export interface DbAuditLogRow {
  id: string;
  timestamp: string;
  actor_id?: string;
  actor_name: string;
  action: string;
  entity: string;
  description: string;
  ip_address?: string;
  company_id?: string;
}

// ─── Safe Coercion Helpers ───────────────────────────────────────
// These convert raw DB strings to typed enums/unions without 'as any'.

const ROLE_VALUES = new Set<string>(Object.values(Role));
export const toRole = (value: string | null | undefined): Role =>
  ROLE_VALUES.has(value?.toUpperCase() ?? '') ? (value!.toUpperCase() as Role) : Role.EMPLOYEE;

const PAY_TYPE_VALUES = new Set<string>(Object.values(PayType));
export const toPayType = (value: string | null | undefined): PayType =>
  PAY_TYPE_VALUES.has(value ?? '') ? (value as PayType) : PayType.SALARIED;

const PAY_FREQ_VALUES = new Set<string>(Object.values(PayFrequency));
export const toPayFrequency = (value: string | null | undefined): PayFrequency =>
  PAY_FREQ_VALUES.has(value ?? '') ? (value as PayFrequency) : PayFrequency.MONTHLY;

export type PlanLabel = 'Free' | 'Starter' | 'Pro' | 'Enterprise' | 'Reseller';
const PLAN_LABELS = new Set<string>(['Free', 'Starter', 'Pro', 'Enterprise', 'Reseller']);
export const toPlanLabel = (value: string | null | undefined): PlanLabel =>
  PLAN_LABELS.has(value ?? '') ? (value as PlanLabel) : 'Free';

export type CompanyStatus = 'ACTIVE' | 'PAST_DUE' | 'SUSPENDED' | 'PENDING_PAYMENT' | 'PENDING_APPROVAL';
export const toCompanyStatus = (value: string | null | undefined): CompanyStatus =>
  (['ACTIVE', 'PAST_DUE', 'SUSPENDED', 'PENDING_PAYMENT', 'PENDING_APPROVAL'] as const)
    .includes(value as CompanyStatus) ? (value as CompanyStatus) : 'ACTIVE';

export type EmployeeStatus = 'ACTIVE' | 'ARCHIVED' | 'PENDING_ONBOARDING' | 'PENDING_VERIFICATION' | 'TERMINATED';
export const toEmployeeStatus = (value: string | null | undefined): EmployeeStatus =>
  (['ACTIVE', 'ARCHIVED', 'PENDING_ONBOARDING', 'PENDING_VERIFICATION', 'TERMINATED'] as const)
    .includes(value as EmployeeStatus) ? (value as EmployeeStatus) : 'ACTIVE';
