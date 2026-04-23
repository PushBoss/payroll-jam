import React from 'react';
import { Icons } from '../../../components/Icons';
import { PayRunDateRangeSelector } from '../../../components/PayRunDateRangeSelector';
import { PayFrequency } from '../../../core/types';

interface PayRunSetupStepProps {
  payPeriod: string;
  payPeriodOptions: { value: string; label: string }[];
  payCycle: PayFrequency | 'ALL';
  setPayPeriod: (value: string) => void;
  setPayCycle: (value: PayFrequency | 'ALL') => void;
  isDateRangeSelectorOpen: boolean;
  setIsDateRangeSelectorOpen: (value: boolean) => void;
  periodStartDate: string | null;
  periodEndDate: string | null;
  setPeriodStartDate: (value: string | null) => void;
  setPeriodEndDate: (value: string | null) => void;
  isSuspended: boolean;
  isCalculating: boolean;
  handleInitializeSystem: () => void;
}

export const PayRunSetupStep: React.FC<PayRunSetupStepProps> = ({
  payPeriod,
  payPeriodOptions,
  payCycle,
  setPayPeriod,
  setPayCycle,
  isDateRangeSelectorOpen,
  setIsDateRangeSelectorOpen,
  periodStartDate,
  periodEndDate,
  setPeriodStartDate,
  setPeriodEndDate,
  isSuspended,
  isCalculating,
  handleInitializeSystem
}) => {
  return (
    <div className="max-w-4xl mx-auto mt-10 animate-fade-in">
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
              onChange={(e) => setPayCycle(e.target.value as PayFrequency | 'ALL')}
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
            onClick={() => setIsDateRangeSelectorOpen(true)}
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

      {isDateRangeSelectorOpen && (
        <PayRunDateRangeSelector
          payFrequency={payCycle === 'ALL' ? PayFrequency.MONTHLY : payCycle}
          initialStartDate={periodStartDate || undefined}
          initialEndDate={periodEndDate || undefined}
          onDateRangeChange={(startDate, endDate) => {
            setPeriodStartDate(startDate);
            setPeriodEndDate(endDate);
          }}
          onClose={() => setIsDateRangeSelectorOpen(false)}
        />
      )}
    </div>
  );
};
