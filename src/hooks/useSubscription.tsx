import { useMemo } from 'react';
import { Employee, CompanySettings, PricingPlan, User } from '../core/types';
import { isResellerEquivalentPlan, normalizePlanToFrontend } from '../utils/planNames';
import { getBillingGiftEmployeeLimitOverride, getEffectiveSubscriptionStatus } from '../utils/billingGift';

export const getSubscriptionLimits = (
  employees: Employee[],
  companyData: CompanySettings,
  plans: PricingPlan[],
  users: User[] = []
) => {
  const normalizedPlanName = normalizePlanToFrontend(companyData.plan);
  const isResellerPlan = isResellerEquivalentPlan(companyData.plan);

  const activePlan = plans.find(p => p.name === normalizedPlanName) || plans[0];

  const activeEmployeesCount = employees.filter((employee) =>
    employee.status !== 'TERMINATED' && employee.status !== 'ARCHIVED'
  ).length;

  const activeUsersCount = users.length;
  const currentCount = activeEmployeesCount + activeUsersCount;

  let maxEmployees = 5;
  if (isResellerPlan) {
    maxEmployees = 99999;
  } else if (activePlan && activePlan.limit) {
    const limitStr = activePlan.limit;
    if (limitStr === 'Unlimited') {
      maxEmployees = 99999;
    } else {
      const match = limitStr.match(/(\d+)/);
      maxEmployees = match ? parseInt(match[0]) : 5;
    }
  }

  const giftedLimitOverride = getBillingGiftEmployeeLimitOverride(companyData);
  if (giftedLimitOverride === 'Unlimited') {
    maxEmployees = 99999;
  } else if (giftedLimitOverride) {
    const match = giftedLimitOverride.match(/(\d+)/);
    if (match) {
      maxEmployees = parseInt(match[0]);
    }
  }

  const isOverLimit = currentCount > maxEmployees;
  const effectiveSubscriptionStatus = getEffectiveSubscriptionStatus(companyData);
  const isSuspended = effectiveSubscriptionStatus === 'SUSPENDED';
  const isPastDue = effectiveSubscriptionStatus === 'PAST_DUE';
  const canAddEmployee = !isOverLimit && !isSuspended;
  const canRunPayroll = !isSuspended;

  return {
    planName: activePlan?.name || normalizedPlanName || 'Free',
    currentCount,
    maxEmployees,
    activeEmployeesCount,
    activeUsersCount,
    isOverLimit,
    isSuspended,
    isPastDue,
    canAddEmployee,
    canRunPayroll,
    isReseller: isResellerPlan,
  };
};

export const useSubscription = (
  employees: Employee[],
  companyData: CompanySettings,
  plans: PricingPlan[],
  users: User[] = []
) => {
  const limits = useMemo(() => {
    return getSubscriptionLimits(employees, companyData, plans, users);
  }, [employees, companyData, plans, users]);

  return limits;
};
