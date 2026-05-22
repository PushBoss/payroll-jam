import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Asset, Employee, LeaveRequest, User, PerformanceReview } from '../../core/types';
import { storage } from '../../services/storage';
import { EmployeeService } from '../../services/EmployeeService';
import { supabase } from '../../services/supabaseClient';
import { getAuthRedirectUrl } from '../../utils/domainConfig';

export interface EmployeeAccountSetupState {
  employee: Employee;
  companyName: string;
  companyId?: string;
}

interface UseWorkforceDataArgs {
  user: User | null;
  isSupabaseMode: boolean;
  activeCompanyId?: string;
}

interface EmployeeMutationOptions {
  refreshAfterSave?: boolean;
}

export const useWorkforceData = ({ user, isSupabaseMode, activeCompanyId }: UseWorkforceDataArgs) => {
  const [employees, setEmployees] = useState<Employee[]>(() => storage.getEmployees() || []);
  const [leaveRequests, setLeaveRequests] = useState<LeaveRequest[]>(() => storage.getLeaveRequests() || []);
  const [assets, setAssets] = useState<Asset[]>(() => storage.getAssets() || []);
  const [reviews, setReviews] = useState<PerformanceReview[]>(() => storage.getReviews() || []);
  const [users, setUsers] = useState<User[]>(() => storage.getCompanyUsers() || []);
  const [employeeAccountSetup, setEmployeeAccountSetup] = useState<EmployeeAccountSetupState | null>(null);

  // Mount guards: skip the first effect run so we don't serialize data we just read from localStorage
  const didMountEmployees = useRef(false);
  const didMountLeave = useRef(false);
  const didMountAssets = useRef(false);
  const didMountReviews = useRef(false);
  const didMountUsers = useRef(false);

  useEffect(() => {
    if (!didMountEmployees.current) { didMountEmployees.current = true; return; }
    storage.saveEmployees(employees);
  }, [employees]);

  useEffect(() => {
    if (!didMountLeave.current) { didMountLeave.current = true; return; }
    storage.saveLeaveRequests(leaveRequests);
  }, [leaveRequests]);

  useEffect(() => {
    if (!didMountAssets.current) { didMountAssets.current = true; return; }
    storage.saveAssets(assets);
  }, [assets]);

  useEffect(() => {
    if (!didMountReviews.current) { didMountReviews.current = true; return; }
    storage.saveReviews(reviews);
  }, [reviews]);

  useEffect(() => {
    if (!didMountUsers.current) { didMountUsers.current = true; return; }
    storage.saveCompanyUsers(users);
  }, [users]);

  const handleAddEmployee = async (employee: Employee, options: EmployeeMutationOptions = {}): Promise<boolean> => {
    const { refreshAfterSave = false } = options;
    let previousEmployees: Employee[] | null = null;
    setEmployees((prev) => {
      previousEmployees = prev;
      return [...prev, employee];
    });

    const targetCompanyId = activeCompanyId || user?.companyId;
    if (!isSupabaseMode || !targetCompanyId) return true;

    try {
      await EmployeeService.saveEmployee(employee, targetCompanyId, 'insert');
      if (refreshAfterSave) {
        const freshEmployees = await EmployeeService.getEmployees(targetCompanyId);
        setEmployees(freshEmployees);
      }
      return true;
    } catch (error: any) {
      console.error('Failed to save employee to Supabase:', error);
      toast.error(error?.message || 'Failed to save employee to database.');
      if (previousEmployees) setEmployees(previousEmployees);
      return false;
    }
  };

  const handleUpdateEmployee = async (employee: Employee, options: EmployeeMutationOptions = {}): Promise<boolean> => {
    const { refreshAfterSave = false } = options;
    let previousEmployees: Employee[] | null = null;
    setEmployees((prev) => {
      previousEmployees = prev;
      return prev.map((existing) => (existing.id === employee.id ? employee : existing));
    });

    const targetCompanyId = activeCompanyId || user?.companyId;
    if (!isSupabaseMode || !targetCompanyId) return true;

    try {
      await EmployeeService.saveEmployee(employee, targetCompanyId, 'update');
      if (refreshAfterSave) {
        const freshEmployees = await EmployeeService.getEmployees(targetCompanyId);
        setEmployees(freshEmployees);
      }
      return true;
    } catch (error: any) {
      console.error('Failed to save employee to Supabase:', error);
      toast.error(error?.message || 'Failed to save employee to database.');
      if (previousEmployees) setEmployees(previousEmployees);
      return false;
    }
  };

  const handleDeleteEmployee = async (employeeId: string) => {
    setEmployees((prev) => prev.filter((employee) => employee.id !== employeeId));
    const targetCompanyId = activeCompanyId || user?.companyId;
    if (isSupabaseMode && targetCompanyId) {
      try {
        await EmployeeService.deleteEmployee(employeeId, targetCompanyId);
      } catch (error) {
        console.error('Error deleting employee from Supabase:', error);
        toast.error('Failed to delete employee from database.');
      }
    }
  };

  const handleSaveLeaveRequest = async (request: LeaveRequest) => {
    setLeaveRequests((prev) => [request, ...prev]);
    const targetCompanyId = activeCompanyId || user?.companyId;
    if (isSupabaseMode && targetCompanyId) {
      await EmployeeService.saveLeaveRequest(request, targetCompanyId);
    }
  };

  const handleUpdateLeaveStatus = async (id: string, status: 'APPROVED' | 'REJECTED', dates?: string[]) => {
    let target: LeaveRequest | undefined;
    setLeaveRequests(prev => {
      const updated = prev.map(r => r.id === id ? { ...r, status, approvedDates: dates } : r);
      target = updated.find(r => r.id === id);
      return updated;
    });

    const targetCompanyId = activeCompanyId || user?.companyId;
    if (isSupabaseMode && targetCompanyId && target) {
      await EmployeeService.saveLeaveRequest(target, targetCompanyId);
    }
  };

  const handleEmployeeAccountSetup = async (password: string) => {
    if (!employeeAccountSetup) return;

    try {
      const { employee, companyId } = employeeAccountSetup;
      let finalCompanyId = companyId || '';

      if (!finalCompanyId && isSupabaseMode && employee.onboardingToken) {
        const employeeResult = await EmployeeService.getEmployeeByToken(employee.onboardingToken, employee.email);
        if (employeeResult) {
          finalCompanyId = employeeResult.companyId;
        }
      }

      if (!finalCompanyId && (activeCompanyId || user?.companyId)) {
        finalCompanyId = activeCompanyId || user?.companyId || '';
      }

      if (!finalCompanyId) {
        toast.error('Unable to determine company. Please contact your employer.');
        return;
      }

      if (!isSupabaseMode || !supabase) {
        toast.error('Database not available. Please contact your employer.');
        return;
      }

      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: employee.email,
        password,
        options: {
          emailRedirectTo: getAuthRedirectUrl('/verify-email'),
        },
      });

      if (authError) throw authError;
      if (!authData.user) throw new Error('No user returned from signup');

      const newUser = {
        id: authData.user.id,
        email: employee.email,
        name: `${employee.firstName} ${employee.lastName}`,
        role: employee.role,
        companyId: finalCompanyId,
        isOnboarded: true,
      } as User;

      await EmployeeService.saveUser(newUser);
      const updatedEmployee = { ...employee, userId: newUser.id, isOnboarded: true } as Employee;
      await EmployeeService.saveEmployee(updatedEmployee, finalCompanyId, 'update');

      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: employee.email,
        password,
      });

      if (signInError) {
        toast.error('Account created but login failed. Please login manually.');
        setEmployeeAccountSetup(null);
        if (typeof window !== 'undefined') {
          window.history.replaceState({}, '', window.location.pathname);
        }
        return;
      }

      toast.success('Account created successfully! Welcome aboard!');
      setEmployeeAccountSetup(null);
      await new Promise((resolve) => setTimeout(resolve, 500));
      window.location.href = '/portal';
    } catch (error: any) {
      console.error('Error setting up employee account:', error);
      toast.error(error?.message || 'Failed to create account. Please try again or contact your employer.');
    }
  };

  return {
    employees,
    setEmployees,
    leaveRequests,
    setLeaveRequests,
    assets,
    setAssets,
    reviews,
    setReviews,
    users,
    setUsers,
    employeeAccountSetup,
    setEmployeeAccountSetup,
    handleAddEmployee,
    handleUpdateEmployee,
    handleDeleteEmployee,
    handleSaveLeaveRequest,
    handleUpdateLeaveStatus,
    handleEmployeeAccountSetup,
  };
};
