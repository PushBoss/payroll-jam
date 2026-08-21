import {
  CompanySettings,
  Employee,
  LeaveRequest,
  LeaveType,
  EmployeeType,
  PayrollItemDetail,
  PayRun,
  PayRunCycleFilter,
  PayRunLineItem,
  PayType,
  PayrollYtdSummary,
  WeeklyTimesheet
} from '../../core/types';
import {
  calculateCumulativePAYE,
  calculateEmployerContributions,
  calculateProration,
  calculateTaxes
} from '../../core/taxUtils';
import { buildPayrollOverrides, resolveCompanyTaxConfig } from './payrollConfig';

const toFiniteNumber = (value: unknown, fallback = 0): number => {
  const num = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(num) ? num : fallback;
};

export interface PayrollEngineContext {
  timesheets: WeeklyTimesheet[];
  leaveRequests: LeaveRequest[];
  pieceCounts?: Record<string, number>;
  payRunHistory?: PayRun[];
  ytdSummaries?: Record<string, PayrollYtdSummary>;
  companyData?: CompanySettings;
}

const isTimesheetInPeriod = (ts: WeeklyTimesheet, period: string) => ts.weekEndDate.startsWith(period);

const getEmployeeTaxOverrides = (companyData: CompanySettings | undefined, employee?: Employee) => {
  return buildPayrollOverrides(resolveCompanyTaxConfig(companyData), employee?.pensionContributionRate || 0);
};

const getTimesheetOvertimePolicy = (companyData: CompanySettings | undefined) => {
  const enabled = companyData?.timesheetOvertime?.enabled ?? true;
  const configuredMultiplier = toFiniteNumber(companyData?.timesheetOvertime?.multiplier, 1.5);

  return {
    enabled,
    // A multiplier below normal hourly pay is not a valid overtime policy.
    multiplier: configuredMultiplier >= 1 ? configuredMultiplier : 1.5,
  };
};

const isCustomDeductionActive = (deduction: { periodType?: string; remainingTerm?: number; currentBalance?: number; targetBalance?: number }) => {
  if (deduction.periodType === 'FIXED_TERM') {
    return deduction.remainingTerm === undefined || toFiniteNumber(deduction.remainingTerm) > 0;
  }

  if (deduction.periodType === 'TARGET_BALANCE') {
    const targetBalance = toFiniteNumber(deduction.targetBalance);
    if (targetBalance <= 0) return true;
    return toFiniteNumber(deduction.currentBalance) < targetBalance;
  }

  return true;
};

export const calculatePayrollTotals = (items: PayRunLineItem[]) => ({
  gross: items.reduce(
    (sum, line) => sum + toFiniteNumber(line.grossPay) + toFiniteNumber(line.additions),
    0
  ),
  deductions: items.reduce((sum, line) => sum + toFiniteNumber(line.totalDeductions), 0),
  net: items.reduce((sum, line) => sum + toFiniteNumber(line.netPay), 0)
});

export const getEmployeeYTD = (
  payRunHistory: PayRun[] = [],
  employeeId: string,
  year: number
) => {
  let ytdGross = 0;
  let ytdNIS = 0;
  let ytdTaxPaid = 0;
  let ytdPension = 0;
  let ytdPeriods = 0;

  payRunHistory.forEach(run => {
    if (run.periodStart.startsWith(year.toString()) && run.status === 'FINALIZED') {
      const line = run.lineItems.find(item => item.employeeId === employeeId);
      if (line) {
        const hasBreakdown = Array.isArray(line.additionsBreakdown) && line.additionsBreakdown.length > 0;
        const taxableAdditions = hasBreakdown
          ? line.additionsBreakdown!
            .filter(detail => detail.isTaxable !== false)
            .reduce((sum, detail) => sum + toFiniteNumber(detail.amount), 0)
          : toFiniteNumber(line.additions);

        // For tax/YTD statutory income purposes, only taxable additions should be included.
        ytdGross += toFiniteNumber(line.grossPay) + taxableAdditions;
        ytdNIS += toFiniteNumber(line.nis);
        ytdTaxPaid += toFiniteNumber(line.paye);
        ytdPension += toFiniteNumber(line.pension);
        // Count each prior finalized period actually run/imported for this
        // employee this year — this, not the calendar month, is what the
        // cumulative-PAYE period number must be based on.
        ytdPeriods += 1;
      }
    }
  });

  return {
    ytdGross,
    ytdNIS,
    ytdTaxPaid,
    ytdPeriods,
    ytdStatutoryIncome: ytdGross - ytdNIS - ytdPension
  };
};

