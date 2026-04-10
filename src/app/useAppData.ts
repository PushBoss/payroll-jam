import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import {
  CompanySettings,
  Department,
  Designation,
  DocumentTemplate,
  Employee,
  GlobalConfig,
  IntegrationConfig,
  PricingPlan,
  Role,
  TaxConfig,
  User,
} from '../core/types';
import { storage } from '../services/storage';
import { updateGlobalConfig } from '../services/updateGlobalConfig';
import { EmployeeService } from '../services/EmployeeService';
import { PayrollService } from '../services/PayrollService';
import { CompanyService } from '../services/CompanyService';
import { INITIAL_PLANS } from '../services/planService';
import { initializeCacheValidation } from '../utils/cacheUtils';
import { AdminService } from '../services/AdminService';
import { DEFAULT_TAX_CONFIG } from '../features/payroll/payrollConfig';
import { useWorkforceData } from '../features/employees/useWorkforceData';
import { usePayrollData } from '../features/payroll/usePayrollData';
import { useSubscription } from '../hooks/useSubscription';
import { NavigateFunction } from './useAppNavigation';

interface UseAppDataArgs {
  user: User | null;
  updateUser: (updates: Partial<User>) => void;
  impersonate: (client: any) => void;
  navigateTo: NavigateFunction;
}

export const useAppData = ({ user, updateUser, impersonate, navigateTo }: UseAppDataArgs) => {
  const [globalConfig, setGlobalConfig] = useState<GlobalConfig | null>(() => storage.getGlobalConfig());
  const [dataLoading, setDataLoading] = useState(false);
  const [verifyEmail, setVerifyEmail] = useState('');
  const [selectedPlan, setSelectedPlan] = useState('Starter');
  const [selectedCycle, setSelectedCycle] = useState<'monthly' | 'annual'>('monthly');
  const [companyData, setCompanyData] = useState<CompanySettings | null>(storage.getCompanyData());
  const [taxConfig, setTaxConfig] = useState<TaxConfig>(storage.getTaxConfig() || DEFAULT_TAX_CONFIG);
  const [integrationConfig, setIntegrationConfig] = useState<IntegrationConfig>(
    storage.getIntegrationConfig() || { provider: 'CSV', mappings: [] }
  );
  const [templates, setTemplates] = useState<DocumentTemplate[]>(storage.getTemplates() || []);
  const [plans, setPlans] = useState<PricingPlan[]>(() => storage.getPricingPlans() || INITIAL_PLANS);
  const [departments, setDepartments] = useState<Department[]>(storage.getDepartments() || []);
  const [designations, setDesignations] = useState<Designation[]>(storage.getDesignations() || []);

  useEffect(() => {
    initializeCacheValidation();
  }, []);

  const hasSupabaseEnv = Boolean(import.meta.env?.VITE_SUPABASE_URL && import.meta.env?.VITE_SUPABASE_ANON_KEY);

  useEffect(() => {
    if (!hasSupabaseEnv || globalConfig?.dataSource === 'SUPABASE') return;
    const updatedConfig = { ...(globalConfig || {}), dataSource: 'SUPABASE' } as GlobalConfig;
    storage.saveGlobalConfig(updatedConfig);
    setGlobalConfig(updatedConfig);
  }, [globalConfig, hasSupabaseEnv]);

  const isSupabaseMode = useMemo(() => {
    if (hasSupabaseEnv) return true;
    return globalConfig?.dataSource === 'SUPABASE';
  }, [globalConfig?.dataSource, hasSupabaseEnv]);

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
          setCompanyData(dbCompany);
          if (dbCompany.taxConfig) setTaxConfig(dbCompany.taxConfig);
          if ((dbCompany as any).departments) setDepartments((dbCompany as any).departments);
          if ((dbCompany as any).designations) setDesignations((dbCompany as any).designations);
          storage.saveCompanyData(dbCompany);
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
  }, [isSupabaseMode, user?.companyId, user?.originalRole]);

  useEffect(() => {
    storage.saveTaxConfig(taxConfig);
  }, [taxConfig]);

  useEffect(() => {
    storage.saveIntegrationConfig(integrationConfig);
  }, [integrationConfig]);

  useEffect(() => {
    storage.saveTemplates(templates);
  }, [templates]);

  useEffect(() => {
    storage.saveDepartments(departments);
  }, [departments]);

  useEffect(() => {
    storage.saveDesignations(designations);
  }, [designations]);

  useEffect(() => {
    async function loadPlansFromBackend() {
      if (!isSupabaseMode) {
        setPlans(INITIAL_PLANS);
        return;
      }

      try {
        const config = await CompanyService.getGlobalConfig();
        if (config) {
          setGlobalConfig(config);
          storage.saveGlobalConfig(config);
        }

        if (config?.pricingPlans && Array.isArray(config.pricingPlans) && config.pricingPlans.length > 0) {
          setPlans(config.pricingPlans);
          storage.savePricingPlans(config.pricingPlans);
          return;
        }

        setPlans(INITIAL_PLANS);
        storage.savePricingPlans(INITIAL_PLANS);
        await updateGlobalConfig({ pricingPlans: INITIAL_PLANS });
      } catch (error) {
        console.error('Failed to load plans from backend, using cache or defaults:', error);
        const cached = storage.getPricingPlans();
        setPlans(cached || INITIAL_PLANS);
      }
    }

    void loadPlansFromBackend();
  }, [isSupabaseMode]);

  const handleUpdatePlans = async (updatedPlans: PricingPlan[]) => {
    setPlans(updatedPlans);
    storage.savePricingPlans(updatedPlans);

    if (isSupabaseMode) {
      try {
        await updateGlobalConfig({ pricingPlans: updatedPlans });
      } catch (error) {
        console.error('Failed to update plans in backend:', error);
        toast.error('Failed to save pricing plans');
      }
    }
  };

  const handleUpdateCompany = async (data: CompanySettings) => {
    const updatedData = {
      ...data,
      departments: (data as any).departments || departments,
      designations: (data as any).designations || designations,
    };

    setCompanyData(updatedData);
    storage.saveCompanyData(updatedData);
    if (isSupabaseMode && user?.companyId) {
      await CompanyService.saveCompany(user.companyId, updatedData);
    }
  };

  const handleUpdateDepartments = async (newDepartments: Department[]) => {
    setDepartments(newDepartments);
    if (companyData) {
      const updated = { ...companyData, departments: newDepartments } as any;
      setCompanyData(updated);
      if (isSupabaseMode && user?.companyId) {
        await CompanyService.saveCompany(user.companyId, updated);
      }
    }
  };

  const handleUpdateDesignations = async (newDesignations: Designation[]) => {
    setDesignations(newDesignations);
    if (companyData) {
      const updated = { ...companyData, designations: newDesignations } as any;
      setCompanyData(updated);
      if (isSupabaseMode && user?.companyId) {
        await CompanyService.saveCompany(user.companyId, updated);
      }
    }
  };

  const handleUpdateTaxConfig = async (newConfig: TaxConfig) => {
    setTaxConfig(newConfig);
    if (companyData) {
      const updated = { ...companyData, taxConfig: newConfig };
      setCompanyData(updated);
      storage.saveCompanyData(updated);
      if (isSupabaseMode && user?.companyId) {
        await CompanyService.saveCompany(user.companyId, updated);
        toast.success('Tax configuration updated');
      }
    }
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
