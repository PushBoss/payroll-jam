/**
 * 2026 Jamaican Payroll Fiscal Calculator
 * Implements PAYE, NIS, NHT, and Education Tax calculations
 * with Pre-April 1st and Post-April 1st thresholds
 */

import type { Jamaica2026TaxConfig as Jamaica2026TaxConfigType } from '../types';
import { PayRunLineItem, Employee, EmployeeType } from '../types';

// 2026 Jamaica Official Tax Configuration
export const Jamaica2026TaxConfig: Jamaica2026TaxConfigType = {
  // NIS Configuration
  nisRate: 0.0316, // 3.16% employee contribution
  nisEmployerRate: 0.0335, // 3.35% employer contribution
  nisCap: 500000, // Maximum pensionable earnings (JMD)
  nisMaxContribution: 15800, // Max contribution per period
  
  // NHT Configuration
  nhtRate: 0.055, // Combined rate (~5.5%)
  nhtEmployeeRate: 0.025, // 2.5% employee
  nhtEmployerRate: 0.030, // 3.0% employer
  nhtCap: 500000, // Maximum insurable earnings
  
  // Education Tax
  edTaxRate: 0.02, // 2% on gross above threshold
  
  // PAYE Thresholds 2026 - PRE-APRIL 1ST
  payeThresholdPre: 1700096, // JMD 1.7M annual (2026 Official)
  payeBracketsPre: [
    {
      threshold: 0,
      rateStd: 0.25, // 25% standard rate
      rateHigh: 0.30, // 30% high rate
      effectiveFrom: '2026-01-01',
      effectiveUntil: '2026-03-31'
    }
  ],
  
  // PAYE Thresholds 2026 - POST-APRIL 1ST
  payeThresholdPost: 1700096, // JMD 1.7M annual (2026 Official - same as pre-April)
  payeBracketsPost: [
    {
      threshold: 0,
      rateStd: 0.25, // 25% standard rate
      rateHigh: 0.30, // 30% high rate
      effectiveFrom: '2026-04-01',
      effectiveUntil: '2026-12-31'
    }
  ],
  
  payeRateStd: 0.25,
  payeRateHigh: 0.30,
  payeThreshold: 1700096, // Current default threshold (2026 Official - 1.7M)
  
  // Estate Levy for contractors
  estateLevyRate: 0.05 // 5% estate levy
};

/**
 * Determines which PAYE threshold bracket applies based on end date
 */
export function getPAYEThreshold(endDate: string): number {
  const date = new Date(endDate);
  const isPostApril = date.getMonth() >= 3; // April = month 3
  return isPostApril ? Jamaica2026TaxConfig.payeThresholdPost : Jamaica2026TaxConfig.payeThresholdPre;
}

/**
 * Calculate pro-rated gross salary based on joining date
 * @param grossSalary Full period gross salary
 * @param joiningDate When employee joined
 * @param periodStart Start of pay period
 * @param periodEnd End of pay period
 * @returns Pro-rated gross and proration details
 */
export function calculateProRatedGross(
  grossSalary: number,
  joiningDate: string | undefined,
  periodStart: string,
  periodEnd: string
): { gross: number; daysWorked: number; totalDays: number } {
  
  if (!joiningDate) {
    // Full period worked
    const totalDays = getDaysBetween(periodStart, periodEnd);
    return { gross: grossSalary, daysWorked: totalDays, totalDays };
  }

  const start = new Date(periodStart);
  const end = new Date(periodEnd);
  const joined = new Date(joiningDate);

  // If joining date is before period start, full period
  if (joined <= start) {
    const totalDays = getDaysBetween(periodStart, periodEnd);
    return { gross: grossSalary, daysWorked: totalDays, totalDays };
  }

  // If joining date is after period end, no payment
  if (joined > end) {
    return { gross: 0, daysWorked: 0, totalDays: getDaysBetween(periodStart, periodEnd) };
  }

  // Joining mid-period
  const totalDays = getDaysBetween(periodStart, periodEnd);
  const daysWorked = getDaysBetween(joiningDate, periodEnd);
  const ratio = daysWorked / totalDays;
  const proratedGross = grossSalary * ratio;

  return { gross: proratedGross, daysWorked, totalDays };
}

/**
 * Calculate days between two dates (inclusive)
 */
function getDaysBetween(startDate: string, endDate: string): number {
  const start = new Date(startDate);
  const end = new Date(endDate);
  const timeDiff = Math.abs(end.getTime() - start.getTime());
  return Math.ceil(timeDiff / (1000 * 3600 * 24)) + 1; // +1 to be inclusive
}

