import React, { useState, useEffect } from 'react';
import { Employee, EmployeeType, PayType, PayFrequency, Role, CustomDeduction, BankAccount, Department } from '../../core/types';
import { Icons } from '../../components/Icons';
import { isValidTRN, isValidNIS, isValidEmail, formatTRN } from '../../utils/validators';

interface EmployeeManagerProps {
  employee?: Employee | null;
  isOpen: boolean;
  onClose: () => void;
  onSave: (employee: Employee) => void;
  isLoading?: boolean;
  departments?: Department[];
  onAddDepartment?: (dept: Department) => void;
}




type TabType = 'identity' | 'org' | 'compliance' | 'banking' | 'statutory' | 'deductions';

// Maps each form field to the tab it lives on — derived from actual JSX structure
const TAB_FIELDS: Record<TabType, string[]> = {
  identity:   ['firstName', 'lastName', 'email', 'phone', 'address', 'hireDate', 'joiningDate', 'emergencyContact'],
  org:        ['jobTitle', 'department', 'role', 'status'],
  compliance: ['employeeType', 'payType', 'payFrequency', 'grossSalary', 'hourlyRate'],
  banking:    ['bankDetails'],
  statutory:  ['trn', 'nis', 'pensionContributionRate', 'pensionProvider'],
  deductions: ['customDeductions', 'deductionError'],
};



