import React, { useState } from 'react';
import { Icons } from '../components/Icons';
import { LeaveRequest, LeaveType, Employee } from '../types';
import { MultiDateCalendar } from '../components/MultiDateCalendar';
import { auditService } from '../services/auditService';
import { useAuth } from '../context/AuthContext';

interface LeaveProps {
    // currentUser removed
    requests: LeaveRequest[];
    employees: Employee[];
    onStatusChange: (id: string, status: 'APPROVED' | 'REJECTED', approvedDates?: string[]) => void;
    onAddRequest: (request: LeaveRequest) => void;
    onUpdateEmployee: (emp: Employee) => void;
}

export const Leave: React.FC<LeaveProps> = ({ requests, employees, onStatusChange, onAddRequest, onUpdateEmployee }) => {
  // FIX: Get user from Context
  const { user: currentUser } = useAuth();
  
  const [activeTab, setActiveTab] = useState<'requests' | 'balances'>('requests');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isBalanceModalOpen, setIsBalanceModalOpen] = useState(false);

  // Manual Request Modal State
  const [newReq, setNewReq] = useState<{
      employeeId: string;
      type: LeaveType;
      dates: string[];
      reason: string;
  }>({
      employeeId: '',
      type: LeaveType.VACATION,
      dates: [],
      reason: ''
  });

  // Balance Adjustment State
  const [balanceAdjustment, setBalanceAdjustment] = useState<{
      employeeId: string;
      name: string;
      vacation: string;
      sick: string;
      personal: string;
  } | null>(null);

  // Approval Review Modal State
  const [approvalModal, setApprovalModal] = useState<{
      isOpen: boolean;
      request: LeaveRequest | null;
      selectedDates: string[];
  }>({
      isOpen: false,
      request: null,
      selectedDates: []
  });

  const handleRequestSubmit = (e: React.FormEvent) => {
      e.preventDefault();
      const emp = employees.find(e => e.id === newReq.employeeId);
      if (!emp) return;

      if (newReq.dates.length === 0) {
          alert("Please select at least one date.");
          return;
      }

      const sortedDates = [...newReq.dates].sort();
      const startDate = sortedDates[0];
      const endDate = sortedDates[sortedDates.length - 1];
      const days = sortedDates.length;
      
      const request: LeaveRequest = {
          id: `LR-${Date.now()}`,
          employeeId: emp.id,
          employeeName: `${emp.firstName} ${emp.lastName}`,
          type: newReq.type,
          startDate: startDate,
          endDate: endDate,
          requestedDates: sortedDates,
          days: days,
          status: 'PENDING',
          reason: newReq.reason
      };

      onAddRequest(request);
      auditService.log(currentUser, 'CREATE', 'LeaveRequest', `Logged manual leave for ${emp.firstName} ${emp.lastName} (${days} days)`);
      setIsModalOpen(false);
      setNewReq({ employeeId: '', type: LeaveType.VACATION, dates: [], reason: '' });
  };

  const handleBalanceClick = (emp: Employee) => {
      setBalanceAdjustment({
          employeeId: emp.id,
          name: `${emp.firstName} ${emp.lastName}`,
          vacation: (emp.leaveBalance?.vacation || 0).toString(),
          sick: (emp.leaveBalance?.sick || 0).toString(),
          personal: (emp.leaveBalance?.personal || 0).toString()
      });
      setIsBalanceModalOpen(true);
  };

  const saveBalance = (e: React.FormEvent) => {
      e.preventDefault();
      if (!balanceAdjustment) return;
      
      const emp = employees.find(e => e.id === balanceAdjustment.employeeId);
      if (emp) {
          const updatedEmp: Employee = {
              ...emp,
              leaveBalance: {
                  vacation: parseFloat(balanceAdjustment.vacation) || 0,
                  sick: parseFloat(balanceAdjustment.sick) || 0,
                  personal: parseFloat(balanceAdjustment.personal) || 0
              }
          };
          onUpdateEmployee(updatedEmp);
          auditService.log(currentUser, 'UPDATE', 'Employee', `Adjusted leave balances for ${emp.firstName}`);
          setIsBalanceModalOpen(false);
          setBalanceAdjustment(null);
      }
  };

  // --- Review Approval Logic ---
  const openReviewModal = (req: LeaveRequest) => {
      // Fallback if requestedDates is missing
      let dates = req.requestedDates || [];
      if (dates.length === 0) {
          // If no specific dates stored (legacy), we can't really do partial approval easily.
          // For this demo, we'll just rely on onStatusChange('APPROVED') directly if dates missing.
          if (req.requestedDates && req.requestedDates.length > 0) {
              // proceed
          } else {
               onStatusChange(req.id, 'APPROVED');
               auditService.log(currentUser, 'APPROVE', 'LeaveRequest', `Approved leave for ${req.employeeName}`);
               return;
          }
      }

      setApprovalModal({
          isOpen: true,
          request: req,
          selectedDates: [...dates] // Default all selected
      });
  };

  const toggleApprovalDate = (date: string) => {
      setApprovalModal(prev => {
          const exists = prev.selectedDates.includes(date);
          if (exists) {
              return { ...prev, selectedDates: prev.selectedDates.filter(d => d !== date) };
          } else {
              return { ...prev, selectedDates: [...prev.selectedDates, date] };
          }
      });
  };

  const confirmApproval = () => {
      if (!approvalModal.request) return;
      
      if (approvalModal.selectedDates.length === 0) {
          alert("You must select at least one date to approve. Otherwise, please reject the request.");
          return;
      }

      onStatusChange(approvalModal.request.id, 'APPROVED', approvalModal.selectedDates);
      auditService.log(currentUser, 'APPROVE', 'LeaveRequest', `Approved ${approvalModal.selectedDates.length} days for ${approvalModal.request.employeeName}`);
      setApprovalModal({ isOpen: false, request: null, selectedDates: [] });
  };

  const handleReject = (req: LeaveRequest) => {
      onStatusChange(req.id, 'REJECTED');
      auditService.log(currentUser, 'REJECT', 'LeaveRequest', `Rejected leave request for ${req.employeeName}`);
      setApprovalModal({ isOpen: false, request: null, selectedDates: [] });
  }

  const onLeaveToday = requests.filter(r => {
      const today = new Date().toISOString().split('T')[0];
      return r.status === 'APPROVED' && r.startDate <= today && r.endDate >= today;
  }).length;

  const pendingCount = requests.filter(r => r.status === 'PENDING').length;
  const upcomingCount = requests.filter(r => {
      const today = new Date().toISOString().split('T')[0];
      return r.status === 'APPROVED' && r.startDate > today;
  }).length;

  return (
    <div className="space-y-6 animate-fade-in relative min-h-screen">
      
      {/* Approval Review Modal */}
      {approvalModal.isOpen && approvalModal.request && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
              <div className="bg-white rounded-xl shadow-2xl w-full max-w-md overflow-hidden animate-scale-in">
                   <div className="flex justify-between items-center p-6 border-b border-gray-100 bg-gray-50">
                      <div>
                          <h3 className="text-lg font-bold text-gray-900">Review Request</h3>
                          <p className="text-xs text-gray-500">{approvalModal.request.employeeName} • {approvalModal.request.type}</p>
                      </div>
                      <button onClick={() => setApprovalModal({...approvalModal, isOpen: false})} className="text-gray-400 hover:text-gray-600">
                          <Icons.Close className="w-6 h-6" />
                      </button>
                  </div>
                  <div className="p-6">
                      <p className="text-sm text-gray-600 mb-4">Select the days you wish to approve. Unselected days will be rejected.</p>
                      
                      <div className="max-h-60 overflow-y-auto border border-gray-200 rounded-lg divide-y divide-gray-100">
                          {approvalModal.request.requestedDates?.map(date => (
                              <label key={date} className="flex items-center p-3 hover:bg-gray-50 cursor-pointer">
                                  <input 
                                    type="checkbox"
                                    checked={approvalModal.selectedDates.includes(date)}
                                    onChange={() => toggleApprovalDate(date)}
                                    className="w-5 h-5 text-jam-orange rounded border-gray-300 focus:ring-jam-orange"
                                  />
                                  <span className="ml-3 text-gray-700 font-medium">
                                      {new Date(date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}
                                  </span>
                              </label>
                          ))}
                      </div>

                      <div className="mt-4 flex justify-between items-center">
                          <div className="text-sm">
                              <span className="font-bold">{approvalModal.selectedDates.length}</span> days selected
                          </div>
                          <div className="space-x-3">
                              <button 
                                onClick={() => handleReject(approvalModal.request!)}
                                className="px-4 py-2 text-red-600 font-medium hover:bg-red-50 rounded-lg"
                              >
                                  Reject All
                              </button>
                              <button 
                                onClick={confirmApproval}
                                className="px-4 py-2 bg-jam-black text-white font-medium rounded-lg hover:bg-gray-800"
                              >
                                  Approve Selected
                              </button>
                          </div>
                      </div>
                  </div>
              </div>
          </div>
      )}

      {/* Manual Leave Request Modal */}
      {isModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
              <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg overflow-hidden animate-scale-in overflow-y-auto max-h-[90vh]">
                  <div className="flex justify-between items-center p-6 border-b border-gray-100 bg-gray-50">
                      <h3 className="text-xl font-bold text-gray-900">Log Manual Leave</h3>
                      <button onClick={() => setIsModalOpen(false)} className="text-gray-400 hover:text-gray-600">
                          <Icons.Close className="w-6 h-6" />
                      </button>
                  </div>
                  <form onSubmit={handleRequestSubmit} className="p-6 space-y-4">
                      {/* Form fields unchanged ... */}
                      <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">Employee</label>
                          <select 
                             required
                             className="w-full border border-gray-300 rounded-lg p-2.5 focus:ring-2 focus:ring-jam-orange focus:border-jam-orange bg-white"
                             value={newReq.employeeId}
                             onChange={e => setNewReq({...newReq, employeeId: e.target.value})}
                          >
                              <option value="">Select Employee</option>
                              {employees.map(e => (
                                  <option key={e.id} value={e.id}>{e.firstName} {e.lastName}</option>
                              ))}
                          </select>
                      </div>
                      <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">Leave Type</label>
                          <select 
                             className="w-full border border-gray-300 rounded-lg p-2.5 focus:ring-2 focus:ring-jam-orange focus:border-jam-orange bg-white"
                             value={newReq.type}
                             onChange={e => setNewReq({...newReq, type: e.target.value as LeaveType})}
                          >
                              <option value={LeaveType.VACATION}>Vacation</option>
                              <option value={LeaveType.SICK}>Sick</option>
                              <option value={LeaveType.MATERNITY}>Maternity</option>
                              <option value={LeaveType.UNPAID}>Unpaid</option>
                          </select>
                      </div>
                      
                      <div>
                          <label className="block text-sm font-medium text-gray-700 mb-2">Select Dates</label>
                          <MultiDateCalendar 
                              selectedDates={newReq.dates}
                              onChange={(dates) => setNewReq({ ...newReq, dates })}
                          />
                      </div>

                      <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">Reason</label>
                          <textarea 
                            required
                            rows={2}
                            className="w-full border border-gray-300 rounded-lg p-2.5 focus:ring-2 focus:ring-jam-orange"
                            value={newReq.reason}
                            onChange={e => setNewReq({...newReq, reason: e.target.value})}
                            placeholder="e.g. Annual family trip"
                          />
                      </div>
                      <div className="pt-4">
                          <button type="submit" className="w-full bg-jam-black text-white font-semibold py-3 rounded-lg hover:bg-gray-800 transition-colors">
                              Submit Request ({newReq.dates.length} days)
                          </button>
                      </div>
                  </form>
              </div>
          </div>
      )}

      {/* Balance Adjustment Modal */}
      {isBalanceModalOpen && balanceAdjustment && (
           <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
              <div className="bg-white rounded-xl shadow-2xl w-full max-w-md overflow-hidden animate-scale-in">
                  <div className="flex justify-between items-center p-6 border-b border-gray-100 bg-gray-50">
                      <div>
                          <h3 className="text-lg font-bold text-gray-900">Adjust Balances</h3>
                          <p className="text-xs text-gray-500">{balanceAdjustment.name}</p>
                      </div>
                      <button onClick={() => setIsBalanceModalOpen(false)} className="text-gray-400 hover:text-gray-600">
                          <Icons.Close className="w-6 h-6" />
                      </button>
                  </div>
                  <form onSubmit={saveBalance} className="p-6 space-y-4">
                      <div>
                          <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Vacation Days</label>
                          <input 
                            type="number" 
                            step="0.5"
                            className="w-full border border-gray-300 rounded-lg p-2.5 focus:ring-2 focus:ring-jam-orange font-bold text-lg"
                            value={balanceAdjustment.vacation}
                            onChange={e => setBalanceAdjustment({...balanceAdjustment, vacation: e.target.value})}
                          />
                      </div>
                      <div>
                          <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Sick Days</label>
                          <input 
                            type="number" 
                            step="0.5"
                            className="w-full border border-gray-300 rounded-lg p-2.5 focus:ring-2 focus:ring-jam-orange font-bold text-lg"
                            value={balanceAdjustment.sick}
                            onChange={e => setBalanceAdjustment({...balanceAdjustment, sick: e.target.value})}
                          />
                      </div>
                      <div>
                          <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Personal Days</label>
                          <input 
                            type="number" 
                            step="0.5"
                            className="w-full border border-gray-300 rounded-lg p-2.5 focus:ring-2 focus:ring-jam-orange font-bold text-lg"
                            value={balanceAdjustment.personal}
                            onChange={e => setBalanceAdjustment({...balanceAdjustment, personal: e.target.value})}
                          />
                      </div>
                      <div className="pt-4">
                          <button type="submit" className="w-full bg-jam-black text-white font-semibold py-3 rounded-lg hover:bg-gray-800 transition-colors">
                              Save New Balances
                          </button>
                      </div>
                  </form>
              </div>
           </div>
      )}

      <div className="flex flex-col md:flex-row justify-between items-start md:items-center">
        <div>
          <h2 className="text-3xl font-bold text-gray-900">Leave Management</h2>
          <p className="text-gray-500 mt-1">Manage time-off requests and view employee balances.</p>
        </div>
        <button 
            onClick={() => setIsModalOpen(true)}
            className="mt-4 md:mt-0 bg-jam-black text-white px-4 py-2 rounded-lg hover:bg-gray-800 flex items-center shadow-lg"
        >
            <Icons.Plus className="w-4 h-4 mr-2" />
            Log Manual Leave
        </button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* ... (Stats cards remain unchanged) ... */}
        <div className="bg-white p-6 rounded-xl shadow-sm border-l-4 border-jam-orange">
            <div className="flex justify-between items-start">
                <div>
                    <p className="text-xs text-gray-500 uppercase font-bold">Pending Approval</p>
                    <p className="text-3xl font-bold text-gray-900 mt-2">{pendingCount}</p>
                </div>
                <div className="p-2 bg-orange-50 rounded-lg">
                    <Icons.Clock className="w-6 h-6 text-jam-orange" />
                </div>
            </div>
        </div>
        <div className="bg-white p-6 rounded-xl shadow-sm border-l-4 border-blue-500">
            <div className="flex justify-between items-start">
                <div>
                    <p className="text-xs text-gray-500 uppercase font-bold">On Leave Today</p>
                    <p className="text-3xl font-bold text-gray-900 mt-2">{onLeaveToday}</p>
                </div>
                <div className="p-2 bg-blue-50 rounded-lg">
                    <Icons.Plane className="w-6 h-6 text-blue-500" />
                </div>
            </div>
        </div>
        <div className="bg-white p-6 rounded-xl shadow-sm border-l-4 border-green-500">
            <div className="flex justify-between items-start">
                <div>
                    <p className="text-xs text-gray-500 uppercase font-bold">Upcoming Leave</p>
                    <p className="text-3xl font-bold text-gray-900 mt-2">{upcomingCount}</p>
                </div>
                <div className="p-2 bg-green-50 rounded-lg">
                    <Icons.CalendarDays className="w-6 h-6 text-green-500" />
                </div>
            </div>
             <p className="text-xs text-gray-400 mt-2">Next 30 days</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
         <div className="border-b border-gray-200 px-6">
            <nav className="-mb-px flex space-x-8">
                <button
                    onClick={() => setActiveTab('requests')}
                    className={`whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm transition-colors ${
                        activeTab === 'requests'
                        ? 'border-jam-orange text-jam-black'
                        : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                    }`}
                >
                    Leave Requests
                </button>
                <button
                    onClick={() => setActiveTab('balances')}
                    className={`whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm transition-colors ${
                        activeTab === 'balances'
                        ? 'border-jam-orange text-jam-black'
                        : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                    }`}
                >
                    Employee Balances
                </button>
            </nav>
         </div>

         {activeTab === 'requests' && (
            <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                    <thead className="bg-gray-50 border-b border-gray-200">
                        <tr>
                            <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase">Employee</th>
                            <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase">Type</th>
                            <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase">Dates</th>
                            <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase">Duration</th>
                            <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase">Reason</th>
                            <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase">Status</th>
                            <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase text-right">Actions</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                        {requests.length === 0 && (
                            <tr><td colSpan={7} className="p-6 text-center text-gray-500">No leave requests found.</td></tr>
                        )}
                        {requests.map((req) => (
                            <tr key={req.id} className="hover:bg-gray-50">
                                <td className="px-6 py-4 font-medium text-gray-900">{req.employeeName}</td>
                                <td className="px-6 py-4">
                                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium 
                                        ${req.type === LeaveType.SICK ? 'bg-red-100 text-red-800' : 
                                          req.type === LeaveType.VACATION ? 'bg-blue-100 text-blue-800' : 'bg-gray-100 text-gray-800'}`}>
                                        {req.type}
                                    </span>
                                </td>
                                <td className="px-6 py-4 text-sm text-gray-500">{req.startDate} to {req.endDate}</td>
                                <td className="px-6 py-4 text-sm text-gray-900 font-medium">{req.days} days</td>
                                <td className="px-6 py-4 text-sm text-gray-500 max-w-xs truncate">{req.reason}</td>
                                <td className="px-6 py-4">
                                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium 
                                        ${req.status === 'APPROVED' ? 'bg-green-100 text-green-800' : 
                                          req.status === 'REJECTED' ? 'bg-red-100 text-red-800' : 'bg-yellow-100 text-yellow-800'}`}>
                                        {req.status}
                                    </span>
                                </td>
                                <td className="px-6 py-4 text-right">
                                    {req.status === 'PENDING' ? (
                                        <div className="flex justify-end space-x-2">
                                            <button 
                                                onClick={() => openReviewModal(req)}
                                                className="p-1.5 bg-green-100 text-green-600 rounded-lg hover:bg-green-200" title="Review & Approve"
                                            >
                                                <Icons.CheckMark className="w-4 h-4" />
                                            </button>
                                            <button 
                                                onClick={() => handleReject(req)}
                                                className="p-1.5 bg-red-100 text-red-600 rounded-lg hover:bg-red-200" title="Reject"
                                            >
                                                <Icons.Close className="w-4 h-4" />
                                            </button>
                                        </div>
                                    ) : (
                                        <span className="text-xs text-gray-400">Completed</span>
                                    )}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
         )}

         {activeTab === 'balances' && (
             <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                    <thead className="bg-gray-50 border-b border-gray-200">
                         <tr>
                            <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase">Employee</th>
                            <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase text-center">Vacation Balance</th>
                            <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase text-center">Sick Balance</th>
                            <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase text-center">Personal Balance</th>
                            <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase text-right">Action</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                        {employees.map((emp) => (
                            <tr key={emp.id} className="hover:bg-gray-50">
                                <td className="px-6 py-4 font-medium text-gray-900">
                                    {emp.firstName} {emp.lastName}
                                    {emp.employeeId && (
                                        <span className="block text-xs text-gray-500">Employee ID: {emp.employeeId}</span>
                                    )}
                                </td>
                                <td className="px-6 py-4 text-center">
                                    <span className="font-bold text-gray-900">{emp.leaveBalance?.vacation || 0}</span> <span className="text-xs text-gray-400">days</span>
                                </td>
                                <td className="px-6 py-4 text-center">
                                    <span className="font-bold text-gray-900">{emp.leaveBalance?.sick || 0}</span> <span className="text-xs text-gray-400">days</span>
                                </td>
                                <td className="px-6 py-4 text-center">
                                    <span className="font-bold text-gray-900">{emp.leaveBalance?.personal || 0}</span> <span className="text-xs text-gray-400">days</span>
                                </td>
                                <td className="px-6 py-4 text-right">
                                    <button 
                                        onClick={() => handleBalanceClick(emp)}
                                        className="text-sm text-jam-orange hover:text-yellow-600 font-medium border border-transparent hover:border-jam-orange px-3 py-1 rounded"
                                    >
                                        Adjust
                                    </button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
             </div>
         )}
      </div>
    </div>
  );
};