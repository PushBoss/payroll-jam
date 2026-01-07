import { PricingPlan } from '../types';

export const INITIAL_PLANS: PricingPlan[] = [
  { 
    id: 'p1', 
    name: 'Free', 
    priceConfig: { type: 'free', monthly: 0, annual: 0 }, 
    description: 'For small businesses', 
    limit: '5 Employees & Users', 
    features: ['Basic Payroll', 'Payslip PDF', 'Email Support'], 
    cta: 'Start Free', 
    highlight: false, 
    color: 'bg-white', 
    textColor: 'text-gray-900', 
    isActive: true 
  },
  { 
    id: 'p2', 
    name: 'Starter', 
    priceConfig: { type: 'flat', monthly: 5000, annual: 50000 }, 
    description: 'Growing teams needing compliance', 
    limit: '25 Employees & Users', 
    features: ['S01/S02 Reports', 'ACH Bank Files', 'Priority Support'], 
    cta: 'Get Started', 
    highlight: true, 
    color: 'bg-jam-black', 
    textColor: 'text-white', 
    isActive: true 
  },
  { 
    id: 'p3', 
    name: 'Pro', 
    priceConfig: { type: 'per_emp', monthly: 500, annual: 5000 }, 
    description: 'Larger organizations', 
    limit: 'Unlimited Employees & Users', 
    features: ['GL Integration', 'Employee Portal', 'Advanced HR'], 
    cta: 'Get Started', 
    highlight: false, 
    color: 'bg-white', 
    textColor: 'text-gray-900', 
    isActive: true 
  },
  { 
    id: 'p4', 
    name: 'Reseller', 
    priceConfig: { type: 'base', monthly: 0, annual: 0, baseFee: 5000, perUserFee: 500, resellerCommission: 20 }, 
    description: 'For Accountants & Payroll Bureaus', 
    limit: 'Unlimited Employees & Users', 
    features: ['White Label', 'Client Management', '20% Commission'], 
    cta: 'Get Started', 
    highlight: false, 
    color: 'bg-gray-100', 
    textColor: 'text-gray-900', 
    isActive: true 
  }
];
