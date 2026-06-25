import { describe, expect, it } from 'vitest';
import { CompanySettings, Employee, EmployeeType, LeaveRequest, LeaveType, PayFrequency, PayRun, PayType, Role } from '../../core/types';
import { calculatePayRunLineItem, calculatePayrollTotals, initializePayRunLineItems, recalculateDraftLineItem } from './payrollEngine';

const defaultCompanyData: CompanySettings = {
  name: 'Payroll Jam',
  trn: '123',
  address: 'Kingston',
  phone: '876-000-0000',
  bankName: 'NCB',
  accountNumber: '1234567890',
  branchCode: '001',
  taxConfig: {
    nisRateEmployee: 0.03,
    nisRateEmployer: 0.025,
    nisCap: 5000000,
    nhtRateEmployee: 0.02,
    nhtRateEmployer: 0.03,
    nhtCap: 5000000,
    edTaxRateEmployee: 0.0225,
    edTaxRateEmployer: 0.0225,
    heartRateEmployer: 0.03,
    payeThreshold: 1700096,
    payeThresholdHigh: 6000000,
    payeRateStd: 0.25,
    payeRateHigh: 0.3
  }
};

const defaultEmployee: Employee = {
  id: 'emp-1',
  firstName: 'Jane',
  lastName: 'Doe',
  email: 'jane@example.com',
  trn: '123',
  nis: '456',
  grossSalary: 200000,
  payType: PayType.SALARIED,
  payFrequency: PayFrequency.MONTHLY,
  role: Role.EMPLOYEE,
  status: 'ACTIVE',
  hireDate: '2025-01-01'
};

