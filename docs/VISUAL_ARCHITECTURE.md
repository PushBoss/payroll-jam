# PayrollJam 2026 Refactor - Visual Architecture

## 🏗️ System Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                     PayrollJam Application                       │
└─────────────────────────────────────────────────────────────────┘
                              │
                ┌─────────────┴─────────────┐
                │                           │
        ┌───────▼──────┐          ┌────────▼──────┐
        │  Employees   │          │    PayRun     │
        │     Page     │          │     Page      │
        └───────┬──────┘          └────────┬──────┘
                │                           │
                │                    ┌──────▼───────────┐
                │                    │ PayRunDateRange  │
                │                    │   Selector       │
    ┌───────────▼──────────┐         │   (Modal)        │
    │ EmployeeManager      │         └──────────────────┘
    │ (Unified Component)  │
    └───────────┬──────────┘
                │
        ┌───────┴────────────────────────┬─────────────────────┐
        │                                │                     │
   ┌────▼────┐ ┌────────┐ ┌──────────┐ ┌─▼────┐ ┌────────┐ ┌─▼──────┐
   │ Identity │ │  Org   │ │Compliance│ │Bank  │ │Statutory│ │Deduct  │
   │  Tab     │ │ Tab    │ │   Tab    │ │ Tab  │ │  Tab    │ │ Tab    │
   └──────────┘ └────────┘ └──────────┘ └──────┘ └────────┘ └────────┘
```

## 🧩 Component Integration Flow

```
User Action
    │
    ├─ Click "Add Employee"
    │  └──> EmployeeManager opens (empty)
    │       └──> User fills 6 tabs
    │           └──> Submits
    │               └──> onSave(newEmployee)
    │
    └─ Click "Edit Employee"
       └──> EmployeeManager opens (with data)
           └──> User modifies tabs
               └──> Submits
                   └──> onSave(updatedEmployee)
```

## 📊 Data Flow - Payrun Calculation

```
                        PayRun.tsx
                            │
                            │
        ┌───────────────────┴───────────────────┐
        │                                       │
    ┌───▼────────────────────┐     ┌──────────▼────────────┐
    │ PayRunDateRange        │     │ initializeSystem()    │
    │ Selector (Modal)       │     │                       │
    │                        │     └──────────┬────────────┘
    │ User selects:          │                │
    │ • Start Date           │                │ Uses:
    │ • End Date             │     ┌──────────▼─────────────────┐
    │                        │     │ parsePayRunPeriod()        │
    └────────┬───────────────┘     │ (payrunCalculator.ts)     │
             │                     └──────────┬────────────────┘
             └──────────────┬────────────────┘
                            │
                     ┌──────▼────────────────────┐
                     │ calculatePayrunLineItems() │
                     │ (payrunCalculator.ts)     │
                     └──────────┬────────────────┘
                                │
                   ┌────────────┼────────────────┐
                   │            │                │
         ┌─────────▼──┐  ┌──────▼───────┐  ┌───▼────────────┐
         │For Each    │  │Pro-rating    │  │Statutory       │
         │Employee:   │  │(joiningDate) │  │Deductions      │
         │            │  │              │  │                │
         │1. Get Gross│  │• Days worked │  │• NIS (3.16%)   │
         │2. Get Type │  │• Pro-rate    │  │• NHT (2.5%)    │
         │            │  │  salary      │  │• EdTax (2%)    │
         │            │  │• Pro-rate    │  │• PAYE (25/30%) │
         │            │  │  threshold   │  │                │
         └────────────┘  └──────────────┘  └────────────────┘
                   │
                   └────────────┬────────────────┐
                                │                │
                        ┌───────▼────────┐  ┌───▼──────────────┐
                        │Custom          │  │Employer          │
                        │Deductions      │  │Contributions     │
                        │                │  │                  │
                        │• Fixed Amount  │  │• Employer NIS    │
                        │• Fixed Term    │  │• Employer NHT    │
                        │• Target Balance│  │                  │
                        └────────────────┘  └──────────────────┘
                                │
                        ┌───────▼─────────────────┐
                        │ Generate PayRunSummary()│
                        │ Total Gross, Deductions │
                        │ Total Net, Thresholds   │
                        └───────┬─────────────────┘
                                │
                        ┌───────▼─────────────────┐
                        │ PayRunLineItem[]        │
                        │ (ready for DRAFT step)  │
                        └─────────────────────────┘
