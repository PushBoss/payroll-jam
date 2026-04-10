import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { CompanySettings, Employee, LeaveRequest, PayRun, User } from '../core/types';
import { AdminService } from '../services/AdminService';
import { CompanyService } from '../services/CompanyService';
import { EmployeeService } from '../services/EmployeeService';
import { PayrollService } from '../services/PayrollService';

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
        let dbCompany;
        let dbEmps;
        let dbRuns;
        let dbLeaves;
        let dbUsers;

        if (isImpersonating) {
          const context = await AdminService.getCompanyContext(user.companyId);
          dbCompany = context.company;
          dbEmps = context.employees;
          dbRuns = context.payRuns;
          dbLeaves = context.leaveRequests;
          dbUsers = context.users;
        } else {
          [dbCompany, dbEmps, dbRuns, dbLeaves, dbUsers] = await Promise.all([
            CompanyService.getCompany(user.companyId),
            EmployeeService.getEmployees(user.companyId),
            PayrollService.getPayRuns(user.companyId),
            EmployeeService.getLeaveRequests(user.companyId),
            EmployeeService.getCompanyUsers(user.companyId),
          ]);
        }

        if (dbCompany) {
          applyLoadedCompany(dbCompany);
        } else {
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