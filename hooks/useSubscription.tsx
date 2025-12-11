import { useMemo } from 'react';
import { Employee, CompanySettings, PricingPlan } from '../types';

export const useSubscription = (
    employees: Employee[], 
    companyData: CompanySettings, 
    plans: PricingPlan[]
) => {
    const limits = useMemo(() => {
        const activePlan = plans.find(p => p.name === companyData.plan) || plans[0]; // Default to Free
        if (!activePlan || !activePlan.limit) {
            // Fallback: treat as unlimited if no plan or limit
            return {
                planName: activePlan?.name || 'Unknown',
                currentCount: employees.length,
                maxEmployees: 99999,
                isOverLimit: false,
                isSuspended: companyData.subscriptionStatus === 'SUSPENDED',
                isPastDue: companyData.subscriptionStatus === 'PAST_DUE',
                canAddEmployee: true,
                canRunPayroll: true
            };
        }
        // Count employees that count towards the limit (Active only, usually)
        const currentCount = employees.filter(e => 
            e.status !== 'TERMINATED' && e.status !== 'ARCHIVED'
        ).length;
        // Parse limit string "5 Employees" -> 5
        const limitStr = activePlan.limit.split(' ')[0];
        const maxEmployees = limitStr === 'Unlimited' ? 99999 : parseInt(limitStr) || 5;
        const isOverLimit = currentCount > maxEmployees;
        const isSuspended = companyData.subscriptionStatus === 'SUSPENDED';
        const isPastDue = companyData.subscriptionStatus === 'PAST_DUE';
        const canAddEmployee = !isOverLimit && !isSuspended;
        const canRunPayroll = !isSuspended;
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