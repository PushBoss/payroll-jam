# PayrollJam 2026 Jamaican Fiscal Refactor - Integration Guide

## Overview
This guide walks through integrating the new unified Employee Manager and 2026 Jamaican fiscal logic into your PayrollJam system.

## What's Been Completed

### 1. **New Types & Enums** (`types.ts`)

#### New Enums Added:
- `EmployeeType`: FULL_TIME, PART_TIME, CONTRACTOR, STAFF
- `DeductionPeriodType`: FIXED_AMOUNT, FIXED_TERM, TARGET_BALANCE

#### New Interfaces:
- `CustomDeduction`: Tracks deductions with period-based logic
- `Jamaica2026TaxConfig`: 2026-specific PAYE thresholds (Pre-April 1st and Post-April 1st)
- `PAYEBracket`: Tax bracket definition

#### Updated Employee Interface:
```typescript
interface Employee {
  // ... existing fields ...
  joiningDate?: string;           // For pro-rating calculations
  annualLeave?: number;            // Annual leave entitlement
  employeeType?: EmployeeType;     // Full-time, Part-time, Contractor, Staff
  nhtStatus?: 'REGISTERED' | 'EXEMPT' | 'PENDING';
  nhtNumber?: string;
  profileImageUrl?: string;
  gender?: 'MALE' | 'FEMALE' | 'OTHER';
  dateOfBirth?: string;
  designation?: string;
  customDeductions?: CustomDeduction[];
}
```

### 2. **New Components**

#### EmployeeManager (`components/EmployeeManager.tsx`)
A unified, tabbed component for managing employee information with 100% field parity for both add and edit modes.

**Features:**
- 6 tabs: Identity, Organization, Compliance, Banking, Statutory, Deductions
- Tab 1 (Identity): Full name, email, gender, DOB, address, mobile, profile image
- Tab 2 (Org): Employee ID, designation, department, hire date, joining date, annual leave
- Tab 3 (Compliance): Employee type dropdown (contractors disable statutory deductions), pay type, frequency
- Tab 4 (Banking): Account details (name, number, type, bank selection)
- Tab 5 (Statutory): TRN, NIS, NHT status & number
- Tab 6 (Deductions): Dynamic custom deductions with three types:
  - Fixed Amount (always deducted)
  - Fixed Term (deducts X times then stops)
  - Target Balance (deducts until target reached)

**Usage:**
```tsx
<EmployeeManager
  employee={selectedEmployee}
  isOpen={isModalOpen}
  onClose={() => setIsModalOpen(false)}
  onSave={(employee) => onUpdateEmployee(employee)}
/>
```

#### PayRunDateRangeSelector (`components/PayRunDateRangeSelector.tsx`)
Modal component for selecting exact start/end dates for a pay period.

**Features:**
- Quick select buttons (This Week, This Month, Last Month)
- Custom date range selection
- Period summary (frequency, days in period)

**Usage:**
```tsx
<PayRunDateRangeSelector
  payFrequency={PayFrequency.MONTHLY}
  onDateRangeChange={(start, end) => handleDatesSelected(start, end)}
  isOpen={isOpen}
  onClose={() => setIsOpen(false)}
/>
```

### 3. **New Fiscal Utilities**

#### jamaica2026Fiscal.ts
Comprehensive 2026 Jamaican payroll calculations with the following features:

**2026 PAYE Thresholds:**
- **Pre-April 1st**: JMD 400,000 annual threshold
- **Post-April 1st**: JMD 480,000 annual threshold
- Both with 25% standard and 30% high rates

**Statutory Deductions:**
- NIS (National Insurance Scheme): 3.16% employee, capped at 500,000
- NHT (National Health Trust): 2.5% employee on earnings up to 500,000
- Education Tax: 2% on gross salary
- PAYE: Progressive based on threshold and bracket

**Key Functions:**
```typescript
// Get correct PAYE threshold based on end date (pre or post April 1st)
getPAYEThreshold(endDate: string): number

// Calculate pro-rated salary based on joining date
calculateProRatedGross(
  grossSalary: number,
  joiningDate: string | undefined,
  periodStart: string,
  periodEnd: string
): { gross: number; daysWorked: number; totalDays: number }

// Calculate all statutory deductions
calculateStatutoryDeductions(
  grossSalary: number,
  employeeType: EmployeeType | undefined,
  periodEndDate: string
): StatutoryDeductions

// Pro-rate the PAYE threshold
getProratedThreshold(
  threshold: number,
  daysWorked: number,
  totalDays: number
): number

// Comprehensive employee payroll calculation
calculateEmployeePayroll(
  employee: Employee,
  grossSalary: number,
  periodStart: string,
  periodEnd: string,
  additions: number,
  deductions: number
): Partial<PayRunLineItem>

// Process custom deductions (FixedTerm, TargetBalance, etc.)
processCustomDeductions(
  customDeductions: CustomDeduction[] | undefined,
  payPeriodIndex: number
): { totalDeductions: number; updatedDeductions: CustomDeduction[] }

// Calculate employer contributions
calculateEmployerContributions(
  grossSalary: number,
  employeeType: EmployeeType | undefined
): EmployerContributions
```

