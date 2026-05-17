import React, { useState } from 'react';
import { PlanTier, PLAN_THRESHOLDS } from '../types/billing';

interface SandboxEmployee {
  id: string;
  name: string;
  email: string;
  department: string;
  isArchived: boolean;
}

interface ArchiveSandboxProps {
  initialEmployees: SandboxEmployee[];
  targetDowngradeTier: PlanTier;
  onConfirmDowngrade: (archivedEmployeeIds: string[]) => Promise<void>;
  onCancel: () => void;
}

export const ArchiveSandbox: React.FC<ArchiveSandboxProps> = ({
  initialEmployees,
  targetDowngradeTier,
  onConfirmDowngrade,
  onCancel
}) => {
  const [employees, setEmployees] = useState<SandboxEmployee[]>(initialEmployees);
  const [isSaving, setIsSaving] = useState(false);

  const maxThreshold = PLAN_THRESHOLDS[targetDowngradeTier].maxEmployees;
  const activeCount = employees.filter(e => !e.isArchived).length;
  const isCompliant = activeCount <= maxThreshold;
  const requiredArchiveCount = Math.max(0, activeCount - maxThreshold);

  const handleToggleArchive = (employeeId: string) => {
    setEmployees(prev => prev.map(emp => 
      emp.id === employeeId ? { ...emp, isArchived: !emp.isArchived } : emp
    ));
  };

  const handleConfirm = async () => {
    if (!isCompliant) return;
    setIsSaving(true);
    try {
      const archivedIds = employees.filter(e => e.isArchived).map(e => e.id);
      await onConfirmDowngrade(archivedIds);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-gray-900 flex flex-col h-screen overflow-hidden text-gray-800 font-sans">
      
      {/* Sandbox Header: No other navbar, logo, or sidebar is rendered */}
      <header className="bg-gray-950 text-white p-6 border-b border-gray-800 flex justify-between items-center shrink-0">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2">
            <span className="bg-yellow-500 text-black text-xs font-extrabold px-2 py-1 rounded">Sandbox Mode</span>
            Archive Sandbox
          </h1>
          <p className="text-xs text-gray-400 mt-0.5">
            Resolve headcount conflicts to downgrade your subscription. All other application features are locked.
          </p>
        </div>
        <button
          onClick={onCancel}
          className="text-gray-400 hover:text-white text-xs font-semibold px-4 py-2 border border-gray-800 rounded-lg hover:bg-gray-900 transition-colors"
        >
          Back to Paywall
        </button>
      </header>

      {/* Counter Dashboard Panel */}
      <section className="bg-gray-950 text-white px-6 py-4 border-b border-gray-800 shrink-0">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center gap-6">
            <div>
              <span className="text-xs text-gray-400 uppercase tracking-wider font-semibold block">Target Limit</span>
              <span className="text-lg font-bold text-yellow-500">{maxThreshold} Employees</span>
            </div>
            <div className="h-8 w-px bg-gray-800"></div>
            <div>
              <span className="text-xs text-gray-400 uppercase tracking-wider font-semibold block">Active Count</span>
              <span className={`text-lg font-extrabold ${isCompliant ? 'text-green-500' : 'text-red-500'}`}>
                {activeCount} / {maxThreshold}
              </span>
            </div>
          </div>
          
          <div className="w-full sm:w-auto">
            {isCompliant ? (
              <div className="bg-green-950/40 border border-green-800/80 rounded-lg px-4 py-2.5 flex items-center gap-2">
                <svg className="w-5 h-5 text-green-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                <p className="text-xs text-green-400 font-medium">Headcount is compliant. You can now save and downgrade.</p>
              </div>
            ) : (
              <div className="bg-red-950/40 border border-red-800/80 rounded-lg px-4 py-2.5 flex items-center gap-2">
                <svg className="w-5 h-5 text-red-500 shrink-0 animate-pulse" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
                <p className="text-xs text-red-400 font-medium">
                  Please toggle archive on at least <strong className="font-extrabold">{requiredArchiveCount}</strong> employee(s) to continue.
                </p>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Main Employee Table list */}
      <main className="flex-1 overflow-y-auto bg-gray-50 p-6 flex justify-center">
        <div className="w-full max-w-4xl bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden flex flex-col max-h-full">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-gray-100 text-gray-500 text-xs font-bold uppercase tracking-wider border-b border-gray-200">
                  <th className="px-6 py-4">Employee</th>
                  <th className="px-6 py-4">Department</th>
                  <th className="px-6 py-4 text-center">Status</th>
                  <th className="px-6 py-4 text-right">Archive Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {employees.map(emp => (
                  <tr
                    key={emp.id}
                    className={`transition-colors ${emp.isArchived ? 'bg-red-50/20 text-gray-400' : 'bg-white hover:bg-gray-50'}`}
                  >
                    <td className="px-6 py-4">
                      <div className="font-bold text-sm text-gray-900">{emp.name}</div>
                      <div className="text-xs text-gray-500">{emp.email}</div>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600">{emp.department}</td>
                    <td className="px-6 py-4 text-center">
                      <span className={`inline-block px-2.5 py-1 rounded-full text-xs font-semibold ${
                        emp.isArchived ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'
                      }`}>
                        {emp.isArchived ? 'Archived' : 'Active'}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <button
                        onClick={() => handleToggleArchive(emp.id)}
                        className={`text-xs font-bold px-3 py-1.5 rounded-lg border transition-all ${
                          emp.isArchived
                            ? 'bg-green-50 text-green-700 border-green-200 hover:bg-green-100'
                            : 'bg-red-50 text-red-700 border-red-200 hover:bg-red-100'
                        }`}
                      >
                        {emp.isArchived ? 'Activate' : 'Archive'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </main>

      {/* Confirmation Footer Panel */}
      <footer className="bg-white p-6 border-t border-gray-200 flex justify-end gap-4 shrink-0">
        <button
          onClick={onCancel}
          disabled={isSaving}
          className="px-6 py-2.5 border border-gray-300 text-gray-600 text-sm font-semibold rounded-xl hover:bg-gray-50 transition-colors disabled:opacity-50"
        >
          Cancel
        </button>
        <button
          onClick={handleConfirm}
          disabled={!isCompliant || isSaving}
          className="px-6 py-2.5 bg-gray-950 text-white font-bold text-sm rounded-xl transition-colors hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center min-w-[160px]"
        >
          {isSaving ? 'Saving Changes...' : 'Save & Downgrade'}
        </button>
      </footer>
    </div>
  );
};
