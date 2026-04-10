import { useEffect } from 'react';
import { toast } from 'sonner';
import { CompanySettings, Employee, Role, User } from '../core/types';
import { EmployeeAccountSetupState } from '../features/employees/useWorkforceData';
import { AppRoute } from './routes';
import { NavigateFunction } from './useAppNavigation';
import { CompanyService } from '../services/CompanyService';
import { EmployeeService } from '../services/EmployeeService';

interface UseAuthRedirectsArgs {
  user: User | null;
  isLoading: boolean;
  currentPath: AppRoute;
  navigateTo: NavigateFunction;
  logout: () => Promise<void>;
  employees: Employee[];
  isSupabaseMode: boolean;
  companyData: CompanySettings | null;
  setVerifyEmail: (email: string) => void;
  setEmployeeAccountSetup: (value: EmployeeAccountSetupState | null) => void;
}

export const useAuthRedirects = ({
  user,
  isLoading,
  currentPath,
  navigateTo,
  logout,
  employees,
  isSupabaseMode,
  companyData,
  setVerifyEmail,
  setEmployeeAccountSetup,
}: UseAuthRedirectsArgs) => {
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const hasInvitation = params.get('invitation') === 'true' || params.get('token') !== null;

    if (user && !isLoading && !hasInvitation && ['login', 'signup', 'verify-email'].includes(currentPath)) {
      if (user.role === Role.EMPLOYEE) {
        navigateTo('portal-home', { replace: true });
      } else if (user.role === Role.RESELLER) {
        navigateTo('reseller-dashboard', { replace: true });
      } else if (user.role === Role.SUPER_ADMIN) {
        navigateTo('sa-overview', { replace: true });
      } else {
        navigateTo('dashboard', { replace: true });
      }
    }
  }, [currentPath, isLoading, navigateTo, user]);

  useEffect(() => {
    const hashParams = new URLSearchParams(window.location.hash.substring(1));
    const error = hashParams.get('error');
    const errorCode = hashParams.get('error_code');
    const errorDescription = hashParams.get('error_description');
    const email = hashParams.get('email') || new URLSearchParams(window.location.search).get('email');

    if (error === 'access_denied' && (errorCode === 'otp_expired' || errorDescription?.includes('expired'))) {
      toast.error('This verification link has expired. Please request a new one.', {
        duration: 5000,
      });

      if (email) {
        setVerifyEmail(email);
        setTimeout(() => {
          navigateTo('verify-email', { replace: true, query: { email } });
          window.history.replaceState({}, '', window.location.pathname + window.location.search);
        }, 2000);
      } else {
        setTimeout(() => {
          navigateTo('signup', { replace: true });
          window.history.replaceState({}, '', window.location.pathname);
        }, 3000);
      }
      return;
    }

    if (error && error !== 'access_denied') {
      toast.error(errorDescription || 'Authentication error. Please try again.', {
        duration: 5000,
      });
      setTimeout(() => {
        window.history.replaceState({}, '', window.location.pathname + window.location.search);
      }, 3000);
    }
  }, [navigateTo, setVerifyEmail]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token = params.get('token');
    const email = params.get('email');

    if (!token) return;
    if (currentPath === 'signup' && token) return;

    if (user && email && user.email === email) {
      window.history.replaceState({}, '', window.location.pathname);
      toast.success('You are already logged in!');
      return;
    }

    const isResellerInvite = params.get('reseller') === 'true';

    if (user && email && user.email.toLowerCase() !== email.toLowerCase()) {
      toast.info(`Switching accounts to accept invitation for ${email}...`);
      logout().then(() => {
        window.location.reload();
      });
      return;
    }

    if (isResellerInvite && user && user.companyId && email === user.email && token) {
      void (async () => {
        const accepted = await CompanyService.acceptResellerInvite(token, user.companyId || '');
        if (accepted) {
          toast.success('Reseller invitation accepted! You can now be managed by your accountant.');
          window.history.replaceState({}, '', window.location.pathname);
        } else {
          toast.error('Failed to accept reseller invitation. It may have expired.');
        }
      })();
      return;
    }

    if (isResellerInvite && !user && token && email) {
      navigateTo('signup', { query: { token, email, reseller: 'true' } });
      return;
    }

    const isEmployeeInvite = params.get('type') === 'employee';

    if (employees.length > 0 && !isResellerInvite && !isEmployeeInvite) {
      const invitee = employees.find((employee) => employee.onboardingToken === token);
      if (invitee && (!user || user.email !== invitee.email)) {
        setEmployeeAccountSetup({
          employee: invitee,
          companyName: companyData?.name || 'Your Company',
        });
        return;
      }
    }

    if (isSupabaseMode && token && (isEmployeeInvite || (!user && email))) {
      void (async () => {
        try {
          const result = await EmployeeService.getEmployeeByToken(token, email || undefined);
          if (result && (!user || user.email !== result.employee.email)) {
            setEmployeeAccountSetup({
              employee: result.employee,
              companyName: result.companyName,
              companyId: result.companyId,
            });
            toast.info(`Welcome! Please set up your account to access ${result.companyName} employee portal.`);
          }
        } catch (error) {
          console.error('Error checking employee invite:', error);
        }
      })();
    }

    if (isSupabaseMode && token && !user && email && !isEmployeeInvite) {
      void (async () => {
        try {
          const foundUser = await EmployeeService.getUserByEmail(email);
          if (foundUser && foundUser.onboardingToken === token) {
            navigateTo('signup', { query: { token, email, type: 'user' } });
            toast.info(`Welcome! Please sign up to join ${companyData?.name || 'the team'}.`);
          }
        } catch (error) {
          console.error('Error checking user invite:', error);
        }
      })();
    }
  }, [companyData?.name, currentPath, employees, isSupabaseMode, logout, navigateTo, setEmployeeAccountSetup, user]);
};
