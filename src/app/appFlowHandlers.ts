import { toast } from 'sonner';
import { CompanySettings, Employee, ResellerClient, Role, User } from '../core/types';
import { storage } from '../services/storage';
import { CompanyService } from '../services/CompanyService';
import { EmployeeService } from '../services/EmployeeService';
import { AppRoute, getDefaultRouteForUser } from './routes';

interface CreateAppFlowHandlersArgs {
  user: User | null;
  companyData: CompanySettings | null;
  isSupabaseMode: boolean;
  navigateTo: (route: AppRoute) => void;
  updateUser: (updates: Partial<User>) => void;
  impersonate: (client: ResellerClient) => void;
  setCompanyData: (company: CompanySettings | null) => void;
  setEmployees: (updater: (employees: Employee[]) => Employee[]) => void;
  setSelectedPlan: (plan: string) => void;
  setSelectedCycle: (cycle: 'monthly' | 'annual') => void;
  saveImportedEmployee?: (employee: Employee, options?: { refreshAfterSave?: boolean }) => boolean | Promise<boolean>;
}

const isUuid = (value: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);

export const createAppFlowHandlers = ({
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
  saveImportedEmployee,
}: CreateAppFlowHandlersArgs) => {
  const onLoginSuccess = (signedInUser: User) => {
    navigateTo(getDefaultRouteForUser(signedInUser));
  };

  const handleImpersonation = (client: ResellerClient) => {
    impersonate(client);
    if (!isSupabaseMode && companyData) {
      setCompanyData({ ...companyData, name: client.companyName });
    }
    navigateTo('dashboard');
  };

  const handleCompanyOnboardComplete = async (data: CompanySettings, importedEmployees: Employee[]) => {
    const existingPlan = companyData?.plan || 'Free';
    const companyDataWithStatus: CompanySettings = {
      ...companyData,
      ...data,
      subscriptionStatus: data.subscriptionStatus || 'ACTIVE',
      plan: existingPlan,
    };

    setCompanyData(companyDataWithStatus);
    storage.saveCompanyData(companyDataWithStatus);

    if (isSupabaseMode && user?.companyId && isUuid(user.companyId)) {
      const savedEmployees: Employee[] = [];
      const failedEmployees: Employee[] = [];

      try {
        await CompanyService.saveCompany(user.companyId, companyDataWithStatus);
        for (const employee of importedEmployees) {
          try {
            if (saveImportedEmployee) {
              const saved = await Promise.resolve(saveImportedEmployee(employee, { refreshAfterSave: false }));
              if (saved === false) {
                failedEmployees.push(employee);
              } else {
                savedEmployees.push(employee);
              }
            } else {
              await EmployeeService.saveEmployee(employee, user.companyId, 'insert');
              savedEmployees.push(employee);
            }
          } catch (employeeError) {
            console.warn(`Failed to save employee ${employee.email}:`, employeeError);
            failedEmployees.push(employee);
          }
        }
      } catch (error) {
        console.error('Failed to sync to Supabase:', error);
        toast.error('Failed to save to database. Data saved locally.');
      }

      if (!saveImportedEmployee && savedEmployees.length > 0) {
        setEmployees((prev) => [...prev, ...savedEmployees]);
      }

      if (failedEmployees.length > 0) {
        toast.error(`${failedEmployees.length} imported employee(s) could not be saved. You can retry from the Employees page.`);
      }
    } else if (importedEmployees.length > 0) {
      setEmployees((prev) => [...prev, ...importedEmployees]);
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
    onLoginSuccess,
    handleImpersonation,
    handleCompanyOnboardComplete,
    handleEmployeeWizardComplete,
    openSignup,
  };
};
