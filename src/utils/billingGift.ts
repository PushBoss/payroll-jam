import { BillingGift, CompanySettings } from '../core/types';

const ACTIVE_OVERRIDE = 'ACTIVE' as const;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

export const toBillingGift = (value: unknown): BillingGift | undefined => {
  if (!isRecord(value)) return undefined;

  const giftedUntil = typeof value.giftedUntil === 'string' ? value.giftedUntil : '';
  const grantedAt = typeof value.grantedAt === 'string' ? value.grantedAt : '';
  const grantedBy = typeof value.grantedBy === 'string' ? value.grantedBy : '';
  const monthsGranted = typeof value.monthsGranted === 'number'
    ? value.monthsGranted
    : Number(value.monthsGranted);

  if (!giftedUntil || !grantedAt || !grantedBy || !Number.isFinite(monthsGranted)) {
    return undefined;
  }

  return {
    giftedUntil,
    grantedAt,
    grantedBy,
    grantedByName: typeof value.grantedByName === 'string' ? value.grantedByName : undefined,
    monthsGranted,
    note: typeof value.note === 'string' ? value.note : undefined,
    employeeLimitOverride: typeof value.employeeLimitOverride === 'string'
      ? value.employeeLimitOverride
      : undefined,
  };
};

export const isBillingGiftActive = (billingGift?: BillingGift | null, now = new Date()): boolean => {
  if (!billingGift?.giftedUntil) return false;

  const giftedUntil = new Date(billingGift.giftedUntil);
  return Number.isFinite(giftedUntil.getTime()) && giftedUntil.getTime() >= now.getTime();
};

export const getEffectiveSubscriptionStatus = (
  companyData?: Pick<CompanySettings, 'subscriptionStatus' | 'billingGift'> | null,
  now = new Date(),
): NonNullable<CompanySettings['subscriptionStatus']> => {
  const baseStatus = companyData?.subscriptionStatus || ACTIVE_OVERRIDE;
  if (isBillingGiftActive(companyData?.billingGift, now)) {
    return ACTIVE_OVERRIDE;
  }

  return baseStatus;
};

export const getBillingGiftEmployeeLimitOverride = (
  companyData?: Pick<CompanySettings, 'billingGift'> | null,
  now = new Date(),
): string | undefined => {
  if (!isBillingGiftActive(companyData?.billingGift, now)) {
    return undefined;
  }

  return companyData?.billingGift?.employeeLimitOverride || 'Unlimited';
};
