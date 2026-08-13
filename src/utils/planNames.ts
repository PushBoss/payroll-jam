export const normalizePlanToFrontend = (plan?: string | null): string => {
  if (!plan) return 'Free';

  const normalized = plan.trim().toLowerCase();
  const planMap: Record<string, string> = {
    free: 'Free',
    starter: 'Starter',
    professional: 'Pro',
    pro: 'Pro',
    enterprise: 'Enterprise',
    reseller: 'Reseller'
  };

  return planMap[normalized] || plan;
};

export const normalizePlanToDatabase = (plan?: string | null): string => {
  if (!plan) return 'Free';

  const normalized = plan.trim().toLowerCase();
  const planMap: Record<string, string> = {
    free: 'Free',
    starter: 'Starter',
    professional: 'Professional',
    pro: 'Professional',
    enterprise: 'Enterprise',
    // Reseller is the Enterprise-tier subscription role. Store the canonical
    // subscription plan while role-based access remains Role.RESELLER.
    reseller: 'Enterprise'
  };

  return planMap[normalized] || 'Free';
};

// Enterprise is the reseller subscription tier. This is only a feature signal;
// cross-company authorization remains gated on Role.RESELLER.
export const isResellerEquivalentPlan = (plan?: string | null): boolean => {
  const normalized = normalizePlanToFrontend(plan);
  return normalized === 'Reseller' || normalized === 'Enterprise';
};
