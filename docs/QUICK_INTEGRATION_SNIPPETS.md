/**
 * QUICK INTEGRATION SNIPPETS
 * Copy-paste ready code for integrating the refactored components
 */

// ============================================================================
// SNIPPET 1: Update Employees.tsx - Replace imports
// ============================================================================
// LOCATION: Top of pages/Employees.tsx (around line 1)
// REMOVE these imports if present:
// (old edit modal related imports)

// ADD these imports:
import React, { useState, useRef } from 'react';
import { EmployeeManager } from '../components/EmployeeManager';
import { Employee, PayFrequency, Role, PayRun, CompanySettings, PayType, Department, Designation, Asset, PerformanceReview, TerminationDetails, BankAccount, PricingPlan, User } from '../types';
// ... rest of imports ...


// ============================================================================
// SNIPPET 2: Update Employees.tsx - Replace state management
// ============================================================================
// LOCATION: Inside Employees component, around line 62-77
// REMOVE:
// const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(null);
// const [editTab, setEditTab] = useState<'profile' | 'financial' | 'banking'>('profile');

// ADD:
const [isEmployeeManagerOpen, setIsEmployeeManagerOpen] = useState(false);
const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(null);


// ============================================================================
// SNIPPET 3: Update Employees.tsx - Replace action handlers
// ============================================================================
// LOCATION: In Employees component, add these handlers
// REMOVE the old edit handler that opens the modal with tabs

// ADD these:
const handleEditEmployee = (emp: Employee) => {
  setSelectedEmployee(emp);
  setIsEmployeeManagerOpen(true);
};

const handleAddNewEmployee = () => {
  setSelectedEmployee(null);
  setIsEmployeeManagerOpen(true);
};

const handleSaveEmployee = (employee: Employee) => {
  if (employee.id) {
    // Editing existing
    onUpdateEmployee(employee);
  } else {
    // Adding new
    const newEmployee: Employee = {
      ...employee,
      id: generateUUID()
    };
    onAddEmployee(newEmployee);
  }
  setIsEmployeeManagerOpen(false);
  setSelectedEmployee(null);
};


// ============================================================================
// SNIPPET 4: Update Employees.tsx - Replace modal buttons
// ============================================================================
// LOCATION: In JSX, around line 820-850, find the "Add New Employee" button
// CHANGE:
// onClick={() => setIsAddModalOpen(true)}
// TO:
// onClick={handleAddNewEmployee}

// Find edit buttons (in table or list), CHANGE:
// onClick={() => { setSelectedEmployee(emp); setEditTab('profile'); }}
// TO:
// onClick={() => handleEditEmployee(emp)}


// ============================================================================
// SNIPPET 5: Update Employees.tsx - Replace modals JSX
// ============================================================================
// LOCATION: End of component, replace ALL old modals (lines ~689-1100)
// REMOVE everything from:
// {/* Edit Employee Modal */}
// through
// {/* Add Employee Modal */}

// ADD:
{/* Unified Employee Manager Modal */}
<EmployeeManager
  employee={selectedEmployee}
  isOpen={isEmployeeManagerOpen}
  onClose={() => {
    setIsEmployeeManagerOpen(false);
    setSelectedEmployee(null);
  }}
  onSave={handleSaveEmployee}
  isLoading={false}
/>


// ============================================================================
// SNIPPET 6: Update PayRun.tsx - Add imports
// ============================================================================
// LOCATION: Top of pages/PayRun.tsx (around line 1-12)
// ADD these imports:
import { PayRunDateRangeSelector } from '../components/PayRunDateRangeSelector';
import { 
  calculatePayrunLineItems, 
  parsePayRunPeriod,
  PayRunPeriod,
  validatePayPeriod,
  generatePayRunSummary
} from '../utils/payrunCalculator';
import { 
  Jamaica2026TaxConfig,
  getPAYEThreshold
} from '../utils/jamaica2026Fiscal';


// ============================================================================
// SNIPPET 7: Update PayRun.tsx - Add state for dates
// ============================================================================
// LOCATION: Inside PayRun component, around line 278-305
// ADD after existing state declarations:
const [periodStartDate, setPeriodStartDate] = useState<string>('');
const [periodEndDate, setPeriodEndDate] = useState<string>('');
const [isDateSelectorOpen, setIsDateSelectorOpen] = useState(false);


// ============================================================================
// SNIPPET 8: Update PayRun.tsx - Update SETUP step UI
// ============================================================================
// LOCATION: In SETUP step return statement, around line 670-730
// ADD this new section in the pay period selection area:

