import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { CompanySettings, Employee, LeaveRequest, PayRun, User } from '../core/types';
import { AdminService } from '../services/AdminService';
import { CompanyService } from '../services/CompanyService';
import { EmployeeService } from '../services/EmployeeService';
import { PayrollService } from '../services/PayrollService';

const BOOTSTRAP_QUERY_TIMEOUT_MS = 12000;
const BOOTSTRAP_BACKGROUND_TIMEOUT_MS = 15000;
const ADMIN_CONTEXT_TIMEOUT_MS = 15000;
const ADMIN_BOOTSTRAP_ROLES = new Set(['OWNER', 'ADMIN', 'RESELLER']);

const withTimeout = async <T,>(promise: Promise<T>, label: string, timeoutMs = BOOTSTRAP_QUERY_TIMEOUT_MS): Promise<T> => {
  return await Promise.race([
    promise,
    new Promise<T>((_, reject) => {
      setTimeout(() => reject(new Error(`${label} timed out after ${timeoutMs}ms`)), timeoutMs);
    }),
  ]);
};

interface UseAppBootstrapArgs {
  user: User | null;
  isSupabaseMode: boolean;
  cachedCompany: CompanySettings | null;
  applyLoadedCompany: (company: CompanySettings | null) => void;
  setEmployees: (employees: Employee[]) => void;
  setPayRunHistory: (runs: PayRun[]) => void;
  setLeaveRequests: (requests: LeaveRequest[]) => void;
  setUsers: (users: User[]) => void;
}

export const useAppBootstrap = ({
  user,
  isSupabaseMode,
  cachedCompany,
  applyLoadedCompany,
  setEmployees,
  setPayRunHistory,
  setLeaveRequests,
  setUsers,
}: UseAppBootstrapArgs) => {
  const [dataLoading, setDataLoading] = useState(false);
  const cachedCompanyRef = useRef(cachedCompany);

  useEffect(() => {
    cachedCompanyRef.current = cachedCompany;
  }, [cachedCompany]);

  useEffect(() => {
    let isCancelled = false;

    async function loadData() {
      if (!isSupabaseMode || !user?.companyId) return;

      const hasUsableCachedCompany = cachedCompanyRef.current?.id === user.companyId;
      setDataLoading(!hasUsableCachedCompany);
      try {
        const isImpersonating = Boolean(user.originalRole);

        if (isImpersonating) {
          const context = await withTimeout(
            AdminService.getCompanyContext(user.companyId),
            'Admin company context',
            ADMIN_CONTEXT_TIMEOUT_MS
          );
          if (isCancelled) return;
          if (context.company) applyLoadedCompany(context.company);
          if (context.employees) setEmployees(context.employees);
          if (context.payRuns) setPayRunHistory(context.payRuns);
          if (context.leaveRequests) setLeaveRequests(context.leaveRequests);
          if (context.users) setUsers(context.users);
          return;
        }

        const normalizedRole = String(user.role || '').toUpperCase();
        const canUseAdminFallback = ADMIN_BOOTSTRAP_ROLES.has(normalizedRole);

        let dbCompany: CompanySettings | null = null;
        try {
          dbCompany = await withTimeout(CompanyService.getCompany(user.companyId), 'Company settings');
        } catch (companyError) {
          console.error('Company bootstrap query failed:', companyError);
        }

        if (!dbCompany && canUseAdminFallback && !hasUsableCachedCompany) {
          try {
            const fallbackContext = await withTimeout(
              AdminService.getCompanyContext(user.companyId),
              'Owner/Admin company context',
              ADMIN_CONTEXT_TIMEOUT_MS
            );

            if (isCancelled) return;
            if (fallbackContext.company) applyLoadedCompany(fallbackContext.company);
            if (fallbackContext.employees) setEmployees(fallbackContext.employees);
            if (fallbackContext.payRuns) setPayRunHistory(fallbackContext.payRuns);
            if (fallbackContext.leaveRequests) setLeaveRequests(fallbackContext.leaveRequests);
            if (fallbackContext.users) setUsers(fallbackContext.users);
            return;
          } catch (fallbackError) {
            console.error('Bootstrap owner/admin fallback failed:', fallbackError);
          }
        } else if (!dbCompany && hasUsableCachedCompany) {
          console.warn('Using cached company settings while cloud bootstrap refresh recovers.');
        }

        if (dbCompany) {
          applyLoadedCompany(dbCompany);
        } else if (!hasUsableCachedCompany) {
          toast.error("Couldn't load company settings. Please try refreshing.");
        }

        setDataLoading(false);

        const results = await Promise.allSettled([
          withTimeout(EmployeeService.getEmployees(user.companyId), 'Employees', BOOTSTRAP_BACKGROUND_TIMEOUT_MS),
          withTimeout(PayrollService.getPayRuns(user.companyId), 'Pay runs', BOOTSTRAP_BACKGROUND_TIMEOUT_MS),
          withTimeout(EmployeeService.getLeaveRequests(user.companyId), 'Leave requests', BOOTSTRAP_BACKGROUND_TIMEOUT_MS),
          withTimeout(EmployeeService.getCompanyUsers(user.companyId), 'Company users', BOOTSTRAP_BACKGROUND_TIMEOUT_MS),
        ]);

        if (isCancelled) return;
        if (results[0].status === 'fulfilled') setEmployees(results[0].value);
        if (results[1].status === 'fulfilled') setPayRunHistory(results[1].value);
        if (results[2].status === 'fulfilled') setLeaveRequests(results[2].value);
        if (results[3].status === 'fulfilled') setUsers(results[3].value);

        const failures = results.filter((result) => result.status === 'rejected') as PromiseRejectedResult[];
        if (failures.length > 0) {
          console.error('Background bootstrap queries failed:', failures.map((failure) => failure.reason));
        }
      } catch (error) {
        console.error('Failed to load cloud data', error);
        toast.error('Failed to sync with database. Using local cache.');
      } finally {
        if (!isCancelled) setDataLoading(false);
      }
    }

    void loadData();

    return () => {
      isCancelled = true;
    };
  }, [applyLoadedCompany, isSupabaseMode, setEmployees, setLeaveRequests, setPayRunHistory, setUsers, user?.companyId, user?.originalRole, user?.role]);

  return {
    dataLoading,
  };
};
