import { describe, expect, it } from 'vitest';
import { CompanySettings, PricingPlan } from '../core/types';
import { getEffectiveSubscriptionStatus, isBillingGiftActive } from '../utils/billingGift';
import { getSubscriptionLimits } from './useSubscription';

const plans: PricingPlan[] = [
  {
    id: 'starter',
    name: 'Starter',
    priceConfig: { type: 'flat', monthly: 49, annual: 490 },
    description: 'Starter plan',
    limit: '5 Employees',
    features: [],
    cta: 'Choose Starter',
    highlight: false,
    color: '#111827',
    textColor: '#ffffff',
    isActive: true,
  },
];

const makeCompany = (overrides: Partial<CompanySettings> = {}): CompanySettings => ({
  name: 'Dirty Hand Designs',
  trn: '123456789',
  address: 'Kingston',
  phone: '555-1212',
  bankName: 'NCB',
  accountNumber: '1234567890',
  branchCode: '00001',
  plan: 'Starter',
  subscriptionStatus: 'SUSPENDED',
  ...overrides,
});

describe('useSubscription gift overrides', () => {
  it('treats an active billing gift as active access', () => {
    const company = makeCompany({
      billingGift: {
        giftedUntil: '2099-05-01T00:00:00.000Z',
        grantedAt: '2099-04-01T00:00:00.000Z',
        grantedBy: 'super-admin',
        grantedByName: 'Super Admin',
        monthsGranted: 1,
        employeeLimitOverride: 'Unlimited',
      },
    });

    expect(isBillingGiftActive(company.billingGift)).toBe(true);
    expect(getEffectiveSubscriptionStatus(company)).toBe('ACTIVE');
  });

  it('lifts the employee cap and payroll suspension while a billing gift is active', () => {
    const company = makeCompany({
      billingGift: {
        giftedUntil: '2099-05-01T00:00:00.000Z',
        grantedAt: '2099-04-01T00:00:00.000Z',
        grantedBy: 'super-admin',
        grantedByName: 'Super Admin',
        monthsGranted: 1,
        employeeLimitOverride: 'Unlimited',
      },
    });

    const employees = Array.from({ length: 7 }, (_, index) => ({
      id: `emp-${index}`,
      firstName: 'Test',
      lastName: `Employee ${index}`,
      email: `employee-${index}@example.com`,
      trn: `TRN${index}`,
      nis: `NIS${index}`,
      grossSalary: 1000,
      payType: 'SALARIED' as const,
      payFrequency: 'MONTHLY' as const,
      role: 'EMPLOYEE' as const,
      status: 'ACTIVE' as const,
      hireDate: '2025-01-01',
    }));

    const limits = getSubscriptionLimits(employees, company, plans, []);

    expect(limits.maxEmployees).toBe(99999);
    expect(limits.isOverLimit).toBe(false);
    expect(limits.isSuspended).toBe(false);
    expect(limits.canAddEmployee).toBe(true);
    expect(limits.canRunPayroll).toBe(true);
  });

  it('falls back to the underlying subscription state when the gift has expired', () => {
    const company = makeCompany({
      billingGift: {
        giftedUntil: '2024-01-01T00:00:00.000Z',
        grantedAt: '2023-12-01T00:00:00.000Z',
        grantedBy: 'super-admin',
        monthsGranted: 1,
        employeeLimitOverride: 'Unlimited',
      },
    });

    const employees = Array.from({ length: 7 }, (_, index) => ({
      id: `emp-${index}`,
      firstName: 'Test',
      lastName: `Employee ${index}`,
      email: `employee-${index}@example.com`,
      trn: `TRN${index}`,
      nis: `NIS${index}`,
      grossSalary: 1000,
      payType: 'SALARIED' as const,
      payFrequency: 'MONTHLY' as const,
      role: 'EMPLOYEE' as const,
      status: 'ACTIVE' as const,
      hireDate: '2025-01-01',
    }));

    const limits = getSubscriptionLimits(employees, company, plans, []);

    expect(isBillingGiftActive(company.billingGift)).toBe(false);
    expect(getEffectiveSubscriptionStatus(company)).toBe('SUSPENDED');
    expect(limits.maxEmployees).toBe(5);
    expect(limits.isOverLimit).toBe(true);
    expect(limits.isSuspended).toBe(true);
    expect(limits.canRunPayroll).toBe(false);
  });
});
