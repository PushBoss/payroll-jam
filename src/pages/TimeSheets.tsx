import React, { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { toast } from 'sonner';
import { Icons } from '../components/Icons';
import { CompanySettings, Employee, TimeRecord, TimeRecordRevision, WeeklyTimesheet } from '../core/types';
import { buildAppUrl } from '../app/routes';
import {
  calculateEntryHours,
  encodeClockInPayload,
  getCompanyLocations,
  getWeekBoundsFromDateString as getWeekBounds,
  summarizeTimeEntries as summarizeEntries,
  toLocalDateString,
} from '../utils/attendance';
import { AttendanceBadge, PayrollService } from '../services/PayrollService';
import { TimesheetImportWizard } from '../features/timesheets/TimesheetImportWizard';
import { downloadFile } from '../utils/exportHelpers';
import { generateUUID, isValidUUID } from '../utils/uuid';

interface TimeSheetsProps {
  timesheets?: WeeklyTimesheet[];
  employees?: Employee[];
  onUpdate?: (ts: WeeklyTimesheet) => void | boolean | Promise<void | boolean>;
  companyData?: CompanySettings;
}

const toDateInputValue = (date: Date) => toLocalDateString(date);
const dateAtLocalNoon = (dateValue: string) => new Date(`${dateValue}T12:00:00`);

const toCsvCell = (value: string | number) => `"${String(value ?? '').replace(/"/g, '""')}"`;

export const TimeSheets: React.FC<TimeSheetsProps> = ({ 
  timesheets = [], 
  employees = [],
  onUpdate,
  companyData
}) => {
  const [filter, setFilter] = useState<'ALL' | 'PENDING' | 'APPROVED'>('ALL');
  const locations = getCompanyLocations(companyData);
  const [qrModalOpen, setQrModalOpen] = useState(false);
  const [logTimeModalOpen, setLogTimeModalOpen] = useState(false);
  const [importWizardOpen, setImportWizardOpen] = useState(false);
  const [isSavingTimeEntry, setIsSavingTimeEntry] = useState(false);
  const [kioskMode, setKioskMode] = useState(false);
  const [selectedLocationId, setSelectedLocationId] = useState(locations[0]?.id || '');
  const [qrImageUrl, setQrImageUrl] = useState('');
  const [attendanceBadge, setAttendanceBadge] = useState<AttendanceBadge | null>(null);
  const [attendanceBadgeLoading, setAttendanceBadgeLoading] = useState(false);
  const [attendanceBadgeError, setAttendanceBadgeError] = useState('');
  const [viewingTimesheet, setViewingTimesheet] = useState<WeeklyTimesheet | null>(null);
  const [editingTimesheet, setEditingTimesheet] = useState<WeeklyTimesheet | null>(null);
  const [dateFilterOpen, setDateFilterOpen] = useState(false);
  const [selectedDate, setSelectedDate] = useState('');
  const [selectedEndDate, setSelectedEndDate] = useState('');
  const [selectedEmployeeId, setSelectedEmployeeId] = useState('');
  const [draftDate, setDraftDate] = useState('');
  const [draftEndDate, setDraftEndDate] = useState('');
  const [draftEmployeeId, setDraftEmployeeId] = useState('');
  const [manualEntry, setManualEntry] = useState({
    employeeId: '',
    date: toDateInputValue(new Date()),
    startTime: '09:00',
    endTime: '17:00',
    breakDuration: 60,
    status: 'APPROVED' as WeeklyTimesheet['status'],
  });
  const [currentWeekStart, setCurrentWeekStart] = useState<string>(() => {
    return getWeekBounds(toLocalDateString(new Date())).weekStartDate;
  });
  const [authoritativeRecords, setAuthoritativeRecords] = useState<TimeRecord[]>([]);
  const [authoritativeLoading, setAuthoritativeLoading] = useState(false);
  const [auditRecord, setAuditRecord] = useState<TimeRecord | null>(null);
  const [auditRevisions, setAuditRevisions] = useState<TimeRecordRevision[]>([]);
  const [auditLoading, setAuditLoading] = useState(false);

  const handleAuthoritativeReview = async (record: TimeRecord, decision: 'APPROVE' | 'REJECT') => {
    if (!companyData?.id) return;
    const reason = decision === 'REJECT' ? window.prompt('Enter the rejection reason') || '' : undefined;
    if (decision === 'REJECT' && !(reason || '').trim()) return;
    try {
      const saved = await PayrollService.reviewTimeRecord(companyData.id, record.id, decision, reason);
      setAuthoritativeRecords((items) => items.map((item) => item.id === saved.id ? { ...item, ...saved } : item));
      toast.success(decision === 'APPROVE' ? 'Daily time record approved.' : 'Daily time record rejected.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to review the time record.');
    }
  };

  const handleViewAudit = async (record: TimeRecord) => {
    if (!companyData?.id) return;
    setAuditRecord(record);
    setAuditLoading(true);
    try {
      setAuditRevisions(await PayrollService.getTimeRecordAudit(companyData.id, record.id));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to load the time record audit history.');
      setAuditRevisions([]);
    } finally {
      setAuditLoading(false);
    }
  };

  const handleCreateAdjustment = async (record: TimeRecord) => {
    if (!companyData?.id) return;
    const date = window.prompt('Adjustment work date (must be in a later payroll period, YYYY-MM-DD)');
    const hours = Number(window.prompt('Adjustment hours (positive number)') || 0);
    const direction = window.confirm('Click OK for an added payment, or Cancel for a deduction.') ? 1 : -1;
    const reason = window.prompt('Reason for this payroll adjustment') || '';
    if (!date || !hours || !reason.trim()) return;
    try {
      const adjustment = await PayrollService.createTimesheetAdjustment(companyData.id, record.id, date, Math.round(hours * 60), direction as -1 | 1, reason);
      setAuthoritativeRecords((records) => [adjustment, ...records]);
      toast.success('Adjustment created as Logged and requires approval.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to create the adjustment.');
    }
  };

  useEffect(() => {
    if (!companyData?.id) return;
    let cancelled = false;
    setAuthoritativeLoading(true);
    PayrollService.getTimeRecords(companyData.id, {
      employeeId: selectedEmployeeId || undefined,
      startDate: selectedDate || undefined,
      endDate: selectedEndDate || undefined,
    }).then((records) => {
      if (!cancelled) setAuthoritativeRecords(records);
    }).catch((error) => {
      // The migration may not be deployed yet; legacy weekly timesheets remain usable.
      console.warn('Authoritative time records are unavailable:', error);
    }).finally(() => {
      if (!cancelled) setAuthoritativeLoading(false);
    });
    return () => { cancelled = true; };
  }, [companyData?.id, selectedDate, selectedEmployeeId, selectedEndDate]);

  const handleApprove = (ts: WeeklyTimesheet) => {
    if (onUpdate) {
      onUpdate({ ...ts, status: 'APPROVED' });
    }
  };

  const handleReject = (ts: WeeklyTimesheet) => {
    if (onUpdate) {
       onUpdate({ ...ts, status: 'REJECTED' });
    }
  };

  const handleEditDraft = (timesheet: WeeklyTimesheet) => {
    setEditingTimesheet({
      ...timesheet,
      entries: timesheet.entries.map((entry) => ({ ...entry })),
    });
  };

  const updateDraftEntry = (
    entryId: string,
    field: 'date' | 'startTime' | 'endTime' | 'breakDuration',
    value: string | number,
  ) => {
    setEditingTimesheet((timesheet) => timesheet && {
      ...timesheet,
      entries: timesheet.entries.map((entry) => (
        entry.id === entryId ? { ...entry, [field]: value } : entry
      )),
    });
  };

  const handleSaveDraftEdits = async () => {
    if (!editingTimesheet || !onUpdate) return;

    if (editingTimesheet.entries.length === 0) {
      toast.error('Add at least one time entry before saving this draft.');
      return;
    }

    const entries = editingTimesheet.entries.map((entry) => {
      const breakDuration = Number(entry.breakDuration) || 0;
      const totalHours = calculateEntryHours(entry.startTime, entry.endTime, breakDuration);
      return {
        ...entry,
        breakDuration,
        totalHours,
        isOvertime: totalHours > 8,
      };
    });

    const invalidEntry = entries.find((entry) => {
      const entryWeek = getWeekBounds(entry.date);
      return !entry.date || entry.totalHours <= 0 || entryWeek.weekStartDate !== editingTimesheet.weekStartDate;
    });
    if (invalidEntry) {
      toast.error('Each entry must have valid times and fall within this timesheet week.');
      return;
    }

    const totals = summarizeEntries(entries);
    setIsSavingTimeEntry(true);
    try {
      const saved = await onUpdate({
        ...editingTimesheet,
        entries,
        totalRegularHours: totals.regular,
        totalOvertimeHours: totals.overtime,
        status: 'DRAFT',
      });
      if (saved === false) return;

      setEditingTimesheet(null);
      toast.success('Draft timesheet updated.');
    } finally {
      setIsSavingTimeEntry(false);
    }
  };

  const hasDateFilter = Boolean(selectedDate);
  const dateFilteredSheets = timesheets.filter((timesheet) => {
    if (!hasDateFilter) return timesheet.weekStartDate === currentWeekStart;

    // A single date returns the weekly sheet that contains that date. A range
    // returns every timesheet that overlaps the selected dates.
    const rangeEnd = selectedEndDate || selectedDate;
    return timesheet.weekStartDate <= rangeEnd && timesheet.weekEndDate >= selectedDate;
  });
  const periodSheets = dateFilteredSheets.filter((timesheet) => (
    !selectedEmployeeId || timesheet.employeeId === selectedEmployeeId
  ));

  const filteredSheets = periodSheets.filter(ts => {
    if (filter === 'ALL') return true;
    if (filter === 'PENDING') return ts.status === 'SUBMITTED' || ts.status === 'DRAFT';
    return ts.status === filter;
  });

  const navigateWeek = (direction: 'prev' | 'next') => {
    const date = dateAtLocalNoon(currentWeekStart);
    date.setDate(date.getDate() + (direction === 'next' ? 7 : -7));
    setCurrentWeekStart(toLocalDateString(date));
  };

  const goToToday = () => {
    setCurrentWeekStart(getWeekBounds(toLocalDateString(new Date())).weekStartDate);
    setSelectedDate('');
    setSelectedEndDate('');
  };

  const openDateFilter = () => {
    setDraftDate(selectedDate);
    setDraftEndDate(selectedEndDate);
    setDraftEmployeeId(selectedEmployeeId);
    setDateFilterOpen(true);
  };

  const applyDateFilter = () => {
    if (draftEndDate && !draftDate) {
      toast.error('Choose a start date before choosing an end date.');
      return;
    }
    if (draftDate && draftEndDate && draftEndDate < draftDate) {
      toast.error('The end date cannot be before the start date.');
      return;
    }
    setSelectedDate(draftDate);
    setSelectedEndDate(draftEndDate);
    setSelectedEmployeeId(draftEmployeeId);
    setDateFilterOpen(false);
  };

  const clearDateFilter = () => {
    setDraftDate('');
    setDraftEndDate('');
    setDraftEmployeeId('');
    setSelectedDate('');
    setSelectedEndDate('');
    setSelectedEmployeeId('');
    setDateFilterOpen(false);
  };

  const weekStart = dateAtLocalNoon(currentWeekStart);
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 6);
  const weekDisplay = `${weekStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - ${weekEnd.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`;
  const activeEmployees = employees.filter((employee) => employee.status !== 'ARCHIVED' && employee.status !== 'TERMINATED');

  const pendingCount = periodSheets.filter(t => t.status === 'SUBMITTED' || t.status === 'DRAFT').length;
  const totalOvertime = filteredSheets.reduce((acc, t) => acc + t.totalOvertimeHours, 0);
  const submittedOrApprovedCount = periodSheets.filter(t => t.status === 'SUBMITTED' || t.status === 'APPROVED').length;
  const submissionRate = periodSheets.length > 0 ? Math.round((submittedOrApprovedCount / periodSheets.length) * 100) : 0;
  const selectedLocation = locations.find((location) => location.id === selectedLocationId) || locations[0];

  const handleExportTimesheets = () => {
    if (authoritativeRecords.length > 0) {
      const headers = ['Employee Name', 'Employee Email', 'Work Date', 'Start', 'End', 'Break Minutes', 'Regular Hours', 'Overtime Hours', 'Holiday Hours', 'Total Hours', 'Source', 'Lifecycle Status', 'Edited', 'Revision Count', 'Payroll Reference'];
      const rows = authoritativeRecords.map((record) => {
        const employee = employees.find((item) => item.id === record.employeeId);
        return [
          employee ? `${employee.firstName} ${employee.lastName}`.trim() : '', employee?.email || '', record.workDate,
          record.startAt || '', record.endAt || '', record.breakMinutes,
          (record.regularMinutes / 60).toFixed(2), (record.overtimeMinutes / 60).toFixed(2), (record.holidayMinutes / 60).toFixed(2), (record.workedMinutes / 60).toFixed(2),
          record.source, record.approvalStatus, record.revisionCount > 0 ? 'Yes' : 'No', record.revisionCount, record.payRunId || '',
        ].map(toCsvCell).join(',');
      });
      downloadFile(`Timesheet_Management_Report_${selectedDate || currentWeekStart}${selectedEndDate ? `_to_${selectedEndDate}` : ''}.csv`, `${headers.map(toCsvCell).join(',')}\n${rows.join('\n')}\n`, 'text/csv');
      toast.success(`Exported ${authoritativeRecords.length} authoritative time record${authoritativeRecords.length === 1 ? '' : 's'}.`);
      return;
    }
    if (filteredSheets.length === 0) {
      toast.error('There are no timesheets in the current view to export.');
      return;
    }

    // Legacy weekly report fallback. The report is never an import contract;
    // new imports use the separate versioned daily-template download.
    const headers = [
      'Employee TRN',
      'Employee Email',
      'Employee ID',
      'Employee Name',
      'Week Start Date',
      'Week End Date',
      'Regular Hours',
      'Overtime Hours',
      'Total Hours',
      'Status',
      'Source',
    ];
    const rows = filteredSheets.map((timesheet) => {
      const employee = employees.find((item) => item.id === timesheet.employeeId);
      const totalHours = Number(timesheet.totalRegularHours || 0) + Number(timesheet.totalOvertimeHours || 0);
      return [
        employee?.trn || '',
        employee?.email || '',
        employee?.employeeId || '',
        timesheet.employeeName || `${employee?.firstName || ''} ${employee?.lastName || ''}`.trim(),
        timesheet.weekStartDate,
        timesheet.weekEndDate,
        Number(timesheet.totalRegularHours || 0),
        Number(timesheet.totalOvertimeHours || 0),
        totalHours,
        timesheet.status,
        timesheet.source || 'MANUAL',
      ].map(toCsvCell).join(',');
    });

    downloadFile(`Timesheet_Report_${currentWeekStart}.csv`, `${headers.map(toCsvCell).join(',')}\n${rows.join('\n')}\n`, 'text/csv');
    toast.success(`Exported ${filteredSheets.length} timesheet${filteredSheets.length === 1 ? '' : 's'}.`);
  };

  const handleDownloadImportTemplate = () => {
    const headers = [
      'employee_email',
      'work_date',
      'start_time',
      'end_time',
      'break_minutes',
      'employee_id',
      'source_reference',
      'location',
      'notes',
      'rate_override_reason',
      'holiday_code',
    ];
    downloadFile(
      'Payroll-Jam_Timesheet_Import_Template.csv',
      `${headers.map(toCsvCell).join(',')}\n`,
      'text/csv',
    );
    toast.success('Timesheet import template downloaded.');
  };

  useEffect(() => {
    if (!selectedLocationId && locations[0]?.id) {
      setSelectedLocationId(locations[0].id);
    }
  }, [locations, selectedLocationId]);

  useEffect(() => {
    if (!manualEntry.employeeId && activeEmployees[0]?.id) {
      setManualEntry((entry) => ({ ...entry, employeeId: activeEmployees[0].id }));
    }
  }, [activeEmployees, manualEntry.employeeId]);

  useEffect(() => {
    let active = true;

    if (!qrModalOpen || !companyData?.id || !selectedLocation?.id) {
      setAttendanceBadge(null);
      setAttendanceBadgeError('');
      return () => {
        active = false;
      };
    }

    setAttendanceBadgeLoading(true);
    setAttendanceBadgeError('');
    PayrollService.getAttendanceBadge(companyData.id, selectedLocation.id)
      .then((badge) => {
        if (active) setAttendanceBadge(badge);
      })
      .catch((error) => {
        console.error('Failed to generate attendance badge:', error);
        if (active) {
          setAttendanceBadge(null);
          setAttendanceBadgeError(error?.message || 'Attendance badge could not be generated.');
        }
      })
      .finally(() => {
        if (active) setAttendanceBadgeLoading(false);
      });

    return () => {
      active = false;
    };
  }, [companyData?.id, qrModalOpen, selectedLocation?.id]);

  useEffect(() => {
    let active = true;

    if (!qrModalOpen || !selectedLocation || !companyData?.id) {
      setQrImageUrl('');
      return () => {
        active = false;
      };
    }

    // Badge creation resolves legacy/settings-only branches to a real database
    // location UUID. QR clock-ins must use that UUID, not the old local ID.
    if (!attendanceBadge?.locationId) {
      setQrImageUrl('');
      return () => {
        active = false;
      };
    }

    const qrPayload = encodeClockInPayload(companyData.id, attendanceBadge.locationId);
    const clockInUrl = buildAppUrl('portal-clock-in', { qr: qrPayload });

    QRCode.toDataURL(clockInUrl, {
      errorCorrectionLevel: 'M',
      margin: 2,
      scale: 10,
      color: {
        dark: '#000000',
        light: '#ffffff',
      },
    }).then((dataUrl) => {
      if (active) setQrImageUrl(dataUrl);
    }).catch((error) => {
      console.error('Failed to generate QR code:', error);
      if (active) setQrImageUrl('');
    });

    return () => {
      active = false;
    };
  }, [attendanceBadge?.locationId, companyData?.id, qrModalOpen, selectedLocation?.id]);

  const handleManualEntryChange = <K extends keyof typeof manualEntry>(key: K, value: typeof manualEntry[K]) => {
    setManualEntry((entry) => ({ ...entry, [key]: value }));
  };

  const handleLogTime = async () => {
    if (!onUpdate) {
      toast.error('Timesheet saving is not available right now.');
      return;
    }

    const employee = activeEmployees.find((item) => item.id === manualEntry.employeeId);
    if (!employee) {
      toast.error('Choose an employee before logging time.');
      return;
    }

    const entryHours = calculateEntryHours(
      manualEntry.startTime,
      manualEntry.endTime,
      Number(manualEntry.breakDuration) || 0
    );

    if (entryHours <= 0) {
      toast.error('Enter a valid start time, end time, and break duration.');
      return;
    }

    const { weekStartDate, weekEndDate } = getWeekBounds(manualEntry.date);
    const existingTimesheet = timesheets.find((timesheet) =>
      timesheet.employeeId === employee.id && timesheet.weekStartDate === weekStartDate
    );

    const newEntry = {
      id: `ENTRY-MANUAL-${Date.now()}`,
      date: manualEntry.date,
      startTime: manualEntry.startTime,
      endTime: manualEntry.endTime,
      breakDuration: Number(manualEntry.breakDuration) || 0,
      totalHours: entryHours,
      isOvertime: entryHours > 8,
    };

    const entries = [...(existingTimesheet?.entries || []), newEntry];
    const totals = summarizeEntries(entries);
    const employeeName = `${employee.firstName} ${employee.lastName}`.trim();

    const timesheet: WeeklyTimesheet = {
      // `timesheets.id` is a UUID in Supabase. Legacy local entries may have
      // descriptive IDs, so only reuse an existing ID when it is valid.
      id: existingTimesheet?.id && isValidUUID(existingTimesheet.id)
        ? existingTimesheet.id
        : generateUUID(),
      employeeId: employee.id,
      employeeName,
      companyId: companyData?.id || existingTimesheet?.companyId,
      weekStartDate,
      weekEndDate,
      status: manualEntry.status,
      totalRegularHours: totals.regular,
      totalOvertimeHours: totals.overtime,
      entries,
      source: 'MANUAL',
      locationId: existingTimesheet?.locationId,
      locationName: existingTimesheet?.locationName,
      clockInAt: existingTimesheet?.clockInAt,
    };

    setIsSavingTimeEntry(true);
    try {
      const saved = await onUpdate(timesheet);
      if (saved === false) {
        // The persistence layer has already displayed the specific failure.
        return;
      }
      if (companyData?.id) {
        try {
          const authoritative = await PayrollService.saveTimeRecord(companyData.id, {
            employeeId: employee.id,
            workDate: manualEntry.date,
            startAt: `${manualEntry.date}T${manualEntry.startTime}:00`,
            endAt: `${manualEntry.date}T${manualEntry.endTime}:00`,
            breakMinutes: Number(manualEntry.breakDuration) || 0,
            workedMinutes: Math.round(entryHours * 60),
            source: 'ADMIN',
          });
          setAuthoritativeRecords((records) => [authoritative, ...records]);
        } catch (error) {
          // Keep the legacy weekly workflow operational while making the
          // missing rate/configuration explicit; it must be corrected before
          // this entry can be used by Timesheet-Based Payroll.
          toast.warning(error instanceof Error ? error.message : 'The daily payroll record was not created.');
        }
      }
      setCurrentWeekStart(weekStartDate);
      setLogTimeModalOpen(false);
      setManualEntry((entry) => ({
        ...entry,
        date: manualEntry.date,
        startTime: '09:00',
        endTime: '17:00',
        breakDuration: 60,
      }));
      toast.success(`Logged ${entryHours} hour${entryHours === 1 ? '' : 's'} for ${employeeName}.`);
    } finally {
      setIsSavingTimeEntry(false);
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center">
        <div>
          <h2 className="text-3xl font-bold text-gray-900">Time & Attendance</h2>
          <p className="text-gray-500 mt-1">Review employee hours and overtime for the current pay cycle.</p>
        </div>
        <div className="mt-4 flex w-full flex-wrap gap-2 md:mt-0 md:w-auto md:justify-end">
          <button
            onClick={() => setQrModalOpen(true)}
            className="flex flex-1 items-center justify-center whitespace-nowrap rounded-lg bg-jam-black px-4 py-2 text-white hover:bg-gray-800 sm:flex-none"
          >
            <Icons.Clock className="w-4 h-4 mr-2" /> Generate Clock-in QR
          </button>
          <button
            onClick={() => setLogTimeModalOpen(true)}
            className="flex flex-1 items-center justify-center whitespace-nowrap rounded-lg bg-jam-orange px-4 py-2 font-semibold text-jam-black hover:bg-yellow-500 sm:flex-none"
          >
            <Icons.Plus className="w-4 h-4 mr-2" /> Log Time
          </button>
          <button
            onClick={() => setImportWizardOpen(true)}
            className="flex flex-1 items-center justify-center whitespace-nowrap rounded-lg border border-gray-300 bg-white px-4 py-2 text-gray-700 hover:bg-gray-50 sm:flex-none"
          >
            <Icons.Upload className="w-4 h-4 mr-2" /> Import Timesheets
          </button>
          <button
            onClick={handleDownloadImportTemplate}
            className="flex flex-1 items-center justify-center whitespace-nowrap rounded-lg border border-gray-300 bg-white px-4 py-2 text-gray-700 hover:bg-gray-50 sm:flex-none"
          >
            <Icons.Download className="w-4 h-4 mr-2" /> Import Template
          </button>
          <button
            onClick={handleExportTimesheets}
            className="flex flex-1 items-center justify-center whitespace-nowrap rounded-lg border border-gray-300 bg-white px-4 py-2 text-gray-700 hover:bg-gray-50 sm:flex-none"
          >
            <Icons.Download className="w-4 h-4 mr-2" /> Export Report
          </button>
        </div>
      </div>

      <section className="hidden" aria-hidden="true">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="font-bold text-gray-900">Authoritative Time Review</h3>
            <p className="mt-1 text-sm text-gray-500">Daily records used by Timesheet-Based Payroll. The weekly table below remains available for legacy review.</p>
          </div>
          <span className="rounded-full bg-gray-100 px-3 py-1 text-sm font-semibold text-gray-700">
            {authoritativeLoading ? 'Loading…' : `${authoritativeRecords.length} records`}
          </span>
        </div>
        {!authoritativeLoading && authoritativeRecords.length > 0 && (
          <div className="mt-4 overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="border-b text-left text-xs uppercase text-gray-500"><tr><th className="pb-2 pr-4">Date</th><th className="pb-2 pr-4">Employee</th><th className="pb-2 pr-4">Hours</th><th className="pb-2 pr-4">Status</th><th className="pb-2 pr-4">Audit</th><th className="pb-2">Review</th></tr></thead>
              <tbody>{authoritativeRecords.slice(0, 25).map((record) => {
                const employee = employees.find((item) => item.id === record.employeeId);
                return <tr key={record.id} className="border-b last:border-0"><td className="py-2 pr-4">{record.workDate}</td><td className="py-2 pr-4">{employee ? `${employee.firstName} ${employee.lastName}` : 'Employee'}</td><td className="py-2 pr-4">{(record.workedMinutes / 60).toFixed(2)}</td><td className="py-2 pr-4">{record.approvalStatus}</td><td className="py-2 pr-4"><button onClick={() => handleViewAudit(record)} className="text-xs font-semibold text-blue-700 hover:underline">{record.revisionCount > 0 ? `Edited (${record.revisionCount})` : 'Audit'}</button></td><td className="py-2">{record.approvalStatus === 'LOGGED' ? <span className="flex gap-2"><button onClick={() => handleAuthoritativeReview(record, 'APPROVE')} className="text-xs font-semibold text-emerald-700 hover:underline">Approve</button><button onClick={() => handleAuthoritativeReview(record, 'REJECT')} className="text-xs font-semibold text-red-700 hover:underline">Reject</button></span> : record.approvalStatus === 'LOCKED' ? <button onClick={() => handleCreateAdjustment(record)} className="text-xs font-semibold text-jam-orange hover:underline">Adjust</button> : '—'}</td></tr>;
              })}</tbody>
            </table>
          </div>
        )}
      </section>

      {auditRecord && (
        <div className="fixed inset-0 z-[140] flex items-center justify-center bg-black/50 p-4">
          <div className="max-h-[80vh] w-full max-w-xl overflow-auto rounded-xl bg-white p-6 shadow-2xl">
            <div className="flex items-start justify-between gap-4"><div><h3 className="text-lg font-bold text-gray-900">Time Record Audit</h3><p className="text-sm text-gray-500">{auditRecord.workDate} · {auditRecord.approvalStatus}</p></div><button onClick={() => setAuditRecord(null)} className="text-gray-500 hover:text-gray-900">Close</button></div>
            <div className="mt-4 space-y-3">{auditLoading ? <p className="text-sm text-gray-500">Loading history…</p> : auditRevisions.length === 0 ? <p className="text-sm text-gray-500">No audit events were found.</p> : auditRevisions.map((revision) => <div key={revision.id} className="rounded-lg border border-gray-200 p-3 text-sm"><p className="font-semibold text-gray-900">{revision.eventType}</p><p className="mt-1 text-gray-600">Revision {revision.revisionNumber}{revision.actorRole ? ` · ${revision.actorRole}` : ''}{revision.createdAt ? ` · ${new Date(revision.createdAt).toLocaleString()}` : ''}</p>{revision.reason && <p className="mt-1 text-gray-600">Reason: {revision.reason}</p>}</div>)}</div>
          </div>
        </div>
      )}

      {importWizardOpen && (
        <TimesheetImportWizard
          isOpen={importWizardOpen}
          onClose={() => setImportWizardOpen(false)}
          employees={activeEmployees}
          existingTimesheets={timesheets}
          companyId={companyData?.id}
          onSaveTimesheet={onUpdate}
        />
      )}

      {dateFilterOpen && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-2xl">
            <div className="flex items-start justify-between">
              <div>
                <h3 className="text-lg font-bold text-gray-900">Filter timesheets</h3>
                <p className="mt-1 text-sm text-gray-500">Select one date, a date range, and optionally an employee.</p>
              </div>
              <button
                onClick={() => setDateFilterOpen(false)}
                className="text-gray-400 hover:text-gray-700"
                aria-label="Close date filter"
              >
                <Icons.Close className="h-5 w-5" />
              </button>
            </div>

            <div className="mt-5 space-y-4">
              <label className="block text-sm font-medium text-gray-700">
                Date
                <input
                  type="date"
                  value={draftDate}
                  onChange={(event) => setDraftDate(event.target.value)}
                  className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-jam-orange focus:outline-none focus:ring-2 focus:ring-orange-100"
                />
              </label>
              <label className="block text-sm font-medium text-gray-700">
                End date <span className="font-normal text-gray-400">(optional)</span>
                <input
                  type="date"
                  value={draftEndDate}
                  min={draftDate || undefined}
                  onChange={(event) => setDraftEndDate(event.target.value)}
                  className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-jam-orange focus:outline-none focus:ring-2 focus:ring-orange-100"
                />
              </label>
              <label className="block text-sm font-medium text-gray-700">
                Employee <span className="font-normal text-gray-400">(optional)</span>
                <select
                  value={draftEmployeeId}
                  onChange={(event) => setDraftEmployeeId(event.target.value)}
                  className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-jam-orange focus:outline-none focus:ring-2 focus:ring-orange-100"
                >
                  <option value="">All employees</option>
                  {activeEmployees.map((employee) => (
                    <option key={employee.id} value={employee.id}>
                      {employee.firstName} {employee.lastName}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="mt-6 flex items-center justify-between gap-3">
              <button
                onClick={clearDateFilter}
                className="rounded-lg px-3 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100"
              >
                Clear filters
              </button>
              <div className="flex gap-2">
                <button
                  onClick={() => setDateFilterOpen(false)}
                  className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  onClick={applyDateFilter}
                  className="rounded-lg bg-jam-orange px-4 py-2 text-sm font-semibold text-jam-black hover:bg-yellow-500"
                >
                  Apply
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {viewingTimesheet && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/50 p-4">
          <div className="max-h-[90vh] w-full max-w-3xl overflow-hidden rounded-xl bg-white shadow-2xl">
            <div className="flex items-start justify-between border-b border-gray-100 bg-gray-50 p-5">
              <div>
                <h3 className="font-bold text-gray-900">Timesheet details</h3>
                <p className="mt-1 text-sm text-gray-500">
                  {viewingTimesheet.employeeName} · {viewingTimesheet.weekStartDate} to {viewingTimesheet.weekEndDate}
                </p>
              </div>
              <button
                onClick={() => setViewingTimesheet(null)}
                className="text-gray-400 hover:text-gray-700"
                aria-label="Close timesheet details"
              >
                <Icons.Close className="h-5 w-5" />
              </button>
            </div>
            <div className="max-h-[calc(90vh-160px)] space-y-5 overflow-y-auto p-5">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <div className="rounded-lg bg-gray-50 p-3">
                  <p className="text-xs font-semibold uppercase text-gray-500">Status</p>
                  <p className="mt-1 text-sm font-bold text-gray-900">{viewingTimesheet.status}</p>
                </div>
                <div className="rounded-lg bg-gray-50 p-3">
                  <p className="text-xs font-semibold uppercase text-gray-500">Regular</p>
                  <p className="mt-1 text-sm font-bold text-gray-900">{viewingTimesheet.totalRegularHours} hrs</p>
                </div>
                <div className="rounded-lg bg-gray-50 p-3">
                  <p className="text-xs font-semibold uppercase text-gray-500">Overtime</p>
                  <p className="mt-1 text-sm font-bold text-gray-900">{viewingTimesheet.totalOvertimeHours} hrs</p>
                </div>
                <div className="rounded-lg bg-gray-50 p-3">
                  <p className="text-xs font-semibold uppercase text-gray-500">Source</p>
                  <p className="mt-1 text-sm font-bold text-gray-900">{viewingTimesheet.source || 'MANUAL'}</p>
                </div>
              </div>

              {viewingTimesheet.locationName && (
                <p className="text-sm text-gray-600">Location: <span className="font-medium text-gray-900">{viewingTimesheet.locationName}</span></p>
              )}

              <div className="overflow-x-auto rounded-lg border border-gray-200">
                <table className="w-full text-left text-sm">
                  <thead className="bg-gray-50 text-xs font-semibold uppercase text-gray-500">
                    <tr>
                      <th className="px-4 py-3">Date</th>
                      <th className="px-4 py-3">Clock in</th>
                      <th className="px-4 py-3">Clock out</th>
                      <th className="px-4 py-3 text-right">Break</th>
                      <th className="px-4 py-3 text-right">Hours</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {viewingTimesheet.entries.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="px-4 py-6 text-center text-gray-500">No individual time entries were recorded.</td>
                      </tr>
                    ) : viewingTimesheet.entries.map((entry) => (
                      <tr key={entry.id}>
                        <td className="px-4 py-3 text-gray-800">{entry.date}</td>
                        <td className="px-4 py-3 text-gray-700">{entry.startTime || '—'}</td>
                        <td className="px-4 py-3 text-gray-700">{entry.endTime || '—'}</td>
                        <td className="px-4 py-3 text-right text-gray-700">{entry.breakDuration || 0} min</td>
                        <td className="px-4 py-3 text-right font-semibold text-gray-900">{entry.totalHours}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            <div className="flex justify-end border-t border-gray-100 bg-gray-50 p-4">
              <button
                onClick={() => setViewingTimesheet(null)}
                className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {editingTimesheet && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/50 p-4">
          <div className="max-h-[90vh] w-full max-w-4xl overflow-hidden rounded-xl bg-white shadow-2xl">
            <div className="flex items-start justify-between border-b border-gray-100 bg-gray-50 p-5">
              <div>
                <h3 className="font-bold text-gray-900">Edit draft timesheet</h3>
                <p className="mt-1 text-sm text-gray-500">
                  {editingTimesheet.employeeName} · {editingTimesheet.weekStartDate} to {editingTimesheet.weekEndDate}
                </p>
              </div>
              <button
                onClick={() => setEditingTimesheet(null)}
                disabled={isSavingTimeEntry}
                className="text-gray-400 hover:text-gray-700 disabled:cursor-not-allowed"
                aria-label="Close draft timesheet editor"
              >
                <Icons.Close className="h-5 w-5" />
              </button>
            </div>
            <div className="max-h-[calc(90vh-160px)] space-y-4 overflow-y-auto p-5">
              <p className="text-sm text-gray-600">Editing is limited to drafts. Submitted and approved timesheets remain locked for audit integrity.</p>
              <div className="overflow-x-auto rounded-lg border border-gray-200">
                <table className="w-full min-w-[720px] text-left text-sm">
                  <thead className="bg-gray-50 text-xs font-semibold uppercase text-gray-500">
                    <tr>
                      <th className="px-3 py-3">Date</th>
                      <th className="px-3 py-3">Start</th>
                      <th className="px-3 py-3">End</th>
                      <th className="px-3 py-3">Break (min)</th>
                      <th className="px-3 py-3 text-right">Hours</th>
                      <th className="px-3 py-3"><span className="sr-only">Remove entry</span></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {editingTimesheet.entries.map((entry) => (
                      <tr key={entry.id}>
                        <td className="p-2"><input type="date" value={entry.date} onChange={(event) => updateDraftEntry(entry.id, 'date', event.target.value)} className="w-full rounded border border-gray-300 p-2" /></td>
                        <td className="p-2"><input type="time" value={entry.startTime} onChange={(event) => updateDraftEntry(entry.id, 'startTime', event.target.value)} className="w-full rounded border border-gray-300 p-2" /></td>
                        <td className="p-2"><input type="time" value={entry.endTime} onChange={(event) => updateDraftEntry(entry.id, 'endTime', event.target.value)} className="w-full rounded border border-gray-300 p-2" /></td>
                        <td className="p-2"><input type="number" min="0" step="5" value={entry.breakDuration} onChange={(event) => updateDraftEntry(entry.id, 'breakDuration', Number(event.target.value))} className="w-full rounded border border-gray-300 p-2" /></td>
                        <td className="p-2 text-right font-semibold text-gray-900">{calculateEntryHours(entry.startTime, entry.endTime, Number(entry.breakDuration) || 0)}</td>
                        <td className="p-2 text-right"><button type="button" onClick={() => setEditingTimesheet((timesheet) => timesheet && ({ ...timesheet, entries: timesheet.entries.filter((item) => item.id !== entry.id) }))} className="rounded p-2 text-gray-400 hover:bg-red-50 hover:text-red-600" title="Remove entry"><Icons.Trash className="h-4 w-4" /></button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <button
                type="button"
                onClick={() => setEditingTimesheet((timesheet) => timesheet && ({
                  ...timesheet,
                  entries: [...timesheet.entries, {
                    id: `ENTRY-MANUAL-${Date.now()}`,
                    date: timesheet.weekStartDate,
                    startTime: '09:00',
                    endTime: '17:00',
                    breakDuration: 60,
                    totalHours: 7,
                    isOvertime: false,
                    source: 'MANUAL',
                  }],
                }))}
                className="text-sm font-medium text-jam-orange hover:text-yellow-600"
              >
                + Add time entry
              </button>
            </div>
            <div className="flex justify-end gap-3 border-t border-gray-100 bg-gray-50 p-4">
              <button onClick={() => setEditingTimesheet(null)} disabled={isSavingTimeEntry} className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 disabled:cursor-not-allowed">Cancel</button>
              <button onClick={handleSaveDraftEdits} disabled={isSavingTimeEntry} className="rounded-lg bg-jam-black px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-60">{isSavingTimeEntry ? 'Saving...' : 'Save draft changes'}</button>
            </div>
          </div>
        </div>
      )}

      {logTimeModalOpen && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-xl overflow-hidden rounded-xl bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-gray-100 bg-gray-50 p-4">
              <div>
                <h3 className="font-bold text-gray-900">Log Time</h3>
                <p className="text-xs text-gray-500">Add a manual time entry to an employee's weekly timesheet.</p>
              </div>
              <button onClick={() => setLogTimeModalOpen(false)} className="text-gray-400 hover:text-gray-700">
                <Icons.Close className="h-5 w-5" />
              </button>
            </div>
            <div className="space-y-4 p-6">
              <div>
                <label className="mb-1 block text-xs font-bold uppercase text-gray-500">Employee</label>
                <select
                  value={manualEntry.employeeId}
                  onChange={(event) => handleManualEntryChange('employeeId', event.target.value)}
                  className="w-full rounded-lg border border-gray-300 p-2 text-sm"
                  disabled={activeEmployees.length === 0}
                >
                  {activeEmployees.map((employee) => (
                    <option key={employee.id} value={employee.id}>
                      {employee.firstName} {employee.lastName}{employee.employeeId ? ` (${employee.employeeId})` : ''}
                    </option>
                  ))}
                </select>
                {activeEmployees.length === 0 && (
                  <p className="mt-2 text-sm text-red-600">Add an active employee before logging time.</p>
                )}
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs font-bold uppercase text-gray-500">Work Date</label>
                  <input
                    type="date"
                    value={manualEntry.date}
                    onChange={(event) => handleManualEntryChange('date', event.target.value)}
                    className="w-full rounded-lg border border-gray-300 p-2 text-sm"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-bold uppercase text-gray-500">Timesheet Status</label>
                  <select
                    value={manualEntry.status}
                    onChange={(event) => handleManualEntryChange('status', event.target.value as WeeklyTimesheet['status'])}
                    className="w-full rounded-lg border border-gray-300 p-2 text-sm"
                  >
                    <option value="APPROVED">Approved</option>
                    <option value="SUBMITTED">Submitted</option>
                    <option value="DRAFT">Draft</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <div>
                  <label className="mb-1 block text-xs font-bold uppercase text-gray-500">Start Time</label>
                  <input
                    type="time"
                    value={manualEntry.startTime}
                    onChange={(event) => handleManualEntryChange('startTime', event.target.value)}
                    className="w-full rounded-lg border border-gray-300 p-2 text-sm"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-bold uppercase text-gray-500">End Time</label>
                  <input
                    type="time"
                    value={manualEntry.endTime}
                    onChange={(event) => handleManualEntryChange('endTime', event.target.value)}
                    className="w-full rounded-lg border border-gray-300 p-2 text-sm"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-bold uppercase text-gray-500">Break (minutes)</label>
                  <input
                    type="number"
                    min="0"
                    step="5"
                    value={manualEntry.breakDuration}
                    onChange={(event) => handleManualEntryChange('breakDuration', Number(event.target.value))}
                    className="w-full rounded-lg border border-gray-300 p-2 text-sm"
                  />
                </div>
              </div>

              <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 text-sm text-gray-700">
                Total for this entry:{' '}
                <span className="font-bold text-gray-900">
                  {calculateEntryHours(manualEntry.startTime, manualEntry.endTime, Number(manualEntry.breakDuration) || 0)} hours
                </span>
                <span className="ml-2 text-xs text-gray-500">Hours over 8 on the entry are treated as overtime.</span>
              </div>
            </div>
            <div className="flex justify-end gap-3 border-t border-gray-100 bg-gray-50 p-4">
              <button
                onClick={() => setLogTimeModalOpen(false)}
                className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-white"
              >
                Cancel
              </button>
              <button
                onClick={handleLogTime}
                disabled={isSavingTimeEntry || activeEmployees.length === 0}
                className="rounded-lg bg-jam-black px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isSavingTimeEntry ? 'Saving...' : 'Save Time'}
              </button>
            </div>
          </div>
        </div>
      )}

      {qrModalOpen && selectedLocation && (
        <div className={`${kioskMode ? 'fixed inset-0 z-[120] bg-white' : 'fixed inset-0 z-[120] flex items-center justify-center bg-black/50 p-4'} print:static print:block print:bg-white`}>
          <style>{`
            @media print {
              body * { visibility: hidden; }
              .clock-in-qr-print, .clock-in-qr-print * { visibility: visible; }
              .clock-in-qr-print { position: absolute; inset: 0; margin: auto; width: 100%; display: flex; align-items: center; justify-content: center; }
              .clock-in-qr-body { padding: 0 !important; }
              .clock-in-qr-image { width: 62vmin !important; height: 62vmin !important; margin: 5vmin auto 0 !important; border: 0 !important; }
              .no-print { display: none !important; }
            }
          `}</style>
          <div className={`${kioskMode ? 'h-full w-full' : 'w-full max-w-lg rounded-xl bg-white shadow-2xl'} clock-in-qr-print overflow-hidden`}>
            <div className="no-print flex items-center justify-between border-b border-gray-100 bg-gray-50 p-4">
              <div>
                <h3 className="font-bold text-gray-900">Generate Clock-in QR</h3>
                <p className="text-xs text-gray-500">Choose a branch location for employee clock-in/out.</p>
              </div>
              <button onClick={() => setQrModalOpen(false)} className="text-gray-400 hover:text-gray-700">
                <Icons.Close className="h-5 w-5" />
              </button>
            </div>
            <div className={`${kioskMode ? 'flex h-full flex-col items-center justify-center p-10' : 'p-6'} clock-in-qr-body text-center`}>
              <div className="no-print mb-5 space-y-3 text-left">
                <label className="block text-xs font-bold uppercase text-gray-500">Branch Location</label>
                <select
                  value={selectedLocation.id}
                  onChange={(event) => setSelectedLocationId(event.target.value)}
                  className="w-full rounded-lg border border-gray-300 p-2 text-sm"
                >
                  {locations.map((location) => (
                    <option key={location.id} value={location.id}>
                      {location.name} ({location.geofenceRadiusMeters}m)
                    </option>
                  ))}
                </select>
              </div>
              <h2 className={`${kioskMode ? 'text-4xl' : 'text-2xl'} clock-in-qr-label font-bold text-gray-900`}>{selectedLocation.name}</h2>
              <p className="clock-in-qr-label mt-1 text-sm text-gray-500">Scan to clock in/out within {selectedLocation.geofenceRadiusMeters} meters.</p>
              {qrImageUrl && (
                <img
                  src={qrImageUrl}
                  alt={`Clock-in QR for ${selectedLocation.name}`}
                  className={`${kioskMode ? 'mt-10 h-[65vh] w-[65vh]' : 'mx-auto mt-6 h-72 w-72'} clock-in-qr-image border-4 border-black bg-white object-contain`}
                />
              )}
              {attendanceBadgeLoading && (
                <div className="clock-in-qr-label mx-auto mt-5 max-w-xs rounded-xl border border-gray-200 bg-gray-50 p-4 text-sm text-gray-500">
                  Generating secure pass code...
                </div>
              )}
              {attendanceBadge && !attendanceBadgeLoading && (
                <div className="clock-in-qr-label mx-auto mt-5 max-w-xs rounded-xl border border-gray-200 bg-gray-50 p-4">
                  <p className="text-xs font-bold uppercase tracking-wider text-gray-500">Pass Code</p>
                  <p className="mt-1 font-mono text-3xl font-black tracking-[0.25em] text-gray-900">{attendanceBadge.passCode}</p>
                  <p className="mt-2 text-xs text-gray-500">
                    Employees can enter this code if they cannot scan the QR. Expires {new Date(attendanceBadge.expiresAt).toLocaleDateString()}.
                  </p>
                </div>
              )}
              {attendanceBadgeError && (
                <p className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                  {attendanceBadgeError}
                </p>
              )}
              {!qrImageUrl && !attendanceBadgeError && (
                <p className="mt-6 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                  QR code could not be generated. Confirm the company has an active branch location.
                </p>
              )}
              <div className="no-print mt-6 flex flex-col gap-3 sm:flex-row sm:justify-center">
                <button
                  onClick={() => setKioskMode((value) => !value)}
                  className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium hover:bg-gray-50"
                >
                  {kioskMode ? 'Exit Kiosk Mode' : 'Launch Kiosk Mode'}
                </button>
                <button
                  onClick={() => window.print()}
                  disabled={!attendanceBadge || attendanceBadgeLoading}
                  className="rounded-lg bg-jam-black px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Print QR Code Badge
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white p-6 rounded-xl shadow-sm border-l-4 border-jam-orange">
          <div className="flex justify-between items-start">
             <div>
                <p className="text-xs text-gray-500 uppercase font-bold">Pending Review</p>
                <p className="text-3xl font-bold text-gray-900 mt-2">{pendingCount}</p>
             </div>
             <div className="p-2 bg-orange-50 rounded-lg">
                 <Icons.Clock className="w-6 h-6 text-jam-orange" />
             </div>
          </div>
        </div>
        <div className="bg-white p-6 rounded-xl shadow-sm border-l-4 border-purple-500">
          <div className="flex justify-between items-start">
             <div>
                <p className="text-xs text-gray-500 uppercase font-bold">Total Overtime (Hrs)</p>
                <p className="text-3xl font-bold text-gray-900 mt-2">{totalOvertime}</p>
             </div>
             <div className="p-2 bg-purple-50 rounded-lg">
                 <Icons.Trending className="w-6 h-6 text-purple-500" />
             </div>
          </div>
          <p className="text-xs text-gray-400 mt-2">@ 1.5x or 2.0x Rate</p>
        </div>
        <div className="bg-white p-6 rounded-xl shadow-sm border-l-4 border-green-500">
          <div className="flex justify-between items-start">
             <div>
                <p className="text-xs text-gray-500 uppercase font-bold">Submitted / Approved</p>
                <p className="text-3xl font-bold text-gray-900 mt-2">{submissionRate}%</p>
             </div>
             <div className="p-2 bg-green-50 rounded-lg">
                 <Icons.CheckCircle className="w-6 h-6 text-green-500" />
             </div>
          </div>
        </div>
      </div>

      {/* Main List */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200 flex flex-col sm:flex-row sm:items-center justify-between space-y-4 sm:space-y-0">
          <div className="flex items-center space-x-4">
            <h3 className="font-bold text-gray-900">Timesheet Entries</h3>
            <div className="flex items-center space-x-2 bg-gray-100 px-3 py-1.5 rounded-lg">
              <button 
                onClick={() => navigateWeek('prev')}
                className="p-1 hover:bg-white rounded transition-colors"
                title="Previous Week"
              >
                <Icons.ChevronLeft className="w-4 h-4 text-gray-600" />
              </button>
              <span className="text-sm font-medium text-gray-700 min-w-[180px] text-center">
                {weekDisplay}
              </span>
              <button 
                onClick={() => navigateWeek('next')}
                className="p-1 hover:bg-white rounded transition-colors"
                title="Next Week"
              >
                <Icons.ChevronRight className="w-4 h-4 text-gray-600" />
              </button>
              <button
                onClick={goToToday}
                className="ml-2 px-2 py-1 text-xs bg-jam-orange text-jam-black rounded hover:bg-yellow-500 font-medium"
              >
                Today
              </button>
              <button
                onClick={openDateFilter}
                className={`ml-1 rounded p-1 transition-colors ${hasDateFilter || selectedEmployeeId ? 'bg-jam-black text-white' : 'hover:bg-white text-gray-600'}`}
                title="Filter by date or employee"
                aria-label="Filter by date or employee"
              >
                <Icons.Calendar className="h-4 w-4" />
              </button>
            </div>
          </div>
          <div className="flex space-x-2">
            {(['ALL', 'PENDING', 'APPROVED'] as const).map(f => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                  filter === f 
                    ? 'bg-jam-black text-white' 
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {f === 'ALL' ? 'All' : f === 'PENDING' ? 'Pending' : 'Approved'}
              </button>
            ))}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase">Employee</th>
                <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase text-center">Week</th>
                <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase text-center">Regular Hrs</th>
                <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase text-center">Overtime Hrs</th>
                <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase text-center">Total</th>
                <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase">Status</th>
                <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filteredSheets.map((ts) => (
                <tr key={ts.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4">
                    <div className="font-medium text-gray-900">{ts.employeeName}</div>
                    <div className="mt-1 flex items-center gap-2 text-xs text-gray-400">
                      <span className={`rounded px-1.5 py-0.5 font-bold ${ts.source === 'AUTO_QR' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-600'}`}>
                        {ts.source || 'MANUAL'}
                      </span>
                      {ts.locationName && <span>{ts.locationName}</span>}
                    </div>
                  </td>
                  <td className="px-6 py-4 text-center text-sm text-gray-500">
                    {ts.weekStartDate}
                  </td>
                  <td className="px-6 py-4 text-center font-medium text-gray-700">{ts.totalRegularHours}</td>
                  <td className="px-6 py-4 text-center font-medium text-gray-700">
                    {ts.totalOvertimeHours > 0 ? <span className="text-jam-orange">{ts.totalOvertimeHours}</span> : '-'}
                  </td>
                  <td className="px-6 py-4 text-center font-bold text-gray-900">
                    {ts.totalRegularHours + ts.totalOvertimeHours}
                  </td>
                  <td className="px-6 py-4">
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium 
                      ${ts.status === 'APPROVED' ? 'bg-green-100 text-green-800' : 
                        ts.status === 'SUBMITTED' ? 'bg-yellow-100 text-yellow-800' : 
                        ts.status === 'REJECTED' ? 'bg-red-100 text-red-800' : 'bg-gray-100 text-gray-800'}`}>
                      {ts.status}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right">
                    {(ts.status === 'SUBMITTED' || ts.status === 'DRAFT') ? (
                      <div className="flex justify-end space-x-2">
                         {ts.status === 'DRAFT' && (
                           <button
                             onClick={() => handleEditDraft(ts)}
                             className="p-1.5 bg-blue-100 text-blue-600 rounded hover:bg-blue-200 transition-colors"
                             title="Edit draft"
                           >
                             <Icons.FileEdit className="w-4 h-4" />
                           </button>
                         )}
                         <button 
                           onClick={() => handleApprove(ts)}
                           className="p-1.5 bg-green-100 text-green-600 rounded hover:bg-green-200 transition-colors"
                           title="Approve"
                         >
                           <Icons.CheckMark className="w-4 h-4" />
                         </button>
                         <button 
                           onClick={() => handleReject(ts)}
                           className="p-1.5 bg-red-100 text-red-600 rounded hover:bg-red-200 transition-colors"
                           title="Reject"
                         >
                           <Icons.Close className="w-4 h-4" />
                         </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setViewingTimesheet(ts)}
                        className="text-sm font-medium text-gray-500 hover:text-jam-black"
                      >
                        View
                      </button>
                    )}
                  </td>
                </tr>
              ))}
              {filteredSheets.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-6 py-8 text-center text-gray-500">
                    No timesheets found for this filter.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="font-bold text-gray-900">Daily Payroll Time Records</h3>
            <p className="mt-1 text-sm text-gray-500">Approved daily records feed Timesheet-Based Payroll. The table above is the period-based entry view.</p>
          </div>
          <span className="rounded-full bg-gray-100 px-3 py-1 text-sm font-semibold text-gray-700">
            {authoritativeLoading ? 'Loading…' : `${authoritativeRecords.length} records`}
          </span>
        </div>
        {!authoritativeLoading && authoritativeRecords.length === 0 && (
          <p className="mt-4 text-sm text-gray-500">No daily payroll records match the current filters.</p>
        )}
        {!authoritativeLoading && authoritativeRecords.length > 0 && (
          <div className="mt-4 overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="border-b text-left text-xs uppercase text-gray-500"><tr><th className="pb-2 pr-4">Date</th><th className="pb-2 pr-4">Employee</th><th className="pb-2 pr-4">Hours</th><th className="pb-2 pr-4">Status</th><th className="pb-2 pr-4">Audit</th><th className="pb-2">Review</th></tr></thead>
              <tbody>{authoritativeRecords.slice(0, 25).map((record) => {
                const employee = employees.find((item) => item.id === record.employeeId);
                return <tr key={record.id} className="border-b last:border-0"><td className="py-2 pr-4">{record.workDate}</td><td className="py-2 pr-4">{employee ? `${employee.firstName} ${employee.lastName}` : 'Employee'}</td><td className="py-2 pr-4">{(record.workedMinutes / 60).toFixed(2)}</td><td className="py-2 pr-4">{record.approvalStatus}</td><td className="py-2 pr-4"><button onClick={() => handleViewAudit(record)} className="text-xs font-semibold text-blue-700 hover:underline">{record.revisionCount > 0 ? `Edited (${record.revisionCount})` : 'Audit'}</button></td><td className="py-2">{record.approvalStatus === 'LOGGED' ? <span className="flex gap-2"><button onClick={() => handleAuthoritativeReview(record, 'APPROVE')} className="text-xs font-semibold text-emerald-700 hover:underline">Approve</button><button onClick={() => handleAuthoritativeReview(record, 'REJECT')} className="text-xs font-semibold text-red-700 hover:underline">Reject</button></span> : record.approvalStatus === 'LOCKED' ? <button onClick={() => handleCreateAdjustment(record)} className="text-xs font-semibold text-jam-orange hover:underline">Adjust</button> : '—'}</td></tr>;
              })}</tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
};
