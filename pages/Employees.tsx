import React, { useState, useRef } from 'react';
import Papa from 'papaparse';
import { Employee, PayFrequency, Role, PayRun, CompanySettings, PayType, Department, Designation, Asset, PerformanceReview, TerminationDetails, BankAccount, PricingPlan, User } from '../types';
import { Icons } from '../components/Icons';
import { EmployeeManager } from '../components/EmployeeManager';
import { auditService } from '../services/auditService';
import { downloadFile, generateP45CSV } from '../utils/exportHelpers';
import { emailService } from '../services/emailService';
import { toast } from 'sonner';
import { useAuth } from '../context/AuthContext';
import { isValidTRN, isValidNIS, isValidEmail, formatTRN } from '../utils/validators';
import { generateUUID } from '../utils/uuid';

interface EmployeesProps {
    employees: Employee[];
    payRunHistory: PayRun[];
    companyData: CompanySettings;
    onAddEmployee: (emp: Employee) => void;
    onUpdateEmployee: (emp: Employee) => void;
    onDeleteEmployee?: (id: string) => void;
    onSimulateOnboarding?: (emp: Employee) => void;
    departments?: Department[];
    designations?: Designation[];
    assets?: Asset[];
    onUpdateAssets?: (assets: Asset[]) => void;
    reviews?: PerformanceReview[];
    onUpdateReviews?: (reviews: PerformanceReview[]) => void;
    plans?: PricingPlan[];
    users?: User[];
    onNavigate?: (path: string) => void;
    onUpdateDepartments?: (depts: Department[]) => void;
}

