
import React, { useMemo, useState, useEffect } from 'react';
import { Icons } from '../components/Icons';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip as RechartsTooltip, Legend } from 'recharts';
import { PayRun, PayRunLineItem, CompanySettings, AuditLogEntry, Employee, IntegrationConfig } from '../core/types';
import { generateFullRegisterCSV, generateS01CSV, generateS02CSV, generateNCBFile, generateBNSFile, generateGLCSV } from '../utils/exportHelpers';
import { PayslipView } from '../components/PayslipView';
import { auditService } from '../core/auditService';
import { useAuth } from '../context/AuthContext';
import { toast } from 'sonner';

interface ReportsProps {
  history?: PayRun[];
  companyData?: CompanySettings;
  onUpdatePayRun?: (run: PayRun) => void | Promise<void> | Promise<boolean>;
  onDeletePayRun?: (runId: string) => void | Promise<void>;
  onNavigate?: (path: string, params?: { editRunId?: string }) => void;
  employees?: Employee[];
  integrationConfig?: IntegrationConfig;
}

export const Reports: React.FC<ReportsProps> = ({
  history = [],
  companyData,
  onDeletePayRun,
  onNavigate,
  employees = [],
  integrationConfig
}) => {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<'register' | 'statutory' | 'audit'>('register');
  const [selectedRun, setSelectedRun] = useState<PayRun | null>(null);
  // Removed editingRun state - edit functionality can be added later if needed
  const [viewingPayslip, setViewingPayslip] = useState<PayRunLineItem | null>(null);
  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>([]);
  const [auditFilter, setAuditFilter] = useState('ALL');
  const [selectedMonth, setSelectedMonth] = useState<string>(new Date().toISOString().slice(0, 7)); // YYYY-MM format
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'DRAFT' | 'APPROVED' | 'FINALIZED'>('ALL');

  useEffect(() => {
    const loadAuditLogs = async () => {
      const logs = await auditService.getLogs(user?.companyId || null, user?.role, user?.id);
      setAuditLogs(logs);
    };
    if (activeTab === 'audit') {
      loadAuditLogs();
    }
  }, [activeTab, user?.companyId, user?.role, user?.id]);

  // Use empty array fallback to prevent crashes if history undefined
  const displayHistory = history || [];

  // Group pay runs by status
  const payRunsByStatus = useMemo(() => {
    const grouped = {
      DRAFT: [] as PayRun[],
      APPROVED: [] as PayRun[],
      FINALIZED: [] as PayRun[]
    };

    displayHistory.forEach(run => {
      if (run.status === 'DRAFT') grouped.DRAFT.push(run);
      else if (run.status === 'APPROVED') grouped.APPROVED.push(run);
      else if (run.status === 'FINALIZED') grouped.FINALIZED.push(run);
    });

    return grouped;
  }, [displayHistory]);

  // Filtered history based on status filter
  const filteredHistory = useMemo(() => {
    if (statusFilter === 'ALL') return displayHistory;
    return displayHistory.filter(run => run.status === statusFilter);
  }, [displayHistory, statusFilter]);

  // Handle delete with confirmation
  const handleDelete = async (run: PayRun) => {
    if (run.status !== 'DRAFT') {
      toast.error('Only draft pay runs can be deleted');
      return;
    }

    if (window.confirm(`Are you sure you want to delete this ${run.status} pay run for ${run.periodStart}? This action cannot be undone.`)) {
      if (onDeletePayRun) {
        try {
          await onDeletePayRun(run.id);
          toast.success('Pay run deleted successfully');
        } catch (error) {
          console.error('❌ Failed to delete pay run:', error);
          toast.error('Failed to delete pay run from database.');
        }
      } else {
        toast.error('Delete function not available');
      }
    }
  };

  // Calculate Statutory Data dynamically from History
  const statData = useMemo(() => {
    const totals = displayHistory.reduce((acc, run) => {
      run.lineItems.forEach(line => {
        acc.nis += line.nis || 0;
        acc.nht += line.nht || 0;
        acc.edTax += line.edTax || 0;
        acc.paye += line.paye || 0;
      });
      return acc;
    }, { nis: 0, nht: 0, edTax: 0, paye: 0 });

    // Handle case where no data exists to prevent empty chart
    if (totals.nis === 0 && totals.nht === 0 && totals.edTax === 0 && totals.paye === 0) {
      return [
        { name: 'No Data', value: 100, color: '#E5E7EB' }
      ];
    }

    return [
      { name: 'NIS', value: totals.nis, color: '#FFA500' }, // Orange
      { name: 'NHT', value: totals.nht, color: '#FFD23F' }, // Yellow
      { name: 'Ed Tax', value: totals.edTax, color: '#111827' }, // Black
      { name: 'PAYE', value: totals.paye, color: '#9CA3AF' }, // Gray
    ];
  }, [displayHistory]);

  const totalTaxLiability = statData.reduce((acc, curr) => curr.name !== 'No Data' ? acc + curr.value : acc, 0);

  const filteredAuditLogs = auditLogs.filter(log => auditFilter === 'ALL' || log.action === auditFilter);

  const handleExportCSV = () => {
    if (displayHistory.length > 0) {
      generateFullRegisterCSV(displayHistory);
    }
  };

  const handleExportS01 = () => {
    if (companyData && displayHistory.length > 0) {
      // Filter pay runs by selected month
      const [year, month] = selectedMonth.split('-').map(Number);
      const filteredRuns = displayHistory.filter(run => {
        const runDate = new Date(run.periodStart);
        return runDate.getFullYear() === year && (runDate.getMonth() + 1) === month;
      });

      if (filteredRuns.length === 0) {
        alert(`No payroll data found for ${new Date(year, month - 1).toLocaleString('default', { month: 'long', year: 'numeric' })}`);
        return;
      }

      generateS01CSV(companyData, filteredRuns);
    } else {
      alert("No data available to generate S01.");
    }
  };

  const handleDownloadBankFile = (run: PayRun, type: 'NCB' | 'BNS') => {
    if (!companyData) return;
    if (type === 'NCB') {
      generateNCBFile(run, companyData, employees);
    } else if (type === 'BNS') {
      generateBNSFile(run, companyData, employees);
    }
  };

  const handleDownloadGL = (run: PayRun) => {
    if (!integrationConfig) {
      toast.error("Integration settings not found");
      return;
    }
    generateGLCSV(run, integrationConfig);
    toast.success("GL CSV Exported");
  };

  const handleExportS02 = () => {
    if (companyData && displayHistory.length > 0) {
      generateS02CSV(companyData, displayHistory);
    } else {
      alert("No data available to generate S02.");
    }
  };

  const renderDetailModal = () => {
    if (!selectedRun) return null;

    if (viewingPayslip) {
      return (
        <PayslipView
          data={viewingPayslip}
          companyName={companyData?.name || 'JamCorp Ltd.'}
          payPeriod={selectedRun.periodStart}
          payDate={selectedRun.payDate}
          onClose={() => setViewingPayslip(null)}
        />
      );
    }

    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 print-only-modal-overlay">
        <div className="bg-white w-full max-w-5xl rounded-xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh] print-only-modal">
          <div className="p-6 border-b border-gray-200 flex justify-between items-center bg-gray-50 print:bg-white print:border-b-2 print:border-gray-800">
            <div>
              <h3 className="text-xl font-bold text-gray-900">Payroll Register Detail</h3>
              <p className="text-sm text-gray-500">Run ID: {selectedRun.id} • Period: {selectedRun.periodStart}</p>
            </div>
            <button onClick={() => setSelectedRun(null)} className="text-gray-400 hover:text-gray-600 no-print">
              <Icons.Close className="w-6 h-6" />
            </button>
          </div>

          <div className="p-6 overflow-y-auto">
            <div className="grid grid-cols-3 gap-4 mb-6 print:gap-2">
              <div className="bg-gray-50 p-4 rounded-lg border border-gray-200 print:bg-transparent print:border-gray-300">
                <p className="text-xs text-gray-500 uppercase font-bold">Total Gross</p>
                <p className="text-lg font-bold text-gray-900">${selectedRun.totalGross.toLocaleString()}</p>
              </div>
              <div className="bg-gray-50 p-4 rounded-lg border border-gray-200 print:bg-transparent print:border-gray-300">
                <p className="text-xs text-gray-500 uppercase font-bold">Total Net</p>
                <p className="text-lg font-bold text-jam-black">${selectedRun.totalNet.toLocaleString()}</p>
              </div>
              <div className="bg-gray-50 p-4 rounded-lg border border-gray-200 print:bg-transparent print:border-gray-300">
                <p className="text-xs text-gray-500 uppercase font-bold">Employees</p>
                <p className="text-lg font-bold text-gray-900">{selectedRun.lineItems?.length || 0}</p>
              </div>
            </div>

            {selectedRun.lineItems && selectedRun.lineItems.length > 0 ? (
              <table className="w-full text-sm text-left border-collapse">
                <thead className="bg-gray-100 text-gray-600 print:bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 rounded-tl-lg">Employee</th>
                    <th className="px-4 py-3 text-right">Gross</th>
                    <th className="px-4 py-3 text-right text-red-600">NIS</th>
                    <th className="px-4 py-3 text-right text-red-600">NHT</th>
                    <th className="px-4 py-3 text-right text-red-600">PAYE</th>
                    <th className="px-4 py-3 text-right font-bold">Net</th>
                    <th className="px-4 py-3 text-center rounded-tr-lg no-print">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {selectedRun.lineItems.map((line, idx) => (
                    <tr key={idx} className="hover:bg-gray-50">
                      <td className="px-4 py-3 font-medium">{line.employeeName}</td>
                      <td className="px-4 py-3 text-right">${line.grossPay.toLocaleString()}</td>
                      <td className="px-4 py-3 text-right text-red-500">-${line.nis.toLocaleString()}</td>
                      <td className="px-4 py-3 text-right text-red-500">-${line.nht.toLocaleString()}</td>
                      <td className="px-4 py-3 text-right text-red-500">-${line.paye.toLocaleString()}</td>
                      <td className="px-4 py-3 text-right font-bold">${line.netPay.toLocaleString()}</td>
                      <td className="px-4 py-3 text-center no-print">
                        <button
                          onClick={() => setViewingPayslip(line)}
                          className="text-xs bg-white border border-gray-300 px-2 py-1 rounded hover:bg-gray-50 text-gray-700"
                        >
                          View Slip
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div className="text-center py-12 text-gray-400 bg-gray-50 rounded-lg border-2 border-dashed border-gray-200">
                No line item details available for this record.
              </div>
            )}
          </div>

          <div className="p-6 border-t border-gray-200 bg-gray-50 flex flex-wrap justify-end gap-3 no-print">
            <button
              onClick={() => handleDownloadGL(selectedRun)}
              className="px-4 py-2 bg-blue-50 border border-blue-200 rounded-lg text-blue-700 hover:bg-blue-100 flex items-center text-sm font-bold"
            >
              <Icons.Link className="w-4 h-4 mr-2" />
              Sync to GL
            </button>
            <div className="flex border border-gray-300 rounded-lg overflow-hidden">
              <button
                onClick={() => handleDownloadBankFile(selectedRun, 'NCB')}
                className="px-3 py-2 bg-white hover:bg-gray-100 text-gray-700 text-sm border-r border-gray-300 flex items-center"
                title="NCB Bank File"
              >
                <Icons.Bank className="w-4 h-4 mr-2" />
                NCB
              </button>
              <button
                onClick={() => handleDownloadBankFile(selectedRun, 'BNS')}
                className="px-3 py-2 bg-white hover:bg-gray-100 text-gray-700 text-sm flex items-center"
                title="BNS Bank File"
              >
                <Icons.Bank className="w-4 h-4 mr-2" />
                BNS
              </button>
            </div>
            <button
              onClick={() => generateFullRegisterCSV([selectedRun])}
              className="px-4 py-2 bg-white border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-100 text-sm"
            >
              Download CSV
            </button>
            <button type="button" onClick={() => window.print()} className="px-4 py-2 bg-jam-black text-white rounded-lg hover:bg-gray-800 text-sm font-bold">
              Print Register
            </button>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {renderDetailModal()}

      <div className="flex flex-col md:flex-row justify-between items-start md:items-center">
        <div>
          <h2 className="text-3xl font-bold text-gray-900">Reports</h2>
          <p className="text-gray-500 mt-1">Analyze payroll costs and statutory liabilities.</p>
        </div>
        <div className="mt-4 md:mt-0 flex space-x-3">
          <button
            onClick={handleExportCSV}
            className="flex items-center px-4 py-2 bg-white border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 shadow-sm transition-all"
          >
            <Icons.Download className="w-4 h-4 mr-2" />
            Export CSV
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200">
        <nav className="-mb-px flex space-x-8">
          {['register', 'statutory', 'audit'].map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab as any)}
              className={`
                whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm capitalize transition-colors
                ${activeTab === tab
                  ? 'border-jam-orange text-jam-black'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'}
              `}
            >
              {tab === 'statutory' ? 'Tax Summary' : tab === 'register' ? 'Payroll Register' : 'Audit Trail'}
            </button>
          ))}
        </nav>
      </div>

      {activeTab === 'register' && (
        <div className="space-y-6 animate-fade-in">
          {/* Status Filter */}
          <div className="flex items-center space-x-2 bg-white p-4 rounded-xl shadow-sm border border-gray-200">
            <span className="text-sm font-medium text-gray-700">Filter by Status:</span>
            {['ALL', 'DRAFT', 'APPROVED', 'FINALIZED'].map((status) => (
              <button
                key={status}
                onClick={() => setStatusFilter(status as any)}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${statusFilter === status
                  ? 'bg-jam-orange text-jam-black'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
              >
                {status} {status !== 'ALL' && `(${payRunsByStatus[status as keyof typeof payRunsByStatus]?.length || 0})`}
              </button>
            ))}
          </div>

          {/* Pay Runs Table */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
            <table className="w-full text-left border-collapse">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase">Period Start</th>
                  <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase">Run Date</th>
                  <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase text-center">Employees</th>
                  <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase text-right">Total Gross</th>
                  <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase text-right">Total Net</th>
                  <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase text-center">Status</th>
                  <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase text-center">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filteredHistory.map((run) => {
                  const statusColors = {
                    DRAFT: 'bg-yellow-100 text-yellow-800',
                    APPROVED: 'bg-blue-100 text-blue-800',
                    FINALIZED: 'bg-green-100 text-green-800'
                  };

                  return (
                    <tr key={run.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-6 py-4 font-medium text-gray-900">{run.periodStart}</td>
                      <td className="px-6 py-4 text-gray-500">{run.payDate}</td>
                      <td className="px-6 py-4 text-center text-gray-500">{run.lineItems?.length || 0}</td>
                      <td className="px-6 py-4 text-right font-medium text-gray-900">${run.totalGross.toLocaleString()}</td>
                      <td className="px-6 py-4 text-right font-medium text-jam-black">${run.totalNet.toLocaleString()}</td>
                      <td className="px-6 py-4 text-center">
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${statusColors[run.status] || 'bg-gray-100 text-gray-800'}`}>
                          {run.status}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-center">
                        <div className="flex items-center justify-center space-x-2">
                          {/* DRAFT: Edit and Delete */}
                          {run.status === 'DRAFT' && (
                            <>
                              {onNavigate && (
                                <button
                                  onClick={() => onNavigate('payrun', { editRunId: run.id })}
                                  className="text-blue-600 hover:text-blue-800 text-sm font-medium px-2 py-1 rounded hover:bg-blue-50 transition-colors"
                                  title="Edit pay run"
                                >
                                  Edit
                                </button>
                              )}
                              {onDeletePayRun && (
                                <button
                                  onClick={() => handleDelete(run)}
                                  className="text-red-600 hover:text-red-800 text-sm font-medium px-2 py-1 rounded hover:bg-red-50 transition-colors"
                                  title="Delete pay run"
                                >
                                  Delete
                                </button>
                              )}
                              <button
                                onClick={() => setSelectedRun(run as PayRun)}
                                className="text-jam-orange hover:text-yellow-600 text-sm font-medium px-2 py-1 rounded hover:bg-orange-50 transition-colors"
                                title="View details"
                              >
                                View
                              </button>
                            </>
                          )}
                          {/* APPROVED: Edit only */}
                          {run.status === 'APPROVED' && (
                            <>
                              {onNavigate && (
                                <button
                                  onClick={() => onNavigate('payrun', { editRunId: run.id })}
                                  className="text-blue-600 hover:text-blue-800 text-sm font-medium px-2 py-1 rounded hover:bg-blue-50 transition-colors"
                                  title="Edit pay run"
                                >
                                  Edit
                                </button>
                              )}
                              <button
                                onClick={() => setSelectedRun(run as PayRun)}
                                className="text-jam-orange hover:text-yellow-600 text-sm font-medium px-2 py-1 rounded hover:bg-orange-50 transition-colors"
                                title="View details"
                              >
                                View
                              </button>
                            </>
                          )}
                          {/* FINALIZED: View only */}
                          {run.status === 'FINALIZED' && (
                            <div className="flex items-center space-x-2">
                              <button
                                onClick={() => handleDownloadGL(run)}
                                className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                                title="Sync to GL"
                              >
                                <Icons.Link className="w-4 h-4" />
                              </button>
                              <div className="flex border border-gray-200 rounded-lg overflow-hidden">
                                <button
                                  onClick={() => handleDownloadBankFile(run, 'NCB')}
                                  className="p-1 px-2 text-gray-600 hover:bg-gray-100 border-r border-gray-200"
                                  title="Download NCB Bank File"
                                >
                                  <Icons.Bank className="w-4 h-4" />
                                </button>
                                <button
                                  onClick={() => handleDownloadBankFile(run, 'BNS')}
                                  className="p-1 px-2 text-gray-600 hover:bg-gray-100"
                                  title="Download BNS Bank File"
                                >
                                  <Icons.Bank className="w-4 h-4" />
                                </button>
                              </div>
                              <button
                                onClick={() => setSelectedRun(run as PayRun)}
                                className="text-jam-orange hover:text-yellow-600 text-sm font-medium px-2 py-1 rounded hover:bg-orange-50 transition-colors border border-orange-100"
                                title="View details"
                              >
                                View Details
                              </button>
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {filteredHistory.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-6 py-12 text-center text-gray-500">
                      {statusFilter === 'ALL'
                        ? 'No payroll history found. Run a payroll to see data here.'
                        : `No ${statusFilter} pay runs found.`
                      }
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeTab === 'statutory' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 animate-fade-in">
          <div className="lg:col-span-2 bg-white p-6 rounded-xl shadow-sm border border-gray-200">
            <div className="flex justify-between items-center mb-4">
              <h3 className="font-bold text-gray-900">YTD Statutory Deductions Breakdown</h3>
              {displayHistory.length === 0 && <span className="text-xs text-red-500 bg-red-50 px-2 py-1 rounded">No data available</span>}
            </div>
            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={statData}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={80}
                    paddingAngle={5}
                    dataKey="value"
                  >
                    {statData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <RechartsTooltip formatter={(value: number) => `$${value.toLocaleString()}`} />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="bg-jam-black text-white p-6 rounded-xl shadow-lg flex flex-col justify-center">
            <div className="mb-6">
              <p className="text-gray-400 text-sm font-medium uppercase">Total Tax Liability</p>
              <h3 className="text-4xl font-bold text-white mt-2">${totalTaxLiability.toLocaleString()}</h3>
              <p className="text-xs text-jam-yellow mt-2">Accumulated YTD</p>
            </div>
            <div className="space-y-3">
              <div>
                <label className="block text-xs text-gray-300 mb-2 font-medium">Select Month for S01</label>
                <input
                  type="month"
                  value={selectedMonth}
                  onChange={(e) => setSelectedMonth(e.target.value)}
                  max={new Date().toISOString().slice(0, 7)}
                  className="w-full px-3 py-2 bg-gray-800 text-white border border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-jam-orange text-sm"
                />
              </div>
              <button
                onClick={handleExportS01}
                className="w-full py-3 bg-white text-jam-black font-bold rounded-lg hover:bg-gray-100 transition-colors flex items-center justify-center"
              >
                <Icons.Download className="w-4 h-4 mr-2" />
                Download S01
              </button>
              <button
                onClick={handleExportS02}
                className="w-full py-3 bg-gray-800 text-white font-medium rounded-lg hover:bg-gray-700 transition-colors flex items-center justify-center"
              >
                <Icons.Download className="w-4 h-4 mr-2" />
                Download S02 (Annual)
              </button>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'audit' && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden animate-fade-in">
          <div className="p-4 bg-gray-50 border-b border-gray-200 flex justify-between items-center">
            <div className="flex items-center space-x-2">
              <Icons.Shield className="w-5 h-5 text-jam-black" />
              <h3 className="font-bold text-gray-900">Security Audit Log</h3>
            </div>
            <select
              value={auditFilter}
              onChange={(e) => setAuditFilter(e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-jam-orange"
            >
              <option value="ALL">All Actions</option>
              <option value="LOGIN">Logins</option>
              <option value="CREATE">Create</option>
              <option value="UPDATE">Update</option>
              <option value="DELETE">Delete</option>
              <option value="APPROVE">Approve</option>
              <option value="EXPORT">Export</option>
            </select>
          </div>
          <div className="overflow-x-auto max-h-[600px]">
            <table className="w-full text-left border-collapse">
              <thead className="bg-white border-b border-gray-200 sticky top-0 z-10">
                <tr>
                  <th className="px-6 py-3 text-xs font-semibold text-gray-500 uppercase">Timestamp</th>
                  <th className="px-6 py-3 text-xs font-semibold text-gray-500 uppercase">Actor</th>
                  <th className="px-6 py-3 text-xs font-semibold text-gray-500 uppercase">Action</th>
                  <th className="px-6 py-3 text-xs font-semibold text-gray-500 uppercase">Entity</th>
                  <th className="px-6 py-3 text-xs font-semibold text-gray-500 uppercase">Details</th>
                  <th className="px-6 py-3 text-xs font-semibold text-gray-500 uppercase text-right">IP Addr</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filteredAuditLogs.map((log) => (
                  <tr key={log.id} className="hover:bg-gray-50">
                    <td className="px-6 py-3 text-gray-500 text-xs font-mono whitespace-nowrap">
                      {new Date(log.timestamp).toLocaleString()}
                    </td>
                    <td className="px-6 py-3 font-medium text-gray-900 text-sm">{log.actorName}</td>
                    <td className="px-6 py-3">
                      <span className={`inline-flex px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide
                                ${log.action === 'CREATE' ? 'bg-green-100 text-green-800' :
                          log.action === 'DELETE' ? 'bg-red-100 text-red-800' :
                            log.action === 'LOGIN' ? 'bg-blue-100 text-blue-800' : 'bg-gray-100 text-gray-800'}`}>
                        {log.action}
                      </span>
                    </td>
                    <td className="px-6 py-3 text-gray-700 text-sm">{log.entity}</td>
                    <td className="px-6 py-3 text-gray-600 text-sm max-w-xs truncate" title={log.description}>
                      {log.description}
                    </td>
                    <td className="px-6 py-3 text-right text-gray-400 text-xs font-mono">
                      {log.ipAddress}
                    </td>
                  </tr>
                ))}
                {filteredAuditLogs.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-6 py-12 text-center text-gray-500">
                      No audit logs found. Actions will appear here as you use the system.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
