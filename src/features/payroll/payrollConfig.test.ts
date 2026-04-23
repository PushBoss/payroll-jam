import { describe, expect, it } from 'vitest';
import { buildPayrollOverrides, DEFAULT_TAX_CONFIG, resolveCompanyTaxConfig } from './payrollConfig';

describe('payrollConfig', () => {
  it('merges company policies with explicit taxConfig overrides', () => {
    const resolved = resolveCompanyTaxConfig({
      name: 'Acme Ltd',
      trn: '123',
      address: 'Kingston',
      phone: '876-000-0000',
      bankName: 'NCB',
      accountNumber: '1234567890',
      branchCode: '001',
      policies: {
        paye_threshold: 1800000,
        nis_cap_annual: 5400000
      },
      taxConfig: {
        ...DEFAULT_TAX_CONFIG,
        payeThreshold: 1900000,
        nhtRateEmployee: 0.03
      }
    });

    expect(resolved.nisCap).toBe(5400000);
    expect(resolved.payeThreshold).toBe(1900000);
    expect(resolved.nhtRateEmployee).toBe(0.03);
  });

  it('exposes legacy aliases required by cumulative payroll helpers', () => {
    const overrides = buildPayrollOverrides({
      payeThreshold: 1750000,
      nisCap: 5100000
    }, 5);

    expect(overrides.payeThreshold).toBe(1750000);
    expect(overrides.paye_threshold).toBe(1750000);
    expect(overrides.nisCap).toBe(5100000);
    expect(overrides.nis_cap_annual).toBe(5100000);
    expect(overrides.pension).toBe(5);
  });
});