import { PricingPlan } from '../types';

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

  const amount = cycle === 'monthly' ? plan.priceConfig.monthly : plan.priceConfig.annual;
  const baseFee = plan.priceConfig.type === 'base' 
    ? (cycle === 'monthly' ? (plan.priceConfig.monthly || plan.priceConfig.baseFee || 0) : (plan.priceConfig.annual || (plan.priceConfig.baseFee || 0) * 10 || 0))
    : amount;
  
  const perEmpFee = plan.priceConfig.type === 'base' 
    ? (plan.priceConfig.perUserFee || 500)
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

