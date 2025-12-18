
import React, { useEffect } from 'react';
import { PayRunLineItem } from '../types';
import { Icons } from './Icons';

interface PayslipDocumentProps {
  data: PayRunLineItem;
  companyName: string;
  payPeriod: string;
  payDate: string;
}

export const PayslipDocument: React.FC<PayslipDocumentProps> = ({ data, companyName, payPeriod, payDate }) => {
  // Mock YTD Calculations (In a real app, this comes from the backend)
  const mockYTD = {
    gross: data.grossPay * 4,
    tax: data.paye * 4,
    nis: data.nis * 4,
    nht: data.nht * 4,
    edTax: data.edTax * 4,
    net: data.netPay * 4
  };

  return (
    <div className="bg-white p-8 print:p-0 max-w-3xl mx-auto">
          {/* Header */}
          <div className="flex justify-between items-start border-b-2 border-gray-800 pb-6 mb-6">
            <div>
              <h1 className="text-2xl font-bold text-gray-900 uppercase tracking-wide">{companyName}</h1>
              <p className="text-sm text-gray-500 mt-1">123 Knutsford Blvd, Kingston 5</p>
              <p className="text-sm text-gray-500">Jamaica, W.I.</p>
            </div>
            <div className="text-right">
              <div className="bg-gray-100 px-4 py-2 rounded-lg print:bg-transparent print:border print:border-gray-200">
                <p className="text-xs text-gray-500 uppercase font-bold">Pay Date</p>
                <p className="text-lg font-bold text-gray-900">{payDate}</p>
              </div>
              <p className="text-sm text-gray-500 mt-2">Period: {payPeriod}</p>
            </div>
          </div>

          {/* Employee Info */}
          <div className="grid grid-cols-2 gap-8 mb-8 bg-gray-50 p-4 rounded-lg border border-gray-100 print:bg-transparent print:border-gray-300">
            <div>
              <p className="text-xs text-gray-500 uppercase">Employee Name</p>
              <p className="font-bold text-gray-900 text-lg">{data.employeeName}</p>
              {data.employeeCustomId && (
                <>
                  <p className="text-xs text-gray-500 uppercase mt-2">Employee ID</p>
                  <p className="text-sm text-gray-600 font-medium">{data.employeeCustomId}</p>
                </>
              )}
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-xs text-gray-500 uppercase">TRN</p>
                <p className="font-semibold text-gray-900">123-456-789</p>
              </div>
              <div>
                <p className="text-xs text-gray-500 uppercase">NIS</p>
                <p className="font-semibold text-gray-900">A123456</p>
              </div>
              <div>
                <p className="text-xs text-gray-500 uppercase">Department</p>
                <p className="font-semibold text-gray-900">General</p>
              </div>
              <div>
                <p className="text-xs text-gray-500 uppercase">Pay Cycle</p>
                <p className="font-semibold text-gray-900">Monthly</p>
              </div>
            </div>
          </div>

          {/* Financials Grid */}
          <div className="grid grid-cols-2 gap-0 border border-gray-200 rounded-lg overflow-hidden mb-8">
            {/* Earnings */}
            <div className="border-r border-gray-200">
              <div className="bg-gray-100 px-4 py-2 border-b border-gray-200 print:bg-gray-50">
                <h4 className="font-bold text-gray-700 text-sm uppercase">Earnings</h4>
              </div>
              <div className="p-4 space-y-3 min-h-[200px]">
                <div className="flex justify-between">
                  <span className="text-sm text-gray-600">Basic Salary</span>
                  <span className="text-sm font-medium text-gray-900">${data.grossPay.toLocaleString(undefined, {minimumFractionDigits: 2})}</span>
                </div>
                
                {/* Detailed Additions */}
                {data.additionsBreakdown && data.additionsBreakdown.length > 0 ? (
                   data.additionsBreakdown.map((item, i) => (
                    <div key={i} className="flex justify-between">
                      <span className="text-sm text-gray-600">{item.name}</span>
                      <span className="text-sm font-medium text-gray-900">${item.amount.toLocaleString(undefined, {minimumFractionDigits: 2})}</span>
                    </div>
                   ))
                ) : data.additions > 0 && (
                   <div className="flex justify-between">
                    <span className="text-sm text-gray-600">Bonus / Commission</span>
                    <span className="text-sm font-medium text-gray-900">${data.additions.toLocaleString(undefined, {minimumFractionDigits: 2})}</span>
                  </div>
                )}
                
                 <div className="flex justify-between text-gray-400 italic text-sm pt-2">
                  <span>Taxable Allowances</span>
                  <span>$0.00</span>
                </div>
              </div>
              <div className="bg-gray-50 px-4 py-3 border-t border-gray-200 flex justify-between items-center print:bg-gray-100">
                <span className="font-bold text-gray-700 text-sm">Total Gross Pay</span>
                <span className="font-bold text-gray-900">${(data.grossPay + data.additions).toLocaleString(undefined, {minimumFractionDigits: 2})}</span>
              </div>
            </div>

            {/* Deductions */}
            <div>
              <div className="bg-gray-100 px-4 py-2 border-b border-gray-200 print:bg-gray-50">
                <h4 className="font-bold text-gray-700 text-sm uppercase">Deductions</h4>
              </div>
              <div className="p-4 space-y-3 min-h-[200px]">
                 <div className="flex justify-between">
                  <span className="text-sm text-gray-600">NIS (3%)</span>
                  <span className="text-sm font-medium text-red-600">-${data.nis.toLocaleString(undefined, {minimumFractionDigits: 2})}</span>
                </div>
                 <div className="flex justify-between">
                  <span className="text-sm text-gray-600">NHT (2%)</span>
                  <span className="text-sm font-medium text-red-600">-${data.nht.toLocaleString(undefined, {minimumFractionDigits: 2})}</span>
                </div>
                 <div className="flex justify-between">
                  <span className="text-sm text-gray-600">Education Tax (2.25%)</span>
                  <span className="text-sm font-medium text-red-600">-${data.edTax.toLocaleString(undefined, {minimumFractionDigits: 2})}</span>
                </div>
                 <div className="flex justify-between">
                  <span className="text-sm text-gray-600">PAYE (Income Tax)</span>
                  <span className="text-sm font-medium text-red-600">-${data.paye.toLocaleString(undefined, {minimumFractionDigits: 2})}</span>
                </div>
                
                {/* Detailed Deductions */}
                {data.deductionsBreakdown && data.deductionsBreakdown.length > 0 ? (
                    data.deductionsBreakdown.map((item, i) => (
                      <div key={i} className="flex justify-between">
                        <span className="text-sm text-gray-600">{item.name}</span>
                        <span className="text-sm font-medium text-red-600">-${item.amount.toLocaleString(undefined, {minimumFractionDigits: 2})}</span>
                      </div>
                    ))
                ) : data.deductions > 0 && (
                  <div className="flex justify-between">
                    <span className="text-sm text-gray-600">Other Deductions</span>
                    <span className="text-sm font-medium text-red-600">-${data.deductions.toLocaleString(undefined, {minimumFractionDigits: 2})}</span>
                  </div>
                )}

              </div>
              <div className="bg-gray-50 px-4 py-3 border-t border-gray-200 flex justify-between items-center print:bg-gray-100">
                <span className="font-bold text-gray-700 text-sm">Total Deductions</span>
                <span className="font-bold text-red-600">-${data.totalDeductions.toLocaleString(undefined, {minimumFractionDigits: 2})}</span>
              </div>
            </div>
          </div>

          {/* Net Pay Area */}
          <div className="flex justify-end items-center mb-8">
            <div className="bg-jam-black text-white px-8 py-4 rounded-xl shadow-lg text-center print:bg-gray-900 print:text-white print:border print:border-gray-800">
              <p className="text-xs text-jam-yellow uppercase font-bold tracking-wider mb-1">Net Pay (JMD)</p>
              <p className="text-3xl font-bold">${data.netPay.toLocaleString(undefined, {minimumFractionDigits: 2})}</p>
            </div>
          </div>

          {/* YTD Summary (Footer) */}
          <div className="border-t border-gray-200 pt-6">
            <h5 className="text-xs font-bold text-gray-500 uppercase mb-3">Year to Date (YTD) Summary</h5>
            <div className="grid grid-cols-4 gap-4 text-sm">
              <div>
                <span className="block text-gray-400 text-xs">Gross Pay</span>
                <span className="font-medium text-gray-700">${mockYTD.gross.toLocaleString()}</span>
              </div>
              <div>
                <span className="block text-gray-400 text-xs">Taxable Income</span>
                <span className="font-medium text-gray-700">${(mockYTD.gross - mockYTD.nis).toLocaleString()}</span>
              </div>
              <div>
                <span className="block text-gray-400 text-xs">Total Taxes</span>
                <span className="font-medium text-gray-700">${(mockYTD.tax + mockYTD.edTax).toLocaleString()}</span>
              </div>
              <div>
                <span className="block text-gray-400 text-xs">Net Pay</span>
                <span className="font-medium text-gray-700">${mockYTD.net.toLocaleString()}</span>
              </div>
            </div>
          </div>
          
          <div className="mt-8 text-center text-xs text-gray-400 print:mt-12">
            <p>Generated by Payroll-Jam • This document is valid without a signature.</p>
          </div>
    </div>
  );
}

