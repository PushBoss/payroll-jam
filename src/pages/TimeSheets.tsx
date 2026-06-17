import React, { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { toast } from 'sonner';
import { Icons } from '../components/Icons';
import { CompanySettings, Employee, WeeklyTimesheet } from '../core/types';
import { buildAppUrl } from '../app/routes';
import { encodeClockInPayload, getCompanyLocations } from '../utils/attendance';

interface TimeSheetsProps {
  timesheets?: WeeklyTimesheet[];
  employees?: Employee[];
  onUpdate?: (ts: WeeklyTimesheet) => void | boolean | Promise<void | boolean>;
  companyData?: CompanySettings;
}

const toDateInputValue = (date: Date) => date.toISOString().split('T')[0];

const getWeekBounds = (dateValue: string) => {
  const date = new Date(`${dateValue}T00:00:00`);
  const dayOfWeek = date.getDay();
  const monday = new Date(date);
  monday.setDate(date.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1));
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);

  return {
    weekStartDate: toDateInputValue(monday),
    weekEndDate: toDateInputValue(sunday),
  };
};

const getTimeMinutes = (value: string) => {
  const [hours, minutes] = value.split(':').map(Number);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return NaN;
  return (hours * 60) + minutes;
};

const calculateEntryHours = (startTime: string, endTime: string, breakDuration: number) => {
  const startMinutes = getTimeMinutes(startTime);
  let endMinutes = getTimeMinutes(endTime);
  if (!Number.isFinite(startMinutes) || !Number.isFinite(endMinutes)) return 0;
  if (endMinutes < startMinutes) endMinutes += 24 * 60;
  const workedMinutes = Math.max(0, endMinutes - startMinutes - breakDuration);
  return Number((workedMinutes / 60).toFixed(2));
};

