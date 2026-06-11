import React, { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { Icons } from '../components/Icons';
import { CompanySettings, WeeklyTimesheet } from '../core/types';
import { buildAppUrl } from '../app/routes';
import { encodeClockInPayload, getCompanyLocations } from '../utils/attendance';

interface TimeSheetsProps {
  timesheets?: WeeklyTimesheet[];
  onUpdate?: (ts: WeeklyTimesheet) => void;
  companyData?: CompanySettings;
}

export const TimeSheets: React.FC<TimeSheetsProps> = ({ 
  timesheets = [], 
  onUpdate,
  companyData
}) => {
  const [filter, setFilter] = useState<'ALL' | 'PENDING' | 'APPROVED'>('ALL');
  const locations = getCompanyLocations(companyData);
  const [qrModalOpen, setQrModalOpen] = useState(false);
  const [kioskMode, setKioskMode] = useState(false);
  const [selectedLocationId, setSelectedLocationId] = useState(locations[0]?.id || '');
  const [qrImageUrl, setQrImageUrl] = useState('');
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

  const filteredSheets = timesheets.filter(ts => {
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

  const pendingCount = timesheets.filter(t => t.status === 'SUBMITTED').length;
  const totalOvertime = timesheets.reduce((acc, t) => acc + t.totalOvertimeHours, 0);
  const selectedLocation = locations.find((location) => location.id === selectedLocationId) || locations[0];

  useEffect(() => {
    if (!selectedLocationId && locations[0]?.id) {
      setSelectedLocationId(locations[0].id);
    }
  }, [locations, selectedLocationId]);

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
          <button className="bg-white border border-gray-300 text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-50 flex items-center">
            <Icons.Download className="w-4 h-4 mr-2" /> Export Report
          </button>
        </div>
      </div>

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
                <p className="text-xs text-gray-500 uppercase font-bold">On-Time Submission</p>
                <p className="text-3xl font-bold text-gray-900 mt-2">92%</p>
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