/**
 * Calculate statutory deductions based on gross salary and employee type
 */
export function calculateStatutoryDeductions(
  grossSalary: number,
  employeeType: EmployeeType | undefined,
  periodEndDate: string,
  pensionContributionRate: number = 0,
  customConfig?: Partial<Jamaica2026TaxConfigType>
): {
  nis: number;
  nht: number;
  edTax: number;
  paye: number;
  pension: number;
  totalDeductions: number;
} {
  
  // Merge custom config with defaults
  const config = {
    nisRate: customConfig?.nisRate ?? Jamaica2026TaxConfig.nisRate,
    nisCap: customConfig?.nisCap ?? Jamaica2026TaxConfig.nisCap,
    nhtEmployeeRate: customConfig?.nhtEmployeeRate ?? Jamaica2026TaxConfig.nhtEmployeeRate,
    nhtCap: customConfig?.nhtCap ?? Jamaica2026TaxConfig.nhtCap,
    edTaxRate: customConfig?.edTaxRate ?? Jamaica2026TaxConfig.edTaxRate,
    payeRateStd: customConfig?.payeRateStd ?? Jamaica2026TaxConfig.payeRateStd,
    payeThresholdPre: customConfig?.payeThresholdPre ?? Jamaica2026TaxConfig.payeThresholdPre,
    payeThresholdPost: customConfig?.payeThresholdPost ?? Jamaica2026TaxConfig.payeThresholdPost,
  };
  
  // Calculate Pension contribution first
  const pension = Math.round(grossSalary * pensionContributionRate * 100) / 100;

  // Contractors don't have statutory deductions (except estate levy applied separately)
  if (employeeType === EmployeeType.CONTRACTOR) {
    return {
      nis: 0,
      nht: 0,
      edTax: 0,
      paye: 0,
      pension: pension,
      totalDeductions: pension
    };
  }

  // Calculate statutory income (gross - pension) for tax purposes
  const statutoryIncome = grossSalary - pension;

  // Calculate NIS on statutory income (National Insurance Scheme)
  const nisableEarnings = Math.min(statutoryIncome, config.nisCap);
  const nis = Math.round(nisableEarnings * config.nisRate * 100) / 100;

  // Calculate NHT on statutory income (National Health Trust)
  const nhtableEarnings = Math.min(statutoryIncome, config.nhtCap);
  const nht = Math.round(nhtableEarnings * config.nhtEmployeeRate * 100) / 100;

  // Calculate Education Tax (on statutory income: gross - pension - nis)
  const edTaxBase = statutoryIncome - nis;
  const edTax = edTaxBase > 0 ? Math.round(edTaxBase * config.edTaxRate * 100) / 100 : 0;

  // Calculate PAYE on statutory income (gross - pension)
  const date = new Date(periodEndDate);
  const isPostApril = date.getMonth() >= 3; // April = month 3
  const payeThreshold = isPostApril ? config.payeThresholdPost : config.payeThresholdPre;
  let paye = 0;
  if (statutoryIncome > payeThreshold) {
    paye = Math.round((statutoryIncome - payeThreshold) * config.payeRateStd * 100) / 100;
  }

  const totalDeductions = nis + nht + edTax + paye + pension;

  return {
    nis,
    nht,
    edTax,
    paye,
    pension,
    totalDeductions
  };
}

/**
 * Calculate pro-rated threshold based on days worked
 */
export function getProratedThreshold(
  threshold: number,
  daysWorked: number,
  totalDays: number
): number {
  if (totalDays === 0) return 0;
  return Math.round((threshold * daysWorked / totalDays) * 100) / 100;
}

/**
 * Comprehensive payroll calculation for an employee in a pay period
 * @param employee Employee record
 * @param grossSalary Gross salary for the period
 * @param periodStart Period start date (YYYY-MM-DD)
 * @param periodEnd Period end date (YYYY-MM-DD)
 * @param additions Additional pay/allowances
 * @param deductions Additional deductions
 * @param customConfig Optional tax configuration (overrides defaults)
 */
