import { PricingPlan } from '../core/types';

export const getPlanPriceDetails = (plan: PricingPlan, cycle: 'monthly' | 'annual') => {
  const period = cycle === 'monthly' ? '/month' : '/year';

  if (plan.priceConfig.type === 'free') {
    return {
      amount: 0,
      formattedAmount: '$0',
      period: '',
      suffix: '',
      fullSuffix: '',
      baseFee: 0,
      perEmpFee: 0
    };
  }

  const amount = cycle === 'monthly' ? plan.priceConfig.monthly : (plan.priceConfig.annual || plan.priceConfig.monthly * 10);
  const baseFee = plan.priceConfig.type === 'base'
    ? (cycle === 'monthly' ? (plan.priceConfig.monthly || plan.priceConfig.baseFee || 0) : (plan.priceConfig.annual || (plan.priceConfig.baseFee || 0) * 10 || 0))
    : amount;

  const perEmpFee = plan.priceConfig.type === 'base'
    ? (cycle === 'monthly' ? (plan.priceConfig.perUserFee || 500) : ((plan.priceConfig.perUserFee || 500) * 10))
    : (plan.priceConfig.type === 'per_emp' ? amount : 0);

  let suffix = period;
  if (plan.priceConfig.type === 'per_emp') suffix = `${period} per employee`;
  if (plan.priceConfig.type === 'base') suffix = `${period} base`;

  return {
    amount: baseFee,
    formattedAmount: `$${baseFee.toLocaleString()}`,
    period,
    suffix,
    fullSuffix: plan.priceConfig.type === 'base' ? `${suffix} + $${perEmpFee.toLocaleString()} per employee` : suffix,
    baseFee,
    perEmpFee
  };
};

/**
 * Calculates proration for mid-cycle upgrades
 * Formula: (days_remaining / total_days) * (price_delta)
 */
export const calculateProrationUpgrade = (
  currentPrice: number,
  newPrice: number,
  nextBillingDate: string
): number => {
  const now = new Date();
  const billingDate = new Date(nextBillingDate);

  // Total days in current billing cycle (approximate to 30 for simplicity in MVP)
  // Or calculate based on previous month
  const totalDays = 30;

  const timeDiff = billingDate.getTime() - now.getTime();
  const daysRemaining = Math.max(0, Math.ceil(timeDiff / (1000 * 3600 * 24)));

  const priceDelta = newPrice - currentPrice;
  if (priceDelta <= 0) return 0; // Downgrades or same price don't trigger proration charge here

  const proratedAmount = (daysRemaining / totalDays) * priceDelta;
  return Math.max(0, parseFloat(proratedAmount.toFixed(2)));
};

