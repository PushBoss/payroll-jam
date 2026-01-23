import { useMemo } from 'react';
import { Employee, CompanySettings, PricingPlan, User } from '../types';

export const useSubscription = (
    employees: Employee[],
    companyData: CompanySettings,
    plans: PricingPlan[],
    users: User[] = []
) => {
    const limits = useMemo(() => {
        // Normalize plan name
        const normalizedPlanName = companyData.plan === 'Professional' ? 'Pro' : companyData.plan;
        const isResellerPlan = normalizedPlanName === 'Enterprise' || normalizedPlanName === 'Reseller';

        const activePlan = plans.find(p => p.name === normalizedPlanName) || plans[0];

        // Count active employees
        const activeEmployeesCount = employees.filter(e =>
            e.status !== 'TERMINATED' && e.status !== 'ARCHIVED'
        ).length;

        // Count administrative users
        const activeUsersCount = users.length;
        const currentCount = activeEmployeesCount + activeUsersCount;

        let maxEmployees = 5; // Default for Free
        if (isResellerPlan) {
            maxEmployees = 99999;
        } else if (activePlan && activePlan.limit) {
            const limitStr = activePlan.limit;
            if (limitStr === 'Unlimited') {
                maxEmployees = 99999;
            } else {
                // Extract number from "5 Employees" or "Pro & 15 Employees"
                const match = limitStr.match(/(\d+)/);
                maxEmployees = match ? parseInt(match[0]) : 5;
            }
        }

        const isOverLimit = currentCount > maxEmployees;
        const isSuspended = companyData.subscriptionStatus === 'SUSPENDED';
        const isPastDue = companyData.subscriptionStatus === 'PAST_DUE';
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
            isReseller: isResellerPlan
        };
    }, [employees, companyData, plans, users]);

    return limits;
};