interface PayslipViewProps {
  data: PayRunLineItem;
  companyName: string;
  payPeriod: string;
  payDate: string;
  onClose: () => void;
}

export const PayslipView: React.FC<PayslipViewProps> = ({ data, companyName, payPeriod, payDate, onClose }) => {
  // Handle Escape key to close
  useEffect(() => {
    const handleEsc = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleEsc);
    return () => {
      window.removeEventListener('keydown', handleEsc);
    };
  }, [onClose]);

  const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
      if (e.target === e.currentTarget) {
          onClose();
      }
  };

  return (
    <div 
        className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 overflow-y-auto print-only-modal-overlay"
        onClick={handleBackdropClick}
    >
      <div className="bg-white w-full max-w-3xl rounded-xl shadow-2xl overflow-hidden animate-scale-in my-8 relative flex flex-col max-h-[95vh] print-only-modal">
        
        {/* Toolbar - Sticky Header */}
        <div className="bg-jam-black text-white px-6 py-4 flex justify-between items-center sticky top-0 z-10 shrink-0 print:hidden">
          <h3 className="font-bold text-lg">Payslip View</h3>
          <div className="flex space-x-3">
            <button 
                type="button"
                onClick={() => window.print()}
                className="flex items-center px-3 py-1.5 bg-gray-700 hover:bg-gray-600 rounded-lg text-sm transition-colors"
            >
              <Icons.Printer className="w-4 h-4 mr-2" />
              Print
            </button>
            <button 
                type="button"
                onClick={onClose}
                className="p-1.5 bg-gray-800 hover:bg-red-600 rounded-full transition-colors"
                aria-label="Close"
            >
              <Icons.Close className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Payslip Paper - Scrollable Content */}
        <div className="overflow-y-auto flex-1" id="payslip-content">
            <PayslipDocument 
                data={data} 
                companyName={companyName} 
                payPeriod={payPeriod} 
                payDate={payDate} 
            />
            
            <div className="mb-8 flex justify-center print:hidden">
               <button type="button" onClick={onClose} className="px-8 py-3 bg-gray-100 hover:bg-gray-200 text-gray-800 rounded-lg font-semibold transition-colors">
                   Close Payslip
               </button>
            </div>
        </div>
      </div>
    </div>
  );
};
