import React, { useState } from 'react';
import { PlanTier } from '../types/billing';
import { evaluatePlanTierLimit } from '../utils/tierUtils';

interface PaywallViewProps {
  currentEmployeeCount: number;
  onRenew: () => void;
  onDowngrade: (selectedTier: PlanTier) => Promise<void>;
}

export const PaywallView: React.FC<PaywallViewProps> = ({
  currentEmployeeCount,
  onRenew,
  onDowngrade
}) => {
  const [selectedTier, setSelectedTier] = useState<PlanTier>('basic');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const evaluation = evaluatePlanTierLimit(currentEmployeeCount, selectedTier);

  const handleDowngradeSubmit = async () => {
    if (!evaluation.isCompliant) return;
    setIsSubmitting(true);
    try {
      await onDowngrade(selectedTier);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-gray-900 z-50 flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden animate-scale-in text-gray-800 my-8">
        
        {/* Header Warning Panel */}
        <div className="bg-red-600 p-8 text-center text-white">
          <svg className="w-12 h-12 mx-auto mb-4 text-white/90" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
          </svg>
          <h2 className="text-2xl font-bold">Workspace Suspended</h2>
          <p className="text-sm text-white/80 mt-1 max-w-md mx-auto">
            Your billing period has ended. Access to core workspace operations has been locked until billing is updated.
          </p>
        </div>

        <div className="p-8 space-y-6">
          {/* Main Option A: Renew */}
          <div className="border border-gray-200 rounded-xl p-6 bg-gray-50 flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <h3 className="font-bold text-lg text-gray-900">Option A: Renew Premium Access</h3>
              <p className="text-xs text-gray-500 mt-1">
                Instantly unlock all features, unlimited employees, compliance tools, and your complete history.
              </p>
            </div>
            <button
              onClick={onRenew}
              className="bg-red-600 hover:bg-red-700 text-white font-bold px-6 py-3 rounded-lg text-sm shrink-0 transition-colors shadow-sm"
            >
              Pay & Reactivate
            </button>
          </div>

          <div className="relative">
            <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-gray-200"></div></div>
            <div className="relative flex justify-center text-xs uppercase"><span className="bg-white px-3 text-gray-500 font-semibold">Or</span></div>
          </div>

          {/* Option B: Downgrade */}
          <div className="space-y-4">
            <h3 className="font-bold text-lg text-gray-900">Option B: Downgrade Workspace</h3>
            <p className="text-xs text-gray-500">
              Select a lower subscription plan tier to resume operation. Headcount limits apply immediately.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Basic Plan Downgrade Select */}
              <div
                onClick={() => setSelectedTier('basic')}
                className={`border-2 rounded-xl p-4 cursor-pointer transition-all ${
                  selectedTier === 'basic' ? 'border-red-600 bg-red-50/20' : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                <div className="flex justify-between items-center mb-1">
                  <h4 className="font-bold text-sm text-gray-900">Basic Tier</h4>
                  <span className="font-bold text-xs text-green-700">Free</span>
                </div>
                <p className="text-[11px] text-gray-500">Supports up to 5 active employees.</p>
              </div>

              {/* Professional Plan Downgrade Select */}
              <div
                onClick={() => setSelectedTier('professional')}
                className={`border-2 rounded-xl p-4 cursor-pointer transition-all ${
                  selectedTier === 'professional' ? 'border-red-600 bg-red-50/20' : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                <div className="flex justify-between items-center mb-1">
                  <h4 className="font-bold text-sm text-gray-900">Professional Tier</h4>
                  <span className="font-bold text-xs text-gray-800">$15,000/mo</span>
                </div>
                <p className="text-[11px] text-gray-500">Supports up to 50 active employees.</p>
              </div>
            </div>

            {/* Validation warning block */}
            {!evaluation.isCompliant && (
              <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-xl flex items-start gap-3">
                <svg className="w-5 h-5 text-yellow-600 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
                <div className="flex-1">
                  <p className="text-xs text-yellow-800 font-semibold">Headcount Limits Exceeded</p>
                  <p className="text-[11px] text-yellow-700 mt-0.5">{evaluation.warningMessage}</p>
                  <a
                    href="/billing/suspended/sandbox"
                    className="inline-block mt-2 text-xs font-bold text-yellow-800 underline hover:text-yellow-950"
                  >
                    Archive Team to Match Plan &rarr;
                  </a>
                </div>
              </div>
            )}

            {/* Confirm Submission Action */}
            <button
              onClick={handleDowngradeSubmit}
              disabled={!evaluation.isCompliant || isSubmitting}
              className="w-full py-3 bg-gray-950 hover:bg-gray-800 text-white font-bold text-sm rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
            >
              {isSubmitting ? 'Processing Downgrade...' : 'Confirm Plan Downgrade'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