const summarizeEntries = (entries: WeeklyTimesheet['entries']) => entries.reduce(
  (summary, entry) => {
    const regularHours = Math.min(entry.totalHours, 8);
    const overtimeHours = Math.max(0, entry.totalHours - regularHours);
    return {
      regular: Number((summary.regular + regularHours).toFixed(2)),
      overtime: Number((summary.overtime + overtimeHours).toFixed(2)),
    };
  },
  { regular: 0, overtime: 0 }
);

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
  const [isSavingTimeEntry, setIsSavingTimeEntry] = useState(false);
  const [kioskMode, setKioskMode] = useState(false);
  const [selectedLocationId, setSelectedLocationId] = useState(locations[0]?.id || '');
  const [qrImageUrl, setQrImageUrl] = useState('');
  const [manualEntry, setManualEntry] = useState({
    employeeId: '',
    date: toDateInputValue(new Date()),
    startTime: '09:00',
    endTime: '17:00',
    breakDuration: 60,
    status: 'APPROVED' as WeeklyTimesheet['status'],
  });
  const [currentWeekStart, setCurrentWeekStart] = useState<string>(() => {
    // Get Monday of current week
    const today = new Date();
    const dayOfWeek = today.getDay();
    const monday = new Date(today);
    monday.setDate(today.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1));
    return monday.toISOString().split('T')[0];
  });

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

  const weekSheets = timesheets.filter(ts => ts.weekStartDate === currentWeekStart);

  const filteredSheets = weekSheets.filter(ts => {
    if (filter === 'ALL') return true;
    if (filter === 'PENDING') return ts.status === 'SUBMITTED';
    return ts.status === filter;
  });

  const navigateWeek = (direction: 'prev' | 'next') => {
    const date = new Date(currentWeekStart);
    date.setDate(date.getDate() + (direction === 'next' ? 7 : -7));
    setCurrentWeekStart(date.toISOString().split('T')[0]);
  };

  const goToToday = () => {
    const today = new Date();
    const dayOfWeek = today.getDay();
    const monday = new Date(today);
    monday.setDate(today.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1));
    setCurrentWeekStart(monday.toISOString().split('T')[0]);
  };

  const weekEnd = new Date(currentWeekStart);
  weekEnd.setDate(weekEnd.getDate() + 6);
  const weekDisplay = `${new Date(currentWeekStart).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - ${weekEnd.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`;
  const activeEmployees = employees.filter((employee) => employee.status !== 'ARCHIVED' && employee.status !== 'TERMINATED');

  const pendingCount = weekSheets.filter(t => t.status === 'SUBMITTED').length;
  const totalOvertime = filteredSheets.reduce((acc, t) => acc + t.totalOvertimeHours, 0);
  const submittedOrApprovedCount = weekSheets.filter(t => t.status === 'SUBMITTED' || t.status === 'APPROVED').length;
  const submissionRate = weekSheets.length > 0 ? Math.round((submittedOrApprovedCount / weekSheets.length) * 100) : 0;
  const selectedLocation = locations.find((location) => location.id === selectedLocationId) || locations[0];

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

    if (!qrModalOpen || !selectedLocation || !companyData?.id) {
      setQrImageUrl('');
      return () => {
        active = false;
      };
    }

    const qrPayload = encodeClockInPayload(companyData.id, selectedLocation.id);
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
  }, [companyData?.id, qrModalOpen, selectedLocation?.id]);

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
      id: existingTimesheet?.id || `TS-MANUAL-${employee.id}-${weekStartDate}`,
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
      await onUpdate(timesheet);
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
        <div className="mt-4 md:mt-0 flex space-x-3">
          <button
            onClick={() => setQrModalOpen(true)}
            className="bg-jam-black text-white px-4 py-2 rounded-lg hover:bg-gray-800 flex items-center"
          >
            <Icons.Clock className="w-4 h-4 mr-2" /> Generate Clock-in QR
          </button>
          <button
            onClick={() => setLogTimeModalOpen(true)}
            className="bg-jam-orange text-jam-black px-4 py-2 rounded-lg hover:bg-yellow-500 flex items-center font-semibold"
          >
            <Icons.Plus className="w-4 h-4 mr-2" /> Log Time
          </button>
          <button className="bg-white border border-gray-300 text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-50 flex items-center">
            <Icons.Download className="w-4 h-4 mr-2" /> Export Report
          </button>
        </div>
      </div>

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
              .clock-in-qr-label { display: none !important; }
              .clock-in-qr-image { width: 80vmin !important; height: 80vmin !important; margin: 0 !important; border: 0 !important; }
              .no-print { display: none !important; }
            }
          `}</style>
          <div className={`${kioskMode ? 'h-full w-full' : 'w-full max-w-lg rounded-xl bg-white shadow-2xl'} clock-in-qr-print overflow-hidden`}>
            <div className="no-print flex items-center justify-between border-b border-gray-100 bg-gray-50 p-4">
              <div>
                <h3 className="font-bold text-gray-900">Generate Clock-in QR</h3>
                <p className="text-xs text-gray-500">Choose a branch location for employee clock-in.</p>
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
              <p className="clock-in-qr-label mt-1 text-sm text-gray-500">Scan to clock in within {selectedLocation.geofenceRadiusMeters} meters.</p>
              {qrImageUrl && (
                <img
                  src={qrImageUrl}
                  alt={`Clock-in QR for ${selectedLocation.name}`}
                  className={`${kioskMode ? 'mt-10 h-[65vh] w-[65vh]' : 'mx-auto mt-6 h-72 w-72'} clock-in-qr-image border-4 border-black bg-white object-contain`}
                />
              )}
              {!qrImageUrl && (
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
                  className="rounded-lg bg-jam-black px-4 py-2 text-sm font-medium text-white hover:bg-gray-800"
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
            <h3 className="font-bold text-gray-900">Weekly Timesheets</h3>
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
                    {ts.status === 'SUBMITTED' ? (
                      <div className="flex justify-end space-x-2">
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
                      <button className="text-sm text-gray-400 hover:text-jam-black font-medium">View</button>
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
    </div>
  );
};
