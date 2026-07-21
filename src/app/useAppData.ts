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
  Role,
  DocumentRequest,
} from '../core/types';
import { initializeCacheValidation } from '../utils/cacheUtils';
import { useWorkforceData } from '../features/employees/useWorkforceData';
import { usePayrollData } from '../features/payroll/usePayrollData';
import { useCompanyConfigData } from '../features/company/useCompanyConfigData';
import { useSubscription } from '../hooks/useSubscription';
import { NavigateFunction } from './useAppNavigation';
import { createAppFlowHandlers } from './appFlowHandlers';
import { useAppBootstrap } from './useAppBootstrap';
import { isResellerEquivalentPlan } from '../utils/planNames';
import { UserService } from '../services/UserService';
import { DocumentService } from '../services/DocumentService';
import { storage } from '../services/storage';

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
    documentRequests,
    setDocumentRequests,
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

  // Dynamic user role synchronization based on company subscription plan
  useEffect(() => {
    if (companyData && user && !user.originalRole) {
      const isResellerPlan = isResellerEquivalentPlan(companyData.plan);
      if (isResellerPlan && (user.role === Role.OWNER || user.role === Role.ADMIN)) {
        console.log('🔄 Syncing user role to RESELLER due to Reseller plan');
        const updatedUser = { ...user, role: Role.RESELLER };
        updateUser({ role: Role.RESELLER });
        UserService.saveUser(updatedUser).catch((err: any) =>
          console.error('Failed to sync Reseller role to DB:', err)
        );
      }
    }
  }, [companyData, user]);

  const workforce = useWorkforceData({
    user,
    isSupabaseMode,
    activeCompanyId: companyData?.id,
  });

  const payroll = usePayrollData({
    user,
    isSupabaseMode,
    activeCompanyId: companyData?.id,
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
    payRunDetailsLoaded,
    payRunDetailsLoading,
    timesheets,
    setTimesheets,
    handleSaveTimesheet,
    handleClockAttendance,
    handleSavePayRun,
    handleDeletePayRun,
    loadFullPayRunHistory,
  } = payroll;

  const subscription = useSubscription(employees, companyData || ({ plan: 'Free' } as CompanySettings), plans, users);

  const handleAddEmployee = async (employee: Employee, options?: { refreshAfterSave?: boolean }) => {
    if (!subscription.canAddEmployee) {
      toast.error('Plan Limit Reached. Please upgrade.');
      return false;
    }

    return addEmployee(employee, options);
  };

  const { dataLoading } = useAppBootstrap({
    user,
    isSupabaseMode,
    cachedCompany: companyData,
    applyLoadedCompany,
    setEmployees,
    setPayRunHistory,
    setTimesheets,
    setLeaveRequests,
    setDocumentRequests,
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

  const handleSaveDocumentRequest = async (request: DocumentRequest) => {
    const requestEmployee = employees.find((employee) =>
      employee.id === request.employeeId ||
      employee.email.trim().toLowerCase() === user?.email?.trim().toLowerCase()
    );
    const targetCompanyId = user?.companyId || companyData?.id || request.companyId || requestEmployee?.companyId;
    const requestWithCompany = {
      ...request,
      companyId: targetCompanyId || request.companyId,
    };

    if (isSupabaseMode && !targetCompanyId) {
      toast.error('Could not identify your company for this document request. Please refresh and try again.');
      return requestWithCompany;
    }

    setDocumentRequests((prev) => {
      const existingIndex = prev.findIndex((item) => item.id === request.id);
      if (existingIndex >= 0) {
        const updated = [...prev];
        updated[existingIndex] = requestWithCompany;
        storage.saveDocumentRequests(updated);
        return updated;
      }
      const updated = [requestWithCompany, ...prev];
      storage.saveDocumentRequests(updated);
      return updated;
    });

    if (isSupabaseMode && targetCompanyId) {
      try {
        const saved = await DocumentService.saveDocumentRequest(requestWithCompany, targetCompanyId);
        setDocumentRequests((prev) => prev.map((item) => item.id === saved.id ? saved : item));
        return saved;
      } catch (error: any) {
        console.error('Failed to save document request:', error);
        toast.error(error?.message || 'Document request saved locally only.');
      }
    }

    return requestWithCompany;
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
    saveImportedEmployee: addEmployee,
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
    payRunDetailsLoaded,
    payRunDetailsLoading,
    loadFullPayRunHistory,
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
    documentRequests,
    setDocumentRequests,
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
    handleSaveTimesheet,
    handleClockAttendance,
    handleDeletePayRun,
    handleSaveLeaveRequest,
    handleUpdateLeaveStatus,
    handleUpdateCompany,
    handleUpdateDepartments,
    handleUpdateDesignations,
    handleUpdateTaxConfig,
    handleSaveDocumentRequest,
    onLoginSuccess,
    handleImpersonation,
    handleCompanyOnboardComplete,
    handleEmployeeWizardComplete,
    handleEmployeeAccountSetup,
    openSignup,
  };
};

export type AppDataModel = ReturnType<typeof useAppData>;
