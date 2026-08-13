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
    reseller: 'Reseller'
  };

  return planMap[normalized] || 'Free';
};

// Reseller is distinct from Enterprise. This is only a feature signal;
// cross-company authorization remains gated on Role.RESELLER.
export const isResellerEquivalentPlan = (plan?: string | null): boolean => {
  const normalized = normalizePlanToFrontend(plan);
  return normalized === 'Reseller';
};