export const EmployeeManager: React.FC<EmployeeManagerProps> = ({
  employee,
  isOpen,
  onClose,
  onSave,
  isLoading = false,
  departments = [],
  onAddDepartment,
}) => {

  const [activeTab, setActiveTab] = useState<TabType>('identity');
  const [formData, setFormData] = useState<Employee>(getInitialEmployee());
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [deductionToAdd, setDeductionToAdd] = useState<Partial<CustomDeduction>>({});
  const [isAddingDepartment, setIsAddingDepartment] = useState(false);
  const [newDepartmentName, setNewDepartmentName] = useState('');

  useEffect(() => {
    if (employee) {
      setFormData(employee);
    } else {
      setFormData(getInitialEmployee());
    }
    setErrors({});
  }, [employee, isOpen]);

  function getInitialEmployee(): Employee {
    const today = new Date().toISOString().split('T')[0];
    return {
      id: '',
      firstName: '',
      lastName: '',
      email: '',
      trn: '',
      nis: '',
      employeeId: '',
      grossSalary: 0,
      hourlyRate: 0,
      payType: PayType.SALARIED,
      payFrequency: PayFrequency.MONTHLY,
      role: Role.EMPLOYEE,
      status: 'ACTIVE',
      hireDate: today,
      joiningDate: today,
      employeeType: EmployeeType.STAFF,
      jobTitle: '',
      department: '',
      phone: '',
      address: '',
      emergencyContact: '',
      pensionContributionRate: 0,
      pensionProvider: '',
      bankDetails: {
        bankName: 'NCB',
        accountNumber: '',
        accountType: 'SAVINGS',
        currency: 'JMD'
      },
      customDeductions: [],
      allowances: [],
      deductions: []
    };
  }

  const handleInputChange = (field: keyof Employee, value: any) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));
    // Clear error for this field
    if (errors[field]) {
      setErrors(prev => {
        const newErrors = { ...prev };
        delete newErrors[field];
        return newErrors;
      });
    }
  };

  const handleBankDetailsChange = (field: keyof BankAccount, value: string) => {
    setFormData(prev => ({
      ...prev,
      bankDetails: {
        ...prev.bankDetails,
        [field]: value
      } as BankAccount
    }));
  };

  const validateForm = (): { valid: boolean; newErrors: Record<string, string> } => {
    const newErrors: Record<string, string> = {};

    if (!formData.firstName?.trim()) newErrors.firstName = 'First name is required';
    if (!formData.lastName?.trim()) newErrors.lastName = 'Last name is required';
    if (!formData.email?.trim()) newErrors.email = 'Email is required';
    if (!isValidEmail(formData.email)) newErrors.email = 'Invalid email format';
    if (formData.trn && !isValidTRN(formData.trn)) newErrors.trn = 'Invalid TRN format';
    if (formData.nis && formData.nis !== 'PENDING' && !isValidNIS(formData.nis)) {
      newErrors.nis = 'Invalid NIS format';
    }
    if (formData.grossSalary <= 0) newErrors.grossSalary = 'Gross salary must be greater than 0';
    if (!formData.hireDate) newErrors.hireDate = 'Hire date is required';
    if (formData.joiningDate && !formData.hireDate) newErrors.hireDate = 'Hire date is required if joining date is set';

    setErrors(newErrors);
    return { valid: Object.keys(newErrors).length === 0, newErrors };
  };

  const handleAddDeduction = () => {
    console.log('🎯 handleAddDeduction called with:', deductionToAdd);
    if (!deductionToAdd.name || !deductionToAdd.amount || !deductionToAdd.periodType) {
      console.warn('❌ Invalid deduction - missing required fields');
      setErrors(prev => ({
        ...prev,
        deductionError: 'Please fill in all deduction fields'
      }));
      return;
    }

    const newDeduction: CustomDeduction = {
      id: `deduction_${Date.now()}`,
      name: deductionToAdd.name,
      amount: deductionToAdd.amount,
      periodType: deductionToAdd.periodType,
      remainingTerm: deductionToAdd.remainingTerm,
      periodFrequency: deductionToAdd.periodFrequency || 'MONTHLY',
      targetBalance: deductionToAdd.targetBalance
    };

    console.log('✅ Adding deduction:', newDeduction);
    setFormData(prev => ({
      ...prev,
      customDeductions: [...(prev.customDeductions || []), newDeduction]
    }));
    console.log('✅ formData.customDeductions updated to:', [...(formData.customDeductions || []), newDeduction]);

    setDeductionToAdd({});
    setErrors(prev => {
      const newErrors = { ...prev };
      delete newErrors.deductionError;
      return newErrors;
    });
  };

  const handleRemoveDeduction = (id: string) => {
    setFormData(prev => ({
      ...prev,
      customDeductions: prev.customDeductions?.filter(d => d.id !== id) || []
    }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const { valid, newErrors } = validateForm();
    if (valid) {
      // If the user filled out the deduction inputs but forgot to click “+ Add Deduction”,
      // we auto-commit it on save to avoid silently dropping it.
      const hasAnyPendingDeductionInput = Boolean(
        deductionToAdd.name ||
        deductionToAdd.amount ||
        deductionToAdd.periodType ||
        deductionToAdd.remainingTerm ||
        deductionToAdd.targetBalance
      );

      if (hasAnyPendingDeductionInput) {
        const isPendingDeductionValid = Boolean(
          deductionToAdd.name &&
          deductionToAdd.amount &&
          deductionToAdd.periodType
        );

        if (!isPendingDeductionValid) {
          console.warn('❌ Pending deduction inputs are incomplete; blocking save');
          setErrors(prev => ({
            ...prev,
            deductionError: 'You have an unfinished deduction. Please complete it or clear it before saving.'
          }));
          setActiveTab('deductions');
          return;
        }

        const pendingDeduction: CustomDeduction = {
          id: `deduction_${Date.now()}`,
          name: deductionToAdd.name as string,
          amount: Number(deductionToAdd.amount) || 0,
          periodType: deductionToAdd.periodType as 'FIXED_TERM' | 'TARGET_BALANCE',
          remainingTerm: deductionToAdd.remainingTerm,
          periodFrequency: deductionToAdd.periodFrequency || 'MONTHLY',
          targetBalance: deductionToAdd.targetBalance
        };

        const employeeToSave: Employee = {
          ...formData,
          customDeductions: [...(formData.customDeductions || []), pendingDeduction]
        };

        console.log('✅ Form validation passed (auto-added pending deduction), calling onSave');
        setDeductionToAdd({});
        onSave(employeeToSave);
        return;
      }

      console.log('✅ Form validation passed, calling onSave');
      onSave(formData);
    } else {
      console.warn('❌ Form validation failed', newErrors);
      // Auto-navigate to the first tab that has errors, using the fresh newErrors (not stale state)
      const firstTabWithErrors = (Object.entries(TAB_FIELDS) as [TabType, string[]][]).find(
        ([, fields]) => fields.some(f => Object.keys(newErrors).includes(f))
      );
      if (firstTabWithErrors) setActiveTab(firstTabWithErrors[0]);
    }
  };

  // Derive which tabs have at least one error — used to show red dot badges on tabs
  const tabsWithErrors = new Set<TabType>(
    (Object.entries(TAB_FIELDS) as [TabType, string[]][])
      .filter(([, fields]) => fields.some(f => errors[f]))
      .map(([tab]) => tab)
  );



  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl overflow-hidden animate-scale-in flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="p-6 border-b border-gray-200 bg-gray-50 flex justify-between items-center shrink-0">
          <div className="flex items-center space-x-3">
            <div className="h-12 w-12 rounded-full bg-jam-yellow flex items-center justify-center font-bold text-jam-black text-lg">
              {formData.firstName?.[0]}{formData.lastName?.[0]}
            </div>
            <div>
              <h3 className="text-lg font-bold text-gray-900">
                {formData.firstName && formData.lastName
                  ? `${formData.firstName} ${formData.lastName}`
                  : 'New Employee'}
              </h3>
              {formData.employeeId && (
                <p className="text-xs text-gray-500">ID: {formData.employeeId}</p>
              )}
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <Icons.Close className="w-6 h-6" />
          </button>
        </div>

        {/* Tabs Navigation */}
        <div className="border-b border-gray-200 px-6 shrink-0 bg-white">
          <nav className="-mb-px flex space-x-8 overflow-x-auto">
            {[
              { id: 'identity' as TabType, label: 'Identity' },
              { id: 'org' as TabType, label: 'Organization' },
              { id: 'compliance' as TabType, label: 'Compliance' },
              { id: 'banking' as TabType, label: 'Banking' },
              { id: 'statutory' as TabType, label: 'Statutory' },
              { id: 'deductions' as TabType, label: 'Deductions' }
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`inline-flex items-center gap-1.5 whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm transition-colors ${
                  activeTab === tab.id
                    ? 'border-jam-orange text-jam-black'
                    : tabsWithErrors.has(tab.id)
                    ? 'border-transparent text-red-500 hover:text-red-700 hover:border-red-300'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                {tab.label}
                {tabsWithErrors.has(tab.id) && (
                  <span className="flex h-2 w-2 shrink-0">
                    <span className="animate-ping absolute inline-flex h-2 w-2 rounded-full bg-red-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500"></span>
                  </span>
                )}
              </button>

            ))}
          </nav>
        </div>


        {/* Tab Content */}
        <form onSubmit={handleSubmit} className="p-6 overflow-y-auto flex-1 space-y-6">
          {/* Identity Tab */}
          {activeTab === 'identity' && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    First Name *
                  </label>
                  <input
                    type="text"
                    value={formData.firstName}
                    onChange={e => handleInputChange('firstName', e.target.value)}
                    className={`w-full border rounded-lg p-3 text-sm focus:ring-2 focus:ring-jam-orange focus:border-jam-orange transition-all ${
                      errors.firstName ? 'border-red-500 bg-red-50' : 'border-gray-300 bg-white'
                    }`}
                    placeholder="John"
                  />
                  {errors.firstName && (
                    <p className="text-red-600 text-xs mt-1">{errors.firstName}</p>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    Last Name *
                  </label>
                  <input
                    type="text"
                    value={formData.lastName}
                    onChange={e => handleInputChange('lastName', e.target.value)}
                    className={`w-full border rounded-lg p-3 text-sm focus:ring-2 focus:ring-jam-orange focus:border-jam-orange transition-all ${
                      errors.lastName ? 'border-red-500 bg-red-50' : 'border-gray-300 bg-white'
                    }`}
                    placeholder="Doe"
                  />
                  {errors.lastName && (
                    <p className="text-red-600 text-xs mt-1">{errors.lastName}</p>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    Email *
                  </label>
                  <input
                    type="email"
                    value={formData.email}
                    onChange={e => handleInputChange('email', e.target.value)}
                    className={`w-full border rounded-lg p-3 text-sm focus:ring-2 focus:ring-jam-orange focus:border-jam-orange transition-all ${
                      errors.email ? 'border-red-500 bg-red-50' : 'border-gray-300 bg-white'
                    }`}
                    placeholder="john@example.com"
                  />
                  {errors.email && (
                    <p className="text-red-600 text-xs mt-1">{errors.email}</p>
                  )}
                </div>



                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    Mobile Phone
                  </label>
                  <input
                    type="tel"
                    value={formData.phone || ''}
                    onChange={e => handleInputChange('phone', e.target.value || undefined)}
                    className="w-full border border-gray-300 rounded-lg p-3 text-sm focus:ring-2 focus:ring-jam-orange focus:border-jam-orange bg-white transition-all"
                    placeholder="+1 876 123 4567"
                  />
                </div>

                <div className="md:col-span-2">
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    Address
                  </label>
                  <input
                    type="text"
                    value={formData.address || ''}
                    onChange={e => handleInputChange('address', e.target.value || undefined)}
                    className="w-full border border-gray-300 rounded-lg p-3 text-sm focus:ring-2 focus:ring-jam-orange focus:border-jam-orange bg-white transition-all"
                    placeholder="123 Main Street, Kingston"
                  />
                </div>
              </div>
            </div>
          )}

          {/* Organization Tab */}
          {activeTab === 'org' && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    Employee ID
                  </label>
                  <input
                    type="text"
                    value={formData.employeeId || ''}
                    onChange={e => handleInputChange('employeeId', e.target.value || undefined)}
                    className="w-full border border-gray-300 rounded-lg p-3 text-sm focus:ring-2 focus:ring-jam-orange focus:border-jam-orange bg-white transition-all"
                    placeholder="EMP001"
                  />
                </div>

                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    Job Title
                  </label>
                  <input
                    type="text"
                    value={formData.jobTitle || ''}
                    onChange={e => handleInputChange('jobTitle', e.target.value || undefined)}
                    className="w-full border border-gray-300 rounded-lg p-3 text-sm focus:ring-2 focus:ring-jam-orange focus:border-jam-orange bg-white transition-all"
                    placeholder="Software Engineer"
                  />
                </div>



                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    Department
                  </label>
                  <div className="flex gap-2">
                    {isAddingDepartment ? (
                      <>
                        <input
                          type="text"
                          value={newDepartmentName}
                          onChange={(e) => setNewDepartmentName(e.target.value)}
                          placeholder="Enter department name"
                          className="flex-1 border border-gray-300 rounded-lg p-3 text-sm focus:ring-2 focus:ring-jam-orange focus:border-jam-orange bg-white transition-all"
                          autoFocus
                        />
                        <button
                          type="button"
                          onClick={() => {
                            if (newDepartmentName.trim()) {
                              const newDept: Department = {
                                id: `dept-${Date.now()}`,
                                name: newDepartmentName.trim()
                              };
                              onAddDepartment?.(newDept);
                              handleInputChange('department', newDept.id);
                              setNewDepartmentName('');
                              setIsAddingDepartment(false);
                            }
                          }}
                          className="px-4 py-3 bg-jam-yellow text-jam-black rounded-lg font-semibold hover:bg-opacity-90 transition-all"
                        >
                          Save
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setIsAddingDepartment(false);
                            setNewDepartmentName('');
                          }}
                          className="px-4 py-3 border border-gray-300 rounded-lg font-semibold hover:bg-gray-100 transition-all"
                        >
                          Cancel
                        </button>
                      </>
                    ) : (
                      <>
                        <select
                          value={formData.department || ''}
                          onChange={(e) => handleInputChange('department', e.target.value || undefined)}
                          className="flex-1 border border-gray-300 rounded-lg p-3 text-sm focus:ring-2 focus:ring-jam-orange focus:border-jam-orange bg-white transition-all"
                        >
                          <option value="">Select a department...</option>
                          {departments.map(dept => (
                            <option key={dept.id} value={dept.id}>{dept.name}</option>
                          ))}
                        </select>
                        <button
                          type="button"
                          onClick={() => setIsAddingDepartment(true)}
                          className="px-4 py-3 bg-jam-orange text-white rounded-lg font-semibold hover:bg-opacity-90 transition-all flex items-center"
                          title="Add new department"
                        >
                          <Icons.Plus className="w-4 h-4" />
                        </button>
                      </>
                    )}
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    Hire Date *
                  </label>
                  <input
                    type="date"
                    value={formData.hireDate}
                    onChange={e => handleInputChange('hireDate', e.target.value)}
                    className={`w-full border rounded-lg p-3 text-sm focus:ring-2 focus:ring-jam-orange focus:border-jam-orange transition-all ${
                      errors.hireDate ? 'border-red-500 bg-red-50' : 'border-gray-300 bg-white'
                    }`}
                  />
                  {errors.hireDate && (
                    <p className="text-red-600 text-xs mt-1">{errors.hireDate}</p>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    Joining Date
                  </label>
                  <input
                    type="date"
                    value={formData.joiningDate || ''}
                    onChange={e => handleInputChange('joiningDate', e.target.value || undefined)}
                    className="w-full border border-gray-300 rounded-lg p-3 text-sm focus:ring-2 focus:ring-jam-orange focus:border-jam-orange bg-white transition-all"
                  />
                </div>


              </div>
            </div>
          )}

          {/* Compliance Tab */}
          {activeTab === 'compliance' && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    Employee Type *
                  </label>
                  <select
                    value={formData.employeeType || EmployeeType.STAFF}
                    onChange={e => handleInputChange('employeeType', e.target.value as EmployeeType)}
                    className="w-full border border-gray-300 rounded-lg p-3 text-sm focus:ring-2 focus:ring-jam-orange focus:border-jam-orange bg-white transition-all"
                  >
                    <option value={EmployeeType.STAFF}>Staff</option>
                    <option value={EmployeeType.HOURLY}>Hourly</option>
                    <option value={EmployeeType.CONTRACTOR}>Contractor</option>
                  </select>
                  <p className="text-xs text-gray-500 mt-2">
                    {formData.employeeType === EmployeeType.CONTRACTOR
                      ? '⚠️ Contractors: Statutory deductions will be disabled'
                      : 'Statutory deductions apply to this employee type'}
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    Pay Type *
                  </label>
                  <select
                    value={formData.payType}
                    onChange={e => handleInputChange('payType', e.target.value as PayType)}
                    className="w-full border border-gray-300 rounded-lg p-3 text-sm focus:ring-2 focus:ring-jam-orange focus:border-jam-orange bg-white transition-all"
                  >
                    <option value={PayType.SALARIED}>Salaried</option>
                    <option value={PayType.HOURLY}>Hourly</option>
                    <option value={PayType.COMMISSION}>Commission</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    Pay Frequency *
                  </label>
                  <select
                    value={formData.payFrequency}
                    onChange={e => handleInputChange('payFrequency', e.target.value as PayFrequency)}
                    className="w-full border border-gray-300 rounded-lg p-3 text-sm focus:ring-2 focus:ring-jam-orange focus:border-jam-orange bg-white transition-all"
                  >
                    <option value={PayFrequency.WEEKLY}>Weekly</option>
                    <option value={PayFrequency.FORTNIGHTLY}>Fortnightly</option>
                    <option value={PayFrequency.MONTHLY}>Monthly</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    Gross Salary/Rate *
                  </label>
                  <div className="flex items-center">
                    <span className="text-gray-600 mr-2">$</span>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={formData.grossSalary ? formData.grossSalary.toString() : ''}
                      onChange={e => handleInputChange('grossSalary', e.target.value ? parseFloat(e.target.value) : 0)}
                      className={`flex-1 border rounded-lg p-3 text-sm focus:ring-2 focus:ring-jam-orange focus:border-jam-orange transition-all ${
                        errors.grossSalary ? 'border-red-500 bg-red-50' : 'border-gray-300 bg-white'
                      }`}
                      placeholder="0.00"
                    />
                  </div>
                  {errors.grossSalary && (
                    <p className="text-red-600 text-xs mt-1">{errors.grossSalary}</p>
                  )}
                </div>

                {formData.payType === PayType.HOURLY && (
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">
                      Hourly Rate
                    </label>
                    <div className="flex items-center">
                      <span className="text-gray-600 mr-2">$</span>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={(formData.hourlyRate !== undefined && formData.hourlyRate !== null ? formData.hourlyRate : '') as any}
                        onChange={e => handleInputChange('hourlyRate', e.target.value ? parseFloat(e.target.value) : undefined)}
                        className="flex-1 border border-gray-300 rounded-lg p-3 text-sm focus:ring-2 focus:ring-jam-orange focus:border-jam-orange bg-white transition-all"
                        placeholder="0.00"
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Banking Tab */}
          {activeTab === 'banking' && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    Account Name
                  </label>
                  <input
                    type="text"
                    value={formData.bankDetails?.bankName || 'NCB'}
                    onChange={e => handleBankDetailsChange('bankName', e.target.value as any)}
                    className="w-full border border-gray-300 rounded-lg p-3 text-sm focus:ring-2 focus:ring-jam-orange focus:border-jam-orange bg-white transition-all"
                    placeholder="Bank name"
                  />
                </div>

                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    Bank Name *
                  </label>
                  <select
                    value={formData.bankDetails?.bankName || 'NCB'}
                    onChange={e => handleBankDetailsChange('bankName', e.target.value as any)}
                    className="w-full border border-gray-300 rounded-lg p-3 text-sm focus:ring-2 focus:ring-jam-orange focus:border-jam-orange bg-white transition-all"
                  >
                    <option value="NCB">NCB</option>
                    <option value="BNS">Bank of Nova Scotia</option>
                    <option value="JN">JN Bank</option>
                    <option value="SAGICOR">Sagicor Bank</option>
                    <option value="OTHER">Other</option>
                  </select>
                </div>

                <div className="md:col-span-2">
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    Account Number *
                  </label>
                  <input
                    type="text"
                    value={formData.bankDetails?.accountNumber || ''}
                    onChange={e => handleBankDetailsChange('accountNumber', e.target.value)}
                    className="w-full border border-gray-300 rounded-lg p-3 text-sm focus:ring-2 focus:ring-jam-orange focus:border-jam-orange bg-white transition-all"
                    placeholder="0123456789"
                  />
                </div>

                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    Account Type
                  </label>
                  <select
                    value={formData.bankDetails?.accountType || 'SAVINGS'}
                    onChange={e => handleBankDetailsChange('accountType', e.target.value as any)}
                    className="w-full border border-gray-300 rounded-lg p-3 text-sm focus:ring-2 focus:ring-jam-orange focus:border-jam-orange bg-white transition-all"
                  >
                    <option value="SAVINGS">Savings</option>
                    <option value="CHEQUING">Chequing</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    Currency
                  </label>
                  <select
                    value={formData.bankDetails?.currency || 'JMD'}
                    onChange={e => handleBankDetailsChange('currency', e.target.value as any)}
                    className="w-full border border-gray-300 rounded-lg p-3 text-sm focus:ring-2 focus:ring-jam-orange focus:border-jam-orange bg-white transition-all"
                  >
                    <option value="JMD">JMD (Jamaican Dollar)</option>
                    <option value="USD">USD (US Dollar)</option>
                  </select>
                </div>
              </div>
            </div>
          )}

          {/* Statutory Tab */}
          {activeTab === 'statutory' && (
            <div className="space-y-6">
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">

                <p className="text-sm text-blue-900">
                  Fill in statutory information required for Jamaican payroll compliance.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    Tax Payer ID (TRN) *
                  </label>
                  <input
                    type="text"
                    value={formData.trn}
                    onChange={e => handleInputChange('trn', formatTRN(e.target.value))}
                    className={`w-full border rounded-lg p-3 text-sm focus:ring-2 focus:ring-jam-orange focus:border-jam-orange transition-all ${
                      errors.trn ? 'border-red-500 bg-red-50' : 'border-gray-300 bg-white'
                    }`}
                    placeholder="123456789"
                    maxLength={9}
                  />
                  {errors.trn && (
                    <p className="text-red-600 text-xs mt-1">{errors.trn}</p>
                  )}
                  <p className="text-xs text-gray-500 mt-2">Format: 9 digits</p>
                </div>

                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    NIS Number *
                  </label>
                  <input
                    type="text"
                    value={formData.nis}
                    onChange={e => handleInputChange('nis', e.target.value.toUpperCase())}
                    className={`w-full border rounded-lg p-3 text-sm focus:ring-2 focus:ring-jam-orange focus:border-jam-orange transition-all ${
                      errors.nis ? 'border-red-500 bg-red-50' : 'border-gray-300 bg-white'
                    }`}
                    placeholder="A-123-456"
                    maxLength={11}
                  />
                  {errors.nis && (
                    <p className="text-red-600 text-xs mt-1">{errors.nis}</p>
                  )}
                  <p className="text-xs text-gray-500 mt-2">Format: A-123-456 or PENDING</p>
                </div>

                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    Pension Contribution Rate (%)
                  </label>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    step="0.1"
                    value={formData.pensionContributionRate || ''}
                    onChange={e => handleInputChange('pensionContributionRate', e.target.value ? parseFloat(e.target.value) : 0)}
                    className="w-full border border-gray-300 rounded-lg p-3 text-sm focus:ring-2 focus:ring-jam-orange focus:border-jam-orange bg-white transition-all"
                    placeholder="0.0"
                  />
                  <p className="text-xs text-gray-500 mt-2">Deduction from salary, reduces statutory income for Ed Tax</p>
                </div>

                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    Pension Provider
                  </label>
                  <input
                    type="text"
                    value={formData.pensionProvider || ''}
                    onChange={e => handleInputChange('pensionProvider', e.target.value || '')}
                    className="w-full border border-gray-300 rounded-lg p-3 text-sm focus:ring-2 focus:ring-jam-orange focus:border-jam-orange bg-white transition-all"
                    placeholder="e.g., PICA, Proven, NCB Pension"
                  />
                </div>

              </div>
            </div>
          )}

          {/* Deductions Tab */}
          {activeTab === 'deductions' && (
            <div className="space-y-6">
              <div>
                <h4 className="text-sm font-semibold text-gray-900 mb-4">Add Custom Deductions</h4>
                
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">
                      Deduction Name
                    </label>
                    <input
                      type="text"
                      value={deductionToAdd.name || ''}
                      onChange={e => setDeductionToAdd(prev => ({ ...prev, name: e.target.value }))}
                      className="w-full border border-gray-300 rounded-lg p-2 text-sm focus:ring-2 focus:ring-jam-orange focus:border-jam-orange bg-white transition-all"
                      placeholder="e.g., Loan Payment"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">
                      Amount ($)
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={deductionToAdd.amount || ''}
                      onChange={e => setDeductionToAdd(prev => ({ ...prev, amount: parseFloat(e.target.value) || 0 }))}
                      className="w-full border border-gray-300 rounded-lg p-2 text-sm focus:ring-2 focus:ring-jam-orange focus:border-jam-orange bg-white transition-all"
                      placeholder="0.00"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">
                      Period Type
                    </label>
                    <select
                      value={deductionToAdd.periodType || ''}
                      onChange={e => setDeductionToAdd(prev => ({ ...prev, periodType: e.target.value as 'FIXED_TERM' | 'TARGET_BALANCE' }))}
                      className="w-full border border-gray-300 rounded-lg p-2 text-sm focus:ring-2 focus:ring-jam-orange focus:border-jam-orange bg-white transition-all"
                    >
                      <option value="">Select Type</option>
                      <option value="FIXED_TERM">Fixed Term</option>
                      <option value="TARGET_BALANCE">Target Balance</option>
                    </select>
                  </div>
                </div>

                {deductionToAdd.periodType === 'FIXED_TERM' && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">
                        Remaining Periods
                      </label>
                      <input
                        type="number"
                        min="1"
                        value={deductionToAdd.remainingTerm || ''}
                        onChange={e => setDeductionToAdd(prev => ({ ...prev, remainingTerm: parseInt(e.target.value) || 0 }))}
                        className="w-full border border-gray-300 rounded-lg p-2 text-sm focus:ring-2 focus:ring-jam-orange focus:border-jam-orange bg-white transition-all"
                        placeholder="Number of pay periods"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">
                        Period Frequency
                      </label>
                      <select
                        value={deductionToAdd.periodFrequency || 'MONTHLY'}
                        onChange={e => setDeductionToAdd(prev => ({ ...prev, periodFrequency: e.target.value as 'WEEKLY' | 'FORTNIGHTLY' | 'MONTHLY' }))}
                        className="w-full border border-gray-300 rounded-lg p-2 text-sm focus:ring-2 focus:ring-jam-orange focus:border-jam-orange bg-white transition-all"
                      >
                        <option value="WEEKLY">Weekly</option>
                        <option value="FORTNIGHTLY">Fortnightly</option>
                        <option value="MONTHLY">Monthly</option>
                      </select>
                    </div>
                  </div>
                )}

                {deductionToAdd.periodType === 'TARGET_BALANCE' && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">
                        Target Balance
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={deductionToAdd.targetBalance || ''}
                        onChange={e => setDeductionToAdd(prev => ({ ...prev, targetBalance: parseFloat(e.target.value) || 0 }))}
                        className="w-full border border-gray-300 rounded-lg p-2 text-sm focus:ring-2 focus:ring-jam-orange focus:border-jam-orange bg-white transition-all"
                        placeholder="Total amount to deduct"
                      />
                    </div>
                  </div>
                )}

                <button
                  type="button"
                  onClick={(e) => {
                    console.log('🔘 Add Deduction button clicked!');
                    e.preventDefault();
                    e.stopPropagation();
                    handleAddDeduction();
                  }}
                  className="w-full bg-jam-yellow text-jam-black font-semibold py-2 rounded-lg hover:bg-opacity-90 transition-all text-sm"
                >
                  + Add Deduction
                </button>

                {errors.deductionError && (
                  <p className="text-red-600 text-xs mt-2">{errors.deductionError}</p>
                )}
              </div>

              {/* Deductions List */}
              {formData.customDeductions && formData.customDeductions.length > 0 && (
                <div>
                  <h4 className="text-sm font-semibold text-gray-900 mb-4">Current Deductions</h4>
                  <div className="space-y-2">
                    {formData.customDeductions.map(deduction => (
                      <div
                        key={deduction.id}
                        className="flex items-center justify-between bg-gray-50 border border-gray-200 rounded-lg p-4"
                      >
                        <div className="flex-1">
                          <p className="font-medium text-gray-900 text-sm">{deduction.name}</p>
                          <p className="text-xs text-gray-600">
                            ${deduction.amount.toLocaleString()} • {deduction.periodType}
                            {deduction.remainingTerm && ` • ${deduction.remainingTerm} ${(deduction.periodFrequency || 'MONTHLY').toLowerCase()} periods left`}
                            {deduction.targetBalance && ` • Target: $${deduction.targetBalance.toLocaleString()}`}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleRemoveDeduction(deduction.id)}
                          className="text-red-500 hover:text-red-700 transition-colors ml-4"
                        >
                          <Icons.Trash className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </form>

        {/* Footer with Actions */}
        <div className="border-t border-gray-200 px-6 py-4 bg-gray-50 flex justify-end space-x-3 shrink-0">
          <button
            onClick={onClose}
            disabled={isLoading}
            className="px-6 py-2 border border-gray-300 rounded-lg font-medium text-gray-700 hover:bg-gray-100 transition-all disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={isLoading}
            className="px-6 py-2 bg-jam-black text-white rounded-lg font-medium hover:bg-gray-900 transition-all disabled:opacity-50 flex items-center"
          >
            {isLoading ? (
              <>
                <Icons.Refresh className="w-4 h-4 mr-2 animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <Icons.Check className="w-4 h-4 mr-2" />
                Save Employee
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
