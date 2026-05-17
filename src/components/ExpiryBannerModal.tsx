import React, { useState } from 'react';
import { BillingSubscription } from '../types/billing';

interface ExpiryBannerProps {
  subscription: BillingSubscription;
  onDismiss: () => void;
}

export const ExpiryBannerModal: React.FC<ExpiryBannerProps> = ({ subscription, onDismiss }) => {
  const [isOpen, setIsOpen] = useState(subscription.showExpiryBannerWindow);

  if (!isOpen) return null;

  const daysLeft = Math.max(0, Math.ceil(
    (new Date(subscription.periodEndDate).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24)
  ));

  const handleDismiss = () => {
    setIsOpen(false);
    onDismiss(); // Persist dismissal configuration if required
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md overflow-hidden animate-scale-in text-gray-800 border border-yellow-200">
        <div className="bg-yellow-50 p-6 border-b border-yellow-100 flex items-start">
          <div className="bg-yellow-100 p-2.5 rounded-lg text-yellow-600 mr-4 shrink-0">
            {/* Warning Icon */}
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <div>
            <h3 className="text-lg font-bold text-yellow-800">Subscription Expiring Soon</h3>
            <p className="text-sm text-yellow-700 mt-1">
              Your subscription will expire in <strong className="font-extrabold text-yellow-900">{daysLeft} days</strong>.
            </p>
          </div>
        </div>
        <div className="p-6 bg-white space-y-3">
          <p className="text-xs text-gray-500 leading-relaxed">
            Unless renewed, your access to active payroll processing and timesheet entries will be paused on{' '}
            <strong>{new Date(subscription.periodEndDate).toLocaleDateString()}</strong>.
          </p>
          <div className="flex flex-col space-y-2 mt-4">
            <a
              href="/app/settings?tab=billing"
              className="w-full text-center py-2.5 bg-yellow-600 text-white text-sm font-bold rounded-lg hover:bg-yellow-700 transition-colors shadow-sm animate-none"
            >
              Update Billing Information
            </a>
            <button
              onClick={handleDismiss}
              className="w-full py-2.5 border border-gray-300 text-gray-600 text-sm font-semibold rounded-lg hover:bg-gray-50 transition-colors"
            >
              Remind me later
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
