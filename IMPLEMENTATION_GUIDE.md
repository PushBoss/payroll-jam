# Payroll Jam - Backend Implementation Guide

## Overview
This guide documents the comprehensive backend implementation for Payroll Jam, a Jamaican payroll management system with full tax compliance, editable calculations, and multi-tenant architecture.

## 📋 Implementation Status

### ✅ Completed Features

#### 1. **Tax Calculation Engine** (COMPLETED)
- **File**: `utils/taxUtils.ts`
- **Features**:
  - Corrected employee contribution rates (NIS: 3%, NHT: 2%, Ed Tax: 2.25%)
  - Added employer contribution rates (NIS: 2.5%, NHT: 3%, Ed Tax: 2.25%, HEART: 3%)
  - New function: `calculateEmployerContributions()`
  - Cumulative PAYE calculation for accurate tax smoothing
  - Proration for mid-period hires

**Jamaican Tax Compliance (2025 Rates)**:
```typescript
Employee Contributions:
- NIS: 3% (capped at JMD 5M annually)
- NHT: 2%
- Education Tax: 2.25% on statutory income (Gross - NIS)
- PAYE: 25% (up to JMD 6M), 30% above

Employer Contributions:
- NIS: 2.5% (capped at JMD 5M annually)
- NHT: 3%
- Education Tax: 2.25%
- HEART/NTF: 3%
```

#### 2. **Database Schema** (COMPLETED)
- **File**: `supabase_schema_complete.sql`
- **Tables Created**:
  - Core: `companies`, `app_users`, `employees`, `departments`
  - Payroll: `pay_runs`, `pay_run_line_items`, `employee_ytd`
  - Time & Attendance: `timesheets`, `leave_requests`
  - Compliance: `statutory_reports`, `compliance_deadlines`
  - Documents: `document_templates`, `document_requests`
  - Reseller: `reseller_clients`, `subscriptions`, `invoices`
  - Audit: `audit_logs`, `notifications`
  - Additional: `employee_assets`, `performance_reviews`, `ai_usage`, `expert_referrals`

**Key Features**:
- Row Level Security (RLS) policies for multi-tenancy
- Automatic timestamp triggers
- Employee limit enforcement
- Indexed for performance
- JSONB columns for flexible data storage

#### 3. **Supabase Service Layer** (COMPLETED)
- **File**: `services/supabaseService.ts`
- **New Functions**:
  - `getTimesheets()`, `saveTimesheet()`, `approveTimesheet()`, `rejectTimesheet()`
  - `getDocumentRequests()`, `saveDocumentRequest()`, `approveDocumentRequest()`, `rejectDocumentRequest()`
  - `getDocumentTemplates()`
  - `getExpertReferrals()`, `saveExpertReferral()`
  - `getEmployeeYTD()`, `updateEmployeeYTD()`

#### 4. **Enhanced Type Definitions** (COMPLETED)
- **File**: `types.ts`
- **New Types**:
  - `EmployerContributions` - Employer tax contribution breakdown
  - `DocumentRequest` - Document approval workflow
  - `ExpertReferral` - "Ask an Expert" feature
- **Enhanced Types**:
  - `PayRunLineItem` - Added employer contributions, override flags, bank details
  - `DocumentTemplate` - Added approval requirements

#### 5. **Payroll Hook Enhancements** (COMPLETED)
- **File**: `hooks/usePayroll.ts`
- **Features**:
  - Integrated employer contribution calculations
  - Bank details included in line items for payment file generation
  - Override flags for editable calculations

#### 6. **Environment Configuration** (COMPLETED)
- **File**: `.env.local`
- Supabase credentials configured:
  - Project URL: `https://arqbxlaudfbmiqvwwmnt.supabase.co`
  - Anonymous key configured
  - Service role key configured

---

## 🚧 Next Steps for Full Implementation

### Priority 1: Database Deployment
```bash
# You need to execute the schema on your Supabase instance
# Option 1: Via Supabase Dashboard
1. Go to https://supabase.com/dashboard/project/arqbxlaudfbmiqvwwmnt
2. Navigate to SQL Editor
3. Copy contents of supabase_schema_complete.sql
4. Execute the SQL

# Option 2: Via psql (if installed)
psql -h aws-0-us-east-1.pooler.supabase.com \
  -p 6543 \
  -U postgres.arqbxlaudfbmiqvwwmnt \
  -d postgres \
  -f supabase_schema_complete.sql
```

### Priority 2: Pay Run Workflow Enhancements

**Features to Implement**:

1. **Calendar Dropdown for Pay Date Selection**
   - **File**: `pages/PayRun.tsx`
   - **Action**: Replace current date input with a proper calendar picker
   - Add validation to ensure pay date is after period end