<div className="mt-6 border-t border-gray-200 pt-6">
  <h4 className="font-semibold text-gray-900 mb-3">Or Select Custom Date Range</h4>
  <button
    onClick={() => setIsDateSelectorOpen(true)}
    className="w-full py-3 border-2 border-jam-orange rounded-lg text-jam-orange font-medium hover:bg-jam-orange hover:text-white transition-all flex items-center justify-center"
  >
    <Icons.Calendar className="w-5 h-5 mr-2" />
    {periodStartDate && periodEndDate 
      ? `${periodStartDate} to ${periodEndDate}` 
      : 'Select Custom Date Range'}
  </button>
</div>


// ============================================================================
// SNIPPET 9: Update PayRun.tsx - Add date selector component
// ============================================================================
// LOCATION: End of JSX, before closing return statement (around line 1180)
// ADD:

{/* Date Range Selector Modal */}
<PayRunDateRangeSelector
  payFrequency={
    payCycle === 'WEEKLY' ? PayFrequency.WEEKLY :
    payCycle === 'FORTNIGHTLY' ? PayFrequency.FORTNIGHTLY :
    PayFrequency.MONTHLY
  }
  onDateRangeChange={(start, end) => {
    setPeriodStartDate(start);
    setPeriodEndDate(end);
  }}
  isOpen={isDateSelectorOpen}
  onClose={() => setIsDateSelectorOpen(false)}
/>


// ============================================================================
// SNIPPET 10: Update PayRun.tsx - Replace initialization function
// ============================================================================
// LOCATION: Replace the existing handleInitializeSystem function
// REMOVE the entire function (around line 415-430)

// ADD:
const handleInitializeSystem = () => {
  if (!periodStartDate || !periodEndDate) {
    toast.error("Please select a date range or use the period selector above");
    return;
  }

  setIsCalculating(true);
  setTimeout(() => {
    try {
      // Validate period
      const period = parsePayRunPeriod(
        periodStartDate,
        periodEndDate,
        payCycle === 'WEEKLY' ? PayFrequency.WEEKLY :
        payCycle === 'FORTNIGHTLY' ? PayFrequency.FORTNIGHTLY :
        PayFrequency.MONTHLY
      );

      const validation = validatePayPeriod(period);
      if (!validation.isValid) {
        toast.error(`Invalid period: ${validation.errors.join(', ')}`);
        setIsCalculating(false);
        return;
      }

      // Filter eligible employees
      const eligibleEmployees = employees.filter(e => e.status === 'ACTIVE');

      if (eligibleEmployees.length === 0) {
        toast.error("No active employees found for this period");
        setIsCalculating(false);
        return;
      }

      // Calculate line items with new 2026 fiscal logic
      const lineItems = calculatePayrunLineItems(
        eligibleEmployees,
        period,
        {}, // additional deductions
        {}  // additional additions
      );

      // Load into draft
      loadDraftItems(lineItems);
      
      // Generate summary
      const summary = generatePayRunSummary(lineItems, periodStartDate, periodEndDate);
      
      setStep('DRAFT');
      auditService.log(
        currentUser, 
        'CREATE', 
        'PayRun', 
        `Initialized payroll ${periodStartDate} to ${periodEndDate} with ${lineItems.length} employees`
      );
      
      toast.success(
        `Payroll calculated for ${lineItems.length} employees ` +
        `(PAYE Threshold: JMD ${summary.payeThreshold.toLocaleString()}, ` +
        `Total Gross: JMD ${summary.totalGross.toLocaleString()})`
      );
    } catch (error) {
      console.error('Payrun calculation error:', error);
      toast.error('Failed to calculate payroll. Please try again.');
    } finally {
      setIsCalculating(false);
    }
  }, 800);
};


// ============================================================================
// SNIPPET 11: Database Migration (Run in Supabase SQL Editor)
// ============================================================================
-- Add new fields to employees table for 2026 compliance
ALTER TABLE employees 
ADD COLUMN IF NOT EXISTS joining_date DATE,
ADD COLUMN IF NOT EXISTS annual_leave INTEGER DEFAULT 14,
ADD COLUMN IF NOT EXISTS employee_type VARCHAR DEFAULT 'FULL_TIME',
ADD COLUMN IF NOT EXISTS nht_status VARCHAR DEFAULT 'REGISTERED',
ADD COLUMN IF NOT EXISTS nht_number VARCHAR,
ADD COLUMN IF NOT EXISTS gender VARCHAR,
ADD COLUMN IF NOT EXISTS date_of_birth DATE,
ADD COLUMN IF NOT EXISTS designation VARCHAR,
ADD COLUMN IF NOT EXISTS custom_deductions JSONB DEFAULT '[]'::JSONB;

