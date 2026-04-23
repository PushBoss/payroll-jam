import { useState, useMemo, useCallback } from 'react';
import { Employee, PayRunLineItem, PayFrequency, WeeklyTimesheet, LeaveRequest, PayrollItemDetail, StatutoryDeductions, PayRun, CompanySettings } from '../../core/types';
import {
    calculatePayrollTotals,
    calculatePayRunLineItem,
    initializePayRunLineItems,
    recalculateDraftLineItem
} from './payrollEngine';

export const usePayroll = (
    employees: Employee[],
    timesheets: WeeklyTimesheet[],
    leaveRequests: LeaveRequest[],
    payRunHistory: PayRun[] = [],
    companyData?: CompanySettings
) => {
    const [draftItems, setDraftItems] = useState<PayRunLineItem[]>([]);

<<<<<<< HEAD
    // Resolve Effective Policies for this company context
    const policies = useMemo(() => {
        const global = {
            nisCap: TAX_CONSTANTS.NIS_CAP_ANNUAL,
            payeThreshold: TAX_CONSTANTS.PAYE_THRESHOLD
        };

        if (!companyData) return global;

        // "Most-Specific-Wins" resolution: Local > Reseller > Global
        return {
            nisCap: companyData.policies?.nis_cap_annual ?? companyData.reseller_defaults?.nis_cap_annual ?? global.nisCap,
            payeThreshold: companyData.policies?.paye_threshold ?? companyData.reseller_defaults?.paye_threshold ?? global.payeThreshold
        };
    }, [companyData]);
=======
    const payrollContext = useMemo(() => ({
        timesheets,
        leaveRequests,
        payRunHistory,
        companyData
    }), [timesheets, leaveRequests, payRunHistory, companyData]);

>>>>>>> 0a6b81cb09aa2a5587c7387200103601a1de60b4

    const totals = useMemo(() => {
        return calculatePayrollTotals(draftItems);
    }, [draftItems]);

<<<<<<< HEAD
    // Calculate YTD Stats for an employee for a specific year
    const getEmployeeYTD = (employeeId: string, year: number) => {
        let ytdGross = 0;
        let ytdNIS = 0;
        let ytdTaxPaid = 0;

        payRunHistory.forEach(run => {
            if (run.periodStart.startsWith(year.toString()) && run.status === 'FINALIZED') {
                const line = run.lineItems.find(l => l.employeeId === employeeId);
                if (line) {
                    ytdGross += (line.grossPay + line.additions);
                    ytdNIS += line.nis;
                    ytdTaxPaid += line.paye;
                }
            }
        });

        return { ytdGross, ytdNIS, ytdTaxPaid, ytdStatutoryIncome: ytdGross - ytdNIS };
    };

    const calculateLineItem = (emp: Employee, period: string, customPeriodStart?: string, customPeriodEnd?: string): PayRunLineItem => {
        const [yearStr, monthStr] = period.split('-');
        const year = parseInt(yearStr);
        const month = parseInt(monthStr);
        
        // Ensure periods are always strings with defaults
        let periodStart: string;
        let periodEnd: string;
        
        if (customPeriodStart) {
            periodStart = customPeriodStart;
        } else {
            periodStart = `${period}-01`;
        }
        
        if (customPeriodEnd) {
            periodEnd = customPeriodEnd;
        } else {
            const lastDay = new Date(year, month, 0).getDate();
            periodEnd = `${period}-${lastDay}`;
        }

        let grossPay = 0;
        let prorationDetails = undefined;

        const additionsBreakdown: PayrollItemDetail[] = [];
        const deductionsBreakdown: PayrollItemDetail[] = [];

        if (emp.allowances) {
            emp.allowances.forEach(a => additionsBreakdown.push({
                id: a.id,
                name: a.name,
                amount: a.amount,
                isTaxable: a.isTaxable
            }));
        }
        if (emp.customDeductions) {
            emp.customDeductions.forEach(d => deductionsBreakdown.push({ id: d.id, name: d.name, amount: d.amount }));
        }

        // Unpaid Leave Logic
        const unpaidLeaves = leaveRequests.filter(r =>
            r.employeeId === emp.id &&
            r.status === 'APPROVED' &&
            r.type === LeaveType.UNPAID
        );

        let totalUnpaidDays = 0;
        unpaidLeaves.forEach(r => {
            if (r.approvedDates && r.approvedDates.length > 0) {
                const daysInMonth = r.approvedDates.filter(d => d.startsWith(period)).length;
                totalUnpaidDays += daysInMonth;
            } else {
                if (r.startDate.startsWith(period)) totalUnpaidDays += r.days;
            }
        });

        if (totalUnpaidDays > 0 && emp.payType === PayType.SALARIED) {
            const dailyRate = emp.grossSalary / 22;
            const deductionAmount = dailyRate * totalUnpaidDays;
            additionsBreakdown.push({
                id: `unpaid-leave-${emp.id}`,
                name: `Unpaid Leave (${totalUnpaidDays} days)`,
                amount: -deductionAmount,
                isTaxable: true
            });
        }

        if (emp.payType === PayType.HOURLY) {
            const empTimesheets = timesheets.filter(
                t => t.employeeId === emp.id && t.status === 'APPROVED' && isTimesheetInPeriod(t, period)
            );
            if (empTimesheets.length > 0 && emp.hourlyRate) {
                const totalReg = empTimesheets.reduce((acc, t) => acc + t.totalRegularHours, 0);
                const totalOT = empTimesheets.reduce((acc, t) => acc + t.totalOvertimeHours, 0);
                grossPay = totalReg * emp.hourlyRate;
                if (totalOT > 0) {
                    additionsBreakdown.push({
                        id: 'ot-sys',
                        name: 'Overtime',
                        amount: totalOT * (emp.hourlyRate * 1.5),
                        isTaxable: true
                    });
                }
            }
        } else if (emp.payType === PayType.COMMISSION) {
            grossPay = emp.grossSalary || 0;
        } else {
            const fullSalary = emp.grossSalary;
            const proration = calculateProration(fullSalary, emp.hireDate, periodStart, periodEnd);
            if (proration.isProrated) {
                grossPay = proration.amount;
                prorationDetails = {
                    isProrated: true,
                    daysWorked: proration.daysWorked,
                    totalWorkDays: proration.totalWorkDays,
                    originalGross: fullSalary
                };
            } else {
                grossPay = fullSalary;
            }
        }

        // --- CALCULATION ---
        const taxableAdditions = additionsBreakdown.filter(i => i.isTaxable !== false).reduce((sum, item) => sum + item.amount, 0);
        const nonTaxableAdditions = additionsBreakdown.filter(i => i.isTaxable === false).reduce((sum, item) => sum + item.amount, 0);
        const allAdditions = taxableAdditions + nonTaxableAdditions;
        const customDeductions = deductionsBreakdown.reduce((sum, item) => sum + item.amount, 0);

        // Current Period Gross
        const currentGross = Math.max(0, grossPay + taxableAdditions);

        // 1. Calculate Standard Period Taxes (NIS, NHT, Ed)
        const taxOverrides = {
            ...policies,
            pension: emp.pensionContributionRate || 0
        };
        const cumulativeTaxOverrides = {
            nis_cap_annual: policies.nisCap,
            paye_threshold: policies.payeThreshold,
            pension: emp.pensionContributionRate || 0
        };
        const standardTaxes = calculateTaxes(currentGross, emp.payFrequency, taxOverrides);

        // 2. Apply Cumulative Logic for PAYE if Salaried
        // (Cumulative mostly applies to regular employees. Hourly/Casual often taxed flatly in simpler systems, 
        // but we'll apply to all for robust compliance)
        const ytdData = getEmployeeYTD(emp.id, year);

        // Determine Period Number (e.g., Monthly: Jan=1, Feb=2)
        // For first payrun (no YTD history), use 1; otherwise use calendar position
        let periodNumber = ytdData.ytdStatutoryIncome === 0 ? 1 : month;
        if (emp.payFrequency === PayFrequency.WEEKLY) {
            // Approximation for demo: Week number
            periodNumber = Math.ceil((new Date(periodStart).getTime() - new Date(year, 0, 1).getTime()) / (7 * 24 * 60 * 60 * 1000));
            if (periodNumber === 0) periodNumber = 1;
        } else if (emp.payFrequency === PayFrequency.FORTNIGHTLY) {
            periodNumber = ytdData.ytdStatutoryIncome === 0 ? 1 : month * 2; // Rough approx for demo
        }

        // Recalculate PAYE using Cumulative Method
        const cumulativePAYE = calculateCumulativePAYE(
            currentGross,
            standardTaxes.nis,
            ytdData.ytdStatutoryIncome,
            ytdData.ytdTaxPaid,
            periodNumber,
            emp.payFrequency,
            cumulativeTaxOverrides
        );

        // Override the standard period PAYE with the Cumulative one
        // But ensure it doesn't go below zero (refunds are usually handled via specific request, not auto-negative payroll)
        const finalPAYE = Math.max(0, cumulativePAYE);

        // Re-sum deductions
        const totalDeductions = standardTaxes.nis + standardTaxes.nht + standardTaxes.edTax + finalPAYE + customDeductions;
        const netPay = (grossPay + allAdditions) - totalDeductions;

        // Calculate employer contributions
        const employerContributions = calculateEmployerContributions(currentGross, emp.payFrequency, policies);

        return {
            employeeId: emp.id,
            employeeName: `${emp.firstName} ${emp.lastName}`,
            employeeCustomId: emp.employeeId, // User-defined Employee ID
            grossPay: grossPay,
            additions: allAdditions,
            deductions: customDeductions,
            additionsBreakdown,
            deductionsBreakdown,
            // Use standard for others, but cumulative for PAYE
            nis: standardTaxes.nis,
            nht: standardTaxes.nht,
            edTax: standardTaxes.edTax,
            paye: finalPAYE,
            pension: standardTaxes.pension,
            totalDeductions: totalDeductions,
            netPay: netPay,
            prorationDetails,
            isTaxOverridden: false,
            isGrossOverridden: false,
            employerContributions,
            bankName: emp.bankDetails?.bankName,
            accountNumber: emp.bankDetails?.accountNumber
        };
    };

=======
>>>>>>> 0a6b81cb09aa2a5587c7387200103601a1de60b4
    const initializeRun = (payCycle: PayFrequency | 'ALL', period: string, customStartDate?: string, customEndDate?: string) => {
        const lines = initializePayRunLineItems({
            employees,
            payCycle,
            period,
            customStartDate,
            customEndDate,
            context: payrollContext
        });
        setDraftItems(lines);
        return lines.length > 0;
    };

    // Re-implement helper updates to use new logic
    const addEmployeeToRun = (employeeId: string, period: string) => {
        const emp = employees.find(e => e.id === employeeId);
        if (emp) {
            const newLine = calculatePayRunLineItem({ employee: emp, period, context: payrollContext });
            setDraftItems(prev => [...prev, newLine]);
        }
    };

    const removeEmployeeFromRun = (employeeId: string) => {
        setDraftItems(prev => prev.filter(item => item.employeeId !== employeeId));
    };

    const updateLineItemTaxes = (employeeId: string, updates: Partial<StatutoryDeductions>) => {
        setDraftItems(prev => prev.map(item => {
            if (item.employeeId !== employeeId) return item;
            const newTaxes = { ...item, ...updates };
            const newTotal = newTaxes.nis + newTaxes.nht + newTaxes.edTax + newTaxes.paye + item.deductions;
            return {
                ...item,
                ...updates,
                totalDeductions: newTotal,
                netPay: (item.grossPay + item.additions) - newTotal,
                isTaxOverridden: true
            };
        }));
    };

    const updateLineItemGross = (employeeId: string, newGrossStr: string) => {
        const numValue = parseFloat(newGrossStr) || 0;
        setDraftItems(prev => prev.map(item => {
            if (item.employeeId !== employeeId) return item;
            return recalculateDraftLineItem({
                item: {
                ...item,
                    grossPay: numValue
                },
                employee: employees.find(e => e.id === employeeId),
                companyData
            });
        }));
    };

    const addAdHocItem = (employeeId: string, type: 'ADDITIONS' | 'DEDUCTIONS', detail: PayrollItemDetail) => {
        setDraftItems(prev => prev.map(item => {
            if (item.employeeId !== employeeId) return item;

            let adds = item.additionsBreakdown || [];
            let deds = item.deductionsBreakdown || [];

            if (type === 'ADDITIONS') adds = [...adds, detail];
            else deds = [...deds, detail];

            return recalculateDraftLineItem({
                item: {
                ...item,
                    additionsBreakdown: adds,
                    deductionsBreakdown: deds
                },
                employee: employees.find(e => e.id === employeeId),
                companyData
            });
        }));
    };

    const removeAdHocItem = (employeeId: string, itemId: string) => {
        setDraftItems(prev => prev.map(item => {
            if (item.employeeId !== employeeId) return item;

            let adds = item.additionsBreakdown?.filter(i => i.id !== itemId) || [];
            let deds = item.deductionsBreakdown?.filter(i => i.id !== itemId) || [];

            return recalculateDraftLineItem({
                item: {
                ...item,
                    additionsBreakdown: adds,
                    deductionsBreakdown: deds
                },
                employee: employees.find(e => e.id === employeeId),
                companyData
            });
        }));
    };

    const clearDraft = () => setDraftItems([]);

    const loadDraftItems = useCallback((items: PayRunLineItem[]) => {
        setDraftItems(items);
    }, []);

    return {
        draftItems,
        totals,
        initializeRun,
        addEmployeeToRun,
        removeEmployeeFromRun,
        updateLineItemGross,
        updateLineItemTaxes,
        addAdHocItem,
        removeAdHocItem,
        clearDraft,
        loadDraftItems
    };
};
