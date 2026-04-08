import React, { useState, useMemo, useEffect } from 'react';
import { Icons } from '../components/Icons';
import { Employee, WeeklyTimesheet, LeaveRequest, PayRun as PayRunType, CompanySettings, IntegrationConfig, PayFrequency, PayRunLineItem, StatutoryDeductions } from '../core/types';
import { usePayroll } from '../features/payroll/usePayroll';
import { generateNCBFile, generateBNSFile, generateGLCSV } from '../utils/exportHelpers';
import { auditService } from '../core/auditService';
import { EmployeeService } from '../services/EmployeeService';
import { emailService } from '../services/emailService';
import { PayslipView } from '../components/PayslipView';
import { toast } from 'sonner';
import { useAuth } from '../context/AuthContext';
import { generateUUID } from '../utils/uuid';

// Progress Bar Component
const ProgressBar: React.FC<{ currentStep: 'SETUP' | 'DRAFT' | 'FINALIZE' }> = ({ currentStep }) => {
    const steps = [
        { id: 'SETUP', label: 'Select Period', icon: Icons.Calendar },
        { id: 'DRAFT', label: 'Enter Details', icon: Icons.FileEdit },
        { id: 'FINALIZE', label: 'Finalize', icon: Icons.Check }
    ];

    const currentIndex = steps.findIndex(s => s.id === currentStep);

    return (
        <div className="mb-8">
            <div className="flex items-center justify-between max-w-3xl mx-auto">
                {steps.map((step, index) => {
                    const StepIcon = step.icon;
                    const isActive = index === currentIndex;
                    const isCompleted = index < currentIndex;

                    return (
                        <React.Fragment key={step.id}>
                            <div className="flex flex-col items-center flex-1">
                                <div className={`w-12 h-12 rounded-full flex items-center justify-center border-2 transition-all ${isActive ? 'bg-jam-orange border-jam-orange text-jam-black' :
                                    isCompleted ? 'bg-green-600 border-green-600 text-white' :
                                        'bg-gray-100 border-gray-300 text-gray-400'
                                    }`}>
                                    {isCompleted ? <Icons.Check className="w-6 h-6" /> : <StepIcon className="w-6 h-6" />}
                                </div>
                                <p className={`mt-2 text-sm font-medium ${isActive ? 'text-jam-orange' :
                                    isCompleted ? 'text-green-600' :
                                        'text-gray-400'
                                    }`}>
                                    {step.label}
                                </p>
                            </div>
                            {index < steps.length - 1 && (
                                <div className={`flex-1 h-0.5 mx-4 mb-8 transition-all ${index < currentIndex ? 'bg-green-600' : 'bg-gray-300'
                                    }`} />
                            )}
                        </React.Fragment>
                    );
                })}
            </div>
        </div>
    );
};

interface PayRunProps {
    employees: Employee[];
    timesheets: WeeklyTimesheet[];
    leaveRequests: LeaveRequest[];
    onSave: (run: PayRunType) => void;
    companyData: CompanySettings;
    integrationConfig: IntegrationConfig;
    payRunHistory: PayRunType[];
    editRunId?: string; // ID of pay run to edit
    onNavigate?: (path: string) => void; // For navigation after save
}

