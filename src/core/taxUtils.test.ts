import { describe, it, expect } from 'vitest';
import { calculateTaxes, calculateEmployerContributions } from './taxUtils';
import { PayFrequency } from './types';

describe('taxUtils', () => {
  const defaultTaxConfig = {
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
    payeRateHigh: 0.30
  };


  it('calculates monthly taxes correctly for standard salary', () => {
    // Gross: 200,000 Monthly (2.4M Annual)
    const res = calculateTaxes(200000, PayFrequency.MONTHLY, defaultTaxConfig);
    
    // NIS: min(200k, 5M/12=416.6k) * 0.03 = 200,000 * 0.03 = 6,000
    expect(res.nis).toBe(6000);
    
    // NHT: 200,000 * 0.02 = 4,000
    expect(res.nht).toBe(4000);
    
    // Statutory Income: 200k - 6k (NIS) = 194,000
    // Ed Tax: 194,000 * 0.0225 = 4,365
    expect(res.edTax).toBe(4365);
    
    // Annual Stat Income: 194k * 12 = 2,328,000
    // Taxable: 2,328,000 - 1,700,096 = 627,904
    // Annual PAYE: 627,904 * 0.25 = 156,976
    // Monthly PAYE: 156,976 / 12 = 13,081.33
    expect(res.paye).toBe(13081.33);
  });

  it('applies NIS cap correctly', () => {
    // Gross: 500,000 Monthly (6M Annual)
    const res = calculateTaxes(500000, PayFrequency.MONTHLY, defaultTaxConfig);
    
    // NIS Cap Period: 5M / 12 = 416,666.67
    // NIS: 416,666.67 * 0.03 = 12,500
    expect(res.nis).toBe(12500);
  });

  it('applies High Income PAYE bracket (30%)', () => {
    // Gross: 600,000 Monthly (7.2M Annual)
    // Stat Income: Gross - NIS (12,500 Cap) = 587,500
    // Annual Stat Income: 587,500 * 12 = 7,050,000
    // Standard Taxable (1.7M to 6M): 6M - 1.700,096 = 4,299,904
    // High Taxable (> 6M): 7.05M - 6M = 1.05M
    // Annual PAYE: (4,299,904 * 0.25) + (1.05M * 0.30) = 1,074,976 + 315,000 = 1,389,976
    // Monthly PAYE: 1,389,976 / 12 = 115,831.33
    
    const res = calculateTaxes(600000, PayFrequency.MONTHLY, defaultTaxConfig);
    expect(res.paye).toBe(115831.33);

  });

  it('calculates employer contributions correctly', () => {
    const res = calculateEmployerContributions(200000, PayFrequency.MONTHLY, defaultTaxConfig);
    
    // Employer NIS (2.5%): 200,000 * 0.025 = 5,000
    expect(res.employerNIS).toBe(5000);
    
    // Employer NHT (3%): 200,000 * 0.03 = 6,000
    expect(res.employerNHT).toBe(6000);
    
    // Employer HEART (3%): 200,000 * 0.03 = 6,000
    expect(res.employerHEART).toBe(6000);
    
    // Employer Ed Tax (2.25% on stat income): (200k - 6k employee NIS) * 0.0225 = 194k * 0.0225 = 4365
    expect(res.employerEdTax).toBe(4365);
  });
});
