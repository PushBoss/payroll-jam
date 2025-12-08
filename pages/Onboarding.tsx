import React, { useState, useRef } from 'react';
import Papa from 'papaparse';
import { Icons } from '../components/Icons';
import { CompanySettings, Employee, Role, PayType, PayFrequency, Department } from '../types';
import { downloadFile } from '../utils/exportHelpers';

interface OnboardingProps {
  onComplete: (data: CompanySettings, employees: Employee[]) => void;
  departments?: Department[];
}

export const Onboarding: React.FC<OnboardingProps> = ({ onComplete, departments = [] }) => {
  const [step, setStep] = useState(1);
  const [importedEmployees, setImportedEmployees] = useState<Employee[]>([]);
  const [importStatus, setImportStatus] = useState<{type: 'success' | 'error', message: string} | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [formData, setFormData] = useState<CompanySettings>({
      name: '',
      trn: '',
      address: '',
      phone: '',
      bankName: 'NCB',
      accountNumber: '',
      branchCode: '',
      payFrequency: 'Monthly',
      defaultPayDate: '25th of the month',
      plan: 'Free'
  });

  const updateField = (field: keyof CompanySettings, value: string) => {
      setFormData(prev => ({ ...prev, [field]: value }));
  };

  const nextStep = () => setStep(s => Math.min(s + 1, 4));
  const prevStep = () => setStep(s => Math.max(s - 1, 1));

  const handleFinish = () => {
      onComplete(formData, importedEmployees);
  };

  const handleDownloadTemplate = () => {
      const headers = "FirstName,LastName,Email,TRN,GrossSalary,Role,Department,JobTitle";
      const sample = "John,Doe,john.doe@example.com,123-456-789,250000,Employee,Operations,Driver";
      downloadFile('Employee_Import_Template.csv', `${headers}\n${sample}`, 'text/csv');
  };
  const handleImportCSV = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setImportStatus(null);

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        if (results.errors.length > 0) {
          console.error("CSV Errors:", results.errors);
          setImportStatus({type: 'error', message: 'Error parsing CSV. Please check file format.'});
          return;
        }

        const rows = results.data as any[];
        if (rows.length === 0) {
            setImportStatus({type: 'error', message: 'CSV is empty.'});
            return;
        }

        const newEmps: Employee[] = [];
        const freq = formData.payFrequency?.toUpperCase() as PayFrequency || PayFrequency.MONTHLY;

        // Helper to find keys case-insensitively
        const keys = Object.keys(rows[0]);
        const findKey = (term: string) => keys.find(k => k.toLowerCase().includes(term.toLowerCase()));

        const emailKey = findKey('email');
        const firstKey = findKey('first');
        const lastKey = findKey('last');
        const trnKey = findKey('trn');
        const grossKey = findKey('gross') || findKey('salary');
        const roleKey = findKey('role');
        const deptKey = findKey('dept');
        const titleKey = findKey('title') || findKey('job');

        if (!emailKey) {
            setImportStatus({type: 'error', message: 'CSV must contain an "Email" column.'});
            return;
        }

        rows.forEach((row) => {
            const email = row[emailKey]?.trim();
            if (!email) return;

            const newEmp: Employee = {
                id: generateUUID(),
                firstName: firstKey ? row[firstKey]?.trim() : 'Unknown',
                lastName: lastKey ? row[lastKey]?.trim() : '',
                email: email,
                trn: trnKey ? row[trnKey]?.trim() : '',
                nis: 'PENDING',
                grossSalary: grossKey ? (parseFloat(row[grossKey]) || 0) : 0,
                payType: PayType.SALARIED,
                payFrequency: freq,
                role: Role.EMPLOYEE, 
                status: 'ACTIVE',
                hireDate: new Date().toISOString().split('T')[0],
                jobTitle: titleKey ? row[titleKey]?.trim() : undefined,
                allowances: [],
                deductions: [],
                bankDetails: {
                    bankName: formData.bankName as any || 'NCB',
                    accountNumber: '',
                    accountType: 'SAVINGS',
                    currency: 'JMD'
                }
            };

            // Map Role
            if (roleKey && row[roleKey]) {
                const r = row[roleKey].toUpperCase();
                if (r.includes('ADMIN')) newEmp.role = Role.ADMIN;
                else if (r.includes('MANAGER')) newEmp.role = Role.MANAGER;
            }

            // Map Department Name to ID
            if (deptKey && row[deptKey]) {
                const deptName = row[deptKey].trim();
                const matchedDept = departments.find(d => d.name.toLowerCase() === deptName.toLowerCase());
                if (matchedDept) {
                    newEmp.department = matchedDept.id;
                }
            }

            newEmps.push(newEmp);
        });

        setImportedEmployees(newEmps);
        setImportStatus({type: 'success', message: `Successfully imported ${newEmps.length} employees`});
        e.target.value = ''; // Reset input
      },
      error: (err) => {
        console.error(err);
        setImportStatus({type: 'error', message: 'Failed to read CSV file.'});
      }
    });
  };

  const StepIndicator = () => (
    <div className="flex items-center justify-center mb-10">
        {[1, 2, 3, 4].map((s) => (
            <div key={s} className="flex items-center">
                <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold border-2 transition-all
                    ${step === s ? 'bg-jam-orange border-jam-orange text-jam-black' : 
                      step > s ? 'bg-jam-black border-jam-black text-white' : 'bg-white border-gray-300 text-gray-400'
                    }`}>
                    {step > s ? <Icons.Check className="w-5 h-5" /> : s}
                </div>
                {s < 4 && (
                    <div className={`w-12 h-1 mx-2 rounded ${step > s ? 'bg-jam-black' : 'bg-gray-200'}`} />
                )}
            </div>
        ))}
    </div>
  );

  return (
    <div className="flex flex-col items-center justify-center min-h-screen py-12 px-4 sm:px-6 lg:px-8 bg-gray-50">
        <div className="w-full max-w-3xl bg-white rounded-2xl shadow-xl overflow-hidden">
            <div className="bg-jam-black p-6 text-white text-center">
                <h2 className="text-2xl font-bold">Welcome to Payroll-Jam</h2>
                <p className="text-gray-400 mt-2">Let's set up your company profile and payroll preferences.</p>
            </div>
            
            <div className="p-8">
                <StepIndicator />

                {step === 1 && (
                    <div className="space-y-4 animate-fade-in">
                        <div className="text-center mb-6">
                            <h3 className="text-xl font-bold text-gray-900">Company Information</h3>
                            <p className="text-sm text-gray-500">Enter your legal business details.</p>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Company Name</label>
                                <input type="text" className="w-full border border-gray-300 rounded-lg p-2" value={formData.name} onChange={e => updateField('name', e.target.value)} />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">TRN</label>
                                <input type="text" className="w-full border border-gray-300 rounded-lg p-2" value={formData.trn} onChange={e => updateField('trn', e.target.value)} />
                            </div>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Address</label>
                            <textarea className="w-full border border-gray-300 rounded-lg p-2" rows={2} value={formData.address} onChange={e => updateField('address', e.target.value)} />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Phone</label>
                            <input type="text" className="w-full border border-gray-300 rounded-lg p-2" value={formData.phone} onChange={e => updateField('phone', e.target.value)} />
                        </div>
                    </div>
                )}

                {step === 2 && (
                    <div className="space-y-4 animate-fade-in">
                        <div className="text-center mb-6">
                            <h3 className="text-xl font-bold text-gray-900">Payroll Configuration</h3>
                            <p className="text-sm text-gray-500">How do you pay your team?</p>
                        </div>
                        <div className="bg-blue-50 p-4 rounded-lg border border-blue-100 mb-4">
                            <h4 className="font-bold text-blue-900 text-sm">Banking Details (Source)</h4>
                            <p className="text-xs text-blue-700 mb-2">Used for generating ACH files.</p>
                            <div className="grid grid-cols-2 gap-2">
                                <select className="w-full border border-blue-200 rounded p-1 text-sm" value={formData.bankName} onChange={e => updateField('bankName', e.target.value)}>
                                    <option value="NCB">NCB</option>
                                    <option value="BNS">Scotiabank</option>
                                    <option value="JN">JN Bank</option>
                                </select>
                                <input type="text" placeholder="Account Number" className="w-full border border-blue-200 rounded p-1 text-sm" value={formData.accountNumber} onChange={e => updateField('accountNumber', e.target.value)} />
                            </div>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Pay Frequency</label>
                            <select className="w-full border border-gray-300 rounded-lg p-2" value={formData.payFrequency} onChange={e => updateField('payFrequency', e.target.value)}>
                                <option value="Monthly">Monthly</option>
                                <option value="Fortnightly">Fortnightly</option>
                                <option value="Weekly">Weekly</option>
                            </select>
                        </div>
                    </div>
                )}

                {step === 3 && (
                    <div className="space-y-4 animate-fade-in">
                        <div className="text-center mb-6">
                            <h3 className="text-xl font-bold text-gray-900">Import Employees</h3>
                            <p className="text-sm text-gray-500">Upload a CSV or skip to add manually later.</p>
                        </div>
                        
                        {importStatus && (
                            <div className={`p-4 rounded-lg border flex items-center justify-between mb-4 ${
                                importStatus.type === 'success' 
                                    ? 'bg-green-50 border-green-200' 
                                    : 'bg-red-50 border-red-200'
                            }`}>
                                <span className={`font-medium ${
                                    importStatus.type === 'success' ? 'text-green-800' : 'text-red-800'
                                }`}>
                                    {importStatus.message}
                                </span>
                                <button 
                                    onClick={() => setImportStatus(null)}
                                    className="text-gray-400 hover:text-gray-600"
                                >
                                    <Icons.Close className="w-4 h-4" />
                                </button>
                            </div>
                        )}
                        
                        <div className="border-2 border-dashed border-gray-300 rounded-xl p-8 text-center hover:bg-gray-50 transition-colors">
                            <Icons.Upload className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                            <p className="text-gray-600 mb-4">Drag and drop your employee list here</p>
                            <input type="file" accept=".csv" ref={fileInputRef} onChange={handleImportCSV} className="hidden" />
                            <div className="flex justify-center space-x-3">
                                <button onClick={() => fileInputRef.current?.click()} className="px-4 py-2 bg-jam-black text-white rounded-lg text-sm">Select File</button>
                                <button onClick={handleDownloadTemplate} className="px-4 py-2 bg-white border border-gray-300 text-gray-700 rounded-lg text-sm">Download Template</button>
                            </div>
                        </div>

                        {importedEmployees.length > 0 && (
                            <div className="mt-4 bg-green-50 p-4 rounded-lg border border-green-200 flex items-center justify-between">
                                <span className="text-green-800 font-medium">{importedEmployees.length} employees ready to import</span>
                                <Icons.CheckCircle className="w-5 h-5 text-green-600" />
                            </div>
                        )}
                    </div>
                )}

                {step === 4 && (
                    <div className="space-y-4 animate-fade-in text-center">
                        <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                            <Icons.Check className="w-8 h-8 text-green-600" />
                        </div>
                        <h3 className="text-2xl font-bold text-gray-900">You're All Set!</h3>
                        <p className="text-gray-500 max-w-md mx-auto">
                            We have configured your company profile and tax settings for 2025 compliance. You can now start running payroll.
                        </p>
                    </div>
                )}

                <div className="mt-8 flex justify-between pt-6 border-t border-gray-100">
                    <button 
                        onClick={prevStep} 
                        disabled={step === 1}
                        className={`px-6 py-2 rounded-lg font-medium transition-colors ${step === 1 ? 'text-gray-300 cursor-not-allowed' : 'text-gray-600 hover:bg-gray-100'}`}
                    >
                        Back
                    </button>
                    {step < 4 ? (
                        <button 
                            onClick={nextStep}
                            className="bg-jam-black text-white px-8 py-2 rounded-lg font-bold hover:bg-gray-800 shadow-lg"
                        >
                            Continue
                        </button>
                    ) : (
                        <button 
                            onClick={handleFinish}
                            className="bg-jam-orange text-jam-black px-8 py-2 rounded-lg font-bold hover:bg-yellow-500 shadow-lg"
                        >
                            Go to Dashboard
                        </button>
                    )}
                </div>
            </div>
        </div>
    </div>
  );
};