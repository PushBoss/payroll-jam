
import React, { useState, useMemo } from 'react';
import { Icons } from '../components/Icons';
import { User, PayRunLineItem, LeaveType, WeeklyTimesheet, TimeEntry, LeaveRequest, Employee, PayRun, CompanySettings, DocumentTemplate, TemplateCategory, DocumentRequest } from '../core/types';
import { PayslipView } from '../components/PayslipView';
import { MultiDateCalendar } from '../components/MultiDateCalendar';
import { downloadFile, generateP24CSV } from '../utils/exportHelpers';
import { decodeClockInPayload, getCompanyLocations, normalizeAttendancePassCode } from '../utils/attendance';
import { getNextPayDateInfo } from '../utils/payrollSchedule';
import { toast } from 'sonner';
import { AttendanceClockPayload, AttendanceClockResult } from '../services/PayrollService';

interface PortalProps {
    user: User;
    employee?: Employee;
    view?: 'home' | 'documents' | 'profile' | 'leave' | 'timesheets' | 'clock-in';
    leaveRequests: LeaveRequest[];
    onRequestLeave: (req: LeaveRequest) => void;
    payRunHistory?: PayRun[];
    timesheets?: WeeklyTimesheet[];
    templates?: DocumentTemplate[];
    documentRequests?: DocumentRequest[];
    companyData?: CompanySettings;
    onUpdateEmployee?: (emp: Employee) => void | boolean | Promise<void | boolean>;
    onClockIn?: (payload: AttendanceClockPayload) => Promise<AttendanceClockResult | false>;
    onSaveTimesheet?: (timesheet: WeeklyTimesheet) => void | boolean | Promise<void | boolean>;
    onSaveDocumentRequest?: (request: DocumentRequest) => void | DocumentRequest | Promise<void | DocumentRequest>;
    onNavigate?: (path: string) => void;
}

const toDateInputValue = (date: Date) => date.toISOString().split('T')[0];

const getWeekBounds = (date: Date) => {
    const monday = new Date(date);
    const dayOfWeek = monday.getDay();
    monday.setDate(monday.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1));
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

