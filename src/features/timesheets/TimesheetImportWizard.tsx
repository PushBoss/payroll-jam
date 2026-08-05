import React, { useRef, useState } from 'react';
import Papa from 'papaparse';
import { Employee, TimeEntry, WeeklyTimesheet } from '../../core/types';
import { Icons } from '../../components/Icons';
import { generateUUID } from '../../utils/uuid';
import { calculateEntryHours, getWeekBoundsFromDateString, summarizeTimeEntries } from '../../utils/attendance';

interface TimesheetImportWizardProps {
  isOpen: boolean;
  onClose: () => void;
  employees: Employee[];
  existingTimesheets: WeeklyTimesheet[];
  companyId?: string;
  onSaveTimesheet?: (timesheet: WeeklyTimesheet) => void | boolean | Promise<void | boolean>;
}

interface MappingField {
  key: string;
  label: string;
  aliases: string[];
}

const EMPLOYEE_FIELD: MappingField = {
  key: 'employeeIdentifier',
  label: 'Employee (name, email, or employee ID)',
  aliases: ['employee', 'name', 'employee name', 'email', 'employee id', 'emp id', 'staff', 'worker', 'staff name'],
};

const DAILY_SHAPE_FIELDS: MappingField[] = [
  { key: 'date', label: 'Date', aliases: ['date', 'work date', 'day'] },
  { key: 'startTime', label: 'Start Time', aliases: ['start', 'start time', 'clock in', 'time in'] },
  { key: 'endTime', label: 'End Time', aliases: ['end', 'end time', 'clock out', 'time out'] },
  { key: 'breakDuration', label: 'Break (minutes)', aliases: ['break', 'break duration', 'break minutes', 'lunch'] },
];

const SUMMARIZED_SHAPE_FIELDS: MappingField[] = [
  { key: 'weekStartDate', label: 'Week Start Date', aliases: ['week start', 'week of', 'week beginning', 'week start date'] },
  { key: 'regularHours', label: 'Regular Hours', aliases: ['regular hours', 'reg hours', 'regular'] },
  { key: 'overtimeHours', label: 'Overtime Hours', aliases: ['overtime hours', 'ot hours', 'overtime', 'ot'] },
];

const ALL_FIELDS: MappingField[] = [EMPLOYEE_FIELD, ...DAILY_SHAPE_FIELDS, ...SUMMARIZED_SHAPE_FIELDS];

interface ImportDraft {
  key: string;
  employeeId: string;
  employeeName: string;
  weekStartDate: string;
  weekEndDate: string;
  entries: TimeEntry[];
  totalRegularHours: number;
  totalOvertimeHours: number;
  isDuplicate: boolean;
  existingId?: string;
  duplicateAction: 'skip' | 'overwrite';
  sourceRowCount: number;
  shape: 'daily' | 'summarized';
}

interface RowIssue {
  originalIndex: number;
  message: string;
}

const parseImportFile = async (file: File): Promise<{ headers: string[]; rows: Record<string, string>[] }> => {
  const extension = file.name.split('.').pop()?.toLowerCase();

  if (extension === 'csv') {
    return new Promise((resolve, reject) => {
      Papa.parse(file, {
        header: true,
        skipEmptyLines: true,
        complete: (results) => {
          const data = (results.data as Record<string, string>[]).filter((row) =>
            Object.values(row).some((value) => value !== null && value !== undefined && String(value).trim() !== '')
          );
          if (data.length === 0) {
            reject(new Error('File has no valid data rows.'));
            return;
          }
          resolve({ headers: Object.keys(data[0] || {}), rows: data });
        },
        error: (err) => reject(err),
      });
    });
  }

  if (extension === 'xlsx' || extension === 'xls') {
    const { default: ExcelJS } = await import('exceljs');
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(await file.arrayBuffer());
    const worksheet = workbook.worksheets[0];
    if (!worksheet) throw new Error('The file has no worksheet.');

    const rawRows: unknown[][] = [];
    worksheet.eachRow({ includeEmpty: false }, (row) => {
      const values = Array.isArray(row.values) ? row.values.slice(1) : [];
      rawRows.push(values.map((value) => value ?? ''));
    });
    if (rawRows.length < 2) throw new Error('File has no data rows below the header.');

    const headers = rawRows[0].map((value) => String(value ?? '').trim());
    const rows = rawRows.slice(1)
      .filter((row) => row.some((value) => String(value ?? '').trim() !== ''))
      .map((row) => Object.fromEntries(headers.map((header, index) => [header, String(row[index] ?? '').trim()])));

    if (rows.length === 0) throw new Error('File has no valid data rows.');
    return { headers, rows };
  }

  throw new Error('Upload a .csv or .xlsx file.');
};

