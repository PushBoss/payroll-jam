import React from 'react';
import { Icons } from '../Icons';

export interface BankTransferDetails {
    bankName: string;
    accountName: string;
    accountNumber: string;
    accountType?: string;
    branch?: string;
    instructions?: string;
}

interface BankTransferInstructionsProps {
    bankTransfer: BankTransferDetails;
    amount: number;
    currency?: string;
    referenceLabel: string;
    onConfirm: () => void;
    isSubmitting: boolean;
    confirmLabel?: string;
    submittingLabel?: string;
}

export const BankTransferInstructions: React.FC<BankTransferInstructionsProps> = ({
    bankTransfer,
    amount,
    currency = 'JMD',
    referenceLabel,
    onConfirm,
    isSubmitting,
    confirmLabel = "I've Made the Payment - Create Account",
    submittingLabel = 'Creating Account...'
}) => {
    return (
        <div className="mb-6 p-6 bg-blue-50 border border-blue-200 rounded-lg">
            <h3 className="font-semibold text-gray-900 mb-4 flex items-center">
                <Icons.Building className="w-5 h-5 mr-2 text-blue-600" />
                Direct Deposit Payment Instructions
            </h3>
            <div className="space-y-3 text-sm text-gray-700">
                <div>
                    <span className="font-medium">Bank Name:</span> {bankTransfer.bankName}
                </div>
                <div>
                    <span className="font-medium">Account Name:</span> {bankTransfer.accountName}
                </div>
                <div>
                    <span className="font-medium">Account Number:</span> {bankTransfer.accountNumber}
                </div>
                <div>
                    <span className="font-medium">Account Type:</span> {bankTransfer.accountType || 'Savings Account'}
                </div>
                <div>
                    <span className="font-medium">Branch:</span> {bankTransfer.branch || 'UWI Branch'}
                </div>
                <div>
                    <span className="font-medium">Amount:</span> {currency} ${amount.toLocaleString()}
                </div>
                <div className="pt-2 border-t border-blue-200">
                    <span className="font-medium">Reference:</span> {referenceLabel}
                </div>
            </div>
            <div className="mt-4 p-3 bg-white rounded border border-blue-100">
                <p className="text-xs text-gray-600">
                    <strong>Note:</strong> {bankTransfer.instructions || 'After making the deposit, your account will be activated within 24 hours. You will receive a confirmation email once payment is verified.'}
                </p>
            </div>
            <button
                type="button"
                onClick={onConfirm}
                disabled={isSubmitting}
                className="w-full mt-4 py-3 px-4 bg-jam-black text-white rounded-lg hover:bg-gray-800 transition-all font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
            >
                {isSubmitting ? (
                    <>
                        <Icons.Refresh className="w-5 h-5 animate-spin mr-2" />
                        {submittingLabel}
                    </>
                ) : (
                    confirmLabel
                )}
            </button>
        </div>
    );
};