const summarizeEntries = (entries: TimeEntry[]) => entries.reduce(
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

const isOpenAttendanceEntry = (entry: TimeEntry) => Boolean(entry.startTime && !entry.endTime);

const DEFAULT_JOB_LETTER_TEMPLATE = `{{currentDate}}

To Whom It May Concern,

This letter confirms that {{firstName}} {{lastName}} is employed by {{companyName}} as {{role}}.

Employment started on {{hireDate}}. Current gross salary is {{grossSalary}}.

This letter is issued upon employee request.

Sincerely,
{{companyName}}`;

const DEFAULT_CONTRACT_TEMPLATE = `EMPLOYMENT CONTRACT

This employment contract confirms the employment arrangement between {{companyName}} and {{firstName}} {{lastName}}.

Role: {{role}}
Start Date: {{hireDate}}
Gross Salary: {{grossSalary}}

Additional terms are maintained by the employer in the company document center.`;

export const EmployeePortal: React.FC<PortalProps> = ({ user, employee, view = 'home', leaveRequests, onRequestLeave, payRunHistory = [], timesheets = [], templates = [], documentRequests = [], companyData, onUpdateEmployee, onClockIn, onSaveTimesheet, onSaveDocumentRequest, onNavigate }) => {
    // Check if company plan allows Employee Portal access
    const hasPortalAccess = companyData && 
        (companyData.plan === 'Starter' || 
         companyData.plan === 'Pro' || 
         companyData.plan === 'Professional');
    
    const [selectedPayslip, setSelectedPayslip] = useState<{data: PayRunLineItem, period: string, date: string} | null>(null);
    const [jobLetterRequest, setJobLetterRequest] = useState(false);
    const [uploadingDocument, setUploadingDocument] = useState(false);
    const [uploadedFiles, setUploadedFiles] = useState<File[]>([]);
    const [contractRequested, setContractRequested] = useState(false);
    const [p24PreviewContent, setP24PreviewContent] = useState<string | null>(null);
    const [isLogTimeOpen, setIsLogTimeOpen] = useState(false);
    const [isProfileChangeModalOpen, setIsProfileChangeModalOpen] = useState(false);
    const [profileChangeDetails, setProfileChangeDetails] = useState('');
    const [isSubmittingProfileChange, setIsSubmittingProfileChange] = useState(false);
    const [manualEntry, setManualEntry] = useState({
        date: toDateInputValue(new Date()),
        startTime: '09:00',
        endTime: '17:00',
        breakDuration: 60,
    });
    
    // Leave State
    const [leaveType, setLeaveType] = useState<LeaveType>(LeaveType.VACATION);
    const [leaveReason, setLeaveReason] = useState('');
    const [selectedDates, setSelectedDates] = useState<string[]>([]);
    const [leaveSubmitted, setLeaveSubmitted] = useState(false);
    const [clockInStatus, setClockInStatus] = useState<'idle' | 'checking' | 'success' | 'error'>('idle');
    const [lastAttendanceAction, setLastAttendanceAction] = useState<'Clock In' | 'Clock Out' | null>(null);
    const [passCode, setPassCode] = useState('');
    const [selectedPassLocationId, setSelectedPassLocationId] = useState('');

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

    const nextPayDate = useMemo(
        () => getNextPayDateInfo(payRunHistory || [], companyData?.payFrequency),
        [payRunHistory, companyData?.payFrequency]
    );

    // Aggregate YTD
    const ytdEarnings = useMemo(() => {
        return myPayslips.reduce((acc, slip) => acc + slip.data.netPay, 0);
    }, [myPayslips]);

    const employeeId = employee?.id || user.id;
    const employeeName = employee ? `${employee.firstName} ${employee.lastName}` : user.name;
    const today = new Date();
    const currentWeekBounds = getWeekBounds(today);
    const employeeTimesheets = useMemo(() => {
        return timesheets
            .filter((timesheet) =>
                timesheet.employeeId === employeeId ||
                timesheet.employeeName === employeeName ||
                timesheet.employeeName === user.name
            )
            .sort((a, b) => new Date(b.weekStartDate).getTime() - new Date(a.weekStartDate).getTime());
    }, [employeeId, employeeName, timesheets, user.name]);
    const currentWeek = employeeTimesheets.find((timesheet) => timesheet.weekStartDate === currentWeekBounds.weekStartDate) || {
        id: `TS-PORTAL-${employeeId}-${currentWeekBounds.weekStartDate}`,
        employeeId,
        employeeName,
        companyId: companyData?.id,
        weekStartDate: currentWeekBounds.weekStartDate,
        weekEndDate: currentWeekBounds.weekEndDate,
        status: 'DRAFT' as WeeklyTimesheet['status'],
        source: 'MANUAL' as WeeklyTimesheet['source'],
        totalRegularHours: 0,
        totalOvertimeHours: 0,
        entries: [],
    };
    const openAttendance = employeeTimesheets
        .flatMap((timesheet) => timesheet.entries.map((entry) => ({ timesheet, entry })))
        .find(({ entry, timesheet }) =>
            timesheet.source === 'AUTO_QR' &&
            timesheet.status !== 'APPROVED' &&
            isOpenAttendanceEntry(entry)
        );
    const isClockedIn = Boolean(openAttendance);
    const activeContractRequest = documentRequests.find((request) =>
        request.employeeId === employeeId &&
        request.documentType.toLowerCase().includes('contract') &&
        ['PENDING', 'APPROVED', 'GENERATED', 'DELIVERED'].includes(request.status)
    );
    const activeProfileChangeRequest = documentRequests.find((request) =>
        request.employeeId === employeeId &&
        request.documentType === 'Profile Change Request' &&
        request.status === 'PENDING'
    );

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

    const handleAttendance = (method: 'QR' | 'PASS_CODE', qrPayload?: string | null, locationId?: string) => {
        if (!onClockIn || !companyData?.id) {
            toast.error('Attendance saving is not available right now.');
            setClockInStatus('error');
            return;
        }

        if (!locationId) {
            toast.error('Attendance rejected. Choose a valid branch QR code or pass code.');
            setClockInStatus('error');
            return;
        }

        if (employee?.status === 'ARCHIVED' || employee?.status === 'TERMINATED') {
            toast.error('Attendance is unavailable for archived or terminated employees.');
            setClockInStatus('error');
            return;
        }

        if (!navigator.geolocation) {
            toast.error('Attendance rejected. Geolocation is not available on this device.');
            setClockInStatus('error');
            return;
        }

        const normalizedPassCode = normalizeAttendancePassCode(passCode);
        if (method === 'PASS_CODE' && normalizedPassCode.length !== 6) {
            toast.error('Enter the 6-digit pass code from your branch badge.');
            setClockInStatus('error');
            return;
        }

        setClockInStatus('checking');
        navigator.geolocation.getCurrentPosition((position) => {
            onClockIn({
                companyId: companyData.id!,
                employeeId,
                method,
                qrPayload,
                locationId,
                passCode: method === 'PASS_CODE' ? normalizedPassCode : undefined,
                position: {
                    latitude: position.coords.latitude,
                    longitude: position.coords.longitude,
                    accuracy: position.coords.accuracy,
                },
            }).then((result) => {
                if (!result) {
                    setClockInStatus('error');
                    return;
                }
                const action = result.action === 'clock_out' ? 'Clock Out' : 'Clock In';
                setLastAttendanceAction(action);
                toast.success(`${action} accepted.`);
                setClockInStatus('success');
            }).catch((error) => {
                console.error('Attendance failed:', error);
                toast.error(error?.message || 'Attendance could not be saved.');
                setClockInStatus('error');
            });
        }, () => {
            toast.error('Attendance rejected. Location permission is required.');
            setClockInStatus('error');
        }, {
            enableHighAccuracy: true,
            timeout: 15000,
            maximumAge: 0,
        });
    };

    const handleTimeChange = (id: string, field: keyof TimeEntry, value: string) => {
        const entries = currentWeek.entries.map((entry) => {
            if (entry.id !== id) return entry;
            const updated = { ...entry, [field]: field === 'breakDuration' ? Number(value) : value } as TimeEntry;
            if (updated.startTime && updated.endTime) {
                updated.totalHours = calculateEntryHours(updated.startTime, updated.endTime, updated.breakDuration || 0);
                updated.isOvertime = updated.totalHours > 8;
            }
            return updated;
        });
        const totals = summarizeEntries(entries);
        onSaveTimesheet?.({
            ...currentWeek,
            entries,
            totalRegularHours: totals.regular,
            totalOvertimeHours: totals.overtime,
        });
    };

    const submitTimesheet = () => {
        onSaveTimesheet?.({...currentWeek, status: 'SUBMITTED'});
    };

    const handleManualEntryChange = <K extends keyof typeof manualEntry>(key: K, value: typeof manualEntry[K]) => {
        setManualEntry((entry) => ({ ...entry, [key]: value }));
    };

    const handleLogManualTime = async () => {
        if (!onSaveTimesheet) {
            toast.error('Timesheet saving is not available right now.');
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

        const { weekStartDate, weekEndDate } = getWeekBounds(new Date(`${manualEntry.date}T12:00:00`));
        const existingTimesheet = employeeTimesheets.find((timesheet) => timesheet.weekStartDate === weekStartDate);
        const newEntry: TimeEntry = {
            id: `ENTRY-EMP-MANUAL-${Date.now()}`,
            date: manualEntry.date,
            startTime: manualEntry.startTime,
            endTime: manualEntry.endTime,
            breakDuration: Number(manualEntry.breakDuration) || 0,
            totalHours: entryHours,
            isOvertime: entryHours > 8,
            source: 'MANUAL',
        };

        const entries = [...(existingTimesheet?.entries || []), newEntry];
        const totals = summarizeEntries(entries);
        const timesheet: WeeklyTimesheet = {
            id: existingTimesheet?.id || `TS-EMP-MANUAL-${employeeId}-${weekStartDate}`,
            employeeId,
            employeeName,
            companyId: companyData?.id || existingTimesheet?.companyId,
            weekStartDate,
            weekEndDate,
            status: 'SUBMITTED',
            totalRegularHours: totals.regular,
            totalOvertimeHours: totals.overtime,
            entries,
            source: 'MANUAL',
            locationId: existingTimesheet?.locationId,
            locationName: existingTimesheet?.locationName,
            clockInAt: existingTimesheet?.clockInAt,
        };

        const result = await Promise.resolve(onSaveTimesheet(timesheet));
        if (result !== false) {
            toast.success('Manual time submitted for approval.');
            setIsLogTimeOpen(false);
            setManualEntry({
                date: toDateInputValue(new Date()),
                startTime: '09:00',
                endTime: '17:00',
                breakDuration: 60,
            });
        }
    };

    const getSafeCompanyData = (): CompanySettings => ({
        id: companyData?.id,
        name: companyData?.name || 'Your Company',
        email: companyData?.email || '',
        trn: companyData?.trn || '',
        address: companyData?.address || 'Company address unavailable',
        phone: companyData?.phone || '',
        bankName: companyData?.bankName || '',
        accountNumber: companyData?.accountNumber || '',
        branchCode: companyData?.branchCode || '',
        plan: companyData?.plan,
    });

    const getP24Year = () => {
        const latestRun = [...payRunHistory]
            .sort((a, b) => new Date(b.payDate || b.periodStart).getTime() - new Date(a.payDate || a.periodStart).getTime())[0];
        return latestRun?.periodStart?.slice(0, 4) || String(new Date().getFullYear());
    };

    const getP24Stats = (year = getP24Year()) => {
        const name = employee ? `${employee.firstName} ${employee.lastName}` : user.name;
        const empId = employee ? employee.id : user.id;
        const relevantRuns = payRunHistory.filter(run => run.periodStart.startsWith(year));
        const stats = relevantRuns.reduce((summary, run) => {
            const line = run.lineItems.find(li => li.employeeId === empId || li.employeeName === name);
            if (!line) return summary;
            return {
                gross: summary.gross + line.grossPay + line.additions,
                nis: summary.nis + line.nis,
                nht: summary.nht + line.nht,
                edTax: summary.edTax + line.edTax,
                paye: summary.paye + line.paye,
            };
        }, { gross: 0, nis: 0, nht: 0, edTax: 0, paye: 0 });

        return { name, stats };
    };

    const p24Year = getP24Year();
    const p24Stats = getP24Stats(p24Year);
    const hasP24Data = p24Stats.stats.gross > 0;

    const buildP24Content = (year = p24Year) => {
        const { name, stats } = getP24Stats(year);
        if (stats.gross === 0) return null;

        const company = getSafeCompanyData();
        const netPay = stats.gross - (stats.nis + stats.nht + stats.edTax + stats.paye);
        return [
            `P24 CERTIFICATE OF PAY AND TAX DEDUCTED - ${year}`,
            `Employer: ${company.name}`,
            `Address: ${company.address.replace(/\n/g, ' ')}`,
            '',
            `Employee: ${name}`,
            `TRN: ${employee?.trn || '000-000-000'}`,
            `NIS: ${employee?.nis || 'A000000'}`,
            '',
            'ITEM,AMOUNT',
            `Total Gross Emoluments,$${stats.gross.toFixed(2)}`,
            `National Insurance (NIS),$${stats.nis.toFixed(2)}`,
            `National Housing Trust (NHT),$${stats.nht.toFixed(2)}`,
            `Education Tax,$${stats.edTax.toFixed(2)}`,
            `Income Tax (PAYE),$${stats.paye.toFixed(2)}`,
            `Net Pay,$${netPay.toFixed(2)}`,
        ].join('\n');
    };

    const handleDownloadP24 = () => {
        if (!hasP24Data) return;
        const company = getSafeCompanyData();
        generateP24CSV(company, payRunHistory, employee, user, p24Year);
    };

    const handleViewP24 = () => {
        const content = buildP24Content();
        if (content) setP24PreviewContent(content);
    };

    const fillDocumentTemplate = (content: string) => {
        const replacements: Record<string, string> = {
            '{{firstName}}': employee?.firstName || user.name.split(' ')[0] || user.name,
            '{{lastName}}': employee?.lastName || user.name.split(' ').slice(1).join(' '),
            '{{trn}}': employee?.trn || 'N/A',
            '{{grossSalary}}': `$${(employee?.grossSalary || 0).toLocaleString()}`,
            '{{role}}': employee?.jobTitle || 'Employee',
            '{{hireDate}}': employee?.hireDate || employee?.joiningDate || 'N/A',
            '{{companyName}}': companyData?.name || 'Your Company',
            '{{companyLogo}}': companyData?.logoUrl || '',
            '{{currentDate}}': new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }),
            '{{address}}': employee?.address || 'N/A',
        };

        return Object.entries(replacements).reduce((filled, [key, value]) => (
            filled.replace(new RegExp(key, 'g'), value)
        ), content);
    };

    const getTemplateByIntent = (intent: 'job-letter' | 'contract') => {
        if (intent === 'job-letter') {
            return templates.find((template) =>
                template.category === TemplateCategory.JOB_LETTER ||
                template.name.toLowerCase().includes('job letter') ||
                template.name.toLowerCase().includes('employment letter')
            );
        }

        return templates.find((template) =>
            template.category === TemplateCategory.CONTRACT ||
            template.name.toLowerCase().includes('contract')
        );
    };

    const openEmployeeDocumentPdf = (intent: 'job-letter' | 'contract') => {
        const template = getTemplateByIntent(intent);
        const fallback = intent === 'job-letter' ? DEFAULT_JOB_LETTER_TEMPLATE : DEFAULT_CONTRACT_TEMPLATE;
        const content = fillDocumentTemplate(template?.content || fallback);
        const logoUrl = template?.logoUrl || companyData?.logoUrl || '';
        const title = intent === 'job-letter' ? 'Job Letter' : 'Employment Contract';
        const printWindow = window.open('', '_blank');
        if (!printWindow) {
            toast.error('Unable to open the PDF preview window. Please allow popups for Payroll-Jam.');
            return;
        }

        printWindow.document.write(`
            <html>
                <head>
                    <title>${title} - ${employeeName}</title>
                    <style>
                        body { font-family: Arial, sans-serif; padding: 40px; max-width: 800px; margin: 0 auto; color: #111827; line-height: 1.6; }
                        .header { text-align: center; border-bottom: 1px solid #d1d5db; margin-bottom: 36px; padding-bottom: 24px; }
                        .logo { max-height: 72px; max-width: 220px; object-fit: contain; margin-bottom: 16px; }
                        h1 { margin: 0; font-size: 20px; letter-spacing: 0.08em; text-transform: uppercase; }
                        .content { white-space: pre-wrap; font-size: 14px; }
                        .footer { margin-top: 56px; color: #6b7280; font-size: 12px; text-align: center; }
                        .actions { position: fixed; right: 24px; bottom: 24px; display: flex; gap: 8px; }
                        .actions button { border: 0; border-radius: 8px; padding: 10px 14px; font-weight: 700; cursor: pointer; }
                        .print { background: #111827; color: white; }
                        .close { background: #f3f4f6; color: #374151; }
                        @media print {
                            body { padding: 0; margin: 2cm; }
                            .actions { display: none; }
                        }
                    </style>
                </head>
                <body>
                    <div class="header">
                        ${logoUrl ? `<img class="logo" src="${logoUrl}" alt="${companyData?.name || 'Company'} logo" />` : ''}
                        <h1>${companyData?.name || 'Your Company'}</h1>
                        <p>${companyData?.address || ''}</p>
                    </div>
                    <div class="content">${content.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</div>
                    <div class="footer">Generated by Payroll-Jam on ${new Date().toLocaleDateString()}</div>
                    <div class="actions">
                        <button class="close" onclick="window.close()">Close</button>
                        <button class="print" onclick="window.print()">Save as PDF / Print</button>
                    </div>
                </body>
            </html>
        `);
        printWindow.document.close();
        window.setTimeout(() => printWindow.print(), 250);
    };

    const handleContractRequest = async () => {
        if (!onSaveDocumentRequest) {
            toast.error('Document requests are not available right now.');
            return;
        }

        const request: DocumentRequest = {
            id: `DOCREQ-${employeeId}-${Date.now()}`,
            companyId: companyData?.id || employee?.companyId,
            employeeId,
            employeeName,
            templateId: getTemplateByIntent('contract')?.id || 'DOC-EMPLOYEE-CONTRACT',
            documentType: 'Employment Contract',
            purpose: 'Employee requested a copy from the employee portal.',
            status: 'PENDING',
            requestedAt: new Date().toISOString(),
        };

        await Promise.resolve(onSaveDocumentRequest(request));
        toast.success('Employment contract request sent to your employer.');
    };

    const handleProfileChangeRequest = async (event?: React.FormEvent) => {
        event?.preventDefault();

        if (!onSaveDocumentRequest) {
            toast.error('Profile change requests are not available right now.');
            return;
        }

        const requestedChanges = profileChangeDetails.trim();
        if (requestedChanges.length < 5) {
            toast.error('Tell your employer what needs to change.');
            return;
        }

        setIsSubmittingProfileChange(true);

        try {
            const request: DocumentRequest = {
                id: `PROFILE-REQ-${employeeId}-${Date.now()}`,
                companyId: companyData?.id || employee?.companyId,
                employeeId,
                employeeName,
                templateId: 'PROFILE_CHANGE_REQUEST',
                documentType: 'Profile Change Request',
                purpose: requestedChanges,
                status: 'PENDING',
                requestedAt: new Date().toISOString(),
            };

            await Promise.resolve(onSaveDocumentRequest(request));
            toast.success('Profile change request sent to your employer.');
            setProfileChangeDetails('');
            setIsProfileChangeModalOpen(false);
        } catch (error) {
            console.error('Failed to submit profile change request:', error);
            toast.error(error instanceof Error ? error.message : 'Failed to send profile change request.');
        } finally {
            setIsSubmittingProfileChange(false);
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
                
                if (onUpdateEmployee) {
                    const updateResult = await Promise.resolve(onUpdateEmployee(updatedEmployee));
                    if (updateResult === false) {
                        throw new Error('Failed to save document details to employee profile');
                    }
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
                employee={employee}
                payRunHistory={payRunHistory}
                onClose={() => setSelectedPayslip(null)}
            />
        );
    }

    if (p24PreviewContent) {
        return (
            <div className="fixed inset-0 z-[130] flex items-center justify-center bg-black/50 p-4">
                <div className="w-full max-w-3xl overflow-hidden rounded-xl bg-white shadow-2xl">
                    <div className="flex items-center justify-between border-b border-gray-100 bg-gray-50 p-4">
                        <div>
                            <h3 className="font-bold text-gray-900">P24 Preview</h3>
                            <p className="text-xs text-gray-500">Review your annual income certificate before downloading.</p>
                        </div>
                        <button onClick={() => setP24PreviewContent(null)} className="text-gray-400 hover:text-gray-700">
                            <Icons.Close className="h-5 w-5" />
                        </button>
                    </div>
                    <pre className="max-h-[70vh] overflow-auto whitespace-pre-wrap bg-white p-6 text-sm leading-6 text-gray-800">
                        {p24PreviewContent}
                    </pre>
                    <div className="flex justify-end gap-3 border-t border-gray-100 bg-gray-50 p-4">
                        <button
                            onClick={() => setP24PreviewContent(null)}
                            className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-white"
                        >
                            Close
                        </button>
                        <button
                            onClick={() => {
                                downloadFile(`P24_${employeeName.replace(/\s+/g, '_')}_${p24Year}.csv`, p24PreviewContent, 'text/csv');
                                setP24PreviewContent(null);
                            }}
                            className="rounded-lg bg-jam-black px-4 py-2 text-sm font-medium text-white hover:bg-gray-800"
                        >
                            Download CSV
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    if (view === 'clock-in') {
        const qrParam = new URLSearchParams(window.location.search).get('qr');
        const payload = decodeClockInPayload(qrParam);
        const locations = getCompanyLocations(companyData);
        const qrLocation = payload && companyData?.id && payload.company_id === companyData.id
            ? locations.find((item) => item.id === payload.location_id)
            : undefined;
        const passCodeLocation = locations.find((item) => item.id === selectedPassLocationId) || locations[0];
        const location = qrLocation || passCodeLocation;
        const attendanceAction = isClockedIn ? 'Clock Out' : 'Clock In';
        const canSubmitAttendance = Boolean(qrLocation || (passCodeLocation && normalizeAttendancePassCode(passCode).length === 6));

        return (
            <div className="mx-auto max-w-md space-y-6 animate-fade-in px-1 sm:px-0">
                <div>
                    <h2 className="text-2xl font-bold text-gray-900 sm:text-3xl">Clock In/Out</h2>
                    <p className="mt-1 text-gray-500">Scan your branch QR code or enter the badge pass code.</p>
                </div>

                <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
                    <div className="mb-6 rounded-lg bg-gray-50 p-4">
                        <p className="text-xs font-bold uppercase text-gray-500">Branch</p>
                        <p className="mt-1 text-lg font-bold text-gray-900">{location?.name || 'Unknown branch'}</p>
                        {location && (
                            <p className="mt-1 text-sm text-gray-500">Allowed radius: {location.geofenceRadiusMeters} meters</p>
                        )}
                        <div className={`mt-3 inline-flex rounded-full px-2.5 py-1 text-xs font-bold ${isClockedIn ? 'bg-green-100 text-green-800' : 'bg-gray-200 text-gray-700'}`}>
                            {isClockedIn ? 'Currently clocked in' : 'Not clocked in'}
                        </div>
                    </div>

                    <div className="mb-5">
                        <label className="mb-1 block text-xs font-bold uppercase text-gray-500">Pass Code</label>
                        {!qrLocation && (
                            <select
                                value={passCodeLocation?.id || ''}
                                onChange={(event) => {
                                    setSelectedPassLocationId(event.target.value);
                                    setClockInStatus('idle');
                                }}
                                className="mb-3 w-full rounded-lg border border-gray-300 p-3 text-sm focus:border-jam-orange focus:ring-2 focus:ring-jam-orange/20"
                            >
                                {locations.map((item) => (
                                    <option key={item.id} value={item.id}>{item.name}</option>
                                ))}
                            </select>
                        )}
                        <input
                            inputMode="numeric"
                            maxLength={6}
                            value={passCode}
                            onChange={(event) => {
                                setPassCode(normalizeAttendancePassCode(event.target.value));
                                setClockInStatus('idle');
                            }}
                            placeholder="Enter 6-digit code"
                            className="w-full rounded-lg border border-gray-300 p-3 text-center font-mono text-xl font-bold tracking-[0.25em] focus:border-jam-orange focus:ring-2 focus:ring-jam-orange/20"
                        />
                        <p className="mt-2 text-xs text-gray-500">
                            Use this if your phone cannot open the QR code link.
                        </p>
                    </div>

                    {clockInStatus === 'success' ? (
                        <div className="rounded-lg border border-green-200 bg-green-50 p-4 text-green-800">
                            <p className="font-bold">{lastAttendanceAction || attendanceAction} accepted</p>
                            <p className="mt-1 text-sm">Your attendance has been submitted for manager review.</p>
                        </div>
                    ) : (
                        <button
                            type="button"
                            onClick={() => handleAttendance(qrLocation ? 'QR' : 'PASS_CODE', qrParam, qrLocation?.id || passCodeLocation?.id)}
                            disabled={clockInStatus === 'checking' || !canSubmitAttendance}
                            className="flex w-full items-center justify-center rounded-lg bg-jam-black px-4 py-3 font-bold text-white hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                            {clockInStatus === 'checking' ? (
                                <>
                                    <Icons.Refresh className="mr-2 h-5 w-5 animate-spin" />
                                    Checking location...
                                </>
                            ) : (
                                `Validate Location & ${attendanceAction}`
                            )}
                        </button>
                    )}

                    {payload && !qrLocation && (
                        <p className="mt-3 text-sm text-red-600">
                            This clock-in link is invalid or no longer matches an active branch location.
                        </p>
                    )}
                </div>
            </div>
        );
    }

    if (view === 'timesheets') {
        return (
            <div className="space-y-6 animate-fade-in">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                        <h2 className="text-2xl font-bold text-gray-900 sm:text-3xl">My Hours</h2>
                        <p className="text-gray-500 mt-1">Week of {currentWeek.weekStartDate}</p>
                    </div>
                    <div className="flex items-center gap-3">
                        <button
                            type="button"
                            onClick={() => setIsLogTimeOpen(true)}
                            className="flex items-center justify-center rounded-lg bg-jam-orange px-4 py-2 text-sm font-semibold text-jam-black hover:bg-yellow-500"
                        >
                            <Icons.Plus className="mr-2 h-4 w-4" />
                            Log Hours
                        </button>
                         <div className="w-full rounded-lg border border-gray-200 bg-white px-4 py-2 shadow-sm sm:w-auto">
                            <p className="text-xs text-gray-500 uppercase font-bold">Total Hours</p>
                            <p className="text-xl font-bold text-jam-black">{currentWeek.totalRegularHours.toFixed(1)}</p>
                         </div>
                    </div>
                </div>

                {isLogTimeOpen && (
                    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/50 p-4">
                        <div className="w-full max-w-xl overflow-hidden rounded-xl bg-white shadow-2xl">
                            <div className="flex items-center justify-between border-b border-gray-100 bg-gray-50 p-4">
                                <div>
                                    <h3 className="font-bold text-gray-900">Log Hours</h3>
                                    <p className="text-xs text-gray-500">Submit a manual time entry for manager approval.</p>
                                </div>
                                <button onClick={() => setIsLogTimeOpen(false)} className="text-gray-400 hover:text-gray-700">
                                    <Icons.Close className="h-5 w-5" />
                                </button>
                            </div>
                            <div className="space-y-4 p-6">
                                <div>
                                    <label className="mb-1 block text-xs font-bold uppercase text-gray-500">Work Date</label>
                                    <input
                                        type="date"
                                        value={manualEntry.date}
                                        onChange={(event) => handleManualEntryChange('date', event.target.value)}
                                        className="w-full rounded-lg border border-gray-300 p-2 text-sm"
                                    />
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
                                </div>
                            </div>
                            <div className="flex justify-end gap-3 border-t border-gray-100 bg-gray-50 p-4">
                                <button
                                    onClick={() => setIsLogTimeOpen(false)}
                                    className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-white"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={handleLogManualTime}
                                    className="rounded-lg bg-jam-black px-4 py-2 text-sm font-medium text-white hover:bg-gray-800"
                                >
                                    Submit Hours
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                     {/* Header */}
                    <div className="flex flex-col gap-3 border-b border-gray-200 bg-gray-50 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
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
                                disabled={currentWeek.entries.length === 0}
                                className="flex items-center justify-center rounded-lg bg-jam-black px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-50"
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
                        {currentWeek.entries.length === 0 && (
                            <div className="p-8 text-center text-sm text-gray-500">
                                No hours logged for this week yet. Use Clock In/Out or Log Hours to submit time.
                            </div>
                        )}
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
                                <p className="text-xs text-green-600 mt-1">Ready to download from your company template.</p>
                                <div className="mt-3 flex gap-2">
                                    <button onClick={() => openEmployeeDocumentPdf('job-letter')} className="flex-1 rounded-lg bg-green-600 px-3 py-2 text-xs font-bold text-white hover:bg-green-700">
                                        Save PDF
                                    </button>
                                    <button onClick={() => setJobLetterRequest(false)} className="flex-1 rounded-lg border border-green-200 px-3 py-2 text-xs font-bold text-green-800 hover:bg-green-100">
                                        Reset
                                    </button>
                                </div>
                            </div>
                        ) : (
                            <button 
                                onClick={() => {
                                    setJobLetterRequest(true);
                                    openEmployeeDocumentPdf('job-letter');
                                }}
                                className="w-full py-2 bg-jam-black text-white rounded-lg text-sm font-medium hover:bg-gray-800 transition-colors"
                            >
                                Generate PDF Letter
                            </button>
                        )}
                    </div>

                    <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
                        <div className="h-12 w-12 bg-blue-100 rounded-lg flex items-center justify-center text-blue-600 mb-4">
                            <Icons.File className="w-6 h-6" />
                        </div>
                        <h3 className="font-bold text-gray-900 mb-2">Employment Contract</h3>
                        <p className="text-sm text-gray-500 mb-6">
                            Download your employment contract when a company template is available, or request a copy from HR.
                        </p>
                        {getTemplateByIntent('contract') ? (
                            <button
                                onClick={() => openEmployeeDocumentPdf('contract')}
                                className="w-full py-2 border border-gray-300 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors flex items-center justify-center"
                            >
                                <Icons.DownloadCloud className="w-4 h-4 mr-2" />
                                Save Contract PDF
                            </button>
                        ) : contractRequested || activeContractRequest ? (
                            <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 text-center">
                                <Icons.Check className="mx-auto mb-2 h-5 w-5 text-blue-600" />
                                <p className="text-sm font-bold text-blue-800">
                                    {activeContractRequest?.status === 'APPROVED' ? 'Contract request approved' : 'Contract requested'}
                                </p>
                                <p className="mt-1 text-xs text-blue-600">
                                    Your employer can upload or generate it from Document Center.
                                </p>
                            </div>
                        ) : (
                            <button
                                onClick={() => {
                                    setContractRequested(true);
                                    void handleContractRequest();
                                }}
                                className="w-full py-2 border border-gray-300 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors flex items-center justify-center"
                            >
                                <Icons.Document className="w-4 h-4 mr-2" />
                                Request Contract
                            </button>
                        )}
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
                                    <p className="text-xs text-gray-500">Tax Year {p24Year} • Required for tax filing</p>
                                    {!hasP24Data && (
                                        <p className="mt-1 text-xs text-amber-600">
                                            No finalized earnings are available for this tax year yet.
                                        </p>
                                    )}
                                </div>
                            </div>
                            <div className="flex items-center gap-3">
                                <button
                                    onClick={handleViewP24}
                                    disabled={!hasP24Data}
                                    className="text-gray-600 hover:text-gray-900 text-sm font-medium flex items-center disabled:cursor-not-allowed disabled:text-gray-300"
                                >
                                    <Icons.Eye className="w-4 h-4 mr-1" />
                                    View
                                </button>
                                <button
                                    onClick={handleDownloadP24}
                                    disabled={!hasP24Data}
                                    className="text-jam-orange hover:text-yellow-600 text-sm font-medium flex items-center disabled:cursor-not-allowed disabled:text-gray-300"
                                >
                                    <Icons.Download className="w-4 h-4 mr-1" />
                                    Download
                                </button>
                            </div>
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
                         <button
                            onClick={() => setIsProfileChangeModalOpen(true)}
                            disabled={Boolean(activeProfileChangeRequest)}
                            className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60"
                         >
                            {activeProfileChangeRequest ? 'Change Requested' : 'Request Change'}
                         </button>
                    </div>
                </div>

                {isProfileChangeModalOpen && (
                    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/50 p-4">
                        <div className="w-full max-w-lg overflow-hidden rounded-xl bg-white shadow-2xl">
                            <div className="flex items-start justify-between gap-4 border-b border-gray-100 bg-gray-50 p-5">
                                <div>
                                    <h3 className="text-lg font-bold text-gray-900">Request Profile Changes</h3>
                                    <p className="mt-1 text-sm text-gray-500">
                                        Tell your employer which details need to be updated.
                                    </p>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => setIsProfileChangeModalOpen(false)}
                                    className="rounded-lg p-1 text-gray-400 hover:bg-white hover:text-gray-700"
                                    aria-label="Close profile change request"
                                >
                                    <Icons.Close className="h-5 w-5" />
                                </button>
                            </div>

                            <form onSubmit={handleProfileChangeRequest} className="space-y-4 p-5">
                                <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 text-sm text-gray-600">
                                    Your company admin will review this before changes appear in your profile.
                                </div>

                                <div>
                                    <label htmlFor="profile-change-details" className="mb-1 block text-sm font-medium text-gray-700">
                                        Requested changes
                                    </label>
                                    <textarea
                                        id="profile-change-details"
                                        rows={5}
                                        value={profileChangeDetails}
                                        onChange={(event) => setProfileChangeDetails(event.target.value)}
                                        className="w-full rounded-lg border border-gray-300 p-3 text-sm text-gray-900 focus:border-jam-orange focus:ring-2 focus:ring-jam-orange"
                                        placeholder="Example: Please update my phone number to 876-555-0199 and correct my address..."
                                        autoFocus
                                    />
                                </div>

                                <div className="flex flex-col-reverse gap-3 border-t border-gray-100 pt-4 sm:flex-row sm:justify-end">
                                    <button
                                        type="button"
                                        onClick={() => setIsProfileChangeModalOpen(false)}
                                        className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        type="submit"
                                        disabled={isSubmittingProfileChange || profileChangeDetails.trim().length < 5}
                                        className="rounded-lg bg-jam-black px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-60"
                                    >
                                        {isSubmittingProfileChange ? 'Sending...' : 'Send Request'}
                                    </button>
                                </div>
                            </form>
                        </div>
                    </div>
                )}
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
                            <p className="text-2xl font-bold text-jam-yellow mt-1">{nextPayDate.display}</p>
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
                        <button onClick={() => onNavigate?.('portal-docs')} className="text-sm text-gray-500 hover:text-jam-black">Documents</button>
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
                                onClick={() => onNavigate?.('portal-clock-in')}
                                className="w-full flex items-center justify-between p-3 border border-gray-200 rounded-lg transition-all group hover:border-jam-orange hover:bg-orange-50"
                            >
                                <span className="text-sm font-medium text-gray-700 group-hover:text-gray-900">
                                    {isClockedIn ? 'Clock Out' : 'Clock In'}
                                </span>
                                <Icons.Clock className="w-4 h-4 text-gray-400 group-hover:text-jam-orange" />
                            </button>
                            <button
                                onClick={() => onNavigate?.('portal-leave')}
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
                                onClick={() => onNavigate?.('portal-docs')}
                                disabled={isPendingVerification}
                                className={`w-full flex items-center justify-between p-3 border border-gray-200 rounded-lg transition-all group ${
                                    isPendingVerification 
                                        ? 'opacity-50 cursor-not-allowed' 
                                        : 'hover:border-jam-orange hover:bg-orange-50'
                                }`}
                            >
                                <span className="text-sm font-medium text-gray-700 group-hover:text-gray-900">Documents</span>
                                <Icons.Document className="w-4 h-4 text-gray-400 group-hover:text-jam-orange" />
                            </button>
                            <button 
                                onClick={() => onNavigate?.('portal-timesheets')}
                                className="w-full flex items-center justify-between p-3 border border-gray-200 rounded-lg transition-all group hover:border-jam-orange hover:bg-orange-50"
                            >
                                <span className="text-sm font-medium text-gray-700 group-hover:text-gray-900">My Hours</span>
                                <Icons.Timer className="w-4 h-4 text-gray-400 group-hover:text-jam-orange" />
                            </button>
                            <button
                                onClick={() => onNavigate?.('portal-timesheets')}
                                className="w-full flex items-center justify-between p-3 border border-gray-200 rounded-lg transition-all group hover:border-jam-orange hover:bg-orange-50"
                            >
                                <span className="text-sm font-medium text-gray-700 group-hover:text-gray-900">Log Hours</span>
                                <Icons.Plus className="w-4 h-4 text-gray-400 group-hover:text-jam-orange" />
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