const getPeriodBounds = (period: string, customPeriodStart?: string, customPeriodEnd?: string) => {
  const [yearStr, monthStr] = period.split('-');
  const year = parseInt(yearStr, 10);
  const month = parseInt(monthStr, 10);

  const periodStart = customPeriodStart || `${period}-01`;
  const periodEnd = customPeriodEnd || `${period}-${new Date(year, month, 0).getDate()}`;

  return { year, month, periodStart, periodEnd };
};

const calculatePeriodNumber = (
  ytdPeriods: number,
) => {
  // Cumulative PAYE pro-rates the annual tax-free threshold by the period
  // number, so the period number MUST reflect how many pay periods have
  // actually been run/imported for this employee this year — plus the current
  // one. Using the calendar month instead over-applies the threshold whenever
  // prior periods are missing (e.g. an employer who starts mid-year, or hasn't
  // imported every prior S01), which silently zeroed PAYE. Frequency is handled
  // separately via getPeriodsPerYear inside calculateCumulativePAYE.
  return Math.max(1, Math.floor(toFiniteNumber(ytdPeriods)) + 1);
};

export const calculateComputedAmounts = ({
  employee,
  grossPay,
  additionsBreakdown,
  deductionsBreakdown,
  period,
  context
}: {
  employee: Employee;
  grossPay: number;
  additionsBreakdown: PayrollItemDetail[];
  deductionsBreakdown: PayrollItemDetail[];
  period: { year: number; month: number; periodStart: string; periodEnd: string };
  context: PayrollEngineContext;
}) => {
  const safeGrossPay = toFiniteNumber(grossPay);
  const taxableAdditions = additionsBreakdown
    .filter(item => item.isTaxable !== false)
    .reduce((sum, item) => sum + toFiniteNumber(item.amount), 0);
  const nonTaxableAdditions = additionsBreakdown
    .filter(item => item.isTaxable === false)
    .reduce((sum, item) => sum + toFiniteNumber(item.amount), 0);
  const allAdditions = taxableAdditions + nonTaxableAdditions;
  const customDeductions = deductionsBreakdown.reduce((sum, item) => sum + toFiniteNumber(item.amount), 0);

  const currentGross = Math.max(0, safeGrossPay + taxableAdditions);
  const taxOverrides = getEmployeeTaxOverrides(context.companyData, employee);
  const standardTaxes = calculateTaxes(currentGross, employee.payFrequency, taxOverrides);
  const isContractor = employee.employeeType === EmployeeType.CONTRACTOR;
  const ytdData = context.ytdSummaries?.[employee.id] || getEmployeeYTD(context.payRunHistory || [], employee.id, period.year);
  // The server summary includes both YTD totals and their finalized-period
  // count. Keeping those two values together prevents old YTD earnings from
  // being annualized as though they were earned in a single period.
  const ytdPeriods = ytdData.ytdPeriods
    ?? getEmployeeYTD(context.payRunHistory || [], employee.id, period.year).ytdPeriods;
  const periodNumber = calculatePeriodNumber(ytdPeriods);

  const cumulativePAYE = calculateCumulativePAYE(
    currentGross,
    standardTaxes.nis,
    ytdData.ytdStatutoryIncome,
    ytdData.ytdTaxPaid,
    periodNumber,
    employee.payFrequency,
    taxOverrides
  );

  const nis = isContractor ? 0 : standardTaxes.nis;
  const nht = isContractor ? 0 : standardTaxes.nht;
  const edTax = isContractor ? 0 : standardTaxes.edTax;
  const statutoryDeductionsBeforePaye = nis + nht + edTax + standardTaxes.pension;
  // A normal payroll must never create a negative take-home amount solely from
  // a calculated PAYE catch-up. Tax arrears need an explicit adjustment, not an
  // automatic deduction from a zero/insufficient-pay period.
  const payeCapacity = Math.max(0, safeGrossPay + allAdditions - statutoryDeductionsBeforePaye);
  const finalPAYE = isContractor ? 0 : Math.min(Math.max(0, cumulativePAYE), payeCapacity);
  const totalDeductions = statutoryDeductionsBeforePaye + finalPAYE + customDeductions;
  const netPay = safeGrossPay + allAdditions - totalDeductions;
  const employerContributions = isContractor
    ? {
      employerNIS: 0,
      employerNHT: 0,
      employerEdTax: 0,
      employerHEART: 0,
      totalEmployerCost: 0
    }
    : calculateEmployerContributions(
      currentGross,
      employee.payFrequency,
      resolveCompanyTaxConfig(context.companyData)
    );

  return {
    additions: allAdditions,
    deductions: customDeductions,
    nis,
    nht,
    edTax,
    paye: finalPAYE,
    pension: standardTaxes.pension,
    totalDeductions,
    netPay,
    employerContributions,
    additionsBreakdown,
    deductionsBreakdown
  };
};