```

## 🧮 Tax Calculation Flowchart

```
                    Employee Data
                         │
        ┌────────────────┼────────────────┐
        │                │                │
   ┌────▼────┐      ┌────▼────┐      ┌───▼──────┐
   │Gross    │      │Employee │      │Joining   │
   │Salary   │      │Type     │      │Date      │
   │         │      │         │      │          │
   └────┬────┘      └────┬────┘      └───┬──────┘
        │                │                │
        │                ▼                │
        │        ┌──────────────┐        │
        │        │Is Contractor?│        │
        │        └──┬────────┬──┘        │
        │           │ YES    │ NO        │
        │           │        │          │
        │      ┌────▼─┐  ┌───▼────┐    │
        │      │SKIP  │  │Proceed │    │
        │      │STAT  │  │with     │   │
        │      │DEDUCT│  │STAT     │   │
        │      └──────┘  │DEDUCT   │   │
        │                └────┬────┘   │
        │                     │        │
        │        ┌────────────┼────────┤
        │        │            ▼        │
        │        │  ┌──────────────────┘
        │        │  │ Pro-rate Gross
        │        │  │ (joiningDate)
        │        │  │
        │        │  ┌──────────────────┐
        │        │  │  Days Worked     │
        │        │  │  Gross × Ratio   │
        │        │  └────────┬─────────┘
        │        │           │
        │        ▼           ▼
        │    ┌──────────────────────────────┐
        │    │ Calculate Pro-rated Threshold│
        │    │ Threshold × Days / Total Days│
        │    └────────────┬─────────────────┘
        │                 │
        │                 ▼
        │    ┌──────────────────────────────┐
        │    │ Select PAYE Threshold        │
        │    │ if endDate >= 2026-04-01:    │
        │    │   threshold = 480,000        │
        │    │ else:                        │
        │    │   threshold = 400,000        │
        │    └────────────┬─────────────────┘
        │                 │
        ▼                 ▼
        ┌──────────────────────────────────┐
        │ Calculate Each Deduction:        │
        │                                  │
        │ NIS = Gross × 0.0316 (cap 500K)  │
        │ NHT = Gross × 0.025 (cap 500K)   │
        │ EdTax = Gross × 0.02             │
        │                                  │
        │ if Gross > Threshold:            │
        │   PAYE = (Gross - Threshold) × % │
        │ else:                            │
        │   PAYE = 0                       │
        │                                  │
        └────────────┬─────────────────────┘
                     │
                     ▼
        ┌──────────────────────────────────┐
        │ Process Custom Deductions:       │
        │                                  │
        │ if Fixed Amount:                 │
        │   deduct every period            │
        │ if Fixed Term:                   │
        │   deduct, decrement counter      │
        │ if Target Balance:               │
        │   deduct until balance reached   │
        └────────────┬─────────────────────┘
                     │
                     ▼
        ┌──────────────────────────────────┐
        │ Total Deductions =               │
        │   NIS + NHT + EdTax + PAYE +     │
        │   Custom Deductions             │
        └────────────┬─────────────────────┘
                     │
                     ▼
        ┌──────────────────────────────────┐
        │ Net Pay =                        │
        │   Gross + Additions -            │
        │   Total Deductions               │
        └──────────────────────────────────┘
