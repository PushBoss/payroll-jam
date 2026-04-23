import { CompanySettings, TaxConfig } from '../../core/types';
import { TAX_CONSTANTS } from '../../core/taxUtils';

export const DEFAULT_TAX_CONFIG: TaxConfig = {
  nisRateEmployee: TAX_CONSTANTS.NIS_RATE_EMPLOYEE,
  nisRateEmployer: TAX_CONSTANTS.NIS_RATE_EMPLOYER,
  nisCap: TAX_CONSTANTS.NIS_CAP_ANNUAL,
  nhtRateEmployee: TAX_CONSTANTS.NHT_RATE_EMPLOYEE,
  nhtRateEmployer: TAX_CONSTANTS.NHT_RATE_EMPLOYER,
  nhtCap: TAX_CONSTANTS.NIS_CAP_ANNUAL,
  edTaxRateEmployee: TAX_CONSTANTS.ED_TAX_RATE,
  edTaxRateEmployer: TAX_CONSTANTS.ED_TAX_RATE_EMPLOYER,
  heartRateEmployer: TAX_CONSTANTS.HEART_RATE_EMPLOYER,
  payeThreshold: TAX_CONSTANTS.PAYE_THRESHOLD,
  payeThresholdHigh: TAX_CONSTANTS.PAYE_THRESHOLD_HIGH,
  payeRateStd: TAX_CONSTANTS.PAYE_RATE_STD,
  payeRateHigh: TAX_CONSTANTS.PAYE_RATE_HIGH
};

const LEGACY_POLICY_TO_TAX_CONFIG: Record<string, keyof TaxConfig> = {
  nis_cap_annual: 'nisCap',
  nisCap: 'nisCap',
  nis_rate_employee: 'nisRateEmployee',
  nisRateEmployee: 'nisRateEmployee',
  nis_rate_employer: 'nisRateEmployer',
  nisRateEmployer: 'nisRateEmployer',
  nht_rate_employee: 'nhtRateEmployee',
  nhtRateEmployee: 'nhtRateEmployee',
  nht_rate_employer: 'nhtRateEmployer',
  nhtRateEmployer: 'nhtRateEmployer',
  nht_cap: 'nhtCap',
  nhtCap: 'nhtCap',
  ed_tax_rate_employee: 'edTaxRateEmployee',
  edTaxRateEmployee: 'edTaxRateEmployee',
  ed_tax_rate_employer: 'edTaxRateEmployer',
  edTaxRateEmployer: 'edTaxRateEmployer',
  heart_rate_employer: 'heartRateEmployer',
  heartRateEmployer: 'heartRateEmployer',
  paye_threshold: 'payeThreshold',
  payeThreshold: 'payeThreshold',
  paye_threshold_high: 'payeThresholdHigh',
  payeThresholdHigh: 'payeThresholdHigh',
  paye_rate_std: 'payeRateStd',
  payeRateStd: 'payeRateStd',
  paye_rate_high: 'payeRateHigh',
  payeRateHigh: 'payeRateHigh'
};

const policiesToTaxConfig = (policies?: Record<string, any>): Partial<TaxConfig> => {
  if (!policies) return {};

  return Object.entries(policies).reduce((acc, [key, value]) => {
    const mappedKey = LEGACY_POLICY_TO_TAX_CONFIG[key];
    if (mappedKey && typeof value === 'number' && Number.isFinite(value)) {
      acc[mappedKey] = value;
    }
    return acc;
  }, {} as Partial<TaxConfig>);
};

export const resolveTaxConfig = (
  taxConfig?: Partial<TaxConfig> | null,
  policies?: Record<string, any>
): TaxConfig => {
  const policyConfig = policiesToTaxConfig(policies);
  const explicitTaxConfig = taxConfig || {};

  // Some legacy codepaths persist a full DEFAULT_TAX_CONFIG object into `taxConfig`.
  // If we blindly spread that last, it will overwrite policy values even when it
  // isn't a real override. We treat values equal to defaults as "not explicit"
  // when a policy value exists for that key.
  const filteredTaxConfig = Object.entries(explicitTaxConfig).reduce((acc, [key, value]) => {
    const typedKey = key as keyof TaxConfig;
    const defaultValue = DEFAULT_TAX_CONFIG[typedKey];
    const hasPolicyOverride = policyConfig[typedKey] !== undefined;

    if (value === undefined || value === null) return acc;

    if (hasPolicyOverride && value === defaultValue) {
      return acc;
    }

    acc[typedKey] = value as any;
    return acc;
  }, {} as Partial<TaxConfig>);

  return {
    ...DEFAULT_TAX_CONFIG,
    ...policyConfig,
    ...filteredTaxConfig
  };
};

export const resolveCompanyTaxConfig = (companyData?: CompanySettings | null): TaxConfig => {
  return resolveTaxConfig(companyData?.taxConfig, companyData?.policies);
};

export const buildPayrollOverrides = (taxConfig: Partial<TaxConfig>, pension: number = 0) => ({
  ...DEFAULT_TAX_CONFIG,
  ...taxConfig,
  nis_cap_annual: taxConfig.nisCap ?? DEFAULT_TAX_CONFIG.nisCap,
  paye_threshold: taxConfig.payeThreshold ?? DEFAULT_TAX_CONFIG.payeThreshold,
  pension
});
