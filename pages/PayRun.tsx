import React, { useState, useMemo } from 'react';
import { Icons } from '../components/Icons';
import { Employee, WeeklyTimesheet, LeaveRequest, PayRun as PayRunType, CompanySettings, IntegrationConfig, PayFrequency, PayRunLineItem, StatutoryDeductions } from '../types';
import { usePayroll } from '../hooks/usePayroll';
import { generateNCBFile, generateBNSFile, generateGLCSV } from '../utils/exportHelpers';
import { auditService } from '../services/auditService';
import { emailService } from '../services/emailService';
import { PayslipView } from '../components/PayslipView';
import { toast } from 'sonner';
import { useAuth } from '../context/AuthContext';

interface PayRunProps {
    employees: Employee[];
    timesheets: WeeklyTimesheet[];
    leaveRequests: LeaveRequest[];
    onSave: (run: PayRunType) => void;
    companyData: CompanySettings;
    integrationConfig: IntegrationConfig;
    payRunHistory: PayRunType[];
}

// Extracted row component to isolate logic and avoid parser ambiguity
const PayRunRow = ({ 
    item, 
    updateLineItemGross, 
    openAdHocModal, 
    openTaxModal, 
    removeEmployeeFromRun 
}: { 
    item: PayRunLineItem, 
    updateLineItemGross: (id: string, val: string) => void,
    openAdHocModal: (id: string, type: 'ADDITIONS' | 'DEDUCTIONS') => void,
    openTaxModal: (item: PayRunLineItem) => void,
    removeEmployeeFromRun: (id: string) => void
}) => {
    // Pre-calculate booleans
    const hasAdditions = item.additions > 0;
    const hasDeductions = item.deductions > 0;
    const isManualTax = item.isTaxOverridden === true;

    return (
        <tr className="hover:bg-gray-50 group">
            <td className="px-6 py-4">
                <p className="font-bold text-gray-900 text-sm">{item.employeeName}</p>
                <p className="text-xs text-gray-400">{item.employeeId}</p>
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
            <td className="px-6 py-4 text-center">
                <div className="flex flex-col items-center">
                    {hasAdditions ? (
                        <div className="flex flex-col items-center">
                            <span className="text-green-600 font-bold text-sm mb-1">+${item.additions.toLocaleString()}</span>
                            <button onClick={() => openAdHocModal(item.employeeId, 'ADDITIONS')} className="text-xs text-gray-400 hover:text-jam-orange flex items-center">
                                <Icons.FileEdit className="w-3 h-3 mr-1" /> Adjust
                            </button>
                        </div>
                    ) : (
                        <button onClick={() => openAdHocModal(item.employeeId, 'ADDITIONS')} className="text-gray-400 hover:text-jam-orange text-sm flex items-center">
                            <Icons.Plus className="w-3 h-3 mr-1" /> Add
                        </button>
                    )}
                </div>
            </td>
            <td className="px-6 py-4 text-center">
                <div className="flex flex-col items-center">
                    {hasDeductions ? (
                        <div className="flex flex-col items-center">
                            <span className="text-red-600 font-bold text-sm mb-1">-${item.deductions.toLocaleString()}</span>
                            <button onClick={() => openAdHocModal(item.employeeId, 'DEDUCTIONS')} className="text-xs text-gray-400 hover:text-jam-orange flex items-center">
                                <Icons.FileEdit className="w-3 h-3 mr-1" /> Adjust
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
    payRunHistory
}) => {
    const { user: currentUser } = useAuth();
    const [step, setStep] = useState<'SETUP' | 'DRAFT' | 'APPROVE' | 'FINALIZE'>('SETUP');
    const [payCycle, setPayCycle] = useState<PayFrequency | 'ALL'>('ALL');
    const [payPeriod, setPayPeriod] = useState(new Date().toISOString().slice(0, 7)); // YYYY-MM
    
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
        nis: 0, nht: 0, edTax: 0, paye: 0, totalDeductions: 0, netPay: 0
    });

    // Loading States
    const [isCalculating, setIsCalculating] = useState(false);
    const [isFinalizing, setIsFinalizing] = useState(false);
    const [isEmailing, setIsEmailing] = useState(false);
    const [currentRun, setCurrentRun] = useState<PayRunType | null>(null);

    const { 
        draftItems, 
        totals, 
        initializeRun, 
        updateLineItemGross, 
        updateLineItemTaxes, 
        addAdHocItem, 
        addEmployeeToRun, 
        removeEmployeeFromRun, 
        clearDraft 
    } = usePayroll(employees, timesheets, leaveRequests, payRunHistory);

    const isSuspended = companyData.subscriptionStatus === 'SUSPENDED';

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
            const hasData = initializeRun(payCycle, payPeriod);
            if (hasData) {
                setStep('DRAFT');
                toast.success("Payroll calculated from system data (Cumulative YTD Applied)");
            } else {
                toast.error("No eligible employees found for this selection.");
            }
            setIsCalculating(false);
        }, 800);
    };

    const handleMoveToApproval = () => {
        setStep('APPROVE');
        toast.success("Pay run ready for approval");
    };

    const handleFinalize = async () => {
        setIsFinalizing(true);
        
        const newRun: PayRunType = {
            id: `RUN-${Date.now()}`,
            periodStart: payPeriod,
            periodEnd: payPeriod, 
            payDate: new Date().toISOString().split('T')[0],
            status: 'FINALIZED',
            totalGross: totals.gross,
            totalNet: totals.net,
            lineItems: draftItems
        };
        
        // Send emails to all employees
        setIsEmailing(true);
        try {
            for (const item of draftItems) {
                const emp = employees.find(e => e.id === item.employeeId);
                if (emp?.email) {
                    await emailService.sendPayslipNotification(
                        emp.email,
                        emp.firstName || 'Employee',
                        newRun.periodStart,
                        `$${item.netPay.toLocaleString()}`
                    );
                }
            }
            toast.success(`Payslips emailed to ${draftItems.length} employees!`);
        } catch (error) {
            console.error('Error sending payslips:', error);
            toast.error('Some emails failed to send. Check logs.');
        } finally {
            setIsEmailing(false);
        }

        onSave(newRun);
        auditService.log(currentUser, 'CREATE', 'PayRun', `Finalized payroll for ${payPeriod}`);
        setCurrentRun(newRun);

        setStep('FINALIZE');
        setIsFinalizing(false);
        toast.success("Payroll finalized successfully!");
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
        
        for (const line of currentRun.lineItems) {
            const emp = employees.find(e => e.id === line.employeeId);
            if (emp?.email) {
                await emailService.sendPayslipNotification(
                    emp.email, 
                    emp.firstName, 
                    currentRun.periodStart, 
                    `$${line.netPay.toLocaleString()}`
                );
                sentCount++;
            }
        }
        
        setIsEmailing(false);
        toast.success(`Notified ${sentCount} employees via email.`);
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
            <div className="max-w-xl mx-auto mt-10 animate-fade-in">
                <div className="bg-white p-8 rounded-xl shadow-xl border border-gray-100 text-center">
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
                        className={`w-full py-4 rounded-lg font-bold transition-all shadow-md flex justify-center items-center text-base ${
                            isSuspended || isCalculating
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
            </div>
        );
    }

    if (step === 'DRAFT' || step === 'APPROVE') {
        const isDraftMode = step === 'DRAFT';
        const isApproveMode = step === 'APPROVE';

        return (
            <div className="space-y-6 animate-fade-in relative">
                {/* Wizard Stepper */}
                <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                    <div className="flex items-center justify-between max-w-3xl mx-auto">
                        {/* Step 1: Draft */}
                        <div className="flex items-center flex-1">
                            <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm ${
                                isDraftMode ? 'bg-jam-orange text-jam-black' : 'bg-green-500 text-white'
                            }`}>
                                {isDraftMode ? '1' : <Icons.Check className="w-5 h-5" />}
                            </div>
                            <div className="ml-3">
                                <p className={`font-bold text-sm ${isDraftMode ? 'text-gray-900' : 'text-green-600'}`}>Draft</p>
                                <p className="text-xs text-gray-500">Edit pay amounts</p>
                            </div>
                        </div>
                        <div className={`flex-1 h-1 mx-4 ${isApproveMode ? 'bg-jam-orange' : 'bg-gray-200'}`}></div>
                        
                        {/* Step 2: Approve */}
                        <div className="flex items-center flex-1">
                            <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm ${
                                isApproveMode ? 'bg-jam-orange text-jam-black' : 'bg-gray-200 text-gray-500'
                            }`}>
                                2
                            </div>
                            <div className="ml-3">
                                <p className={`font-bold text-sm ${isApproveMode ? 'text-gray-900' : 'text-gray-500'}`}>Approve</p>
                                <p className="text-xs text-gray-500">Review totals</p>
                            </div>
                        </div>
                        <div className="flex-1 h-1 mx-4 bg-gray-200"></div>
                        
                        {/* Step 3: Finalize */}
                        <div className="flex items-center flex-1">
                            <div className="w-10 h-10 rounded-full bg-gray-200 text-gray-500 flex items-center justify-center font-bold text-sm">
                                3
                            </div>
                            <div className="ml-3">
                                <p className="font-bold text-sm text-gray-500">Finalize</p>
                                <p className="text-xs text-gray-500">Send & export</p>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Ad Hoc Modal */}
                {adHocModal.isOpen && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
                        <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm overflow-hidden animate-scale-in">
                            <div className="p-6 border-b border-gray-100 flex justify-between items-center">
                                <h3 className="font-bold text-gray-900">Add {adHocModal.type === 'ADDITIONS' ? 'Income' : 'Deduction'}</h3>
                                <button onClick={() => setAdHocModal({...adHocModal, isOpen: false})}><Icons.Close className="w-5 h-5 text-gray-400"/></button>
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
                                <button onClick={() => setTaxModalOpen(false)}><Icons.Close className="w-5 h-5 text-red-400"/></button>
                            </div>
                            <form onSubmit={submitTaxOverride} className="p-6 space-y-4">
                                <div className="bg-yellow-50 border border-yellow-200 rounded p-3 text-xs text-yellow-800 mb-4">
                                    <Icons.Alert className="w-3 h-3 inline mr-1" /> Editing these values stops automatic calculation.
                                </div>
                                <div className="grid grid-cols-2 gap-4">
                                    <div><label className="block text-xs font-bold text-gray-500 uppercase mb-1">PAYE</label><input type="number" className="w-full border border-gray-300 rounded p-2" value={taxOverrideForm.paye} onChange={e => setTaxOverrideForm({...taxOverrideForm, paye: parseFloat(e.target.value)})} /></div>
                                    <div><label className="block text-xs font-bold text-gray-500 uppercase mb-1">NIS</label><input type="number" className="w-full border border-gray-300 rounded p-2" value={taxOverrideForm.nis} onChange={e => setTaxOverrideForm({...taxOverrideForm, nis: parseFloat(e.target.value)})} /></div>
                                    <div><label className="block text-xs font-bold text-gray-500 uppercase mb-1">Ed Tax</label><input type="number" className="w-full border border-gray-300 rounded p-2" value={taxOverrideForm.edTax} onChange={e => setTaxOverrideForm({...taxOverrideForm, edTax: parseFloat(e.target.value)})} /></div>
                                    <div><label className="block text-xs font-bold text-gray-500 uppercase mb-1">NHT</label><input type="number" className="w-full border border-gray-300 rounded p-2" value={taxOverrideForm.nht} onChange={e => setTaxOverrideForm({...taxOverrideForm, nht: parseFloat(e.target.value)})} /></div>
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
                                <button onClick={() => setAddEmployeeModalOpen(false)}><Icons.Close className="w-5 h-5 text-gray-400"/></button>
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
                                {isDraftMode ? 'Draft Pay Run' : 'Approve Pay Run'}: {payPeriod}
                            </h2>
                        </div>
                        <div className="flex items-center space-x-2 text-sm">
                            <span className={`px-2 py-0.5 rounded font-bold uppercase text-xs ${
                                isDraftMode ? 'bg-jam-yellow/30 text-yellow-800' : 'bg-blue-50 text-blue-800'
                            }`}>
                                {isDraftMode ? 'Draft Mode' : 'Approval Mode'}
                            </span>
                            <span className="text-gray-500">
                                • {isDraftMode ? 'Edit amounts and add adjustments' : 'Review totals before finalizing'}
                            </span>
                        </div>
                    </div>
                    <div className="flex items-center space-x-3 mt-4 md:mt-0">
                        {isDraftMode && (
                            <button onClick={() => setAddEmployeeModalOpen(true)} className="bg-white border border-gray-300 text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-50 shadow-sm flex items-center text-sm font-medium">
                                <Icons.Plus className="w-4 h-4 mr-2" /> Add Employee
                            </button>
                        )}
                        <button onClick={() => { setStep('SETUP'); clearDraft(); }} className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg text-sm font-medium">
                            Cancel
                        </button>
                        {isDraftMode ? (
                            <button onClick={handleMoveToApproval} className="bg-jam-orange text-jam-black px-6 py-2 font-bold rounded-lg hover:bg-yellow-500 shadow-lg flex items-center text-sm">
                                <Icons.ChevronRight className="w-4 h-4 mr-1" /> Continue to Approve
                            </button>
                        ) : (
                            <>
                                <button onClick={() => setStep('DRAFT')} className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 text-sm font-medium flex items-center">
                                    <Icons.ChevronLeft className="w-4 h-4 mr-1" /> Back to Draft
                                </button>
                                <button onClick={handleFinalize} disabled={isFinalizing} className="bg-green-600 text-white px-6 py-2 font-bold rounded-lg hover:bg-green-700 shadow-lg flex items-center disabled:opacity-50 disabled:cursor-not-allowed text-sm">
                                    {isFinalizing ? (
                                        <span className="flex items-center"><Icons.Refresh className="w-4 h-4 mr-2 animate-spin"/> Finalizing...</span>
                                    ) : (
                                        <span className="flex items-center"><Icons.Check className="w-4 h-4 mr-2" /> Finalize & Send</span>
                                    )}
                                </button>
                            </>
                        )}
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
                    {isApproveMode && (
                        <div className="bg-blue-50 border-b border-blue-200 px-6 py-3 flex items-center">
                            <Icons.Eye className="w-4 h-4 text-blue-600 mr-2" />
                            <p className="text-sm text-blue-800 font-medium">Read-only mode: Review the pay run before finalizing. Go back to Draft to make changes.</p>
                        </div>
                    )}
                    <table className="w-full text-left border-collapse">
                        <thead className="bg-gray-50 border-b border-gray-200">
                            <tr>
                                <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase w-64">Employee</th>
                                <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase text-right w-40">Gross</th>
                                <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase text-center">Income / Bonus</th>
                                <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase text-center">Other Deductions</th>
                                <th className="px-6 py-4 text-xs font-bold text-red-500 uppercase text-right">Taxes</th>
                                <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase text-right">Net Pay</th>
                                {isDraftMode && <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase text-center">Action</th>}
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {draftItems.map(item => (
                                isDraftMode ? (
                                    <PayRunRow 
                                        key={item.employeeId} 
                                        item={item} 
                                        updateLineItemGross={updateLineItemGross}
                                        openAdHocModal={openAdHocModal}
                                        openTaxModal={openTaxModal}
                                        removeEmployeeFromRun={removeEmployeeFromRun}
                                    />
                                ) : (
                                    <tr key={item.employeeId} className="hover:bg-gray-50">
                                        <td className="px-6 py-4">
                                            <p className="font-bold text-gray-900 text-sm">{item.employeeName}</p>
                                            <p className="text-xs text-gray-400">{item.employeeId}</p>
                                        </td>
                                        <td className="px-6 py-4 text-right font-medium text-gray-900">${item.grossPay.toLocaleString()}</td>
                                        <td className="px-6 py-4 text-center">
                                            {item.additions > 0 && <span className="text-green-600 font-bold text-sm">+${item.additions.toLocaleString()}</span>}
                                            {item.additions === 0 && <span className="text-gray-400 text-sm">-</span>}
                                        </td>
                                        <td className="px-6 py-4 text-center">
                                            {item.deductions > 0 && <span className="text-red-600 font-bold text-sm">-${item.deductions.toLocaleString()}</span>}
                                            {item.deductions === 0 && <span className="text-gray-400 text-sm">-</span>}
                                        </td>
                                        <td className="px-6 py-4 text-right">
                                            <div className="text-xs text-gray-500 space-y-0.5">
                                                <div className="flex justify-end space-x-2"><span>PAYE:</span> <span className="font-medium text-gray-700">{item.paye.toLocaleString()}</span></div>
                                                <div className="flex justify-end space-x-2"><span>NIS:</span> <span className="font-medium text-gray-700">{item.nis.toLocaleString()}</span></div>
                                                <div className="flex justify-end space-x-2"><span>Ed:</span> <span className="font-medium text-gray-700">{item.edTax.toLocaleString()}</span></div>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 text-right">
                                            <p className="text-lg font-bold text-gray-900">${item.netPay.toLocaleString()}</p>
                                        </td>
                                    </tr>
                                )
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

            {/* Success Banner */}
            <div className="bg-green-50 border border-green-200 rounded-xl p-6 flex justify-between items-center mb-8 shadow-sm">
                <div className="flex items-center">
                    <div className="w-12 h-12 bg-green-100 text-green-600 rounded-full flex items-center justify-center mr-4">
                        <Icons.Check className="w-6 h-6" />
                    </div>
                    <div>
                        <h2 className="text-xl font-bold text-green-900">Pay Run Finalized Successfully!</h2>
                        <p className="text-green-700 text-sm">Payslips have been generated and saved to reports. You can now export bank files.</p>
                    </div>
                </div>
                <button 
                    onClick={() => { setStep('SETUP'); clearDraft(); }} 
                    className="bg-green-600 text-white px-6 py-2.5 rounded-lg hover:bg-green-700 shadow-md font-medium text-sm transition-colors"
                >
                    Start New Run
                </button>
            </div>
            
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
                        <button 
                            onClick={() => alert("All Payslips downloaded as ZIP.")}
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
                            onClick={() => window.print()}
                            className="flex items-center px-4 py-2 bg-white border border-gray-300 rounded-lg text-gray-700 text-sm hover:bg-gray-100"
                        >
                            <Icons.Printer className="w-4 h-4 mr-2" />
                            Print All
                        </button>
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