2. **CSV Import Parser**
   - **File**: Create `utils/csvImporter.ts`
   - **Features**:
     - Parse employee CSV with validation
     - Map columns to employee fields
     - TRN and NIS format validation
     - Duplicate detection
   
3. **Bank File Generation**
   - **Files**: `utils/exportHelpers.ts` (already has NCB and BNS generators)
   - **Action**: Test and validate bank file formats with actual bank specifications
   - Add error handling for invalid account numbers

4. **Add Deduction/Incentive Fields**
   - **File**: `pages/PayRun.tsx` (Step 2: Review)
   - **Action**: 
     - Add modal for adding ad-hoc deductions/bonuses per employee
     - Store in `additionsBreakdown` and `deductionsBreakdown`
     - Update totals dynamically

### Priority 3: Compliance Reporting

**S01 Monthly Report** (`pages/Compliance.tsx`):
```typescript
// Add month selector
const generateS01 = (selectedMonth: string) => {
  // Fetch finalized pay runs for the month
  // Aggregate employee and employer contributions
  // Include HEART/NTF employer contribution
  // Format per S01 specification
}
```

**P24/P25 Separation**:
- P24: Termination certificate (employee leaves)
- P25: Annual tax certificate (calendar year-end)
- Create separate generation functions

**S02 Annual Return**:
- Aggregate all finalized pay runs for tax year
- Employee-by-employee breakdown
- Export to CSV/PDF

### Priority 4: Timesheet Approval Workflow

**UI Updates** (`pages/TimeSheets.tsx`):
```typescript
// Add date navigation
const [selectedWeek, setSelectedWeek] = useState<Date>(new Date());

// Navigation controls
<button onClick={() => navigateWeek(-1)}>Previous Week</button>
<button onClick={() => navigateWeek(1)}>Next Week</button>

// Approval modal for managers
const approveTimesheet = async (timesheetId: string) => {
  await supabaseService.approveTimesheet(timesheetId, currentUser.id);
  refreshTimesheets();
}
```

**Integration with Pay Run**:
- When calculating hourly employees, fetch approved timesheets for period
- Calculate regular hours + overtime (1.5x rate)
- Display timesheet-derived hours in pay run review

### Priority 5: Document Approval Workflow

**Admin Pre-Approval for Job Letters** (`pages/Documents.tsx`):

```typescript
// Employee makes request
const requestDocument = async (templateId: string, purpose: string) => {
  const request: DocumentRequest = {
    id: generateId(),
    employeeId: currentUser.id,
    employeeName: currentUser.name,
    templateId,
    documentType: 'JOB_LETTER',
    purpose,
    status: 'PENDING',
    requestedAt: new Date().toISOString()
  };
  await supabaseService.saveDocumentRequest(request, companyId);
}

// Admin reviews and approves
const approveRequest = async (requestId: string) => {
  // Generate document with employee data placeholders
  const content = generateDocumentContent(request, employee);
  await supabaseService.approveDocumentRequest(requestId, currentUser.id, content);
  // Send notification to employee
}
```

**Request Queue**:
- Admin dashboard shows pending document requests
- One-click approve/reject with reason
- Email notification on approval/rejection

### Priority 6: "Ask an Expert" Feature

**Implementation** (`pages/Dashboard.tsx` or new `pages/AskExpert.tsx`):

```typescript
const AskExpertButton = () => {
  const [question, setQuestion] = useState('');
  const [category, setCategory] = useState<'TAX' | 'LABOUR_LAW' | 'PAYROLL' | 'COMPLIANCE'>('PAYROLL');
  
  const submitQuestion = async () => {
    const referral: ExpertReferral = {
      id: generateId(),
      companyId,
      userId: currentUser.id,
      userName: currentUser.name,
      question,
      category,
      urgency: 'NORMAL',
      status: 'PENDING',
      createdAt: new Date().toISOString()
    };
    
    await supabaseService.saveExpertReferral(referral);
    
    // Auto-assign to reseller if company has one
    if (company.reseller_id) {
      // Notify reseller via email
      await emailService.sendExpertReferralNotification(company.reseller_id, referral);
    }
    
    alert('Your question has been sent to an expert. You will receive a response within 24 hours.');
  };
  
  return (
    <button onClick={() => setShowModal(true)}>
      Ask an Expert
    </button>
  );
}
```

**Reseller Dashboard Integration**:
- Add "Expert Referrals" tab to `pages/ResellerDashboard.tsx`
- Show all pending questions from clients
- Allow resellers to respond directly
- Track conversion rate (referral → new client)

