import { CustomDeduction, Employee, PayFrequency, PayRun, PayRunLineItem } from '../../core/types';

interface BuildPayRunRecordParams {
  id: string;
  payPeriod: string;
  payFrequency: PayFrequency;
  status: PayRun['status'];
  totalGross: number;
  totalNet: number;
  lineItems: PayRunLineItem[];
  payDate?: string;
}

export const buildPayRunRecord = ({
  id,
  payPeriod,
  payFrequency,
  status,
  totalGross,
  totalNet,
  lineItems,
  payDate = new Date().toISOString().split('T')[0]
}: BuildPayRunRecordParams): PayRun => ({
  id,
  periodStart: payPeriod,
  periodEnd: payPeriod,
  payDate,
  payFrequency,
  status,
  totalGross,
  totalNet,
  lineItems
});

export const getPayFrequencyForCycle = (payCycle: PayFrequency | 'ALL'): PayFrequency => {
  if (payCycle === PayFrequency.WEEKLY) return PayFrequency.WEEKLY;
  if (payCycle === PayFrequency.FORTNIGHTLY) return PayFrequency.FORTNIGHTLY;
  return PayFrequency.MONTHLY;
};

export const buildPayPeriodOptions = (today: Date = new Date()) => {
  const options: { value: string; label: string }[] = [];
  const baseYear = today.getUTCFullYear();
  const baseMonth = today.getUTCMonth();

  const pad2 = (value: number) => String(value).padStart(2, '0');

  for (let i = -6; i <= 3; i++) {
    // Use UTC-safe month math and set time to midday UTC to avoid local timezone month-rollover.
    const date = new Date(Date.UTC(baseYear, baseMonth + i, 1, 12, 0, 0));
    const value = `${date.getUTCFullYear()}-${pad2(date.getUTCMonth() + 1)}`;

    options.push({
      value,
      label: date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
    });
  }
  return options.reverse();
};

export const getMissingPayRunEmployees = (employees: Employee[], draftItems: PayRunLineItem[]) => {
  return employees.filter(employee =>
    employee.status === 'ACTIVE' &&
    !draftItems.find(item => item.employeeId === employee.id)
  );
};

export interface BankTotals {
  ncb: number;
  bns: number;
  other: number;
  total: number;
}

export const calculateBankTotals = (run: PayRun | null, employees: Employee[]): BankTotals => {
  if (!run) return { ncb: 0, bns: 0, other: 0, total: 0 };

  const totals = run.lineItems.reduce((acc, line) => {
    const employee = employees.find(item => item.id === line.employeeId);
    const bankName = employee?.bankDetails?.bankName || 'OTHER';

    if (bankName === 'NCB') acc.ncb += line.netPay;
    else if (bankName === 'BNS') acc.bns += line.netPay;
    else acc.other += line.netPay;

    return acc;
  }, { ncb: 0, bns: 0, other: 0 });

  return {
    ...totals,
    total: totals.ncb + totals.bns + totals.other
  };
};

export const hasEmployeePortalAccess = (plan?: string) => {
  return plan === 'Starter' || plan === 'Pro' || plan === 'Professional';
};

export const createPayslipDownloadToken = (lineItem: PayRunLineItem, run: PayRun) => {
  return btoa(JSON.stringify({
    employeeId: lineItem.employeeId,
    period: run.periodStart,
    runId: run.id
  }));
};

export const getIncompletePayRunEmployees = (draftItems: PayRunLineItem[], employees: Employee[]) => {
  return draftItems
    .map(item => employees.find(employee => employee.id === item.employeeId))
    .filter((employee): employee is Employee => Boolean(employee))
    .filter(employee => (
      !employee.trn || employee.trn.trim() === '' || employee.trn.toUpperCase() === 'PENDING' ||
      !employee.nis || employee.nis.trim() === '' || employee.nis.toUpperCase() === 'PENDING' ||
      !employee.bankDetails?.accountNumber || employee.bankDetails.accountNumber.trim() === '' || employee.bankDetails.accountNumber.toUpperCase() === 'PENDING'
    ));
};

const applyUpdatedDeduction = (deduction: CustomDeduction, lineItem: PayRunLineItem) => {
  const deductionInBreakdown = lineItem.deductionsBreakdown?.some(detail => detail.id === deduction.id);
  if (!deductionInBreakdown) return deduction;

  if (deduction.periodType === 'FIXED_TERM' && deduction.remainingTerm !== undefined) {
    return {
      ...deduction,
      remainingTerm: Math.max(0, deduction.remainingTerm - 1)
    };
  }

  if (deduction.periodType === 'TARGET_BALANCE') {
    const currentBalance = deduction.currentBalance || 0;
    return {
      ...deduction,
      currentBalance: currentBalance + deduction.amount
    };
  }

  return deduction;
};

export const applyFinalizedCustomDeductions = (employee: Employee, lineItem: PayRunLineItem): Employee => {
  if (!employee.customDeductions || employee.customDeductions.length === 0) return employee;

  return {
    ...employee,
    customDeductions: employee.customDeductions.map(deduction => applyUpdatedDeduction(deduction, lineItem))
  };
};