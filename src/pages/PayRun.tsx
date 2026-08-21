import React, { useState, useMemo, useEffect } from 'react';
import { Icons } from '../components/Icons';
import { Employee, WeeklyTimesheet, LeaveRequest, PayRun as PayRunType, CompanySettings, IntegrationConfig, PayFrequency, PayrollYtdSummary, PayRunCycleFilter, PayType } from '../core/types';
import { usePayroll } from '../features/payroll/usePayroll';
import { usePayRunUiState } from '../features/payroll/usePayRunUiState';
import { PayRunDraftRow } from '../features/payroll/components/PayRunDraftRow';
import { PayRunFinalizeStep } from '../features/payroll/components/PayRunFinalizeStep';
import { PayRunProgressBar } from '../features/payroll/components/PayRunProgressBar';
import { PayRunSetupStep } from '../features/payroll/components/PayRunSetupStep';
import {
    applyFinalizedCustomDeductions,
    buildPayPeriodOptions,
    buildPayRunRecord,
    calculateBankTotals,
    getIncompletePayRunEmployees,
    getMissingPayRunEmployees,
    getPayFrequencyForCycle,
    hasEmployeePortalAccess
} from '../features/payroll/payrunWorkflow';
import { generateNCBFile, generateBNSFile, generateGLCSV } from '../utils/exportHelpers';
import { auditService } from '../core/auditService';
import { emailService } from '../services/emailService';
import { PayrollService } from '../services/PayrollService';
import { PayslipPrintBatch, PayslipView } from '../components/PayslipView';
import { toast } from 'sonner';
import { useAuth } from '../context/AuthContext';
import { generateUUID } from '../utils/uuid';
import { createPayslipPdfAttachment } from '../utils/payslipPdf';
import { calculateComputedAmounts } from '../features/payroll/payrollEngine';

interface PayRunProps {
    employees: Employee[];
    timesheets: WeeklyTimesheet[];
    leaveRequests: LeaveRequest[];
    onSave: (run: PayRunType) => Promise<boolean>;
    companyData: CompanySettings;
    integrationConfig: IntegrationConfig;
    payRunHistory: PayRunType[];
    editRunId?: string; // ID of pay run to edit
    onNavigate?: (path: string) => void; // For navigation after save
}

interface PayRunDialogState {
    title: string;
    message: string;
    details?: string[];
    confirmLabel?: string;
    onConfirm?: () => void;
}

