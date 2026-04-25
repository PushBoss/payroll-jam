import React, { useState, useMemo, useEffect } from 'react';
import { Icons } from '../components/Icons';
import { Employee, WeeklyTimesheet, LeaveRequest, PayRun as PayRunType, CompanySettings, IntegrationConfig, PayFrequency } from '../core/types';
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
    createPayslipDownloadToken,
    getIncompletePayRunEmployees,
    getMissingPayRunEmployees,
    getPayFrequencyForCycle,
    hasEmployeePortalAccess
} from '../features/payroll/payrunWorkflow';
import { generateNCBFile, generateBNSFile, generateGLCSV } from '../utils/exportHelpers';
import { auditService } from '../core/auditService';
import { EmployeeService } from '../services/EmployeeService';
import { emailService } from '../services/emailService';
import { PayslipView } from '../components/PayslipView';
import { toast } from 'sonner';
import { useAuth } from '../context/AuthContext';
import { generateUUID } from '../utils/uuid';

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
    const [payCycle, setPayCycle] = useState<PayFrequency | 'ALL'>('ALL');
    const [payPeriod, setPayPeriod] = useState(new Date().toISOString().slice(0, 7)); // YYYY-MM
    const [editingRun, setEditingRun] = useState<PayRunType | null>(null);
    const [hasLoadedEdit, setHasLoadedEdit] = useState(false);

    // Date Range Selector State
    const [isDateRangeSelectorOpen, setIsDateRangeSelectorOpen] = useState(false);
    const [periodStartDate, setPeriodStartDate] = useState<string | null>(null);
    const [periodEndDate, setPeriodEndDate] = useState<string | null>(null);

    // Loading States
    const [isCalculating, setIsCalculating] = useState(false);
    const [isFinalizing, setIsFinalizing] = useState(false);
    const [isEmailing, setIsEmailing] = useState(false);
    const [currentRun, setCurrentRun] = useState<PayRunType | null>(null);
    const [isPayRunConfirmed, setIsPayRunConfirmed] = useState(false);

    const {
        draftItems,
        totals,
        initializeRun,
        updateLineItemGross,
        updateLineItemTaxes,
        addAdHocItem,
        addEmployeeToRun,
        removeEmployeeFromRun,
        clearDraft,
        loadDraftItems,
        removeAdHocItem
    } = usePayroll(employees, timesheets, leaveRequests, payRunHistory, companyData);

    const {
        adHocModal,
        newItemName,
        newItemAmount,
        addEmployeeModalOpen,
        viewingPayslip,
        taxModalOpen,
        selectedTaxItem,
        taxOverrideForm,
        setNewItemName,
        setNewItemAmount,
        setAddEmployeeModalOpen,
        setViewingPayslip,
        setTaxOverrideForm,
        openAdHocModal,
        closeAdHocModal,
        submitAdHocItem,
        openTaxModal,
        closeTaxModal,
        submitTaxOverride
    } = usePayRunUiState({
        currentUser,
        addAdHocItem,
        updateLineItemTaxes
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
        // Only load if we have an editRunId and haven't loaded yet
        if (editRunId && !hasLoadedEdit && payRunHistory.length > 0) {
            const runToEdit = payRunHistory.find(r => r.id === editRunId);
            if (runToEdit && (runToEdit.status === 'DRAFT' || runToEdit.status === 'APPROVED')) {
                setEditingRun(runToEdit);
                // Convert periodStart to YYYY-MM format if it's in YYYY-MM-DD format
                let period = runToEdit.periodStart;
                if (period.match(/^\d{4}-\d{2}-\d{2}$/)) {
                    period = period.substring(0, 7); // Extract YYYY-MM from YYYY-MM-DD
                }
                setPayPeriod(period);
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
            }
        } else if (editRunId && !hasLoadedEdit && payRunHistory.length === 0) {
            toast.error('Pay run not found');
            setHasLoadedEdit(true);
        }

        // Reset hasLoadedEdit when editRunId changes
        if (!editRunId && hasLoadedEdit) {
            setHasLoadedEdit(false);
        }
        // Only depend on editRunId and hasLoadedEdit to prevent re-triggering on payRunHistory updates
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [editRunId, hasLoadedEdit]);

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

    const incompleteEmployees = useMemo(() => {
        return getIncompletePayRunEmployees(draftItems, employees);
    }, [draftItems, employees]);

    const handleInitializeSystem = () => {
        setIsCalculating(true);
        setTimeout(() => {
            // Pass custom dates if available
            const hasData = initializeRun(payCycle, payPeriod, periodStartDate || undefined, periodEndDate || undefined);
            if (hasData) {
                setStep('DRAFT');
                const dateInfo = periodStartDate && periodEndDate ? ` (${periodStartDate} to ${periodEndDate})` : '';
                auditService.log(currentUser, 'CREATE', 'PayRun', `Initialized draft payroll for ${payPeriod}${dateInfo}`);
                toast.success("Payroll calculated from system data (Cumulative YTD Applied)");
            } else {
                toast.error("No eligible employees found for this selection.");
            }
            setIsCalculating(false);
        }, 800);
    };

    const handleContinueToFinalize = async () => {
        if (draftItems.length === 0) {
            toast.error("No employees in pay run. Add employees first.");
            return;
        }

        if (incompleteEmployees.length > 0) {
            const names = incompleteEmployees.map(e => `${e!.firstName} ${e!.lastName}`).join(', ');
            toast.error(`Cannot proceed. The following employees have missing or PENDING data: ${names}`);
            return;
        }

        // Auto-save draft before moving to finalize
        const draftRun: PayRunType = buildPayRunRecord({
            id: editingRun?.id || generateUUID(),
            payPeriod,
            payFrequency: editingRun?.payFrequency as PayFrequency || getPayFrequencyForCycle(payCycle),
            status: 'DRAFT',
            totalGross: totals.gross,
            totalNet: totals.net,
            lineItems: draftItems
        });

        const saved = await onSave(draftRun);
        if (!saved) {
            toast.error('Could not save draft pay run to database.');
            return;
        }

        setEditingRun(draftRun);
        setCurrentRun(draftRun);
        auditService.log(currentUser, 'UPDATE', 'PayRun', `Saved draft / Proceeded to review for ${payPeriod}`);

        setStep('FINALIZE');
        setIsPayRunConfirmed(false);
        toast.success("Review your pay run and click Finalize to complete");
    };

    // Removed handleSaveDraft - using auto-save with handleContinueToFinalize now

    // Removed handleSaveAsApproved - merging approval into finalize step

    const handleConfirmFinalize = async () => {
        if (incompleteEmployees.length > 0) {
            const names = incompleteEmployees.map(e => `${e!.firstName} ${e!.lastName}`).join(', ');
            toast.error(`Finalization blocked. Please complete data for: ${names}`);
            return;
        }

        setIsFinalizing(true);

        const newRun: PayRunType = buildPayRunRecord({
            id: editingRun?.id || currentRun?.id || generateUUID(),
            payPeriod,
            payFrequency: editingRun?.payFrequency as PayFrequency || getPayFrequencyForCycle(payCycle),
            status: 'FINALIZED',
            totalGross: totals.gross,
            totalNet: totals.net,
            lineItems: draftItems
        });

        const saved = await onSave(newRun);
        if (!saved) {
            setIsFinalizing(false);
            toast.error('Could not finalize pay run because the database save failed.');
            return;
        }

        auditService.log(currentUser, 'CREATE', 'PayRun', `Finalized payroll for ${payPeriod}`);
        
        // Update custom deductions for employees in this payrun
        // FIXED_TERM deductions: decrement remainingTerm
        // TARGET_BALANCE deductions: increment currentBalance
        for (const lineItem of draftItems) {
            const employee = employees.find(e => e.id === lineItem.employeeId);
            if (!employee || !employee.customDeductions || employee.customDeductions.length === 0) continue;

            // Process custom deductions
            const updatedEmployee = applyFinalizedCustomDeductions(employee, lineItem);

            try {
                await EmployeeService.saveEmployee(
                    updatedEmployee,
                    currentUser?.companyId || '',
                    'update',
                    { useAdminHandler: true }
                );
                console.log(`✅ Updated custom deductions for ${employee.firstName} ${employee.lastName}`);
            } catch (error) {
                console.error(`❌ Failed to update custom deductions for ${employee.firstName} ${employee.lastName}:`, error);
            }
        }

        setCurrentRun(newRun);
        setIsPayRunConfirmed(true);
        setIsFinalizing(false);
        toast.success("Payroll finalized successfully! You can now download, email, or print payslips.");
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
        setIsEmailing(true);
        let sentCount = 0;

        // Check company plan for employee portal access
        const hasPortalAccess = hasEmployeePortalAccess(companyData?.plan || 'Free');

        try {
            for (const line of currentRun.lineItems) {
                const emp = employees.find(e => e.id === line.employeeId);
                if (emp?.email) {
                    // Generate download token for Free plan users
                    let downloadToken = '';
                    if (!hasPortalAccess) {
                        downloadToken = createPayslipDownloadToken(line, currentRun);
                        console.log('🔑 Generated download token for Free plan:', {
                            employeeId: line.employeeId,
                            token: downloadToken,
                            decoded: {
                                employeeId: line.employeeId,
                                period: currentRun.periodStart,
                                runId: currentRun.id
                            }
                        });
                    }

                    console.log('📧 Sending payslip email:', {
                        email: emp.email,
                        hasPortalAccess,
                        downloadToken: downloadToken || 'N/A (portal access)'
                    });

                    await emailService.sendPayslipNotification(
                        emp.email,
                        emp.firstName,
                        currentRun.periodStart,
                        `$${line.netPay.toLocaleString()}`,
                        hasPortalAccess,
                        downloadToken
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

    const runPayslipSequence = (
        successStartMessage: string,
        successEndMessage: string,
        action: () => void
    ) => {
        if (!currentRun || currentRun.lineItems.length === 0) {
            toast.error('No payslips available');
            return;
        }

        toast.success(successStartMessage);

        let currentIndex = 0;

        const runNext = () => {
            if (!currentRun || currentIndex >= currentRun.lineItems.length) {
                setViewingPayslip(null);
                toast.success(successEndMessage);
                return;
            }

            setViewingPayslip(currentRun.lineItems[currentIndex]);

            setTimeout(() => {
                const handleAfterPrint = () => {
                    window.removeEventListener('afterprint', handleAfterPrint);
                    currentIndex++;
                    setTimeout(runNext, 300);
                };

                window.addEventListener('afterprint', handleAfterPrint);
                action();
            }, 500);
        };

        runNext();
    };

    const handleDownloadAllPayslips = () => {
        runPayslipSequence(
            `Downloading ${currentRun?.lineItems.length || 0} payslips. Save each as PDF, then close the dialog to continue.`,
            'All payslips downloaded successfully!',
            () => window.print()
        );
    };

    const handlePrintAllPayslips = () => {
        runPayslipSequence(
            `Printing ${currentRun?.lineItems.length || 0} payslips. Close each print dialog to continue to the next.`,
            'All payslips printed successfully!',
            () => window.print()
        );
    };

    const missingEmployees = useMemo(() => getMissingPayRunEmployees(employees, draftItems), [employees, draftItems]);

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
                    handleInitializeSystem={handleInitializeSystem}
                />
            </>
        );
    }

    if (step === 'DRAFT') {
        return (
            <div className="space-y-6 animate-fade-in relative">
                <PayRunProgressBar currentStep="DRAFT" />
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
                                    <input required type="number" className="w-full border border-gray-300 rounded-lg p-2 focus:ring-2 focus:ring-jam-orange" value={newItemAmount} onChange={e => setNewItemAmount(e.target.value)} />
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
                        <button onClick={() => {
                            if (window.confirm('Are you sure you want to cancel? Any unsaved changes will be lost.')) {
                                setStep('SETUP');
                                clearDraft();
                                setEditingRun(null);
                                if (onNavigate) {
                                    onNavigate('reports');
                                }
                            }
                        }} className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg text-sm font-medium">
                            Cancel
                        </button>
                        <button onClick={handleContinueToFinalize} disabled={isFinalizing} className="bg-jam-orange text-jam-black px-6 py-2 font-bold rounded-lg hover:bg-yellow-500 shadow-lg flex items-center text-sm disabled:opacity-50 disabled:cursor-not-allowed">
                            {isFinalizing ? (
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
                                <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase text-right w-40">Gross</th>
                                <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase text-center">Income / Bonus</th>
                                <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase text-center">Other Deductions</th>
                                <th className="px-6 py-4 text-xs font-bold text-red-500 uppercase text-right">Taxes</th>
                                <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase text-right">Net Pay</th>
                                <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase text-center">Action</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {draftItems.map(item => (
                                <PayRunDraftRow
                                    key={item.employeeId}
                                    item={item}
                                    updateLineItemGross={updateLineItemGross}
                                    openAdHocModal={openAdHocModal}
                                    openTaxModal={openTaxModal}
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

            {/* Payslip View Modal */}
            {viewingPayslip && (
                <PayslipView
                    data={viewingPayslip}
                    companyName={companyData.name}
                    payPeriod={currentRun?.periodStart || payPeriod}
                    payDate={currentRun?.payDate || new Date().toISOString().split('T')[0]}
                    onClose={() => setViewingPayslip(null)}
                />
            )}

            <PayRunFinalizeStep
                currentRun={currentRun}
                isPayRunConfirmed={isPayRunConfirmed}
                isFinalizing={isFinalizing}
                isEmailing={isEmailing}
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
