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
    // The "Reseller" signup card is a role signal, not a stored plan: it
    // persists as the Enterprise plan (which carries the reseller economics).
    // Reseller-ness is tracked by Role.RESELLER, not the plan string.
    reseller: 'Enterprise'
  };

  return planMap[normalized] || 'Free';
};

// Enterprise IS the reseller plan tier (every Enterprise account is a partner).
// Legacy "Reseller" plan values remain recognized until the data migration runs.
// NOTE: this is a plan→features signal only (unlimited seats, reseller billing);
// backend authorization for cross-company client access remains gated on
// Role.RESELLER, never on the plan.
export const isResellerEquivalentPlan = (plan?: string | null): boolean => {
  const normalized = normalizePlanToFrontend(plan);
  return normalized === 'Reseller' || normalized === 'Enterprise';
};
