import { describe, expect, it } from 'vitest';
import { Employee, PayFrequency, PayRun, PayType, Role } from '../../core/types';
import {
  applyFinalizedCustomDeductions,
  buildPayPeriodOptions,
  buildPayRunRecord,
  calculateBankTotals,
  createPayslipDownloadToken,
  getIncompletePayRunEmployees,
  getMissingPayRunEmployees,
  getPayFrequencyForCycle,
  hasEmployeePortalAccess
} from './payrunWorkflow';

const baseEmployee: Employee = {
  id: 'emp-1',
  firstName: 'Jane',
  lastName: 'Doe',
  email: 'jane@example.com',
  trn: '123',
  nis: '456',
  grossSalary: 100000,
  payType: PayType.SALARIED,
  payFrequency: PayFrequency.MONTHLY,
  role: Role.EMPLOYEE,
  status: 'ACTIVE',
  hireDate: '2025-01-01',
  bankDetails: {
    bankName: 'NCB',
    accountNumber: '123456789',
    accountType: 'SAVINGS',
    currency: 'JMD'
  }
};

const employees: Employee[] = [
  baseEmployee,
  {
    ...baseEmployee,
    id: 'emp-2',
    firstName: 'John',
    lastName: 'Smith',
    email: 'john@example.com',
    trn: '789',
    nis: '101112',
    bankDetails: {
      bankName: 'BNS',
      accountNumber: '987654321',
      accountType: 'SAVINGS',
      currency: 'JMD'
    }
  }
];

describe('payrunWorkflow', () => {
  it('builds a pay run record from orchestration inputs', () => {
    const run = buildPayRunRecord({
      id: 'run-1',
      payPeriod: '2026-04',
      payFrequency: PayFrequency.MONTHLY,
      status: 'DRAFT',
      totalGross: 100000,
      totalNet: 80000,
      lineItems: []
    });

    expect(run.id).toBe('run-1');
    expect(run.periodStart).toBe('2026-04');
    expect(run.payFrequency).toBe(PayFrequency.MONTHLY);
    expect(run.status).toBe('DRAFT');
  });

  it('builds pay period options around the reference month', () => {
    const options = buildPayPeriodOptions(new Date('2026-04-01'));
    expect(options).toHaveLength(10);
    expect(options[0].value).toBe('2026-07');
    expect(options[options.length - 1].value).toBe('2025-10');
  });

  it('resolves pay frequency for mixed and fixed cycles', () => {
    expect(getPayFrequencyForCycle('ALL')).toBe(PayFrequency.MONTHLY);
    expect(getPayFrequencyForCycle(PayFrequency.WEEKLY)).toBe(PayFrequency.WEEKLY);
  });

  it('calculates bank totals by employee bank', () => {
    const run: PayRun = {
      id: 'run-1',
      periodStart: '2026-04',
      periodEnd: '2026-04',
      payDate: '2026-04-30',
      status: 'FINALIZED',
      totalGross: 200000,
      totalNet: 150000,
      lineItems: [
        { employeeId: 'emp-1', employeeName: 'Jane Doe', grossPay: 100000, additions: 0, deductions: 0, nis: 0, nht: 0, edTax: 0, paye: 0, pension: 0, totalDeductions: 0, netPay: 70000 },
        { employeeId: 'emp-2', employeeName: 'John Smith', grossPay: 100000, additions: 0, deductions: 0, nis: 0, nht: 0, edTax: 0, paye: 0, pension: 0, totalDeductions: 0, netPay: 80000 }
      ]
    };

    expect(calculateBankTotals(run, employees)).toEqual({ ncb: 70000, bns: 80000, other: 0, total: 150000 });
  });

  it('finds active employees missing from the draft', () => {
    const missing = getMissingPayRunEmployees(employees, [
      { employeeId: 'emp-1', employeeName: 'Jane Doe', grossPay: 100000, additions: 0, deductions: 0, nis: 0, nht: 0, edTax: 0, paye: 0, pension: 0, totalDeductions: 0, netPay: 70000 }
    ] as any);

    expect(missing.map(employee => employee.id)).toEqual(['emp-2']);
  });

  it('finds employees with incomplete compliance/payment data', () => {
    const incomplete = getIncompletePayRunEmployees(
      [{ employeeId: 'emp-1' } as any, { employeeId: 'emp-2' } as any],
      [
        baseEmployee,
        {
          ...baseEmployee,
          id: 'emp-2',
          firstName: 'John',
          trn: 'PENDING'
        }
      ]
    );

    expect(incomplete).toHaveLength(1);
    expect(incomplete[0].id).toBe('emp-2');
  });

  it('flags portal access and encodes payslip tokens', () => {
    expect(hasEmployeePortalAccess('Free')).toBe(false);
    expect(hasEmployeePortalAccess('Professional')).toBe(true);

    const token = createPayslipDownloadToken(
      { employeeId: 'emp-1', employeeName: 'Jane Doe', grossPay: 100000, additions: 0, deductions: 0, nis: 0, nht: 0, edTax: 0, paye: 0, pension: 0, totalDeductions: 0, netPay: 70000 },
      { id: 'run-1', periodStart: '2026-04', periodEnd: '2026-04', payDate: '2026-04-30', status: 'FINALIZED', totalGross: 100000, totalNet: 70000, lineItems: [] }
    );

    expect(JSON.parse(atob(token))).toEqual({ employeeId: 'emp-1', period: '2026-04', runId: 'run-1' });
  });

  it('applies finalized custom deduction state updates', () => {
    const employee = {
      ...baseEmployee,
      customDeductions: [
        { id: 'ded-1', name: 'Loan', amount: 1000, periodType: 'FIXED_TERM' as const, remainingTerm: 3 },
        { id: 'ded-2', name: 'Advance', amount: 500, periodType: 'TARGET_BALANCE' as const, currentBalance: 1000, targetBalance: 5000 }
      ]
    };

    const updated = applyFinalizedCustomDeductions(employee, {
      employeeId: employee.id,
      deductionsBreakdown: [
        { id: 'ded-1', name: 'Loan', amount: 1000 },
        { id: 'ded-2', name: 'Advance', amount: 500 }
      ]
    } as any);

    expect(updated.customDeductions?.[0].remainingTerm).toBe(2);
    expect(updated.customDeductions?.[1].currentBalance).toBe(1500);
  });
});