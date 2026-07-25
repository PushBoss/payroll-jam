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
import { ResellerService } from '../services/ResellerService';
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

  // Guarded bidirectional role sync with the reseller (Enterprise) plan.
  // This only ever changes the ROLE — never the plan or subscription.
  useEffect(() => {
    if (!companyData || !user || user.originalRole) return;
    const isResellerPlan = isResellerEquivalentPlan(companyData.plan);

    // Upgrade: an owner/admin on the reseller (Enterprise) plan becomes RESELLER.
    if (isResellerPlan && (user.role === Role.OWNER || user.role === Role.ADMIN)) {
      console.log('🔄 Syncing user role to RESELLER due to Enterprise/reseller plan');
      const updatedUser = { ...user, role: Role.RESELLER };
      updateUser({ role: Role.RESELLER });
      UserService.saveUser(updatedUser).catch((err: any) =>
        console.error('Failed to sync Reseller role to DB:', err)
      );
      return;
    }

    // Downgrade: a RESELLER no longer on the reseller plan reverts to OWNER —
    // but ONLY when the account has no reseller-client relationships at all. A
    // genuine partner (still on Enterprise, or managing clients) is never
    // stripped by a temporary billing lapse. Corrects stale RESELLER roles left
    // by the previous one-way sync (e.g. plan changed to Free but role stuck).
    if (user.role === Role.RESELLER && !isResellerPlan && companyData.id) {
      let cancelled = false;
      void (async () => {
        try {
          const clients = await ResellerService.getResellerClients(companyData.id!);
          if (cancelled || (clients && clients.length > 0)) return;
          console.log('🔄 Downgrading stale RESELLER role to OWNER (no reseller plan, no clients)');
          const updatedUser = { ...user, role: Role.OWNER };
          updateUser({ role: Role.OWNER });
          UserService.saveUser(updatedUser).catch((err: any) =>
            console.error('Failed to sync OWNER role to DB:', err)
          );
        } catch (err) {
          console.error('Reseller downgrade check failed; leaving role unchanged:', err);
        }
      })();
      return () => { cancelled = true; };
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