export const Employees: React.FC<EmployeesProps> = ({
    employees,
    payRunHistory,
    companyData,
    onAddEmployee,
    onUpdateEmployee,
    onDeleteEmployee,
    onSimulateOnboarding,
    departments = [],
    designations: _designations = [],
    assets: _assets = [],
    onUpdateAssets: _onUpdateAssets,
    reviews: _reviews = [],
    onUpdateReviews: _onUpdateReviews,
    plans = [],
    users = [],
    onNavigate,
    onUpdateDepartments,
}) => {
    const { user: currentUser } = useAuth();

    const [viewMode, setViewMode] = useState<'active' | 'onboarding' | 'archived'>('active');

    // Modals State
    const [isAddModalOpen, setIsAddModalOpen] = useState(false);
    const [isInviteModalOpen, setIsInviteModalOpen] = useState(false);
    const [isSendingInvite, setIsSendingInvite] = useState(false);
    const [showUpgradeModal, setShowUpgradeModal] = useState(false);

    const [terminationModal, setTerminationModal] = useState<{ isOpen: boolean, empId: string, step: number }>({ isOpen: false, empId: '', step: 1 });
    const [terminationData, setTerminationData] = useState<Partial<TerminationDetails>>({ reason: 'RESIGNATION' });
    const [deleteWarning, setDeleteWarning] = useState<{ isOpen: boolean, empId: string }>({ isOpen: false, empId: '' });
    const [revokeWarning, setRevokeWarning] = useState<{ isOpen: boolean, empId: string, email: string }>({ isOpen: false, empId: '', email: '' });
    const [verificationModal, setVerificationModal] = useState<{ isOpen: boolean, employee: Employee | null }>({ isOpen: false, employee: null });
    const [isAddingNewDept, setIsAddingNewDept] = useState(false);
    const [newInlineDeptName, setNewInlineDeptName] = useState('');

    // Edit State
    const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(null);
    const [editTab, setEditTab] = useState<'profile' | 'financial' | 'banking'>('profile');
    
    // New EmployeeManager State
    const [isEmployeeManagerOpen, setIsEmployeeManagerOpen] = useState(false);
    const [employeeManagerMode, setEmployeeManagerMode] = useState<'add' | 'edit'>('add');

    const [searchTerm, setSearchTerm] = useState('');
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Add Employee Form State
    const [addForm, setAddForm] = useState({
        firstName: '', lastName: '', email: '', trn: '', nis: '',
        employeeId: '', grossSalary: '', hourlyRate: '', role: Role.EMPLOYEE,
        payType: PayType.SALARIED, department: '', jobTitle: '',
        bankName: 'NCB', accountNumber: ''
    });

    const [inviteData, setInviteData] = useState({
        firstName: '',
        lastName: '',
        email: '',
        role: Role.EMPLOYEE
    });

    const getPlanLimit = (planName: string | undefined) => {
        // Normalize plan name
        const normalizedName = planName === 'Professional' ? 'Pro' : planName;
        const planObj = plans.find(p => p.name === normalizedName);
        if (planObj && planObj.limit) {
            const limitStr = planObj.limit.split(' ')[0];
            return limitStr === 'Unlimited' ? 99999 : parseInt(limitStr) || 5;
        }

        switch (planName) {
            case 'Free': return 5;
            case 'Starter': return 25;
            case 'Pro': case 'Professional': return 99999;
            case 'Enterprise': return 99999;
            default: return 5;
        }
    };

    const checkPlanLimit = (countToAdd = 1) => {
        const currentActiveEmployees = employees.filter(e => e.status !== 'TERMINATED' && e.status !== 'ARCHIVED').length;
        const currentUsers = users.length;
        const totalCount = currentActiveEmployees + currentUsers;
        const limit = getPlanLimit(companyData?.plan);

        if (totalCount + countToAdd > limit) {
            setShowUpgradeModal(true);
            return false;
        }
        return true;
    };

    const handleAddClick = () => {
        if (checkPlanLimit(1)) {
            setSelectedEmployee(null);
            setEmployeeManagerMode('add');
            setIsEmployeeManagerOpen(true);
        }
    };

    const handleInviteClick = () => {
        if (checkPlanLimit(1)) {
            setIsInviteModalOpen(true);
        }
    };

    const handleResendInvite = async (emp: Employee) => {
        setIsSendingInvite(true);
        const inviteLink = `${window.location.origin}/?token=${emp.onboardingToken}&email=${encodeURIComponent(emp.email)}&type=employee`;

        const emailResult = await emailService.sendEmployeeInvite(
            emp.email,
            emp.firstName,
            companyData?.name || 'Your Company',
            inviteLink
        );

        if (emailResult.success) {
            toast.success(`Invitation resent to ${emp.email}`);
            auditService.log(currentUser, 'UPDATE', 'Employee', `Resent invitation to ${emp.email}`);
        } else {
            toast.error('Failed to resend email.');
        }
        setIsSendingInvite(false);
    };

    const handleSendLoginInvite = async (emp: Employee) => {
        // Check if plan is Pro, Reseller, or Enterprise
        const planName = companyData?.plan === 'Professional' ? 'Pro' : companyData?.plan;
        if (planName !== 'Pro' && planName !== 'Reseller' && planName !== 'Enterprise') {
            toast.error('This feature is only available for Pro and Reseller plans. Please upgrade to send employee portal invites.');
            return;
        }

        setIsSendingInvite(true);

        // Generate or use existing onboarding token for the employee login link
        const token = emp.onboardingToken || generateUUID();

        // Update employee with token if not already set
        if (!emp.onboardingToken) {
            const updatedEmp = { ...emp, onboardingToken: token };
            onUpdateEmployee(updatedEmp);
        }

        const inviteLink = `${window.location.origin}/?token=${token}&email=${encodeURIComponent(emp.email)}&type=employee`;

        const emailResult = await emailService.sendEmployeeInvite(
            emp.email,
            emp.firstName,
            companyData?.name || 'Your Company',
            inviteLink
        );

        if (emailResult.success) {
            toast.success(`Employee portal invite sent to ${emp.email}`);
            auditService.log(currentUser, 'UPDATE', 'Employee', `Sent employee portal invite to ${emp.email}`);
        } else {
            toast.error('Failed to send invite email.');
        }
        setIsSendingInvite(false);
    };

    const filteredEmployees = employees.filter(e => {
        const matchesSearch = e.firstName.toLowerCase().includes(searchTerm.toLowerCase()) ||
            e.lastName.toLowerCase().includes(searchTerm.toLowerCase()) ||
            e.email.toLowerCase().includes(searchTerm.toLowerCase());

        if (!matchesSearch) return false;

        if (viewMode === 'active') {
            return e.status === 'ACTIVE' || e.status === 'TERMINATED';
        } else if (viewMode === 'archived') {
            return e.status === 'ARCHIVED';
        } else {
            return e.status === 'PENDING_ONBOARDING' || e.status === 'PENDING_VERIFICATION';
        }
    });

    const handleInvite = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!checkPlanLimit(1)) return;

        if (!isValidEmail(inviteData.email)) {
            toast.error("Please enter a valid email address.");
            return;
        }

        setIsSendingInvite(true);
        const onboardingToken = generateUUID();
        const inviteLink = `${window.location.origin}/?token=${onboardingToken}&email=${encodeURIComponent(inviteData.email)}&type=employee`;

        const newEmp: Employee = {
            id: generateUUID(),
            firstName: inviteData.firstName,
            lastName: inviteData.lastName,
            email: inviteData.email,
            trn: '', nis: '', grossSalary: 0,
            payType: PayType.SALARIED,
            payFrequency: PayFrequency.MONTHLY,
            role: inviteData.role,
            status: 'PENDING_ONBOARDING',
            hireDate: new Date().toISOString().split('T')[0],
            onboardingToken: onboardingToken,
            allowances: [], deductions: []
        };

        const emailResult = await emailService.sendEmployeeInvite(
            inviteData.email,
            inviteData.firstName,
            companyData?.name || 'Your Company',
            inviteLink
        );

        if (emailResult.success) {
            onAddEmployee(newEmp);
            auditService.log(currentUser, 'CREATE', 'Employee', `Invited ${newEmp.email}`);
            setIsInviteModalOpen(false);
            setInviteData({ firstName: '', lastName: '', email: '', role: Role.EMPLOYEE });
            setViewMode('onboarding');
            if (!emailResult.message?.includes('Simulation')) {
                toast.success('Invitation email sent successfully!');
            } else {
                toast.info('Simulation: Invitation logged to console.');
            }
        } else {
            toast.error('Failed to send email. Check console or configuration.');
        }
        setIsSendingInvite(false);
    };

    const onSubmitAdd = (e: React.FormEvent) => {
        e.preventDefault();
        if (!checkPlanLimit(1)) return;

        if (!addForm.trn || addForm.trn.trim() === '') {
            toast.error('TRN is required. Enter "PENDING" if currently unavailable.');
            return;
        }
        if (!isValidTRN(addForm.trn)) {
            toast.error("Invalid TRN. Must be 9 digits (e.g. 123-456-789) or 'PENDING'");
            return;
        }

        if (!addForm.nis || addForm.nis.trim() === '') {
            toast.error('NIS is required. Enter "PENDING" if currently unavailable.');
            return;
        }
        if (!isValidNIS(addForm.nis)) {
            toast.error("Invalid NIS. Must be Letter + 6 Digits (e.g. A123456) or 'PENDING'");
            return;
        }

        if (!addForm.accountNumber || addForm.accountNumber.trim() === '') {
            toast.error('Bank Account Number is required. Enter "PENDING" if currently unavailable.');
            return;
        }

        const newEmp: Employee = {
            id: generateUUID(),
            firstName: addForm.firstName,
            lastName: addForm.lastName,
            email: addForm.email,
            trn: addForm.trn.toUpperCase() === 'PENDING' ? 'PENDING' : formatTRN(addForm.trn),
            nis: addForm.nis.toUpperCase() === 'PENDING' ? 'PENDING' : addForm.nis.toUpperCase(),
            employeeId: addForm.employeeId || undefined,
            grossSalary: parseFloat(addForm.grossSalary) || 0,
            hourlyRate: parseFloat(addForm.hourlyRate) || 0,
            payType: addForm.payType,
            payFrequency: PayFrequency.MONTHLY,
            role: addForm.role,
            status: 'ACTIVE',
            hireDate: new Date().toISOString().split('T')[0],
            allowances: [],
            deductions: [],
            department: addForm.department,
            jobTitle: addForm.jobTitle,
            bankDetails: {
                bankName: addForm.bankName as any,
                accountNumber: addForm.accountNumber,
                accountType: 'SAVINGS',
                currency: 'JMD'
            }
        };
        onAddEmployee(newEmp);
        auditService.log(currentUser, 'CREATE', 'Employee', `Added new employee: ${newEmp.firstName} ${newEmp.lastName}`);
        setIsAddModalOpen(false);
        setAddForm({ firstName: '', lastName: '', email: '', trn: '', nis: '', employeeId: '', grossSalary: '', hourlyRate: '', role: Role.EMPLOYEE, payType: PayType.SALARIED, department: '', jobTitle: '', bankName: 'NCB', accountNumber: '' });
        toast.success("Employee added successfully");
    };

    const handleEmployeeManagerSave = (employee: Employee) => {
        if (employeeManagerMode === 'add') {
            const newEmp: Employee = {
                ...employee,
                id: employee.id || generateUUID(),
                status: 'ACTIVE',
                payFrequency: employee.payFrequency || PayFrequency.MONTHLY,
                role: employee.role || Role.EMPLOYEE
            };
            onAddEmployee(newEmp);
            auditService.log(currentUser, 'CREATE', 'Employee', `Added new employee: ${newEmp.firstName} ${newEmp.lastName}`);
            toast.success("Employee added successfully");
        } else {
            onUpdateEmployee(employee);
            auditService.log(currentUser, 'UPDATE', 'Employee', `Updated employee: ${employee.firstName} ${employee.lastName}`);
            toast.success("Employee updated successfully");
        }
        setIsEmployeeManagerOpen(false);
        setSelectedEmployee(null);
    };

    const handleInlineAddDept = () => {
        if (!newInlineDeptName.trim() || !onUpdateDepartments) return;
        const newDep: Department = { id: `dept-${Date.now()}`, name: newInlineDeptName.trim() };
        onUpdateDepartments([...departments, newDep]);

        // Auto-select for the active form
        if (selectedEmployee) {
            setSelectedEmployee({ ...selectedEmployee, department: newDep.id });
        } else if (isAddModalOpen) {
            setAddForm({ ...addForm, department: newDep.id });
        }

        setNewInlineDeptName('');
        setIsAddingNewDept(false);
        toast.success(`Department "${newDep.name}" created`);
    };

    const startTermination = (empId: string) => {
        setTerminationModal({ isOpen: true, empId, step: 1 });
        setTerminationData({ reason: 'RESIGNATION', date: new Date().toISOString().split('T')[0], payoutVacationDays: 0, severanceAmount: 0 });
    };

    const finalizeTermination = () => {
        const emp = employees.find(e => e.id === terminationModal.empId);
        if (!emp) return;

        const details: TerminationDetails = {
            date: terminationData.date || '',
            reason: terminationData.reason || 'RESIGNATION',
            noticeDate: terminationData.noticeDate,
            payoutVacationDays: terminationData.payoutVacationDays,
            severanceAmount: terminationData.severanceAmount,
            p45Generated: true
        };

        const updatedEmp: Employee = {
            ...emp,
            status: 'TERMINATED',
            terminationDetails: details
        };

        onUpdateEmployee(updatedEmp);
        auditService.log(currentUser, 'UPDATE', 'Employee', `Terminated ${emp.firstName} ${emp.lastName}. Reason: ${details.reason}`);
        generateP45CSV(companyData, payRunHistory, updatedEmp);
        toast.success("Employee terminated and P45 generated.");
        setTerminationModal({ isOpen: false, empId: '', step: 1 });
    };

    const initiateDelete = (empId: string) => {
        setDeleteWarning({ isOpen: true, empId });
    };

    const confirmDelete = () => {
        const emp = employees.find(e => e.id === deleteWarning.empId);
        if (!emp) return;

        // Check if employee has ANY payroll history
        const hasHistory = payRunHistory.some(run =>
            run.lineItems.some(line => line.employeeId === emp.id)
        );

        if (hasHistory) {
            const archivedEmp: Employee = { ...emp, status: 'ARCHIVED' };
            onUpdateEmployee(archivedEmp);
            auditService.log(currentUser, 'ARCHIVE', 'Employee', `Archived employee: ${emp.firstName} ${emp.lastName} (Has Payment History)`);
            toast.success("Employee archived (Retained for compliance).");
        } else {
            if (onDeleteEmployee) {
                onDeleteEmployee(emp.id);
            } else {
                // Fallback if prop not provided
                const archivedEmp: Employee = { ...emp, status: 'ARCHIVED' };
                onUpdateEmployee(archivedEmp);
            }
            auditService.log(currentUser, 'DELETE', 'Employee', `Permanently deleted employee record: ${emp.firstName} ${emp.lastName}`);
            toast.success("Employee permanently deleted.");
        }

        setDeleteWarning({ isOpen: false, empId: '' });
    };

    const handleRevokeInvite = (empId: string, email: string) => {
        setRevokeWarning({ isOpen: true, empId, email });
    };

    const confirmRevokeInvite = () => {
        const emp = employees.find(e => e.id === revokeWarning.empId);
        if (!emp) return;

        // Delete the employee if they haven't completed onboarding
        if (onDeleteEmployee) {
            onDeleteEmployee(emp.id);
        }

        auditService.log(currentUser, 'DELETE', 'Employee', `Revoked invitation for ${emp.firstName} ${emp.lastName} (${revokeWarning.email})`);
        toast.success(`Invitation revoked for ${revokeWarning.email}`);
        setRevokeWarning({ isOpen: false, empId: '', email: '' });
    };

    const handleImportCSV = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        Papa.parse(file, {
            header: true,
            skipEmptyLines: true,
            complete: (results: Papa.ParseResult<any>) => {
                if (results.errors.length > 0) {
                    console.error("CSV Errors:", results.errors);
                    toast.error("Error parsing CSV file.");
                    return;
                }

                const rows = results.data;
                if (rows.length === 0) {
                    toast.error("CSV file is empty.");
                    return;
                }

                if (!checkPlanLimit(rows.length)) {
                    e.target.value = '';
                    return;
                }

                let count = 0;
                rows.forEach((row: any) => {
                    const email = row['Email']?.trim();
                    if (!email) return;

                    // Match department name to department ID
                    const departmentName = row['Department']?.trim() || '';
                    let departmentId = '';
                    if (departmentName) {
                        const matchedDept = departments.find(
                            d => d.name.toLowerCase() === departmentName.toLowerCase()
                        );
                        departmentId = matchedDept?.id || '';
                        if (!matchedDept && departmentName) {
                            console.warn(`Department "${departmentName}" not found. Employee will be imported without department assignment.`);
                        }
                    }

                    const newEmp: Employee = {
                        id: generateUUID(),
                        firstName: row['First Name'] || 'Unknown',
                        lastName: row['Last Name'] || '',
                        email: email,
                        trn: row['TRN'] || '',
                        nis: '',
                        grossSalary: parseFloat(row['Gross Salary']) || 0,
                        payType: PayType.SALARIED,
                        payFrequency: PayFrequency.MONTHLY,
                        role: Role.EMPLOYEE,
                        status: 'ACTIVE',
                        hireDate: new Date().toISOString().split('T')[0],
                        allowances: [],
                        deductions: [],
                        department: departmentId,
                        jobTitle: row['Job Title']?.trim() || ''
                    };
                    onAddEmployee(newEmp);
                    count++;
                });

                auditService.log(currentUser, 'CREATE', 'Employee', `Bulk imported ${count} employees via CSV`);
                toast.success(`Successfully imported ${count} employees.`);
                e.target.value = '';
            },
            error: (err: any) => {
                console.error(err);
                toast.error("Failed to read file.");
            }
        });
    };

    const handleDownloadTemplate = () => {
        const headers = "First Name,Last Name,Email,TRN,Gross Salary,Role,Department,Job Title";
        const sample = "John,Doe,john.doe@example.com,123-456-789,250000,Employee,Operations,Driver";
        downloadFile('Employee_Import_Template.csv', `${headers}\n${sample}`, 'text/csv');
    };

    const openVerifyModal = (emp: Employee) => {
        setVerificationModal({ isOpen: true, employee: emp });
    };

    const handleApproveVerification = async () => {
        if (!verificationModal.employee) return;

        const now = new Date().toISOString();
        const updated: Employee = {
            ...verificationModal.employee,
            status: 'ACTIVE',
            documentsVerifiedAt: now,
            documentsVerifiedBy: currentUser?.id
        };

        onUpdateEmployee(updated);
        auditService.log(currentUser, 'VERIFY', 'Employee', `Verified documents for ${updated.firstName} ${updated.lastName}`);
        toast.success(`${updated.firstName} ${updated.lastName} has been verified and activated!`);
        setVerificationModal({ isOpen: false, employee: null });
    };

    const handleRejectVerification = async () => {
        if (!verificationModal.employee) return;

        const emp = verificationModal.employee;
        // Could add rejection reason modal here
        toast.info(`Verification rejected for ${emp.firstName} ${emp.lastName}. They will need to re-upload documents.`);
        setVerificationModal({ isOpen: false, employee: null });
    };

    const handleUpdateField = (field: keyof Employee, value: any) => {
        if (!selectedEmployee) return;
        setSelectedEmployee({ ...selectedEmployee, [field]: value });
    };

    const handleUpdateBank = (field: keyof BankAccount, value: any) => {
        if (!selectedEmployee) return;
        setSelectedEmployee({
            ...selectedEmployee,
            bankDetails: { ...selectedEmployee.bankDetails, [field]: value } as BankAccount
        });
    };

    const saveProfileChanges = () => {
        if (selectedEmployee) {
            // Validation for mandatory fields
            if (!selectedEmployee.trn || selectedEmployee.trn.trim() === '') {
                toast.error('TRN is required. Enter "PENDING" if unavailable.');
                return;
            }
            if (!isValidTRN(selectedEmployee.trn)) {
                toast.error("Invalid TRN format. Must be 9 digits or 'PENDING'");
                return;
            }
            if (!selectedEmployee.nis || selectedEmployee.nis.trim() === '') {
                toast.error('NIS is required. Enter "PENDING" if unavailable.');
                return;
            }
            if (!isValidNIS(selectedEmployee.nis)) {
                toast.error("Invalid NIS format. Must be Letter + 6 Digits or 'PENDING'");
                return;
            }
            if (!selectedEmployee.bankDetails?.accountNumber || selectedEmployee.bankDetails.accountNumber.trim() === '') {
                toast.error('Bank Account Number is required. Enter "PENDING" if unavailable.');
                return;
            }

            const status = selectedEmployee.status === 'PENDING_VERIFICATION' ? 'ACTIVE' : selectedEmployee.status;

            // Normalize PENDING values
            const updated: Employee = {
                ...selectedEmployee,
                status,
                trn: selectedEmployee.trn.toUpperCase() === 'PENDING' ? 'PENDING' : formatTRN(selectedEmployee.trn),
                nis: selectedEmployee.nis.toUpperCase() === 'PENDING' ? 'PENDING' : selectedEmployee.nis.toUpperCase()
            };

            onUpdateEmployee(updated);
            auditService.log(currentUser, 'UPDATE', 'Employee', `Updated profile for ${updated.firstName} ${updated.lastName}`);

            if (selectedEmployee.status === 'PENDING_VERIFICATION') {
                toast.success('Employee verified and activated!');
            } else {
                toast.success('Profile updated successfully!');
            }
            setSelectedEmployee(null);
        }
    };

    const getDeptName = (id?: string) => {
        if (!id) return '-';
        const dept = departments.find(d => d.id === id);
        return dept ? dept.name : (id.startsWith('dept-') ? 'Unknown Department' : id);
    };

    // Count employees pending verification
    const pendingVerificationCount = employees.filter(e => e.status === 'PENDING_VERIFICATION').length;

    return (
        <div className="space-y-6 relative">
            {/* Pending Verification Banner */}
            {pendingVerificationCount > 0 && (
                <div className="bg-purple-50 border-l-4 border-purple-400 p-4 rounded-r-lg shadow-sm">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center">
                            <Icons.Alert className="h-5 w-5 text-purple-400 mr-3" />
                            <div>
                                <p className="text-sm font-medium text-purple-800">
                                    {pendingVerificationCount} employee{pendingVerificationCount > 1 ? 's' : ''} awaiting document verification
                                </p>
                                <p className="text-xs text-purple-600 mt-1">
                                    Review uploaded documents and approve to activate their accounts
                                </p>
                            </div>
                        </div>
                        <button
                            onClick={() => setViewMode('onboarding')}
                            className="px-4 py-2 bg-purple-600 text-white text-sm font-medium rounded-lg hover:bg-purple-700"
                        >
                            Review Now
                        </button>
                    </div>
                </div>
            )}

            {/* Upgrade Modal */}
            {showUpgradeModal && (
                <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-fade-in">
                    <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl overflow-hidden border-t-8 border-jam-orange">
                        <div className="p-8">
                            <div className="w-16 h-16 bg-orange-100 rounded-full flex items-center justify-center mx-auto mb-4 text-jam-orange">
                                <Icons.Star className="w-8 h-8 fill-current" />
                            </div>
                            <h3 className="text-2xl font-bold text-gray-900 mb-2 text-center">Plan Limit Reached</h3>
                            <p className="text-gray-600 mb-6 text-center">
                                You have reached the <strong>{getPlanLimit(companyData?.plan)} employee limit</strong> for your current plan.
                            </p>

                            {/* Available Plans */}
                            {plans.length > 0 && (
                                <div className="mb-6">
                                    <h4 className="text-sm font-semibold text-gray-700 mb-3 text-center">Available Plans</h4>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        {plans.filter(p => p.isActive && p.name !== companyData?.plan).map(plan => {
                                            const price = plan.priceConfig.type === 'free' ? 0 :
                                                plan.priceConfig.type === 'base' ? (plan.priceConfig.baseFee || 0) :
                                                    plan.priceConfig.monthly;
                                            const priceLabel = plan.priceConfig.type === 'free' ? 'Free' :
                                                plan.priceConfig.type === 'per_emp' ? `$${price}/emp` :
                                                    plan.priceConfig.type === 'base' ? `$${price}+ base` :
                                                        `$${price}/mo`;

                                            return (
                                                <div key={plan.id} className={`border-2 rounded-lg p-4 ${plan.highlight ? 'border-jam-orange bg-orange-50' : 'border-gray-200'}`}>
                                                    <h5 className="font-bold text-lg text-gray-900">{plan.name}</h5>
                                                    <p className="text-2xl font-bold text-jam-orange my-2">{priceLabel}</p>
                                                    <p className="text-xs text-gray-600 mb-3">{plan.description}</p>
                                                    <p className="text-xs font-medium text-gray-700">Limit: <span className="text-jam-orange">{plan.limit} employees</span></p>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            )}

                            <div className="space-y-3">
                                <button
                                    onClick={() => {
                                        setShowUpgradeModal(false);
                                        if (onNavigate) {
                                            onNavigate('settings');
                                        } else {
                                            toast.info("Please navigate to Settings > Billing to upgrade");
                                        }
                                    }}
                                    className="w-full bg-jam-black text-white font-bold py-3 rounded-lg hover:bg-gray-800 transition-colors"
                                >
                                    Upgrade Now
                                </button>
                                <button onClick={() => setShowUpgradeModal(false)} className="w-full text-gray-500 font-medium py-2 rounded-lg hover:bg-gray-50">Maybe Later</button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Edit Employee Modal */}
            {selectedEmployee && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
                    <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl overflow-hidden animate-scale-in flex flex-col max-h-[90vh]">
                        <div className="p-6 border-b border-gray-200 bg-gray-50 flex justify-between items-center shrink-0">
                            <div className="flex items-center space-x-3">
                                <div className="h-10 w-10 rounded-full bg-jam-yellow flex items-center justify-center font-bold text-jam-black">
                                    {selectedEmployee.firstName[0]}{selectedEmployee.lastName[0]}
                                </div>
                                <div>
                                    <h3 className="text-lg font-bold text-gray-900">{selectedEmployee.firstName} {selectedEmployee.lastName}</h3>
                                    {selectedEmployee.employeeId ? (
                                        <p className="text-xs text-gray-500">Employee ID: {selectedEmployee.employeeId}</p>
                                    ) : (
                                        <p className="text-xs text-gray-400 italic">No Employee ID set</p>
                                    )}
                                </div>
                            </div>
                            <button onClick={() => {
                                setSelectedEmployee(null);
                                setIsAddingNewDept(false);
                                setNewInlineDeptName('');
                            }} className="text-gray-400 hover:text-gray-600"><Icons.Close className="w-6 h-6" /></button>
                        </div>

                        <div className="border-b border-gray-200 px-6 shrink-0 bg-white">
                            <nav className="-mb-px flex space-x-8">
                                {['profile', 'financial', 'banking'].map((tab) => (
                                    <button
                                        key={tab}
                                        onClick={() => setEditTab(tab as any)}
                                        className={`whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm capitalize ${editTab === tab ? 'border-jam-orange text-jam-black' : 'border-transparent text-gray-500 hover:text-gray-700'
                                            }`}
                                    >
                                        {tab}
                                    </button>
                                ))}
                            </nav>
                        </div>

                        <div className="p-6 overflow-y-auto">
                            {editTab === 'profile' && (
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                    <div><label className="block text-xs font-bold text-gray-500 uppercase mb-1">First Name</label><input className="w-full border rounded p-2" value={selectedEmployee.firstName} onChange={e => handleUpdateField('firstName', e.target.value)} /></div>
                                    <div><label className="block text-xs font-bold text-gray-500 uppercase mb-1">Last Name</label><input className="w-full border rounded p-2" value={selectedEmployee.lastName} onChange={e => handleUpdateField('lastName', e.target.value)} /></div>
                                    <div><label className="block text-xs font-bold text-gray-500 uppercase mb-1">Employee ID</label><input type="text" placeholder="e.g., EMP001, 12345" className="w-full border rounded p-2" value={selectedEmployee.employeeId || ''} onChange={e => handleUpdateField('employeeId', e.target.value)} /></div>
                                    <div><label className="block text-xs font-bold text-gray-500 uppercase mb-1">Email</label><input className="w-full border rounded p-2" value={selectedEmployee.email} onChange={e => handleUpdateField('email', e.target.value)} /></div>
                                    <div><label className="block text-xs font-bold text-gray-500 uppercase mb-1">Job Title</label><input className="w-full border rounded p-2" value={selectedEmployee.jobTitle || ''} onChange={e => handleUpdateField('jobTitle', e.target.value)} /></div>
                                    <div>
                                        <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Department</label>
                                        {!isAddingNewDept ? (
                                            <div className="flex space-x-2">
                                                <select
                                                    className="w-full border rounded p-2"
                                                    value={selectedEmployee.department || ''}
                                                    onChange={e => {
                                                        if (e.target.value === 'ADD_NEW') {
                                                            setIsAddingNewDept(true);
                                                        } else {
                                                            handleUpdateField('department', e.target.value);
                                                        }
                                                    }}
                                                >
                                                    <option value="">Select Dept</option>
                                                    {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                                                    <option value="ADD_NEW" className="text-jam-orange font-bold">+ Add New Department</option>
                                                </select>
                                            </div>
                                        ) : (
                                            <div className="flex space-x-2">
                                                <input
                                                    autoFocus
                                                    className="flex-1 border rounded p-2"
                                                    placeholder="Dept Name"
                                                    value={newInlineDeptName}
                                                    onChange={e => setNewInlineDeptName(e.target.value)}
                                                    onKeyDown={e => e.key === 'Enter' && handleInlineAddDept()}
                                                />
                                                <button onClick={handleInlineAddDept} className="bg-jam-black text-white px-3 rounded text-sm font-bold">Add</button>
                                                <button onClick={() => setIsAddingNewDept(false)} className="text-gray-400">Cancel</button>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )}
                            {editTab === 'financial' && (
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                    <div>
                                        <div className="flex items-center mb-1">
                                            <label className="block text-xs font-bold text-gray-500 uppercase">TRN</label>
                                            <div className="ml-1.5 group relative">
                                                <Icons.Alert className="w-3 h-3 text-gray-400 cursor-help" />
                                                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:block w-48 p-2 bg-gray-900 text-white text-[10px] rounded shadow-xl z-50 text-center capitalize">
                                                    Enter "PENDING" if unknown.
                                                    <div className="absolute top-full left-1/2 -translate-x-1/2 border-8 border-transparent border-t-gray-900"></div>
                                                </div>
                                            </div>
                                        </div>
                                        <input className="w-full border rounded p-2" value={selectedEmployee.trn} onChange={e => handleUpdateField('trn', e.target.value)} />
                                    </div>
                                    <div>
                                        <div className="flex items-center mb-1">
                                            <label className="block text-xs font-bold text-gray-500 uppercase">NIS</label>
                                            <div className="ml-1.5 group relative">
                                                <Icons.Alert className="w-3 h-3 text-gray-400 cursor-help" />
                                                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:block w-48 p-2 bg-gray-900 text-white text-[10px] rounded shadow-xl z-50 text-center capitalize">
                                                    Enter "PENDING" if unknown.
                                                    <div className="absolute top-full left-1/2 -translate-x-1/2 border-8 border-transparent border-t-gray-900"></div>
                                                </div>
                                            </div>
                                        </div>
                                        <input className="w-full border rounded p-2" value={selectedEmployee.nis} onChange={e => handleUpdateField('nis', e.target.value)} />
                                    </div>
                                    <div><label className="block text-xs font-bold text-gray-500 uppercase mb-1">Gross Salary</label><input type="number" className="w-full border rounded p-2" value={selectedEmployee.grossSalary} onChange={e => handleUpdateField('grossSalary', parseFloat(e.target.value))} /></div>
                                    <div>
                                        <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Pay Frequency</label>
                                        <select className="w-full border rounded p-2" value={selectedEmployee.payFrequency} onChange={e => handleUpdateField('payFrequency', e.target.value)}>
                                            <option value={PayFrequency.MONTHLY}>Monthly</option>
                                            <option value={PayFrequency.FORTNIGHTLY}>Fortnightly</option>
                                            <option value={PayFrequency.WEEKLY}>Weekly</option>
                                        </select>
                                    </div>
                                </div>
                            )}
                            {editTab === 'banking' && (
                                <div className="space-y-4">
                                    <div>
                                        <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Bank Name</label>
                                        <select className="w-full border rounded p-2" value={selectedEmployee.bankDetails?.bankName} onChange={e => handleUpdateBank('bankName', e.target.value)}>
                                            <option value="NCB">NCB</option>
                                            <option value="BNS">Scotiabank</option>
                                            <option value="JN">JN Bank</option>
                                            <option value="SAGICOR">Sagicor</option>
                                        </select>
                                    </div>
                                    <div>
                                        <div className="flex items-center mb-1">
                                            <label className="block text-xs font-bold text-gray-500 uppercase">Account Number</label>
                                            <div className="ml-1.5 group relative">
                                                <Icons.Alert className="w-3 h-3 text-gray-400 cursor-help" />
                                                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:block w-48 p-2 bg-gray-900 text-white text-[10px] rounded shadow-xl z-50 text-center capitalize">
                                                    Enter "PENDING" if unknown.
                                                    <div className="absolute top-full left-1/2 -translate-x-1/2 border-8 border-transparent border-t-gray-900"></div>
                                                </div>
                                            </div>
                                        </div>
                                        <input className="w-full border rounded p-2" value={selectedEmployee.bankDetails?.accountNumber} onChange={e => handleUpdateBank('accountNumber', e.target.value)} />
                                    </div>
                                    <div><label className="block text-xs font-bold text-gray-500 uppercase mb-1">Branch Code (Optional)</label><input className="w-full border rounded p-2" value={selectedEmployee.bankDetails?.branchCode || ''} onChange={e => handleUpdateBank('branchCode', e.target.value)} /></div>
                                </div>
                            )}
                        </div>

                        <div className="p-6 border-t border-gray-100 bg-gray-50 flex justify-end space-x-3 shrink-0">
                            <button onClick={() => {
                                setSelectedEmployee(null);
                                setIsAddingNewDept(false);
                                setNewInlineDeptName('');
                            }} className="px-4 py-2 text-gray-600 hover:bg-gray-200 rounded-lg">Cancel</button>
                            <button onClick={saveProfileChanges} className="px-6 py-2 bg-jam-black text-white font-bold rounded-lg hover:bg-gray-800">Save Changes</button>
                        </div>
                    </div>
                </div>
            )}

            {/* Termination Modal */}
            {terminationModal.isOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
                    <div className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden animate-fade-in">
                        <div className="p-6 border-b border-gray-100 bg-gray-50 flex justify-between items-center">
                            <h3 className="text-xl font-bold text-red-600">Terminate Employee</h3>
                            <button onClick={() => setTerminationModal({ ...terminationModal, isOpen: false })} className="text-gray-400 hover:text-gray-600">
                                <Icons.Close className="w-6 h-6" />
                            </button>
                        </div>
                        <div className="p-6 space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Termination Date</label>
                                <input
                                    type="date"
                                    className="w-full border border-gray-300 rounded-lg p-2"
                                    value={terminationData.date}
                                    onChange={e => setTerminationData({ ...terminationData, date: e.target.value })}
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Reason</label>
                                <select
                                    className="w-full border border-gray-300 rounded-lg p-2"
                                    value={terminationData.reason}
                                    onChange={e => setTerminationData({ ...terminationData, reason: e.target.value as any })}
                                >
                                    <option value="RESIGNATION">Resignation</option>
                                    <option value="REDUNDANCY">Redundancy</option>
                                    <option value="DISMISSAL">Dismissal</option>
                                    <option value="RETIREMENT">Retirement</option>
                                    <option value="OTHER">Other</option>
                                </select>
                            </div>
                            <div className="pt-4 flex justify-end space-x-3">
                                <button onClick={() => setTerminationModal({ ...terminationModal, isOpen: false })} className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg">Cancel</button>
                                <button onClick={finalizeTermination} className="bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700 font-bold">Confirm Termination</button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Delete Warning Modal */}
            {deleteWarning.isOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
                    <div className="bg-white rounded-xl shadow-xl w-full max-w-sm overflow-hidden animate-fade-in p-6 text-center">
                        <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4 text-red-600">
                            <Icons.Alert className="w-6 h-6" />
                        </div>
                        <h3 className="text-lg font-bold text-gray-900 mb-2">Delete Employee?</h3>
                        <p className="text-sm text-gray-500 mb-6">
                            This will move the employee to the archive. They will no longer appear in payroll runs.
                        </p>
                        <div className="flex justify-center space-x-3">
                            <button onClick={() => setDeleteWarning({ isOpen: false, empId: '' })} className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50">Cancel</button>
                            <button onClick={confirmDelete} className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 font-bold">Delete</button>
                        </div>
                    </div>
                </div>
            )}

            {/* Revoke Invite Warning Modal */}
            {revokeWarning.isOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
                    <div className="bg-white rounded-xl shadow-xl w-full max-w-sm overflow-hidden animate-fade-in p-6 text-center">
                        <div className="w-12 h-12 bg-yellow-100 rounded-full flex items-center justify-center mx-auto mb-4 text-yellow-600">
                            <Icons.Alert className="w-6 h-6" />
                        </div>
                        <h3 className="text-lg font-bold text-gray-900 mb-2">Revoke Invitation?</h3>
                        <p className="text-sm text-gray-500 mb-2">
                            This will cancel the invitation for:
                        </p>
                        <p className="text-sm font-medium text-gray-900 mb-6">{revokeWarning.email}</p>
                        <p className="text-xs text-gray-500 mb-6">
                            The employee will be removed and will not be able to complete onboarding with this invitation link.
                        </p>
                        <div className="flex justify-center space-x-3">
                            <button onClick={() => setRevokeWarning({ isOpen: false, empId: '', email: '' })} className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50">Cancel</button>
                            <button onClick={confirmRevokeInvite} className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 font-bold">Revoke Invitation</button>
                        </div>
                    </div>
                </div>
            )}

            {/* Add Employee Modal */}
            {isAddModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
                    <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl overflow-hidden animate-fade-in flex flex-col max-h-[90vh]">
                        <div className="p-6 border-b border-gray-100 bg-gray-50 flex justify-between items-center shrink-0">
                            <h3 className="text-xl font-bold text-gray-900">Add New Employee</h3>
                            <button onClick={() => {
                                setIsAddModalOpen(false);
                                setIsAddingNewDept(false);
                                setNewInlineDeptName('');
                            }} className="text-gray-400 hover:text-gray-600">
                                <Icons.Close className="w-6 h-6" />
                            </button>
                        </div>
                        <form onSubmit={onSubmitAdd} className="p-6 grid grid-cols-1 md:grid-cols-2 gap-6 overflow-y-auto">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">First Name</label>
                                <input required type="text" className="w-full border border-gray-300 rounded-lg p-2" value={addForm.firstName} onChange={e => setAddForm({ ...addForm, firstName: e.target.value })} />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Last Name</label>
                                <input required type="text" className="w-full border border-gray-300 rounded-lg p-2" value={addForm.lastName} onChange={e => setAddForm({ ...addForm, lastName: e.target.value })} />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Employee ID (Optional)</label>
                                <input type="text" placeholder="e.g., EMP001, 12345" className="w-full border border-gray-300 rounded-lg p-2" value={addForm.employeeId} onChange={e => setAddForm({ ...addForm, employeeId: e.target.value })} />
                                <p className="text-xs text-gray-500 mt-1">Custom identifier for this employee</p>
                            </div>
                            <div className="md:col-span-1">
                                <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                                <input required type="email" className="w-full border border-gray-300 rounded-lg p-2" value={addForm.email} onChange={e => setAddForm({ ...addForm, email: e.target.value })} />
                            </div>
                            <div>
                                <div className="flex items-center mb-1">
                                    <label className="block text-sm font-medium text-gray-700">TRN (9 Digits)</label>
                                    <div className="ml-1.5 group relative">
                                        <Icons.Alert className="w-3.5 h-3.5 text-gray-400 cursor-help" />
                                        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:block w-48 p-2 bg-gray-900 text-white text-[10px] rounded shadow-xl z-50 text-center">
                                            Required for all employees. Enter "PENDING" if currently unknown.
                                            <div className="absolute top-full left-1/2 -translate-x-1/2 border-8 border-transparent border-t-gray-900"></div>
                                        </div>
                                    </div>
                                </div>
                                <input
                                    required
                                    type="text"
                                    placeholder="123-456-789 or PENDING"
                                    className={`w-full border rounded-lg p-2 ${!isValidTRN(addForm.trn) && addForm.trn && addForm.trn.toUpperCase() !== 'PENDING' ? 'border-red-500' : 'border-gray-300'}`}
                                    value={addForm.trn}
                                    onChange={e => setAddForm({ ...addForm, trn: e.target.value })}
                                />
                            </div>
                            <div>
                                <div className="flex items-center mb-1">
                                    <label className="block text-sm font-medium text-gray-700">NIS</label>
                                    <div className="ml-1.5 group relative">
                                        <Icons.Alert className="w-3.5 h-3.5 text-gray-400 cursor-help" />
                                        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:block w-48 p-2 bg-gray-900 text-white text-[10px] rounded shadow-xl z-50 text-center">
                                            National Insurance Scheme number. Enter "PENDING" if currently unknown.
                                            <div className="absolute top-full left-1/2 -translate-x-1/2 border-8 border-transparent border-t-gray-900"></div>
                                        </div>
                                    </div>
                                </div>
                                <input
                                    required
                                    type="text"
                                    placeholder="A123456 or PENDING"
                                    className={`w-full border rounded-lg p-2 ${!isValidNIS(addForm.nis) && addForm.nis && addForm.nis.toUpperCase() !== 'PENDING' ? 'border-red-500' : 'border-gray-300'}`}
                                    value={addForm.nis}
                                    onChange={e => setAddForm({ ...addForm, nis: e.target.value })}
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Department</label>
                                {!isAddingNewDept ? (
                                    <select
                                        className="w-full border border-gray-300 rounded-lg p-2"
                                        value={addForm.department}
                                        onChange={e => {
                                            if (e.target.value === 'ADD_NEW') {
                                                setIsAddingNewDept(true);
                                            } else {
                                                setAddForm({ ...addForm, department: e.target.value });
                                            }
                                        }}
                                    >
                                        <option value="">Select Dept</option>
                                        {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                                        <option value="ADD_NEW" className="text-jam-orange font-bold">+ Add New Department</option>
                                    </select>
                                ) : (
                                    <div className="flex space-x-2">
                                        <input
                                            autoFocus
                                            className="flex-1 border border-gray-300 rounded-lg p-2"
                                            placeholder="Dept Name"
                                            value={newInlineDeptName}
                                            onChange={e => setNewInlineDeptName(e.target.value)}
                                            onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), handleInlineAddDept())}
                                        />
                                        <button type="button" onClick={handleInlineAddDept} className="bg-jam-black text-white px-3 rounded text-sm font-bold">Add</button>
                                        <button type="button" onClick={() => setIsAddingNewDept(false)} className="text-gray-400">Cancel</button>
                                    </div>
                                )}
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Job Title</label>
                                <input type="text" className="w-full border border-gray-300 rounded-lg p-2" value={addForm.jobTitle} onChange={e => setAddForm({ ...addForm, jobTitle: e.target.value })} />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Bank</label>
                                <select className="w-full border border-gray-300 rounded-lg p-2" value={addForm.bankName} onChange={e => setAddForm({ ...addForm, bankName: e.target.value })}>
                                    <option value="NCB">NCB</option>
                                    <option value="BNS">BNS</option>
                                </select>
                            </div>
                            <div>
                                <div className="flex items-center mb-1">
                                    <label className="block text-sm font-medium text-gray-700">Account #</label>
                                    <div className="ml-1.5 group relative">
                                        <Icons.Alert className="w-3.5 h-3.5 text-gray-400 cursor-help" />
                                        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:block w-48 p-2 bg-gray-900 text-white text-[10px] rounded shadow-xl z-50 text-center">
                                            Required for payments. Enter "PENDING" if unknown.
                                            <div className="absolute top-full left-1/2 -translate-x-1/2 border-8 border-transparent border-t-gray-900"></div>
                                        </div>
                                    </div>
                                </div>
                                <input required type="text" placeholder="Account number or PENDING" className="w-full border border-gray-300 rounded-lg p-2" value={addForm.accountNumber} onChange={e => setAddForm({ ...addForm, accountNumber: e.target.value })} />
                            </div>

                            <div className="md:col-span-2 pt-4">
                                <button type="submit" className="w-full bg-jam-black text-white font-bold py-3 rounded-lg hover:bg-gray-800">Create Employee</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Invite Modal */}
            {isInviteModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
                    <div className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden animate-fade-in">
                        <div className="p-6 border-b border-gray-100 bg-gray-50 flex justify-between items-center">
                            <h3 className="text-lg font-bold text-gray-900">Invite Employee</h3>
                            <button onClick={() => setIsInviteModalOpen(false)} className="text-gray-400 hover:text-gray-600"><Icons.Close className="w-5 h-5" /></button>
                        </div>
                        <form onSubmit={handleInvite} className="p-6 space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Email Address</label>
                                <input required type="email" className="w-full border border-gray-300 rounded-lg p-2" value={inviteData.email} onChange={e => setInviteData({ ...inviteData, email: e.target.value })} />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">First Name</label>
                                    <input required type="text" className="w-full border border-gray-300 rounded-lg p-2" value={inviteData.firstName} onChange={e => setInviteData({ ...inviteData, firstName: e.target.value })} />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Last Name</label>
                                    <input required type="text" className="w-full border border-gray-300 rounded-lg p-2" value={inviteData.lastName} onChange={e => setInviteData({ ...inviteData, lastName: e.target.value })} />
                                </div>
                            </div>
                            <button type="submit" disabled={isSendingInvite} className="w-full bg-jam-orange text-jam-black font-bold py-3 rounded-lg hover:bg-yellow-500 disabled:opacity-50">
                                {isSendingInvite ? 'Sending...' : 'Send Invitation'}
                            </button>
                        </form>
                    </div>
                </div>
            )}

            {/* Main List View */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center">
                <div>
                    <h2 className="text-3xl font-bold text-gray-900">Employees</h2>
                    <p className="text-gray-500 mt-1">Manage your workforce, view profiles, and update salaries.</p>
                </div>
                <div className="flex space-x-3 mt-4 md:mt-0">
                    <div className="relative">
                        <input
                            type="file"
                            accept=".csv"
                            ref={fileInputRef}
                            onChange={handleImportCSV}
                            className="hidden"
                        />
                        <button
                            onClick={() => fileInputRef.current?.click()}
                            className="bg-white border border-gray-300 text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-50 flex items-center shadow-sm"
                        >
                            <Icons.Upload className="w-4 h-4 mr-2" /> Import CSV
                        </button>
                    </div>
                    <button
                        onClick={handleDownloadTemplate}
                        className="bg-white border border-gray-300 text-gray-700 px-3 py-2 rounded-lg hover:bg-gray-50 shadow-sm"
                        title="Download CSV Template"
                    >
                        <Icons.Download className="w-4 h-4" />
                    </button>
                    <button
                        onClick={handleAddClick}
                        className="bg-jam-black text-white px-4 py-2 rounded-lg hover:bg-gray-800 flex items-center shadow-lg transform hover:-translate-y-0.5 transition-all"
                    >
                        <Icons.Plus className="w-4 h-4 mr-2" />
                        Add Employee
                    </button>
                    <button
                        onClick={handleInviteClick}
                        className="bg-jam-orange text-jam-black px-4 py-2 rounded-lg hover:bg-yellow-500 flex items-center shadow-lg transform hover:-translate-y-0.5 transition-all"
                    >
                        <Icons.Mail className="w-4 h-4 mr-2" />
                        Invite
                    </button>
                </div>
            </div>

            <div className="border-b border-gray-200 mt-4">
                <nav className="-mb-px flex space-x-8">
                    <button
                        onClick={() => setViewMode('active')}
                        className={`whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm transition-colors ${viewMode === 'active'
                            ? 'border-jam-orange text-jam-black'
                            : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                            }`}
                    >
                        Active Workforce
                    </button>
                    <button
                        onClick={() => setViewMode('onboarding')}
                        className={`whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm transition-colors ${viewMode === 'onboarding'
                            ? 'border-jam-orange text-jam-black'
                            : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                            }`}
                    >
                        Onboarding / Pending
                    </button>
                    <button
                        onClick={() => setViewMode('archived')}
                        className={`whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm transition-colors ${viewMode === 'archived'
                            ? 'border-jam-orange text-jam-black'
                            : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                            }`}
                    >
                        Archived
                    </button>
                </nav>
            </div>

            <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-200 flex justify-between items-center">
                <div className="relative w-full max-w-md">
                    <Icons.Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
                    <input
                        type="text"
                        placeholder="Search by name or email..."
                        className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-jam-orange focus:border-transparent"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </div>
                <div className="text-sm text-gray-500">
                    Showing <span className="font-bold text-gray-900">{filteredEmployees.length}</span> employees
                </div>
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                <table className="w-full text-left border-collapse">
                    <thead>
                        <tr className="bg-gray-50 border-b border-gray-200">
                            <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Employee</th>
                            <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Role</th>
                            <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Department</th>
                            <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Status</th>
                            <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider text-right">Actions</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                        {filteredEmployees.map((emp) => {
                            const isIncomplete = !emp.trn || emp.trn.trim() === '' || emp.trn.toUpperCase() === 'PENDING' ||
                                !emp.nis || emp.nis.trim() === '' || emp.nis.toUpperCase() === 'PENDING' ||
                                !emp.bankDetails?.accountNumber || emp.bankDetails.accountNumber.trim() === '' || emp.bankDetails.accountNumber.toUpperCase() === 'PENDING';
                            return (
                                <tr key={emp.id} className={`transition-colors group ${isIncomplete ? 'bg-amber-50/50 hover:bg-amber-50' : 'hover:bg-gray-50'}`}>
                                    <td className="px-6 py-4">
                                        <div className="flex items-center">
                                            <div className="h-10 w-10 rounded-full bg-jam-yellow text-jam-black flex items-center justify-center font-bold">
                                                {emp.firstName[0]}{emp.lastName[0]}
                                            </div>
                                            <div className="ml-4">
                                                <div className="text-sm font-medium text-gray-900">{emp.firstName} {emp.lastName}</div>
                                                <div className="text-xs text-gray-500">{emp.email}</div>
                                            </div>
                                        </div>
                                    </td>
                                    <td className="px-6 py-4">
                                        <span className="text-sm text-gray-600 capitalize">{emp.role}</span>
                                    </td>
                                    <td className="px-6 py-4">
                                        <span className="text-sm text-gray-600">{getDeptName(emp.department)}</span>
                                    </td>
                                    <td className="px-6 py-4">
                                        {isIncomplete ? (
                                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-100 text-amber-800 border border-amber-200">
                                                <Icons.Alert className="w-3 h-3 mr-1" />
                                                INCOMPLETE
                                            </span>
                                        ) : (
                                            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${emp.status === 'ACTIVE' ? 'bg-green-100 text-green-800' :
                                                emp.status === 'TERMINATED' ? 'bg-red-100 text-red-800' :
                                                    emp.status === 'ARCHIVED' ? 'bg-gray-200 text-gray-800' :
                                                        emp.status === 'PENDING_VERIFICATION' ? 'bg-purple-100 text-purple-800' : 'bg-gray-100 text-gray-800'
                                                }`}>
                                                {emp.status.replace('_', ' ')}
                                            </span>
                                        )}
                                    </td>
                                    <td className="px-6 py-4 text-right text-sm font-medium">
                                        {emp.status === 'PENDING_ONBOARDING' ? (
                                            <div className="flex justify-end space-x-2">
                                                <button
                                                    onClick={() => handleResendInvite(emp)}
                                                    disabled={isSendingInvite}
                                                    className="bg-jam-orange text-jam-black px-2 py-1.5 rounded text-xs hover:bg-yellow-500 shadow-sm flex items-center"
                                                    title="Resend Invitation Email"
                                                >
                                                    <Icons.Mail className="w-3 h-3 mr-1" />
                                                    Resend
                                                </button>
                                                {onSimulateOnboarding && (
                                                    <button
                                                        onClick={() => onSimulateOnboarding(emp)}
                                                        className="text-jam-orange hover:text-yellow-600 text-xs border border-jam-orange px-2 py-1 rounded"
                                                    >
                                                        Simulate Link
                                                    </button>
                                                )}
                                                <button
                                                    onClick={() => handleRevokeInvite(emp.id, emp.email)}
                                                    className="text-red-600 hover:text-red-700 hover:bg-red-50 p-1.5 rounded transition-colors"
                                                    title="Revoke invitation"
                                                >
                                                    <Icons.Close className="w-4 h-4" />
                                                </button>
                                            </div>
                                        ) : emp.status === 'PENDING_VERIFICATION' ? (
                                            <button
                                                onClick={() => openVerifyModal(emp)}
                                                className="bg-jam-black text-white px-3 py-1.5 rounded text-xs hover:bg-gray-800 shadow-sm"
                                            >
                                                Verify
                                            </button>
                                        ) : (
                                            <div className="flex justify-end items-center space-x-2">
                                                {emp.status !== 'ARCHIVED' && (
                                                    <button onClick={() => setSelectedEmployee(emp)} className="text-jam-orange hover:text-yellow-600 font-semibold">Edit</button>
                                                )}

                                                {/* Send Employee Portal Invite - Only for Pro/Reseller/Enterprise plans and ACTIVE employees */}
                                                {emp.status === 'ACTIVE' && (companyData?.plan === 'Pro' || companyData?.plan === 'Professional' || companyData?.plan === 'Reseller' || companyData?.plan === 'Enterprise') && (
                                                    <button
                                                        onClick={() => handleSendLoginInvite(emp)}
                                                        disabled={isSendingInvite}
                                                        className="text-blue-600 hover:text-blue-700 font-semibold disabled:opacity-50 flex items-center"
                                                        title="Send employee portal invite link"
                                                    >
                                                        <Icons.Mail className="w-3.5 h-3.5 mr-1" />
                                                        Send Invite
                                                    </button>
                                                )}

                                                {(emp.status === 'ACTIVE') && (
                                                    <button onClick={() => startTermination(emp.id)} className="text-gray-400 hover:text-red-500" title="Terminate Employee">
                                                        <Icons.UserCheck className="w-4 h-4" />
                                                    </button>
                                                )}

                                                <button onClick={() => initiateDelete(emp.id)} className="text-gray-400 hover:text-red-500" title="Delete Permanently">
                                                    <Icons.Trash className="w-4 h-4" />
                                                </button>
                                            </div>
                                        )}
                                    </td>
                                </tr>
                            );
                        })}
                        {filteredEmployees.length === 0 && (
                            <tr>
                                <td colSpan={5} className="px-6 py-8 text-center text-gray-500">No employees found matching your search.</td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>

            {/* Verification Modal */}
            {verificationModal.isOpen && verificationModal.employee && (
                <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-fade-in">
                    <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
                        {/* Header */}
                        <div className="bg-purple-600 text-white p-6">
                            <div className="flex justify-between items-start">
                                <div>
                                    <h2 className="text-2xl font-bold">Document Verification</h2>
                                    <p className="text-purple-100 mt-1">
                                        {verificationModal.employee.firstName} {verificationModal.employee.lastName}
                                    </p>
                                </div>
                                <button
                                    onClick={() => setVerificationModal({ isOpen: false, employee: null })}
                                    className="text-white hover:text-gray-200"
                                >
                                    <Icons.Close className="w-6 h-6" />
                                </button>
                            </div>
                        </div>

                        {/* Employee Info */}
                        <div className="p-6 border-b border-gray-200">
                            <div className="grid grid-cols-2 gap-4 text-sm">
                                <div>
                                    <label className="text-gray-500 text-xs">Email</label>
                                    <p className="font-medium">{verificationModal.employee.email}</p>
                                </div>
                                <div>
                                    <label className="text-gray-500 text-xs">Job Title</label>
                                    <p className="font-medium">{verificationModal.employee.jobTitle || 'N/A'}</p>
                                </div>
                                <div>
                                    <label className="text-gray-500 text-xs">Department</label>
                                    <p className="font-medium">{getDeptName(verificationModal.employee.department) || 'N/A'}</p>
                                </div>
                                <div>
                                    <label className="text-gray-500 text-xs">Hire Date</label>
                                    <p className="font-medium">{verificationModal.employee.hireDate}</p>
                                </div>
                            </div>
                        </div>

                        {/* Uploaded Documents Section */}
                        <div className="p-6">
                            <h3 className="text-lg font-bold text-gray-900 mb-4">Uploaded Documents</h3>

                            {verificationModal.employee.verificationDocuments && verificationModal.employee.verificationDocuments.length > 0 ? (
                                <div className="space-y-3">
                                    {verificationModal.employee.verificationDocuments.map((doc, idx) => (
                                        <div key={idx} className="flex items-center justify-between p-4 bg-gray-50 rounded-lg border border-gray-200">
                                            <div className="flex items-center space-x-3">
                                                <Icons.FileCheck className="w-5 h-5 text-purple-600" />
                                                <div>
                                                    <p className="text-sm font-medium text-gray-900">{doc.fileName}</p>
                                                    <p className="text-xs text-gray-500">Uploaded: {new Date(doc.uploadedAt).toLocaleDateString()}</p>
                                                </div>
                                            </div>
                                            <a
                                                href={doc.fileUrl}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="px-3 py-1.5 text-sm font-medium text-purple-600 hover:text-purple-700 hover:bg-purple-50 rounded-lg transition-colors"
                                            >
                                                View
                                            </a>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <div className="text-center py-8 bg-gray-50 rounded-lg">
                                    <Icons.Document className="w-12 h-12 text-gray-300 mx-auto mb-2" />
                                    <p className="text-sm text-gray-500">No documents uploaded yet</p>
                                    <p className="text-xs text-gray-400 mt-1">Employee needs to upload verification documents</p>
                                </div>
                            )}
                        </div>

                        {/* Action Buttons */}
                        <div className="p-6 bg-gray-50 border-t border-gray-200 flex justify-end space-x-3">
                            <button
                                onClick={() => setVerificationModal({ isOpen: false, employee: null })}
                                className="px-6 py-2.5 border border-gray-300 text-gray-700 rounded-lg font-medium hover:bg-gray-100 transition-colors"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleRejectVerification}
                                className="px-6 py-2.5 bg-red-600 text-white rounded-lg font-medium hover:bg-red-700 transition-colors"
                            >
                                Reject
                            </button>
                            <button
                                onClick={handleApproveVerification}
                                className="px-6 py-2.5 bg-purple-600 text-white rounded-lg font-medium hover:bg-purple-700 transition-colors"
                            >
                                Approve & Activate
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* New EmployeeManager Component */}
            {isEmployeeManagerOpen && (
                <EmployeeManager
                    employee={selectedEmployee || { id: '', firstName: '', lastName: '', email: '', trn: '', nis: '', grossSalary: 0, payType: PayType.SALARIED, payFrequency: PayFrequency.MONTHLY, role: Role.EMPLOYEE, status: 'ACTIVE', hireDate: '', bankDetails: { bankName: 'NCB', accountNumber: '', accountType: 'SAVINGS', currency: 'JMD' }, customDeductions: [] }}
                    isOpen={isEmployeeManagerOpen}
                    onClose={() => {
                        setIsEmployeeManagerOpen(false);
                        setSelectedEmployee(null);
                    }}
                    onSave={handleEmployeeManagerSave}
                />
            )}
        </div>
    );
};