### Priority 7: YTD Tracking & Cumulative PAYE

**Auto-Update YTD on Pay Run Finalization**:

```typescript
// In usePayroll.ts or PayRun.tsx
const finalizePayRun = async (payRun: PayRun) => {
  const taxYear = new Date(payRun.periodStart).getFullYear();
  
  // Update YTD for each employee
  for (const lineItem of payRun.lineItems) {
    const currentYTD = await supabaseService.getEmployeeYTD(lineItem.employeeId, taxYear);
    
    const updatedYTD = {
      ytdGross: (currentYTD?.ytdGross || 0) + lineItem.grossPay + lineItem.additions,
      ytdNIS: (currentYTD?.ytdNIS || 0) + lineItem.nis,
      ytdPAYE: (currentYTD?.ytdPAYE || 0) + lineItem.paye,
      ytdEmployerNIS: (currentYTD?.ytdEmployerNIS || 0) + (lineItem.employerContributions?.employerNIS || 0),
      ytdEmployerNHT: (currentYTD?.ytdEmployerNHT || 0) + (lineItem.employerContributions?.employerNHT || 0),
      ytdEmployerEdTax: (currentYTD?.ytdEmployerEdTax || 0) + (lineItem.employerContributions?.employerEdTax || 0),
      ytdEmployerHEART: (currentYTD?.ytdEmployerHEART || 0) + (lineItem.employerContributions?.employerHEART || 0),
      periodsPaid: (currentYTD?.periodsPaid || 0) + 1,
      lastPayDate: payRun.payDate
    };
    
    await supabaseService.updateEmployeeYTD(lineItem.employeeId, companyId, taxYear, updatedYTD);
  }
  
  // Mark pay run as finalized
  payRun.status = 'FINALIZED';
  await supabaseService.savePayRun(payRun, companyId);
}
```

### Priority 8: Editable Calculations UI

**Tax Override Modal** (Already partially implemented in `PayRun.tsx`):
- Store original calculated values
- Flag `isTaxOverridden = true`
- Require override reason for audit trail
- Display warning banner: "User-edited values - Payroll Jam is not liable for accuracy"

**Gross Adjustment**:
- Allow direct edit of gross salary in pay run table
- Recalculate taxes based on new gross
- Store `originalCalculatedGross` for audit

**Liability Disclaimer**:
```typescript
// Add to every pay run and report
const LiabilityDisclaimer = () => (
  <div className="bg-yellow-50 border border-yellow-200 p-4 rounded">
    <p className="text-sm">
      <strong>Important:</strong> Payroll Jam provides calculated estimates based on Jamaica Tax Administration guidelines. 
      All values are editable by the user. Final accuracy and compliance are the responsibility of the employer. 
      We recommend reviewing all calculations with a qualified accountant before submission to TAJ.
    </p>
  </div>
);
```

---

## 🗄️ Database Schema Highlights

### Multi-Tenancy
All tables include `company_id` for tenant isolation. RLS policies ensure users only access their own company data (or reseller access to clients).

### Key Relationships
```
companies (1) -----> (*) employees
companies (1) -----> (*) pay_runs
pay_runs (1) -----> (*) pay_run_line_items
employees (1) -----> (*) pay_run_line_items
employees (1) -----> (1) employee_ytd (per tax year)
employees (1) -----> (*) timesheets
employees (1) -----> (*) leave_requests
companies (1) -----> (*) reseller_clients (via reseller_id)
```

### JSONB Flexibility
Several tables use JSONB columns for flexible schema:
- `employees.pay_data` - Salary, hourly rate, frequency
- `employees.bank_details` - Banking information
- `employees.allowances`, `employees.deductions` - Arrays
- `pay_runs.line_items` - Full payslip details
- `pay_runs.employer_contributions` - Aggregated employer costs
- `timesheets.entries` - Daily hour entries

---

## 🔐 Security Considerations

### Row Level Security (RLS)
- Enabled on all tables
- Users can only SELECT/UPDATE/DELETE records in their own company
- Resellers have special policies to access client companies

### Authentication
Current implementation uses localStorage mock auth. **Production requires**:
```typescript
// Integrate Supabase Auth
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

// Sign up
const { data, error } = await supabase.auth.signUp({
  email: 'user@example.com',
  password: 'secure-password'
})

// Sign in
const { data, error } = await supabase.auth.signInWithPassword({
  email: 'user@example.com',
  password: 'secure-password'
})

// Get current user
const { data: { user } } = await supabase.auth.getUser()
```

### API Keys
- Never commit `.env.local` to git
- Use environment variables in production
- Rotate service role key periodically

---

## 🧪 Testing Checklist

