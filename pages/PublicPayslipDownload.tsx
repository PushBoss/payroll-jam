import React, { useState, useEffect } from 'react';
import { Icons } from '../components/Icons';
import { PayslipView } from '../components/PayslipView';
import { PayRunLineItem } from '../types';

interface PublicPayslipDownloadProps {
  onBack: () => void;
}

export const PublicPayslipDownload: React.FC<PublicPayslipDownloadProps> = ({ onBack }) => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [payslipData, setPayslipData] = useState<{
    data: PayRunLineItem;
    companyName: string;
    payPeriod: string;
    payDate: string;
  } | null>(null);

  useEffect(() => {
    // Get token from URL
    const params = new URLSearchParams(window.location.search);
    const token = params.get('token');

    if (!token) {
      setError('Invalid or missing download link');
      setLoading(false);
      return;
    }

    // Decode token (format: base64 encoded JSON with employeeId, period, runId)
    try {
      const decoded = JSON.parse(atob(token));
      const { employeeId, runId } = decoded;

      // Load payslip data from localStorage (or API in production)
      const storedRuns = localStorage.getItem('payRunHistory');
      if (storedRuns) {
        const runs = JSON.parse(storedRuns);
        const targetRun = runs.find((r: any) => r.id === runId);
        
        if (targetRun) {
          const lineItem = targetRun.lineItems.find((item: any) => item.employeeId === employeeId);
          
          if (lineItem) {
            // Get company name from localStorage
            const companyData = JSON.parse(localStorage.getItem('companyData') || '{}');
            
            setPayslipData({
              data: lineItem,
              companyName: companyData.name || 'Company',
              payPeriod: targetRun.periodStart,
              payDate: targetRun.payDate
            });
          } else {
            setError('Payslip not found');
          }
        } else {
          setError('Payslip not found');
        }
      } else {
        setError('No payroll data available');
      }
    } catch (err) {
      console.error('Error loading payslip:', err);
      setError('Invalid download link');
    } finally {
      setLoading(false);
    }
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <Icons.Refresh className="w-12 h-12 text-jam-orange animate-spin mx-auto mb-4" />
          <p className="text-gray-600">Loading your payslip...</p>
        </div>
      </div>
    );
  }

  if (error || !payslipData) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-xl shadow-lg p-8 max-w-md w-full text-center">
          <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <Icons.Alert className="w-8 h-8 text-red-600" />
          </div>
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Unable to Load Payslip</h2>
          <p className="text-gray-600 mb-6">{error || 'Payslip not found'}</p>
          <button
            onClick={onBack}
            className="px-6 py-3 bg-jam-orange text-jam-black rounded-lg hover:bg-yellow-500 font-medium"
          >
            Go Back
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-4xl mx-auto px-4">
        {/* Header */}
        <div className="bg-white rounded-lg shadow-sm p-6 mb-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Your Payslip</h1>
              <p className="text-gray-600 text-sm mt-1">
                Period: {payslipData.payPeriod} • Pay Date: {payslipData.payDate}
              </p>
            </div>
            <button
              onClick={() => window.print()}
              className="flex items-center px-4 py-2 bg-jam-orange text-jam-black rounded-lg hover:bg-yellow-500 font-medium"
            >
              <Icons.Printer className="w-4 h-4 mr-2" />
              Print / Save PDF
            </button>
          </div>
        </div>

        {/* Payslip */}
        <div className="bg-white rounded-lg shadow-sm overflow-hidden">
          <PayslipView
            data={payslipData.data}
            companyName={payslipData.companyName}
            payPeriod={payslipData.payPeriod}
            payDate={payslipData.payDate}
            onClose={() => {}} // No close button needed
          />
        </div>

        {/* Info Banner */}
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mt-6">
          <div className="flex items-start">
            <Icons.Alert className="w-5 h-5 text-blue-600 mr-3 flex-shrink-0 mt-0.5" />
            <div className="text-sm text-blue-800">
              <p className="font-medium mb-1">Need full access?</p>
              <p>Ask your employer to upgrade to a Starter or Pro plan to get access to the Employee Portal with payslip history, leave requests, and more.</p>
            </div>
          </div>
        </div>

        {/* Print Instructions */}
        <div className="text-center mt-6 text-gray-500 text-sm">
          <p>To save as PDF: Click "Print / Save PDF" and choose "Save as PDF" in the print dialog</p>
        </div>
      </div>
    </div>
  );
};