export const TimesheetImportWizard: React.FC<TimesheetImportWizardProps> = ({
  isOpen,
  onClose,
  employees,
  existingTimesheets,
  companyId,
  onSaveTimesheet,
}) => {
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [isParsing, setIsParsing] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [headers, setHeaders] = useState<string[]>([]);
  const [rawRows, setRawRows] = useState<Record<string, string>[]>([]);
  const [mappings, setMappings] = useState<Record<string, string>>({});

  const [drafts, setDrafts] = useState<ImportDraft[]>([]);
  const [unmatchedRows, setUnmatchedRows] = useState<RowIssue[]>([]);
  const [errorRows, setErrorRows] = useState<RowIssue[]>([]);

  const [isImporting, setIsImporting] = useState(false);
  const [importedDrafts, setImportedDrafts] = useState<ImportDraft[]>([]);
  const [importFailedCount, setImportFailedCount] = useState(0);
  const [isApprovingAll, setIsApprovingAll] = useState(false);
  const [approvedAll, setApprovedAll] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const resetAndClose = () => {
    setStep(1);
    setFile(null);
    setHeaders([]);
    setRawRows([]);
    setMappings({});
    setDrafts([]);
    setUnmatchedRows([]);
    setErrorRows([]);
    setImportedDrafts([]);
    setImportFailedCount(0);
    setApprovedAll(false);
    onClose();
  };

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = event.target.files?.[0];
    if (!selectedFile) return;

    setIsParsing(true);
    try {
      const { headers: parsedHeaders, rows } = await parseImportFile(selectedFile);
      setFile(selectedFile);
      setHeaders(parsedHeaders);
      setRawRows(rows);

      const initialMappings: Record<string, string> = {};
      ALL_FIELDS.forEach((field) => {
        let match = parsedHeaders.find((h) => h.trim().toLowerCase() === field.label.toLowerCase() || h.trim().toLowerCase() === field.key.toLowerCase());
        if (!match) {
          match = parsedHeaders.find((h) => {
            const cleaned = h.trim().toLowerCase();
            return field.aliases.some((alias) => cleaned === alias || cleaned.includes(alias));
          });
        }
        initialMappings[field.key] = match || '';
      });
      setMappings(initialMappings);
      setStep(2);
    } catch (err: any) {
      alert(err?.message || 'Failed to read file.');
    } finally {
      setIsParsing(false);
      if (event.target) event.target.value = '';
    }
  };

  const hasDailyShape = Boolean(mappings.date && mappings.startTime && mappings.endTime);
  const hasSummarizedShape = Boolean(mappings.weekStartDate && (mappings.regularHours || mappings.overtimeHours));

  const handleProceedToValidation = () => {
    if (!mappings.employeeIdentifier) {
      alert('Map the Employee field before continuing.');
      return;
    }
    if (!hasDailyShape && !hasSummarizedShape) {
      alert('Map either Date + Start Time + End Time, or Week Start Date + Regular/Overtime Hours.');
      return;
    }

    const employeeByEmail = new Map(employees.map((e) => [e.email.toLowerCase(), e]));
    const employeeByEmpId = new Map(
      employees.filter((e) => e.employeeId).map((e) => [e.employeeId!.trim().toLowerCase(), e])
    );
    const employeeByName = new Map(employees.map((e) => [`${e.firstName} ${e.lastName}`.trim().toLowerCase(), e]));

    const resolveEmployee = (raw: string) => {
      const value = raw.trim().toLowerCase();
      if (!value) return undefined;
      return employeeByEmail.get(value) || employeeByEmpId.get(value) || employeeByName.get(value);
    };

    const buckets = new Map<string, ImportDraft>();
    const newUnmatched: RowIssue[] = [];
    const newErrors: RowIssue[] = [];

    rawRows.forEach((row, index) => {
      const identifierValue = (row[mappings.employeeIdentifier] || '').trim();
      const employee = resolveEmployee(identifierValue);
      if (!employee) {
        newUnmatched.push({ originalIndex: index, message: identifierValue ? `"${identifierValue}" did not match any employee.` : 'No employee identifier in this row.' });
        return;
      }

      let weekStartDate = '';
      let weekEndDate = '';
      let entry: TimeEntry | null = null;
      let directRegular = 0;
      let directOvertime = 0;
      let rowShape: 'daily' | 'summarized' | null = null;

      const dailyRowComplete = hasDailyShape && row[mappings.date] && row[mappings.startTime] && row[mappings.endTime];
      const summarizedRowComplete = hasSummarizedShape && row[mappings.weekStartDate] && (row[mappings.regularHours] || row[mappings.overtimeHours]);

      if (dailyRowComplete) {
        const dateVal = row[mappings.date].trim();
        const parsedDate = new Date(dateVal);
        if (Number.isNaN(parsedDate.getTime())) {
          newErrors.push({ originalIndex: index, message: `Invalid date "${dateVal}".` });
          return;
        }
        const bounds = getWeekBoundsFromDateString(dateVal);
        weekStartDate = bounds.weekStartDate;
        weekEndDate = bounds.weekEndDate;
        const breakMinutes = mappings.breakDuration ? (parseFloat(row[mappings.breakDuration]) || 0) : 0;
        const hours = calculateEntryHours(row[mappings.startTime].trim(), row[mappings.endTime].trim(), breakMinutes);
        if (hours <= 0) {
          newErrors.push({ originalIndex: index, message: 'Start/end time produced zero hours.' });
          return;
        }
        entry = {
          id: generateUUID(),
          date: dateVal,
          startTime: row[mappings.startTime].trim(),
          endTime: row[mappings.endTime].trim(),
          breakDuration: breakMinutes,
          totalHours: hours,
          isOvertime: hours > 8,
        };
        rowShape = 'daily';
      } else if (summarizedRowComplete) {
        const weekVal = row[mappings.weekStartDate].trim();
        const parsedWeek = new Date(weekVal);
        if (Number.isNaN(parsedWeek.getTime())) {
          newErrors.push({ originalIndex: index, message: `Invalid week start date "${weekVal}".` });
          return;
        }
        const bounds = getWeekBoundsFromDateString(weekVal);
        weekStartDate = bounds.weekStartDate;
        weekEndDate = bounds.weekEndDate;
        directRegular = mappings.regularHours ? (parseFloat(row[mappings.regularHours]) || 0) : 0;
        directOvertime = mappings.overtimeHours ? (parseFloat(row[mappings.overtimeHours]) || 0) : 0;
        if (directRegular <= 0 && directOvertime <= 0) {
          newErrors.push({ originalIndex: index, message: 'No hours provided for this row.' });
          return;
        }
        rowShape = 'summarized';
      } else {
        newErrors.push({ originalIndex: index, message: 'Row is missing required date/time or hours fields.' });
        return;
      }

      const key = `${employee.id}__${weekStartDate}`;
      let bucket = buckets.get(key);
      if (bucket && bucket.shape !== rowShape) {
        newErrors.push({ originalIndex: index, message: `Mixed daily/weekly-total rows for the same employee and week aren't supported (row ${bucket.sourceRowCount > 0 ? 'conflicts with an earlier row' : ''}).` });
        return;
      }

      if (!bucket) {
        const existing = existingTimesheets.find((ts) => ts.employeeId === employee.id && ts.weekStartDate === weekStartDate);
        bucket = {
          key,
          employeeId: employee.id,
          employeeName: `${employee.firstName} ${employee.lastName}`.trim(),
          weekStartDate,
          weekEndDate,
          entries: [],
          totalRegularHours: 0,
          totalOvertimeHours: 0,
          isDuplicate: Boolean(existing),
          existingId: existing?.id,
          duplicateAction: 'skip',
          sourceRowCount: 0,
          shape: rowShape,
        };
        buckets.set(key, bucket);
      }

      bucket.sourceRowCount += 1;

      if (rowShape === 'daily' && entry) {
        bucket.entries.push(entry);
      } else if (rowShape === 'summarized') {
        bucket.totalRegularHours = Number((bucket.totalRegularHours + directRegular).toFixed(2));
        bucket.totalOvertimeHours = Number((bucket.totalOvertimeHours + directOvertime).toFixed(2));
        bucket.entries.push({
          id: generateUUID(),
          date: weekStartDate,
          startTime: '',
          endTime: '',
          breakDuration: 0,
          totalHours: Number((directRegular + directOvertime).toFixed(2)),
          isOvertime: directOvertime > 0,
        });
      }
    });

    buckets.forEach((bucket) => {
      if (bucket.shape === 'daily') {
        const totals = summarizeTimeEntries(bucket.entries);
        bucket.totalRegularHours = totals.regular;
        bucket.totalOvertimeHours = totals.overtime;
      }
    });

    setDrafts(Array.from(buckets.values()));
    setUnmatchedRows(newUnmatched);
    setErrorRows(newErrors);
    setStep(3);
  };

  const handleSetDuplicateAction = (key: string, action: 'skip' | 'overwrite') => {
    setDrafts((prev) => prev.map((d) => (d.key === key ? { ...d, duplicateAction: action } : d)));
  };

  const handleSetAllDuplicateAction = (action: 'skip' | 'overwrite') => {
    setDrafts((prev) => prev.map((d) => (d.isDuplicate ? { ...d, duplicateAction: action } : d)));
  };

  const handleRemoveDraft = (key: string) => {
    setDrafts((prev) => prev.filter((d) => d.key !== key));
  };

  const duplicateCount = drafts.filter((d) => d.isDuplicate).length;
  const toImportCount = drafts.filter((d) => !(d.isDuplicate && d.duplicateAction === 'skip')).length;

  const handleImport = async () => {
    if (isImporting || !onSaveTimesheet) return;
    setIsImporting(true);

    const succeeded: ImportDraft[] = [];
    let failed = 0;

    try {
      for (const draft of drafts) {
        if (draft.isDuplicate && draft.duplicateAction === 'skip') continue;

        const timesheet: WeeklyTimesheet = {
          id: draft.isDuplicate && draft.duplicateAction === 'overwrite' && draft.existingId ? draft.existingId : generateUUID(),
          employeeId: draft.employeeId,
          employeeName: draft.employeeName,
          companyId,
          weekStartDate: draft.weekStartDate,
          weekEndDate: draft.weekEndDate,
          status: 'SUBMITTED',
          totalRegularHours: draft.totalRegularHours,
          totalOvertimeHours: draft.totalOvertimeHours,
          entries: draft.entries,
          source: 'MANUAL',
        };

        try {
          const result = await onSaveTimesheet(timesheet);
          if (result === false) {
            failed += 1;
          } else {
            succeeded.push({ ...draft, key: timesheet.id });
          }
        } catch (err) {
          console.error('Failed to import timesheet row:', err);
          failed += 1;
        }
      }

      setImportedDrafts(succeeded);
      setImportFailedCount(failed);
      setStep(4);
    } finally {
      setIsImporting(false);
    }
  };

  const handleApproveAllImported = async () => {
    if (isApprovingAll || !onSaveTimesheet || importedDrafts.length === 0) return;
    setIsApprovingAll(true);
    try {
      for (const draft of importedDrafts) {
        const timesheet: WeeklyTimesheet = {
          id: draft.key,
          employeeId: draft.employeeId,
          employeeName: draft.employeeName,
          companyId,
          weekStartDate: draft.weekStartDate,
          weekEndDate: draft.weekEndDate,
          status: 'APPROVED',
          totalRegularHours: draft.totalRegularHours,
          totalOvertimeHours: draft.totalOvertimeHours,
          entries: draft.entries,
          source: 'MANUAL',
        };
        try {
          await onSaveTimesheet(timesheet);
        } catch (err) {
          console.error('Failed to approve imported timesheet:', err);
        }
      }
      setApprovedAll(true);
    } finally {
      setIsApprovingAll(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[130] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-fade-in">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl overflow-hidden flex flex-col max-h-[90vh] border border-gray-100 animate-scale-in">
        <div className="bg-gradient-to-r from-jam-black to-gray-900 p-6 text-white flex justify-between items-center shrink-0">
          <div>
            <h3 className="text-xl font-bold tracking-tight">Import Timesheets</h3>
            <p className="text-gray-400 text-xs mt-1">Map your own file's columns - no fixed template required.</p>
          </div>
          <button onClick={resetAndClose} className="text-gray-400 hover:text-white transition-colors p-1.5 hover:bg-white/10 rounded-full">
            <Icons.Close className="w-5 h-5" />
          </button>
        </div>

        <div className="bg-gray-50 border-b border-gray-200 py-3.5 px-8 shrink-0 flex items-center justify-between">
          <div className="flex items-center space-x-12 w-full max-w-3xl mx-auto justify-between">
            {[
              { num: 1, label: 'Upload file' },
              { num: 2, label: 'Map fields' },
              { num: 3, label: 'Review & import' },
              { num: 4, label: 'Complete!' },
            ].map((s) => (
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
                  <span className={`text-xs font-semibold ${step === s.num ? 'text-gray-900 font-bold' : 'text-gray-500'}`}>{s.label}</span>
                </div>
                {s.num < 4 && <div className={`flex-1 h-0.5 mx-4 rounded ${step > s.num ? 'bg-jam-black' : 'bg-gray-200'}`} />}
              </div>
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-8 pb-24 min-h-[400px]">
          {step === 1 && (
            <div className="flex flex-col items-center justify-center py-10 space-y-6 max-w-lg mx-auto text-center">
              <div className="w-20 h-20 bg-gray-50 rounded-full flex items-center justify-center border-2 border-dashed border-gray-300">
                <Icons.Upload className="w-10 h-10 text-gray-400" />
              </div>
              <div>
                <h4 className="text-lg font-bold text-gray-900">Upload your timesheet file</h4>
                <p className="text-gray-500 text-sm mt-1">.csv or .xlsx, from any system - daily punches or already-totaled weekly hours. You'll map the columns next.</p>
              </div>
              <input type="file" accept=".csv,.xlsx,.xls,text/csv" ref={fileInputRef} onChange={handleFileChange} className="hidden" />
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={isParsing}
                className="w-full bg-jam-black text-white hover:bg-gray-800 py-3 rounded-lg font-bold transition-all shadow-md flex items-center justify-center space-x-2 disabled:opacity-60"
              >
                <Icons.Upload className="w-4 h-4" />
                <span>{isParsing ? 'Reading file...' : 'Choose File...'}</span>
              </button>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-6">
              <div className="flex items-center space-x-3 bg-gray-50 p-4 rounded-xl border border-gray-200">
                <Icons.Company className="w-5 h-5 text-gray-500" />
                <div>
                  <p className="text-sm font-bold text-gray-900">File: {file?.name}</p>
                  <p className="text-xs text-gray-500">{rawRows.length} rows, {headers.length} columns detected</p>
                </div>
              </div>

              <div>
                <h4 className="text-md font-bold text-gray-900 mb-1 flex items-center">
                  {EMPLOYEE_FIELD.label} <span className="text-red-500 ml-1">*</span>
                </h4>
                <select
                  value={mappings.employeeIdentifier || ''}
                  onChange={(e) => setMappings((prev) => ({ ...prev, employeeIdentifier: e.target.value }))}
                  className={`w-full border rounded-lg p-2.5 text-sm bg-white ${!mappings.employeeIdentifier ? 'border-red-300' : 'border-gray-300'}`}
                >
                  <option value="">-- Do Not Map --</option>
                  {headers.map((h) => <option key={h} value={h}>{h}</option>)}
                </select>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className={`rounded-xl border p-4 ${hasDailyShape ? 'border-green-300 bg-green-50/30' : 'border-gray-200 bg-white'}`}>
                  <h5 className="text-sm font-bold text-gray-900 mb-1">Option A: Daily Punches</h5>
                  <p className="text-xs text-gray-500 mb-3">One row per employee per day. Hours are computed from start/end time.</p>
                  <div className="space-y-3">
                    {DAILY_SHAPE_FIELDS.map((field) => (
                      <div key={field.key}>
                        <label className="text-xs font-semibold text-gray-700">{field.label}{field.key !== 'breakDuration' && <span className="text-red-500 ml-1">*</span>}</label>
                        <select
                          value={mappings[field.key] || ''}
                          onChange={(e) => setMappings((prev) => ({ ...prev, [field.key]: e.target.value }))}
                          className="w-full border border-gray-300 rounded-lg p-2 text-sm bg-white mt-1"
                        >
                          <option value="">-- Do Not Map --</option>
                          {headers.map((h) => <option key={h} value={h}>{h}</option>)}
                        </select>
                      </div>
                    ))}
                  </div>
                </div>

                <div className={`rounded-xl border p-4 ${hasSummarizedShape ? 'border-green-300 bg-green-50/30' : 'border-gray-200 bg-white'}`}>
                  <h5 className="text-sm font-bold text-gray-900 mb-1">Option B: Weekly Totals</h5>
                  <p className="text-xs text-gray-500 mb-3">One row per employee per week, with hours already totaled.</p>
                  <div className="space-y-3">
                    {SUMMARIZED_SHAPE_FIELDS.map((field) => (
                      <div key={field.key}>
                        <label className="text-xs font-semibold text-gray-700">{field.label}</label>
                        <select
                          value={mappings[field.key] || ''}
                          onChange={(e) => setMappings((prev) => ({ ...prev, [field.key]: e.target.value }))}
                          className="w-full border border-gray-300 rounded-lg p-2 text-sm bg-white mt-1"
                        >
                          <option value="">-- Do Not Map --</option>
                          {headers.map((h) => <option key={h} value={h}>{h}</option>)}
                        </select>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <p className="text-xs text-gray-500">Map at least one full option (A or B) in addition to Employee. If your file mixes both shapes across different rows, that's fine - each row is matched to whichever option it has complete data for.</p>

              <div className="flex justify-between items-center pt-4 border-t border-gray-100">
                <button onClick={() => setStep(1)} className="px-5 py-2.5 border border-gray-300 hover:bg-gray-50 text-gray-700 font-bold rounded-lg text-sm flex items-center space-x-2">
                  <Icons.Back className="w-4 h-4" /><span>Back</span>
                </button>
                <button onClick={handleProceedToValidation} className="px-6 py-2.5 bg-jam-black text-white hover:bg-gray-800 font-bold rounded-lg text-sm shadow-md">
                  Review Data
                </button>
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-6">
              <div>
                <h4 className="text-md font-bold text-gray-900">Review before importing</h4>
                <p className="text-xs text-gray-500 mt-1">{drafts.length} timesheet(s) ready, {unmatchedRows.length} unmatched row(s), {errorRows.length} row(s) with errors.</p>
              </div>

              {duplicateCount > 0 && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <p className="text-xs text-amber-800 font-semibold">{duplicateCount} of these already have a timesheet for that employee and week. Choose how to handle all of them at once, or set each individually below.</p>
                  <div className="flex space-x-2 shrink-0">
                    <button onClick={() => handleSetAllDuplicateAction('skip')} className="px-3 py-1.5 text-xs font-bold rounded-lg border border-amber-300 bg-white hover:bg-amber-100">Skip All Duplicates</button>
                    <button onClick={() => handleSetAllDuplicateAction('overwrite')} className="px-3 py-1.5 text-xs font-bold rounded-lg border border-amber-300 bg-white hover:bg-amber-100">Overwrite All Duplicates</button>
                  </div>
                </div>
              )}

              <div className="border border-gray-200 rounded-xl overflow-x-auto bg-white shadow-sm">
                <table className="min-w-[900px] w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-gray-50 text-gray-700 border-b border-gray-200 font-bold uppercase tracking-wider text-[10px]">
                      <th className="p-3 border-r border-gray-200">Employee</th>
                      <th className="p-3 border-r border-gray-200">Week</th>
                      <th className="p-3 border-r border-gray-200">Regular Hrs</th>
                      <th className="p-3 border-r border-gray-200">OT Hrs</th>
                      <th className="p-3 border-r border-gray-200">Source Rows</th>
                      <th className="p-3 border-r border-gray-200">Status</th>
                      <th className="p-3 text-center w-16">Skip</th>
                    </tr>
                  </thead>
                  <tbody>
                    {drafts.map((draft) => (
                      <tr key={draft.key} className={`border-b border-gray-150 ${draft.isDuplicate ? 'bg-amber-50/20' : ''}`}>
                        <td className="p-3 border-r border-gray-200 font-semibold">{draft.employeeName}</td>
                        <td className="p-3 border-r border-gray-200">{draft.weekStartDate} - {draft.weekEndDate}</td>
                        <td className="p-3 border-r border-gray-200">{draft.totalRegularHours}</td>
                        <td className="p-3 border-r border-gray-200">{draft.totalOvertimeHours}</td>
                        <td className="p-3 border-r border-gray-200">{draft.sourceRowCount}</td>
                        <td className="p-3 border-r border-gray-200">
                          {draft.isDuplicate ? (
                            <div className="flex items-center space-x-3">
                              <label className="flex items-center text-xs font-semibold cursor-pointer">
                                <input type="radio" name={`dup-${draft.key}`} checked={draft.duplicateAction === 'skip'} onChange={() => handleSetDuplicateAction(draft.key, 'skip')} className="mr-1.5" />
                                Skip
                              </label>
                              <label className="flex items-center text-xs font-semibold cursor-pointer text-amber-700">
                                <input type="radio" name={`dup-${draft.key}`} checked={draft.duplicateAction === 'overwrite'} onChange={() => handleSetDuplicateAction(draft.key, 'overwrite')} className="mr-1.5" />
                                Overwrite
                              </label>
                            </div>
                          ) : (
                            <span className="text-green-700 font-semibold flex items-center space-x-1.5">
                              <Icons.CheckMark className="w-3.5 h-3.5 text-green-500" /><span>New</span>
                            </span>
                          )}
                        </td>
                        <td className="p-3 text-center">
                          <button onClick={() => handleRemoveDraft(draft.key)} className="text-gray-400 hover:text-red-600 p-1 hover:bg-gray-100 rounded" title="Skip this timesheet">
                            <Icons.Close className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    ))}
                    {drafts.length === 0 && (
                      <tr><td colSpan={7} className="p-6 text-center text-gray-500">Nothing to import - every row was unmatched or had an error.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>

              {unmatchedRows.length > 0 && (
                <div className="bg-gray-50 border border-gray-200 rounded-xl p-4">
                  <p className="text-xs font-bold text-gray-700 mb-2">Unmatched rows (excluded from import)</p>
                  <ul className="text-xs text-gray-600 space-y-1 max-h-32 overflow-y-auto">
                    {unmatchedRows.map((row) => <li key={row.originalIndex}>Row {row.originalIndex + 1}: {row.message}</li>)}
                  </ul>
                </div>
              )}

              {errorRows.length > 0 && (
                <div className="bg-red-50 border border-red-200 rounded-xl p-4">
                  <p className="text-xs font-bold text-red-700 mb-2">Rows with errors (excluded from import)</p>
                  <ul className="text-xs text-red-600 space-y-1 max-h-32 overflow-y-auto">
                    {errorRows.map((row) => <li key={row.originalIndex}>Row {row.originalIndex + 1}: {row.message}</li>)}
                  </ul>
                </div>
              )}

              <div className="flex justify-between items-center pt-4 border-t border-gray-100">
                <button onClick={() => setStep(2)} className="px-5 py-2.5 border border-gray-300 hover:bg-gray-50 text-gray-700 font-bold rounded-lg text-sm flex items-center space-x-2">
                  <Icons.Back className="w-4 h-4" /><span>Back</span>
                </button>
                <button
                  onClick={handleImport}
                  disabled={isImporting || toImportCount === 0}
                  className="px-6 py-2.5 bg-jam-orange text-jam-black hover:bg-yellow-500 font-bold rounded-lg text-sm shadow-md disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {isImporting ? 'Importing...' : `Import ${toImportCount} Timesheet${toImportCount === 1 ? '' : 's'}`}
                </button>
              </div>
            </div>
          )}

          {step === 4 && (
            <div className="flex flex-col items-center justify-center py-12 space-y-6 max-w-md mx-auto text-center">
              <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center">
                <Icons.Check className="w-8 h-8 text-green-600" />
              </div>
              <div>
                <h4 className="text-xl font-bold text-gray-900">Import Complete!</h4>
                <p className="text-gray-500 text-sm mt-2">
                  {importedDrafts.length} timesheet{importedDrafts.length === 1 ? '' : 's'} imported as Submitted, awaiting approval.
                  {importFailedCount > 0 && ` ${importFailedCount} row(s) failed to save - try re-importing those.`}
                </p>
              </div>

              {importedDrafts.length > 0 && !approvedAll && (
                <button
                  onClick={handleApproveAllImported}
                  disabled={isApprovingAll}
                  className="w-full bg-jam-orange text-jam-black hover:bg-yellow-500 py-3 rounded-lg font-bold transition-all shadow-md disabled:opacity-60"
                >
                  {isApprovingAll ? 'Approving...' : `Approve All ${importedDrafts.length} Imported`}
                </button>
              )}
              {approvedAll && (
                <p className="text-sm text-green-700 font-semibold flex items-center space-x-1.5">
                  <Icons.CheckMark className="w-4 h-4" /><span>All imported timesheets approved.</span>
                </p>
              )}

              <button onClick={resetAndClose} className="w-full bg-jam-black text-white hover:bg-gray-800 py-3 rounded-lg font-bold transition-all shadow-md">
                Finish
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
