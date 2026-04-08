import {
  CompanySettings,
  Employee,
  LeaveRequest,
  LeaveType,
  PayFrequency,
  PayrollItemDetail,
  PayRun,
  PayRunLineItem,
  PayType,
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
  payRunHistory?: PayRun[];
  companyData?: CompanySettings;
}

const isTimesheetInPeriod = (ts: WeeklyTimesheet, period: string) => ts.weekEndDate.startsWith(period);

const getEmployeeTaxOverrides = (companyData: CompanySettings | undefined, employee?: Employee) => {
  return buildPayrollOverrides(resolveCompanyTaxConfig(companyData), employee?.pensionContributionRate || 0);
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

  payRunHistory.forEach(run => {
    if (run.periodStart.startsWith(year.toString()) && run.status === 'FINALIZED') {
      const line = run.lineItems.find(item => item.employeeId === employeeId);
      if (line) {
        ytdGross += toFiniteNumber(line.grossPay) + toFiniteNumber(line.additions);
        ytdNIS += toFiniteNumber(line.nis);
        ytdTaxPaid += toFiniteNumber(line.paye);
      }
    }
  });

  return {
    ytdGross,
    ytdNIS,
    ytdTaxPaid,
    ytdStatutoryIncome: ytdGross - ytdNIS
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
  employee: Employee,
  ytdStatutoryIncome: number,
  month: number,
  year: number,
  periodStart: string
) => {
  let periodNumber = ytdStatutoryIncome === 0 ? 1 : month;

  if (employee.payFrequency === PayFrequency.WEEKLY) {
    periodNumber = Math.ceil(
      (new Date(periodStart).getTime() - new Date(year, 0, 1).getTime()) /
      (7 * 24 * 60 * 60 * 1000)
    );
    if (periodNumber === 0) periodNumber = 1;
  } else if (employee.payFrequency === PayFrequency.FORTNIGHTLY) {
    periodNumber = ytdStatutoryIncome === 0 ? 1 : month * 2;
  }

  return periodNumber;
};

const calculateComputedAmounts = ({
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
  const ytdData = getEmployeeYTD(context.payRunHistory || [], employee.id, period.year);
  const periodNumber = calculatePeriodNumber(
    employee,
    ytdData.ytdStatutoryIncome,
    period.month,
    period.year,
    period.periodStart
  );

  const cumulativePAYE = calculateCumulativePAYE(
    currentGross,
    standardTaxes.nis,
    ytdData.ytdStatutoryIncome,
    ytdData.ytdTaxPaid,
    periodNumber,
    employee.payFrequency,
    taxOverrides
  );

  const finalPAYE = Math.max(0, cumulativePAYE);
  const totalDeductions = standardTaxes.nis + standardTaxes.nht + standardTaxes.edTax + finalPAYE + customDeductions;
  const netPay = safeGrossPay + allAdditions - totalDeductions;
  const employerContributions = calculateEmployerContributions(
    currentGross,
    employee.payFrequency,
    resolveCompanyTaxConfig(context.companyData)
  );

  return {
    additions: allAdditions,
    deductions: customDeductions,
    nis: standardTaxes.nis,
    nht: standardTaxes.nht,
    edTax: standardTaxes.edTax,
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

  const additionsBreakdown: PayrollItemDetail[] = [];
  const deductionsBreakdown: PayrollItemDetail[] = [];

  employee.allowances?.forEach(allowance => additionsBreakdown.push({
    id: allowance.id,
    name: allowance.name,
    amount: toFiniteNumber(allowance.amount),
    isTaxable: allowance.isTaxable
  }));

  employee.customDeductions?.forEach(deduction => deductionsBreakdown.push({
    id: deduction.id,
    name: deduction.name,
    amount: toFiniteNumber(deduction.amount)
  }));

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

  if (employee.payType === PayType.HOURLY) {
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
      grossPay = totalRegularHours * hourlyRate;

      if (totalOvertimeHours > 0) {
        additionsBreakdown.push({
          id: 'ot-sys',
          name: 'Overtime',
          amount: totalOvertimeHours * (hourlyRate * 1.5),
          isTaxable: true
        });
      }
    }
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
    grossPay: toFiniteNumber(grossPay),
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
  payCycle: PayFrequency | 'ALL';
  period: string;
  customStartDate?: string;
  customEndDate?: string;
  context: PayrollEngineContext;
}) => {
  return employees
    .filter(employee => employee.status === 'ACTIVE' && (payCycle === 'ALL' || employee.payFrequency === payCycle))
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
  companyData
}: {
  item: PayRunLineItem;
  employee?: Employee;
  companyData?: CompanySettings;
}): PayRunLineItem => {
  if (!employee) return item;

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
  const taxOverrides = getEmployeeTaxOverrides(companyData, employee);
  const taxes = calculateTaxes(safeGrossPay + taxableAdditions, employee.payFrequency || PayFrequency.MONTHLY, taxOverrides);
  const totalDeductions = taxes.totalDeductions + deductionTotal;

  return {
    ...item,
    additions: allAdditions,
    deductions: deductionTotal,
    additionsBreakdown,
    deductionsBreakdown,
    ...taxes,
    totalDeductions,
    netPay: safeGrossPay + allAdditions - totalDeductions,
    employerContributions: calculateEmployerContributions(
      Math.max(0, safeGrossPay + taxableAdditions),
      employee.payFrequency,
      resolveCompanyTaxConfig(companyData)
    ),
    isTaxOverridden: false
  };
};