export const calculatePayRunLineItem = ({
  employee,
  period,
  customPeriodStart,
  customPeriodEnd,
  context
}: {
  employee: Employee;
  period: string;
  customPeriodStart?: string;
  customPeriodEnd?: string;
  context: PayrollEngineContext;
}): PayRunLineItem => {
  const periodBounds = getPeriodBounds(period, customPeriodStart, customPeriodEnd);
  let grossPay = 0;
  let prorationDetails = undefined;

  const grossSalary = toFiniteNumber(employee.grossSalary);
  const hourlyRate = toFiniteNumber(employee.hourlyRate);
  const pieceRateAmount = toFiniteNumber(employee.pieceRateAmount);
  const pieceCount = toFiniteNumber(context.pieceCounts?.[employee.id]);

  const additionsBreakdown: PayrollItemDetail[] = [];
  const deductionsBreakdown: PayrollItemDetail[] = [];

  employee.allowances?.forEach(allowance => additionsBreakdown.push({
    id: allowance.id,
    name: allowance.name,
    amount: toFiniteNumber(allowance.amount),
    isTaxable: allowance.isTaxable
  }));

  employee.customDeductions
    ?.filter(isCustomDeductionActive)
    .forEach(deduction => {
      let amount = toFiniteNumber(deduction.amount);
      if (deduction.periodType === 'TARGET_BALANCE' && deduction.targetBalance !== undefined) {
        const remainingBalance = Math.max(0, toFiniteNumber(deduction.targetBalance) - toFiniteNumber(deduction.currentBalance));
        amount = Math.min(amount, remainingBalance || amount);
      }

      deductionsBreakdown.push({
        id: deduction.id,
        name: deduction.name,
        amount
      });
    });

  // Support legacy/simple employee deductions (non-term based) as “Other Deductions” in Pay Run.
  // Some parts of the app still populate `employee.deductions` (vs `customDeductions`).
  employee.deductions?.forEach(deduction => deductionsBreakdown.push({
    id: `other-${deduction.id}`,
    name: deduction.name,
    amount: toFiniteNumber(deduction.amount)
  }));

  const unpaidLeaves = context.leaveRequests.filter(request =>
    request.employeeId === employee.id &&
    request.status === 'APPROVED' &&
    request.type === LeaveType.UNPAID
  );

  let totalUnpaidDays = 0;
  unpaidLeaves.forEach(request => {
    if (request.approvedDates && request.approvedDates.length > 0) {
      totalUnpaidDays += request.approvedDates.filter(date => date.startsWith(period)).length;
    } else if (request.startDate.startsWith(period)) {
      totalUnpaidDays += request.days;
    }
  });

  if (totalUnpaidDays > 0 && employee.payType === PayType.SALARIED) {
    const dailyRate = grossSalary / 22;
    additionsBreakdown.push({
      id: `unpaid-leave-${employee.id}`,
      name: `Unpaid Leave (${totalUnpaidDays} days)`,
      amount: -(dailyRate * totalUnpaidDays),
      isTaxable: true
    });
  }

  // Timesheet-paid employees are distinct from legacy Hourly employees in the
  // profile/UI, but both derive gross pay from approved recorded hours.
  if (employee.payType === PayType.HOURLY || employee.payType === PayType.TIMESHEET) {
    const employeeTimesheets = context.timesheets.filter(timesheet =>
      timesheet.employeeId === employee.id &&
      timesheet.status === 'APPROVED' &&
      isTimesheetInPeriod(timesheet, period)
    );

    if (employeeTimesheets.length > 0 && hourlyRate > 0) {
      const totalRegularHours = employeeTimesheets.reduce(
        (sum, timesheet) => sum + toFiniteNumber(timesheet.totalRegularHours),
        0
      );
      const totalOvertimeHours = employeeTimesheets.reduce(
        (sum, timesheet) => sum + toFiniteNumber(timesheet.totalOvertimeHours),
        0
      );
      const overtimePolicy = getTimesheetOvertimePolicy(context.companyData);
      grossPay = (totalRegularHours + (overtimePolicy.enabled ? 0 : totalOvertimeHours)) * hourlyRate;

      if (overtimePolicy.enabled && totalOvertimeHours > 0) {
        additionsBreakdown.push({
          id: 'ot-sys',
          name: 'Overtime',
          amount: totalOvertimeHours * (hourlyRate * overtimePolicy.multiplier),
          isTaxable: true
        });
      }
    }
  } else if (employee.payType === PayType.PIECE_RATE) {
    grossPay = pieceRateAmount * pieceCount;
  } else if (employee.payType === PayType.COMMISSION) {
    grossPay = grossSalary;
  } else {
    const proration = calculateProration(grossSalary, employee.hireDate, periodBounds.periodStart, periodBounds.periodEnd);
    if (proration.isProrated) {
      grossPay = proration.amount;
      prorationDetails = {
        isProrated: true,
        daysWorked: proration.daysWorked,
        totalWorkDays: proration.totalWorkDays,
        originalGross: grossSalary
      };
    } else {
      grossPay = grossSalary;
    }
  }

  const computed = calculateComputedAmounts({
    employee,
    grossPay,
    additionsBreakdown,
    deductionsBreakdown,
    period: periodBounds,
    context
  });

  return {
    employeeId: employee.id,
    employeeName: `${employee.firstName} ${employee.lastName}`,
    employeeCustomId: employee.employeeId,
    jobTitle: employee.jobTitle,
    trn: employee.trn,
    nisId: employee.nis,
    grossPay: toFiniteNumber(grossPay),
    pieceRateAmount: employee.payType === PayType.PIECE_RATE ? pieceRateAmount : undefined,
    pieceCount: employee.payType === PayType.PIECE_RATE ? pieceCount : undefined,
    prorationDetails,
    isTaxOverridden: false,
    isGrossOverridden: false,
    bankName: employee.bankDetails?.bankName,
    accountNumber: employee.bankDetails?.accountNumber,
    ...computed
  };
};

