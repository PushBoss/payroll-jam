import { PayFrequency, StatutoryDeductions, TaxConfig } from './types';
import { roundJMD } from '../utils/moneyUtils';


// --- Constants for Jamaican Tax Year 2026 ---
// Based on official Tax Administration Jamaica (TAJ) rates
export const TAX_CONSTANTS = {
  // Employee Contributions
  NIS_RATE_EMPLOYEE: 0.03, // 3%
  NHT_RATE_EMPLOYEE: 0.02, // 2%
  ED_TAX_RATE: 0.0225, // 2.25%

  // Employer Contributions
  NIS_RATE_EMPLOYER: 0.025, // 2.5% (CORRECTED from 3%)
  NHT_RATE_EMPLOYER: 0.03, // 3%
  ED_TAX_RATE_EMPLOYER: 0.0225, // 2.25% on emoluments
  HEART_RATE_EMPLOYER: 0.03, // 3% (HEART/NTF contribution)

  // Caps and Thresholds
  NIS_CAP_ANNUAL: 5000000, // JMD 5M Annual Cap (Core Global)
  PAYE_THRESHOLD: 1700096, // JMD 1.7M Tax Free Threshold (2026 Core Global)
  PAYE_RATE_STD: 0.25, // 25%
  PAYE_RATE_HIGH: 0.30, // 30% for income > 6M
  PAYE_THRESHOLD_HIGH: 6000000,

  // Legacy compatibility
  NIS_RATE: 0.03, // Kept for backward compatibility
  NHT_RATE: 0.02 // Kept for backward compatibility
};

export const getPeriodsPerYear = (freq: PayFrequency): number => {
  switch (freq) {
    case PayFrequency.WEEKLY: return 52;
    case PayFrequency.FORTNIGHTLY: return 26;
    case PayFrequency.MONTHLY: default: return 12;
  }
};

/**
 * Calculates standard statutory deductions for a single period (Non-cumulative)
 * Note: This calculates EMPLOYEE deductions only
 */
export const calculateTaxes = (
  gross: number,
  frequency: PayFrequency = PayFrequency.MONTHLY,
  overrides?: Partial<TaxConfig> & { pension?: number; }
): StatutoryDeductions => {
  const periods = getPeriodsPerYear(frequency);
  const nisCap = overrides?.nisCap ?? TAX_CONSTANTS.NIS_CAP_ANNUAL;
  const payeThreshold = overrides?.payeThreshold ?? TAX_CONSTANTS.PAYE_THRESHOLD;
  const payeThresholdHigh = overrides?.payeThresholdHigh ?? TAX_CONSTANTS.PAYE_THRESHOLD_HIGH;
  const nisRate = overrides?.nisRateEmployee ?? TAX_CONSTANTS.NIS_RATE_EMPLOYEE;
  const nhtRate = overrides?.nhtRateEmployee ?? TAX_CONSTANTS.NHT_RATE_EMPLOYEE;
  const edTaxRate = overrides?.edTaxRateEmployee ?? TAX_CONSTANTS.ED_TAX_RATE;
  const payeRateStd = overrides?.payeRateStd ?? TAX_CONSTANTS.PAYE_RATE_STD;
  const payeRateHigh = overrides?.payeRateHigh ?? TAX_CONSTANTS.PAYE_RATE_HIGH;

  const pensionRate = overrides?.pension ?? 0;

  // 0. Pension Contribution (deducted before statutory income)
  const pensionAmount = gross * (pensionRate / 100);

  // 1. NIS (3% Employee) - Capped Annually
  const nisPeriodCap = nisCap / periods;
  const insurableWage = Math.min(gross, nisPeriodCap);
  const nis = insurableWage * nisRate;

  // 2. NHT (2% Employee)
  const nht = gross * nhtRate;

  // 3. Education Tax (2.25%) - on Statutory Income (Gross - Pension - NIS)
  const statutoryIncomePeriod = gross - pensionAmount - nis;
  const edTax = statutoryIncomePeriod * edTaxRate;

  // 4. PAYE (Income Tax) - on Statutory Income (Gross - Pension - NIS)
  const statutoryIncomeAnnual = statutoryIncomePeriod * periods;

  let payeAnnual = 0;

  if (statutoryIncomeAnnual > payeThreshold) {
    let taxableStandard = 0;
    let taxableHigh = 0;

    if (statutoryIncomeAnnual > payeThresholdHigh) {
      taxableStandard = payeThresholdHigh - payeThreshold;
      taxableHigh = statutoryIncomeAnnual - payeThresholdHigh;
    } else {
      taxableStandard = statutoryIncomeAnnual - payeThreshold;
    }

    payeAnnual = (taxableStandard * payeRateStd) + (taxableHigh * payeRateHigh);
  }

  const paye = payeAnnual / periods;

  const totalDeductions = nis + nht + edTax + paye + pensionAmount;
  const netPay = gross - totalDeductions;

  return {
    nis: roundJMD(nis),
    nht: roundJMD(nht),
    edTax: roundJMD(edTax),
    paye: roundJMD(paye),
    pension: roundJMD(pensionAmount),
    totalDeductions: roundJMD(totalDeductions),
    netPay: roundJMD(netPay)
  };
};


