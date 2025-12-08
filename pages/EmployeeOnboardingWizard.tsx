
import React, { useState } from 'react';
import { Employee, BankAccount } from '../types';
import { Icons } from '../components/Icons';

interface OnboardingWizardProps {
  existingData?: Partial<Employee>;
  companyName: string;
  onComplete: (data: Partial<Employee>) => void;
}

export const EmployeeOnboardingWizard: React.FC<OnboardingWizardProps> = ({ 
  existingData, 
  companyName,
  onComplete 
}) => {
  const [step, setStep] = useState(1);
  const [formData, setFormData] = useState<Partial<Employee>>({
    ...existingData,
    firstName: existingData?.firstName || '',
    lastName: existingData?.lastName || '',
    email: existingData?.email || '',
    phone: '',
    address: '',
    emergencyContact: '',
    trn: '',
    nis: '',
    bankDetails: {
      bankName: 'NCB',
      accountNumber: '',
      accountType: 'SAVINGS',
      currency: 'JMD'
    }
  });

  const updateField = (field: keyof Employee, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const updateBank = (field: keyof BankAccount, value: any) => {
    setFormData(prev => ({
      ...prev,
      bankDetails: {
        ...(prev.bankDetails as BankAccount),
        [field]: value
      }
    }));
  };

  const handleNext = () => {
    if (step < 4) setStep(s => s + 1);
    else onComplete(formData);
  };

  const handleBack = () => {
    if (step > 1) setStep(s => s - 1);
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-2xl bg-white rounded-2xl shadow-xl overflow-hidden">
        {/* Header */}
        <div className="bg-jam-black text-white p-8 text-center">
          <h1 className="text-2xl font-bold mb-2">Welcome to {companyName}</h1>
          <p className="text-gray-400">Let's get you set up for payroll and benefits.</p>
          <div className="flex justify-center mt-6 space-x-2">
            {[1, 2, 3, 4].map(s => (
              <div key={s} className={`h-1.5 rounded-full w-12 ${step >= s ? 'bg-jam-orange' : 'bg-gray-700'}`} />
            ))}
          </div>
        </div>

        <div className="p-8">
          {/* Step 1: Personal Info */}
          {step === 1 && (
            <div className="space-y-6 animate-fade-in">
              <div className="text-center mb-6">
                <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-3 text-blue-600">
                  <Icons.User className="w-6 h-6" />
                </div>
                <h2 className="text-xl font-bold text-gray-900">Personal Information</h2>
                <p className="text-sm text-gray-500">Confirm your contact details.</p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">First Name</label>
                  <input disabled value={formData.firstName} className="w-full border border-gray-200 bg-gray-50 rounded-lg p-2.5 text-gray-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Last Name</label>
                  <input disabled value={formData.lastName} className="w-full border border-gray-200 bg-gray-50 rounded-lg p-2.5 text-gray-500" />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Mobile Phone</label>
                <input 
                  required
                  type="tel"
                  value={formData.phone}
                  onChange={e => updateField('phone', e.target.value)}
                  className="w-full border border-gray-300 rounded-lg p-2.5 focus:ring-2 focus:ring-jam-orange"
                  placeholder="(876) 555-0000"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Home Address</label>
                <textarea 
                  required
                  rows={2}
                  value={formData.address}
                  onChange={e => updateField('address', e.target.value)}
                  className="w-full border border-gray-300 rounded-lg p-2.5 focus:ring-2 focus:ring-jam-orange"
                  placeholder="Street Address, City, Parish"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Emergency Contact</label>
                <input 
                  required
                  type="text"
                  value={formData.emergencyContact}
                  onChange={e => updateField('emergencyContact', e.target.value)}
                  className="w-full border border-gray-300 rounded-lg p-2.5 focus:ring-2 focus:ring-jam-orange"
                  placeholder="Name - Relation - Phone"
                />
              </div>
            </div>
          )}

          {/* Step 2: Statutory Info */}
          {step === 2 && (
            <div className="space-y-6 animate-fade-in">
              <div className="text-center mb-6">
                <div className="w-12 h-12 bg-purple-100 rounded-full flex items-center justify-center mx-auto mb-3 text-purple-600">
                  <Icons.Fingerprint className="w-6 h-6" />
                </div>
                <h2 className="text-xl font-bold text-gray-900">Statutory Information</h2>
                <p className="text-sm text-gray-500">Required for tax compliance (TAJ).</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Tax Registration Number (TRN)</label>
                <input 
                  required
                  type="text"
                  value={formData.trn}
                  onChange={e => updateField('trn', e.target.value)}
                  className="w-full border border-gray-300 rounded-lg p-2.5 focus:ring-2 focus:ring-jam-orange font-mono text-lg tracking-wider"
                  placeholder="000-000-000"
                />
                <p className="text-xs text-gray-500 mt-1">Must be a valid 9-digit number.</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">NIS Number</label>
                <input 
                  required
                  type="text"
                  value={formData.nis}
                  onChange={e => updateField('nis', e.target.value)}
                  className="w-full border border-gray-300 rounded-lg p-2.5 focus:ring-2 focus:ring-jam-orange font-mono text-lg tracking-wider"
                  placeholder="A123456"
                />
              </div>
            </div>
          )}

          {/* Step 3: Banking Info */}
          {step === 3 && (
            <div className="space-y-6 animate-fade-in">
              <div className="text-center mb-6">
                <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-3 text-green-600">
                  <Icons.Bank className="w-6 h-6" />
                </div>
                <h2 className="text-xl font-bold text-gray-900">Direct Deposit</h2>
                <p className="text-sm text-gray-500">Where should we send your salary?</p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Bank Name</label>
                  <select 
                    value={formData.bankDetails?.bankName}
                    onChange={e => updateBank('bankName', e.target.value)}
                    className="w-full border border-gray-300 rounded-lg p-2.5 focus:ring-2 focus:ring-jam-orange"
                  >
                    <option value="NCB">National Commercial Bank (NCB)</option>
                    <option value="BNS">Scotiabank (BNS)</option>
                    <option value="JN">JN Bank</option>
                    <option value="SAGICOR">Sagicor Bank</option>
                    <option value="OTHER">Other</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Account Type</label>
                  <select 
                    value={formData.bankDetails?.accountType}
                    onChange={e => updateBank('accountType', e.target.value)}
                    className="w-full border border-gray-300 rounded-lg p-2.5 focus:ring-2 focus:ring-jam-orange"
                  >
                    <option value="SAVINGS">Savings</option>
                    <option value="CHEQUING">Chequing / Current</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Currency</label>
                  <select 
                    value={formData.bankDetails?.currency}
                    onChange={e => updateBank('currency', e.target.value)}
                    className="w-full border border-gray-300 rounded-lg p-2.5 focus:ring-2 focus:ring-jam-orange"
                  >
                    <option value="JMD">JMD</option>
                    <option value="USD">USD</option>
                  </select>
                </div>
                <div className="col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Account Number</label>
                  <input 
                    required
                    type="text"
                    value={formData.bankDetails?.accountNumber}
                    onChange={e => updateBank('accountNumber', e.target.value)}
                    className="w-full border border-gray-300 rounded-lg p-2.5 focus:ring-2 focus:ring-jam-orange font-mono text-lg"
                    placeholder="000000000"
                  />
                </div>
                {formData.bankDetails?.bankName === 'BNS' && (
                  <div className="col-span-2">
                    <label className="block text-sm font-medium text-gray-700 mb-1">Branch Transit Code</label>
                    <input 
                      required
                      type="text"
                      value={formData.bankDetails?.branchCode}
                      onChange={e => updateBank('branchCode', e.target.value)}
                      className="w-full border border-gray-300 rounded-lg p-2.5 focus:ring-2 focus:ring-jam-orange"
                      placeholder="e.g. 80825"
                    />
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Step 4: Documents & Review */}
          {step === 4 && (
            <div className="space-y-6 animate-fade-in">
              <div className="text-center mb-6">
                <div className="w-12 h-12 bg-orange-100 rounded-full flex items-center justify-center mx-auto mb-3 text-jam-orange">
                  <Icons.FileCheck className="w-6 h-6" />
                </div>
                <h2 className="text-xl font-bold text-gray-900">Documents & Verification</h2>
                <p className="text-sm text-gray-500">Upload ID to verify your TRN.</p>
              </div>

              <div className="border-2 border-dashed border-gray-300 rounded-xl p-8 text-center hover:bg-gray-50 transition-colors cursor-pointer group">
                <Icons.Upload className="w-10 h-10 text-gray-300 mx-auto mb-2 group-hover:text-jam-orange" />
                <p className="text-sm font-medium text-gray-900">Upload ID / Driver's License / TRN Card</p>
                <p className="text-xs text-gray-500">JPG or PNG up to 5MB</p>
                {/* Mock File Input behavior */}
                <button className="mt-4 px-4 py-2 bg-white border border-gray-300 rounded-lg text-sm shadow-sm hover:bg-gray-50">
                  Select File
                </button>
              </div>

              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 text-sm text-yellow-800">
                <div className="flex items-start">
                  <Icons.ShieldCheck className="w-5 h-5 mr-2 flex-shrink-0" />
                  <p>
                    By clicking submit, I certify that the information provided is accurate and I authorize {companyName} to use these details for payroll processing.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="mt-10 flex justify-between pt-6 border-t border-gray-100">
            <button 
              onClick={handleBack}
              disabled={step === 1}
              className={`px-6 py-2.5 rounded-lg font-medium transition-colors ${step === 1 ? 'text-gray-300 cursor-not-allowed' : 'text-gray-600 hover:bg-gray-100'}`}
            >
              Back
            </button>
            <button 
              onClick={handleNext}
              className="px-8 py-2.5 bg-jam-black text-white rounded-lg font-bold hover:bg-gray-800 shadow-lg transform hover:-translate-y-0.5 transition-all"
            >
              {step === 4 ? 'Submit for Verification' : 'Continue'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