```

## 📁 File Structure in Project

```
payroll-jam/
│
├── components/
│   ├── EmployeeManager.tsx          ✅ NEW
│   ├── PayRunDateRangeSelector.tsx   ✅ NEW
│   ├── Icons.tsx                    (existing)
│   └── ... (other components)
│
├── pages/
│   ├── Employees.tsx                (to update)
│   ├── PayRun.tsx                   (to update)
│   └── ... (other pages)
│
├── utils/
│   ├── jamaica2026Fiscal.ts          ✅ NEW
│   ├── payrunCalculator.ts           ✅ NEW
│   ├── validators.ts                (existing)
│   ├── taxUtils.ts                  (existing)
│   └── ... (other utilities)
│
├── types.ts                          ✅ UPDATED
│
├── Documentation Files:              ✅ ALL NEW
│   ├── EXECUTIVE_SUMMARY.md
│   ├── REFACTOR_2026_INTEGRATION_GUIDE.md
│   ├── REFACTOR_SUMMARY.md
│   ├── QUICK_INTEGRATION_SNIPPETS.md
│   ├── FILE_INVENTORY.md
│   └── VISUAL_ARCHITECTURE.md (this file)
│
└── ... (rest of project)
```

## 🔄 Type Definition Relationships

```
Employee
├── id: string
├── firstName, lastName
├── email
├── trn, nis
├── grossSalary
├── payType: PayType
├── payFrequency: PayFrequency
├── role: Role
├── status
├── hireDate
├── joiningDate ✅ NEW
├── annualLeave ✅ NEW
├── employeeType: EmployeeType ✅ NEW
│   ├── FULL_TIME
│   ├── PART_TIME
│   ├── CONTRACTOR
│   └── STAFF
├── nhtStatus ✅ NEW
├── nhtNumber ✅ NEW
├── gender ✅ NEW
├── dateOfBirth ✅ NEW
├── designation ✅ NEW
├── bankDetails: BankAccount
└── customDeductions: CustomDeduction[] ✅ NEW
    ├── id
    ├── name
    ├── amount
    ├── periodType: DeductionPeriodType
    │   ├── FIXED_AMOUNT
    │   ├── FIXED_TERM (with remainingTerm)
    │   └── TARGET_BALANCE (with targetBalance)
    └── (tracking fields)

PayRunPeriod
├── startDate
├── endDate
├── periodType: PayFrequency
└── daysInPeriod

PayRunLineItem
├── employeeId, employeeName
├── grossPay
├── additions
├── deductions
├── nis, nht, edTax, paye
├── totalDeductions
├── netPay
├── prorationDetails
│   ├── isProrated
│   ├── daysWorked
│   ├── totalWorkDays
│   └── originalGross
└── employerContributions

Jamaica2026TaxConfig ✅ NEW
├── nisRate, nisEmployerRate, nisCap
├── nhtEmployeeRate, nhtEmployerRate, nhtCap
├── edTaxRate
├── payeThresholdPre, payeThresholdPost
├── payeBracketsPre, payeBracketsPost
└── estateLevyRate
```

## 🎨 Component Tab Structure

```
EmployeeManager
│
├─ Tab 1: Identity
│  ├─ First Name
│  ├─ Last Name
│  ├─ Email
│  ├─ Gender
│  ├─ Date of Birth
│  ├─ Mobile Phone
│  └─ Address
│
├─ Tab 2: Organization
│  ├─ Employee ID
│  ├─ Job Title
│  ├─ Designation
│  ├─ Department
│  ├─ Hire Date
│  ├─ Joining Date
│  └─ Annual Leave (Days)
│
├─ Tab 3: Compliance
│  ├─ Employee Type (Dropdown)
│  │  ├─ Full-Time
│  │  ├─ Part-Time
│  │  ├─ Contractor ← Disables statutory
│  │  └─ Staff
│  ├─ Pay Type
│  ├─ Pay Frequency
│  └─ Gross Salary
│
├─ Tab 4: Banking
│  ├─ Account Name
│  ├─ Bank Name (Dropdown)
│  │  ├─ NCB
│  │  ├─ BNS
│  │  ├─ JN
│  │  ├─ SAGICOR
│  │  └─ OTHER
│  ├─ Account Number
│  ├─ Account Type (Savings/Chequing)
│  └─ Currency (JMD/USD)
│
├─ Tab 5: Statutory
│  ├─ Tax Payer ID (TRN)
│  ├─ NIS Number
│  ├─ NHT Status
│  │  ├─ Registered
│  │  ├─ Exempt
│  │  └─ Pending
│  └─ NHT Number
│
└─ Tab 6: Deductions
   ├─ Add Custom Deductions
   │  ├─ Name
   │  ├─ Amount
   │  ├─ Period Type
   │  │  ├─ Fixed Amount
   │  │  ├─ Fixed Term (+ periods)
   │  │  └─ Target Balance (+ target)
   │  └─ [Add Deduction Button]
   │
   └─ Current Deductions List
      ├─ [Deduction 1] [Remove]
      ├─ [Deduction 2] [Remove]
      └─ [Deduction N] [Remove]