export const initializePayRunLineItems = ({
  employees,
  payCycle,
  period,
  customStartDate,
  customEndDate,
  context
}: {
  employees: Employee[];
  payCycle: PayRunCycleFilter;
  period: string;
  customStartDate?: string;
  customEndDate?: string;
  context: PayrollEngineContext;
}) => {
  return employees
    .filter(employee => {
      if (employee.status !== 'ACTIVE') return false;
      if (payCycle === 'ALL') return true;
      if (payCycle === PayType.PIECE_RATE) return employee.payType === PayType.PIECE_RATE;
      return employee.payFrequency === payCycle;
    })
    .map(employee => calculatePayRunLineItem({
      employee,
      period,
      customPeriodStart: customStartDate,
      customPeriodEnd: customEndDate,
      context
    }));
};

export const recalculateDraftLineItem = ({
  item,
  employee,
  companyData,
  period,
  payRunHistory = []
}: {
  item: PayRunLineItem;
  employee?: Employee;
  companyData?: CompanySettings;
  period?: string;
  payRunHistory?: PayRun[];
}): PayRunLineItem => {
  if (!employee) return item;

  const periodBounds = getPeriodBounds(period || new Date().toISOString().slice(0, 7));
  const additionsBreakdown = (item.additionsBreakdown || []).map(detail => ({
    ...detail,
    amount: toFiniteNumber(detail.amount)
  }));
  const deductionsBreakdown = (item.deductionsBreakdown || []).map(detail => ({
    ...detail,
    amount: toFiniteNumber(detail.amount)
  }));
  const taxableAdditions = additionsBreakdown
    .filter(detail => detail.isTaxable !== false)
    .reduce((sum, detail) => sum + toFiniteNumber(detail.amount), 0);
  const nonTaxableAdditions = additionsBreakdown
    .filter(detail => detail.isTaxable === false)
    .reduce((sum, detail) => sum + toFiniteNumber(detail.amount), 0);
  const allAdditions = taxableAdditions + nonTaxableAdditions;
  const deductionTotal = deductionsBreakdown.reduce((sum, detail) => sum + toFiniteNumber(detail.amount), 0);
  const safeGrossPay = toFiniteNumber(item.grossPay);
  const computed = calculateComputedAmounts({
    employee,
    grossPay: safeGrossPay,
    additionsBreakdown,
    deductionsBreakdown,
    period: periodBounds,
    context: {
      timesheets: [],
      leaveRequests: [],
      payRunHistory,
      companyData
    }
  });

  return {
    ...item,
    ...computed,
    additions: allAdditions,
    deductions: deductionTotal,
    additionsBreakdown,
    deductionsBreakdown,
    isTaxOverridden: false
  };
};
