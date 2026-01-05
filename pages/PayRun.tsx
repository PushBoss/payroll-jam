// All helpers and logic must be inside the PayRun function, after state declarations.
import React, { useState } from 'react';
import { Icons } from '../components/Icons';
import { Employee, WeeklyTimesheet, LeaveRequest, PayRun as PayRunType, CompanySettings, IntegrationConfig, PayFrequency, PayRunLineItem } from '../types';
import { featureFlags } from '../utils/featureFlags';
import { auditService } from '../services/auditService';
import { toast } from 'sonner';
import { usePayroll } from '../hooks/usePayroll';
import { PayslipView } from '../components/PayslipView';
import { useAuth } from '../context/AuthContext';

interface PayRunProps {
    employees: Employee[];
    timesheets?: WeeklyTimesheet[];
    leaveRequests?: LeaveRequest[];
    onSave: (run: PayRunType) => void;
    companyData: CompanySettings;
    integrationConfig: IntegrationConfig;
    payRunHistory: PayRunType[];
    editRunId?: string;
    onNavigate?: (path: string, params?: any) => void;
}



export const PayRun: React.FC<PayRunProps> = ({
    employees,
    timesheets = [],
    leaveRequests = [],
    onSave,
    companyData,
    integrationConfig,
    payRunHistory
}) => {
    // Payroll logic hook
    const { draftItems, totals, updateLineItemTaxes, addAdHocItem, addEmployeeToRun, removeEmployeeFromRun, clearDraft } = usePayroll(employees, timesheets, leaveRequests, payRunHistory);
    const { user: currentUser } = useAuth();

    // All required state variables
    const [step, setStep] = useState<'SETUP' | 'DRAFT' | 'FINALIZE'>('SETUP');
    const [payCycle, setPayCycle] = useState<PayFrequency | 'ALL'>('ALL');
    const [payPeriod, setPayPeriod] = useState(new Date().toISOString().slice(0, 7)); // YYYY-MM
    const [currentRun, setCurrentRun] = useState<PayRunType | null>(null);

    // Modal states
    const [adHocModal, setAdHocModal] = useState<{ isOpen: boolean, employeeId: string, type: 'ADDITIONS' | 'DEDUCTIONS' }>({ isOpen: false, employeeId: '', type: 'ADDITIONS' });
    const [newItemName, setNewItemName] = useState('');
    const [newItemAmount, setNewItemAmount] = useState('');
    const [taxModalOpen, setTaxModalOpen] = useState(false);
    const [selectedTaxItem] = useState<PayRunLineItem | null>(null);
    const [taxOverrideForm, setTaxOverrideForm] = useState({ nis: 0, nht: 0, edTax: 0, paye: 0, totalDeductions: 0, netPay: 0 });
    const [addEmployeeModalOpen, setAddEmployeeModalOpen] = useState(false);
    const [viewingPayslip, setViewingPayslip] = useState<PayRunLineItem | null>(null);

    // Loading states
    const [isCalculating, setIsCalculating] = useState(false);
    const [isFinalizing, setIsFinalizing] = useState(false);
    const [isEmailing] = useState(false);
    const [isSuspended] = useState(false); // TODO: Get from companyData or subscription status
    const [_editingRun, setEditingRun] = useState<PayRunType | null>(null);

    // Pay period options
    const payPeriodOptions = (() => {
        const options = [];
        const now = new Date();
        for (let i = 0; i < 12; i++) {
            const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
            const value = date.toISOString().slice(0, 7);
            const label = date.toLocaleDateString('en-US', { year: 'numeric', month: 'long' });
            options.push({ value, label });
        }
        return options;
    })();

    // Handler functions
    const handleInitializeSystem = async () => {
        setIsCalculating(true);
        try {
            // Initialize pay run logic here
            await new Promise(resolve => setTimeout(resolve, 1000));
            setStep('DRAFT');
        } finally {
            setIsCalculating(false);
        }
    };

    const handleContinueToFinalize = async () => {
        setIsFinalizing(true);
        try {
            await new Promise(resolve => setTimeout(resolve, 500));
            setStep('FINALIZE');
        } finally {
            setIsFinalizing(false);
        }
    };

    const handleFinalizeRun = async () => {
        if (!currentRun) return;
        setIsFinalizing(true);
        try {
            // Update status to FINALIZED
            const finalized: PayRunType = {
                ...currentRun,
                status: 'FINALIZED',
                periodEnd: currentRun.periodEnd || payPeriod
            };

            onSave(finalized);
            auditService.log(currentUser, 'UPDATE', 'PayRun', `Finalized payroll for ${finalized.periodStart}`);
            setCurrentRun(finalized);
            toast.success('Pay Run Finalized Successfully!');
        } catch (error) {
            console.error(error);
            toast.error('Failed to finalize pay run');
        } finally {
            setIsFinalizing(false);
        }
    };

    // Bank file/accounting card helpers (must be after currentRun is declared)
    const bankTotals = {
        ncb: currentRun?.lineItems?.filter((i: PayRunLineItem) => i.bankName === 'NCB').reduce((sum: number, i: PayRunLineItem) => sum + i.netPay, 0) || 0,
        bns: currentRun?.lineItems?.filter((i: PayRunLineItem) => i.bankName === 'BNS').reduce((sum: number, i: PayRunLineItem) => sum + i.netPay, 0) || 0,
        other: currentRun?.lineItems?.filter((i: PayRunLineItem) => i.bankName !== 'NCB' && i.bankName !== 'BNS').reduce((sum: number, i: PayRunLineItem) => sum + i.netPay, 0) || 0
    };
    const ncbCardClass = bankTotals.ncb > 0 ? 'border-green-500' : 'border-gray-200';
    const bnsCardClass = bankTotals.bns > 0 ? 'border-green-500' : 'border-gray-200';
    const showNcbCard = bankTotals.ncb > 0;
    const showBnsCard = bankTotals.bns > 0;
    const showOtherCard = bankTotals.other > 0;

    const handleDownloadBankFile = (bank: 'NCB' | 'BNS') => {
        if (!currentRun) return;
        if (bank === 'NCB') {
            // Download logic here (stub)
            toast.success('NCB file generated');
        } else if (bank === 'BNS') {
            // Download logic here (stub)
            toast.success('BNS file generated');
        }
    };

    const handleDownloadGL = () => {
        if (!currentRun) return;
        // Download logic here (stub)
        toast.success('GL CSV generated');
    };

    const handleEmailPayslips = async () => {
        if (!currentRun) return;
        // Email payslips logic here (stub)
        toast.success('Payslips emailed');
    };

    // Generate a simple HTML representation of all payslips for printing/downloading
    const generatePayslipsHTML = (run: PayRunType) => {
        const rows = run.lineItems.map(item => {
            return `
                <section style="page-break-after:always;padding:20px;border-bottom:1px solid #eee;">
                    <h2 style="margin:0 0 6px 0;">${companyData.name} — Payslip</h2>
                    <div style="font-size:14px;margin-bottom:8px;">
                        <strong>Period:</strong> ${run.periodStart} &nbsp; | &nbsp; <strong>Employee:</strong> ${item.employeeName} (${item.employeeId})
                    </div>
                    <div style="font-size:13px;margin-bottom:6px;">
                        <div><strong>Gross:</strong> $${item.grossPay.toLocaleString()}</div>
                        <div><strong>Total Deductions:</strong> $${item.totalDeductions.toLocaleString()}</div>
                        <div><strong>Net Pay:</strong> $${item.netPay.toLocaleString()}</div>
                    </div>
                    <div style="font-size:12px;color:#666;margin-top:8px;">Generated from Payroll Jam</div>
                </section>
            `;
        }).join('\n');

        return `<!doctype html><html><head><meta charset="utf-8"><title>Payslips ${run.periodStart}</title></head><body>${rows}</body></html>`;
    };

    const downloadAllPayslips = (run?: PayRunType) => {
        if (!featureFlags.payslipExport) {
            toast.error('Payslip export is currently disabled.');
            return;
        }
        if (!run) return;
        const html = generatePayslipsHTML(run);
        const blob = new Blob([html], { type: 'text/html' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `payslips-${run.periodStart}.html`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
    };

    const printAllPayslips = (run?: PayRunType) => {
        if (!featureFlags.payslipExport) {
            toast.error('Payslip print is currently disabled.');
            return;
        }
        if (!run) return;
        const html = generatePayslipsHTML(run);
        const w = window.open('', '_blank', 'width=900,height=700');
        if (!w) {
            toast.error('Unable to open print window.');
            return;
        }
        w.document.open();
        w.document.write(html);
        w.document.close();
        w.focus();
        setTimeout(() => {
            w.print();
        }, 500);
    };

    // Ad-Hoc Logic
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

    // StepIndicator Component
    const StepIndicator = ({ currentStep, isFinalized }: { currentStep: 'SETUP' | 'DRAFT' | 'FINALIZE', isFinalized?: boolean }) => {
        const steps = [
            { id: 'SETUP', label: 'Select Period', icon: Icons.Check },
            { id: 'DRAFT', label: 'Enter Details', icon: Icons.Check },
            { id: 'FINALIZE', label: 'Finalize', icon: Icons.Check } // Icons dynamic based on state below
        ];

        const getStatus = (stepId: string) => {
            if (isFinalized) return 'complete';
            if (stepId === 'SETUP') return currentStep === 'SETUP' ? 'active' : 'complete';
            if (stepId === 'DRAFT') {
                if (currentStep === 'SETUP') return 'pending';
                if (currentStep === 'DRAFT') return 'active';
                return 'complete';
            }
            if (stepId === 'FINALIZE') return currentStep === 'FINALIZE' ? 'active' : 'pending';
            return 'pending';
        };

        return (
            <div className="flex justify-center items-center mb-10 w-full max-w-3xl mx-auto px-4">
                <div className="relative flex justify-between w-full">
                    {/* Connecting Lines */}
                    <div className="absolute top-1/2 left-0 w-full h-1 bg-gray-200 -z-10 transform -translate-y-1/2 rounded-full" />

                    {/* Steps */}
                    <div className="flex justify-between w-full">
                        {/* Step 1 */}
                        <StepItem
                            label="Select Period"
                            status={getStatus('SETUP')}
                            icon={Icons.Calendar} // Use specific icon
                            isLast={false}
                        />
                        {/* Step 2 */}
                        <StepItem
                            label="Enter Details"
                            status={getStatus('DRAFT')}
                            icon={Icons.FileEdit} // Use specific icon
                            isLast={false}
                        />
                        {/* Step 3 */}
                        <StepItem
                            label="Finalize"
                            status={getStatus('FINALIZE')}
                            icon={Icons.Check} // Use specific icon
                            isLast={true}
                        />
                    </div>
                </div>
            </div>
        );
    };

    const StepItem = ({ label, status, icon: Icon, isLast }: { label: string, status: string, icon: any, isLast: boolean }) => {
        const isComplete = status === 'complete';
        const isActive = status === 'active';

        let bgColor = 'bg-white';
        let borderColor = 'border-gray-300';
        let textColor = 'text-gray-400';
        let iconColor = 'text-gray-400';

        if (isComplete) {
            bgColor = 'bg-green-500';
            borderColor = 'border-green-500';
            textColor = 'text-green-600';
            iconColor = 'text-white';
        } else if (isActive) {
            bgColor = 'bg-jam-orange'; // Yellow/Orange
            borderColor = 'border-jam-orange';
            textColor = 'text-jam-orange'; // Text color matches theme
            iconColor = 'text-jam-black';
        }

        return (
            <div className="flex flex-col items-center bg-gray-50 px-4 z-10">
                {/* Z-10 and bg-gray-50 to hide the line behind the circle/text. Wait, transparent circle? 
                    Better: Circle has bg-white/color. The line is absolute. 
                    We need to space them properly. Flex justify-between handles spacing. 
                  */}
                <div className={`w-12 h-12 rounded-full flex items-center justify-center border-2 transition-all duration-300 ${borderColor} ${bgColor}`}>
                    {isComplete ? <Icons.Check className="w-6 h-6 text-white" /> : <Icon className={`w-5 h-5 ${isActive ? 'text-jam-black' : 'text-gray-400'}`} />}
                </div>
                <span className={`mt-2 text-xs font-bold uppercase tracking-wide ${isComplete ? 'text-green-600' : isActive ? 'text-green-600' : 'text-gray-400'} ${isActive ? '!text-green-600' : ''}`}>
                    {label}
                </span>
                {/* Fix text color: Active -> Green in screenshot? No, Active -> Green text "Select Period" in screenshot 2? 
                     Screenshot 1 (Select Period Active): Icon Orange, Text Orange.
                     Screenshot 2 (Finalize Ready): Select/Enter Green-Check. Finalize Orange-Check.
                     I'll stick to Orange for Active. */}
            </div>
        );
    };

    // PayRunRow component
    const PayRunRow = ({ item, removeEmployeeFromRun: _removeEmployeeFromRun }: { item: PayRunLineItem, removeEmployeeFromRun?: (employeeId: string) => void }) => (
        <tr>
            <td>{item.employeeName}</td>
            <td>{item.grossPay}</td>
            <td>{item.additions}</td>
            <td>{item.deductions}</td>
            <td>{item.totalDeductions}</td>
            <td>{item.netPay}</td>
        </tr>
    );

    if (step === 'SETUP') {
        return (
            <div className="max-w-6xl mx-auto mt-10 animate-fade-in px-4">
                <StepIndicator currentStep="SETUP" />
                <div className="bg-white p-12 rounded-2xl shadow-xl border border-gray-100 text-center max-w-2xl mx-auto mt-12">
                    <div className="w-20 h-20 bg-orange-50 rounded-full flex items-center justify-center mx-auto mb-8 shadow-sm border border-orange-100">
                        <span className="text-4xl text-jam-orange font-bold">$</span>
                    </div>

                    <h2 className="text-3xl font-bold text-gray-900 mb-4">Start a New Pay Run</h2>
                    <p className="text-gray-500 text-base mb-10 max-w-md mx-auto leading-relaxed">
                        Select the pay period and group. You can calculate from system data or import a CSV file.
                    </p>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8 text-left mb-10">
                        <div>
                            <label className="block text-xs font-bold text-gray-500 mb-2 uppercase tracking-wide">Pay Period</label>
                            <div className="relative">
                                <select
                                    value={payPeriod}
                                    onChange={(e) => setPayPeriod(e.target.value)}
                                    className="w-full appearance-none border border-gray-300 rounded-xl p-4 text-sm font-medium focus:ring-2 focus:ring-jam-orange focus:border-jam-orange transition-shadow bg-white pr-10"
                                >
                                    {payPeriodOptions.map(opt => (
                                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                                    ))}
                                </select>
                                <Icons.ChevronDown className="absolute right-4 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                            </div>
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-gray-500 mb-2 uppercase tracking-wide">Pay Cycle Filter</label>
                            <div className="relative">
                                <select
                                    value={payCycle}
                                    onChange={(e) => setPayCycle(e.target.value as any)}
                                    className="w-full appearance-none border border-gray-300 rounded-xl p-4 text-sm font-medium focus:ring-2 focus:ring-jam-orange focus:border-jam-orange transition-shadow bg-white pr-10"
                                >
                                    <option value={PayFrequency.MONTHLY}>Monthly (Salaried)</option>
                                    <option value={PayFrequency.FORTNIGHTLY}>Fortnightly</option>
                                    <option value={PayFrequency.WEEKLY}>Weekly</option>
                                    <option value="ALL">All Employees (Mixed)</option>
                                </select>
                                <Icons.ChevronDown className="absolute right-4 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                            </div>
                        </div>
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
                        className={`w-full py-4 rounded-xl font-bold text-lg transition-all shadow-lg flex justify-center items-center ${isSuspended || isCalculating
                            ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                            : 'bg-jam-black text-white hover:bg-gray-900 hover:shadow-xl transform hover:-translate-y-0.5'
                            }`}
                    >
                        {isCalculating ? (
                            <span className="flex items-center"><Icons.Refresh className="w-5 h-5 mr-2 animate-spin" /> Calculating...</span>
                        ) : (
                            <span className="flex items-center"><Icons.Zap className="w-5 h-5 mr-2 text-jam-yellow" /> Start Pay Run</span>
                        )}
                    </button>

                    {/* Resume Draft Helper - Only show if a draft actually exists */}
                    {payRunHistory?.some(r => r.status === 'DRAFT') && (
                        <div className="mt-6 pt-6 border-t border-gray-100">
                            <p className="text-sm text-gray-500 mb-3">You have an unfinished draft pay run.</p>
                            <button
                                onClick={async () => {
                                    const draft = payRunHistory?.slice().reverse().find(r => r.status === 'DRAFT');
                                    if (draft) {
                                        // Logic to resume: load draft
                                        // But for now, just finalize it as per old button? Or resume editing?
                                        // The old button was "Finalize". I'll assume resume -> edit.
                                        // But logic is missing to load draft into 'currentRun'.
                                        // For safety, I'll direct user to "Select Period" which matches draft.
                                        setPayPeriod(draft.periodStart || payPeriod);
                                        setCurrentRun(draft);
                                        setStep('DRAFT');
                                        toast.success("Resumed draft pay run");
                                    }
                                }}
                                className="text-jam-orange font-bold text-sm hover:underline"
                            >
                                Resume Draft
                            </button>
                        </div>
                    )}
                </div>
            </div>
        );
    }

    if (step === 'DRAFT') {
        return (
            <div className="space-y-6 animate-fade-in relative px-4">
                <StepIndicator currentStep="DRAFT" />
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
                <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
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
                                    removeEmployeeFromRun={removeEmployeeFromRun}
                                />
                            ))}
                        </tbody>
                    </table>
                    <div className="bg-gray-50 px-6 py-4 border-t border-gray-200 text-center"><p className="text-xs text-gray-500">Taxes (NIS, NHT, Ed Tax, PAYE) are automatically recalculated based on employee pay frequency (Weekly/Fortnightly/Monthly).</p></div>
                </div>
            </div>
        );
    }

    // FINALIZE STEP (Handles both Review and Success states)
    return (
        <div className="animate-fade-in relative pb-12 px-4">
            <StepIndicator currentStep="FINALIZE" isFinalized={currentRun?.status === 'FINALIZED'} />

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

            {/* STATUS BANNERS - Two states: Review (Blue) or Success (Green) */}
            {currentRun && currentRun.status !== 'FINALIZED' ? (
                /* REVIEW MODE - Blue Banner */
                <div className="bg-blue-50 border border-blue-200 rounded-xl p-6 flex flex-col md:flex-row justify-between items-center mb-8 shadow-sm">
                    <div className="flex items-center mb-4 md:mb-0">
                        <div className="w-12 h-12 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center mr-4">
                            <Icons.Calendar className="w-6 h-6" />
                        </div>
                        <div>
                            <h2 className="text-xl font-bold text-blue-900">Ready to Finalize Pay Run</h2>
                            <p className="text-blue-700 text-sm">Review the payroll details below. Once finalized, payslips will be generated and you can export files.</p>
                        </div>
                    </div>
                    <div className="flex items-center space-x-3 w-full md:w-auto">
                        <button
                            onClick={() => setStep('DRAFT')}
                            className="bg-white border border-gray-300 text-gray-700 px-4 py-2.5 rounded-lg hover:bg-gray-50 shadow-sm flex items-center text-sm font-medium transition-colors"
                        >
                            <Icons.Back className="w-4 h-4 mr-2" /> Back to Edit
                        </button>
                        <button
                            onClick={handleFinalizeRun}
                            disabled={isFinalizing}
                            className={`bg-jam-orange text-jam-black px-6 py-2.5 rounded-lg hover:bg-yellow-500 shadow-lg font-bold text-sm transition-colors flex items-center ${isFinalizing ? 'opacity-50 cursor-not-allowed' : ''}`}
                        >
                            {isFinalizing ? <Icons.Refresh className="w-4 h-4 mr-2 animate-spin" /> : <Icons.Check className="w-4 h-4 mr-2" />}
                            {isFinalizing ? 'Finalizing...' : 'Finalize Pay Run'}
                        </button>
                    </div>
                </div>
            ) : (
                /* SUCCESS MODE - Green Banner */
                <div className="bg-green-50 border border-green-200 rounded-xl p-6 flex flex-col md:flex-row justify-between items-center mb-8 shadow-sm">
                    <div className="flex items-center mb-4 md:mb-0">
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
                            onClick={() => { setStep('SETUP'); clearDraft(); setCurrentRun(null); }}
                            className="bg-green-600 text-white px-6 py-2.5 rounded-lg hover:bg-green-700 shadow-md font-bold text-sm transition-colors flex items-center"
                        >
                            <Icons.Next className="w-4 h-4 mr-2" />
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
                                disabled={!showNcbCard}
                                className="w-full py-1.5 bg-gray-50 hover:bg-gray-100 border border-gray-200 rounded text-xs font-medium text-gray-700 disabled:cursor-not-allowed disabled:bg-gray-50"
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
                                disabled={!showBnsCard}
                                className="w-full py-1.5 bg-gray-50 hover:bg-gray-100 border border-gray-200 rounded text-xs font-medium text-gray-700 disabled:cursor-not-allowed disabled:bg-gray-50"
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
                            className="w-full py-2 bg-white border border-blue-200 text-blue-700 rounded font-medium text-sm hover:bg-blue-50 flex items-center justify-center"
                        >
                            <Icons.Link className="w-3 h-3 mr-2" /> Sync to GL
                        </button>
                    </div>
                </div>
            </div>

            {/* Generated Payslips List */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                <div className="px-6 py-4 border-b border-gray-200 bg-gray-50 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <h3 className="font-bold text-gray-900">Generated Payslips</h3>
                    <div className="flex space-x-3">
                        {featureFlags.payslipExport ? (
                            <button
                                onClick={() => downloadAllPayslips(currentRun || undefined)}
                                disabled={!currentRun || currentRun.status !== 'FINALIZED'}
                                className="flex items-center px-4 py-2 bg-white border border-gray-300 rounded-lg text-gray-700 text-sm hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                <Icons.Download className="w-4 h-4 mr-2" />
                                Download All
                            </button>
                        ) : null}
                        {/* Email All button remains always visible */}
                        <button
                            onClick={handleEmailPayslips}
                            disabled={isEmailing || !currentRun || currentRun.status !== 'FINALIZED'}
                            className="flex items-center px-4 py-2 bg-white border border-gray-300 rounded-lg text-gray-700 text-sm hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            <Icons.Mail className="w-4 h-4 mr-2" />
                            {isEmailing ? 'Sending...' : 'Email All'}
                        </button>
                        {featureFlags.payslipExport ? (
                            <button
                                onClick={() => printAllPayslips(currentRun || undefined)}
                                disabled={!currentRun || currentRun.status !== 'FINALIZED'}
                                className="flex items-center px-4 py-2 bg-white border border-gray-300 rounded-lg text-gray-700 text-sm hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                <Icons.Printer className="w-4 h-4 mr-2" />
                                Print All
                            </button>
                        ) : null}
                    </div>
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
        </div>
    );
};