describe('payrollEngine', () => {
  it('calculates a line item from company tax config', () => {
    const lineItem = calculatePayRunLineItem({
      employee: defaultEmployee,
      period: '2026-01',
      context: {
        timesheets: [],
        leaveRequests: [],
        payRunHistory: [],
        companyData: defaultCompanyData
      }
    });

    expect(lineItem.grossPay).toBe(200000);
    expect(lineItem.nis).toBe(6000);
    expect(lineItem.nht).toBe(4000);
    expect(lineItem.paye).toBe(13081.33);
  });

  it('includes unpaid leave as a taxable negative addition', () => {
    const leaveRequests: LeaveRequest[] = [{
      id: 'leave-1',
      employeeId: 'emp-1',
      employeeName: 'Jane Doe',
      type: LeaveType.UNPAID,
      startDate: '2026-01-10',
      endDate: '2026-01-10',
      status: 'APPROVED',
      reason: 'Personal',
      days: 2
    }];

    const lineItem = calculatePayRunLineItem({
      employee: defaultEmployee,
      period: '2026-01',
      context: {
        timesheets: [],
        leaveRequests,
        payRunHistory: [],
        companyData: defaultCompanyData
      }
    });

    expect(lineItem.additionsBreakdown?.some(item => item.name.includes('Unpaid Leave'))).toBe(true);
    expect(lineItem.additions).toBeLessThan(0);
  });

  it('does not apply statutory or employer taxes to contractors', () => {
    const contractor: Employee = {
      ...defaultEmployee,
      employeeType: EmployeeType.CONTRACTOR,
      pensionContributionRate: 5
    };

    const lineItem = calculatePayRunLineItem({
      employee: contractor,
      period: '2026-01',
      context: {
        timesheets: [],
        leaveRequests: [],
        payRunHistory: [],
        companyData: defaultCompanyData
      }
    });

    expect(lineItem.nis).toBe(0);
    expect(lineItem.nht).toBe(0);
    expect(lineItem.edTax).toBe(0);
    expect(lineItem.paye).toBe(0);
    expect(lineItem.pension).toBe(10000);
    expect(lineItem.totalDeductions).toBe(10000);
    expect(lineItem.employerContributions).toEqual({
      employerNIS: 0,
      employerNHT: 0,
      employerEdTax: 0,
      employerHEART: 0,
      totalEmployerCost: 0
    });
  });

  it('recalculates draft totals after ad-hoc updates', () => {
    const original = calculatePayRunLineItem({
      employee: defaultEmployee,
      period: '2026-01',
      context: {
        timesheets: [],
        leaveRequests: [],
        payRunHistory: [] as PayRun[],
        companyData: defaultCompanyData
      }
    });

    const updated = recalculateDraftLineItem({
      item: {
        ...original,
        additionsBreakdown: [
          ...(original.additionsBreakdown || []),
          { id: 'bonus-1', name: 'Bonus', amount: 10000, isTaxable: true }
        ]
      },
      employee: defaultEmployee,
      companyData: defaultCompanyData
    });

    const totals = calculatePayrollTotals([updated]);

    expect(updated.additions).toBe(10000);
    expect(updated.totalDeductions).toBeGreaterThan(original.totalDeductions);
    expect(totals.net).toBe(updated.netPay);
  });

  it('coerces missing/non-numeric inputs to avoid NaN outputs', () => {
    const dirtyEmployee = {
      ...defaultEmployee,
      grossSalary: undefined as unknown as number,
      hourlyRate: 'not-a-number' as unknown as number,
      allowances: [
        { id: 'a-1', name: 'Allowance', amount: undefined as unknown as number, isTaxable: true }
      ],
      customDeductions: [
        {
          id: 'd-1',
          name: 'Deduction',
          amount: 'oops' as unknown as number,
          periodType: 'FIXED_TERM' as const,
          remainingTerm: 1,
          periodFrequency: 'MONTHLY' as const
        }
      ]
    } as Employee;

    const lineItem = calculatePayRunLineItem({
      employee: dirtyEmployee,
      period: '2026-01',
      context: {
        timesheets: [],
        leaveRequests: [],
        payRunHistory: [],
        companyData: defaultCompanyData
      }
    });

    expect(Number.isFinite(lineItem.grossPay)).toBe(true);
    expect(Number.isFinite(lineItem.additions)).toBe(true);
    expect(Number.isFinite(lineItem.totalDeductions)).toBe(true);
    expect(Number.isFinite(lineItem.netPay)).toBe(true);
    expect(Number.isFinite(lineItem.nis)).toBe(true);
    expect(Number.isFinite(lineItem.nht)).toBe(true);
    expect(Number.isFinite(lineItem.edTax)).toBe(true);
    expect(Number.isFinite(lineItem.paye)).toBe(true);
  });

  it('includes employee other deductions in pay run deductions', () => {
    const employeeWithOtherDeductions: Employee = {
      ...defaultEmployee,
      customDeductions: [],
      deductions: [{ id: 'union-1', name: 'Union Fee', amount: 500 }]
    };

    const lineItem = calculatePayRunLineItem({
      employee: employeeWithOtherDeductions,
      period: '2026-01',
      context: {
        timesheets: [],
        leaveRequests: [],
        payRunHistory: [],
        companyData: defaultCompanyData
      }
    });

    expect(lineItem.deductions).toBe(500);
    expect(lineItem.deductionsBreakdown?.some(d => d.name === 'Union Fee')).toBe(true);
  });

  it('calculates piece-rate gross from rate and pieces instead of profile gross', () => {
    const pieceRateEmployee: Employee = {
      ...defaultEmployee,
      grossSalary: 999999,
      payType: PayType.PIECE_RATE,
      pieceRateAmount: 250
    };

    const lineItem = calculatePayRunLineItem({
      employee: pieceRateEmployee,
      period: '2026-01',
      context: {
        timesheets: [],
        leaveRequests: [],
        pieceCounts: { [pieceRateEmployee.id]: 12 },
        payRunHistory: [],
        companyData: defaultCompanyData
      }
    });

    expect(lineItem.grossPay).toBe(3000);
    expect(lineItem.pieceRateAmount).toBe(250);
    expect(lineItem.pieceCount).toBe(12);
  });

  it('can initialize a piece-rate-only pay run', () => {
    const pieceRateEmployee: Employee = {
      ...defaultEmployee,
      id: 'piece-1',
      payType: PayType.PIECE_RATE,
      pieceRateAmount: 150
    };
    const hourlyEmployee: Employee = {
      ...defaultEmployee,
      id: 'hourly-1',
      payType: PayType.HOURLY,
      payFrequency: PayFrequency.WEEKLY,
      hourlyRate: 1200
    };

    const lineItems = initializePayRunLineItems({
      employees: [pieceRateEmployee, hourlyEmployee],
      payCycle: PayType.PIECE_RATE,
      period: '2026-01',
      context: {
        timesheets: [],
        leaveRequests: [],
        pieceCounts: { [pieceRateEmployee.id]: 8 },
        payRunHistory: [],
        companyData: defaultCompanyData
      }
    });

    expect(lineItems).toHaveLength(1);
    expect(lineItems[0].employeeId).toBe(pieceRateEmployee.id);
    expect(lineItems[0].grossPay).toBe(1200);
  });

  it('keeps cumulative PAYE when recalculating edited draft lines', () => {
    const january = calculatePayRunLineItem({
      employee: defaultEmployee,
      period: '2026-01',
      context: {
        timesheets: [],
        leaveRequests: [],
        payRunHistory: [],
        companyData: defaultCompanyData
      }
    });
    const history: PayRun[] = [{
      id: 'run-jan',
      periodStart: '2026-01',
      periodEnd: '2026-01',
      payDate: '2026-01-31',
      payFrequency: PayFrequency.MONTHLY,
      status: 'FINALIZED',
      totalGross: january.grossPay,
      totalNet: january.netPay,
      lineItems: [january]
    }];
    const february = calculatePayRunLineItem({
      employee: defaultEmployee,
      period: '2026-02',
      context: {
        timesheets: [],
        leaveRequests: [],
        payRunHistory: history,
        companyData: defaultCompanyData
      }
    });

    const recalculated = recalculateDraftLineItem({
      item: february,
      employee: defaultEmployee,
      companyData: defaultCompanyData,
      period: '2026-02',
      payRunHistory: history
    });

    expect(recalculated.paye).toBe(february.paye);
    expect(recalculated.totalDeductions).toBe(february.totalDeductions);
  });

  it('excludes exhausted custom deductions and caps target-balance deductions', () => {
    const employeeWithCompletedDeductions: Employee = {
      ...defaultEmployee,
      customDeductions: [
        { id: 'fixed-done', name: 'Finished Loan', amount: 1000, periodType: 'FIXED_TERM', remainingTerm: 0 },
        { id: 'target-done', name: 'Finished Advance', amount: 1000, periodType: 'TARGET_BALANCE', currentBalance: 5000, targetBalance: 5000 },
        { id: 'target-last', name: 'Final Advance Payment', amount: 1000, periodType: 'TARGET_BALANCE', currentBalance: 4500, targetBalance: 5000 }
      ]
    };

    const lineItem = calculatePayRunLineItem({
      employee: employeeWithCompletedDeductions,
      period: '2026-01',
      context: {
        timesheets: [],
        leaveRequests: [],
        payRunHistory: [],
        companyData: defaultCompanyData
      }
    });

    expect(lineItem.deductionsBreakdown).toEqual([
      { id: 'target-last', name: 'Final Advance Payment', amount: 500 }
    ]);
    expect(lineItem.deductions).toBe(500);
  });
});
