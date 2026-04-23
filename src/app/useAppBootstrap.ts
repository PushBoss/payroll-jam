import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { CompanySettings, Employee, LeaveRequest, PayRun, User } from '../core/types';
import { AdminService } from '../services/AdminService';
import { CompanyService } from '../services/CompanyService';
import { EmployeeService } from '../services/EmployeeService';
import { PayrollService } from '../services/PayrollService';

const BOOTSTRAP_QUERY_TIMEOUT_MS = 8000;

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
  applyLoadedCompany: (company: CompanySettings | null) => void;
  setEmployees: (employees: Employee[]) => void;
  setPayRunHistory: (runs: PayRun[]) => void;
  setLeaveRequests: (requests: LeaveRequest[]) => void;
  setUsers: (users: User[]) => void;
}

export const useAppBootstrap = ({
  user,
  isSupabaseMode,
  applyLoadedCompany,
  setEmployees,
  setPayRunHistory,
  setLeaveRequests,
  setUsers,
}: UseAppBootstrapArgs) => {
  const [dataLoading, setDataLoading] = useState(false);

  useEffect(() => {
    async function loadData() {
      if (!isSupabaseMode || !user?.companyId) return;

      setDataLoading(true);
      try {
        const isImpersonating = Boolean(user.originalRole);
        let dbCompany: CompanySettings | null = null;
        let dbEmps: Employee[] | null = null;
        let dbRuns: PayRun[] | null = null;
        let dbLeaves: LeaveRequest[] | null = null;
        let dbUsers: User[] | null = null;

        if (isImpersonating) {
          const context = await withTimeout(AdminService.getCompanyContext(user.companyId), 'Admin company context');
          dbCompany = context.company;
          dbEmps = context.employees;
          dbRuns = context.payRuns;
          dbLeaves = context.leaveRequests;
          dbUsers = context.users;
        } else {
          const results = await Promise.allSettled([
            withTimeout(CompanyService.getCompany(user.companyId), 'Company settings'),
            withTimeout(EmployeeService.getEmployees(user.companyId), 'Employees'),
            withTimeout(PayrollService.getPayRuns(user.companyId), 'Pay runs'),
            withTimeout(EmployeeService.getLeaveRequests(user.companyId), 'Leave requests'),
            withTimeout(EmployeeService.getCompanyUsers(user.companyId), 'Company users'),
          ]);

          if (results[0].status === 'fulfilled') dbCompany = results[0].value;
          if (results[1].status === 'fulfilled') dbEmps = results[1].value;
          if (results[2].status === 'fulfilled') dbRuns = results[2].value;
          if (results[3].status === 'fulfilled') dbLeaves = results[3].value;
          if (results[4].status === 'fulfilled') dbUsers = results[4].value;

          const failures = results.filter((result) => result.status === 'rejected') as PromiseRejectedResult[];
          if (failures.length > 0) {
            console.error('Bootstrap queries failed:', failures.map((failure) => failure.reason));
          }
        }

        if (dbCompany) {
          applyLoadedCompany(dbCompany);
        } else if (!isImpersonating) {
          toast.error("Couldn't load company settings. Please try refreshing.");
        }

        if (dbEmps) setEmployees(dbEmps);
        if (dbRuns) setPayRunHistory(dbRuns);
        if (dbLeaves) setLeaveRequests(dbLeaves);
        if (dbUsers) setUsers(dbUsers);
      } catch (error) {
        console.error('Failed to load cloud data', error);
        toast.error('Failed to sync with database. Using local cache.');
      } finally {
        setDataLoading(false);
      }
    }

    void loadData();
  }, [applyLoadedCompany, isSupabaseMode, setEmployees, setLeaveRequests, setPayRunHistory, setUsers, user?.companyId, user?.originalRole]);

  return {
    dataLoading,
  };
};