import React, { useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Icons } from '../../components/Icons';
import { Employee, PayRun, PayRunLineItem, Role, PayType, PayFrequency, EmployeeType } from '../../core/types';
import { generateUUID } from '../../utils/uuid';
import { isValidEmail } from '../../utils/validators';
import {
  ComplianceImportRow,
  buildImportedLineItem,
  buildImportedPayRun,
  mapComplianceRecords,
  parseComplianceReport,
} from '../../utils/complianceReportImport';
import { ComplianceReportType } from '../../services/ComplianceReportService';

interface ComplianceImportWizardProps {
  isOpen: boolean;
  onClose: () => void;
  existingEmployees: Employee[];
  onAddEmployee: (employee: Employee) => boolean | Promise<boolean>;
  onSavePayRun: (run: PayRun) => void | boolean | Promise<void | boolean>;
  onImported: (summary: { reportType: ComplianceReportType; period: string; employeeCount: number }) => void;
}

type Step = 'upload' | 'period' | 'complete' | 'preview' | 'saving';

// Normalize a TRN to its 9 digits for matching against existing employees.
const trnDigits = (value: string) => value.replace(/\D/g, '');

interface EditableRow {
  row: ComplianceImportRow;
  matchedEmployeeId: string | null;
  matchedName: string | null;
  firstName: string;
  lastName: string;
  email: string;
  hireDate: string;
}

