import { useMemo } from 'react';
import { Employee, CompanySettings, PricingPlan } from '../types';

export const useSubscription = (
    employees: Employee[], 
    companyData: CompanySettings, 
    plans: PricingPlan[]
) => {
    const limits = useMemo(() => {
        const activePlan = plans.find(p => p.name === companyData.plan) || plans[0]; // Default to Free
        
        // Count employees that count towards the limit (Active only, usually)
        // Terminated/Archived usually don't count in active billing for most SaaS, 
        // but verifying historical data might be a 'Pro' feature. 
        // For this model, we assume Active + Pending counts.
        const currentCount = employees.filter(e => 
            e.status !== 'TERMINATED' && e.status !== 'ARCHIVED'
        ).length;
        
        // Parse limit string "5 Employees" -> 5
        const limitStr = activePlan.limit.split(' ')[0];
        const maxEmployees = limitStr === 'Unlimited' ? 99999 : parseInt(limitStr) || 5;

        const isOverLimit = currentCount > maxEmployees;
        const isSuspended = companyData.subscriptionStatus === 'SUSPENDED';
        const isPastDue = companyData.subscriptionStatus === 'PAST_DUE';

        // Soft Lock: Feature Blocking
        // Block adding employees if over limit
        // Block Payroll if Suspended or Over Limit
        const canAddEmployee = !isOverLimit && !isSuspended;
        const canRunPayroll = !isSuspended; // We might allow running payroll for existing staff even if over limit, but usually not.
        
        return {
            planName: activePlan.name,
            currentCount,
            maxEmployees,
            isOverLimit,
            isSuspended,
            isPastDue,
            canAddEmployee,
            canRunPayroll
        };
    }, [employees, companyData, plans]);

    return limits;
};