import { describe, expect, it } from 'vitest';
import { CompanySettings, Employee, LeaveRequest, LeaveType, PayFrequency, PayRun, PayType, Role } from '../../core/types';
import { calculatePayRunLineItem, calculatePayrollTotals, recalculateDraftLineItem } from './payrollEngine';

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
});