export const ComplianceImportWizard: React.FC<ComplianceImportWizardProps> = ({
  isOpen,
  onClose,
  existingEmployees,
  onAddEmployee,
  onSavePayRun,
  onImported,
}) => {
  const [step, setStep] = useState<Step>('upload');
  const [reportType, setReportType] = useState<ComplianceReportType>('S02');
  const [rows, setRows] = useState<ComplianceImportRow[]>([]);
  const [editableRows, setEditableRows] = useState<EditableRow[]>([]);
  const [fileName, setFileName] = useState('');
  const [period, setPeriod] = useState('');
  const [isParsing, setIsParsing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const today = new Date().toISOString().slice(0, 10);
  const currentYear = new Date().getFullYear();

  const reset = () => {
    setStep('upload');
    setReportType('S02');
    setRows([]);
    setEditableRows([]);
    setFileName('');
    setPeriod('');
    setIsParsing(false);
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const findMatch = (row: ComplianceImportRow): { id: string; name: string } | null => {
    const rowTrn = trnDigits(row.trn);
    if (rowTrn.length === 9) {
      const byTrn = existingEmployees.find((emp) => trnDigits(emp.trn || '') === rowTrn);
      if (byTrn) return { id: byTrn.id, name: `${byTrn.firstName} ${byTrn.lastName}`.trim() };
    }
    const fullName = `${row.firstName} ${row.lastName}`.trim().toLowerCase();
    if (fullName) {
      const byName = existingEmployees.find(
        (emp) => `${emp.firstName} ${emp.lastName}`.trim().toLowerCase() === fullName,
      );
      if (byName) return { id: byName.id, name: `${byName.firstName} ${byName.lastName}`.trim() };
    }
    return null;
  };

  const handleFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setIsParsing(true);
    try {
      const parsed = await parseComplianceReport(file);
      const mapped = mapComplianceRecords(parsed);
      setReportType(parsed.reportType);
      setRows(mapped);
      setFileName(file.name);
      setPeriod(parsed.reportType === 'S02' ? String(currentYear) : new Date().toISOString().slice(0, 7));
      setEditableRows(
        mapped.map((row) => {
          const match = findMatch(row);
          return {
            row,
            matchedEmployeeId: match?.id ?? null,
            matchedName: match?.name ?? null,
            firstName: row.firstName,
            lastName: row.lastName,
            email: '',
            hireDate: today,
          };
        }),
      );
      setStep('period');
    } catch (error: any) {
      console.error('Compliance import parse failed:', error);
      toast.error(error?.message || 'Could not read the report file.');
    } finally {
      setIsParsing(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const updateRow = (index: number, patch: Partial<EditableRow>) => {
    setEditableRows((prev) => prev.map((r, i) => (i === index ? { ...r, ...patch } : r)));
  };

  const newRows = editableRows.filter((r) => !r.matchedEmployeeId);
  const matchedCount = editableRows.length - newRows.length;

  const completeErrors = useMemo(() => {
    const errors: string[] = [];
    newRows.forEach((r) => {
      const label = `${r.firstName} ${r.lastName}`.trim() || 'Unnamed employee';
      if (!r.firstName.trim() || !r.lastName.trim()) errors.push(`${label}: first and last name are required.`);
      if (!isValidEmail(r.email)) errors.push(`${label}: a valid email is required.`);
      if (!r.hireDate) errors.push(`${label}: hire date is required.`);
    });
    return errors;
  }, [newRows]);

  const totals = useMemo(() => {
    return rows.reduce(
      (acc, row) => ({
        gross: acc.gross + row.gross,
        nis: acc.nis + row.nisEmployee + row.nisEmployer,
        nht: acc.nht + row.nhtEmployee + row.nhtEmployer,
        edTax: acc.edTax + row.edTaxEmployee + row.edTaxEmployer,
        paye: acc.paye + row.paye,
        heart: acc.heart + row.heartEmployer,
      }),
      { gross: 0, nis: 0, nht: 0, edTax: 0, paye: 0, heart: 0 },
    );
  }, [rows]);

  const periodValid =
    reportType === 'S02' ? /^\d{4}$/.test(period) : /^\d{4}-(0[1-9]|1[0-2])$/.test(period);

  const handleConfirm = async () => {
    setStep('saving');
    try {
      const lineItems: PayRunLineItem[] = [];

      for (const editable of editableRows) {
        let employeeId = editable.matchedEmployeeId;
        let employeeName = editable.matchedName;

        if (!employeeId) {
          const newEmployee: Employee = {
            id: generateUUID(),
            firstName: editable.firstName.trim(),
            lastName: editable.lastName.trim(),
            email: editable.email.trim(),
            trn: editable.row.trn,
            nis: editable.row.nis,
            grossSalary: editable.row.gross,
            payType: PayType.SALARIED,
            payFrequency: PayFrequency.MONTHLY,
            employeeType: EmployeeType.STAFF,
            role: Role.EMPLOYEE,
            status: 'ACTIVE',
            hireDate: editable.hireDate,
          };
          const created = await onAddEmployee(newEmployee);
          if (created === false) {
            toast.error(`Could not create ${newEmployee.firstName} ${newEmployee.lastName} (plan limit reached?). Import stopped.`);
            setStep('preview');
            return;
          }
          employeeId = newEmployee.id;
          employeeName = `${newEmployee.firstName} ${newEmployee.lastName}`.trim();
        }

        lineItems.push(buildImportedLineItem(editable.row, employeeId, employeeName || 'Employee'));
      }

      const payRun = buildImportedPayRun(reportType, period, lineItems, generateUUID());
      await onSavePayRun(payRun);

      onImported({ reportType, period, employeeCount: editableRows.length });
      toast.success(`Imported ${reportType} for ${period} — ${editableRows.length} employee(s), 1 finalized pay run.`);
      handleClose();
    } catch (error: any) {
      console.error('Compliance import failed:', error);
      toast.error(error?.message || 'Import failed while creating records.');
      setStep('preview');
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
          <div>
            <h3 className="font-bold text-gray-900">Import TAJ S01 / S02</h3>
            <p className="text-xs text-gray-500">Reconstitute employees and a finalized pay run from a filing.</p>
          </div>
          <button onClick={handleClose} className="text-gray-400 hover:text-gray-600">
            <Icons.Close className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 overflow-y-auto">
          {step === 'upload' && (
            <div className="text-center py-8">
              <Icons.Upload className="w-12 h-12 text-gray-300 mx-auto mb-4" />
              <p className="text-gray-600 mb-4">Upload an exported S01 Schedule A (.xlsx) or S02 annual return (.csv).</p>
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.csv"
                className="hidden"
                onChange={handleFile}
              />
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={isParsing}
                className="px-6 py-2.5 bg-jam-black text-white rounded-lg text-sm font-bold hover:bg-gray-800 disabled:opacity-60"
              >
                {isParsing ? 'Reading file…' : 'Select File'}
              </button>
            </div>
          )}

          {step === 'period' && (
            <div className="space-y-4">
              <div className="bg-blue-50 border border-blue-100 rounded-lg p-3 text-sm text-blue-800">
                Detected <strong>{reportType}</strong> from <strong>{fileName}</strong> with {rows.length} employee row(s).
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Report type</label>
                <select
                  value={reportType}
                  onChange={(e) => {
                    const next = e.target.value as ComplianceReportType;
                    setReportType(next);
                    setPeriod(next === 'S02' ? String(currentYear) : new Date().toISOString().slice(0, 7));
                  }}
                  className="w-full border border-gray-300 rounded-lg p-2.5 text-sm"
                >
                  <option value="S01">S01 (monthly)</option>
                  <option value="S02">S02 (annual)</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase mb-1">
                  {reportType === 'S02' ? 'Reporting year' : 'Reporting month'}
                </label>
                <input
                  type={reportType === 'S02' ? 'number' : 'month'}
                  value={period}
                  onChange={(e) => setPeriod(e.target.value)}
                  min={reportType === 'S02' ? 2000 : undefined}
                  max={reportType === 'S02' ? currentYear + 1 : undefined}
                  placeholder={reportType === 'S02' ? 'YYYY' : 'YYYY-MM'}
                  className="w-full border border-gray-300 rounded-lg p-2.5 text-sm"
                />
                <p className="mt-1 text-xs text-gray-500">
                  This is the period the filing covers — select it freely, it isn't tied to existing payroll.
                </p>
              </div>
            </div>
          )}

          {step === 'complete' && (
            <div className="space-y-4">
              <p className="text-sm text-gray-600">
                {matchedCount} row(s) matched to existing employees. {newRows.length} new employee(s) need an email and hire date.
              </p>
              <div className="overflow-x-auto border border-gray-200 rounded-lg">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 text-xs uppercase text-gray-500">
                    <tr>
                      <th className="px-3 py-2 text-left">Employee</th>
                      <th className="px-3 py-2 text-left">TRN</th>
                      <th className="px-3 py-2 text-left">Status</th>
                      <th className="px-3 py-2 text-left">Email</th>
                      <th className="px-3 py-2 text-left">Hire date</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {editableRows.map((r, index) => (
                      <tr key={index}>
                        <td className="px-3 py-2">
                          {r.matchedEmployeeId ? (
                            <span className="font-medium text-gray-900">{r.matchedName}</span>
                          ) : (
                            <div className="flex gap-1">
                              <input
                                value={r.firstName}
                                onChange={(e) => updateRow(index, { firstName: e.target.value })}
                                placeholder="First"
                                className="w-20 border border-gray-300 rounded p-1"
                              />
                              <input
                                value={r.lastName}
                                onChange={(e) => updateRow(index, { lastName: e.target.value })}
                                placeholder="Last"
                                className="w-24 border border-gray-300 rounded p-1"
                              />
                            </div>
                          )}
                        </td>
                        <td className="px-3 py-2 text-gray-500">{r.row.trn || '—'}</td>
                        <td className="px-3 py-2">
                          {r.matchedEmployeeId ? (
                            <span className="inline-flex px-2 py-0.5 rounded-full text-xs bg-green-100 text-green-800">Matched</span>
                          ) : (
                            <span className="inline-flex px-2 py-0.5 rounded-full text-xs bg-jam-orange/20 text-jam-black">New</span>
                          )}
                        </td>
                        <td className="px-3 py-2">
                          {r.matchedEmployeeId ? (
                            <span className="text-gray-400">—</span>
                          ) : (
                            <input
                              type="email"
                              value={r.email}
                              onChange={(e) => updateRow(index, { email: e.target.value })}
                              placeholder="name@company.com"
                              className={`w-48 border rounded p-1 ${r.email && !isValidEmail(r.email) ? 'border-red-400 bg-red-50' : 'border-gray-300'}`}
                            />
                          )}
                        </td>
                        <td className="px-3 py-2">
                          {r.matchedEmployeeId ? (
                            <span className="text-gray-400">—</span>
                          ) : (
                            <input
                              type="date"
                              value={r.hireDate}
                              onChange={(e) => updateRow(index, { hireDate: e.target.value })}
                              className="border border-gray-300 rounded p-1"
                            />
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {completeErrors.length > 0 && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-xs text-red-700 space-y-1 max-h-32 overflow-y-auto">
                  {completeErrors.map((err, i) => <p key={i}>{err}</p>)}
                </div>
              )}
            </div>
          )}

          {step === 'preview' && (
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-gray-50 rounded-lg p-3">
                  <p className="text-xs text-gray-500 uppercase">New employees</p>
                  <p className="text-2xl font-bold text-gray-900">{newRows.length}</p>
                </div>
                <div className="bg-gray-50 rounded-lg p-3">
                  <p className="text-xs text-gray-500 uppercase">Matched</p>
                  <p className="text-2xl font-bold text-gray-900">{matchedCount}</p>
                </div>
                <div className="bg-gray-50 rounded-lg p-3">
                  <p className="text-xs text-gray-500 uppercase">Finalized pay run</p>
                  <p className="text-2xl font-bold text-gray-900">1</p>
                </div>
              </div>
              <div className="bg-jam-black text-white rounded-lg p-4">
                <p className="text-xs text-gray-400 uppercase mb-2">{reportType} · {period}</p>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <span className="text-gray-300">Total Gross</span><span className="text-right font-bold">${totals.gross.toLocaleString()}</span>
                  <span className="text-gray-300">NIS</span><span className="text-right">${totals.nis.toLocaleString()}</span>
                  <span className="text-gray-300">NHT</span><span className="text-right">${totals.nht.toLocaleString()}</span>
                  <span className="text-gray-300">Education Tax</span><span className="text-right">${totals.edTax.toLocaleString()}</span>
                  <span className="text-gray-300">PAYE</span><span className="text-right">${totals.paye.toLocaleString()}</span>
                  <span className="text-gray-300">HEART</span><span className="text-right">${totals.heart.toLocaleString()}</span>
                </div>
              </div>
              <p className="text-xs text-gray-500">
                The pay run will be created as <strong>FINALIZED</strong> and cannot be edited afterwards.
              </p>
            </div>
          )}

          {step === 'saving' && (
            <div className="text-center py-12">
              <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-jam-black mx-auto mb-4" />
              <p className="text-gray-600">Creating employees and finalized pay run…</p>
            </div>
          )}
        </div>

        {step !== 'saving' && (
          <div className="px-6 py-4 border-t border-gray-200 flex justify-between">
            <button
              onClick={step === 'upload' ? handleClose : () => {
                if (step === 'period') setStep('upload');
                else if (step === 'complete') setStep('period');
                else if (step === 'preview') setStep('complete');
              }}
              className="px-5 py-2 text-gray-600 hover:bg-gray-100 rounded-lg font-medium"
            >
              {step === 'upload' ? 'Cancel' : 'Back'}
            </button>
            {step === 'period' && (
              <button
                onClick={() => setStep('complete')}
                disabled={!periodValid}
                className="px-6 py-2 bg-jam-black text-white rounded-lg font-bold hover:bg-gray-800 disabled:opacity-50"
              >
                Continue
              </button>
            )}
            {step === 'complete' && (
              <button
                onClick={() => setStep('preview')}
                disabled={completeErrors.length > 0}
                className="px-6 py-2 bg-jam-black text-white rounded-lg font-bold hover:bg-gray-800 disabled:opacity-50"
              >
                Review
              </button>
            )}
            {step === 'preview' && (
              <button
                onClick={handleConfirm}
                className="px-6 py-2 bg-jam-orange text-jam-black rounded-lg font-bold hover:bg-yellow-500"
              >
                Create records
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
