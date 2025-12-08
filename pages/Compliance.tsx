import React, { useState, useMemo } from 'react';
import { Icons } from '../components/Icons';
import { PayRun, CompanySettings, Employee } from '../types';
import { generateS01CSV, generateS02CSV } from '../utils/exportHelpers';
import { toast } from 'sonner';

interface ComplianceProps {
    payRunHistory?: PayRun[];
    companyData?: CompanySettings;
    employees?: Employee[];
}

export const Compliance: React.FC<ComplianceProps> = ({ payRunHistory = [], companyData, employees = [] }) => {
  const [s01Period, setS01Period] = useState<string>('');
  const [s02Year, setS02Year] = useState<string>(new Date().getFullYear().toString());

  // 1. Calculate Available Periods from History
  const availablePeriods = useMemo(() => {
      const periods = payRunHistory.map(run => run.periodStart); // Expecting YYYY-MM
      return [...new Set(periods)].sort().reverse();
  }, [payRunHistory]);

  // Set default S01 period if available and not set
  useMemo(() => {
      if (!s01Period && availablePeriods.length > 0) {
          setS01Period(availablePeriods[0]);
      }
  }, [availablePeriods, s01Period]);

  // 2. Data Health Check Logic
  const healthCheck = useMemo(() => {
      const activeEmployees = employees.filter(e => e.status === 'ACTIVE');
      const missingTRN = activeEmployees.filter(e => !e.trn || e.trn.length < 9).length;
      const missingNIS = activeEmployees.filter(e => !e.nis).length;
      const missingBank = activeEmployees.filter(e => !e.bankDetails?.accountNumber).length;
      
      const score = 100 - ((missingTRN + missingNIS) * 10);
      return { score: Math.max(0, score), missingTRN, missingNIS, missingBank };
  }, [employees]);

  // 3. Deadline Logic
  const nextDeadline = useMemo(() => {
      const today = new Date();
      const currentYear = today.getFullYear();
      const currentMonth = today.getMonth(); // 0-11
      
      // S01 is due 14th of the following month
      // If today is before 14th, due date is 14th of this month. 
      // If after, it's 14th of next month (for the current month's payroll)
      let dueYear = currentYear;
      let dueMonth = currentMonth;
      
      if (today.getDate() > 14) {
          dueMonth++;
          if (dueMonth > 11) { dueMonth = 0; dueYear++; }
      }
      
      const dueDate = new Date(dueYear, dueMonth, 14);
      const diffTime = Math.abs(dueDate.getTime() - today.getTime());
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)); 
      
      return {
          date: dueDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
          daysLeft: diffDays,
          label: `S01 for ${new Date(today.getFullYear(), today.getMonth() - 1, 1).toLocaleString('default', { month: 'long' })}`
      };
  }, []);

  // 4. Calculate Liability Preview for Selected Month
  const s01Preview = useMemo(() => {
      if (!s01Period) return 0;
      const run = payRunHistory.find(r => r.periodStart === s01Period);
      if (!run) return 0;
      
      // Rough calc of total statutory liability (Employer + Employee)
      // This logic mirrors the S01 generator logic roughly for display
      const totalGross = run.totalGross;
      const empDed = run.totalGross - run.totalNet; // Rough approx
      const employerLiability = totalGross * (0.03 + 0.03 + 0.035 + 0.03); // NIS, NHT, Ed, HEART approx
      
      return empDed + employerLiability;
  }, [s01Period, payRunHistory]);


  const handleGenerateS01 = () => {
      if (!companyData) {
          toast.error("Company data missing");
          return;
      }
      const run = payRunHistory.find(r => r.periodStart === s01Period);
      if (!run) {
          toast.error("Please select a valid payroll period first.");
          return;
      }
      // Pass single run as array to helper
      generateS01CSV(companyData, [run]);
      toast.success(`S01 for ${s01Period} generated`);
  };

  const handleGenerateS02 = () => {
      if (!companyData) {
          toast.error("Company data missing");
          return;
      }
      generateS02CSV(companyData, payRunHistory, s02Year);
      toast.success(`S02 Annual Return for ${s02Year} generated`);
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex justify-between items-center">
        <div>
            <h2 className="text-3xl font-bold text-gray-900">Compliance Center</h2>
            <p className="text-gray-500 mt-1">Tax Administration Jamaica (TAJ) Reporting & Health</p>
        </div>
        <button className="text-sm text-jam-orange font-bold hover:underline flex items-center">
            <Icons.Link className="w-4 h-4 mr-1" />
            Visit TAJ Portal
        </button>
      </div>
      
      {/* Top Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white p-6 rounded-xl shadow-sm border-l-4 border-jam-orange">
            <div className="flex justify-between items-start">
                <div>
                    <h3 className="text-gray-500 text-xs font-bold uppercase tracking-wider">Next Deadline</h3>
                    <p className="text-2xl font-bold text-gray-900 mt-1">{nextDeadline.date}</p>
                    <p className="text-sm text-jam-orange font-medium mt-1">Due in {nextDeadline.daysLeft} days</p>
                </div>
                <div className="p-2 bg-orange-50 rounded-lg">
                    <Icons.Calendar className="w-6 h-6 text-jam-orange" />
                </div>
            </div>
            <p className="text-xs text-gray-400 mt-3 border-t border-gray-100 pt-2">
                Upcoming: {nextDeadline.label}
            </p>
        </div>

         <div className={`bg-white p-6 rounded-xl shadow-sm border-l-4 ${healthCheck.score === 100 ? 'border-green-500' : 'border-red-500'}`}>
            <div className="flex justify-between items-start">
                <div>
                    <h3 className="text-gray-500 text-xs font-bold uppercase tracking-wider">Data Health</h3>
                    <p className="text-2xl font-bold text-gray-900 mt-1">{healthCheck.score}%</p>
                    <p className={`text-sm font-medium mt-1 ${healthCheck.score === 100 ? 'text-green-600' : 'text-red-600'}`}>
                        {healthCheck.score === 100 ? 'Audit Ready' : 'Attention Needed'}
                    </p>
                </div>
                <div className={`p-2 rounded-lg ${healthCheck.score === 100 ? 'bg-green-50 text-green-600' : 'bg-red-50 text-red-600'}`}>
                    <Icons.ShieldCheck className="w-6 h-6" />
                </div>
            </div>
            <p className="text-xs text-gray-400 mt-3 border-t border-gray-100 pt-2">
                Based on employee statutory data
            </p>
        </div>

        <div className="bg-white p-6 rounded-xl shadow-sm border-l-4 border-blue-500">
            <div className="flex justify-between items-start">
                <div>
                    <h3 className="text-gray-500 text-xs font-bold uppercase tracking-wider">Est. Monthly Liability</h3>
                    <p className="text-2xl font-bold text-gray-900 mt-1">${s01Preview > 0 ? s01Preview.toLocaleString(undefined, { maximumFractionDigits: 0 }) : '0'}</p>
                    <p className="text-sm text-blue-600 font-medium mt-1">For {s01Period || 'Current Month'}</p>
                </div>
                <div className="p-2 bg-blue-50 rounded-lg">
                    <Icons.Landmark className="w-6 h-6 text-blue-600" />
                </div>
            </div>
            <p className="text-xs text-gray-400 mt-3 border-t border-gray-100 pt-2">
                Includes Employer & Employee portions
            </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          
          {/* Monthly S01 Card */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
              <div className="px-6 py-4 border-b border-gray-200 bg-gray-50 flex justify-between items-center">
                  <div className="flex items-center">
                      <div className="bg-jam-black text-white p-2 rounded mr-3">
                          <span className="font-bold text-xs">S01</span>
                      </div>
                      <h3 className="font-bold text-gray-900">Monthly Remittance</h3>
                  </div>
              </div>
              <div className="p-6">
                  <p className="text-sm text-gray-600 mb-6">
                      Generate the standard S01 form for monthly payroll remittance. Includes NIS, NHT, Ed Tax, and PAYE.
                  </p>
                  
                  <div className="space-y-4">
                      <div>
                          <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Select Pay Period</label>
                          <select 
                            value={s01Period} 
                            onChange={(e) => setS01Period(e.target.value)}
                            className="w-full border border-gray-300 rounded-lg p-3 text-sm focus:ring-2 focus:ring-jam-orange"
                          >
                              {availablePeriods.length === 0 && <option value="">No finalized payrolls found</option>}
                              {availablePeriods.map(p => (
                                  <option key={p} value={p}>{p}</option>
                              ))}
                          </select>
                      </div>

                      {s01Period && (
                          <div className="bg-blue-50 p-3 rounded-lg border border-blue-100 flex items-start text-xs text-blue-800">
                              <Icons.UserCheck className="w-4 h-4 mr-2 mt-0.5 flex-shrink-0" />
                              <span>
                                  Found finalized run for <strong>{s01Period}</strong>. 
                                  Ready to generate.
                              </span>
                          </div>
                      )}

                      <button 
                        onClick={handleGenerateS01}
                        disabled={!s01Period}
                        className="w-full bg-jam-black text-white py-3 rounded-lg font-bold hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
                      >
                          <Icons.Download className="w-4 h-4 mr-2" />
                          Download S01 CSV
                      </button>
                  </div>
              </div>
          </div>

          {/* Annual S02 Card */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
              <div className="px-6 py-4 border-b border-gray-200 bg-gray-50 flex justify-between items-center">
                  <div className="flex items-center">
                      <div className="bg-gray-700 text-white p-2 rounded mr-3">
                          <span className="font-bold text-xs">S02</span>
                      </div>
                      <h3 className="font-bold text-gray-900">Annual Return</h3>
                  </div>
              </div>
              <div className="p-6">
                  <p className="text-sm text-gray-600 mb-6">
                      Consolidated annual return of all emoluments and deductions. Due March 31st of the following year.
                  </p>
                  
                  <div className="space-y-4">
                      <div>
                          <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Tax Year</label>
                          <select 
                            value={s02Year} 
                            onChange={(e) => setS02Year(e.target.value)}
                            className="w-full border border-gray-300 rounded-lg p-3 text-sm focus:ring-2 focus:ring-jam-orange"
                          >
                              <option value="2025">2025</option>
                              <option value="2024">2024</option>
                              <option value="2023">2023</option>
                          </select>
                      </div>

                      <div className="bg-yellow-50 p-3 rounded-lg border border-yellow-100 flex items-start text-xs text-yellow-800">
                          <Icons.Alert className="w-4 h-4 mr-2 mt-0.5 flex-shrink-0" />
                          <span>
                              Ensure all monthly S01s for {s02Year} have been filed before generating the S02 to ensure totals match.
                          </span>
                      </div>

                      <button 
                        onClick={handleGenerateS02}
                        className="w-full bg-white border border-gray-300 text-gray-700 py-3 rounded-lg font-bold hover:bg-gray-50 flex items-center justify-center"
                      >
                          <Icons.Download className="w-4 h-4 mr-2" />
                          Download S02 CSV
                      </button>
                  </div>
              </div>
          </div>
      </div>

      {/* Data Health Audit */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-200">
              <h3 className="font-bold text-gray-900">Compliance Audit Checks</h3>
          </div>
          <div className="divide-y divide-gray-100">
              <div className="px-6 py-4 flex items-center justify-between">
                  <div className="flex items-center">
                      {healthCheck.missingTRN === 0 ? <Icons.CheckCircle className="w-5 h-5 text-green-500 mr-3" /> : <Icons.Alert className="w-5 h-5 text-red-500 mr-3" />}
                      <div>
                          <p className="text-sm font-medium text-gray-900">Tax Registration Numbers (TRN)</p>
                          <p className="text-xs text-gray-500">Required for all active employees</p>
                      </div>
                  </div>
                  <span className={`text-sm font-bold ${healthCheck.missingTRN === 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {healthCheck.missingTRN === 0 ? 'All Clear' : `${healthCheck.missingTRN} Missing`}
                  </span>
              </div>
              <div className="px-6 py-4 flex items-center justify-between">
                  <div className="flex items-center">
                      {healthCheck.missingNIS === 0 ? <Icons.CheckCircle className="w-5 h-5 text-green-500 mr-3" /> : <Icons.Alert className="w-5 h-5 text-red-500 mr-3" />}
                      <div>
                          <p className="text-sm font-medium text-gray-900">National Insurance (NIS)</p>
                          <p className="text-xs text-gray-500">Required for S01 filing</p>
                      </div>
                  </div>
                  <span className={`text-sm font-bold ${healthCheck.missingNIS === 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {healthCheck.missingNIS === 0 ? 'All Clear' : `${healthCheck.missingNIS} Missing`}
                  </span>
              </div>
              <div className="px-6 py-4 flex items-center justify-between">
                  <div className="flex items-center">
                      {healthCheck.missingBank === 0 ? <Icons.CheckCircle className="w-5 h-5 text-green-500 mr-3" /> : <Icons.Alert className="w-5 h-5 text-yellow-500 mr-3" />}
                      <div>
                          <p className="text-sm font-medium text-gray-900">Bank Account Details</p>
                          <p className="text-xs text-gray-500">Required for ACH generation</p>
                      </div>
                  </div>
                  <span className={`text-sm font-bold ${healthCheck.missingBank === 0 ? 'text-green-600' : 'text-yellow-600'}`}>
                      {healthCheck.missingBank === 0 ? 'All Clear' : `${healthCheck.missingBank} Missing`}
                  </span>
              </div>
          </div>
      </div>
    </div>
  );
};