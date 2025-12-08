
import React, { useMemo } from 'react';
import { Icons } from '../components/Icons';
import { Employee, LeaveRequest, PayRun, PayType, CompanySettings } from '../types';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

interface DashboardProps {
  employees: Employee[];
  leaveRequests: LeaveRequest[];
  payRunHistory?: PayRun[];
  onNavigate: (path: string) => void;
  companyData?: CompanySettings;
}

export const Dashboard: React.FC<DashboardProps> = ({ employees, leaveRequests, payRunHistory = [], onNavigate, companyData }) => {
  const pendingLeaveCount = leaveRequests.filter(r => r.status === 'PENDING').length;

  // Calculate Chart Data from Real History
  const chartData = useMemo(() => {
    if (payRunHistory.length === 0) {
        return [
            { name: 'Aug', payroll: 0 },
            { name: 'Sep', payroll: 0 },
            { name: 'Oct', payroll: 0 },
            { name: 'Nov', payroll: 0 },
            { name: 'Dec', payroll: 0 },
            { name: 'Jan', payroll: 0 },
        ];
    }

    // Group by Month
    const grouped = payRunHistory.reduce((acc, run) => {
        const date = new Date(run.periodStart + '-01'); // Assuming YYYY-MM format
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
  }, [payRunHistory]);

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

  return (
    <div className="space-y-6">
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

      {/* Charts Section */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-white p-6 rounded-xl shadow-sm border border-gray-100">
          <h3 className="text-lg font-semibold text-gray-800 mb-6">Payroll History (YTD Gross)</h3>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fill: '#6B7280'}} dy={10} />
                <YAxis axisLine={false} tickLine={false} tick={{fill: '#6B7280'}} tickFormatter={(val) => `$${val/1000}k`} />
                <Tooltip 
                    cursor={{fill: '#F3F4F6'}}
                    formatter={(val: number) => [`$${val.toLocaleString()}`, 'Gross Payroll']}
                    contentStyle={{borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)'}}
                />
                <Bar dataKey="payroll" fill="#111827" radius={[4, 4, 0, 0]} barSize={32} />
              </BarChart>
            </ResponsiveContainer>
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