// Extracted row component to isolate logic and avoid parser ambiguity
const PayRunRow = ({
    item,
    updateLineItemGross,
    openAdHocModal,
    openTaxModal,
    removeEmployeeFromRun,
    removeAdHocItem
}: {
    item: PayRunLineItem,
    updateLineItemGross: (id: string, val: string) => void,
    openAdHocModal: (id: string, type: 'ADDITIONS' | 'DEDUCTIONS') => void,
    openTaxModal: (item: PayRunLineItem) => void,
    removeEmployeeFromRun: (id: string) => void,
    removeAdHocItem: (employeeId: string, itemId: string) => void
}) => {
    // Pre-calculate booleans
    const hasAdditions = item.additions > 0;
    const hasDeductions = item.deductions > 0;
    const isManualTax = item.isTaxOverridden === true;
    const [showAdditionsMenu, setShowAdditionsMenu] = React.useState(false);
    const [showDeductionsMenu, setShowDeductionsMenu] = React.useState(false);

    return (
        <tr className="hover:bg-gray-50 group">
            <td className="px-6 py-4">
                <p className="font-bold text-gray-900 text-sm">{item.employeeName}</p>
                <p className="text-xs text-gray-400">{item.employeeCustomId || 'No ID'}</p>
            </td>
            <td className="px-6 py-4 text-right">
                <div className="flex items-center justify-end">
                    <input
                        type="number"
                        value={item.grossPay}
                        onChange={(e) => updateLineItemGross(item.employeeId, e.target.value)}
                        className="w-28 text-right border border-gray-300 rounded px-2 py-1.5 text-sm focus:ring-jam-orange focus:border-jam-orange bg-white shadow-sm"
                    />
                </div>
            </td>
            <td className="px-6 py-4 text-center overflow-visible">
                <div className="flex flex-col items-center relative">
                    {hasAdditions ? (
                        <div className="flex flex-col items-center relative">
                            <button
                                onClick={() => setShowAdditionsMenu(!showAdditionsMenu)}
                                className="text-green-600 font-bold text-sm mb-1 hover:text-green-700 cursor-pointer"
                            >
                                +${item.additions.toLocaleString()}
                            </button>
                            {showAdditionsMenu && (
                                <div className="absolute top-full mt-1 bg-white border border-gray-200 rounded-lg shadow-xl p-3 z-[100] min-w-[250px] left-1/2 transform -translate-x-1/2">
                                    <div className="flex justify-between items-center mb-2">
                                        <span className="text-xs font-bold text-gray-700">Additions</span>
                                        <button
                                            onClick={() => setShowAdditionsMenu(false)}
                                            className="text-gray-400 hover:text-gray-600"
                                        >
                                            <Icons.Close className="w-3 h-3" />
                                        </button>
                                    </div>
                                    <div className="space-y-1 max-h-60 overflow-y-auto">
                                        {item.additionsBreakdown?.map((add) => (
                                            <div key={add.id} className="flex justify-between items-center text-xs p-2 hover:bg-gray-50 rounded">
                                                <div className="flex-1">
                                                    <div className="font-medium text-gray-900">{add.name}</div>
                                                    <div className="text-gray-500 text-[10px]">{add.isTaxable === false ? 'Non-taxable' : 'Taxable'}</div>
                                                </div>
                                                <div className="flex items-center gap-2">
                                                    <span className="text-green-600 font-bold">${add.amount.toLocaleString()}</span>
                                                    <button
                                                        onClick={() => {
                                                            removeAdHocItem(item.employeeId, add.id);
                                                            if (item.additionsBreakdown?.length === 1) setShowAdditionsMenu(false);
                                                        }}
                                                        className="text-red-500 hover:text-red-700"
                                                        title="Delete"
                                                    >
                                                        <Icons.Trash className="w-3 h-3" />
                                                    </button>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                    <button
                                        onClick={() => {
                                            setShowAdditionsMenu(false);
                                            openAdHocModal(item.employeeId, 'ADDITIONS');
                                        }}
                                        className="w-full mt-2 text-xs text-jam-orange hover:text-jam-black flex items-center justify-center border-t border-gray-200 pt-2"
                                    >
                                        <Icons.Plus className="w-3 h-3 mr-1" /> Add Another
                                    </button>
                                </div>
                            )}
                            <button onClick={() => setShowAdditionsMenu(!showAdditionsMenu)} className="text-xs text-gray-400 hover:text-jam-orange flex items-center">
                                <Icons.ChevronDown className="w-3 h-3 mr-1" /> View
                            </button>
                        </div>
                    ) : (
                        <button onClick={() => openAdHocModal(item.employeeId, 'ADDITIONS')} className="text-gray-400 hover:text-jam-orange text-sm flex items-center">
                            <Icons.Plus className="w-3 h-3 mr-1" /> Add
                        </button>
                    )}
                </div>
            </td>
            <td className="px-6 py-4 text-center overflow-visible">
                <div className="flex flex-col items-center relative">
                    {hasDeductions ? (
                        <div className="flex flex-col items-center relative">
                            <button
                                onClick={() => setShowDeductionsMenu(!showDeductionsMenu)}
                                className="text-red-600 font-bold text-sm mb-1 hover:text-red-700 cursor-pointer"
                            >
                                -${item.deductions.toLocaleString()}
                            </button>
                            {showDeductionsMenu && (
                                <div className="absolute top-full mt-1 bg-white border border-gray-200 rounded-lg shadow-xl p-3 z-[100] min-w-[250px] left-1/2 transform -translate-x-1/2">
                                    <div className="flex justify-between items-center mb-2">
                                        <span className="text-xs font-bold text-gray-700">Deductions</span>
                                        <button
                                            onClick={() => setShowDeductionsMenu(false)}
                                            className="text-gray-400 hover:text-gray-600"
                                        >
                                            <Icons.Close className="w-3 h-3" />
                                        </button>
                                    </div>
                                    <div className="space-y-1 max-h-60 overflow-y-auto">
                                        {item.deductionsBreakdown?.map((ded) => (
                                            <div key={ded.id} className="flex justify-between items-center text-xs p-2 hover:bg-gray-50 rounded">
                                                <div className="flex-1">
                                                    <div className="font-medium text-gray-900">{ded.name}</div>
                                                </div>
                                                <div className="flex items-center gap-2">
                                                    <span className="text-red-600 font-bold">${ded.amount.toLocaleString()}</span>
                                                    <button
                                                        onClick={() => {
                                                            removeAdHocItem(item.employeeId, ded.id);
                                                            if (item.deductionsBreakdown?.length === 1) setShowDeductionsMenu(false);
                                                        }}
                                                        className="text-red-500 hover:text-red-700"
                                                        title="Delete"
                                                    >
                                                        <Icons.Trash className="w-3 h-3" />
                                                    </button>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                    <button
                                        onClick={() => {
                                            setShowDeductionsMenu(false);
                                            openAdHocModal(item.employeeId, 'DEDUCTIONS');
                                        }}
                                        className="w-full mt-2 text-xs text-jam-orange hover:text-jam-black flex items-center justify-center border-t border-gray-200 pt-2"
                                    >
                                        <Icons.Plus className="w-3 h-3 mr-1" /> Add Another
                                    </button>
                                </div>
                            )}
                            <button onClick={() => setShowDeductionsMenu(!showDeductionsMenu)} className="text-xs text-gray-400 hover:text-jam-orange flex items-center">
                                <Icons.ChevronDown className="w-3 h-3 mr-1" /> View
                            </button>
                        </div>
                    ) : (
                        <button onClick={() => openAdHocModal(item.employeeId, 'DEDUCTIONS')} className="text-gray-400 hover:text-jam-orange text-sm flex items-center">
                            <Icons.Plus className="w-3 h-3 mr-1" /> Add
                        </button>
                    )}
                </div>
            </td>
            <td className="px-6 py-4 text-right relative">
                <div className="text-xs text-gray-500 space-y-0.5">
                    <div className="flex justify-end space-x-2"><span>PAYE:</span> <span className="font-medium text-gray-700">{item.paye.toLocaleString()}</span></div>
                    <div className="flex justify-end space-x-2"><span>NIS:</span> <span className="font-medium text-gray-700">{item.nis.toLocaleString()}</span></div>
                    <div className="flex justify-end space-x-2"><span>NHT:</span> <span className="font-medium text-gray-700">{item.nht.toLocaleString()}</span></div>
                    <div className="flex justify-end space-x-2"><span>Ed:</span> <span className="font-medium text-gray-700">{item.edTax.toLocaleString()}</span></div>
                    <div className="mt-1 flex justify-end">
                        <button onClick={() => openTaxModal(item)} className="text-[10px] bg-gray-100 hover:bg-gray-200 text-gray-600 px-2 py-0.5 rounded flex items-center" title="Manually Override Taxes">
                            <Icons.FileEdit className="w-3 h-3 mr-1" /> Edit Taxes
                        </button>
                    </div>
                    {isManualTax && (
                        <div className="absolute top-2 right-2">
                            <span className="bg-red-100 text-red-600 text-[9px] font-bold px-1 rounded border border-red-200">MANUAL</span>
                        </div>
                    )}
                </div>
            </td>
            <td className="px-6 py-4 text-right">
                <span className="font-bold text-lg text-gray-900">${item.netPay.toLocaleString()}</span>
            </td>
            <td className="px-6 py-4 text-center">
                <button onClick={() => removeEmployeeFromRun(item.employeeId)} className="text-gray-300 hover:text-red-500 p-2 rounded-full hover:bg-red-50 transition-colors" title="Remove from Pay Run">
                    <Icons.Trash className="w-4 h-4" />
                </button>
            </td>
        </tr>
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
    const [payCycle, setPayCycle] = useState<PayFrequency | 'ALL'>('ALL');
    const [payPeriod, setPayPeriod] = useState(new Date().toISOString().slice(0, 7)); // YYYY-MM
    const [editingRun, setEditingRun] = useState<PayRunType | null>(null);
    const [hasLoadedEdit, setHasLoadedEdit] = useState(false);

    // Date Range Selector State
    const [isDateRangeSelectorOpen, setIsDateRangeSelectorOpen] = useState(false);
    const [periodStartDate, setPeriodStartDate] = useState<string | null>(null);
    const [periodEndDate, setPeriodEndDate] = useState<string | null>(null);

    // Modal States
    const [adHocModal, setAdHocModal] = useState<{
        isOpen: boolean;
        employeeId: string;
        type: 'ADDITIONS' | 'DEDUCTIONS';
    }>({ isOpen: false, employeeId: '', type: 'ADDITIONS' });
    const [newItemName, setNewItemName] = useState('');
    const [newItemAmount, setNewItemAmount] = useState('');

    const [addEmployeeModalOpen, setAddEmployeeModalOpen] = useState(false);
    const [viewingPayslip, setViewingPayslip] = useState<PayRunLineItem | null>(null);

    // Tax Override Modal State
    const [taxModalOpen, setTaxModalOpen] = useState(false);
    const [selectedTaxItem, setSelectedTaxItem] = useState<PayRunLineItem | null>(null);
    const [taxOverrideForm, setTaxOverrideForm] = useState<StatutoryDeductions>({
        nis: 0, nht: 0, edTax: 0, paye: 0, pension: 0, totalDeductions: 0, netPay: 0
    });

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
        const options = [];
        const today = new Date();
        for (let i = -6; i <= 3; i++) {
            const d = new Date(today.getFullYear(), today.getMonth() + i, 1);
            const value = d.toISOString().slice(0, 7);
            const label = d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
            options.push({ value, label });
        }
        return options.reverse();
    }, []);

    // Calculate Bank Totals for Distribution Summary
    const bankTotals = useMemo(() => {
        if (!currentRun) return { ncb: 0, bns: 0, other: 0, total: 0 };
        let ncb = 0;
        let bns = 0;
        let other = 0;

        currentRun.lineItems.forEach(line => {
            const emp = employees.find(e => e.id === line.employeeId);
            const bank = emp?.bankDetails?.bankName || 'OTHER';

            if (bank === 'NCB') ncb += line.netPay;
            else if (bank === 'BNS') bns += line.netPay;
            else other += line.netPay;
        });

        return { ncb, bns, other, total: ncb + bns + other };
    }, [currentRun, employees]);

    // Pre-calculate booleans for Finalize Step
    const showNcbCard = bankTotals.ncb > 0;
    const showBnsCard = bankTotals.bns > 0;
    const showOtherCard = bankTotals.other > 0;

    const ncbCardClass = showNcbCard ? 'border-gray-200 hover:border-jam-orange bg-white' : 'border-gray-100 bg-gray-50 opacity-60';
    const bnsCardClass = showBnsCard ? 'border-gray-200 hover:border-jam-orange bg-white' : 'border-gray-100 bg-gray-50 opacity-60';

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

        // Check for "PENDING" or missing data
        const incompleteEmployees = draftItems
            .map(item => employees.find(e => e.id === item.employeeId))
            .filter(emp => emp && (
                !emp.trn || emp.trn.trim() === '' || emp.trn.toUpperCase() === 'PENDING' ||
                !emp.nis || emp.nis.trim() === '' || emp.nis.toUpperCase() === 'PENDING' ||
                !emp.bankDetails?.accountNumber || emp.bankDetails.accountNumber.trim() === '' || emp.bankDetails.accountNumber.toUpperCase() === 'PENDING'
            ));

        if (incompleteEmployees.length > 0) {
            const names = incompleteEmployees.map(e => `${e!.firstName} ${e!.lastName}`).join(', ');
            toast.error(`Cannot proceed. The following employees have missing or PENDING data: ${names}`);
            return;
        }

        // Auto-save draft before moving to finalize
        const draftRun: PayRunType = {
            id: editingRun?.id || generateUUID(),
            periodStart: payPeriod,
            periodEnd: payPeriod,
            payDate: new Date().toISOString().split('T')[0],
            payFrequency: editingRun?.payFrequency || getPayFrequency(),
            status: 'DRAFT',
            totalGross: totals.gross,
            totalNet: totals.net,
            lineItems: draftItems
        };

        // Update editingRun state
        setEditingRun(draftRun);
        setCurrentRun(draftRun);
        onSave(draftRun);
        auditService.log(currentUser, 'UPDATE', 'PayRun', `Saved draft / Proceeded to review for ${payPeriod}`);

        // Move to finalize step (but not finalized yet)
        setStep('FINALIZE');
        setIsPayRunConfirmed(false);
        toast.success("Review your pay run and click Finalize to complete");
    };

    // Determine pay frequency from payCycle
    const getPayFrequency = (): 'WEEKLY' | 'FORTNIGHTLY' | 'MONTHLY' => {
        if (payCycle === 'WEEKLY') return 'WEEKLY';
        if (payCycle === 'FORTNIGHTLY') return 'FORTNIGHTLY';
        // Default to MONTHLY for 'ALL' or 'MONTHLY'
        return 'MONTHLY';
    };

    // Removed handleSaveDraft - using auto-save with handleContinueToFinalize now

    // Removed handleSaveAsApproved - merging approval into finalize step

    const handleConfirmFinalize = async () => {
        // Double check for "PENDING" or missing data
        const incompleteEmployees = draftItems
            .map(item => employees.find(e => e.id === item.employeeId))
            .filter(emp => emp && (
                !emp.trn || emp.trn.trim() === '' || emp.trn.toUpperCase() === 'PENDING' ||
                !emp.nis || emp.nis.trim() === '' || emp.nis.toUpperCase() === 'PENDING' ||
                !emp.bankDetails?.accountNumber || emp.bankDetails.accountNumber.trim() === '' || emp.bankDetails.accountNumber.toUpperCase() === 'PENDING'
            ));

        if (incompleteEmployees.length > 0) {
            const names = incompleteEmployees.map(e => `${e!.firstName} ${e!.lastName}`).join(', ');
            toast.error(`Finalization blocked. Please complete data for: ${names}`);
            return;
        }

        setIsFinalizing(true);

        const newRun: PayRunType = {
            id: editingRun?.id || currentRun?.id || generateUUID(),
            periodStart: payPeriod,
            periodEnd: payPeriod,
            payDate: new Date().toISOString().split('T')[0],
            payFrequency: editingRun?.payFrequency || getPayFrequency(),
            status: 'FINALIZED',
            totalGross: totals.gross,
            totalNet: totals.net,
            lineItems: draftItems
        };

        // Don't send emails automatically - wait for user to click "Email All"
        onSave(newRun);
        auditService.log(currentUser, 'CREATE', 'PayRun', `Finalized payroll for ${payPeriod}`);
        
        // Update custom deductions for employees in this payrun
        // FIXED_TERM deductions: decrement remainingTerm
        // TARGET_BALANCE deductions: increment currentBalance
        for (const lineItem of draftItems) {
            const employee = employees.find(e => e.id === lineItem.employeeId);
            if (!employee || !employee.customDeductions || employee.customDeductions.length === 0) continue;

            // Process custom deductions
            const updatedCustomDeductions = employee.customDeductions.map(deduction => {
                // Check if this deduction is in the current payrun
                const deductionInBreakdown = lineItem.deductionsBreakdown?.some(d => d.id === deduction.id);
                if (!deductionInBreakdown) return deduction;

                // Handle FIXED_TERM deductions
                if (deduction.periodType === 'FIXED_TERM' && deduction.remainingTerm !== undefined) {
                    return {
                        ...deduction,
                        remainingTerm: Math.max(0, deduction.remainingTerm - 1)
                    };
                }

                // Handle TARGET_BALANCE deductions
                if (deduction.periodType === 'TARGET_BALANCE') {
                    const currentBalance = deduction.currentBalance || 0;
                    return {
                        ...deduction,
                        currentBalance: currentBalance + deduction.amount
                    };
                }

                return deduction;
            });

            // Save updated employee with modified custom deductions
            const updatedEmployee = {
                ...employee,
                customDeductions: updatedCustomDeductions
            };

            try {
                await EmployeeService.saveEmployee(updatedEmployee, currentUser?.companyId || '');
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
        const companyPlan = companyData?.plan || 'Free';
        const hasPortalAccess = companyPlan === 'Starter' || companyPlan === 'Pro' || companyPlan === 'Professional';

        try {
            for (const line of currentRun.lineItems) {
                const emp = employees.find(e => e.id === line.employeeId);
                if (emp?.email) {
                    // Generate download token for Free plan users
                    let downloadToken = '';
                    if (!hasPortalAccess) {
                        const tokenData = {
                            employeeId: line.employeeId,
                            period: currentRun.periodStart,
                            runId: currentRun.id
                        };
                        downloadToken = btoa(JSON.stringify(tokenData));
                        console.log('🔑 Generated download token for Free plan:', {
                            employeeId: line.employeeId,
                            token: downloadToken,
                            decoded: tokenData
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

    // Ad-Hoc Logic
    const openAdHocModal = (empId: string, type: 'ADDITIONS' | 'DEDUCTIONS') => {
        setAdHocModal({ isOpen: true, employeeId: empId, type });
        setNewItemName('');
        setNewItemAmount('');
    };

    const submitAdHocItem = (e: React.FormEvent) => {
        e.preventDefault();
        if (!newItemName || !newItemAmount) return;

        addAdHocItem(adHocModal.employeeId, adHocModal.type, {
            id: `adhoc-${Date.now()}`,
            name: newItemName,
            amount: parseFloat(newItemAmount),
            isTaxable: true // Default to taxable for additions
        });

        setAdHocModal({ ...adHocModal, isOpen: false });
        toast.success("Item added to this pay run");
    };

    // Tax Override Logic
    const openTaxModal = (item: PayRunLineItem) => {
        setSelectedTaxItem(item);
        setTaxOverrideForm({
            nis: item.nis,
            nht: item.nht,
            edTax: item.edTax,
            paye: item.paye,
            pension: item.pension,
            totalDeductions: item.totalDeductions,
            netPay: item.netPay
        });
        setTaxModalOpen(true);
    };

    const submitTaxOverride = (e: React.FormEvent) => {
        e.preventDefault();
        if (!selectedTaxItem) return;

        updateLineItemTaxes(selectedTaxItem.employeeId, {
            nis: parseFloat(taxOverrideForm.nis.toString()) || 0,
            nht: parseFloat(taxOverrideForm.nht.toString()) || 0,
            edTax: parseFloat(taxOverrideForm.edTax.toString()) || 0,
            paye: parseFloat(taxOverrideForm.paye.toString()) || 0,
        });

        auditService.log(currentUser, 'UPDATE', 'PayRun', `Manually overrode taxes for ${selectedTaxItem.employeeName}`);
        setTaxModalOpen(false);
        toast.success("Tax override applied");
    };

    const missingEmployees = employees.filter(e =>
        e.status === 'ACTIVE' &&
        !draftItems.find(item => item.employeeId === e.id)
    );

    if (step === 'SETUP') {
        return (
            <div className="max-w-4xl mx-auto mt-10 animate-fade-in">
                <ProgressBar currentStep="SETUP" />
                <div className="bg-white p-8 rounded-xl shadow-xl border border-gray-100 text-center max-w-xl mx-auto">
                    <div className="w-16 h-16 bg-orange-50 rounded-full flex items-center justify-center mx-auto mb-6 shadow-sm border border-orange-100">
                        <span className="text-3xl text-jam-orange font-bold">$</span>
                    </div>

                    <h2 className="text-2xl font-bold text-gray-900 mb-2">Start a New Pay Run</h2>
                    <p className="text-gray-500 text-sm mb-8 max-w-sm mx-auto leading-relaxed">
                        Select the pay period and group. You can calculate from system data or import a CSV file.
                    </p>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-left mb-8">
                        <div>
                            <label className="block text-xs font-semibold text-gray-500 mb-2 uppercase tracking-wide">Pay Period</label>
                            <select
                                value={payPeriod}
                                onChange={(e) => setPayPeriod(e.target.value)}
                                className="w-full border border-gray-300 rounded-lg p-3 text-sm focus:ring-2 focus:ring-jam-orange focus:border-jam-orange transition-shadow bg-white"
                            >
                                {payPeriodOptions.map(opt => (
                                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <label className="block text-xs font-semibold text-gray-500 mb-2 uppercase tracking-wide">Pay Cycle Filter</label>
                            <select
                                value={payCycle}
                                onChange={(e) => setPayCycle(e.target.value as any)}
                                className="w-full border border-gray-300 rounded-lg p-3 text-sm focus:ring-2 focus:ring-jam-orange focus:border-jam-orange transition-shadow bg-white"
                            >
                                <option value={PayFrequency.MONTHLY}>Monthly (Salaried)</option>
                                <option value={PayFrequency.FORTNIGHTLY}>Fortnightly</option>
                                <option value={PayFrequency.WEEKLY}>Weekly</option>
                                <option value="ALL">All Employees (Mixed)</option>
                            </select>
                        </div>
                    </div>

                    <div className="mb-6">
                        <button
                            type="button"
                            onClick={() => {
                                console.log('Opening date range selector...', {isOpen: isDateRangeSelectorOpen});
                                setIsDateRangeSelectorOpen(true);
                            }}
                            className="w-full py-2 px-4 border border-jam-orange text-jam-orange rounded-lg font-semibold hover:bg-orange-50 transition-colors flex items-center justify-center"
                        >
                            <Icons.Calendar className="w-4 h-4 mr-2" />
                            Or Select Custom Date Range
                        </button>
                        {periodStartDate && periodEndDate && (
                            <p className="text-xs text-gray-500 mt-2">
                                Selected: {periodStartDate} to {periodEndDate}
                            </p>
                        )}
                    </div>

                    {isSuspended && (
                        <div className="bg-red-50 border border-red-200 text-red-800 p-4 rounded-lg text-sm flex items-start text-left mb-6">
                            <Icons.Alert className="w-5 h-5 mr-2 flex-shrink-0" />
                            <div>
                                <span className="font-bold">Feature Locked:</span> Your account is suspended due to non-payment.
                            </div>
                        </div>
                    )}

                    <button
                        onClick={handleInitializeSystem}
                        disabled={isSuspended || isCalculating}
                        className={`w-full py-4 rounded-lg font-bold transition-all shadow-md flex justify-center items-center text-base ${isSuspended || isCalculating
                            ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                            : 'bg-jam-black text-white hover:bg-gray-900 hover:shadow-lg transform hover:-translate-y-0.5'
                            }`}
                    >
                        {isCalculating ? (
                            <span className="flex items-center"><Icons.Refresh className="w-5 h-5 mr-2 animate-spin" /> Calculating...</span>
                        ) : (
                            <span className="flex items-center"><Icons.Zap className="w-5 h-5 mr-2 text-jam-yellow" /> Start Pay Run</span>
                        )}
                    </button>
                </div>

                {/* Date Range Selector Modal */}
                {isDateRangeSelectorOpen && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
                        <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg overflow-hidden">
                            <div className="p-6 border-b border-gray-200 bg-gray-50 flex justify-between items-center">
                                <h3 className="text-lg font-bold text-gray-900">Select Pay Period Dates</h3>
                                <button
                                    type="button"
                                    onClick={() => setIsDateRangeSelectorOpen(false)}
                                    className="text-gray-400 hover:text-gray-600"
                                >
                                    ✕
                                </button>
                            </div>
                            <div className="p-6 space-y-4">
                                <div>
                                    <label className="block text-sm font-semibold text-gray-700 mb-2">Start Date</label>
                                    <input
                                        type="date"
                                        value={periodStartDate || ''}
                                        onChange={(e) => setPeriodStartDate(e.target.value || null)}
                                        className="w-full border border-gray-300 rounded-lg p-3 text-sm"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-semibold text-gray-700 mb-2">End Date</label>
                                    <input
                                        type="date"
                                        value={periodEndDate || ''}
                                        onChange={(e) => setPeriodEndDate(e.target.value || null)}
                                        className="w-full border border-gray-300 rounded-lg p-3 text-sm"
                                    />
                                </div>
                            </div>
                            <div className="border-t border-gray-200 px-6 py-4 bg-gray-50 flex justify-end space-x-3">
                                <button
                                    type="button"
                                    onClick={() => setIsDateRangeSelectorOpen(false)}
                                    className="px-6 py-2 border border-gray-300 rounded-lg font-medium text-gray-700 hover:bg-gray-100"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="button"
                                    onClick={() => {
                                        if (periodStartDate && periodEndDate) {
                                            console.log('Applied dates:', {periodStartDate, periodEndDate});
                                            setIsDateRangeSelectorOpen(false);
                                        }
                                    }}
                                    disabled={!periodStartDate || !periodEndDate}
                                    className="px-6 py-2 bg-jam-black text-white rounded-lg font-medium hover:bg-gray-900 disabled:opacity-50"
                                >
                                    Apply Dates
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        );
    }

    if (step === 'DRAFT') {
        return (
            <div className="space-y-6 animate-fade-in relative">
                <ProgressBar currentStep="DRAFT" />
                {/* Wizard Stepper */}
                {/* Ad Hoc Modal */}
                {adHocModal.isOpen && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
                        <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm overflow-hidden animate-scale-in">
                            <div className="p-6 border-b border-gray-100 flex justify-between items-center">
                                <h3 className="font-bold text-gray-900">Add {adHocModal.type === 'ADDITIONS' ? 'Income' : 'Deduction'}</h3>
                                <button onClick={() => setAdHocModal({ ...adHocModal, isOpen: false })}><Icons.Close className="w-5 h-5 text-gray-400" /></button>
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
                                <button onClick={() => setTaxModalOpen(false)}><Icons.Close className="w-5 h-5 text-red-400" /></button>
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
                                <PayRunRow
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
        <div className="animate-fade-in relative pb-12">
            <ProgressBar currentStep="FINALIZE" />

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

            {/* Banner - Different based on confirmation status */}
            {!isPayRunConfirmed ? (
                <div className="bg-blue-50 border border-blue-200 rounded-xl p-6 flex justify-between items-center mb-8 shadow-sm">
                    <div className="flex items-center">
                        <div className="w-12 h-12 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center mr-4">
                            <Icons.Calendar className="w-6 h-6" />
                        </div>
                        <div>
                            <h2 className="text-xl font-bold text-blue-900">Ready to Finalize Pay Run</h2>
                            <p className="text-blue-700 text-sm">Review the payroll details below. Once finalized, payslips will be generated and you can export files.</p>
                        </div>
                    </div>
                    <div className="flex items-center space-x-3">
                        <button
                            onClick={() => { setStep('DRAFT'); }}
                            className="bg-white border border-gray-300 text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-50 shadow-sm flex items-center text-sm font-medium"
                        >
                            <Icons.ArrowLeft className="w-4 h-4 mr-2" /> Back to Edit
                        </button>
                        <button
                            onClick={handleConfirmFinalize}
                            disabled={isFinalizing}
                            className="bg-jam-orange text-jam-black px-6 py-2.5 rounded-lg hover:bg-yellow-400 shadow-md font-bold text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center"
                        >
                            {isFinalizing ? (
                                <><Icons.Refresh className="w-4 h-4 mr-2 animate-spin" /> Finalizing...</>
                            ) : (
                                <><Icons.Check className="w-4 h-4 mr-2" /> Finalize Pay Run</>
                            )}
                        </button>
                    </div>
                </div>
            ) : (
                <div className="bg-green-50 border border-green-200 rounded-xl p-6 flex justify-between items-center mb-8 shadow-sm">
                    <div className="flex items-center">
                        <div className="w-12 h-12 bg-green-100 text-green-600 rounded-full flex items-center justify-center mr-4">
                            <Icons.Check className="w-6 h-6" />
                        </div>
                        <div>
                            <h2 className="text-xl font-bold text-green-900">Pay Run Finalized Successfully!</h2>
                            <p className="text-green-700 text-sm">Payslips have been generated and saved to reports. You can now export bank files and send payslips.</p>
                        </div>
                    </div>
                    <div className="flex items-center space-x-3">
                        <button
                            onClick={() => { setStep('SETUP'); clearDraft(); setIsPayRunConfirmed(false); }}
                            className="bg-green-600 text-white px-6 py-2.5 rounded-lg hover:bg-green-700 shadow-md font-medium text-sm transition-colors"
                        >
                            Start New Run
                        </button>
                    </div>
                </div>
            )}

            {/* Top Cards Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
                {/* Bank Files Card */}
                <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
                    <div className="flex items-center mb-4">
                        <Icons.Bank className="w-5 h-5 mr-2 text-jam-black" />
                        <h3 className="font-bold text-gray-900">Bank File Generation</h3>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        {/* NCB Card */}
                        <div className={`border rounded-lg p-4 transition-colors ${ncbCardClass}`}>
                            <div className="flex justify-between items-start mb-2">
                                <span className="font-bold text-sm text-gray-800">NCB ACH</span>
                                <Icons.DownloadCloud className="w-4 h-4 text-gray-400" />
                            </div>
                            <div className="mb-3">
                                <p className="text-xs text-gray-500">National Commercial Bank</p>
                                <span className="inline-block mt-1 bg-gray-100 text-gray-700 text-xs px-2 py-0.5 rounded font-bold">
                                    ${bankTotals.ncb.toLocaleString()}
                                </span>
                            </div>
                            <button
                                onClick={() => handleDownloadBankFile('NCB')}
                                disabled={!showNcbCard || !isPayRunConfirmed}
                                className="w-full py-1.5 bg-gray-50 hover:bg-gray-100 border border-gray-200 rounded text-xs font-medium text-gray-700 disabled:cursor-not-allowed disabled:bg-gray-50 disabled:opacity-50"
                            >
                                Download File
                            </button>
                        </div>

                        {/* Scotiabank Card */}
                        <div className={`border rounded-lg p-4 transition-colors ${bnsCardClass}`}>
                            <div className="flex justify-between items-start mb-2">
                                <span className="font-bold text-sm text-gray-800">Scotiabank</span>
                                <Icons.DownloadCloud className="w-4 h-4 text-gray-400" />
                            </div>
                            <div className="mb-3">
                                <p className="text-xs text-gray-500">Scotia Connect CSV</p>
                                <span className="inline-block mt-1 bg-gray-100 text-gray-700 text-xs px-2 py-0.5 rounded font-bold">
                                    ${bankTotals.bns.toLocaleString()}
                                </span>
                            </div>
                            <button
                                onClick={() => handleDownloadBankFile('BNS')}
                                disabled={!showBnsCard || !isPayRunConfirmed}
                                className="w-full py-1.5 bg-gray-50 hover:bg-gray-100 border border-gray-200 rounded text-xs font-medium text-gray-700 disabled:cursor-not-allowed disabled:bg-gray-50 disabled:opacity-50"
                            >
                                Download File
                            </button>
                        </div>
                    </div>
                    {showOtherCard && (
                        <div className="mt-3 text-xs text-center text-gray-500 bg-gray-50 p-2 rounded">
                            <span className="font-bold text-gray-700">${bankTotals.other.toLocaleString()}</span> to be paid via Cash/Cheque/Other Banks
                        </div>
                    )}
                </div>

                {/* Accounting Card */}
                <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
                    <div className="flex items-center mb-4">
                        <Icons.FileSpreadsheet className="w-5 h-5 mr-2 text-jam-black" />
                        <h3 className="font-bold text-gray-900">Accounting</h3>
                    </div>
                    <div className="bg-blue-50 border border-blue-100 rounded-lg p-4">
                        <div className="flex justify-between items-center mb-2">
                            <span className="font-bold text-sm text-blue-900">Journal Entry</span>
                            <span className="text-xs bg-white text-blue-600 px-2 py-0.5 rounded border border-blue-200">
                                {integrationConfig.provider}
                            </span>
                        </div>
                        <p className="text-xs text-blue-700 mb-4">Post payroll costs to your GL automatically.</p>
                        <button
                            onClick={handleDownloadGL}
                            disabled={!isPayRunConfirmed}
                            className="w-full py-2 bg-white border border-blue-200 text-blue-700 rounded font-medium text-sm hover:bg-blue-50 flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            <Icons.Link className="w-3 h-3 mr-2" /> Sync to GL
                        </button>
                    </div>
                </div>
            </div>

            {/* Generated Payslips List */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                <div className="px-6 py-4 border-b border-gray-200 bg-gray-50 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <h3 className="font-bold text-gray-900">{isPayRunConfirmed ? 'Generated Payslips' : 'Payslips Preview'}</h3>
                    {isPayRunConfirmed && (
                        <div className="flex space-x-3">
                            <button
                                onClick={() => {
                                    if (!currentRun || currentRun.lineItems.length === 0) {
                                        toast.error('No payslips to download');
                                        return;
                                    }

                                    toast.success(`Downloading ${currentRun.lineItems.length} payslips. Save each as PDF, then close the dialog to continue.`);

                                    // Download payslips sequentially as PDFs
                                    let currentIndex = 0;

                                    const downloadNext = () => {
                                        if (currentIndex >= currentRun.lineItems.length) {
                                            setViewingPayslip(null);
                                            toast.success('All payslips downloaded successfully!');
                                            return;
                                        }

                                        // Show the current payslip
                                        setViewingPayslip(currentRun.lineItems[currentIndex]);

                                        // Wait for the payslip to render, then open print dialog for saving as PDF
                                        setTimeout(() => {
                                            // Set up listener for when print/save dialog closes
                                            const handleAfterPrint = () => {
                                                window.removeEventListener('afterprint', handleAfterPrint);
                                                currentIndex++;
                                                // Small delay before showing next payslip
                                                setTimeout(downloadNext, 300);
                                            };

                                            window.addEventListener('afterprint', handleAfterPrint);
                                            // Open print dialog - user can choose "Save as PDF" as destination
                                            window.print();
                                        }, 500);
                                    };

                                    downloadNext();
                                }}
                                className="flex items-center px-4 py-2 bg-white border border-gray-300 rounded-lg text-gray-700 text-sm hover:bg-gray-100"
                            >
                                <Icons.Download className="w-4 h-4 mr-2" />
                                Download All
                            </button>
                            <button
                                onClick={handleEmailPayslips}
                                disabled={isEmailing}
                                className="flex items-center px-4 py-2 bg-white border border-gray-300 rounded-lg text-gray-700 text-sm hover:bg-gray-100 disabled:opacity-50"
                            >
                                <Icons.Mail className="w-4 h-4 mr-2" />
                                {isEmailing ? 'Sending...' : 'Email All'}
                            </button>
                            <button
                                onClick={() => {
                                    if (!currentRun || currentRun.lineItems.length === 0) {
                                        toast.error('No payslips to print');
                                        return;
                                    }

                                    toast.success(`Printing ${currentRun.lineItems.length} payslips. Close each print dialog to continue to the next.`);

                                    // Print payslips sequentially, waiting for each print dialog to close
                                    let currentIndex = 0;

                                    const printNext = () => {
                                        if (currentIndex >= currentRun.lineItems.length) {
                                            setViewingPayslip(null);
                                            toast.success('All payslips printed successfully!');
                                            return;
                                        }

                                        // Show the current payslip
                                        setViewingPayslip(currentRun.lineItems[currentIndex]);

                                        // Wait for the payslip to render, then open print dialog
                                        setTimeout(() => {
                                            // Set up listener for when print dialog closes
                                            const handleAfterPrint = () => {
                                                window.removeEventListener('afterprint', handleAfterPrint);
                                                currentIndex++;
                                                // Small delay before showing next payslip
                                                setTimeout(printNext, 300);
                                            };

                                            window.addEventListener('afterprint', handleAfterPrint);
                                            window.print();
                                        }, 500);
                                    };

                                    printNext();
                                }}
                                className="flex items-center px-4 py-2 bg-white border border-gray-300 rounded-lg text-gray-700 text-sm hover:bg-gray-100"
                            >
                                <Icons.Printer className="w-4 h-4 mr-2" />
                                Print All
                            </button>
                        </div>
                    )}
                </div>

                <div className="divide-y divide-gray-100">
                    {currentRun?.lineItems.map((item, idx) => (
                        <div key={idx} className="px-6 py-4 flex items-center justify-between hover:bg-gray-50 transition-colors group">
                            <div className="flex items-center">
                                <div className="h-10 w-10 rounded-full bg-gray-100 flex items-center justify-center text-gray-600 font-bold text-sm mr-4">
                                    {item.employeeName.charAt(0)}
                                </div>
                                <div>
                                    <p className="font-bold text-gray-900 text-sm">{item.employeeName}</p>
                                    <p className="text-xs text-gray-500">{item.employeeId}</p>
                                </div>
                            </div>
                            <div className="flex items-center space-x-8">
                                <div className="text-right hidden sm:block">
                                    <p className="text-xs text-gray-400 uppercase font-bold">Net Pay</p>
                                    <p className="font-bold text-gray-900">${item.netPay.toLocaleString()}</p>
                                </div>
                                <button
                                    onClick={() => setViewingPayslip(item)}
                                    className="px-4 py-2 border border-gray-200 rounded-lg text-sm text-gray-600 hover:text-jam-orange hover:border-jam-orange hover:bg-orange-50 transition-all flex items-center"
                                >
                                    <Icons.Document className="w-3 h-3 mr-2" /> View Slip
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
                {/* Footer for List */}
                <div className="px-6 py-4 border-t border-gray-200 bg-gray-50 text-center">
                    <p className="text-xs text-gray-500">All records have been archived to Reports / Payroll Register.</p>
                </div>
            </div>

            {/* Date Range Selector Modal */}
            {isDateRangeSelectorOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
                    <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg overflow-hidden">
                        <div className="p-6 border-b border-gray-200 bg-gray-50 flex justify-between items-center">
                            <h3 className="text-lg font-bold text-gray-900">Select Pay Period Dates</h3>
                            <button
                                type="button"
                                onClick={() => setIsDateRangeSelectorOpen(false)}
                                className="text-gray-400 hover:text-gray-600"
                            >
                                ✕
                            </button>
                        </div>
                        <div className="p-6 space-y-4">
                            <div>
                                <label className="block text-sm font-semibold text-gray-700 mb-2">Start Date</label>
                                <input
                                    type="date"
                                    value={periodStartDate || ''}
                                    onChange={(e) => setPeriodStartDate(e.target.value || null)}
                                    className="w-full border border-gray-300 rounded-lg p-3 text-sm"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-semibold text-gray-700 mb-2">End Date</label>
                                <input
                                    type="date"
                                    value={periodEndDate || ''}
                                    onChange={(e) => setPeriodEndDate(e.target.value || null)}
                                    className="w-full border border-gray-300 rounded-lg p-3 text-sm"
                                />
                            </div>
                        </div>
                        <div className="border-t border-gray-200 px-6 py-4 bg-gray-50 flex justify-end space-x-3">
                            <button
                                type="button"
                                onClick={() => setIsDateRangeSelectorOpen(false)}
                                className="px-6 py-2 border border-gray-300 rounded-lg font-medium text-gray-700 hover:bg-gray-100"
                            >
                                Cancel
                            </button>
                            <button
                                type="button"
                                onClick={() => {
                                    if (periodStartDate && periodEndDate) {
                                        console.log('Applied dates:', {periodStartDate, periodEndDate});
                                        setIsDateRangeSelectorOpen(false);
                                    }
                                }}
                                disabled={!periodStartDate || !periodEndDate}
                                className="px-6 py-2 bg-jam-black text-white rounded-lg font-medium hover:bg-gray-900 disabled:opacity-50"
                            >
                                Apply Dates
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
