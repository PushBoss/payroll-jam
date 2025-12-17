import { CompanySettings } from '../types';

/**
 * Feature access control based on subscription tier
 */
export const getPlanFeatures = (planName: string | undefined): string[] => {
  const plan = planName || 'Free';
  
  switch (plan) {
    case 'Free':
      return ['Basic Payroll', 'Payslip PDF'];
    case 'Starter':
      return ['Basic Payroll', 'Payslip PDF', 'S01/S02 Reports', 'ACH Bank Files', 'Email Support', 'Employee Portal'];
    case 'Pro':
    case 'Professional':
      return ['Basic Payroll', 'Payslip PDF', 'S01/S02 Reports', 'ACH Bank Files', 'Email Support', 'GL Integration', 'Employee Portal', 'Advanced HR', 'AI Assistant', 'Compliance', 'Documents'];
    default:
      return ['Basic Payroll', 'Payslip PDF'];
  }
};

export const hasFeatureAccess = (companyData: CompanySettings | undefined, feature: string): boolean => {
  if (!companyData) return false;
  const planFeatures = getPlanFeatures(companyData.plan);
  return planFeatures.includes(feature);
};

export const getFeatureUpgradeMessage = (feature: string, currentPlan: string | undefined): string => {
  const plan = currentPlan || 'Free';
  
  if (plan === 'Free') {
    if (['Employee Portal', 'Employee Dashboard', 'AI Assistant', 'Compliance', 'Documents'].includes(feature)) {
      return 'Upgrade to Starter or Pro to access this feature';
    }
  }
  
  if (plan === 'Starter') {
    if (['GL Integration', 'Advanced HR', 'AI Assistant'].includes(feature)) {
      return 'Upgrade to Pro to access this feature';
    }
  }
  
  return 'Upgrade your plan to access this feature';
};

