import { PricingPlan } from '../types';

export const INITIAL_PLANS: PricingPlan[] = [
  {
    id: 'p1',
    name: 'Free',
    priceConfig: { type: 'free', monthly: 0, annual: 0 },
    description: 'Perfect for micro-businesses looking to automate their manual payroll.',
    limit: '5 Employees',
    features: ['Basic Payroll Calculation', 'Compliant Payslip PDF', 'Tax Summary Viewing', 'Email Ticket Support'],
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
    description: 'Comprehensive compliance for growing Jamaican teams.',
    limit: '25 Employees',
    features: ['Everything in Free', 'S01/S02 Reports', 'ACH Multi-Bank Files', 'Employee Portal Access', 'Priority Support'],
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
    description: 'Advanced HR and accounting integration for larger organizations.',
    limit: 'Unlimited Employees',
    features: ['Everything in Starter', 'GL Integration (Quickbooks/Xero)', 'Advanced HR & Assets', 'Document Templates', 'AI Payroll Assistant'],
    cta: 'Get Started',
    highlight: false,
    color: 'bg-white',
    textColor: 'text-gray-900',
    isActive: true
  },
  {
    id: 'p4',
    name: 'Reseller',
    priceConfig: { type: 'base', monthly: 0, annual: 0, baseFee: 3000, perUserFee: 500, resellerCommission: 20 },
    description: 'Dedicated workspace for Accountants & Payroll Bureaus.',
    limit: 'Unlimited Employees',
    features: ['White Label Branding', 'Multi-Client Portfolio', '20% Revenue Commission', 'Compliance Dashboard', 'Dedicated Partner Support'],
    cta: 'Become a Partner',
    highlight: false,
    color: 'bg-gray-100',
    textColor: 'text-gray-900',
    isActive: true
  }
];
