import { PlanTier, PLAN_THRESHOLDS } from '../types/billing';

export interface TierEvaluationResult {
  isCompliant: boolean;
  activeCount: number;
  maxLimit: number;
  excessCount: number;
  warningMessage: string | null;
}

/**
 * Evaluates whether a company's active headcount is compliant with a target plan.
 * 
 * @param activeEmployeeCount The number of currently active (non-archived) employees.
 * @param targetPlan The plan tier the company is trying to downgrade to or maintain.
 */
export function evaluatePlanTierLimit(
  activeEmployeeCount: number,
  targetPlan: PlanTier
): TierEvaluationResult {
  const threshold = PLAN_THRESHOLDS[targetPlan];
  if (!threshold) {
    throw new Error(`Plan tier '${targetPlan}' does not exist in configuration.`);
  }

  const maxLimit = threshold.maxEmployees;
  const isCompliant = activeEmployeeCount <= maxLimit;
  const excessCount = isCompliant ? 0 : activeEmployeeCount - maxLimit;

  let warningMessage: string | null = null;
  if (!isCompliant) {
    warningMessage = `Your workspace currently has ${activeEmployeeCount} active employees. The ${targetPlan} plan allows a maximum of ${maxLimit} active employees. Please archive at least ${excessCount} employee(s) to apply this plan.`;
  }

  return {
    isCompliant,
    activeCount: activeEmployeeCount,
    maxLimit,
    excessCount,
    warningMessage
  };
}
