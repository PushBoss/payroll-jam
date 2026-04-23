
import React, { useState, useMemo } from 'react';
import { Icons } from '../components/Icons';
import { User, PayRunLineItem, LeaveType, WeeklyTimesheet, TimeEntry, LeaveRequest, Employee, PayRun, CompanySettings } from '../core/types';
import { PayslipView } from '../components/PayslipView';
import { MultiDateCalendar } from '../components/MultiDateCalendar';
import { generateP24CSV } from '../utils/exportHelpers';
import { EmployeeService } from '../services/EmployeeService';

interface PortalProps {
    user: User;
    employee?: Employee;
    view?: 'home' | 'documents' | 'profile' | 'leave' | 'timesheets';
    leaveRequests: LeaveRequest[];
    onRequestLeave: (req: LeaveRequest) => void;
    payRunHistory?: PayRun[];
    companyData?: CompanySettings;
    onUpdateEmployee?: (emp: Employee) => void;
}

export const EmployeePortal: React.FC<PortalProps> = ({ user, employee, view = 'home', leaveRequests, onRequestLeave, payRunHistory = [], companyData, onUpdateEmployee }) => {
    // Check if company plan allows Employee Portal access
    const hasPortalAccess = companyData && 
        (companyData.plan === 'Starter' || 
         companyData.plan === 'Pro' || 
         companyData.plan === 'Professional');
    
    const [selectedPayslip, setSelectedPayslip] = useState<{data: PayRunLineItem, period: string, date: string} | null>(null);
    const [jobLetterRequest, setJobLetterRequest] = useState(false);
    const [uploadingDocument, setUploadingDocument] = useState(false);
    const [uploadedFiles, setUploadedFiles] = useState<File[]>([]);
    
    // Leave State
    const [leaveType, setLeaveType] = useState<LeaveType>(LeaveType.VACATION);
    const [leaveReason, setLeaveReason] = useState('');
    const [selectedDates, setSelectedDates] = useState<string[]>([]);
    const [leaveSubmitted, setLeaveSubmitted] = useState(false);

    // Timesheet State
    const [currentWeek, setCurrentWeek] = useState<WeeklyTimesheet>({
        id: 'TS-NEW',
        employeeId: user.id,
        employeeName: user.name,
        weekStartDate: '2025-01-27',
        weekEndDate: '2025-02-02',
        status: 'DRAFT',
        totalRegularHours: 0,
        totalOvertimeHours: 0,
        entries: [
            { id: '1', date: '2025-01-27', startTime: '09:00', endTime: '17:00', breakDuration: 60, totalHours: 7, isOvertime: false },
            { id: '2', date: '2025-01-28', startTime: '09:00', endTime: '17:00', breakDuration: 60, totalHours: 7, isOvertime: false },
            { id: '3', date: '2025-01-29', startTime: '09:00', endTime: '17:00', breakDuration: 60, totalHours: 7, isOvertime: false },
            { id: '4', date: '2025-01-30', startTime: '09:00', endTime: '17:00', breakDuration: 60, totalHours: 7, isOvertime: false },
            { id: '5', date: '2025-01-31', startTime: '', endTime: '', breakDuration: 0, totalHours: 0, isOvertime: false },
        ]
    });

    // Filter leave requests for this user
    const myRequests = leaveRequests.filter(r => {
        if (employee) {
             return r.employeeId === employee.id;
        }
        // Fallback if employee object isn't fully linked, use name match
        return r.employeeName === user.name;
    }).sort((a, b) => new Date(b.startDate).getTime() - new Date(a.startDate).getTime());

    // Derive real payslips from history
    const myPayslips = useMemo(() => {
        const slips: { date: string, period: string, data: PayRunLineItem }[] = [];
        payRunHistory.forEach(run => {
            const line = run.lineItems.find(li => 
                (employee && li.employeeId === employee.id) || 
                li.employeeName === user.name ||
                (employee && li.employeeName === `${employee.firstName} ${employee.lastName}`)
            );

            if (line) {
                slips.push({
                    date: run.payDate,
                    period: run.periodStart,
                    data: line
                });
            }
        });
        return slips.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    }, [payRunHistory, employee, user.name]);

    // Aggregate YTD
    const ytdEarnings = useMemo(() => {
        return myPayslips.reduce((acc, slip) => acc + slip.data.netPay, 0);
    }, [myPayslips]);

    const handleLeaveSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        
        if (selectedDates.length === 0) {
            alert("Please select at least one date from the calendar.");
            return;
        }

        // Sort selected dates
        const sortedDates = [...selectedDates].sort();
        const startDate = sortedDates[0];
        const endDate = sortedDates[sortedDates.length - 1];
        const days = sortedDates.length;

        const req: LeaveRequest = {
            id: `LR-${Date.now()}`,
            employeeId: employee?.id || 'EMP-001', // Fallback for demo
            employeeName: employee ? `${employee.firstName} ${employee.lastName}` : user.name,
            type: leaveType,
            startDate: startDate,
            endDate: endDate,
            requestedDates: sortedDates,
            days: days,
            status: 'PENDING',
            reason: leaveReason
        };

        onRequestLeave(req);
        setLeaveSubmitted(true);
        setTimeout(() => setLeaveSubmitted(false), 3000); 
        setLeaveReason('');
        setSelectedDates([]);
    };

    const handleTimeChange = (id: string, field: keyof TimeEntry, value: string) => {
        const newEntries = currentWeek.entries.map(e => {
            if (e.id === id) {
                const updated = { ...e, [field]: value };
                // Recalculate hours (simple logic for demo)
                if (updated.startTime && updated.endTime) {
                    const start = parseInt(updated.startTime.split(':')[0]);
                    const end = parseInt(updated.endTime.split(':')[0]);
                    let total = end - start - (updated.breakDuration / 60);
                    updated.totalHours = total > 0 ? total : 0;
                }
                return updated;
            }
            return e;
        });
        
        const totalHours = newEntries.reduce((acc, curr) => acc + curr.totalHours, 0);
        
        setCurrentWeek({
            ...currentWeek,
            entries: newEntries,
            totalRegularHours: totalHours
        });
    };

    const submitTimesheet = () => {
        setCurrentWeek({...currentWeek, status: 'SUBMITTED'});
    };

    const handleDownloadP24 = () => {
        if (companyData) {
            generateP24CSV(companyData, payRunHistory, employee, user);
        } else {
            alert("Company data is unavailable for P24 generation.");
        }
    };

    const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = e.target.files;
        if (files && files.length > 0) {
            setUploadedFiles(Array.from(files));
        }
    };

    const handleSubmitDocuments = async () => {
        if (uploadedFiles.length === 0) {
            alert('Please select at least one document to upload');
            return;
        }
        
        if (!employee?.id) {
            alert('Employee information not found');
            return;
        }
        
        setUploadingDocument(true);
        
        try {
            // Import services dynamically
            const { storageService } = await import('../services/storageService');
            
            // Upload each file to the 'documents' bucket
            const uploadPromises = uploadedFiles.map(async (file) => {
                const fileName = `${employee.id}_${Date.now()}_${file.name}`;
                const filePath = `employee-verification/${employee.id}/${fileName}`;
                
                const publicUrl = await storageService.uploadFile('documents', filePath, file);
                return { 
                    success: publicUrl !== null, 
                    url: publicUrl,
                    fileName: file.name
                };
            });
            
            const results = await Promise.all(uploadPromises);
            
            // Check if all uploads succeeded
            const allSuccess = results.every(r => r.success);
            
            if (allSuccess) {
                // Update employee record with document info
                const verificationDocuments = results.map(r => ({
                    fileName: r.fileName,
                    fileUrl: r.url || '',
                    uploadedAt: new Date().toISOString()
                }));
                
                const updatedEmployee: Employee = {
                    ...employee,
                    verificationDocuments: [
                        ...(employee.verificationDocuments || []),
                        ...verificationDocuments
                    ]
                };
                
                // Update in database if onUpdateEmployee is provided
                if (onUpdateEmployee && user?.companyId) {
                    onUpdateEmployee(updatedEmployee);
                    // Also save to Supabase
                    await EmployeeService.saveEmployee(updatedEmployee, user.companyId);
                }
                
                setUploadingDocument(false);
                setUploadedFiles([]);
                alert('Documents uploaded successfully! Your employer will review them shortly.');
            } else {
                throw new Error('Some files failed to upload');
            }
        } catch (error) {
            console.error('Error uploading documents:', error);
            setUploadingDocument(false);
            alert('Failed to upload documents. Please try again or contact your employer.');
        }
    };

    const isPendingVerification = employee?.status === 'PENDING_VERIFICATION';

    // Check access - show upgrade message if on Free plan
    if (!hasPortalAccess) {
        return (
            <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
                <div className="bg-white rounded-xl shadow-lg p-8 max-w-md w-full text-center">
                    <div className="w-16 h-16 bg-jam-orange rounded-full flex items-center justify-center mx-auto mb-4">
                        <Icons.Shield className="w-8 h-8 text-white" />
                    </div>
                    <h2 className="text-2xl font-bold text-gray-900 mb-2">Employee Portal Access Required</h2>
                    <p className="text-gray-600 mb-6">
                        The Employee Portal is available on Starter and Pro plans. Please ask your administrator to upgrade.
                    </p>
                    <div className="bg-gray-50 rounded-lg p-4 text-left mb-6">
                        <p className="text-sm text-gray-700 mb-2"><strong>Current Plan:</strong> {companyData?.plan || 'Free'}</p>
                        <p className="text-sm text-gray-700"><strong>Required:</strong> Starter or Pro</p>
                    </div>
                    <p className="text-xs text-gray-500">
                        Contact your company administrator to upgrade your plan and unlock this feature.
                    </p>
                </div>
            </div>
        );
    }

    if (selectedPayslip) {
        return (
            <PayslipView 
                data={selectedPayslip.data}
                companyName="JamCorp Ltd."
                payPeriod={selectedPayslip.period}
                payDate={selectedPayslip.date}
                onClose={() => setSelectedPayslip(null)}
            />
        );
    }

    if (view === 'timesheets') {
        return (
            <div className="space-y-6 animate-fade-in">
                <div className="flex justify-between items-center">
                    <div>
                        <h2 className="text-3xl font-bold text-gray-900">My Hours</h2>
                        <p className="text-gray-500 mt-1">Week of {currentWeek.weekStartDate}</p>
                    </div>
                    <div className="flex items-center space-x-3">
                         <div className="bg-white px-4 py-2 rounded-lg border border-gray-200 shadow-sm">
                            <p className="text-xs text-gray-500 uppercase font-bold">Total Hours</p>
                            <p className="text-xl font-bold text-jam-black">{currentWeek.totalRegularHours.toFixed(1)}</p>
                         </div>
                    </div>
                </div>

                <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                     {/* Header */}
                    <div className="px-6 py-4 border-b border-gray-200 bg-gray-50 flex justify-between items-center">
                        <div className="flex items-center space-x-2">
                             <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium 
                                ${currentWeek.status === 'SUBMITTED' ? 'bg-yellow-100 text-yellow-800' : 
                                  currentWeek.status === 'APPROVED' ? 'bg-green-100 text-green-800' : 'bg-gray-200 text-gray-800'}`}>
                                {currentWeek.status}
                            </span>
                            {currentWeek.status === 'DRAFT' && <span className="text-xs text-gray-500"> - Editable</span>}
                        </div>
                        
                        {currentWeek.status === 'DRAFT' && (
                            <button 
                                onClick={submitTimesheet}
                                className="bg-jam-black text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-800 flex items-center"
                            >
                                <Icons.Check className="w-4 h-4 mr-2" />
                                Submit for Approval
                            </button>
                        )}
                    </div>

                    {/* Grid */}
                    <div className="divide-y divide-gray-100">
                        {currentWeek.entries.map((entry) => {
                            const dateObj = new Date(entry.date);
                            const dayName = dateObj.toLocaleDateString('en-US', { weekday: 'long' });
                            const isEditable = currentWeek.status === 'DRAFT';

                            return (
                                <div key={entry.id} className="p-6 grid grid-cols-1 md:grid-cols-12 gap-4 items-center hover:bg-gray-50 transition-colors">
                                    <div className="md:col-span-3">
                                        <p className="font-bold text-gray-900">{dayName}</p>
                                        <p className="text-sm text-gray-500">{entry.date}</p>
                                    </div>
                                    
                                    <div className="md:col-span-3">
                                        <label className="block text-xs text-gray-500 uppercase mb-1">Start Time</label>
                                        <input 
                                            type="time" 
                                            disabled={!isEditable}
                                            value={entry.startTime}
                                            onChange={(e) => handleTimeChange(entry.id, 'startTime', e.target.value)}
                                            className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm focus:ring-jam-orange focus:border-jam-orange disabled:bg-gray-100 disabled:text-gray-500"
                                        />
                                    </div>

                                    <div className="md:col-span-3">
                                        <label className="block text-xs text-gray-500 uppercase mb-1">End Time</label>
                                        <input 
                                            type="time" 
                                            disabled={!isEditable}
                                            value={entry.endTime}
                                            onChange={(e) => handleTimeChange(entry.id, 'endTime', e.target.value)}
                                            className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm focus:ring-jam-orange focus:border-jam-orange disabled:bg-gray-100 disabled:text-gray-500"
                                        />
                                    </div>

                                    <div className="md:col-span-2">
                                        <label className="block text-xs text-gray-500 uppercase mb-1">Break (Min)</label>
                                         <input 
                                            type="number"
                                            disabled={!isEditable}
                                            value={entry.breakDuration}
                                            onChange={(e) => handleTimeChange(entry.id, 'breakDuration', e.target.value)}
                                            className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm focus:ring-jam-orange focus:border-jam-orange disabled:bg-gray-100 disabled:text-gray-500"
                                        />
                                    </div>

                                    <div className="md:col-span-1 text-right">
                                         <label className="block text-xs text-gray-500 uppercase mb-1">Total</label>
                                         <span className="font-bold text-gray-900">{entry.totalHours.toFixed(1)}h</span>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                    
                    {/* Footer */}
                    <div className="bg-gray-50 px-6 py-4 border-t border-gray-200">
                        <div className="flex justify-end items-center space-x-8">
                            <div className="text-right">
                                <p className="text-xs text-gray-500 uppercase font-bold">Regular Hours</p>
                                <p className="text-lg font-bold text-gray-900">{currentWeek.totalRegularHours.toFixed(1)}</p>
                            </div>
                             <div className="text-right">
                                <p className="text-xs text-gray-500 uppercase font-bold">Overtime</p>
                                <p className="text-lg font-bold text-jam-orange">{currentWeek.totalOvertimeHours.toFixed(1)}</p>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    if (view === 'leave') {
        // Balances - Use employee data if available, otherwise dummy
        const balVacation = employee?.leaveBalance?.vacation ?? 14;
        const balSick = employee?.leaveBalance?.sick ?? 5;

        return (
            <div className="space-y-6 animate-fade-in">
                {/* Verification Banner for Leave Page */}
                {isPendingVerification && (
                    <div className="bg-yellow-50 border-l-4 border-yellow-400 p-4 rounded-r-lg shadow-sm">
                        <div className="flex">
                            <div className="flex-shrink-0">
                                <svg className="h-5 w-5 text-yellow-400" viewBox="0 0 20 20" fill="currentColor">
                                    <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                                </svg>
                            </div>
                            <div className="ml-3">
                                <p className="text-sm font-medium text-yellow-800">Document Verification Required</p>
                                <p className="text-sm text-yellow-700 mt-1">
                                    Leave requests are disabled until your employer verifies your documents. Please upload your verification documents from your dashboard.
                                </p>
                            </div>
                        </div>
                    </div>
                )}
                
                <h2 className="text-3xl font-bold text-gray-900">Time Off Center</h2>
                
                {/* Balances */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div className="bg-jam-black text-white p-6 rounded-xl shadow-lg relative overflow-hidden">
                        <div className="relative z-10">
                            <p className="text-xs font-bold text-jam-yellow uppercase tracking-wider">Vacation Balance</p>
                            <p className="text-4xl font-bold mt-2">{balVacation} <span className="text-lg text-gray-400 font-normal">days</span></p>
                            <p className="text-xs text-gray-400 mt-2">Accrues 1.25 days/mo</p>
                        </div>
                        <Icons.Plane className="absolute right-4 bottom-4 w-16 h-16 text-gray-800 opacity-50" />
                    </div>
                    <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
                         <p className="text-xs font-bold text-gray-500 uppercase tracking-wider">Sick Leave</p>
                         <p className="text-4xl font-bold mt-2 text-gray-900">{balSick} <span className="text-lg text-gray-400 font-normal">days</span></p>
                         <p className="text-xs text-gray-500 mt-2">Resets Jan 1st</p>
                    </div>
                    <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
                         <p className="text-xs font-bold text-gray-500 uppercase tracking-wider">Pending Requests</p>
                         <p className="text-4xl font-bold mt-2 text-jam-orange">{myRequests.filter(r => r.status === 'PENDING').length}</p>
                         <p className="text-xs text-gray-500 mt-2">Awaiting approval</p>
                    </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                    {/* Request Form */}
                    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                        <h3 className="text-lg font-bold text-gray-900 mb-4">Request Time Off</h3>
                        {isPendingVerification ? (
                            <div className="bg-gray-50 border border-gray-200 rounded-lg p-8 text-center">
                                <div className="w-16 h-16 bg-yellow-100 rounded-full flex items-center justify-center mx-auto mb-4">
                                    <svg className="w-8 h-8 text-yellow-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                                    </svg>
                                </div>
                                <h4 className="text-gray-900 font-bold text-lg mb-2">Verification Required</h4>
                                <p className="text-gray-600 text-sm">Upload your documents from the dashboard to request leave.</p>
                            </div>
                        ) : leaveSubmitted ? (
                             <div className="bg-green-50 border border-green-200 rounded-lg p-8 text-center animate-fade-in">
                                <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-3">
                                    <Icons.CheckMark className="w-6 h-6 text-green-600" />
                                </div>
                                <h4 className="text-green-800 font-bold text-lg">Request Sent!</h4>
                                <p className="text-green-600 text-sm mt-1">Your manager has been notified.</p>
                            </div>
                        ) : (
                            <form onSubmit={handleLeaveSubmit} className="space-y-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Leave Type</label>
                                    <select 
                                        value={leaveType}
                                        onChange={(e) => setLeaveType(e.target.value as LeaveType)}
                                        className="w-full border border-gray-300 rounded-lg p-2.5 focus:ring-2 focus:ring-jam-orange focus:border-jam-orange"
                                    >
                                        <option value={LeaveType.VACATION}>Vacation</option>
                                        <option value={LeaveType.SICK}>Sick Leave</option>
                                        <option value={LeaveType.MATERNITY}>Maternity/Paternity</option>
                                        <option value={LeaveType.UNPAID}>Unpaid Leave</option>
                                    </select>
                                </div>
                                
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-2">Select Dates</label>
                                    <MultiDateCalendar 
                                        selectedDates={selectedDates}
                                        onChange={setSelectedDates}
                                    />
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Reason</label>
                                    <textarea 
                                        required
                                        value={leaveReason}
                                        onChange={(e) => setLeaveReason(e.target.value)}
                                        className="w-full border border-gray-300 rounded-lg p-2.5 focus:ring-2 focus:ring-jam-orange" 
                                        rows={3}
                                        placeholder="Family vacation..."
                                    ></textarea>
                                </div>
                                <button type="submit" className="w-full bg-jam-black text-white font-semibold py-3 rounded-lg hover:bg-gray-800 transition-colors">
                                    Submit Request ({selectedDates.length} days)
                                </button>
                            </form>
                        )}
                    </div>

                    {/* History List */}
                    <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden flex flex-col h-full">
                        <div className="px-6 py-4 border-b border-gray-200 bg-gray-50">
                            <h3 className="font-bold text-gray-900">Recent History</h3>
                        </div>
                        <div className="flex-1 divide-y divide-gray-100 overflow-y-auto max-h-96">
                            {myRequests.length === 0 && (
                                <div className="p-8 text-center text-gray-400 text-sm flex flex-col items-center justify-center h-full">
                                    <Icons.Calendar className="w-8 h-8 mb-2 opacity-20" />
                                    No leave history found.
                                </div>
                            )}
                            {myRequests.map((item, i) => (
                                <div key={i} className="px-6 py-4 flex items-center justify-between hover:bg-gray-50 transition-colors">
                                    <div>
                                        <div className="flex items-center">
                                            <span className={`w-2 h-2 rounded-full mr-2 ${item.type === 'SICK' ? 'bg-red-500' : 'bg-blue-500'}`}></span>
                                            <p className="text-sm font-medium text-gray-900">{item.type} Leave</p>
                                        </div>
                                        <p className="text-xs text-gray-500 ml-4 mt-0.5">{item.startDate} - {item.endDate}</p>
                                    </div>
                                    <div className="text-right">
                                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium 
                                            ${item.status === 'APPROVED' ? 'bg-green-100 text-green-800' : 
                                              item.status === 'REJECTED' ? 'bg-red-100 text-red-800' : 'bg-yellow-100 text-yellow-800'}`}>
                                            {item.status}
                                        </span>
                                        <p className="text-xs text-gray-500 mt-1">{item.days} days</p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    if (view === 'documents') {
        return (
            <div className="space-y-6 animate-fade-in">
                <div className="flex justify-between items-center">
                    <h2 className="text-3xl font-bold text-gray-900">My Documents</h2>
                </div>

                {/* Quick Generation */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
                        <div className="h-12 w-12 bg-purple-100 rounded-lg flex items-center justify-center text-purple-600 mb-4">
                            <Icons.Document className="w-6 h-6" />
                        </div>
                        <h3 className="font-bold text-gray-900 mb-2">Job Letter</h3>
                        <p className="text-sm text-gray-500 mb-6">
                            Generate an official proof of employment letter addressed to "To Whom It May Concern". 
                            Includes salary and tenure.
                        </p>
                        {jobLetterRequest ? (
                            <div className="bg-green-50 border border-green-200 rounded-lg p-4 text-center animate-fade-in">
                                <Icons.Check className="w-6 h-6 text-green-600 mx-auto mb-2" />
                                <p className="text-sm font-bold text-green-800">Letter Generated!</p>
                                <p className="text-xs text-green-600 mt-1">Sent to {user.email}</p>
                                <button onClick={() => setJobLetterRequest(false)} className="mt-3 text-xs underline text-green-800">Reset</button>
                            </div>
                        ) : (
                            <button 
                                onClick={() => setJobLetterRequest(true)}
                                className="w-full py-2 bg-jam-black text-white rounded-lg text-sm font-medium hover:bg-gray-800 transition-colors"
                            >
                                Generate Instant Letter
                            </button>
                        )}
                    </div>

                    <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
                        <div className="h-12 w-12 bg-blue-100 rounded-lg flex items-center justify-center text-blue-600 mb-4">
                            <Icons.File className="w-6 h-6" />
                        </div>
                        <h3 className="font-bold text-gray-900 mb-2">Employment Contract</h3>
                        <p className="text-sm text-gray-500 mb-6">
                            View and download your signed employment agreement.
                        </p>
                        <button className="w-full py-2 border border-gray-300 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors flex items-center justify-center">
                            <Icons.DownloadCloud className="w-4 h-4 mr-2" />
                            Download PDF
                        </button>
                    </div>
                </div>

                {/* Tax Forms */}
                <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                    <div className="px-6 py-4 border-b border-gray-200 bg-gray-50">
                        <h3 className="font-bold text-gray-900">Tax Documents</h3>
                    </div>
                    <div className="divide-y divide-gray-100">
                         <div className="px-6 py-4 flex items-center justify-between">
                            <div className="flex items-center">
                                <Icons.Compliance className="w-5 h-5 text-gray-400 mr-3" />
                                <div>
                                    <p className="text-sm font-medium text-gray-900">P24 - Annual Income Certificate</p>
                                    <p className="text-xs text-gray-500">Tax Year 2024 • Required for tax filing</p>
                                </div>
                            </div>
                            <button 
                                onClick={handleDownloadP24}
                                className="text-jam-orange hover:text-yellow-600 text-sm font-medium flex items-center"
                            >
                                <Icons.Download className="w-4 h-4 mr-1" />
                                Download
                            </button>
                        </div>
                         <div className="px-6 py-4 flex items-center justify-between">
                            <div className="flex items-center">
                                <Icons.Compliance className="w-5 h-5 text-gray-400 mr-3" />
                                <div>
                                    <p className="text-sm font-medium text-gray-900">P45 - Termination Certificate</p>
                                    <p className="text-xs text-gray-500">Issued upon employment termination</p>
                                </div>
                            </div>
                            <span className="text-xs text-gray-400 italic">Not applicable</span>
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    if (view === 'profile') {
         return (
            <div className="space-y-6 animate-fade-in">
                <h2 className="text-3xl font-bold text-gray-900">My Profile</h2>
                <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8">
                    <div className="flex items-center mb-8">
                        <div className="h-20 w-20 rounded-full bg-jam-yellow text-jam-black flex items-center justify-center text-2xl font-bold">
                            {user.name.charAt(0)}
                        </div>
                        <div className="ml-6">
                            <h3 className="text-xl font-bold text-gray-900">{user.name}</h3>
                            <p className="text-gray-500">Senior Developer • JamCorp Ltd.</p>
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800 mt-2">
                                Active Employee
                            </span>
                        </div>
                    </div>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                        <div>
                            <h4 className="text-sm font-bold text-gray-500 uppercase tracking-wider mb-4">Contact Info</h4>
                            <div className="space-y-4">
                                <div>
                                    <label className="block text-xs text-gray-400">Email Address</label>
                                    <p className="text-gray-900 font-medium">{user.email}</p>
                                </div>
                                <div>
                                    <label className="block text-xs text-gray-400">Phone</label>
                                    <p className="text-gray-900 font-medium">(876) 555-0123</p>
                                </div>
                                <div>
                                    <label className="block text-xs text-gray-400">Address</label>
                                    <p className="text-gray-900 font-medium">123 Hope Road, Kingston 6</p>
                                </div>
                            </div>
                        </div>
                        <div>
                             <h4 className="text-sm font-bold text-gray-500 uppercase tracking-wider mb-4">Bank Details</h4>
                             <div className="space-y-4">
                                <div>
                                    <label className="block text-xs text-gray-400">Bank Name</label>
                                    <p className="text-gray-900 font-medium">National Commercial Bank (NCB)</p>
                                </div>
                                <div>
                                    <label className="block text-xs text-gray-400">Account Number</label>
                                    <p className="text-gray-900 font-medium">•••• 4589</p>
                                </div>
                                <div>
                                    <label className="block text-xs text-gray-400">Branch</label>
                                    <p className="text-gray-900 font-medium">Half Way Tree (Knutsford)</p>
                                </div>
                            </div>
                        </div>
                    </div>
                    
                    <div className="mt-8 pt-6 border-t border-gray-100 flex justify-end">
                         <button className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50">
                            Request Change
                         </button>
                    </div>
                </div>
            </div>
         );
    }

    // Default Home View
    return (
        <div className="space-y-6 animate-fade-in">
            {/* Verification Banner */}
            {isPendingVerification && (
                <div className="bg-yellow-50 border-l-4 border-yellow-400 p-6 rounded-r-lg shadow-sm">
                    <div className="flex items-start">
                        <div className="flex-shrink-0">
                            <Icons.Alert className="h-6 w-6 text-yellow-400" />
                        </div>
                        <div className="ml-4 flex-1">
                            <h3 className="text-sm font-bold text-yellow-800">Document Verification Required</h3>
                            <p className="mt-1 text-sm text-yellow-700">
                                Your employer needs to verify your identification documents before you can access all features. 
                                Please upload your TRN card, NIS card, or other identification below.
                            </p>
                            
                            {/* Document Upload Section */}
                            <div className="mt-4 bg-white p-4 rounded-lg border border-yellow-200">
                                <label className="block text-sm font-medium text-gray-700 mb-2">
                                    Upload Verification Documents (TRN, NIS, ID Card, etc.)
                                </label>
                                <div className="flex items-center space-x-3">
                                    <input
                                        type="file"
                                        multiple
                                        accept="image/*,.pdf"
                                        onChange={handleFileUpload}
                                        className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-jam-orange file:text-white hover:file:bg-yellow-600"
                                    />
                                </div>
                                {uploadedFiles.length > 0 && (
                                    <div className="mt-3">
                                        <p className="text-xs text-gray-600 mb-2">Selected files:</p>
                                        <ul className="text-xs text-gray-700 space-y-1">
                                            {uploadedFiles.map((file, idx) => (
                                                <li key={idx} className="flex items-center">
                                                    <Icons.Document className="w-3 h-3 mr-2 text-gray-400" />
                                                    {file.name} ({(file.size / 1024).toFixed(1)} KB)
                                                </li>
                                            ))}
                                        </ul>
                                        <button
                                            onClick={handleSubmitDocuments}
                                            disabled={uploadingDocument}
                                            className="mt-3 px-4 py-2 bg-jam-orange text-white text-sm font-medium rounded-lg hover:bg-yellow-600 disabled:bg-gray-300 disabled:cursor-not-allowed"
                                        >
                                            {uploadingDocument ? 'Uploading...' : 'Submit Documents'}
                                        </button>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            )}
            
            <div className="bg-jam-black rounded-xl p-8 text-white shadow-lg relative overflow-hidden">
                <div className="relative z-10">
                    <h2 className="text-3xl font-bold">Welcome, {user.name.split(' ')[0]}</h2>
                    <p className="text-gray-400 mt-2">Employee ID: {employee?.id || 'EMP-001'}</p>
                    <div className="mt-8 grid grid-cols-1 sm:grid-cols-3 gap-6">
                        <div>
                            <p className="text-sm text-gray-400 uppercase tracking-wider">Next Pay Date</p>
                            <p className="text-2xl font-bold text-jam-yellow mt-1">Feb 25, 2025</p>
                        </div>
                        <div>
                            <p className="text-sm text-gray-400 uppercase tracking-wider">YTD Earnings (Net)</p>
                            <p className="text-2xl font-bold text-white mt-1">${ytdEarnings.toLocaleString()}</p>
                        </div>
                        <div>
                            <p className="text-sm text-gray-400 uppercase tracking-wider">Leave Balance</p>
                            <p className="text-2xl font-bold text-white mt-1">{employee?.leaveBalance?.vacation || 0} Days</p>
                        </div>
                    </div>
                </div>
                <div className="absolute right-0 bottom-0 opacity-10 transform translate-x-10 translate-y-10">
                    <Icons.Payroll className="w-64 h-64 text-white" />
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="lg:col-span-2 bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                    <div className="px-6 py-4 border-b border-gray-200 flex justify-between items-center">
                        <h3 className="font-bold text-gray-900">Recent Payslips</h3>
                        <button className="text-sm text-gray-500 hover:text-jam-black">View All History</button>
                    </div>
                    <div className="divide-y divide-gray-100">
                        {myPayslips.length === 0 && (
                            <div className="p-8 text-center text-gray-400 text-sm">
                                No payslips found. Your next payslip will appear here after the pay run.
                            </div>
                        )}
                        {myPayslips.map((slip, idx) => (
                            <div key={idx} className="px-6 py-4 flex items-center justify-between hover:bg-gray-50 transition-colors group">
                                <div className="flex items-center">
                                    <div className="p-3 rounded-lg bg-green-50 text-green-600 group-hover:bg-green-100 transition-colors">
                                        <Icons.Payroll className="w-5 h-5" />
                                    </div>
                                    <div className="ml-4">
                                        <p className="text-sm font-medium text-gray-900">Payslip - {slip.period}</p>
                                        <p className="text-xs text-gray-500">Paid on {slip.date}</p>
                                    </div>
                                </div>
                                <div className="text-right flex items-center space-x-6">
                                    <span className="font-bold text-gray-900">${slip.data.netPay.toLocaleString()}</span>
                                    <button 
                                        onClick={() => setSelectedPayslip(slip)}
                                        className="text-jam-orange hover:text-yellow-600 px-3 py-1 rounded-lg border border-transparent hover:border-gray-200 text-sm font-medium"
                                    >
                                        View
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                <div className="space-y-6">
                     <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                        <h3 className="font-bold text-gray-900 mb-4">Quick Actions</h3>
                        <div className="space-y-3">
                            <button 
                                disabled={isPendingVerification}
                                className={`w-full flex items-center justify-between p-3 border border-gray-200 rounded-lg transition-all group ${
                                    isPendingVerification 
                                        ? 'opacity-50 cursor-not-allowed' 
                                        : 'hover:border-jam-orange hover:bg-orange-50'
                                }`}
                            >
                                <span className="text-sm font-medium text-gray-700 group-hover:text-gray-900">Request Leave</span>
                                <Icons.Calendar className="w-4 h-4 text-gray-400 group-hover:text-jam-orange" />
                            </button>
                             <button 
                                disabled={isPendingVerification}
                                className={`w-full flex items-center justify-between p-3 border border-gray-200 rounded-lg transition-all group ${
                                    isPendingVerification 
                                        ? 'opacity-50 cursor-not-allowed' 
                                        : 'hover:border-jam-orange hover:bg-orange-50'
                                }`}
                            >
                                <span className="text-sm font-medium text-gray-700 group-hover:text-gray-900">Submit Claim</span>
                                <Icons.Upload className="w-4 h-4 text-gray-400 group-hover:text-jam-orange" />
                            </button>
                            <button 
                                disabled={isPendingVerification}
                                className={`w-full flex items-center justify-between p-3 border border-gray-200 rounded-lg transition-all group ${
                                    isPendingVerification 
                                        ? 'opacity-50 cursor-not-allowed' 
                                        : 'hover:border-jam-orange hover:bg-orange-50'
                                }`}
                            >
                                <span className="text-sm font-medium text-gray-700 group-hover:text-gray-900">Insurance Card</span>
                                <Icons.Shield className="w-4 h-4 text-gray-400 group-hover:text-jam-orange" />
                            </button>
                            {isPendingVerification && (
                                <div className="mt-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                                    <p className="text-xs text-yellow-800 font-medium">
                                        <Icons.Shield className="w-3 h-3 inline mr-1" />
                                        Features locked until verified
                                    </p>
                                </div>
                            )}
                        </div>
                     </div>
                </div>
            </div>
        </div>
    );
};