-- Add constraints
ALTER TABLE employees
ADD CONSTRAINT employee_type_check CHECK (employee_type IN ('FULL_TIME', 'PART_TIME', 'CONTRACTOR', 'STAFF')),
ADD CONSTRAINT nht_status_check CHECK (nht_status IN ('REGISTERED', 'EXEMPT', 'PENDING'));

-- Backfill joining_date from hire_date for existing employees
UPDATE employees 
SET joining_date = CAST(hire_date AS DATE)
WHERE joining_date IS NULL;


// ============================================================================
// SNIPPET 12: Testing - Sample Employee Creation
// ============================================================================
// For testing the new EmployeeManager

const testEmployee = {
  id: 'emp-test-001',
  firstName: 'John',
  lastName: 'Doe',
  email: 'john@company.com',
  trn: '123456789',
  nis: '123-456-789',
  nhtStatus: 'REGISTERED',
  employeeId: 'EMP001',
  grossSalary: 500000,
  hourlyRate: 0,
  payType: PayType.SALARIED,
  payFrequency: PayFrequency.MONTHLY,
  role: Role.EMPLOYEE,
  status: 'ACTIVE',
  hireDate: '2025-01-15',
  joiningDate: '2025-01-15',
  annualLeave: 14,
  employeeType: EmployeeType.FULL_TIME,
  jobTitle: 'Software Engineer',
  designation: 'Senior Developer',
  department: 'Engineering',
  gender: 'MALE',
  dateOfBirth: '1990-05-20',
  phone: '+1-876-555-0123',
  address: '123 Main Street, Kingston',
  bankDetails: {
    bankName: 'NCB',
    accountNumber: '1234567890',
    accountType: 'SAVINGS',
    currency: 'JMD'
  },
  customDeductions: [
    {
      id: 'ded-001',
      name: 'Loan Payment',
      amount: 5000,
      periodType: DeductionPeriodType.FIXED_TERM,
      remainingTerm: 12
    }
  ]
};


// ============================================================================
// SNIPPET 13: Testing - Sample Payrun Calculation
// ============================================================================
// For testing the new fiscal logic

import { calculatePayrunLineItems, parsePayRunPeriod } from '../utils/payrunCalculator';

const period = parsePayRunPeriod('2026-04-01', '2026-04-30', PayFrequency.MONTHLY);
const employees = [testEmployee];
const lineItems = calculatePayrunLineItems(employees, period);

// Expected output for testEmployee on April 2026:
// - Gross: 500,000
// - PAYE: (500,000 - 480,000) × 0.25 = 5,000
// - NIS: 500,000 × 0.0316 = 15,800 (capped)
// - NHT: 500,000 × 0.025 = 12,500
// - Ed Tax: 500,000 × 0.02 = 10,000
// - Custom: 5,000
// - Total Deductions: 47,800
// - Net Pay: 500,000 - 47,800 = 452,200


// ============================================================================
// SNIPPET 14: CSS Classes Used
// ============================================================================
// These are standard Tailwind classes - ensure your tailwind.config.js includes:
/*
module.exports = {
  theme: {
    extend: {
      colors: {
        'jam-black': '#000000',
        'jam-yellow': '#FFC500',
        'jam-orange': '#FF6B35'
      }
    }
  }
}
*/


// ============================================================================
// NOTES FOR IMPLEMENTATION
// ============================================================================
/*
1. IMPORTS MATTER: Make sure all imports are correct and components exist
2. STYLING: Uses Tailwind CSS - ensure your setup is correct
3. ICONS: Uses Icons component from ../components/Icons
4. VALIDATORS: Uses validators from ../utils/validators
5. AUDIT SERVICE: Integrates with existing auditService
6. TYPE SAFETY: All TypeScript types must be properly defined

TESTING CHECKLIST AFTER INTEGRATION:
□ Can add new employee with EmployeeManager
□ Can edit existing employee
□ All 6 tabs visible and functional
□ Employee type dropdown disables statutory hints for contractors
□ Can add/remove custom deductions
□ Date range selector opens and closes
□ Can select custom dates for payrun
□ Payrun calculates with pro-rating
□ PAYE threshold changes at April 1st
□ Pro-rated employees show correct gross
□ Contractor employees have no statutory deductions
□ Fixed-term deductions decrement
□ Target-balance deductions stop at target

COMMON ISSUES & FIXES:
1. "Cannot find module" → Check import paths are correct
2. "Type 'Employee' is missing property" → Update Employee interface
3. "Tab doesn't render" → Check PayFrequency imports
4. "Calculations are wrong" → Verify jamaica2026Fiscal constants

*/
