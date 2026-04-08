import React from 'react';
import { Icons } from '../../../components/Icons';
import { PayRun as PayRunType } from '../../../core/types';

interface BankTotals {
    ncb: number;
    bns: number;
    other: number;
}

interface PayRunFinalizeStepProps {
    currentRun: PayRunType | null;
    isPayRunConfirmed: boolean;
    isFinalizing: boolean;
    isEmailing: boolean;
    bankTotals: BankTotals;
    integrationProvider: string;
    ncbCardClass: string;
    bnsCardClass: string;
    showNcbCard: boolean;
    showBnsCard: boolean;
    showOtherCard: boolean;
    onBackToEdit: () => void;
    onConfirmFinalize: () => void;
    onStartNewRun: () => void;
    onDownloadBankFile: (type: 'NCB' | 'BNS') => void;
    onDownloadGL: () => void;
    onDownloadAllPayslips: () => void;
    onEmailPayslips: () => void;
    onPrintAllPayslips: () => void;
    onViewPayslip: (employeeIndex: number) => void;
}

export const PayRunFinalizeStep: React.FC<PayRunFinalizeStepProps> = ({
    currentRun,
    isPayRunConfirmed,
    isFinalizing,
    isEmailing,
    bankTotals,
    integrationProvider,
    ncbCardClass,
    bnsCardClass,
    showNcbCard,
    showBnsCard,
    showOtherCard,
    onBackToEdit,
    onConfirmFinalize,
    onStartNewRun,
    onDownloadBankFile,
    onDownloadGL,
    onDownloadAllPayslips,
    onEmailPayslips,
    onPrintAllPayslips,
    onViewPayslip
}) => {
    return (
        <div className="animate-fade-in relative pb-12">
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
                            onClick={onBackToEdit}
                            className="bg-white border border-gray-300 text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-50 shadow-sm flex items-center text-sm font-medium"
                        >
                            <Icons.ArrowLeft className="w-4 h-4 mr-2" /> Back to Edit
                        </button>
                        <button
                            onClick={onConfirmFinalize}
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
                            onClick={onStartNewRun}
                            className="bg-green-600 text-white px-6 py-2.5 rounded-lg hover:bg-green-700 shadow-md font-medium text-sm transition-colors"
                        >
                            Start New Run
                        </button>
                    </div>
                </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
                <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
                    <div className="flex items-center mb-4">
                        <Icons.Bank className="w-5 h-5 mr-2 text-jam-black" />
                        <h3 className="font-bold text-gray-900">Bank File Generation</h3>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
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
                                onClick={() => onDownloadBankFile('NCB')}
                                disabled={!showNcbCard || !isPayRunConfirmed}
                                className="w-full py-1.5 bg-gray-50 hover:bg-gray-100 border border-gray-200 rounded text-xs font-medium text-gray-700 disabled:cursor-not-allowed disabled:bg-gray-50 disabled:opacity-50"
                            >
                                Download File
                            </button>
                        </div>

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
                                onClick={() => onDownloadBankFile('BNS')}
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

                <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
                    <div className="flex items-center mb-4">
                        <Icons.FileSpreadsheet className="w-5 h-5 mr-2 text-jam-black" />
                        <h3 className="font-bold text-gray-900">Accounting</h3>
                    </div>
                    <div className="bg-blue-50 border border-blue-100 rounded-lg p-4">
                        <div className="flex justify-between items-center mb-2">
                            <span className="font-bold text-sm text-blue-900">Journal Entry</span>
                            <span className="text-xs bg-white text-blue-600 px-2 py-0.5 rounded border border-blue-200">
                                {integrationProvider}
                            </span>
                        </div>
                        <p className="text-xs text-blue-700 mb-4">Post payroll costs to your GL automatically.</p>
                        <button
                            onClick={onDownloadGL}
                            disabled={!isPayRunConfirmed}
                            className="w-full py-2 bg-white border border-blue-200 text-blue-700 rounded font-medium text-sm hover:bg-blue-50 flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            <Icons.Link className="w-3 h-3 mr-2" /> Sync to GL
                        </button>
                    </div>
                </div>
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                <div className="px-6 py-4 border-b border-gray-200 bg-gray-50 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <h3 className="font-bold text-gray-900">{isPayRunConfirmed ? 'Generated Payslips' : 'Payslips Preview'}</h3>
                    {isPayRunConfirmed && (
                        <div className="flex space-x-3">
                            <button
                                onClick={onDownloadAllPayslips}
                                className="flex items-center px-4 py-2 bg-white border border-gray-300 rounded-lg text-gray-700 text-sm hover:bg-gray-100"
                            >
                                <Icons.Download className="w-4 h-4 mr-2" />
                                Download All
                            </button>
                            <button
                                onClick={onEmailPayslips}
                                disabled={isEmailing}
                                className="flex items-center px-4 py-2 bg-white border border-gray-300 rounded-lg text-gray-700 text-sm hover:bg-gray-100 disabled:opacity-50"
                            >
                                <Icons.Mail className="w-4 h-4 mr-2" />
                                {isEmailing ? 'Sending...' : 'Email All'}
                            </button>
                            <button
                                onClick={onPrintAllPayslips}
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
                                    onClick={() => onViewPayslip(idx)}
                                    className="px-4 py-2 border border-gray-200 rounded-lg text-sm text-gray-600 hover:text-jam-orange hover:border-jam-orange hover:bg-orange-50 transition-all flex items-center"
                                >
                                    <Icons.Document className="w-3 h-3 mr-2" /> View Slip
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
                <div className="px-6 py-4 border-t border-gray-200 bg-gray-50 text-center">
                    <p className="text-xs text-gray-500">All records have been archived to Reports / Payroll Register.</p>
                </div>
            </div>
        </div>
    );
};