#### payrunCalculator.ts
High-level payrun calculation utilities:

**Key Functions:**
```typescript
// Parse date range into PayRunPeriod
parsePayRunPeriod(
  startDate: string,
  endDate: string,
  periodType: PayFrequency
): PayRunPeriod

// Get default period dates based on frequency
getDefaultPeriodDates(
  payFrequency: PayFrequency,
  fromDate?: Date
): { startDate: string; endDate: string }

// Calculate all line items for a payrun
calculatePayrunLineItems(
  employees: Employee[],
  period: PayRunPeriod,
  additionalDeductions?: Record<string, number>,
  additionalAdditions?: Record<string, number>
): PayRunLineItem[]

// Get PAYE threshold info for a period
getPayeThresholdForPeriod(periodEndDate: string): {
  threshold: number;
  effectiveDate: string;
  bracket: 'pre-april' | 'post-april';
}

// Generate summary from line items
generatePayRunSummary(
  lineItems: PayRunLineItem[],
  periodStart: string,
  periodEnd: string
): PayRunSummary

// Validate a pay period
validatePayPeriod(period: PayRunPeriod): {
  isValid: boolean;
  errors: string[];
}
```

## Integration Steps

### Step 1: Update Employees.tsx

Replace the old edit modal with the new EmployeeManager component:

```tsx
// At the top of Employees.tsx, add import
import { EmployeeManager } from '../components/EmployeeManager';

// In component state, replace old edit state:
// OLD:
// const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(null);
// const [editTab, setEditTab] = useState<'profile' | 'financial' | 'banking'>('profile');

// NEW:
const [isEmployeeManagerOpen, setIsEmployeeManagerOpen] = useState(false);
const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(null);

// Update the employee action handler:
const handleEditEmployee = (emp: Employee) => {
  setSelectedEmployee(emp);
  setIsEmployeeManagerOpen(true);
};

const handleAddEmployee = () => {
  setSelectedEmployee(null); // Clear for new employee
  setIsEmployeeManagerOpen(true);
};

// In JSX, replace old edit modal with:
<EmployeeManager
  employee={selectedEmployee}
  isOpen={isEmployeeManagerOpen}
  onClose={() => {
    setIsEmployeeManagerOpen(false);
    setSelectedEmployee(null);
  }}
  onSave={(employee) => {
    if (employee.id) {
      onUpdateEmployee(employee);
    } else {
      onAddEmployee({ ...employee, id: generateUUID() });
    }
  }}
/>

// Remove the old Add Employee modal (lines ~939-1100)
// Remove the old Edit Employee modal (lines ~689-938)
```

### Step 2: Update PayRun.tsx

Add date range selector and integrate fiscal logic:

```tsx
// Add import
import { PayRunDateRangeSelector } from '../components/PayRunDateRangeSelector';
import { calculatePayrunLineItems, parsePayRunPeriod } from '../utils/payrunCalculator';
import { Jamaica2026TaxConfig } from '../utils/jamaica2026Fiscal';

// Add state variables
const [periodStartDate, setPeriodStartDate] = useState<string>('');
const [periodEndDate, setPeriodEndDate] = useState<string>('');
const [isDateSelectorOpen, setIsDateSelectorOpen] = useState(false);

// Update the SETUP step UI to include date range selector
// In the SETUP step return, add:
<div>
  <button
    onClick={() => setIsDateSelectorOpen(true)}
    className="w-full py-3 border border-jam-orange rounded-lg text-jam-orange hover:bg-jam-orange hover:text-white transition-all"
  >
    Select Custom Date Range
  </button>
</div>

// Use the new date range selector:
<PayRunDateRangeSelector
  payFrequency={payCycle as PayFrequency}
  onDateRangeChange={(start, end) => {
    setPeriodStartDate(start);
    setPeriodEndDate(end);
  }}
  isOpen={isDateSelectorOpen}
  onClose={() => setIsDateSelectorOpen(false)}
/>

// Update initialization to use date range:
const handleInitializeSystem = () => {
  setIsCalculating(true);
  setTimeout(() => {
    if (!periodStartDate || !periodEndDate) {
      toast.error("Please select a date range");
      setIsCalculating(false);
      return;
    }

    const period = parsePayRunPeriod(
      periodStartDate,
      periodEndDate,
      payCycle as PayFrequency
    );

    const lineItems = calculatePayrunLineItems(
      employees.filter(e => e.status === 'ACTIVE'),
      period,
      {}, // additional deductions
      {}  // additional additions
    );

    if (lineItems.length > 0) {
      loadDraftItems(lineItems);
      setStep('DRAFT');
      auditService.log(currentUser, 'CREATE', 'PayRun', 
        `Initialized draft payroll from ${periodStartDate} to ${periodEndDate}`);
      toast.success("Payroll calculated with pro-rating and 2026 fiscal logic");
    } else {
      toast.error("No eligible employees found for this period");
    }
    setIsCalculating(false);
  }, 800);
};
```

### Step 3: Update usePayroll Hook

Integrate the new pro-rating logic (optional - for advanced features):

