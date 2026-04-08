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

    const payrollContext = useMemo(() => ({
        timesheets,
        leaveRequests,
        payRunHistory,
        companyData
    }), [timesheets, leaveRequests, payRunHistory, companyData]);


    const totals = useMemo(() => {
        return calculatePayrollTotals(draftItems);
    }, [draftItems]);

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