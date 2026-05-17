/**
 * Strict representation of subscription tiers.
 */
export type PlanTier = 'basic' | 'professional' | 'enterprise';

/**
 * Subscription statuses governing workspace access states.
 */
export type SubscriptionStatus = 'active_paid' | 'past_due_locked' | 'canceled';

/**
 * DB Subscription extension fields.
 */
export interface BillingSubscription {
  id: string;
  companyId: string;
  status: SubscriptionStatus;
  planTier: PlanTier;
  cancelAtPeriodEnd: boolean;
  periodEndDate: Date;
  showExpiryBannerWindow: boolean; // Controls 5-day pre-expiry warning modal/alert
}

/**
 * Threshold settings for each plan tier.
 */
export interface PlanThreshold {
  maxEmployees: number;
  monthlyFee: number;
}

export const PLAN_THRESHOLDS: Record<PlanTier, PlanThreshold> = {
  basic: {
    maxEmployees: 5,
    monthlyFee: 0
  },
  professional: {
    maxEmployees: 50,
    monthlyFee: 15000 // JMD or local currency unit
  },
  enterprise: {
    maxEmployees: 999999, // Unlimited
    monthlyFee: 50000
  }
};