```typescript
// In usePayroll.ts, add function to process custom deductions
const processDeductions = (emp: Employee, payPeriodIndex: number) => {
  const { totalDeductions, updatedDeductions } = processCustomDeductions(
    emp.customDeductions,
    payPeriodIndex
  );
  return { totalDeductions, updatedDeductions };
};
```

## Key Features Explained

### Pro-Rating Calculation
When an employee joins mid-period, their gross salary, tax threshold, and deductions are automatically pro-rated based on actual working days:

```
Pro-rated Gross = Full Period Gross × (Days Worked / Total Days in Period)
Pro-rated Threshold = Full Period Threshold × (Days Worked / Total Days in Period)
```

### Contractor Handling
Employees marked as "Contractor" type:
- Have NO statutory deductions (NIS, NHT, Education Tax, PAYE)
- May have custom deductions configured
- Can have estate levy applied separately if needed

### PAYE Threshold Selection
Automatically determined by pay period end date:
- **Before April 1, 2026**: JMD 400,000 threshold
- **April 1, 2026 onwards**: JMD 480,000 threshold

### Custom Deduction Types

1. **Fixed Amount**: Always deducted each period
   ```
   Deduction = Amount each period
   ```

2. **Fixed Term**: Deducted for N periods, then stops
   ```
   Period 1: Deduct Amount, remainingTerm = 11
   Period 2: Deduct Amount, remainingTerm = 10
   ...
   Period 12: Deduct Amount, remainingTerm = 0
   Period 13+: No deduction
   ```

3. **Target Balance**: Deduct until total target reached
   ```
   currentBalance = 0
   Period 1: Deduct min(Amount, targetBalance - currentBalance), currentBalance = Amount
   Period 2: Deduct min(Amount, targetBalance - currentBalance), currentBalance = 2 × Amount
   ...
   When currentBalance >= targetBalance: Stop deducting
   ```

## 2026 Jamaica Tax Constants

```typescript
// NIS
nisRate: 3.16%
nisEmployerRate: 3.35%
nisCap: JMD 500,000

// NHT
nhtEmployeeRate: 2.5%
nhtEmployerRate: 3.0%
nhtCap: JMD 500,000

// Education Tax
edTaxRate: 2.0%

// PAYE
payeRateStd: 25%
payeRateHigh: 30%

// Thresholds
Pre-April 1st:  JMD 400,000
Post-April 1st: JMD 480,000
```

## Testing Checklist

- [ ] Create employee with mid-month joining date → verify pro-rating
- [ ] Create contractor employee → verify no statutory deductions
- [ ] Run payroll across April 1st → verify threshold change
- [ ] Add fixed-term deduction → verify it decrements
- [ ] Add target-balance deduction → verify it stops at target
- [ ] Edit employee in EmployeeManager → verify all 6 tabs save
- [ ] Select custom date range → verify correct period calculation
- [ ] Verify NIS cap applied correctly
- [ ] Verify NHT cap applied correctly
- [ ] Verify PAYE calculation with threshold

## API/Database Considerations

When persisting to Supabase, ensure:

1. **Update Employee table schema**:
   - Add `joining_date` (DATE)
   - Add `annual_leave` (INTEGER)
   - Add `employee_type` (ENUM: FULL_TIME, PART_TIME, CONTRACTOR, STAFF)
   - Add `nht_status` (ENUM: REGISTERED, EXEMPT, PENDING)
   - Add `nht_number` (VARCHAR)
   - Add `gender` (VARCHAR)
   - Add `date_of_birth` (DATE)
   - Add `designation` (VARCHAR)
   - Add `custom_deductions` (JSONB)

2. **Migration SQL Example**:
```sql
ALTER TABLE employees ADD COLUMN joining_date DATE;
ALTER TABLE employees ADD COLUMN annual_leave INTEGER DEFAULT 14;
ALTER TABLE employees ADD COLUMN employee_type VARCHAR DEFAULT 'FULL_TIME';
ALTER TABLE employees ADD COLUMN nht_status VARCHAR DEFAULT 'REGISTERED';
ALTER TABLE employees ADD COLUMN nht_number VARCHAR;
ALTER TABLE employees ADD COLUMN gender VARCHAR;
ALTER TABLE employees ADD COLUMN date_of_birth DATE;
ALTER TABLE employees ADD COLUMN designation VARCHAR;
ALTER TABLE employees ADD COLUMN custom_deductions JSONB DEFAULT '[]'::JSONB;
```

## Performance Notes

- Pro-rating calculations are O(1) mathematical operations
- Custom deduction tracking is O(n) where n = number of custom deductions per employee
- PAYE threshold selection is O(1) date comparison
- All calculations are synchronous and suitable for frontend

## Next Steps

1. Implement the EmployeeManager component in Employees.tsx
2. Update PayRun.tsx with date range selector
3. Test employee creation and editing
4. Test payrun calculation with various scenarios
5. Deploy database migrations for new fields
6. Update any existing API calls to handle new fields
7. Create user documentation for new features

---

**Version**: 1.0  
**Date**: February 5, 2026  
**Compliance**: Jamaica 2026 Payroll Regulations