/**
 * Calculates employer statutory contributions
 * These are additional costs to the employer beyond gross salary
 */
export const calculateEmployerContributions = (
  gross: number,
  frequency: PayFrequency = PayFrequency.MONTHLY,
  overrides?: Partial<TaxConfig>
): {
  employerNIS: number;
  employerNHT: number;
  employerEdTax: number;
  employerHEART: number;
  totalEmployerCost: number;
} => {
  const periods = getPeriodsPerYear(frequency);
  const nisCap = overrides?.nisCap ?? TAX_CONSTANTS.NIS_CAP_ANNUAL;
  const nisRateEmployer = overrides?.nisRateEmployer ?? TAX_CONSTANTS.NIS_RATE_EMPLOYER;
  const nhtRateEmployer = overrides?.nhtRateEmployer ?? TAX_CONSTANTS.NHT_RATE_EMPLOYER;
  const edTaxRateEmployer = overrides?.edTaxRateEmployer ?? TAX_CONSTANTS.ED_TAX_RATE_EMPLOYER;
  const heartRateEmployer = overrides?.heartRateEmployer ?? TAX_CONSTANTS.HEART_RATE_EMPLOYER;
  const nisRateEmployee = overrides?.nisRateEmployee ?? TAX_CONSTANTS.NIS_RATE_EMPLOYEE;

  // 1. Employer NIS (2.5%) - Capped at same threshold as employee
  const nisPeriodCap = nisCap / periods;
  const insurableWage = Math.min(gross, nisPeriodCap);
  const employerNIS = insurableWage * nisRateEmployer;

  // 2. Employer NHT (3%)
  const employerNHT = gross * nhtRateEmployer;

  // 3. Employer Education Tax (2.25% on statutory income)
  const employeeNIS = insurableWage * nisRateEmployee;
  const statutoryIncome = gross - employeeNIS;
  const employerEdTax = statutoryIncome * edTaxRateEmployer;

  // 4. HEART/NTF (3% employer only)
  const employerHEART = gross * heartRateEmployer;

  const totalEmployerCost = employerNIS + employerNHT + employerEdTax + employerHEART;

  return {
    employerNIS: roundJMD(employerNIS),
    employerNHT: roundJMD(employerNHT),
    employerEdTax: roundJMD(employerEdTax),
    employerHEART: roundJMD(employerHEART),
    totalEmployerCost: roundJMD(totalEmployerCost)
  };
};


/**
 * Calculates Cumulative PAYE based on YTD Earnings
 * Used to smooth out tax liability over the year.
 */