export function calculateEmployeePayroll(
  employee: Employee,
  grossSalary: number,
  periodStart: string,
  periodEnd: string,
  additions: number = 0,
  deductions: number = 0,
  customConfig?: Partial<Jamaica2026TaxConfigType>
): Partial<PayRunLineItem> {
  
  // 1. Pro-rating based on joining date
  const proRatingResult = calculateProRatedGross(
    grossSalary,
    employee.joiningDate,
    periodStart,
    periodEnd
  );
  const { gross: proratedGross } = proRatingResult;

  // 2. Calculate pension contribution
  const pensionAmount = Math.round(proratedGross * (employee.pensionContributionRate || 0) * 100) / 100;

  // 3. Calculate statutory deductions (using custom config if provided)
  const statutoryDeductions = calculateStatutoryDeductions(proratedGross, employee.employeeType, periodEnd, employee.pensionContributionRate || 0, customConfig);

  // 4. Calculate net pay
  const netPay = proratedGross + additions - statutoryDeductions.totalDeductions - deductions;

  return {
    employeeId: employee.id,
    employeeName: `${employee.firstName} ${employee.lastName}`,
    employeeCustomId: employee.employeeId,
    grossPay: Math.round(proratedGross * 100) / 100,
    additions: additions,
    deductions: deductions,
    nis: statutoryDeductions.nis,
    nht: statutoryDeductions.nht,
    edTax: statutoryDeductions.edTax,
    paye: statutoryDeductions.paye,
    pension: statutoryDeductions.pension,
    totalDeductions: Math.round(statutoryDeductions.totalDeductions * 100) / 100,
    netPay: Math.round(netPay * 100) / 100,
    prorationDetails: {
      isProrated: proRatingResult.daysWorked < proRatingResult.totalDays,
      daysWorked: proRatingResult.daysWorked,
      totalWorkDays: proRatingResult.totalDays,
      originalGross: grossSalary
    }
  };
}

/**
 * Handle custom deduction tracking
 */
export function processCustomDeductions(
  customDeductions: any[] | undefined
): {
  totalDeductions: number;
  updatedDeductions: any[];
} {
  
  if (!customDeductions || customDeductions.length === 0) {
    return { totalDeductions: 0, updatedDeductions: [] };
  }

  let totalDeductions = 0;
  const updated = customDeductions.map(deduction => {
    const copy = { ...deduction };
    
    if (deduction.periodType === 'FIXED_TERM') {
      // Decrement remaining term
      if (copy.remainingTerm && copy.remainingTerm > 0) {
        copy.remainingTerm--;
        totalDeductions += copy.amount;
      }
    } else if (deduction.periodType === 'TARGET_BALANCE') {
      // Check if target reached
      const current = copy.currentBalance || 0;
      if (current < (copy.targetBalance || 0)) {
        const toDeduct = Math.min(copy.amount, (copy.targetBalance || 0) - current);
        copy.currentBalance = current + toDeduct;
        totalDeductions += toDeduct;
      }
    } else {
      // FIXED_AMOUNT - always deduct
      totalDeductions += copy.amount;
    }
    
    return copy;
  });

  return { totalDeductions, updatedDeductions: updated };
}

/**
 * Calculate employer contributions for S01/S02 reporting
 * @param grossSalary Gross salary for the period
 * @param employeeType Employee classification
 * @param customConfig Optional tax configuration (overrides defaults)
 */
export function calculateEmployerContributions(grossSalary: number, employeeType: EmployeeType | undefined, customConfig?: Partial<Jamaica2026TaxConfigType>) {
  // Merge custom config with defaults
  const config = {
    nisEmployerRate: customConfig?.nisEmployerRate ?? Jamaica2026TaxConfig.nisEmployerRate,
    nisCap: customConfig?.nisCap ?? Jamaica2026TaxConfig.nisCap,
    nhtEmployerRate: customConfig?.nhtEmployerRate ?? Jamaica2026TaxConfig.nhtEmployerRate,
    nhtCap: customConfig?.nhtCap ?? Jamaica2026TaxConfig.nhtCap,
  };
  
  if (employeeType === EmployeeType.CONTRACTOR) {
    return {
      employerNIS: 0,
      employerNHT: 0,
      employerEdTax: 0,
      employerHEART: 0,
      totalEmployerCost: 0
    };
  }

  const nisableEarnings = Math.min(grossSalary, config.nisCap);
  const employerNIS = Math.round(nisableEarnings * config.nisEmployerRate * 100) / 100;

  const nhtableEarnings = Math.min(grossSalary, config.nhtCap);
  const employerNHT = Math.round(nhtableEarnings * config.nhtEmployerRate * 100) / 100;

  // Employer doesn't typically pay Education Tax (employee pays)
  const employerEdTax = 0;

  // HEART Trust contribution (if applicable)
  const employerHEART = 0; // Configure as needed

  const totalEmployerCost = employerNIS + employerNHT + employerEdTax + employerHEART;

  return {
    employerNIS,
    employerNHT,
    employerEdTax,
    employerHEART,
    totalEmployerCost
  };
}
