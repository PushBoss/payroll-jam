import { useState, useMemo, useCallback } from 'react';
import { Employee, PayRunLineItem, WeeklyTimesheet, LeaveRequest, PayrollItemDetail, StatutoryDeductions, PayRun, CompanySettings, EmployerContributions, PayrollYtdSummary, PayRunCycleFilter } from '../../core/types';
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
    companyData?: CompanySettings,
    ytdSummaries: Record<string, PayrollYtdSummary> = {}
) => {
    const [draftItems, setDraftItems] = useState<PayRunLineItem[]>([]);

    const payrollContext = useMemo(() => ({
        timesheets,
        leaveRequests,
        payRunHistory,
        ytdSummaries,
        companyData
    }), [timesheets, leaveRequests, payRunHistory, ytdSummaries, companyData]);

    const totals = useMemo(() => {
        return calculatePayrollTotals(draftItems);
    }, [draftItems]);


    const initializeRun = (payCycle: PayRunCycleFilter, period: string, customStartDate?: string, customEndDate?: string) => {
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
            const newTotal = (newTaxes.nis ?? 0) + (newTaxes.nht ?? 0) + (newTaxes.edTax ?? 0) + (newTaxes.paye ?? 0) + (item.deductions ?? 0);
            return {
                ...item,
                ...updates,
                totalDeductions: newTotal,
                netPay: (item.grossPay + item.additions) - newTotal,
                isTaxOverridden: true
            };
        }));
    };

    const updateLineItemPieceCount = (employeeId: string, newCountStr: string, period?: string) => {
        const pieceCount = Math.max(0, parseFloat(newCountStr) || 0);
        const employee = employees.find(e => e.id === employeeId);
        const pieceRateAmount = Number(employee?.pieceRateAmount || 0);

        setDraftItems(prev => prev.map(item => {
            if (item.employeeId !== employeeId) return item;
            return recalculateDraftLineItem({
                item: {
                    ...item,
                    pieceCount,
                    pieceRateAmount,
                    grossPay: pieceRateAmount * pieceCount
                },
                employee,
                companyData,
                period,
                payRunHistory
            });
        }));
    };

    const updateLineItemEmployerContributions = (employeeId: string, updates: Partial<EmployerContributions>) => {
        setDraftItems(prev => prev.map(item => {
            if (item.employeeId !== employeeId) return item;
            const current = item.employerContributions || {
                employerNIS: 0,
                employerNHT: 0,
                employerEdTax: 0,
                employerHEART: 0,
                totalEmployerCost: 0
            };
            const employerContributions = { ...current, ...updates };
            employerContributions.totalEmployerCost =
                employerContributions.employerNIS +
                employerContributions.employerNHT +
                employerContributions.employerEdTax +
                employerContributions.employerHEART;

            return {
                ...item,
                employerContributions,
                isEmployerTaxOverridden: true
            };
        }));
    };

    const updateLineItemGross = (employeeId: string, newGrossStr: string, period?: string) => {
        const numValue = parseFloat(newGrossStr) || 0;
        setDraftItems(prev => prev.map(item => {
            if (item.employeeId !== employeeId) return item;
            return recalculateDraftLineItem({
                item: {
                ...item,
                    grossPay: numValue
                },
                employee: employees.find(e => e.id === employeeId),
                companyData,
                period,
                payRunHistory
            });
        }));
    };

    const addAdHocItem = (employeeId: string, type: 'ADDITIONS' | 'DEDUCTIONS', detail: PayrollItemDetail, period?: string) => {
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
                companyData,
                period,
                payRunHistory
            });
        }));
    };

    const removeAdHocItem = (employeeId: string, itemId: string, period?: string) => {
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
                companyData,
                period,
                payRunHistory
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
        updateLineItemPieceCount,
        updateLineItemTaxes,
        updateLineItemEmployerContributions,
        addAdHocItem,
        removeAdHocItem,
        clearDraft,
        loadDraftItems
    };
};
