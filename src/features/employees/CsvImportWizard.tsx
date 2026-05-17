import React, { useState, useEffect, useRef } from 'react';
import Papa from 'papaparse';
import { Employee, Role, PayType, PayFrequency, Department, EmployeeType } from '../../core/types';
import { Icons } from '../../components/Icons';
import { generateUUID } from '../../utils/uuid';
import { isValidEmail, isValidTRN, isValidNIS } from '../../utils/validators';

interface CsvImportWizardProps {
  isOpen: boolean;
  onClose: () => void;
  existingEmployees: Employee[];
  departments: Department[];
  onUpdateDepartments?: (depts: Department[]) => void;
  onImportComplete: (employeesToSave: Employee[], skippedCount: number) => void;
}

interface MappingField {
  key: string;
  label: string;
  isMandatory: boolean;
  aliases: string[];
}

const SYSTEM_FIELDS: MappingField[] = [
  // Identity Tab
  { key: 'firstName', label: 'First Name', isMandatory: true, aliases: ['first', 'given', 'fname', 'first name', 'name'] },
  { key: 'lastName', label: 'Last Name', isMandatory: true, aliases: ['last', 'surname', 'lname', 'last name'] },
  { key: 'email', label: 'Email Address', isMandatory: true, aliases: ['email', 'e-mail', 'mail', 'email address'] },
  { key: 'phone', label: 'Mobile Phone', isMandatory: false, aliases: ['phone', 'tel', 'mobile', 'contact'] },
  { key: 'address', label: 'Address', isMandatory: false, aliases: ['address', 'location', 'street'] },
  { key: 'hireDate', label: 'Hire Date', isMandatory: true, aliases: ['hire date', 'hired', 'start date', 'joining'] },
  { key: 'joiningDate', label: 'Joining Date', isMandatory: false, aliases: ['joining date', 'join date'] },
  { key: 'emergencyContact', label: 'Emergency Contact', isMandatory: false, aliases: ['emergency', 'ice', 'contact person'] },

  // Organization Tab
  { key: 'employeeId', label: 'Employee ID', isMandatory: false, aliases: ['id', 'emp id', 'employee id', 'code'] },
  { key: 'jobTitle', label: 'Job Title', isMandatory: false, aliases: ['title', 'role', 'job', 'job title', 'designation'] },
  { key: 'department', label: 'Department', isMandatory: false, aliases: ['dept', 'department', 'division'] },
  { key: 'status', label: 'Status', isMandatory: false, aliases: ['status', 'active', 'state'] },

  // Compliance Tab
  { key: 'employeeType', label: 'Employee Type', isMandatory: false, aliases: ['type', 'employee type', 'class'] },
  { key: 'payType', label: 'Pay Type', isMandatory: false, aliases: ['pay type', 'payment type'] },
  { key: 'payFrequency', label: 'Pay Frequency', isMandatory: false, aliases: ['frequency', 'freq', 'pay frequency'] },
  { key: 'grossSalary', label: 'Gross Salary/Rate', isMandatory: true, aliases: ['salary', 'gross', 'comp', 'compensation', 'pay', 'wage', 'rate'] },
  { key: 'hourlyRate', label: 'Hourly Rate', isMandatory: false, aliases: ['hourly rate', 'hour rate', 'hourly'] },

  // Banking Tab
  { key: 'bankName', label: 'Bank Name', isMandatory: false, aliases: ['bank', 'bank name'] },
  { key: 'bankAccountNumber', label: 'Bank Account Number', isMandatory: false, aliases: ['account number', 'acc num', 'bank account', 'account no'] },
  { key: 'bankAccountType', label: 'Bank Account Type', isMandatory: false, aliases: ['account type', 'bank account type'] },
  { key: 'bankCurrency', label: 'Bank Currency', isMandatory: false, aliases: ['bank currency', 'currency'] },

  // Statutory Tab
  { key: 'trn', label: 'Tax Payer ID (TRN)', isMandatory: false, aliases: ['trn', 'tax', 'taxpayer', 'tax payer id'] },
  { key: 'nis', label: 'NIS Number', isMandatory: false, aliases: ['nis', 'national insurance', 'nis number'] },
  { key: 'pensionContributionRate', label: 'Pension Rate (%)', isMandatory: false, aliases: ['pension rate', 'pension contribution', 'pension %'] },
  { key: 'pensionProvider', label: 'Pension Provider', isMandatory: false, aliases: ['pension provider', 'pension company'] }
];

interface SavedTemplate {
  name: string;
  mappings: Record<string, string>;
}

interface ValidatedRecord {
  id: string;
  originalIndex: number;
  data: any; // Mapped & normalized fields
  errors: Record<string, string>;
  isDuplicateFile: boolean;
  isDuplicateDb: boolean;
  duplicateAction: 'skip' | 'overwrite' | 'none';
}

