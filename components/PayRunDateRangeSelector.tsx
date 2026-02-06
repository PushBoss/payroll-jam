/**
 * PayRun Date Range Selector Component
 * Allows user to select exact start and end dates for a pay period
 */

import React, { useState, useEffect } from 'react';
import { PayFrequency } from '../types';
import { getDefaultPeriodDates } from '../utils/payrunCalculator';
import { Icons } from './Icons';

interface PayRunDateRangeSelectorProps {
  payFrequency: PayFrequency;
  onDateRangeChange: (startDate: string, endDate: string) => void;
  initialStartDate?: string;
  initialEndDate?: string;
  onClose: () => void;
}

export const PayRunDateRangeSelector: React.FC<PayRunDateRangeSelectorProps> = ({
  payFrequency,
  onDateRangeChange,
  initialStartDate,
  initialEndDate,
  onClose
}) => {
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');

  useEffect(() => {
    if (initialStartDate && initialEndDate) {
      setStartDate(initialStartDate);
      setEndDate(initialEndDate);
    } else {
      const defaults = getDefaultPeriodDates(payFrequency);
      setStartDate(defaults.startDate);
      setEndDate(defaults.endDate);
    }
  }, [payFrequency, initialStartDate, initialEndDate]);

  const handleApply = () => {
    if (startDate && endDate) {
      const start = new Date(startDate);
      const end = new Date(endDate);

      if (start > end) {
        alert('Start date must be before end date');
        return;
      }

      onDateRangeChange(startDate, endDate);
      onClose();
    }
  };

  const handleQuickSelect = (type: 'thisWeek' | 'thisMonth' | 'lastMonth') => {
    const today = new Date();
    let start = new Date();
    let end = new Date();

    switch (type) {
      case 'thisWeek':
        // Monday to Sunday of current week
        const day = today.getDay();
        start = new Date(today);
        start.setDate(today.getDate() - day + (day === 0 ? -6 : 1));
        end = new Date(start);
        end.setDate(start.getDate() + 6);
        break;

      case 'thisMonth':
        start = new Date(today.getFullYear(), today.getMonth(), 1);
        end = new Date(today.getFullYear(), today.getMonth() + 1, 0);
        break;

      case 'lastMonth':
        start = new Date(today.getFullYear(), today.getMonth() - 1, 1);
        end = new Date(today.getFullYear(), today.getMonth(), 0);
        break;
    }

    setStartDate(start.toISOString().split('T')[0]);
    setEndDate(end.toISOString().split('T')[0]);
  };

  const calculateDays = () => {
    if (!startDate || !endDate) return 0;
    const start = new Date(startDate);
    const end = new Date(endDate);
    return Math.ceil((end.getTime() - start.getTime()) / (1000 * 3600 * 24)) + 1;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg overflow-hidden animate-scale-in">
        {/* Header */}
        <div className="p-6 border-b border-gray-200 bg-gray-50 flex justify-between items-center">
          <h3 className="text-lg font-bold text-gray-900">Select Pay Period Dates</h3>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <Icons.Close className="w-6 h-6" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {/* Quick Select Buttons */}
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-2 uppercase">
              Quick Select
            </label>
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => handleQuickSelect('thisWeek')}
                className="px-3 py-2 text-sm font-medium bg-jam-yellow/20 hover:bg-jam-yellow/30 text-jam-black rounded-lg transition-all"
              >
                This Week
              </button>
              <button
                type="button"
                onClick={() => handleQuickSelect('thisMonth')}
                className="px-3 py-2 text-sm font-medium bg-jam-yellow/20 hover:bg-jam-yellow/30 text-jam-black rounded-lg transition-all"
              >
                This Month
              </button>
              <button
                type="button"
                onClick={() => handleQuickSelect('lastMonth')}
                className="px-3 py-2 text-sm font-medium bg-jam-yellow/20 hover:bg-jam-yellow/30 text-jam-black rounded-lg transition-all"
              >
                Last Month
              </button>
            </div>
          </div>

          {/* Date Inputs */}
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                Start Date *
              </label>
              <input
                type="date"
                value={startDate}
                onChange={e => setStartDate(e.target.value)}
                className="w-full border border-gray-300 rounded-lg p-3 text-sm focus:ring-2 focus:ring-jam-orange focus:border-jam-orange bg-white transition-all"
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                End Date *
              </label>
              <input
                type="date"
                value={endDate}
                onChange={e => setEndDate(e.target.value)}
                className="w-full border border-gray-300 rounded-lg p-3 text-sm focus:ring-2 focus:ring-jam-orange focus:border-jam-orange bg-white transition-all"
              />
            </div>
          </div>

          {/* Period Summary */}
          {startDate && endDate && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-gray-600 text-xs mb-1">Pay Frequency</p>
                  <p className="font-semibold text-gray-900">{payFrequency}</p>
                </div>
                <div>
                  <p className="text-gray-600 text-xs mb-1">Days in Period</p>
                  <p className="font-semibold text-gray-900">{calculateDays()} days</p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-gray-200 px-6 py-4 bg-gray-50 flex justify-end space-x-3">
          <button
            onClick={onClose}
            className="px-6 py-2 border border-gray-300 rounded-lg font-medium text-gray-700 hover:bg-gray-100 transition-all"
          >
            Cancel
          </button>
          <button
            onClick={handleApply}
            disabled={!startDate || !endDate}
            className="px-6 py-2 bg-jam-black text-white rounded-lg font-medium hover:bg-gray-900 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center"
          >
            ✓ Apply Dates
          </button>
        </div>
      </div>
    </div>
  );
};
