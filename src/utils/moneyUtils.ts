/**
 * Universal JMD Currency Utilities
 * Ensures consistent "Money Math" and decimal precision across the app.
 */

/**
 * Rounds a number to exactly 2 decimal places for JMD currency.
 * Used for all statutory and payroll calculations.
 */
export function roundJMD(amount: number): number {
  return Math.round(amount * 100) / 100;
}

/**
 * Formats a number as a JMD currency string with commas and 2 decimals.
 * Example: 158333.33 -> "$158,333.33"
 */
export function formatJMD(amount: number): string {
  return new Intl.NumberFormat('en-JM', {
    style: 'currency',
    currency: 'JMD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(amount);
}

/**
 * Normalizes an input for currency processing (removes commas/symbols).
 */
export function parseJMD(input: string | number): number {
  if (typeof input === 'number') return input;
  const normalized = input.replace(/[$,]/g, '');
  return parseFloat(normalized) || 0;
}