export const calculateCumulativePAYE = (
  currentGross: number,
  currentNis: number,
  ytdStatutoryIncome: number, // Previous YTD Gross - Previous YTD Pension - Previous YTD NIS
  ytdTaxPaid: number,
  periodNumber: number, // e.g., Month 3
  frequency: PayFrequency = PayFrequency.MONTHLY,
  overrides?: (Partial<TaxConfig> & {
    pension?: number;
    paye_threshold?: number;
    paye_threshold_high?: number;
    paye_rate_std?: number;
    paye_rate_high?: number;
  })
): number => {
  const periodsPerYear = getPeriodsPerYear(frequency);
  const safePeriodNumber = Math.max(1, Math.floor(Number.isFinite(periodNumber) ? periodNumber : 1));

  const payeThreshold = overrides?.payeThreshold ?? overrides?.paye_threshold ?? TAX_CONSTANTS.PAYE_THRESHOLD;
  const payeThresholdHigh = overrides?.payeThresholdHigh ?? overrides?.paye_threshold_high ?? TAX_CONSTANTS.PAYE_THRESHOLD_HIGH;
  const payeRateStd = overrides?.payeRateStd ?? overrides?.paye_rate_std ?? TAX_CONSTANTS.PAYE_RATE_STD;
  const payeRateHigh = overrides?.payeRateHigh ?? overrides?.paye_rate_high ?? TAX_CONSTANTS.PAYE_RATE_HIGH;
  const pensionRate = overrides?.pension ?? 0;

  // Calculate pension for current period
  const currentPension = currentGross * (pensionRate / 100);

  // 1. Calculate Total Cumulative Statutory Income to Date
  const currentStatutoryIncome = currentGross - currentPension - currentNis;
  const totalCumulativeStatutoryIncome = ytdStatutoryIncome + currentStatutoryIncome;

  // 2. Calculate Cumulative Tax Free Threshold to Date
  const annualThreshold = payeThreshold;
  const cumulativeThreshold = (annualThreshold / periodsPerYear) * safePeriodNumber;

  // 3. Determine Cumulative Taxable Income
  const cumulativeTaxableIncome = Math.max(0, totalCumulativeStatutoryIncome - cumulativeThreshold);

  if (cumulativeTaxableIncome === 0) return 0;

  // 4. Calculate Total Tax Due to Date with proper tax brackets
  let totalTaxDueToDate = 0;

  // Calculate cumulative annual statutory income
  const annualizedStatutoryIncome = (totalCumulativeStatutoryIncome / safePeriodNumber) * periodsPerYear;

  if (annualizedStatutoryIncome > payeThresholdHigh) {
    // High bracket: Split between 25% and 30%
    const standardBand = Math.max(0, payeThresholdHigh - payeThreshold);
    const highBand = Math.max(0, annualizedStatutoryIncome - payeThresholdHigh);
    const annualTax = (standardBand * payeRateStd) + (highBand * payeRateHigh);
    totalTaxDueToDate = (annualTax / periodsPerYear) * safePeriodNumber;
  } else if (annualizedStatutoryIncome > payeThreshold) {
    // Standard bracket: 25%
    const taxableAmount = annualizedStatutoryIncome - payeThreshold;
    const annualTax = taxableAmount * payeRateStd;
    totalTaxDueToDate = (annualTax / periodsPerYear) * safePeriodNumber;
  }

  // 5. Tax for this specific period
  const taxForPeriod = Math.max(0, totalTaxDueToDate - ytdTaxPaid);

  return parseFloat(taxForPeriod.toFixed(2));
};

export const calculateProration = (
  fullSalary: number,
  hireDateStr: string,
  periodStartStr: string,
  periodEndStr: string
): { amount: number, isProrated: boolean, daysWorked: number, totalWorkDays: number } => {
  const start = new Date(periodStartStr);
  const end = new Date(periodEndStr);
  const hired = new Date(hireDateStr);

  start.setHours(0, 0, 0, 0);
  end.setHours(0, 0, 0, 0);
  hired.setHours(0, 0, 0, 0);

  if (hired > end) return { amount: 0, isProrated: true, daysWorked: 0, totalWorkDays: 0 };

  // Count working days in the actual period
  let totalWorkDays = 0;
  let daysWorked = 0;

  let loop = new Date(start);
  while (loop <= end) {
    const day = loop.getDay();
    if (day !== 0 && day !== 6) {
      totalWorkDays++;
      // Only count days worked if employee was hired by that date
      if (loop >= hired) daysWorked++;
    }
    loop.setDate(loop.getDate() + 1);
  }

  if (totalWorkDays === 0) return { amount: fullSalary, isProrated: false, daysWorked: 0, totalWorkDays: 0 };

  // Calculate standard working days for a full month (22 days)
  const standardMonthWorkDays = 22;

  // If the actual period is shorter than standard, pro-rate based on period length
  // AND also account for new hires within the period
  const periodIsShort = totalWorkDays < standardMonthWorkDays;
  const isNewHireInPeriod = hired > start;

  if (periodIsShort || isNewHireInPeriod) {
    const amount = (fullSalary / standardMonthWorkDays) * daysWorked;
    return {
      amount: parseFloat(amount.toFixed(2)),
      isProrated: true,
      daysWorked,
      totalWorkDays
    };
  }

  // Employee was hired before period start AND period is full length
  return { amount: fullSalary, isProrated: false, daysWorked: 0, totalWorkDays: 0 };
};