import React, { useState } from 'react';
import { Icons } from '../components/Icons';
import { WeeklyTimesheet } from '../types';

interface TimeSheetsProps {
  timesheets?: WeeklyTimesheet[];
  onUpdate?: (ts: WeeklyTimesheet) => void;
}

export const TimeSheets: React.FC<TimeSheetsProps> = ({ 
  timesheets = [], 
  onUpdate 
}) => {
  const [filter, setFilter] = useState<'ALL' | 'PENDING' | 'APPROVED'>('ALL');
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

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center">
        <div>
          <h2 className="text-3xl font-bold text-gray-900">Time & Attendance</h2>
          <p className="text-gray-500 mt-1">Review employee hours and overtime for the current pay cycle.</p>
        </div>
        <div className="mt-4 md:mt-0 flex space-x-3">
          <button className="bg-white border border-gray-300 text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-50 flex items-center">
            <Icons.Download className="w-4 h-4 mr-2" /> Export Report
          </button>
        </div>
      </div>

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
                    <div className="text-xs text-gray-500">{ts.employeeId}</div>
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