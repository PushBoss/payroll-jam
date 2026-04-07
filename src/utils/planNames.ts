export const normalizePlanToFrontend = (plan?: string | null): string => {
  if (!plan) return 'Free';

  const normalized = plan.trim().toLowerCase();
  const planMap: Record<string, string> = {
    free: 'Free',
    starter: 'Starter',
    professional: 'Pro',
    pro: 'Pro',
    enterprise: 'Reseller',
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
    reseller: 'Enterprise'
  };

  return planMap[normalized] || 'Free';
};

export const isResellerEquivalentPlan = (plan?: string | null): boolean =>
  normalizePlanToFrontend(plan) === 'Reseller';
