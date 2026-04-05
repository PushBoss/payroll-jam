/**
 * Enhanced PayRun Period Calculator
 * Handles date ranges, pro-rating, and 2026 Jamaican fiscal thresholds
 */

import { Employee, PayRunLineItem, PayFrequency } from '../../core/types';
import {
  calculateEmployeePayroll,
  processCustomDeductions,
  calculateEmployerContributions
} from './jamaica2026Fiscal';
import { TaxConfig } from '../../core/types';


export interface PayRunPeriod {
  startDate: string; // YYYY-MM-DD
  endDate: string;   // YYYY-MM-DD
  periodType: PayFrequency;
  daysInPeriod: number;
}

/**
 * Parse a date range into a PayRunPeriod
 */
export function parsePayRunPeriod(
  startDate: string,
  endDate: string,
  periodType: PayFrequency
): PayRunPeriod {
  const start = new Date(startDate);
  const end = new Date(endDate);
  const daysInPeriod = Math.ceil((end.getTime() - start.getTime()) / (1000 * 3600 * 24)) + 1;

  return {
    startDate,
    endDate,
    periodType,
    daysInPeriod
  };
}

/**
 * Calculate default period dates based on PayFrequency
 */
export function getDefaultPeriodDates(payFrequency: PayFrequency, fromDate?: Date): { startDate: string; endDate: string } {
  const date = fromDate || new Date();
  
  switch (payFrequency) {
    case PayFrequency.WEEKLY:
      // Get Monday of current week
      const monday = new Date(date);
      const day = monday.getDay();
      const diff = monday.getDate() - day + (day === 0 ? -6 : 1);
      const weekStart = new Date(monday.setDate(diff));
      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekEnd.getDate() + 6);
      return {
        startDate: weekStart.toISOString().split('T')[0],
        endDate: weekEnd.toISOString().split('T')[0]
      };

    case PayFrequency.FORTNIGHTLY:
      // Get start of fortnight (roughly)
      const fortStart = new Date(date.getFullYear(), date.getMonth(), 1);
      const fortEnd = new Date(fortStart);
      fortEnd.setDate(fortEnd.getDate() + 13);
      return {
        startDate: fortStart.toISOString().split('T')[0],
        endDate: fortEnd.toISOString().split('T')[0]
      };

    case PayFrequency.MONTHLY:
      // Get month start and end
      const monthStart = new Date(date.getFullYear(), date.getMonth(), 1);
      const monthEnd = new Date(date.getFullYear(), date.getMonth() + 1, 0);
      return {
        startDate: monthStart.toISOString().split('T')[0],
        endDate: monthEnd.toISOString().split('T')[0]
      };
  }
}

/**
 * Calculate payroll for all employees in a period with pro-rating
 * @param employees Array of employees to process
 * @param period Pay period details
 * @param additionalDeductions Ad-hoc deductions by employee ID
 * @param additionalAdditions Ad-hoc additions by employee ID
 * @param taxConfig Optional tax configuration (uses defaults if not provided)
 */
export function calculatePayrunLineItems(
  employees: Employee[],
  period: PayRunPeriod,
  additionalDeductions: Record<string, number> = {},
  additionalAdditions: Record<string, number> = {},
  taxConfig?: Partial<TaxConfig>
): PayRunLineItem[] {

  
  return employees
    .filter(emp => emp.status === 'ACTIVE')
    .map(emp => {
      // Get employee's actual gross based on pay type and frequency
      let employeeGross = emp.grossSalary;
      
      // For hourly employees, calculate based on standard hours
      if (emp.payType === 'HOURLY') {
        const standardHours = calculateStandardHours(period.periodType, period.daysInPeriod);
        employeeGross = (emp.hourlyRate || 0) * standardHours;
      }

      // Calculate pro-rated gross (pass tax config)
      const payrollData = calculateEmployeePayroll(
        emp,
        employeeGross,
        period.startDate,
        period.endDate,
        additionalAdditions[emp.id] || 0,
        additionalDeductions[emp.id] || 0,
        taxConfig
      );

      // Process custom deductions
      const { totalDeductions: customDeductionAmount } = processCustomDeductions(
        emp.customDeductions
      );

      // Calculate employer contributions (pass tax config)
      const employerContributions = calculateEmployerContributions(payrollData.grossPay || 0, emp.employeeType, taxConfig);

      // Combine all deductions
      const totalDeductions = (payrollData.totalDeductions || 0) + customDeductionAmount;
      const netPay = (payrollData.grossPay || 0) + (payrollData.additions || 0) - totalDeductions;

      return {
        employeeId: emp.id,
        employeeName: `${emp.firstName} ${emp.lastName}`,
        employeeCustomId: emp.employeeId,
        grossPay: payrollData.grossPay || 0,
        additions: payrollData.additions || 0,
        deductions: totalDeductions,
        nis: payrollData.nis || 0,
        nht: payrollData.nht || 0,
        edTax: payrollData.edTax || 0,
        paye: payrollData.paye || 0,
        totalDeductions: totalDeductions,
        netPay: netPay,
        prorationDetails: payrollData.prorationDetails,
        employerContributions: employerContributions,
        bankName: emp.bankDetails?.bankName,
        accountNumber: emp.bankDetails?.accountNumber
      } as PayRunLineItem;
    });
}