export const CsvImportWizard: React.FC<CsvImportWizardProps> = ({
  isOpen,
  onClose,
  existingEmployees,
  departments,
  onUpdateDepartments,
  onImportComplete
}) => {
  const [step, setStep] = useState<number>(1);
  const [file, setFile] = useState<File | null>(null);
  const [csvHeaders, setCsvHeaders] = useState<string[]>([]);
  const [rawRows, setRawRows] = useState<Record<string, string>[]>([]);

  // Mapping state: systemFieldKey -> csvHeader
  const [mappings, setMappings] = useState<Record<string, string>>({});
  
  // Normalization / Validation state
  const [validatedRecords, setValidatedRecords] = useState<ValidatedRecord[]>([]);

  // Templates
  const [templates, setTemplates] = useState<SavedTemplate[]>([]);
  const [selectedTemplateName, setSelectedTemplateName] = useState<string>('');
  const [saveTemplate, setSaveTemplate] = useState<boolean>(false);
  const [newTemplateName, setNewTemplateName] = useState<string>('');

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load saved templates
  useEffect(() => {
    try {
      const stored = localStorage.getItem('payroll_jam_csv_templates');
      if (stored) {
        setTemplates(JSON.parse(stored));
      }
    } catch (e) {
      console.error('Failed to load CSV templates', e);
    }
  }, []);

  if (!isOpen) return null;

  // STEP 1: Parse uploaded file
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;
    setFile(selectedFile);

    Papa.parse(selectedFile, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        if (results.errors.length > 0) {
          console.error('CSV Parsing Errors:', results.errors);
        }
        
        const data = results.data as Record<string, string>[];
        if (data.length === 0) {
          alert('CSV file is empty');
          return;
        }

        const headers = Object.keys(data[0] || {});
        setCsvHeaders(headers);
        setRawRows(data);
        
        // Auto-initialize mappings
        const initialMappings: Record<string, string> = {};
        
        // Fuzzy smart matching logic
        SYSTEM_FIELDS.forEach(field => {
          // Check for exact case-insensitive match first
          let match = headers.find(h => h.trim().toLowerCase() === field.label.toLowerCase() || h.trim().toLowerCase() === field.key.toLowerCase());
          
          if (!match) {
            // Check aliases
            match = headers.find(h => {
              const cleaned = h.trim().toLowerCase();
              return field.aliases.some(alias => cleaned === alias || cleaned.includes(alias));
            });
          }
          
          if (match) {
            initialMappings[field.key] = match;
          } else {
            initialMappings[field.key] = '';
          }
        });
        
        setMappings(initialMappings);
        setStep(2);
      },
      error: (err) => {
        console.error('File read failure:', err);
        alert('Failed to read CSV file');
      }
    });
  };

  const handleApplyTemplate = (templateName: string) => {
    const template = templates.find(t => t.name === templateName);
    if (template) {
      const updatedMappings = { ...mappings };
      Object.keys(template.mappings).forEach(key => {
        // Only map if the header exists in this CSV
        if (csvHeaders.includes(template.mappings[key])) {
          updatedMappings[key] = template.mappings[key];
        }
      });
      setMappings(updatedMappings);
      setSelectedTemplateName(templateName);
    }
  };

  const handleSaveTemplate = () => {
    if (!newTemplateName.trim()) return;
    const newT: SavedTemplate = {
      name: newTemplateName.trim(),
      mappings
    };
    const updated = [...templates.filter(t => t.name !== newT.name), newT];
    setTemplates(updated);
    localStorage.setItem('payroll_jam_csv_templates', JSON.stringify(updated));
    setSelectedTemplateName(newT.name);
    alert(`Template "${newT.name}" saved!`);
  };

  // STEP 2: Proceed to Validate and Normalize
  const handleProceedToValidation = () => {
    // Check mandatory fields
    const missingFields = SYSTEM_FIELDS.filter(f => f.isMandatory && !mappings[f.key]);
    if (missingFields.length > 0) {
      alert(`Please map all mandatory fields: ${missingFields.map(f => f.label).join(', ')}`);
      return;
    }

    // Process all raw rows
    const processed = rawRows.map((rawRow, index) => {
      const data: any = {};
      
      // 1. Basic key mapping
      SYSTEM_FIELDS.forEach(field => {
        const csvHeader = mappings[field.key];
        data[field.key] = csvHeader ? rawRow[csvHeader]?.trim() : '';
      });

      // Special handling: if Name Split is needed (e.g. if firstName and lastName are mapped to same column, or firstName contains full name)
      // If we don't have a lastName mapped, but firstName contains spaces, split it.
      if (data.firstName && !data.lastName) {
        const parts = data.firstName.split(/\s+/);
        if (parts.length > 1) {
          data.firstName = parts[0];
          data.lastName = parts.slice(1).join(' ');
        }
      }

      // 2. Normalization: Salary numeric extraction
      if (data.grossSalary) {
        const cleaned = data.grossSalary.replace(/[^\d.]/g, '');
        data.grossSalary = parseFloat(cleaned) || 0;
      } else {
        data.grossSalary = 0;
      }

      // 3. Normalization: Employment Status / Employee Type
      if (data.employeeType) {
        const typeLower = data.employeeType.toLowerCase().replace(/[\s-_]/g, '');
        if (['hourly', 'parttime', 'pt'].includes(typeLower)) {
          data.employeeType = EmployeeType.HOURLY;
        } else if (['contract', 'contractor', 'temp'].includes(typeLower)) {
          data.employeeType = EmployeeType.CONTRACTOR;
        } else {
          data.employeeType = EmployeeType.STAFF;
        }
      } else {
        data.employeeType = EmployeeType.STAFF;
      }

      // 4. Normalization: Pay Type
      if (data.payType) {
        const typeLower = data.payType.toLowerCase().replace(/[\s-_]/g, '');
        if (['hourly'].includes(typeLower)) {
          data.payType = PayType.HOURLY;
        } else if (['commission'].includes(typeLower)) {
          data.payType = PayType.COMMISSION;
        } else {
          data.payType = PayType.SALARIED;
        }
      } else {
        data.payType = data.employeeType === EmployeeType.HOURLY ? PayType.HOURLY : PayType.SALARIED;
      }

      // 5. Normalization: Pay Frequency
      if (data.payFrequency) {
        const freqLower = data.payFrequency.toLowerCase().replace(/[\s-_]/g, '');
        if (['weekly', 'wk'].includes(freqLower)) {
          data.payFrequency = PayFrequency.WEEKLY;
        } else if (['fortnightly', 'fn', 'biweekly'].includes(freqLower)) {
          data.payFrequency = PayFrequency.FORTNIGHTLY;
        } else {
          data.payFrequency = PayFrequency.MONTHLY;
        }
      } else {
        data.payFrequency = PayFrequency.MONTHLY;
      }

      // 6. Normalization: Clean TRN
      if (data.trn) {
        data.trn = data.trn.replace(/[^\d-]/g, '');
      }

      // 7. Normalization: Hourly Rate and Pension Rate
      if (data.hourlyRate && typeof data.hourlyRate === 'string') {
        const cleaned = data.hourlyRate.replace(/[^\d.]/g, '');
        data.hourlyRate = parseFloat(cleaned) || 0;
      }
      if (data.pensionContributionRate && typeof data.pensionContributionRate === 'string') {
        const cleaned = data.pensionContributionRate.replace(/[^\d.]/g, '');
        data.pensionContributionRate = parseFloat(cleaned) || 0;
      }

      // Check fields and populate validation errors
      const errors: Record<string, string> = {};
      if (!data.firstName) errors.firstName = 'First name is required.';
      if (!data.email) {
        errors.email = 'Email is required.';
      } else if (!isValidEmail(data.email)) {
        errors.email = 'Invalid email format.';
      }

      if (isNaN(data.grossSalary) || data.grossSalary <= 0) {
        errors.grossSalary = 'Gross salary must be a positive number.';
      }

      if (data.trn && !isValidTRN(data.trn)) {
        errors.trn = 'TRN must be exactly 9 digits.';
      }

      if (data.nis && !isValidNIS(data.nis)) {
        errors.nis = 'NIS format must be Letter + 6 digits or PENDING.';
      }

      return {
        id: generateUUID(),
        originalIndex: index,
        data,
        errors,
        isDuplicateFile: false,
        isDuplicateDb: false,
        duplicateAction: 'none' as 'skip' | 'overwrite' | 'none'
      };
    });

    // Step 3 duplicate checking:
    const seenEmails = new Set<string>();
    processed.forEach(rec => {
      if (!rec.data.email) return;
      const emailLower = rec.data.email.toLowerCase();

      // Check internal duplicate
      if (seenEmails.has(emailLower)) {
        rec.isDuplicateFile = true;
        rec.errors.email = 'Duplicate email found within your uploaded file.';
      } else {
        seenEmails.add(emailLower);
      }

      // Check DB duplicate
      const existsInDb = existingEmployees.find(e => e.email.toLowerCase() === emailLower);
      if (existsInDb) {
        rec.isDuplicateDb = true;
        rec.duplicateAction = 'skip'; // Default duplicate action
        rec.errors.email = 'An employee with this email already exists in this company.';
      }
    });

    setValidatedRecords(processed);
    setStep(3);
  };

  const handleUpdateRecordField = (recordId: string, field: string, value: any) => {
    setValidatedRecords(prev => prev.map(rec => {
      if (rec.id !== recordId) return rec;

      const updatedData = { ...rec.data, [field]: value };
      
      // Re-validate fields
      const errors = { ...rec.errors };
      delete errors[field]; // Clear previous error for this field

      if (field === 'firstName' && !value) {
        errors.firstName = 'First name is required.';
      }
      if (field === 'email') {
        if (!value) {
          errors.email = 'Email is required.';
        } else if (!isValidEmail(value)) {
          errors.email = 'Invalid email format.';
        } else {
          // Re-evaluate duplicates
          const existsInDb = existingEmployees.find(e => e.email.toLowerCase() === value.toLowerCase());
          rec.isDuplicateDb = !!existsInDb;
          if (existsInDb) {
            errors.email = 'An employee with this email already exists in this company.';
            rec.duplicateAction = 'skip';
          }
        }
      }
      if (field === 'grossSalary') {
        const num = parseFloat(value);
        if (isNaN(num) || num <= 0) {
          errors.grossSalary = 'Gross salary must be a positive number.';
        } else {
          updatedData.grossSalary = num;
        }
      }
      if (field === 'trn' && value && !isValidTRN(value)) {
        errors.trn = 'TRN must be exactly 9 digits.';
      }
      if (field === 'nis' && value && !isValidNIS(value)) {
        errors.nis = 'NIS format must be Letter + 6 digits or PENDING.';
      }

      return {
        ...rec,
        data: updatedData,
        errors
      };
    }));
  };

  const handleSetDuplicateAction = (recordId: string, action: 'skip' | 'overwrite') => {
    setValidatedRecords(prev => prev.map(rec => {
      if (rec.id !== recordId) return rec;
      return {
        ...rec,
        duplicateAction: action,
        // If overwrite, we suppress the duplicate email error because user actively chose to resolve it
        errors: action === 'overwrite' 
          ? (() => { const e = { ...rec.errors }; delete e.email; return e; })()
          : { ...rec.errors, email: 'An employee with this email already exists in this company.' }
      };
    }));
  };

  const handleSkipRow = (recordId: string) => {
    setValidatedRecords(prev => prev.filter(rec => rec.id !== recordId));
  };

  const handleSaveAndImport = () => {
    // Check if there are any remaining unresolved errors
    const recordsWithErrors = validatedRecords.filter(rec => {
      // If duplicateAction is 'skip', we don't count errors since we skip it anyway
      if (rec.isDuplicateDb && rec.duplicateAction === 'skip') return false;
      return Object.keys(rec.errors).length > 0;
    });

    if (recordsWithErrors.length > 0) {
      alert(`Please resolve or skip the ${recordsWithErrors.length} remaining rows with validation errors.`);
      return;
    }

    // Assemble final records list
    const finalEmployees: Employee[] = [];
    let skippedCount = 0;
    
    // Departments check/add logic
    const newDepartments: Department[] = [...departments];
    let createdDepts = false;

    validatedRecords.forEach(rec => {
      if (rec.isDuplicateDb && rec.duplicateAction === 'skip') {
        skippedCount++;
        return;
      }

      // Department mapping
      let departmentId = '';
      if (rec.data.department) {
        const deptName = rec.data.department.trim();
        const matched = newDepartments.find(d => d.name.toLowerCase() === deptName.toLowerCase());
        if (matched) {
          departmentId = matched.id;
        } else {
          // Auto create department
          const newDept: Department = { id: generateUUID(), name: deptName };
          newDepartments.push(newDept);
          departmentId = newDept.id;
          createdDepts = true;
        }
      }

      let employeeRecord: Employee;

      if (rec.isDuplicateDb && rec.duplicateAction === 'overwrite') {
        // Retrieve existing properties to avoid wiping them out
        const existing = existingEmployees.find(e => e.email.toLowerCase() === rec.data.email.toLowerCase())!;
        employeeRecord = {
          ...existing,
          firstName: rec.data.firstName,
          lastName: rec.data.lastName || '',
          trn: rec.data.trn || existing.trn || '',
          nis: rec.data.nis || existing.nis || '',
          grossSalary: rec.data.grossSalary,
          hourlyRate: rec.data.hourlyRate !== undefined ? rec.data.hourlyRate : existing.hourlyRate,
          jobTitle: rec.data.jobTitle || existing.jobTitle || '',
          phone: rec.data.phone || existing.phone || '',
          address: rec.data.address || existing.address || '',
          emergencyContact: rec.data.emergencyContact || existing.emergencyContact || '',
          department: departmentId || existing.department || '',
          employeeType: rec.data.employeeType || existing.employeeType || EmployeeType.STAFF,
          payType: rec.data.payType || existing.payType || PayType.SALARIED,
          payFrequency: rec.data.payFrequency || existing.payFrequency || PayFrequency.MONTHLY,
          status: rec.data.status || existing.status || 'ACTIVE',
          hireDate: rec.data.hireDate || existing.hireDate || new Date().toISOString().split('T')[0],
          joiningDate: rec.data.joiningDate || existing.joiningDate || undefined,
          pensionContributionRate: rec.data.pensionContributionRate !== undefined ? rec.data.pensionContributionRate : existing.pensionContributionRate,
          pensionProvider: rec.data.pensionProvider || existing.pensionProvider || '',
          bankDetails: {
            bankName: rec.data.bankName || existing.bankDetails?.bankName || 'NCB',
            accountNumber: rec.data.bankAccountNumber || existing.bankDetails?.accountNumber || '',
            accountType: rec.data.bankAccountType || existing.bankDetails?.accountType || 'SAVINGS',
            currency: rec.data.bankCurrency || existing.bankDetails?.currency || 'JMD'
          }
        };
      } else {
        // Build new employee record
        employeeRecord = {
          id: generateUUID(),
          firstName: rec.data.firstName,
          lastName: rec.data.lastName || '',
          email: rec.data.email,
          trn: rec.data.trn || '',
          nis: rec.data.nis || 'PENDING',
          grossSalary: rec.data.grossSalary,
          hourlyRate: rec.data.hourlyRate || undefined,
          payType: rec.data.payType || PayType.SALARIED,
          payFrequency: rec.data.payFrequency || PayFrequency.MONTHLY,
          employeeType: rec.data.employeeType || EmployeeType.STAFF,
          role: Role.EMPLOYEE,
          status: rec.data.status || 'ACTIVE',
          hireDate: rec.data.hireDate || new Date().toISOString().split('T')[0],
          joiningDate: rec.data.joiningDate || undefined,
          emergencyContact: rec.data.emergencyContact || '',
          pensionContributionRate: rec.data.pensionContributionRate || 0,
          pensionProvider: rec.data.pensionProvider || '',
          jobTitle: rec.data.jobTitle || undefined,
          department: departmentId || undefined,
          phone: rec.data.phone || undefined,
          address: rec.data.address || undefined,
          allowances: [],
          deductions: [],
          customDeductions: [],
          bankDetails: {
            bankName: rec.data.bankName || 'NCB',
            accountNumber: rec.data.bankAccountNumber || '',
            accountType: rec.data.bankAccountType || 'SAVINGS',
            currency: rec.data.bankCurrency || 'JMD'
          }
        };
      }

      finalEmployees.push(employeeRecord);
    });

    if (createdDepts && onUpdateDepartments) {
      onUpdateDepartments(newDepartments);
    }

    if (saveTemplate && newTemplateName.trim()) {
      handleSaveTemplate();
    }

    onImportComplete(finalEmployees, skippedCount);
    setStep(4);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-fade-in">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl overflow-hidden flex flex-col max-h-[90vh] border border-gray-100 animate-scale-in">
        
        {/* Wizard Header */}
        <div className="bg-gradient-to-r from-jam-black to-gray-900 p-6 text-white flex justify-between items-center shrink-0">
          <div>
            <h3 className="text-xl font-bold tracking-tight">CSV Employee Data Mapping</h3>
            <p className="text-gray-400 text-xs mt-1">Easily map custom CSV headers to database properties.</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors p-1.5 hover:bg-white/10 rounded-full">
            <Icons.Close className="w-5 h-5" />
          </button>
        </div>

        {/* Progress Bar */}
        <div className="bg-gray-50 border-b border-gray-200 py-3.5 px-8 shrink-0 flex items-center justify-between">
          <div className="flex items-center space-x-12 w-full max-w-3xl mx-auto justify-between">
            {[
              { num: 1, label: 'Upload file' },
              { num: 2, label: 'Map fields' },
              { num: 3, label: 'Verify data' },
              { num: 4, label: 'Complete!' }
            ].map(s => (
              <div key={s.num} className="flex items-center flex-1 last:flex-none">
                <div className="flex items-center space-x-2">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold border transition-all text-sm
                    ${step === s.num 
                      ? 'bg-jam-orange border-jam-orange text-jam-black font-extrabold shadow-sm' 
                      : step > s.num 
                        ? 'bg-jam-black border-jam-black text-white' 
                        : 'bg-white border-gray-300 text-gray-400'
                    }`}>
                    {step > s.num ? <Icons.CheckMark className="w-4 h-4" /> : s.num}
                  </div>
                  <span className={`text-xs font-semibold ${step === s.num ? 'text-gray-900 font-bold' : 'text-gray-500'}`}>
                    {s.label}
                  </span>
                </div>
                {s.num < 4 && (
                  <div className={`flex-1 h-0.5 mx-4 rounded ${step > s.num ? 'bg-jam-black' : 'bg-gray-200'}`} />
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Wizard Steps */}
        <div className="flex-1 overflow-y-auto p-8 min-h-[400px]">
          
          {/* STEP 1: Upload File */}
          {step === 1 && (
            <div className="flex flex-col items-center justify-center py-10 space-y-6 max-w-lg mx-auto text-center">
              <div className="w-20 h-20 bg-gray-50 rounded-full flex items-center justify-center border-2 border-dashed border-gray-300 hover:border-jam-orange transition-colors">
                <Icons.Upload className="w-10 h-10 text-gray-400" />
              </div>
              <div>
                <h4 className="text-lg font-bold text-gray-900">Upload your employee CSV file</h4>
                <p className="text-gray-500 text-sm mt-1">Select any structured file containing employee data. You will be able to map headers in the next step.</p>
              </div>

              <input
                type="file"
                accept=".csv"
                ref={fileInputRef}
                onChange={handleFileChange}
                className="hidden"
              />

              <div className="w-full flex flex-col space-y-3">
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full bg-jam-black text-white hover:bg-gray-800 py-3 rounded-lg font-bold transition-all shadow-md flex items-center justify-center space-x-2"
                >
                  <Icons.Upload className="w-4 h-4" />
                  <span>Choose File...</span>
                </button>
              </div>
            </div>
          )}

          {/* STEP 2: Header Mapping */}
          {step === 2 && (
            <div className="space-y-6">
              <div className="flex justify-between items-center bg-gray-50 p-4 rounded-xl border border-gray-200">
                <div className="flex items-center space-x-3">
                  <Icons.Company className="w-5 h-5 text-gray-500" />
                  <div>
                    <p className="text-sm font-bold text-gray-900">File: {file?.name}</p>
                    <p className="text-xs text-gray-500">{rawRows.length} rows, {csvHeaders.length} columns detected</p>
                  </div>
                </div>
                
                {/* Apply saved templates */}
                {templates.length > 0 && (
                  <div className="flex items-center space-x-2">
                    <label className="text-xs font-semibold text-gray-700">Apply Template:</label>
                    <select
                      value={selectedTemplateName}
                      onChange={(e) => handleApplyTemplate(e.target.value)}
                      className="border border-gray-300 rounded-lg p-1.5 text-xs bg-white focus:ring-1 focus:ring-jam-orange"
                    >
                      <option value="">-- Choose Template --</option>
                      {templates.map(t => (
                        <option key={t.name} value={t.name}>{t.name}</option>
                      ))}
                    </select>
                  </div>
                )}
              </div>

              <div>
                <h4 className="text-md font-bold text-gray-900 mb-2">Map CSV Columns to System Fields</h4>
                <p className="text-xs text-gray-500 mb-4">Link headers from your uploaded file to the fields required by Payroll-Jam.</p>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {SYSTEM_FIELDS.map(field => {
                    const mappedHeader = mappings[field.key];
                    const isAutoMatched = mappedHeader && field.aliases.some(a => mappedHeader.toLowerCase().includes(a));
                    
                    return (
                      <div key={field.key} className="flex flex-col space-y-1.5 p-4 rounded-xl border bg-white border-gray-200 hover:border-gray-300 transition-all">
                        <div className="flex justify-between items-center">
                          <label className="text-sm font-bold text-gray-900 flex items-center">
                            {field.label}
                            {field.isMandatory && <span className="text-red-500 ml-1">*</span>}
                          </label>
                          {mappedHeader && (
                            <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider
                              ${isAutoMatched ? 'bg-green-100 text-green-800' : 'bg-blue-100 text-blue-800'}`}>
                              {isAutoMatched ? 'Auto-Matched' : 'Manually Matched'}
                            </span>
                          )}
                        </div>
                        
                        <select
                          value={mappedHeader || ''}
                          onChange={(e) => setMappings(prev => ({ ...prev, [field.key]: e.target.value }))}
                          className={`w-full border rounded-lg p-2.5 text-sm focus:ring-1 focus:ring-jam-orange bg-white
                            ${field.isMandatory && !mappedHeader ? 'border-red-300 focus:border-red-400 bg-red-50/10' : 'border-gray-300 focus:border-jam-orange'}`}
                        >
                          <option value="">-- Do Not Map --</option>
                          {csvHeaders.map(header => (
                            <option key={header} value={header}>{header}</option>
                          ))}
                        </select>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Template Saver */}
              <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    id="saveTemplateCheck"
                    checked={saveTemplate}
                    onChange={(e) => setSaveTemplate(e.target.checked)}
                    className="h-4 w-4 rounded border-gray-300 text-jam-orange focus:ring-jam-orange"
                  />
                  <label htmlFor="saveTemplateCheck" className="text-sm font-semibold text-gray-800 cursor-pointer">
                    Save this column mapping as a template for future imports?
                  </label>
                </div>

                {saveTemplate && (
                  <div className="flex items-center space-x-2 flex-1 md:max-w-xs">
                    <input
                      type="text"
                      placeholder="Template Name (e.g. ADP Import)"
                      value={newTemplateName}
                      onChange={(e) => setNewTemplateName(e.target.value)}
                      className="border border-gray-300 rounded-lg p-2 text-sm w-full focus:ring-1 focus:ring-jam-orange focus:border-jam-orange"
                    />
                  </div>
                )}
              </div>

              <div className="flex justify-between items-center pt-4 border-t border-gray-100 shrink-0">
                <button
                  onClick={() => setStep(1)}
                  className="px-5 py-2.5 border border-gray-300 hover:bg-gray-50 text-gray-700 font-bold rounded-lg transition-colors flex items-center space-x-2 text-sm"
                >
                  <Icons.Back className="w-4 h-4" />
                  <span>Back</span>
                </button>
                <button
                  onClick={handleProceedToValidation}
                  className="px-6 py-2.5 bg-jam-black text-white hover:bg-gray-800 font-bold rounded-lg transition-colors shadow-md text-sm"
                >
                  Validate Data
                </button>
              </div>
            </div>
          )}

          {/* STEP 3: Normalization & Error Review */}
          {step === 3 && (
            <div className="space-y-6">
              <div>
                <h4 className="text-md font-bold text-gray-900">Normalize and Verify Uploaded Data</h4>
                <p className="text-xs text-gray-500 mt-1">Review format errors, internal duplicates, and existing database matches before inserting. Fix problems inline below.</p>
              </div>

              <div className="border border-gray-200 rounded-xl overflow-hidden bg-white shadow-sm">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-gray-50 text-gray-700 border-b border-gray-200 font-bold uppercase tracking-wider text-[10px]">
                      <th className="p-3 border-r border-gray-200 w-12 text-center">Row</th>
                      <th className="p-3 border-r border-gray-200">First Name</th>
                      <th className="p-3 border-r border-gray-200">Last Name</th>
                      <th className="p-3 border-r border-gray-200">Email Address</th>
                      <th className="p-3 border-r border-gray-200">TRN</th>
                      <th className="p-3 border-r border-gray-200 w-36">Gross Salary</th>
                      <th className="p-3 border-r border-gray-200">Match Action / Validation status</th>
                      <th className="p-3 text-center w-20">Skip</th>
                    </tr>
                  </thead>
                  <tbody>
                    {validatedRecords.map((rec) => {
                      const hasErrors = Object.keys(rec.errors).length > 0;
                      
                      return (
                        <tr key={rec.id} className={`border-b border-gray-150 transition-colors hover:bg-gray-50/50
                          ${hasErrors ? 'bg-red-50/20' : rec.isDuplicateDb ? 'bg-yellow-50/20' : ''}`}>
                          
                          {/* Row Index */}
                          <td className="p-3 border-r border-gray-200 text-center font-semibold text-gray-500">
                            {rec.originalIndex + 1}
                          </td>

                          {/* First Name */}
                          <td className="p-3 border-r border-gray-200">
                            <input
                              type="text"
                              value={rec.data.firstName || ''}
                              onChange={(e) => handleUpdateRecordField(rec.id, 'firstName', e.target.value)}
                              className={`w-full border rounded p-1.5 focus:ring-1 focus:ring-jam-orange
                                ${rec.errors.firstName ? 'border-red-400 bg-red-50 text-red-900' : 'border-gray-300'}`}
                            />
                            {rec.errors.firstName && <span className="text-[10px] text-red-600 block mt-0.5">{rec.errors.firstName}</span>}
                          </td>

                          {/* Last Name */}
                          <td className="p-3 border-r border-gray-200">
                            <input
                              type="text"
                              value={rec.data.lastName || ''}
                              onChange={(e) => handleUpdateRecordField(rec.id, 'lastName', e.target.value)}
                              className="w-full border border-gray-300 rounded p-1.5 focus:ring-1 focus:ring-jam-orange"
                            />
                          </td>

                          {/* Email */}
                          <td className="p-3 border-r border-gray-200">
                            <input
                              type="email"
                              value={rec.data.email || ''}
                              disabled={rec.isDuplicateDb}
                              onChange={(e) => handleUpdateRecordField(rec.id, 'email', e.target.value)}
                              className={`w-full border rounded p-1.5 focus:ring-1 focus:ring-jam-orange disabled:bg-gray-100 disabled:text-gray-600
                                ${rec.errors.email ? 'border-red-400 bg-red-50 text-red-900' : 'border-gray-300'}`}
                            />
                            {rec.errors.email && <span className="text-[10px] text-red-600 block mt-0.5">{rec.errors.email}</span>}
                          </td>

                          {/* TRN */}
                          <td className="p-3 border-r border-gray-200">
                            <input
                              type="text"
                              maxLength={9}
                              value={rec.data.trn || ''}
                              onChange={(e) => handleUpdateRecordField(rec.id, 'trn', e.target.value)}
                              className={`w-full border rounded p-1.5 focus:ring-1 focus:ring-jam-orange
                                ${rec.errors.trn ? 'border-red-400 bg-red-50 text-red-900' : 'border-gray-300'}`}
                            />
                            {rec.errors.trn && <span className="text-[10px] text-red-600 block mt-0.5">{rec.errors.trn}</span>}
                          </td>

                          {/* Gross Salary */}
                          <td className="p-3 border-r border-gray-200">
                            <div className="relative">
                              <span className="absolute left-2.5 top-2.5 text-gray-500 font-medium">$</span>
                              <input
                                type="text"
                                value={rec.data.grossSalary || ''}
                                onChange={(e) => handleUpdateRecordField(rec.id, 'grossSalary', e.target.value)}
                                className={`w-full border rounded pl-6 pr-2 py-1.5 focus:ring-1 focus:ring-jam-orange font-mono
                                  ${rec.errors.grossSalary ? 'border-red-400 bg-red-50 text-red-900' : 'border-gray-300'}`}
                              />
                            </div>
                            {rec.errors.grossSalary && <span className="text-[10px] text-red-600 block mt-0.5">{rec.errors.grossSalary}</span>}
                          </td>

                          {/* Duplicate Options / Validation status */}
                          <td className="p-3 border-r border-gray-200">
                            {rec.isDuplicateDb ? (
                              <div className="flex flex-col space-y-1.5">
                                <span className="text-[10px] text-amber-800 bg-amber-100 px-2 py-0.5 rounded-full font-bold self-start uppercase">
                                  Duplicate Match
                                </span>
                                <div className="flex items-center space-x-3 mt-1">
                                  <label className="flex items-center text-xs font-semibold cursor-pointer">
                                    <input
                                      type="radio"
                                      name={`dupAction-${rec.id}`}
                                      checked={rec.duplicateAction === 'skip'}
                                      onChange={() => handleSetDuplicateAction(rec.id, 'skip')}
                                      className="mr-1.5 text-jam-orange focus:ring-jam-orange"
                                    />
                                    Skip Row
                                  </label>
                                  <label className="flex items-center text-xs font-semibold cursor-pointer text-amber-700">
                                    <input
                                      type="radio"
                                      name={`dupAction-${rec.id}`}
                                      checked={rec.duplicateAction === 'overwrite'}
                                      onChange={() => handleSetDuplicateAction(rec.id, 'overwrite')}
                                      className="mr-1.5 text-jam-orange focus:ring-jam-orange"
                                    />
                                    Overwrite
                                  </label>
                                </div>
                              </div>
                            ) : rec.isDuplicateFile ? (
                              <span className="text-red-700 font-semibold bg-red-100/50 px-2.5 py-1 rounded-lg">Duplicate in CSV file</span>
                            ) : hasErrors ? (
                              <span className="text-red-700 font-semibold flex items-center space-x-1.5">
                                <Icons.Alert className="w-3.5 h-3.5 text-red-500" />
                                <span>Invalid Input</span>
                              </span>
                            ) : (
                              <span className="text-green-700 font-semibold flex items-center space-x-1.5">
                                <Icons.CheckMark className="w-3.5 h-3.5 text-green-500" />
                                <span>Clean & Ready</span>
                              </span>
                            )}
                          </td>

                          {/* Skip Row */}
                          <td className="p-3 text-center">
                            <button
                              onClick={() => handleSkipRow(rec.id)}
                              className="text-gray-400 hover:text-red-600 transition-colors p-1 hover:bg-gray-100 rounded"
                              title="Skip and drop this employee"
                            >
                              <Icons.Close className="w-4 h-4" />
                            </button>
                          </td>

                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div className="flex justify-between items-center pt-4 border-t border-gray-100 shrink-0">
                <button
                  onClick={() => setStep(2)}
                  className="px-5 py-2.5 border border-gray-300 hover:bg-gray-50 text-gray-700 font-bold rounded-lg transition-colors flex items-center space-x-2 text-sm"
                >
                  <Icons.Back className="w-4 h-4" />
                  <span>Back</span>
                </button>
                <button
                  onClick={handleSaveAndImport}
                  className="px-6 py-2.5 bg-jam-orange text-jam-black hover:bg-yellow-500 font-bold rounded-lg transition-colors shadow-md text-sm"
                >
                  Save & Import
                </button>
              </div>
            </div>
          )}

          {/* STEP 4: Success & Import Complete */}
          {step === 4 && (
            <div className="flex flex-col items-center justify-center py-12 space-y-6 max-w-md mx-auto text-center">
              <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center">
                <Icons.Check className="w-8 h-8 text-green-600" />
              </div>
              <div>
                <h4 className="text-xl font-bold text-gray-900">Import Complete!</h4>
                <p className="text-gray-500 text-sm mt-2">Your workforce has been updated with the mapped employee rows.</p>
              </div>

              <button
                onClick={onClose}
                className="w-full bg-jam-black text-white hover:bg-gray-800 py-3 rounded-lg font-bold transition-all shadow-md"
              >
                Finish & View List
              </button>
            </div>
          )}

        </div>

      </div>
    </div>
  );
};