### Tax Calculations
- [ ] Verify NIS caps at JMD 5M annually
- [ ] Test PAYE thresholds (JMD 1.5M and JMD 6M)
- [ ] Validate Education Tax is on statutory income (Gross - NIS)
- [ ] Confirm employer contributions are correct
- [ ] Test cumulative PAYE across multiple pay periods

### Pay Run Workflow
- [ ] Create draft pay run for Monthly cycle
- [ ] Add/remove employees from run
- [ ] Override taxes manually
- [ ] Override gross salary
- [ ] Finalize and verify YTD updates
- [ ] Generate bank files (NCB, BNS)
- [ ] Export GL entries for QuickBooks

### Leave Management
- [ ] Submit leave request as employee
- [ ] Approve/reject as manager
- [ ] Partial approval for specific dates
- [ ] Verify unpaid leave deduction in pay run

### Timesheets
- [ ] Submit timesheet as hourly employee
- [ ] Approve as manager
- [ ] Verify hours flow into pay run calculation
- [ ] Test overtime calculation (1.5x rate)

### Compliance Reports
- [ ] Generate S01 for a specific month
- [ ] Verify employer contributions are included
- [ ] Generate S02 for full tax year
- [ ] Generate P24 on employee termination
- [ ] Generate P25 at year-end

---

## 📊 Key Metrics to Track

### System Health
- Database query performance (< 200ms for most queries)
- API response times
- Error rates (aim for < 0.1%)

### Business Metrics
- Active companies
- Total employees managed
- Pay runs processed per month
- Average payroll cost per employee
- Reseller conversion rate (referrals → clients)

### Compliance
- On-time S01 filings
- Data completeness (% employees with valid TRN/NIS)
- Tax calculation accuracy (compare against manual calculation)

---

## 🐛 Known Issues & Limitations

1. **Database Schema Not Yet Deployed**
   - Schema file created but not executed on Supabase
   - Manual execution required via SQL Editor

2. **Authentication**
   - Current demo mode accepts any password
   - Production requires Supabase Auth integration

3. **Email Service**
   - EmailJS configured but needs production credentials
   - Notification emails not yet sent

4. **Payment Integration**
   - Stripe/Dime Pay placeholders exist
   - Real payment processing not implemented

5. **CSV Import**
   - UI exists but parser not fully implemented
   - Needs validation and error handling

6. **AI Assistant**
   - Requires API key configuration
   - Rate limiting not implemented
   - Cost tracking needed

---

## 📚 Reference Documentation

### Jamaican Tax Resources
- Tax Administration Jamaica: https://www.jamaicatax.gov.jm/
- NIS Information: https://www.mlss.gov.jm/
- NHT Guidelines: https://www.nht.gov.jm/
- Labour Law: https://www.mlss.gov.jm/labour-laws/

### Technical Documentation
- Supabase Docs: https://supabase.com/docs
- React: https://react.dev/
- TypeScript: https://www.typescriptlang.org/
- Vite: https://vitejs.dev/

---

## 🚀 Deployment Steps

### 1. Database Setup
```bash
# Execute schema via Supabase Dashboard SQL Editor
# File: supabase_schema_complete.sql
```

### 2. Environment Variables
```bash
# Production .env
VITE_SUPABASE_URL=https://arqbxlaudfbmiqvwwmnt.supabase.co
VITE_SUPABASE_ANON_KEY=your_anon_key
GEMINI_API_KEY=your_gemini_key
```

### 3. Build & Deploy
```bash
npm run build
# Deploy dist/ folder to Vercel/Netlify/AWS
```

### 4. Post-Deployment
- Test all critical workflows
- Set up monitoring (Sentry, LogRocket)
- Configure backup schedule for database
- Enable SSL certificate
- Set up custom domain

---

## 👥 Team Responsibilities

### Backend Developer
- Complete database deployment
- Implement remaining API endpoints
- Write unit tests for tax calculations
- Set up CI/CD pipeline

### Frontend Developer
- Complete UI for new features
- Implement document approval workflow
- Add calendar picker for pay dates
- Build expert referral interface

### QA Engineer
- Create test plans for all workflows
- Validate tax calculations against TAJ specifications
- Perform security audit
- Load testing for multi-tenant architecture

### Product Manager
- User acceptance testing
- Documentation for end users
- Training materials for resellers
- Launch checklist

---

## 📧 Support & Contact

For questions or issues:
- GitHub Issues: (link to repo)
- Email: support@payrolljam.com
- Documentation: (link to docs site)

---

**Last Updated**: December 8, 2025
**Version**: 1.0.0-beta
**Status**: Implementation in Progress (60% Complete)