/**
 * Calculate standard hours for a pay period
 */
function calculateStandardHours(_periodType: PayFrequency, daysInPeriod: number): number {
  const hoursPerDay = 8; // Standard 8-hour workday
  const workDaysInPeriod = Math.ceil((daysInPeriod * 5) / 7); // Adjust for weekends
  return workDaysInPeriod * hoursPerDay;
}

/**
 * Get PAYE threshold for a specific period end date (2026 logic)
 */
export function getPayeThresholdForPeriod(periodEndDate: string): {
  threshold: number;
  effectiveDate: string;
  bracket: 'pre-april' | 'post-april';
} {
  const date = new Date(periodEndDate);
  const isPostApril = date.getMonth() >= 3; // April = month 3
  
  if (isPostApril) {
    return {
      threshold: 1700096, // Post-April threshold (2026 Official)
      effectiveDate: '2026-04-01',
      bracket: 'post-april'
    };
  }
  
  return {
    threshold: 1700096, // Pre-April threshold (2026 Official)
    effectiveDate: '2026-01-01',
    bracket: 'pre-april'
  };
}

/**
 * Summary of a payrun period
 */
export interface PayRunSummary {
  periodStart: string;
  periodEnd: string;
  totalEmployees: number;
  totalGross: number;
  totalAdditions: number;
  totalDeductions: number;
  totalNIS: number;
  totalNHT: number;
  totalEdTax: number;
  totalPAYE: number;
  totalNet: number;
  totalEmployerCost: number;
  payeThreshold: number;
  payeBracket: 'pre-april' | 'post-april';
}

/**
 * Generate payrun summary from line items
 */
export function generatePayRunSummary(
  lineItems: PayRunLineItem[],
  periodStart: string,
  periodEnd: string
): PayRunSummary {
  const { threshold, bracket } = getPayeThresholdForPeriod(periodEnd);

  const summary: PayRunSummary = {
    periodStart,
    periodEnd,
    totalEmployees: lineItems.length,
    totalGross: 0,
    totalAdditions: 0,
    totalDeductions: 0,
    totalNIS: 0,
    totalNHT: 0,
    totalEdTax: 0,
    totalPAYE: 0,
    totalNet: 0,
    totalEmployerCost: 0,
    payeThreshold: threshold,
    payeBracket: bracket
  };

  lineItems.forEach(item => {
    summary.totalGross += item.grossPay || 0;
    summary.totalAdditions += item.additions || 0;
    summary.totalDeductions += item.totalDeductions || 0;
    summary.totalNIS += item.nis || 0;
    summary.totalNHT += item.nht || 0;
    summary.totalEdTax += item.edTax || 0;
    summary.totalPAYE += item.paye || 0;
    summary.totalNet += item.netPay || 0;
    if (item.employerContributions) {
      summary.totalEmployerCost += item.employerContributions.totalEmployerCost || 0;
    }
  });

  return summary;
}

/**
 * Validate a pay period for processing
 */
export function validatePayPeriod(period: PayRunPeriod): { isValid: boolean; errors: string[] } {
  const errors: string[] = [];

  const start = new Date(period.startDate);
  const end = new Date(period.endDate);

  if (isNaN(start.getTime())) {
    errors.push('Invalid start date');
  }
  if (isNaN(end.getTime())) {
    errors.push('Invalid end date');
  }
  if (start > end) {
    errors.push('Start date must be before end date');
  }
  if (period.daysInPeriod < 1) {
    errors.push('Period must contain at least one day');
  }

  return {
    isValid: errors.length === 0,
    errors
  };
}