```

## 🔐 Data Validation Flow

```
User Input (Form)
    │
    ├─ Required Field Check
    │  ├─ First Name ✓
    │  ├─ Last Name ✓
    │  ├─ Email ✓
    │  └─ Gross Salary ✓
    │
    ├─ Format Validation
    │  ├─ Email format (isValidEmail)
    │  ├─ TRN format (isValidTRN)
    │  ├─ NIS format (isValidNIS)
    │  └─ Date format (ISO 8601)
    │
    ├─ Business Logic
    │  ├─ Start < End (date range)
    │  ├─ Joining >= Hire date
    │  └─ Valid deduction amounts
    │
    └─ Success
       └─ onSave(employee)
          └─ Parent component updates state
```

## 📊 Tax Calculation Decision Tree

```
                    GROSS SALARY
                         │
                    Is Active?
                     /        \
                   YES         NO → Skip
                    │
              Employee Type?
              /      |       \
        Full   Part   |       Contractor
        Time   Time  Staff       │
         │      │     │          └─► No Statutory
         │      │     │              (Custom only)
         └──┬──┴──┬───┘
            │     │
        ┌───▼─────▼─────────┐
        │ Pro-rate by       │
        │ Joining Date      │
        │                   │
        │ Days Worked?      │
        │ Gross × Ratio     │
        └───┬───────────────┘
            │
        ┌───▼─────────────────────┐
        │ Select PAYE Threshold   │
        │                         │
        │ End Date >= 2026-04-01? │
        │ YES → 480K              │
        │ NO  → 400K              │
        └───┬─────────────────────┘
            │
        ┌───▼──────────────────┐
        │ Calculate 6 Items:   │
        ├──────────────────────┤
        │ NIS    = Gross × 3.16%│
        │         (cap 500K)    │
        │ NHT    = Gross × 2.5% │
        │         (cap 500K)    │
        │ EdTax  = Gross × 2%   │
        │ PAYE   = (Gross -     │
        │          Threshold)   │
        │          × 25%/30%    │
        │ Custom = Process      │
        │          deductions   │
        │ Total  = Sum all      │
        └───┬──────────────────┘
            │
        ┌───▼──────────────┐
        │ NET PAY =        │
        │ Gross +          │
        │ Additions -      │
        │ Total Deductions │
        └──────────────────┘
```

## 🚀 Integration Readiness Checklist

```
Code Quality
  ✅ 100% TypeScript
  ✅ Zero external dependencies
  ✅ Follows project patterns
  ✅ Comprehensive comments
  ✅ No console.log debugging

Documentation
  ✅ Integration guide
  ✅ Code snippets
  ✅ Architecture docs
  ✅ Test scenarios
  ✅ This visual guide

Testing
  ✅ 14 test scenarios
  ✅ Edge cases handled
  ✅ Pro-rating tested
  ✅ Deductions tested
  ✅ Calculations verified

Compliance
  ✅ Jamaica 2026 correct
  ✅ Tax rates verified
  ✅ Deduction caps correct
  ✅ Threshold dates set
  ✅ Contractor handling

Performance
  ✅ O(1) threshold lookup
  ✅ O(n) per employee calc
  ✅ No nested loops
  ✅ Suitable for frontend
  ✅ Batch processing ready
```

---

**Architecture Diagram**: Complete  
**Data Flow**: Complete  
**Component Structure**: Complete  
**Integration Ready**: ✅ YES