const PayRunDialog: React.FC<{ dialog: PayRunDialogState | null; onClose: () => void }> = ({ dialog, onClose }) => {
    if (!dialog) return null;
    const isConfirmation = Boolean(dialog.onConfirm);

    return (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-jam-black/55 p-4 backdrop-blur-sm">
            <div role="alertdialog" aria-modal="true" aria-labelledby="payrun-dialog-title" className="w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-2xl animate-scale-in">
                <div className="flex items-start gap-3 border-b border-gray-100 p-6">
                    <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-lg font-extrabold ${isConfirmation ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-700'}`}>{isConfirmation ? '?' : '!'}</div>
                    <div>
                        <h3 id="payrun-dialog-title" className="text-lg font-bold text-gray-900">{dialog.title}</h3>
                        <p className="mt-1 text-sm leading-6 text-gray-600">{dialog.message}</p>
                    </div>
                </div>
                {dialog.details && dialog.details.length > 0 && (
                    <div className="mx-6 mt-5 rounded-lg border border-amber-200 bg-amber-50 p-3">
                        <p className="text-xs font-bold uppercase tracking-wide text-amber-800">Needs attention</p>
                        <ul className="mt-2 max-h-36 list-disc space-y-1 overflow-y-auto pl-4 text-xs text-amber-900">
                            {dialog.details.map((detail) => <li key={detail}>{detail}</li>)}
                        </ul>
                    </div>
                )}
                <div className="mt-6 flex flex-col-reverse gap-2 border-t border-gray-100 bg-gray-50 p-4 sm:flex-row sm:justify-end">
                    {isConfirmation && <button type="button" onClick={onClose} className="rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm font-bold text-gray-700 hover:bg-gray-50">Keep editing</button>}
                    <button type="button" onClick={() => { if (dialog.onConfirm) dialog.onConfirm(); onClose(); }} className={`rounded-lg px-4 py-2.5 text-sm font-bold ${isConfirmation ? 'bg-red-600 text-white hover:bg-red-700' : 'bg-jam-black text-white hover:bg-gray-800'}`}>{dialog.confirmLabel || 'Got it'}</button>
                </div>
            </div>
        </div>
    );
};


export const PayRun: React.FC<PayRunProps> = ({
    employees,
    timesheets = [],
    leaveRequests = [],
    onSave,
    companyData,
    integrationConfig,
    payRunHistory,
    editRunId,
    onNavigate
}) => {
    const { user: currentUser } = useAuth();
    const [step, setStep] = useState<'SETUP' | 'DRAFT' | 'FINALIZE'>('SETUP');
    const [payCycle, setPayCycle] = useState<PayRunCycleFilter>('ALL');
    const [payPeriod, setPayPeriod] = useState(new Date().toISOString().slice(0, 7)); // YYYY-MM
    const [payrollMode, setPayrollMode] = useState<'REGULAR' | 'TIMESHEET'>('REGULAR');
    const [timesheetRecordIds, setTimesheetRecordIds] = useState<string[]>([]);
    const [editingRun, setEditingRun] = useState<PayRunType | null>(null);
    const [hasLoadedEdit, setHasLoadedEdit] = useState(false);

    // Date Range Selector State
    const [isDateRangeSelectorOpen, setIsDateRangeSelectorOpen] = useState(false);
    const [periodStartDate, setPeriodStartDate] = useState<string | null>(null);
    const [periodEndDate, setPeriodEndDate] = useState<string | null>(null);

    // Loading States
    const [isCalculating, setIsCalculating] = useState(false);
    const [isFinalizing, setIsFinalizing] = useState(false);
    const [isSavingDraft, setIsSavingDraft] = useState(false);
    const [isEmailing, setIsEmailing] = useState(false);
    const [currentRun, setCurrentRun] = useState<PayRunType | null>(null);
    const [printingPayslipRun, setPrintingPayslipRun] = useState<PayRunType | null>(null);
    const [isPayRunConfirmed, setIsPayRunConfirmed] = useState(false);
    const [ytdSummaries, setYtdSummaries] = useState<Record<string, PayrollYtdSummary>>({});
    const [payRunDialog, setPayRunDialog] = useState<PayRunDialogState | null>(null);
    const showPayRunDialog = (title: string, message: string, details?: string[]) => setPayRunDialog({ title, message, details });

    useEffect(() => {
        const targetCompanyId = currentUser?.companyId || companyData.id;
        const taxYear = Number(payPeriod.slice(0, 4));
        if (!targetCompanyId || !Number.isInteger(taxYear)) {
            setYtdSummaries({});
            return;
        }

        let isCancelled = false;
        PayrollService.getPayrollYtdSummary(targetCompanyId, taxYear)
            .then((summaries) => {
                if (isCancelled) return;
                setYtdSummaries(Object.fromEntries(summaries.map((summary) => [summary.employeeId, summary])));
            })
            .catch((error) => {
                if (isCancelled) return;
                console.warn('Payroll YTD summary unavailable; falling back to loaded pay run history.', error);
                setYtdSummaries({});
            });

        return () => {
            isCancelled = true;
        };
    }, [currentUser?.companyId, companyData.id, payPeriod]);

    const {
        draftItems,
        totals,
        initializeRun,
        updateLineItemGross,
        updateLineItemPieceCount,
        updateLineItemTaxes,
        updateLineItemEmployerContributions,
        addAdHocItem,
        addEmployeeToRun,
        removeEmployeeFromRun,
        clearDraft,
        loadDraftItems,
        removeAdHocItem
    } = usePayroll(employees, timesheets, leaveRequests, payRunHistory, companyData, ytdSummaries);

    const {
        adHocModal,
        newItemName,
        newItemAmount,
        addEmployeeModalOpen,
        viewingPayslip,
        taxModalOpen,
        selectedTaxItem,
        employerTaxModalOpen,
        selectedEmployerTaxItem,
        taxOverrideForm,
        employerTaxOverrideForm,
        setNewItemName,
        setNewItemAmount,
        setAddEmployeeModalOpen,
        setViewingPayslip,
        setTaxOverrideForm,
        setEmployerTaxOverrideForm,
        openAdHocModal,
        closeAdHocModal,
        submitAdHocItem,
        openTaxModal,
        closeTaxModal,
        submitTaxOverride,
        openEmployerTaxModal,
        closeEmployerTaxModal,
        submitEmployerTaxOverride
    } = usePayRunUiState({
        currentUser,
        addAdHocItem,
        updateLineItemTaxes,
        updateLineItemEmployerContributions,
        payPeriod
    });

    const isSuspended = companyData?.subscriptionStatus === 'SUSPENDED';

    if (!companyData) {
        return (
            <div className="p-6">
                <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-8 text-center">
                    <Icons.Refresh className="w-10 h-10 text-jam-orange animate-spin mx-auto mb-4" />
                    <h2 className="text-xl font-bold text-gray-900 mb-2">Loading Company Data</h2>
                    <p className="text-gray-600">Please wait while we sync your company profile...</p>
                </div>
            </div>
        );
    }

    // Load run for editing - only once when editRunId changes
    useEffect(() => {
        if (!editRunId && hasLoadedEdit) {
            setHasLoadedEdit(false);
            return;
        }

        if (!editRunId || hasLoadedEdit) return;

        // Wait for pay run history to hydrate before deciding the run is missing.
        if (payRunHistory.length === 0) return;

        // Only load if we have an editRunId and haven't loaded yet
        if (editRunId && !hasLoadedEdit && payRunHistory.length > 0) {
            const runToEdit = payRunHistory.find(r => r.id === editRunId);
            if (runToEdit && (runToEdit.status === 'DRAFT' || runToEdit.status === 'APPROVED')) {
                setEditingRun(runToEdit);
                setPayrollMode(runToEdit.payrollMode === 'TIMESHEET' ? 'TIMESHEET' : 'REGULAR');
                setTimesheetRecordIds(runToEdit.timeRecordIds || []);
                // Convert periodStart to YYYY-MM format if it's in YYYY-MM-DD format
                let period = runToEdit.periodStart;
                if (period.match(/^\d{4}-\d{2}-\d{2}$/)) {
                    period = period.substring(0, 7); // Extract YYYY-MM from YYYY-MM-DD
                }
                setPayPeriod(period);
                if (runToEdit.periodStart.match(/^\d{4}-\d{2}-\d{2}$/) && runToEdit.periodEnd.match(/^\d{4}-\d{2}-\d{2}$/)) {
                    setPeriodStartDate(runToEdit.periodStart);
                    setPeriodEndDate(runToEdit.periodEnd);
                }
                setCurrentRun(runToEdit);
                // Load the line items into draft
                if (runToEdit.lineItems && runToEdit.lineItems.length > 0) {
                    loadDraftItems(runToEdit.lineItems);
                }
                setStep('DRAFT'); // Always load to DRAFT for editing
                setHasLoadedEdit(true); // Mark as loaded
                toast.success(`Loaded pay run for editing`);
            } else if (runToEdit && runToEdit.status === 'FINALIZED') {
                toast.error('Cannot edit finalized pay runs');
                setHasLoadedEdit(true);
            } else {
                toast.error('Pay run not found');
                setHasLoadedEdit(true);
            }
        }
    }, [editRunId, hasLoadedEdit, loadDraftItems, payRunHistory]);

    // Generate Pay Period Options
    const payPeriodOptions = useMemo(() => {
        return buildPayPeriodOptions();
    }, []);

    // Calculate Bank Totals for Distribution Summary
    const bankTotals = useMemo(() => {
        return calculateBankTotals(currentRun, employees);
    }, [currentRun, employees]);

    // Pre-calculate booleans for Finalize Step
    const showNcbCard = bankTotals.ncb > 0;
    const showBnsCard = bankTotals.bns > 0;
    const showOtherCard = bankTotals.other > 0;

    const ncbCardClass = showNcbCard ? 'border-gray-200 hover:border-jam-orange bg-white' : 'border-gray-100 bg-gray-50 opacity-60';
    const bnsCardClass = showBnsCard ? 'border-gray-200 hover:border-jam-orange bg-white' : 'border-gray-100 bg-gray-50 opacity-60';
    const canEmailPayslips = hasEmployeePortalAccess(companyData?.plan || 'Free');

    const incompleteEmployees = useMemo(() => {
        return getIncompletePayRunEmployees(draftItems, employees);
    }, [draftItems, employees]);

    const pieceRateItemsMissingPieces = useMemo(() => {
        return draftItems.filter(item => {
            const employee = employees.find(e => e.id === item.employeeId);
            return employee?.payType === PayType.PIECE_RATE && (item.pieceCount || 0) <= 0;
        });
    }, [draftItems, employees]);

    const handleInitializeSystem = async () => {
        setIsCalculating(true);
        try {
            if (payrollMode === 'TIMESHEET') {
                if (!companyData.id) throw new Error('Company ID is required for Timesheet-Based Payroll.');
                const periodStart = periodStartDate || `${payPeriod}-01`;
                const periodEnd = periodEndDate || `${payPeriod}-${new Date(Number(payPeriod.slice(0, 4)), Number(payPeriod.slice(5, 7)), 0).getDate()}`;
                const candidates = await PayrollService.getTimesheetPayrollCandidates(companyData.id, periodStart, periodEnd);
                const context = { timesheets, leaveRequests, payRunHistory, ytdSummaries, companyData };
                const period = { year: Number(payPeriod.slice(0, 4)), month: Number(payPeriod.slice(5, 7)), periodStart, periodEnd };
                const candidateItems = candidates.map((candidate) => {
                    const employee = employees.find((item) => item.id === candidate.employeeId);
                    if (!employee || employee.status !== 'ACTIVE' || (employee.payType !== PayType.TIMESHEET && employee.payType !== PayType.HOURLY)) return null;
                    const calculated = calculateComputedAmounts({ employee, grossPay: candidate.grossPay, additionsBreakdown: [], deductionsBreakdown: [], period, context });
                    return { employeeId: employee.id, employeeName: `${employee.firstName} ${employee.lastName}`, employeeCustomId: employee.employeeId, grossPay: candidate.grossPay, additions: calculated.additions, deductions: calculated.deductions, nis: calculated.nis, nht: calculated.nht, edTax: calculated.edTax, paye: calculated.paye, pension: calculated.pension, totalDeductions: calculated.totalDeductions, netPay: calculated.netPay, employerContributions: calculated.employerContributions, additionsBreakdown: calculated.additionsBreakdown, deductionsBreakdown: calculated.deductionsBreakdown, bankName: employee.bankDetails?.bankName, accountNumber: employee.bankDetails?.accountNumber, trn: employee.trn, nisId: employee.nis, jobTitle: employee.jobTitle };
                }).filter((item): item is NonNullable<typeof item> => Boolean(item));
                if (!candidateItems.length) {
                    showPayRunDialog('No approved time found', 'There are no employees with approved timesheet records in this payroll period.', ['Choose another payroll date range, or approve the employees\' Logged time records before creating this pay run.']);
                    return;
                }
                loadDraftItems(candidateItems);
                setTimesheetRecordIds(candidates.filter((candidate) => candidateItems.some((item) => item.employeeId === candidate.employeeId)).flatMap((candidate) => candidate.timeRecordIds));
                setStep('DRAFT');
                toast.success(`Loaded ${candidateItems.length} employees from approved time records.`);
                return;
            }
            // Pass custom dates if available
            const hasData = initializeRun(payCycle, payPeriod, periodStartDate || undefined, periodEndDate || undefined);
            if (hasData) {
                setStep('DRAFT');
                const dateInfo = periodStartDate && periodEndDate ? ` (${periodStartDate} to ${periodEndDate})` : '';
                auditService.log(currentUser, 'CREATE', 'PayRun', `Initialized draft payroll for ${payPeriod}${dateInfo}`);
                toast.success("Payroll calculated from system data (Cumulative YTD Applied)");
            } else {
                showPayRunDialog('No eligible employees found', 'No active employees match the selected payroll cycle and period.', ['Check the selected payroll period and employee employment status, then try again.']);
            }
        } catch (error) {
            showPayRunDialog('Unable to prepare this pay run', error instanceof Error ? error.message : 'Please try again. If the problem continues, contact support.');
        } finally {
            setIsCalculating(false);
        }
    };

    const resolveDraftRunId = (status: PayRunType['status']) => {
        if (editingRun?.id) return editingRun.id;
        if (currentRun?.id) return currentRun.id;
        if (status !== 'DRAFT') return generateUUID();

        const periodStart = periodStartDate || payPeriod;
        const periodEnd = periodEndDate || payPeriod;
        const payFrequency = getPayFrequencyForCycle(payCycle);
        const existingDraft = payRunHistory.find(run =>
            run.status === 'DRAFT' &&
            run.periodStart === periodStart &&
            run.periodEnd === periodEnd &&
            run.payFrequency === payFrequency
        );

        return existingDraft?.id || generateUUID();
    };

    const buildCurrentDraftRun = (status: PayRunType['status']) => buildPayRunRecord({
        id: resolveDraftRunId(status),
        payPeriod,
        periodStart: periodStartDate || undefined,
        periodEnd: periodEndDate || undefined,
        payDate: editingRun?.payDate || currentRun?.payDate,
        payFrequency: editingRun?.payFrequency as PayFrequency || getPayFrequencyForCycle(payCycle),
        status,
        totalGross: totals.gross,
        totalNet: totals.net,
        lineItems: draftItems
        , payrollMode, timeRecordIds: payrollMode === 'TIMESHEET' ? timesheetRecordIds : []
    });

    const handleSaveDraft = async () => {
        if (draftItems.length === 0) {
            showPayRunDialog('Add an employee first', 'This draft has no employees yet.', ['Use Add Employee, then save the draft again.']);
            return false;
        }

        setIsSavingDraft(true);
        let saved = false;
        const draftRun = buildCurrentDraftRun('DRAFT');
        try {
            saved = await onSave(draftRun);
        } finally {
            setIsSavingDraft(false);
        }

        if (!saved) {
            showPayRunDialog('Draft was not saved', 'We could not save this pay run to the database.', ['Check your connection and try again. No changes were finalized.']);
            return false;
        }

        setEditingRun(draftRun);
        setCurrentRun(draftRun);
        auditService.log(currentUser, 'UPDATE', 'PayRun', `Saved draft payroll for ${payPeriod}`);
        toast.success("Draft pay run saved");
        return true;
    };

    const handleContinueToFinalize = async () => {
        if (draftItems.length === 0) {
            showPayRunDialog('Add an employee first', 'This draft has no employees yet.', ['Use Add Employee before continuing to final review.']);
            return;
        }

        if (incompleteEmployees.length > 0) {
            const names = incompleteEmployees.map(e => `${e!.firstName} ${e!.lastName}`).join(', ');
            showPayRunDialog('Complete employee data before continuing', 'Some employees have required information marked missing or pending.', names.split(', '));
            return;
        }

        if (pieceRateItemsMissingPieces.length > 0) {
            const names = pieceRateItemsMissingPieces.map(item => item.employeeName).join(', ');
            showPayRunDialog('Enter completed pieces before continuing', 'Piece-rate employees need a completed-piece count to calculate pay.', names.split(', '));
            return;
        }

        const draftRun = buildCurrentDraftRun('DRAFT');
        setIsSavingDraft(true);
        let saved = false;
        try {
            saved = await onSave(draftRun);
        } finally {
            setIsSavingDraft(false);
        }
        if (!saved) {
            showPayRunDialog('Draft was not saved', 'We could not save this pay run to the database.', ['Check your connection and try again. No changes were finalized.']);
            return;
        }

        setEditingRun(draftRun);
        setCurrentRun(draftRun);
        auditService.log(currentUser, 'UPDATE', 'PayRun', `Saved draft / Proceeded to review for ${payPeriod}`);

        setStep('FINALIZE');
        setIsPayRunConfirmed(false);
        toast.success("Review your pay run and click Finalize to complete");
    };

    // Removed handleSaveAsApproved - merging approval into finalize step

    const handleConfirmFinalize = async () => {
        if (incompleteEmployees.length > 0) {
            const names = incompleteEmployees.map(e => `${e!.firstName} ${e!.lastName}`).join(', ');
            showPayRunDialog('Finalization is blocked', 'Complete the required employee information before finalizing payroll.', names.split(', '));
            return;
        }

        if (pieceRateItemsMissingPieces.length > 0) {
            const names = pieceRateItemsMissingPieces.map(item => item.employeeName).join(', ');
            showPayRunDialog('Finalization is blocked', 'Enter the completed-piece count for each piece-rate employee before finalizing.', names.split(', '));
            return;
        }

        setIsFinalizing(true);
        try {
        const newRun: PayRunType = buildPayRunRecord({
            id: editingRun?.id || currentRun?.id || generateUUID(),
            payPeriod,
            periodStart: periodStartDate || undefined,
            periodEnd: periodEndDate || undefined,
            payDate: editingRun?.payDate || currentRun?.payDate,
            payFrequency: editingRun?.payFrequency as PayFrequency || getPayFrequencyForCycle(payCycle),
            status: 'FINALIZED',
            totalGross: totals.gross,
            totalNet: totals.net,
            lineItems: draftItems
            , payrollMode, timeRecordIds: payrollMode === 'TIMESHEET' ? timesheetRecordIds : []
        });

        const saved = await onSave(newRun);
        if (!saved) {
            showPayRunDialog('Pay run was not finalized', 'We could not save the finalized pay run.', ['Check your connection and try again. No payroll records were finalized.']);
            return;
        }

        auditService.log(currentUser, 'CREATE', 'PayRun', `Finalized payroll for ${payPeriod}`);

        const deductionUpdates = draftItems.flatMap((lineItem) => {
            const employee = employees.find(e => e.id === lineItem.employeeId);
            if (!employee || !employee.customDeductions || employee.customDeductions.length === 0) return [];

            const updatedEmployee = applyFinalizedCustomDeductions(employee, lineItem);
            return [{
                id: employee.id,
                customDeductions: updatedEmployee.customDeductions || []
            }];
        });

        if (deductionUpdates.length > 0) {
            const targetCompanyId = currentUser?.companyId || companyData.id;
            try {
                if (!targetCompanyId) throw new Error('Company ID is required to update employee deductions.');
                const updatedCount = await PayrollService.bulkUpdateEmployeeDeductions(targetCompanyId, deductionUpdates);
                console.log(`✅ Updated custom deductions for ${updatedCount} employee(s)`);
            } catch (error) {
                console.error('❌ Failed to update custom deductions in bulk:', error);
                toast.warning('Payroll finalized, but some deduction balances could not be updated. Please review employee deductions.');
            }
        }

        setCurrentRun(newRun);
        setIsPayRunConfirmed(true);
        toast.success("Payroll finalized successfully! You can now download, email, or print payslips.");
        } finally {
            setIsFinalizing(false);
        }
    };

    const handleDownloadBankFile = (type: 'NCB' | 'BNS') => {
        if (!currentRun) return;
        if (type === 'NCB') {
            if (bankTotals.ncb === 0) {
                toast.error("No employees found with NCB accounts.");
                return;
            }
            generateNCBFile(currentRun, companyData, employees);
        } else if (type === 'BNS') {
            if (bankTotals.bns === 0) {
                toast.error("No employees found with Scotiabank accounts.");
                return;
            }
            generateBNSFile(currentRun, companyData, employees);
        }
    };

    const handleDownloadGL = () => {
        if (!currentRun) return;
        generateGLCSV(currentRun, integrationConfig);
        toast.success("GL CSV Exported");
    }

    const handleEmailPayslips = async () => {
        if (!currentRun) return;
        if (!canEmailPayslips) {
            toast.error('Payslip email is available on the Pro plan and above. Download payslips and send them manually for this plan.');
            return;
        }

        setIsEmailing(true);
        let sentCount = 0;

        try {
            for (const line of currentRun.lineItems) {
                const emp = employees.find(e => e.id === line.employeeId);
                if (emp?.email) {
                    console.log('📧 Sending payslip email:', {
                        email: emp.email,
                        hasPortalAccess: true,
                        downloadToken: 'N/A (portal access)'
                    });

                    await emailService.sendPayslipNotification(
                        emp.email,
                        emp.firstName,
                        currentRun.periodStart,
                        `$${line.netPay.toLocaleString()}`,
                        true,
                        '',
                        [createPayslipPdfAttachment({
                            lineItem: line,
                            employee: emp,
                            companyData,
                            payPeriod: currentRun.periodStart,
                            payDate: currentRun.payDate,
                        })]
                    );
                    sentCount++;
                }
            }
            toast.success(`Payslips emailed to ${sentCount} employees`);
        } catch (error) {
            console.error('Error sending payslips:', error);
            toast.error('Some emails failed to send. Check logs.');
        } finally {
            setIsEmailing(false);
        }
    };

    const handleEmailSinglePayslip = async (employeeIndex: number) => {
        if (!currentRun) return;
        if (!canEmailPayslips) {
            toast.error('Payslip email is available on the Pro plan and above. Download payslips and send them manually for this plan.');
            return;
        }

        const line = currentRun.lineItems[employeeIndex];
        const emp = employees.find(e => e.id === line.employeeId);
        if (!emp?.email) {
            toast.error('Employee does not have an email address configured.');
            return;
        }

        setIsEmailing(true);
        try {
            console.log('📧 Sending individual payslip email:', {
                email: emp.email,
                hasPortalAccess: true,
                downloadToken: 'N/A (portal access)'
            });

            await emailService.sendPayslipNotification(
                emp.email,
                emp.firstName,
                currentRun.periodStart,
                `$${line.netPay.toLocaleString()}`,
                true,
                '',
                [createPayslipPdfAttachment({
                    lineItem: line,
                    employee: emp,
                    companyData,
                    payPeriod: currentRun.periodStart,
                    payDate: currentRun.payDate,
                })]
            );
            toast.success(`Payslip emailed to ${emp.firstName} ${emp.lastName}`);
        } catch (error) {
            console.error('Error sending individual payslip email:', error);
            toast.error(`Failed to send email to ${emp.firstName}.`);
        } finally {
            setIsEmailing(false);
        }
    };

    const openBulkPayslipPrint = (message: string) => {
        if (!currentRun || currentRun.lineItems.length === 0) {
            toast.error('No payslips available');
            return;
        }

        toast.success(message);
        setPrintingPayslipRun(currentRun);
        window.setTimeout(() => window.print(), 100);
    };

    const handleDownloadAllPayslips = () => {
        openBulkPayslipPrint(`Preparing ${currentRun?.lineItems.length || 0} payslips. Choose Save as PDF in the print dialog.`);
    };

    const handlePrintAllPayslips = () => {
        openBulkPayslipPrint(`Preparing ${currentRun?.lineItems.length || 0} payslips for bulk printing.`);
    };

    const missingEmployees = useMemo(() => getMissingPayRunEmployees(employees, draftItems), [employees, draftItems]);
    const payslipPayRunHistory = useMemo(() => {
        if (!currentRun) return payRunHistory;
        return [
            ...payRunHistory.filter(run => run.id !== currentRun.id),
            currentRun
        ];
    }, [currentRun, payRunHistory]);

    if (step === 'SETUP') {
        return (
            <>
                <PayRunProgressBar currentStep="SETUP" />
                <PayRunSetupStep
                    payPeriod={payPeriod}
                    payPeriodOptions={payPeriodOptions}
                    payCycle={payCycle}
                    setPayPeriod={setPayPeriod}
                    setPayCycle={setPayCycle}
                    isDateRangeSelectorOpen={isDateRangeSelectorOpen}
                    setIsDateRangeSelectorOpen={setIsDateRangeSelectorOpen}
                    periodStartDate={periodStartDate}
                    periodEndDate={periodEndDate}
                    setPeriodStartDate={setPeriodStartDate}
                    setPeriodEndDate={setPeriodEndDate}
                    isSuspended={isSuspended}
                    isCalculating={isCalculating}
                    payrollMode={payrollMode}
                    setPayrollMode={setPayrollMode}
                    handleInitializeSystem={handleInitializeSystem}
                />
                <PayRunDialog dialog={payRunDialog} onClose={() => setPayRunDialog(null)} />
            </>
        );
    }

    if (step === 'DRAFT') {
        return (
            <div className="space-y-6 animate-fade-in relative">
                <PayRunProgressBar currentStep="DRAFT" />
                <PayRunDialog dialog={payRunDialog} onClose={() => setPayRunDialog(null)} />
                {/* Wizard Stepper */}
                {/* Ad Hoc Modal */}
                {adHocModal.isOpen && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
                        <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm overflow-hidden animate-scale-in">
                            <div className="p-6 border-b border-gray-100 flex justify-between items-center">
                                <h3 className="font-bold text-gray-900">Add {adHocModal.type === 'ADDITIONS' ? 'Income' : 'Deduction'}</h3>
                                <button onClick={closeAdHocModal}><Icons.Close className="w-5 h-5 text-gray-400" /></button>
                            </div>
                            <form onSubmit={submitAdHocItem} className="p-6 space-y-4">
                                <div>
                                    <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Description</label>
                                    <input autoFocus required type="text" className="w-full border border-gray-300 rounded-lg p-2 focus:ring-2 focus:ring-jam-orange" value={newItemName} onChange={e => setNewItemName(e.target.value)} />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Amount</label>
                                    <input required type="number" min="0.01" step="0.01" className="w-full border border-gray-300 rounded-lg p-2 focus:ring-2 focus:ring-jam-orange" value={newItemAmount} onChange={e => setNewItemAmount(e.target.value)} />
                                    <p className="mt-1 text-[11px] text-gray-500">Enter a positive amount. This form applies it as a {adHocModal.type === 'ADDITIONS' ? 'pay addition' : 'deduction'}.</p>
                                </div>
                                <button type="submit" className="w-full bg-jam-black text-white py-2 rounded-lg font-bold hover:bg-gray-800">Add Item</button>
                            </form>
                        </div>
                    </div>
                )}
                {/* Tax Modal */}
                {taxModalOpen && selectedTaxItem && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
                        <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm overflow-hidden animate-scale-in">
                            <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-red-50">
                                <div>
                                    <h3 className="font-bold text-red-900">Override Statutory Taxes</h3>
                                    <p className="text-xs text-red-700">{selectedTaxItem.employeeName}</p>
                                </div>
                                <button onClick={closeTaxModal}><Icons.Close className="w-5 h-5 text-red-400" /></button>
                            </div>
                            <form onSubmit={submitTaxOverride} className="p-6 space-y-4">
                                <div className="bg-yellow-50 border border-yellow-200 rounded p-3 text-xs text-yellow-800 mb-4">
                                    <Icons.Alert className="w-3 h-3 inline mr-1" /> Editing these values stops automatic calculation.
                                </div>
                                <div className="grid grid-cols-2 gap-4">
                                    <div><label className="block text-xs font-bold text-gray-500 uppercase mb-1">PAYE</label><input type="number" className="w-full border border-gray-300 rounded p-2" value={taxOverrideForm.paye} onChange={e => setTaxOverrideForm({ ...taxOverrideForm, paye: parseFloat(e.target.value) })} /></div>
                                    <div><label className="block text-xs font-bold text-gray-500 uppercase mb-1">NIS</label><input type="number" className="w-full border border-gray-300 rounded p-2" value={taxOverrideForm.nis} onChange={e => setTaxOverrideForm({ ...taxOverrideForm, nis: parseFloat(e.target.value) })} /></div>
                                    <div><label className="block text-xs font-bold text-gray-500 uppercase mb-1">Ed Tax</label><input type="number" className="w-full border border-gray-300 rounded p-2" value={taxOverrideForm.edTax} onChange={e => setTaxOverrideForm({ ...taxOverrideForm, edTax: parseFloat(e.target.value) })} /></div>
                                    <div><label className="block text-xs font-bold text-gray-500 uppercase mb-1">NHT</label><input type="number" className="w-full border border-gray-300 rounded p-2" value={taxOverrideForm.nht} onChange={e => setTaxOverrideForm({ ...taxOverrideForm, nht: parseFloat(e.target.value) })} /></div>
                                </div>
                                <button type="submit" className="w-full bg-jam-black text-white py-2 rounded-lg font-bold hover:bg-gray-800 mt-4">Apply Override</button>
                            </form>
                        </div>
                    </div>
                )}
                {/* Employer Tax Modal */}
                {employerTaxModalOpen && selectedEmployerTaxItem && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
                        <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm overflow-hidden animate-scale-in">
                            <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-blue-50">
                                <div>
                                    <h3 className="font-bold text-blue-900">Override Employer Taxes</h3>
                                    <p className="text-xs text-blue-700">{selectedEmployerTaxItem.employeeName}</p>
                                </div>
                                <button onClick={closeEmployerTaxModal}><Icons.Close className="w-5 h-5 text-blue-400" /></button>
                            </div>
                            <form onSubmit={submitEmployerTaxOverride} className="p-6 space-y-4">
                                <div className="bg-yellow-50 border border-yellow-200 rounded p-3 text-xs text-yellow-800 mb-4">
                                    <Icons.Alert className="w-3 h-3 inline mr-1" /> Editing these employer values stops automatic calculation for this row.
                                </div>
                                <div className="grid grid-cols-2 gap-4">
                                    <div><label className="block text-xs font-bold text-gray-500 uppercase mb-1">Employer NIS</label><input type="number" className="w-full border border-gray-300 rounded p-2" value={employerTaxOverrideForm.employerNIS} onChange={e => setEmployerTaxOverrideForm({ ...employerTaxOverrideForm, employerNIS: parseFloat(e.target.value) })} /></div>
                                    <div><label className="block text-xs font-bold text-gray-500 uppercase mb-1">Employer NHT</label><input type="number" className="w-full border border-gray-300 rounded p-2" value={employerTaxOverrideForm.employerNHT} onChange={e => setEmployerTaxOverrideForm({ ...employerTaxOverrideForm, employerNHT: parseFloat(e.target.value) })} /></div>
                                    <div><label className="block text-xs font-bold text-gray-500 uppercase mb-1">Employer Ed</label><input type="number" className="w-full border border-gray-300 rounded p-2" value={employerTaxOverrideForm.employerEdTax} onChange={e => setEmployerTaxOverrideForm({ ...employerTaxOverrideForm, employerEdTax: parseFloat(e.target.value) })} /></div>
                                    <div><label className="block text-xs font-bold text-gray-500 uppercase mb-1">HEART</label><input type="number" className="w-full border border-gray-300 rounded p-2" value={employerTaxOverrideForm.employerHEART} onChange={e => setEmployerTaxOverrideForm({ ...employerTaxOverrideForm, employerHEART: parseFloat(e.target.value) })} /></div>
                                </div>
                                <button type="submit" className="w-full bg-jam-black text-white py-2 rounded-lg font-bold hover:bg-gray-800 mt-4">Apply Override</button>
                            </form>
                        </div>
                    </div>
                )}
                {/* Add Missing Employee Modal */}
                {addEmployeeModalOpen && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
                        <div className="bg-white rounded-xl shadow-2xl w-full max-w-md overflow-hidden animate-scale-in">
                            <div className="p-6 border-b border-gray-100 flex justify-between items-center">
                                <h3 className="font-bold text-gray-900">Add Missing Employee</h3>
                                <button onClick={() => setAddEmployeeModalOpen(false)}><Icons.Close className="w-5 h-5 text-gray-400" /></button>
                            </div>
                            <div className="p-6 max-h-[60vh] overflow-y-auto">
                                {missingEmployees.length === 0 ? <p className="text-gray-500 text-center">All active employees are already in this pay run.</p> :
                                    <div className="space-y-2">{missingEmployees.map(emp => (
                                        <div key={emp.id} className="flex justify-between items-center p-3 bg-gray-50 rounded-lg border border-gray-100">
                                            <div><p className="font-bold text-sm text-gray-900">{emp.firstName} {emp.lastName}</p><p className="text-xs text-gray-500">{emp.email}</p></div>
                                            <button onClick={() => { addEmployeeToRun(emp.id, payPeriod); toast.success(`${emp.firstName} added.`); }} className="text-xs bg-jam-orange text-jam-black px-3 py-1.5 rounded font-bold hover:bg-yellow-500">Add</button>
                                        </div>
                                    ))}</div>
                                }
                            </div>
                            <div className="p-4 bg-gray-50 border-t border-gray-100 text-right"><button onClick={() => setAddEmployeeModalOpen(false)} className="text-sm text-gray-600 font-medium hover:text-gray-900">Done</button></div>
                        </div>
                    </div>
                )}

                {/* Header */}
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center">
                    <div>
                        <div className="flex items-center space-x-3 mb-1">
                            <h2 className="text-3xl font-bold text-gray-900">
                                Draft Pay Run: {payPeriod}
                            </h2>
                        </div>
                        <div className="flex items-center space-x-2 text-sm">
                            <span className="px-2 py-0.5 rounded font-bold uppercase text-xs bg-jam-yellow/30 text-yellow-800">
                                Draft Mode
                            </span>
                            <span className="text-gray-500">
                                • Edit amounts and add adjustments
                            </span>
                        </div>
                    </div>
                    <div className="flex items-center space-x-3 mt-4 md:mt-0">
                        <button onClick={() => setAddEmployeeModalOpen(true)} className="bg-white border border-gray-300 text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-50 shadow-sm flex items-center text-sm font-medium">
                            <Icons.Plus className="w-4 h-4 mr-2" /> Add Employee
                        </button>
                        <button onClick={() => setPayRunDialog({
                            title: 'Discard this draft?',
                            message: 'Any unsaved payroll changes will be lost.',
                            confirmLabel: 'Discard draft',
                            onConfirm: () => {
                                setStep('SETUP');
                                clearDraft();
                                setEditingRun(null);
                                onNavigate?.('reports');
                            }
                        })} className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg text-sm font-medium">
                            Cancel
                        </button>
                        <button onClick={handleSaveDraft} disabled={isSavingDraft || isFinalizing} className="bg-white border border-gray-300 text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-50 shadow-sm flex items-center text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed">
                            {isSavingDraft ? (
                                <span className="flex items-center"><Icons.Refresh className="w-4 h-4 mr-2 animate-spin" /> Saving...</span>
                            ) : (
                                <span className="flex items-center"><Icons.Save className="w-4 h-4 mr-2" /> Save Draft</span>
                            )}
                        </button>
                        <button onClick={handleContinueToFinalize} disabled={isSavingDraft || isFinalizing} className="bg-jam-orange text-jam-black px-6 py-2 font-bold rounded-lg hover:bg-yellow-500 shadow-lg flex items-center text-sm disabled:opacity-50 disabled:cursor-not-allowed">
                            {isSavingDraft ? (
                                <span className="flex items-center"><Icons.Refresh className="w-4 h-4 mr-2 animate-spin" /> Saving...</span>
                            ) : isFinalizing ? (
                                <span className="flex items-center"><Icons.Refresh className="w-4 h-4 mr-2 animate-spin" /> Finalizing...</span>
                            ) : (
                                <span className="flex items-center"><Icons.ChevronRight className="w-4 h-4 mr-1" /> Continue to Finalize</span>
                            )}
                        </button>
                    </div>
                </div>
                {/* Summary Cards */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200"><p className="text-xs text-gray-500 font-bold uppercase tracking-wider">Total Gross</p><p className="text-3xl font-bold text-gray-900 mt-1">${totals.gross.toLocaleString()}</p></div>
                    <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200"><p className="text-xs text-gray-500 font-bold uppercase tracking-wider">Total Deductions</p><p className="text-3xl font-bold text-red-600 mt-1">-${totals.deductions.toLocaleString()}</p></div>
                    <div className="bg-jam-black text-white p-6 rounded-xl shadow-lg"><p className="text-xs text-jam-yellow font-bold uppercase tracking-wider">Total Net Pay</p><p className="text-3xl font-bold mt-1">${totals.net.toLocaleString()}</p></div>
                </div>
                {/* Review Table */}
                <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                        <thead className="bg-gray-50 border-b border-gray-200">
                            <tr>
                                <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase w-64">Employee</th>
                                <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase text-right w-48">Gross / Units</th>
                                <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase text-center">Income / Bonus</th>
                                <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase text-center">Other Deductions</th>
                                <th className="px-6 py-4 text-xs font-bold text-red-500 uppercase text-right w-40">Employee Tax</th>
                                <th className="px-6 py-4 text-xs font-bold text-blue-500 uppercase text-right w-40">Employer Tax</th>
                                <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase text-right">Net Pay</th>
                                <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase text-center">Action</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {draftItems.map(item => (
                                <PayRunDraftRow
                                    key={item.employeeId}
                                    item={item}
                                    employee={employees.find(e => e.id === item.employeeId)}
                                    payPeriod={payPeriod}
                                    updateLineItemGross={updateLineItemGross}
                                    updateLineItemPieceCount={updateLineItemPieceCount}
                                    openAdHocModal={openAdHocModal}
                                    openTaxModal={openTaxModal}
                                    openEmployerTaxModal={openEmployerTaxModal}
                                    removeEmployeeFromRun={removeEmployeeFromRun}
                                    removeAdHocItem={removeAdHocItem}
                                />
                            ))}
                        </tbody>
                    </table>
                    <div className="bg-gray-50 px-6 py-4 border-t border-gray-200 text-center"><p className="text-xs text-gray-500">Taxes (NIS, NHT, Ed Tax, PAYE) are automatically recalculated based on employee pay frequency (Weekly/Fortnightly/Monthly).</p></div>
                </div>
            </div>
        );
    }

    // FINALIZE STEP
    return (
        <div className="relative">
            <PayRunProgressBar currentStep="FINALIZE" />
            <PayRunDialog dialog={payRunDialog} onClose={() => setPayRunDialog(null)} />

            {/* Payslip View Modal */}
            {viewingPayslip && (
                <PayslipView
                    data={viewingPayslip}
                    companyName={companyData.name}
                    payPeriod={currentRun?.periodStart || payPeriod}
                    payDate={currentRun?.payDate || new Date().toISOString().split('T')[0]}
                    employees={employees}
                    payRunHistory={payslipPayRunHistory}
                    onClose={() => setViewingPayslip(null)}
                />
            )}

            {printingPayslipRun && (
                <PayslipPrintBatch
                    lineItems={printingPayslipRun.lineItems}
                    companyName={companyData.name}
                    payPeriod={printingPayslipRun.periodStart}
                    payDate={printingPayslipRun.payDate}
                    employees={employees}
                    payRunHistory={payslipPayRunHistory}
                    onClose={() => setPrintingPayslipRun(null)}
                />
            )}

            <PayRunFinalizeStep
                currentRun={currentRun}
                isPayRunConfirmed={isPayRunConfirmed}
                isFinalizing={isFinalizing}
                isEmailing={isEmailing}
                canEmailPayslips={canEmailPayslips}
                bankTotals={bankTotals}
                integrationProvider={integrationConfig.provider}
                ncbCardClass={ncbCardClass}
                bnsCardClass={bnsCardClass}
                showNcbCard={showNcbCard}
                showBnsCard={showBnsCard}
                showOtherCard={showOtherCard}
                onBackToEdit={() => { setStep('DRAFT'); }}
                onConfirmFinalize={handleConfirmFinalize}
                onStartNewRun={() => { setStep('SETUP'); clearDraft(); setIsPayRunConfirmed(false); }}
                onDownloadBankFile={handleDownloadBankFile}
                onDownloadGL={handleDownloadGL}
                onDownloadAllPayslips={handleDownloadAllPayslips}
                onEmailPayslips={handleEmailPayslips}
                onPrintAllPayslips={handlePrintAllPayslips}
                onEmailSinglePayslip={handleEmailSinglePayslip}
                onViewPayslip={(employeeIndex) => {
                    const payslip = currentRun?.lineItems[employeeIndex];
                    if (payslip) {
                        setViewingPayslip(payslip);
                    }
                }}
            />
        </div>
    );
};
