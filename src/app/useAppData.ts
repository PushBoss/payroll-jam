import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import {
  CompanySettings,
  Employee,
  Role,
  User,
} from '../core/types';
import { storage } from '../services/storage';
import { EmployeeService } from '../services/EmployeeService';
import { PayrollService } from '../services/PayrollService';
import { CompanyService } from '../services/CompanyService';
import { initializeCacheValidation } from '../utils/cacheUtils';
import { AdminService } from '../services/AdminService';
import { useWorkforceData } from '../features/employees/useWorkforceData';
import { usePayrollData } from '../features/payroll/usePayrollData';
import { useCompanyConfigData } from '../features/company/useCompanyConfigData';
import { useSubscription } from '../hooks/useSubscription';
import { NavigateFunction } from './useAppNavigation';

interface UseAppDataArgs {
  user: User | null;
  updateUser: (updates: Partial<User>) => void;
  impersonate: (client: any) => void;
  navigateTo: NavigateFunction;
}

export const useAppData = ({ user, updateUser, impersonate, navigateTo }: UseAppDataArgs) => {
  const [dataLoading, setDataLoading] = useState(false);
  const [verifyEmail, setVerifyEmail] = useState('');
  const [selectedPlan, setSelectedPlan] = useState('Starter');
  const [selectedCycle, setSelectedCycle] = useState<'monthly' | 'annual'>('monthly');

  useEffect(() => {
    initializeCacheValidation();
  }, []);

  const companyConfig = useCompanyConfigData();
  const {
    globalConfig,
    companyData,
    setCompanyData,
    taxConfig,
    integrationConfig,
    setIntegrationConfig,
    templates,
    setTemplates,
    plans,
    departments,
    designations,
    isSupabaseMode,
    applyLoadedCompany,
    handleUpdatePlans,
    handleUpdateCompany: updateCompany,
    handleUpdateDepartments: updateDepartments,
    handleUpdateDesignations: updateDesignations,
    handleUpdateTaxConfig: updateTaxConfig,
  } = companyConfig;

  const workforce = useWorkforceData({
    user,
    isSupabaseMode,
  });

  const payroll = usePayrollData({
    user,
    isSupabaseMode,
  });

  const {
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
    handleAddEmployee: addEmployee,
    handleUpdateEmployee,
    handleDeleteEmployee,
    handleSaveLeaveRequest,
    handleUpdateLeaveStatus,
    handleEmployeeAccountSetup,
  } = workforce;

  const {
    payRunHistory,
    setPayRunHistory,
    timesheets,
    setTimesheets,
    handleSavePayRun,
    handleDeletePayRun,
  } = payroll;

  const subscription = useSubscription(employees, companyData || ({ plan: 'Free' } as CompanySettings), plans, users);

  const handleAddEmployee = async (employee: Employee) => {
    if (!subscription.canAddEmployee) {
      toast.error('Plan Limit Reached. Please upgrade.');
      return;
    }

    await addEmployee(employee);
  };

  useEffect(() => {
    async function loadData() {
      if (!isSupabaseMode || !user?.companyId) return;

      setDataLoading(true);
      try {
        const isImpersonating = Boolean(user.originalRole);
        let dbCompany, dbEmps, dbRuns, dbLeaves, dbUsers;

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
  }, [applyLoadedCompany, isSupabaseMode, user?.companyId, user?.originalRole]);

  const handleUpdateCompany = async (data: CompanySettings) => {
    await updateCompany(data, user?.companyId);
  };

  const handleUpdateDepartments = async (newDepartments: any[]) => {
    await updateDepartments(newDepartments, user?.companyId);
  };

  const handleUpdateDesignations = async (newDesignations: any[]) => {
    await updateDesignations(newDesignations, user?.companyId);
  };

  const handleUpdateTaxConfig = async (newConfig: any) => {
    await updateTaxConfig(newConfig, user?.companyId);
  };

  const onLoginSuccess = (signedInUser: User) => {
    if (!signedInUser.isOnboarded && signedInUser.role === Role.OWNER) {
      navigateTo('onboarding');
      return;
    }
    if (!signedInUser.isOnboarded && signedInUser.role === Role.EMPLOYEE) {
      navigateTo('employee-onboarding');
      return;
    }
    if (signedInUser.role === Role.EMPLOYEE) {
      navigateTo('portal-home');
      return;
    }
    if (signedInUser.role === Role.RESELLER) {
      navigateTo('reseller-dashboard');
      return;
    }
    if (signedInUser.role === Role.SUPER_ADMIN) {
      navigateTo('sa-overview');
      return;
    }
    navigateTo('dashboard');
  };

  const handleImpersonation = (client: any) => {
    impersonate(client);
    if (!isSupabaseMode && companyData) {
      setCompanyData({ ...companyData, name: client.companyName });
    }
    navigateTo('dashboard');
  };

  const handleCompanyOnboardComplete = async (data: CompanySettings, importedEmployees: Employee[]) => {
    const existingPlan = companyData?.plan || 'Free';
    const companyDataWithStatus: CompanySettings = {
      ...data,
      subscriptionStatus: data.subscriptionStatus || 'ACTIVE',
      plan: existingPlan,
    };

    setCompanyData(companyDataWithStatus);
    setEmployees((prev) => [...prev, ...importedEmployees]);
    storage.saveCompanyData(companyDataWithStatus);

    if (
      isSupabaseMode &&
      user?.companyId &&
      user.companyId.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)
    ) {
      try {
        await CompanyService.saveCompany(user.companyId, companyDataWithStatus);
        for (const employee of importedEmployees) {
          try {
            await EmployeeService.saveEmployee(employee, user.companyId);
          } catch (employeeError) {
            console.warn(`Failed to save employee ${employee.email}:`, employeeError);
          }
        }
      } catch (error) {
        console.error('Failed to sync to Supabase:', error);
        toast.error('Failed to save to database. Data saved locally.');
      }
    }

    updateUser({ isOnboarded: true });
    toast.success('Company setup complete!');
    navigateTo(user?.role === Role.RESELLER ? 'reseller-dashboard' : 'dashboard');
  };

  const handleEmployeeWizardComplete = () => {
    navigateTo('portal-home');
  };

  const openSignup = (plan = 'Starter', cycle: 'monthly' | 'annual' = 'monthly') => {
    setSelectedPlan(plan);
    setSelectedCycle(cycle);
    navigateTo('signup');
  };

  return {
    globalConfig,
    isSupabaseMode,
    dataLoading,
    verifyEmail,
    setVerifyEmail,
    selectedPlan,
    setSelectedPlan,
    selectedCycle,
    setSelectedCycle,
    employees,
    setEmployees,
    payRunHistory,
    setPayRunHistory,
    leaveRequests,
    setLeaveRequests,
    timesheets,
    setTimesheets,
    companyData,
    setCompanyData,
    taxConfig,
    integrationConfig,
    setIntegrationConfig,
    templates,
    setTemplates,
    plans,
    departments,
    designations,
    assets,
    setAssets,
    reviews,
    setReviews,
    users,
    subscription,
    employeeAccountSetup,
    setEmployeeAccountSetup,
    handleUpdatePlans,
    handleAddEmployee,
    handleUpdateEmployee,
    handleDeleteEmployee,
    handleSavePayRun,
    handleDeletePayRun,
    handleSaveLeaveRequest,
    handleUpdateLeaveStatus,
    handleUpdateCompany,
    handleUpdateDepartments,
    handleUpdateDesignations,
    handleUpdateTaxConfig,
    onLoginSuccess,
    handleImpersonation,
    handleCompanyOnboardComplete,
    handleEmployeeWizardComplete,
    handleEmployeeAccountSetup,
    openSignup,
  };
};

export type AppDataModel = ReturnType<typeof useAppData>;
