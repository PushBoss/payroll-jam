import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Asset, Employee, LeaveRequest, User, PerformanceReview } from '../../core/types';
import { storage } from '../../services/storage';
import { EmployeeService } from '../../services/EmployeeService';
import { supabase } from '../../services/supabaseClient';
import { TraceLogger } from '../../utils/employeeEditTrace';

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
  _trace?: TraceLogger;
}

const EMPLOYEE_SAVE_TIMEOUT_MS = 15000;

const toUserMessage = (msg: string | undefined, fallback: string): string =>
  msg?.includes('timed out') ? 'Employee update timed out. Please check your connection and try again.' : (msg || fallback);

const withEmployeeSaveTimeout = async <T,>(promise: Promise<T>, label: string, timeoutMs = EMPLOYEE_SAVE_TIMEOUT_MS): Promise<T> => {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => {
      window.setTimeout(() => reject(new Error(`${label} timed out. Please check your connection and try again.`)), timeoutMs);
    }),
  ]);
};

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
      await withEmployeeSaveTimeout(
        // Employee writes are permissioned server-side.  Do not attempt the
        // legacy browser schema-fallback first: it produces a sequence of
        // failed REST requests on installations with older employee columns.
        EmployeeService.saveEmployee(employee, targetCompanyId, 'insert', { useAdminHandler: true }),
        'Employee save'
      );
      if (refreshAfterSave) {
        const freshEmployees = await withEmployeeSaveTimeout(EmployeeService.getEmployees(targetCompanyId), 'Employee refresh');
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
    const { refreshAfterSave = false, _trace } = options;
    let previousEmployees: Employee[] | null = null;
    setEmployees((prev) => {
      previousEmployees = prev;
      return prev.map((existing) => (existing.id === employee.id ? employee : existing));
    });

    const targetCompanyId = activeCompanyId || user?.companyId;
    if (!isSupabaseMode || !targetCompanyId) return true;

    try {
      // Keep employee mutations on the same authoritative path as imports
      // and payroll updates.  The old direct REST path retried incompatible
      // legacy column names, which is why a successful edit still showed
      // multiple 400 responses in the browser console.
      const primarySave = EmployeeService.saveEmployee(employee, targetCompanyId, 'update', { useAdminHandler: true, _trace });
      await (_trace
        ? _trace.withTrace(primarySave, 'primary-save', EMPLOYEE_SAVE_TIMEOUT_MS)
        : withEmployeeSaveTimeout(primarySave, 'Employee update'));
      if (refreshAfterSave) {
        const refreshPromise = EmployeeService.getEmployees(targetCompanyId);
        const freshEmployees = await (_trace
          ? _trace.withTrace(refreshPromise, 'refresh', EMPLOYEE_SAVE_TIMEOUT_MS)
          : withEmployeeSaveTimeout(refreshPromise, 'Employee refresh'));
        setEmployees(freshEmployees);
      }
      return true;
    } catch (error: any) {
      console.error('Failed to save employee to Supabase:', error);
      toast.error(toUserMessage(error?.message, 'Failed to save employee to database.'));
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
      try {
        await EmployeeService.saveLeaveRequest(request, targetCompanyId);
      } catch (error: any) {
        setLeaveRequests((prev) => prev.filter((item) => item.id !== request.id));
        toast.error(error?.message || 'Leave request was not saved. Please try again.');
        throw error;
      }
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

      if (!employee.onboardingToken) {
        toast.error('This invite is missing its setup token. Please ask your employer to resend it.');
        return;
      }

      const completedInvite = await EmployeeService.completeEmployeeInvite({
        token: employee.onboardingToken,
        email: employee.email,
        password,
      });

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
      const updatedEmployee = { ...employee, status: 'ACTIVE', isOnboarded: true } as Employee;
      setEmployees((prev) => prev.map((existing) => (existing.id === employee.id ? updatedEmployee : existing)));
      setUsers((prev) => {
        if (prev.some((existing) => existing.id === completedInvite.user.id)) return prev;
        return [...prev, completedInvite.user];
      });
      setEmployeeAccountSetup(null);
      await new Promise((resolve) => setTimeout(resolve, 500));
      window.location.href = '/portal';
    } catch (error: any) {
      console.error('Error setting up employee account:', error);
      const message = error?.message || 'Failed to create account. Please try again or contact your employer.';
      toast.error(message);
      throw new Error(message);
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
