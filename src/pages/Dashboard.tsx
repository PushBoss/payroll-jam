
import React, { useMemo, useState, useEffect } from 'react';
import { Icons } from '../components/Icons';
import { Employee, LeaveRequest, PayRun, PayType, CompanySettings } from '../core/types';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { useAuth } from '../context/AuthContext';
import { getPendingInvitationsByEmail, acceptMultipleInvitations } from '../features/employees/inviteService';
import { PendingInvitationsUI } from '../components/PendingInvitationsUI';

const checkedInvitationEmails = new Set<string>();

interface DashboardProps {
  employees: Employee[];
  leaveRequests: LeaveRequest[];
  payRunHistory?: PayRun[];
  onNavigate: (path: string) => void;
  companyData?: CompanySettings;
}

export const Dashboard: React.FC<DashboardProps> = ({ employees, leaveRequests, payRunHistory = [], onNavigate, companyData }) => {
  const { user } = useAuth();
  const [pendingInvites, setPendingInvites] = useState<any[]>([]);

  // Check for pending invites on mount
  useEffect(() => {
    const checkInvites = async () => {
      // Check for invitations for the current user's email
      // OR for an email provided in the URL (handles clicking invite links while logged in)
      const params = new URLSearchParams(window.location.search);
      const urlEmail = params.get('email');
      const emailToCheck = urlEmail || user?.email;

      if (emailToCheck) {
        const normalizedEmail = emailToCheck.trim().toLowerCase();
        if (checkedInvitationEmails.has(normalizedEmail)) {
          return;
        }

        checkedInvitationEmails.add(normalizedEmail);
        console.log('🔍 Checking dashboard invitations for:', emailToCheck);
        try {
          const invites = await getPendingInvitationsByEmail(normalizedEmail);
          if (invites && invites.length > 0) {
            setPendingInvites(invites);
          }
        } catch (error) {
          checkedInvitationEmails.delete(normalizedEmail);
          console.error('Failed to load pending invitations:', error);
        }
      }
    };
    checkInvites();
  }, [user?.email]);

  const handleInvitesAccepted = async (acceptedInvites: any[]) => {
    if (!user) return;
    const inviteIds = acceptedInvites.map(i => i.id);
    const result = await acceptMultipleInvitations(inviteIds, user.id);
    if (result.success) {
      setPendingInvites([]);
      // Reload to reflect changes (e.g. enable switching to new company)
      window.location.reload();
    }
  };

  const pendingLeaveCount = leaveRequests.filter(r => r.status === 'PENDING').length;

  // Get available years from pay run history
  const availableYears = useMemo(() => {
    const years = new Set<number>();
    payRunHistory.forEach(run => {
      let dateStr = run.periodStart;
      if (dateStr.match(/^\d{4}-\d{2}$/)) {
        dateStr = `${dateStr}-01`;
      }
      const date = new Date(dateStr);
      if (!isNaN(date.getTime())) {
        years.add(date.getFullYear());
      }
    });
    return Array.from(years).sort((a, b) => b - a); // Most recent first
  }, [payRunHistory]);

  // Default to current year or most recent year available
  const defaultYear = availableYears.length > 0 ? availableYears[0] : new Date().getFullYear();
  const [selectedYear, setSelectedYear] = useState<number>(defaultYear);
  const [selectedQuarter, setSelectedQuarter] = useState<'ALL' | 'Q1' | 'Q2' | 'Q3' | 'Q4'>('ALL');

  // Quarter month ranges
  const quarterMonths: Record<string, number[]> = {
    'Q1': [0, 1, 2],   // Jan, Feb, Mar
    'Q2': [3, 4, 5],   // Apr, May, Jun
    'Q3': [6, 7, 8],   // Jul, Aug, Sep
    'Q4': [9, 10, 11]  // Oct, Nov, Dec
  };

  // Calculate Chart Data from Real History with filters
  const chartData = useMemo(() => {
    if (payRunHistory.length === 0) {
      return [];
    }

    // Filter by year and quarter
    const filteredRuns = payRunHistory.filter(run => {
      let dateStr = run.periodStart;
      if (dateStr.match(/^\d{4}-\d{2}$/)) {
        dateStr = `${dateStr}-01`;
      }
      const date = new Date(dateStr);

      if (isNaN(date.getTime())) {
        return false;
      }

      // Filter by year
      if (date.getFullYear() !== selectedYear) {
        return false;
      }

      // Filter by quarter if not 'ALL'
      if (selectedQuarter !== 'ALL') {
        const month = date.getMonth();
        if (!quarterMonths[selectedQuarter].includes(month)) {
          return false;
        }
      }

      return true;
    });

    if (filteredRuns.length === 0) {
      return [];
    }

    // Group by Month
    const grouped = filteredRuns.reduce((acc, run) => {
      let dateStr = run.periodStart;
      if (dateStr.match(/^\d{4}-\d{2}$/)) {
        dateStr = `${dateStr}-01`;
      }

      const date = new Date(dateStr);

      if (isNaN(date.getTime())) {
        return acc;
      }

      const month = date.toLocaleString('default', { month: 'short' });
      const existing = acc.find(i => i.name === month);
      if (existing) {
        existing.payroll += run.totalGross;
      } else {
        acc.push({ name: month, payroll: run.totalGross, sortDate: date });
      }
      return acc;
    }, [] as { name: string, payroll: number, sortDate: Date }[]);

    return grouped.sort((a, b) => a.sortDate.getTime() - b.sortDate.getTime()).map(({ name, payroll }) => ({ name, payroll }));
  }, [payRunHistory, selectedYear, selectedQuarter]);

  // Estimate current payroll based on active employees or last run
  const estPayroll = useMemo(() => {
    // If we have recent history, use that as the baseline
    if (payRunHistory.length > 0) {
      return payRunHistory[0].totalGross;
    }

    // Otherwise, calculate a theoretical monthly gross
    return employees.reduce((sum, emp) => {
      if (emp.status !== 'ACTIVE') return sum;

      if (emp.payType === PayType.SALARIED) {
        return sum + emp.grossSalary;
      } else if (emp.payType === PayType.HOURLY && emp.hourlyRate) {
        // Estimate 160 hours (40hr week * 4)
        return sum + (emp.hourlyRate * 160);
      } else if (emp.payType === PayType.COMMISSION) {
        // Conservative estimate or 0 if unknown
        return sum + (emp.grossSalary || 0);
      }
      return sum;
    }, 0);
  }, [employees, payRunHistory]);

  // Compliance audit data
  const complianceAudit = useMemo(() => {
    const activeEmployees = employees.filter(e => e.status === 'ACTIVE');
    const missingTRN = activeEmployees.filter(e => !e.trn || e.trn.length < 9 || e.trn.toUpperCase() === 'PENDING');
    const missingNIS = activeEmployees.filter(e => !e.nis || e.nis.trim() === '' || e.nis.toUpperCase() === 'PENDING');
    const missingBank = activeEmployees.filter(e => !e.bankDetails?.accountNumber || e.bankDetails.accountNumber.trim() === '' || e.bankDetails.accountNumber.toUpperCase() === 'PENDING');

    return { missingTRN, missingNIS, missingBank };
  }, [employees]);

  return (
    <div className="space-y-6">
      <PendingInvitationsUI 
        invitations={pendingInvites}
        onInvitationsAccepted={handleInvitesAccepted}
        onSkip={() => setPendingInvites([])}
      />
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center">
        <div>
          <h2 className="text-3xl font-bold text-gray-900">Dashboard</h2>
          <p className="text-gray-500 mt-1">Welcome back, here's what's happening{companyData?.name ? ` at ${companyData.name}` : ''}.</p>
        </div>
        <button
          onClick={() => onNavigate('payrun')}
          className="mt-4 md:mt-0 bg-jam-black text-white px-6 py-2.5 rounded-lg hover:bg-gray-800 flex items-center shadow-lg transform hover:-translate-y-0.5 transition-all"
        >
          <Icons.Payroll className="w-4 h-4 mr-2" />
          Run Payroll
        </button>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-500">Total Employees</p>
              <p className="text-3xl font-bold text-gray-900 mt-2">{employees.length}</p>
            </div>
            <div className="p-3 bg-jam-orange/10 rounded-full">
              <Icons.Users className="w-6 h-6 text-jam-orange" />
            </div>
          </div>
          <p className="text-xs text-green-600 mt-3 flex items-center">
            <Icons.Plus className="w-3 h-3 mr-1" /> Active Staff
          </p>
        </div>

        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-500">Next Pay Date</p>
              <p className="text-3xl font-bold text-gray-900 mt-2">Feb 25</p>
            </div>
            <div className="p-3 bg-jam-yellow/20 rounded-full">
              <Icons.Calendar className="w-6 h-6 text-yellow-700" />
            </div>
          </div>
          <p className="text-xs text-gray-500 mt-3">Monthly Cycle</p>
        </div>

        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-500">Pending Approvals</p>
              <p className="text-3xl font-bold text-gray-900 mt-2">{pendingLeaveCount}</p>
            </div>
            <div className="p-3 bg-red-50 rounded-full">
              <Icons.Alert className="w-6 h-6 text-red-500" />
            </div>
          </div>
          <p className="text-xs text-gray-500 mt-3">Leave requests</p>
        </div>

        <div className="bg-jam-black text-white p-6 rounded-xl shadow-lg">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-400">Est. Total Payroll</p>
              <p className="text-3xl font-bold text-white mt-2">${estPayroll.toLocaleString()}</p>
            </div>
            <div className="p-3 bg-white/10 rounded-full">
              <Icons.Payroll className="w-6 h-6 text-jam-yellow" />
            </div>
          </div>
          <p className="text-xs text-gray-400 mt-3">Includes statutory deductions</p>
        </div>
      </div>

      {/* Compliance Audit Card */}
      <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
        <h3 className="text-lg font-semibold text-gray-800 mb-4">Compliance Audit</h3>
        <div className="space-y-4">
          <div className={`p-4 rounded-lg border ${complianceAudit.missingTRN.length === 0 ? 'bg-green-50 border-green-100' : 'bg-red-50 border-red-100'}`}>
            <div className="flex items-center justify-between">
              <div className="flex items-start">
                {complianceAudit.missingTRN.length === 0 ? (
                  <Icons.Check className="w-5 h-5 text-green-600 mt-0.5 flex-shrink-0" />
                ) : (
                  <Icons.Alert className="w-5 h-5 text-red-600 mt-0.5 flex-shrink-0" />
                )}
                <div className="ml-3">
                  <h4 className={`text-sm font-semibold ${complianceAudit.missingTRN.length === 0 ? 'text-green-800' : 'text-red-800'}`}>
                    Tax Registration Numbers (TRN)
                  </h4>
                  <p className={`text-xs mt-1 ${complianceAudit.missingTRN.length === 0 ? 'text-green-700' : 'text-red-700'}`}>
                    {complianceAudit.missingTRN.length === 0
                      ? 'All Clear - Required for all active employees'
                      : `${complianceAudit.missingTRN.length} employee(s) missing TRN: ${complianceAudit.missingTRN.map(e => `${e.firstName} ${e.lastName}`).join(', ')}`}
                  </p>
                </div>
              </div>
              {complianceAudit.missingTRN.length > 0 && (
                <button
                  onClick={() => onNavigate('employees')}
                  className="text-xs text-red-600 hover:text-red-800 font-medium"
                >
                  Fix →
                </button>
              )}
            </div>
          </div>

          <div className={`p-4 rounded-lg border ${complianceAudit.missingNIS.length === 0 ? 'bg-green-50 border-green-100' : 'bg-yellow-50 border-yellow-100'}`}>
            <div className="flex items-center justify-between">
              <div className="flex items-start">
                {complianceAudit.missingNIS.length === 0 ? (
                  <Icons.Check className="w-5 h-5 text-green-600 mt-0.5 flex-shrink-0" />
                ) : (
                  <Icons.Alert className="w-5 h-5 text-yellow-600 mt-0.5 flex-shrink-0" />
                )}
                <div className="ml-3">
                  <h4 className={`text-sm font-semibold ${complianceAudit.missingNIS.length === 0 ? 'text-green-800' : 'text-yellow-800'}`}>
                    National Insurance (NIS)
                  </h4>
                  <p className={`text-xs mt-1 ${complianceAudit.missingNIS.length === 0 ? 'text-green-700' : 'text-red-700'}`}>
                    {complianceAudit.missingNIS.length === 0
                      ? 'All Clear - Required for all active employees'
                      : `${complianceAudit.missingNIS.length} employee(s) missing NIS: ${complianceAudit.missingNIS.map(e => `${e.firstName} ${e.lastName}`).join(', ')}`}
                  </p>
                </div>
              </div>
              {complianceAudit.missingNIS.length > 0 && (
                <button
                  onClick={() => onNavigate('employees')}
                  className="text-xs text-yellow-600 hover:text-yellow-800 font-medium"
                >
                  Fix →
                </button>
              )}
            </div>
          </div>

          <div className={`p-4 rounded-lg border ${complianceAudit.missingBank.length === 0 ? 'bg-green-50 border-green-100' : 'bg-orange-50 border-orange-100'}`}>
            <div className="flex items-center justify-between">
              <div className="flex items-start">
                {complianceAudit.missingBank.length === 0 ? (
                  <Icons.Check className="w-5 h-5 text-green-600 mt-0.5 flex-shrink-0" />
                ) : (
                  <Icons.Alert className="w-5 h-5 text-orange-600 mt-0.5 flex-shrink-0" />
                )}
                <div className="ml-3">
                  <h4 className={`text-sm font-semibold ${complianceAudit.missingBank.length === 0 ? 'text-green-800' : 'text-orange-800'}`}>
                    Bank Account Details
                  </h4>
                  <p className={`text-xs mt-1 ${complianceAudit.missingBank.length === 0 ? 'text-green-700' : 'text-red-700'}`}>
                    {complianceAudit.missingBank.length === 0
                      ? 'All Clear - Required for all electronic payments'
                      : `${complianceAudit.missingBank.length} employee(s) missing bank details: ${complianceAudit.missingBank.map(e => `${e.firstName} ${e.lastName}`).join(', ')}`}
                  </p>
                </div>
              </div>
              {complianceAudit.missingBank.length > 0 && (
                <button
                  onClick={() => onNavigate('employees')}
                  className="text-xs text-orange-600 hover:text-orange-800 font-medium"
                >
                  Fix →
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Charts Section */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-white p-6 rounded-xl shadow-sm border border-gray-100">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-lg font-semibold text-gray-800">Payroll History (YTD Gross)</h3>
            <div className="flex items-center gap-3">
              {/* Year Filter */}
              <select
                value={selectedYear}
                onChange={(e) => setSelectedYear(parseInt(e.target.value))}
                className="text-sm border border-gray-300 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-jam-orange focus:border-transparent bg-white"
              >
                {availableYears.map(year => (
                  <option key={year} value={year}>{year}</option>
                ))}
              </select>

              {/* Quarter Filter */}
              <select
                value={selectedQuarter}
                onChange={(e) => setSelectedQuarter(e.target.value as 'ALL' | 'Q1' | 'Q2' | 'Q3' | 'Q4')}
                className="text-sm border border-gray-300 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-jam-orange focus:border-transparent bg-white"
              >
                <option value="ALL">All Quarters</option>
                <option value="Q1">Q1 (Jan-Mar)</option>
                <option value="Q2">Q2 (Apr-Jun)</option>
                <option value="Q3">Q3 (Jul-Sep)</option>
                <option value="Q4">Q4 (Oct-Dec)</option>
              </select>
            </div>
          </div>
          <div className="h-72">
            {chartData.length === 0 ? (
              <div className="h-full flex items-center justify-center text-gray-500">
                <div className="text-center">
                  <Icons.Alert className="w-12 h-12 mx-auto mb-2 text-gray-400" />
                  <p className="text-sm">No payroll data for {selectedYear} {selectedQuarter !== 'ALL' ? selectedQuarter : ''}</p>
                </div>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" />
                  <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#6B7280' }} dy={10} />
                  <YAxis axisLine={false} tickLine={false} tick={{ fill: '#6B7280' }} tickFormatter={(val) => `$${val / 1000}k`} />
                  <Tooltip
                    cursor={{ fill: '#F3F4F6' }}
                    formatter={(val: number) => [`$${val.toLocaleString()}`, 'Gross Payroll']}
                    contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)' }}
                  />
                  <Bar dataKey="payroll" fill="#111827" radius={[4, 4, 0, 0]} barSize={32} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
          <h3 className="text-lg font-semibold text-gray-800 mb-4">Compliance Alerts</h3>
          <div className="space-y-4">
            <div className="p-4 bg-yellow-50 border border-yellow-100 rounded-lg flex items-start">
              <Icons.Alert className="w-5 h-5 text-yellow-600 mt-0.5 flex-shrink-0" />
              <div className="ml-3">
                <h4 className="text-sm font-semibold text-yellow-800">SO1 Due</h4>
                <p className="text-xs text-yellow-700 mt-1">Monthly statutory remittance (SO1) for January is due on Feb 14th.</p>
              </div>
            </div>
            <div className="p-4 bg-green-50 border border-green-100 rounded-lg flex items-start">
              <Icons.Check className="w-5 h-5 text-green-600 mt-0.5 flex-shrink-0" />
              <div className="ml-3">
                <h4 className="text-sm font-semibold text-green-800">NHT Refund</h4>
                <p className="text-xs text-green-700 mt-1">All applications processed successfully.</p>
              </div>
            </div>
          </div>
          <button onClick={() => onNavigate('compliance')} className="w-full mt-6 py-2 text-sm font-medium text-gray-600 hover:text-gray-900 border border-gray-200 rounded-lg hover:bg-gray-50">
            View All Deadlines
          </button>
        </div>
      </div>
    </div>
  );
};
