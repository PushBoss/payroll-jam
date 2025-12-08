import { PayFrequency, StatutoryDeductions } from '../types';

// --- Constants for Jamaican Tax Year 2025 ---
export const TAX_CONSTANTS = {
  NIS_RATE: 0.03, // 3%
  NIS_CAP_ANNUAL: 5000000, // 5M Cap
  NHT_RATE: 0.02, // 2%
  ED_TAX_RATE: 0.0225, // 2.25%
  PAYE_THRESHOLD: 1500096, // 1.5M Tax Free Threshold
  PAYE_RATE_STD: 0.25, // 25%
  PAYE_RATE_HIGH: 0.30, // 30% for income > 6M
  PAYE_THRESHOLD_HIGH: 6000000
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
 */
export const calculateTaxes = (gross: number, frequency: PayFrequency = PayFrequency.MONTHLY): StatutoryDeductions => {
  const periods = getPeriodsPerYear(frequency);
  
  // 1. NIS (3%) - Capped Annually
  const nisPeriodCap = TAX_CONSTANTS.NIS_CAP_ANNUAL / periods;
  const insurableWage = Math.min(gross, nisPeriodCap);
  const nis = insurableWage * TAX_CONSTANTS.NIS_RATE;

  // 2. NHT (2%)
  const nht = gross * TAX_CONSTANTS.NHT_RATE;

  // 3. Education Tax (2.25%) - on Statutory Income (Gross - NIS)
  const edTax = (gross - nis) * TAX_CONSTANTS.ED_TAX_RATE;

  // 4. PAYE (Income Tax)
  const statutoryIncomePeriod = gross - nis; // Statutory Income for PAYE purposes
  const statutoryIncomeAnnual = statutoryIncomePeriod * periods;
  
  let payeAnnual = 0;

  if (statutoryIncomeAnnual > TAX_CONSTANTS.PAYE_THRESHOLD) {
    let taxableStandard = 0;
    let taxableHigh = 0;

    if (statutoryIncomeAnnual > TAX_CONSTANTS.PAYE_THRESHOLD_HIGH) {
        taxableStandard = TAX_CONSTANTS.PAYE_THRESHOLD_HIGH - TAX_CONSTANTS.PAYE_THRESHOLD;
        taxableHigh = statutoryIncomeAnnual - TAX_CONSTANTS.PAYE_THRESHOLD_HIGH;
    } else {
        taxableStandard = statutoryIncomeAnnual - TAX_CONSTANTS.PAYE_THRESHOLD;
    }

    payeAnnual = (taxableStandard * TAX_CONSTANTS.PAYE_RATE_STD) + (taxableHigh * TAX_CONSTANTS.PAYE_RATE_HIGH);
  }
  
  const paye = payeAnnual / periods;

  const totalDeductions = nis + nht + edTax + paye;
  const netPay = gross - totalDeductions;

  return {
    nis: parseFloat(nis.toFixed(2)),
    nht: parseFloat(nht.toFixed(2)),
    edTax: parseFloat(edTax.toFixed(2)),
    paye: parseFloat(paye.toFixed(2)),
    totalDeductions: parseFloat(totalDeductions.toFixed(2)),
    netPay: parseFloat(netPay.toFixed(2))
  };
};

/**
 * Calculates Cumulative PAYE based on YTD Earnings
 * Used to smooth out tax liability over the year.
 */
export const calculateCumulativePAYE = (
    currentGross: number,
    currentNis: number,
    ytdStatutoryIncome: number, // Previous YTD Gross - Previous YTD NIS
    ytdTaxPaid: number,
    periodNumber: number, // e.g., Month 3
    frequency: PayFrequency = PayFrequency.MONTHLY
): number => {
    const periodsPerYear = getPeriodsPerYear(frequency);
    
    // 1. Calculate Total Cumulative Statutory Income to Date
    const currentStatutoryIncome = currentGross - currentNis;
    const totalCumulativeStatutoryIncome = ytdStatutoryIncome + currentStatutoryIncome;

    // 2. Calculate Cumulative Tax Free Threshold to Date
    const annualThreshold = TAX_CONSTANTS.PAYE_THRESHOLD;
    const cumulativeThreshold = (annualThreshold / periodsPerYear) * periodNumber;

    // 3. Determine Cumulative Taxable Income
    const cumulativeTaxableIncome = Math.max(0, totalCumulativeStatutoryIncome - cumulativeThreshold);

    if (cumulativeTaxableIncome === 0) return 0;

    // 4. Calculate Total Tax Due to Date
    // Note: Simplified High Rate check for cumulative (assuming standard rate for simplicity in MVP)
    // Production apps would split this into bands cumulatively too.
    const totalTaxDueToDate = cumulativeTaxableIncome * TAX_CONSTANTS.PAYE_RATE_STD;

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

    start.setHours(0,0,0,0);
    end.setHours(0,0,0,0);
    hired.setHours(0,0,0,0);

    if (hired <= start) return { amount: fullSalary, isProrated: false, daysWorked: 0, totalWorkDays: 0 };
    if (hired > end) return { amount: 0, isProrated: true, daysWorked: 0, totalWorkDays: 0 };

    let totalWorkDays = 0;
    let daysWorked = 0;
    
    let loop = new Date(start);
    while (loop <= end) {
        const day = loop.getDay();
        if (day !== 0 && day !== 6) {
            totalWorkDays++;
            if (loop >= hired) daysWorked++;
        }
        loop.setDate(loop.getDate() + 1);
    }

    if (totalWorkDays === 0) return { amount: fullSalary, isProrated: false, daysWorked: 0, totalWorkDays: 0 };

    const amount = (fullSalary / totalWorkDays) * daysWorked;
    
    return {
        amount: parseFloat(amount.toFixed(2)),
        isProrated: true,
        daysWorked,
        totalWorkDays
    };
};