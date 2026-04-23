import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import {
  CompanySettings,
  Department,
  Designation,
  Employee,
  ResellerClient,
  TaxConfig,
  User,
} from '../core/types';
import { initializeCacheValidation } from '../utils/cacheUtils';
import { useWorkforceData } from '../features/employees/useWorkforceData';
import { usePayrollData } from '../features/payroll/usePayrollData';
import { useCompanyConfigData } from '../features/company/useCompanyConfigData';
import { useSubscription } from '../hooks/useSubscription';
import { NavigateFunction } from './useAppNavigation';
import { createAppFlowHandlers } from './appFlowHandlers';
import { useAppBootstrap } from './useAppBootstrap';

interface UseAppDataArgs {
  user: User | null;
  updateUser: (updates: Partial<User>) => void;
  impersonate: (client: ResellerClient) => void;
  navigateTo: NavigateFunction;
}

export const useAppData = ({ user, updateUser, impersonate, navigateTo }: UseAppDataArgs) => {
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
      return false;
    }

    return addEmployee(employee);
  };

  const { dataLoading } = useAppBootstrap({
    user,
    isSupabaseMode,
    applyLoadedCompany,
    setEmployees,
    setPayRunHistory,
    setLeaveRequests,
    setUsers,
  });

  const handleUpdateCompany = async (data: CompanySettings) => {
    await updateCompany(data, user?.companyId);
  };

  const handleUpdateDepartments = async (newDepartments: Department[]) => {
    await updateDepartments(newDepartments, user?.companyId);
  };

  const handleUpdateDesignations = async (newDesignations: Designation[]) => {
    await updateDesignations(newDesignations, user?.companyId);
  };

  const handleUpdateTaxConfig = async (newConfig: TaxConfig) => {
    await updateTaxConfig(newConfig, user?.companyId);
  };

  const {
    onLoginSuccess,
    handleImpersonation,
    handleCompanyOnboardComplete,
    handleEmployeeWizardComplete,
    openSignup,
  } = createAppFlowHandlers({
    user,
    companyData,
    isSupabaseMode,
    navigateTo,
    updateUser,
    impersonate,
    setCompanyData,
    setEmployees,
    setSelectedPlan,
    setSelectedCycle,
  });

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
