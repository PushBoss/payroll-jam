import { useState, useEffect, Suspense, lazy } from 'react';
import { Toaster, toast } from 'sonner';
import { Layout } from './components/Layout';
import { CookieConsent } from './components/CookieConsent';
import { ErrorBoundary } from './components/ErrorBoundary'; 
import { storage } from './services/storage';
import { updateGlobalConfig } from './services/updateGlobalConfig';
import { supabaseService } from './services/supabaseService';
import { supabase } from './services/supabaseClient';
import { initializeCacheValidation } from './utils/cacheUtils';
import { User, Role, Employee, PayRun as PayRunType, LeaveRequest, WeeklyTimesheet, CompanySettings, IntegrationConfig, TaxConfig, DocumentTemplate, PricingPlan, Department, Designation, Asset, PerformanceReview } from './types';
import { AuthProvider, useAuth } from './context/AuthContext';
import { useSubscription } from './hooks/useSubscription';
import { hasFeatureAccess, getFeatureUpgradeMessage } from './utils/featureAccess';

// ... (Imports and Lazy Loads remain same) ...
const Dashboard = lazy(() => import('./pages/Dashboard').then(m => ({ default: m.Dashboard })));
const Employees = lazy(() => import('./pages/Employees').then(m => ({ default: m.Employees })));
const PayRun = lazy(() => import('./pages/PayRun').then(m => ({ default: m.PayRun })));
const Leave = lazy(() => import('./pages/Leave').then(m => ({ default: m.Leave })));
const Documents = lazy(() => import('./pages/Documents').then(m => ({ default: m.Documents })));
const Reports = lazy(() => import('./pages/Reports').then(m => ({ default: m.Reports })));
const Settings = lazy(() => import('./pages/Settings').then(m => ({ default: m.Settings })));
const TimeSheets = lazy(() => import('./pages/TimeSheets').then(m => ({ default: m.TimeSheets })));
const Compliance = lazy(() => import('./pages/Compliance').then(m => ({ default: m.Compliance })));
const AiAssistant = lazy(() => import('./pages/AiAssistant').then(m => ({ default: m.AiAssistant })));
const Login = lazy(() => import('./pages/Login').then(m => ({ default: m.Login })));
const Signup = lazy(() => import('./pages/Signup').then(m => ({ default: m.Signup })));
const ResetPassword = lazy(() => import('./pages/ResetPassword').then(m => ({ default: m.ResetPassword })));
const PrivacyPolicy = lazy(() => import('./pages/PrivacyPolicy').then(m => ({ default: m.PrivacyPolicy })));
const TermsOfService = lazy(() => import('./pages/TermsOfService').then(m => ({ default: m.TermsOfService })));
const LandingPage = lazy(() => import('./pages/LandingPage').then(m => ({ default: m.LandingPage })));
const Pricing = lazy(() => import('./pages/Pricing').then(m => ({ default: m.Pricing })));
const Features = lazy(() => import('./pages/Features').then(m => ({ default: m.Features })));
const FAQ = lazy(() => import('./pages/FAQ').then(m => ({ default: m.FAQ })));
const Onboarding = lazy(() => import('./pages/Onboarding').then(m => ({ default: m.Onboarding })));
const EmployeePortal = lazy(() => import('./pages/EmployeePortal').then(m => ({ default: m.EmployeePortal })));
const SuperAdmin = lazy(() => import('./pages/SuperAdmin').then(m => ({ default: m.SuperAdmin })));
const ResellerDashboard = lazy(() => import('./pages/ResellerDashboard').then(m => ({ default: m.ResellerDashboard })));
const EmployeeOnboardingWizard = lazy(() => import('./pages/EmployeeOnboardingWizard').then(m => ({ default: m.EmployeeOnboardingWizard })));
const NotFound = lazy(() => import('./pages/NotFound').then(m => ({ default: m.NotFound })));
const Profile = lazy(() => import('./pages/Profile').then(m => ({ default: m.Profile })));



const INITIAL_TAX_CONFIG: TaxConfig = {
  nisRate: 0.03, nisCap: 5000000,
  nhtRate: 0.02,
  edTaxRate: 0.0225,
  payeThreshold: 1500096,
  payeRateStd: 0.25, payeRateHigh: 0.30
};

const INITIAL_PLANS: PricingPlan[] = [
    { id: 'p1', name: 'Free', priceConfig: { type: 'free', monthly: 0, annual: 0 }, description: 'For small businesses (<5 emp)', limit: '5', features: ['Basic Payroll', 'Payslip PDF'], cta: 'Start Free', highlight: false, color: 'bg-white', textColor: 'text-gray-900', isActive: true },
    { id: 'p2', name: 'Starter', priceConfig: { type: 'flat', monthly: 5000, annual: 50000 }, description: 'Growing teams needing compliance', limit: '25', features: ['S01/S02 Reports', 'ACH Bank Files', 'Email Support'], cta: 'Get Started', highlight: true, color: 'bg-jam-black', textColor: 'text-white', isActive: true },
    { id: 'p3', name: 'Pro', priceConfig: { type: 'per_emp', monthly: 500, annual: 5000 }, description: 'Larger organizations', limit: 'Unlimited', features: ['GL Integration', 'Employee Portal', 'Advanced HR'], cta: 'Contact Sales', highlight: false, color: 'bg-white', textColor: 'text-gray-900', isActive: true },
    { id: 'p4', name: 'Reseller', priceConfig: { type: 'base', monthly: 0, annual: 0, baseFee: 5000, perUserFee: 500, resellerCommission: 20 }, description: 'For Accountants & Payroll Bureaus', limit: 'Unlimited', features: ['White Label', 'Client Management', '20% Commission'], cta: 'Partner With Us', highlight: false, color: 'bg-gray-100', textColor: 'text-gray-900', isActive: true }
];

function AppContent() {
  const { user, impersonate, updateUser, isLoading } = useAuth(); 
  
  // Initialize cache validation on mount
  useEffect(() => {
    initializeCacheValidation();
  }, []);
  
  const globalConfig = storage.getGlobalConfig();
  
  // Auto-enable Supabase mode if credentials are available
  const isSupabaseMode = (() => {
    if (globalConfig?.dataSource === 'SUPABASE') return true;
    
    // Auto-detect if Supabase is configured via env vars
    const hasSupabaseEnv = import.meta.env?.VITE_SUPABASE_URL && import.meta.env?.VITE_SUPABASE_ANON_KEY;
    if (hasSupabaseEnv && !globalConfig) {
      // Initialize global config with Supabase enabled
      storage.saveGlobalConfig({ dataSource: 'SUPABASE' } as any);
      return true;
    }
    
    return false;
  })();

  const getInitialPath = () => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const page = params.get('page');
      if (page) return page;
    }
    return user ? 'dashboard' : 'home';
  };

  const [currentPath, setCurrentPath] = useState(getInitialPath());
  const [dataLoading, setDataLoading] = useState(false);
  const [editRunId, setEditRunId] = useState<string | undefined>(undefined);
  
  // Data State
  const [employees, setEmployees] = useState<Employee[]>(storage.getEmployees() || []);
  const [payRunHistory, setPayRunHistory] = useState<PayRunType[]>(storage.getPayRuns() || []);
  const [leaveRequests, setLeaveRequests] = useState<LeaveRequest[]>(storage.getLeaveRequests() || []);
  const [timesheets, setTimesheets] = useState<WeeklyTimesheet[]>(storage.getTimesheets() || []);
  
  // Config State
  const [companyData, setCompanyData] = useState<CompanySettings | null>(storage.getCompanyData());
  const [taxConfig, setTaxConfig] = useState<TaxConfig>(storage.getTaxConfig() || INITIAL_TAX_CONFIG);
  const [integrationConfig, setIntegrationConfig] = useState<IntegrationConfig>(storage.getIntegrationConfig() || { provider: 'CSV', mappings: [] });
  const [templates, setTemplates] = useState<DocumentTemplate[]>(storage.getTemplates() || []);
  // Initialize plans - ensure we always have at least INITIAL_PLANS
  const getInitialPlans = (): PricingPlan[] => {
    const stored = storage.getPricingPlans();
    return (stored && stored.length > 0) ? stored : INITIAL_PLANS;
  };
  const [plans, setPlans] = useState<PricingPlan[]>(getInitialPlans());
  const [departments, setDepartments] = useState<Department[]>(storage.getDepartments() || []);
  const [designations, setDesignations] = useState<Designation[]>(storage.getDesignations() || []);
  const [assets, setAssets] = useState<Asset[]>(storage.getAssets() || []);
  const [reviews, setReviews] = useState<PerformanceReview[]>(storage.getReviews() || []);
  const [employeeAccountSetup, setEmployeeAccountSetup] = useState<{ employee: Employee; companyName: string; companyId?: string } | null>(null);

  // --- SUBSCRIPTION LOGIC ---
  const subscription = useSubscription(employees, companyData || { plan: 'Free' } as CompanySettings, plans);

  const navigateTo = (path: string, params?: { editRunId?: string }) => {
    setCurrentPath(path);
    if (params?.editRunId) {
      setEditRunId(params.editRunId);
    } else if (path !== 'payrun') {
      // Clear editRunId when navigating away from payrun page
      setEditRunId(undefined);
    }
    try {
        const newUrl = new URL(window.location.href);
        newUrl.searchParams.set('page', path);
        window.history.pushState({ path }, '', newUrl.toString());
    } catch (e) {
        console.warn("Navigation failed to update URL history:", e);
    }
  };

  // Handle browser back/forward buttons and URL changes
  useEffect(() => {
    const handlePopState = () => {
      const params = new URLSearchParams(window.location.search);
      const page = params.get('page');
      if (page) {
        setCurrentPath(page);
      }
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  // Redirect authenticated users away from auth pages
  useEffect(() => {
    if (user && !isLoading && (currentPath === 'login' || currentPath === 'signup')) {
      if (user.role === Role.EMPLOYEE) {
        navigateTo('portal-home');
      } else if (user.role === Role.RESELLER) {
        navigateTo('reseller-dashboard');
      } else if (user.role === Role.SUPER_ADMIN) {
        navigateTo('sa-overview');
      } else {
        navigateTo('dashboard');
      }
    }
  }, [user, isLoading, currentPath]);

  // Handle invite tokens (both employee and user invites)
  useEffect(() => {
      const params = new URLSearchParams(window.location.search);
      const token = params.get('token');
      const email = params.get('email');
      
      if (!token) return;
      
      // If already on signup page with token, don't redirect
      if (currentPath === 'signup' && token) {
          return;
      }
      
      // Check if user is already logged in with matching email
      if (user && email && user.email === email) {
          // User is already logged in, just clear the token from URL
          window.history.replaceState({}, '', window.location.pathname);
          toast.success('You are already logged in!');
          return;
      }
      
      // Handle reseller invites for existing users
      const isResellerInvite = params.get('reseller') === 'true';
      if (isResellerInvite && user && user.companyId && email === user.email && token) {
          // User is already logged in with matching email - accept the invite
          (async () => {
              const accepted = await supabaseService.acceptResellerInvite(token, user.companyId || '');
              if (accepted) {
                  toast.success('Reseller invitation accepted! You can now be managed by your accountant.');
                  window.history.replaceState({}, '', window.location.pathname);
              } else {
                  toast.error('Failed to accept reseller invitation. It may have expired.');
              }
          })();
          return;
      }
      
      // Handle employee invite tokens
      const isEmployeeInvite = params.get('type') === 'employee';
      
      // First check local employees array (if loaded)
      if (employees.length > 0 && !isResellerInvite && !isEmployeeInvite) {
          const invitee = employees.find(e => e.onboardingToken === token);
          if (invitee && (!user || user.email !== invitee.email)) {
              // Show employee account setup page
              setEmployeeAccountSetup({
                  employee: invitee,
                  companyName: companyData?.name || 'Your Company'
              });
              return;
          }
      }
      
      // Check Supabase for employee invite (works even when not logged in)
      if (isSupabaseMode && token && (isEmployeeInvite || (!user && email))) {
          const checkEmployeeInvite = async () => {
              try {
                  // Try to find employee by token and email
                  const result = await supabaseService.getEmployeeByToken(token, email || undefined);
                  if (result && (!user || user.email !== result.employee.email)) {
                      // Show employee account setup page
                      setEmployeeAccountSetup({
                          employee: result.employee,
                          companyName: result.companyName,
                          companyId: result.companyId
                      });
                      toast.info(`Welcome! Please set up your account to access ${result.companyName} employee portal.`);
                      return;
                  }
              } catch (error) {
                  console.error('Error checking employee invite:', error);
              }
          };
          
          checkEmployeeInvite();
      }
      
      // Handle user invite tokens (check Supabase)
      if (isSupabaseMode && token && !user && email && !isEmployeeInvite) {
          const checkUserInvite = async () => {
              try {
                  // Try to find user by email and token
                  const foundUser = await supabaseService.getUserByEmail(email);
                  if (foundUser && foundUser.onboardingToken === token) {
                      // Navigate to signup with pre-filled email
                      navigateTo(`signup?token=${token}&email=${encodeURIComponent(email)}&type=user`);
                      toast.info(`Welcome! Please sign up to join ${companyData?.name || 'the team'}.`);
                      return;
                  }
              } catch (error) {
                  console.error('Error checking user invite:', error);
              }
          };
          
          checkUserInvite();
      }
  }, [employees, user, isSupabaseMode, companyData, currentPath]);

  useEffect(() => {
    async function loadData() {
      if (isSupabaseMode && user?.companyId) {
        setDataLoading(true);
        try {
          const [dbCompany, dbEmps, dbRuns, dbLeaves] = await Promise.all([
            supabaseService.getCompany(user.companyId),
            supabaseService.getEmployees(user.companyId),
            supabaseService.getPayRuns(user.companyId),
            supabaseService.getLeaveRequests(user.companyId)
          ]);

          if (dbCompany) setCompanyData(dbCompany);
          if (dbEmps) setEmployees(dbEmps);
          if (dbRuns) setPayRunHistory(dbRuns);
          if (dbLeaves) setLeaveRequests(dbLeaves);
          toast.success("Sync complete: Loaded data from Supabase Cloud");
        } catch (error) {
          console.error("Failed to load cloud data", error);
          toast.error("Failed to sync with database. Using local cache.");
        } finally {
          setDataLoading(false);
        }
      }
    }
    loadData();
  }, [isSupabaseMode, user?.companyId]);

  useEffect(() => { storage.saveEmployees(employees); }, [employees]);
  useEffect(() => storage.savePayRuns(payRunHistory), [payRunHistory]);
  // ... other persists ...
  useEffect(() => storage.saveLeaveRequests(leaveRequests), [leaveRequests]);
  useEffect(() => storage.saveTimesheets(timesheets), [timesheets]);
  useEffect(() => storage.saveTaxConfig(taxConfig), [taxConfig]);
  useEffect(() => storage.saveIntegrationConfig(integrationConfig), [integrationConfig]);
  useEffect(() => storage.saveTemplates(templates), [templates]);
  // Always load plans from Supabase/global config on app load
  useEffect(() => {
    function loadPlans() {
      // Always ensure we have plans - use stored or initial
      const storedPlans = storage.getPricingPlans();
          const globalConfig = storage.getGlobalConfig();
      
      // Priority: globalConfig.pricingPlans > storedPlans > INITIAL_PLANS
      if (globalConfig?.pricingPlans && Array.isArray(globalConfig.pricingPlans) && globalConfig.pricingPlans.length > 0) {
            setPlans(globalConfig.pricingPlans);
            storage.savePricingPlans(globalConfig.pricingPlans);
      } else if (storedPlans && storedPlans.length > 0) {
        setPlans(storedPlans);
      } else if (plans.length === 0) {
        // Only set INITIAL_PLANS if we don't have any plans yet
        setPlans(INITIAL_PLANS);
        storage.savePricingPlans(INITIAL_PLANS);
      }
    }
    loadPlans();
  }, []); // Run once on mount
  useEffect(() => storage.savePricingPlans(plans), [plans]);
  useEffect(() => storage.saveDepartments(departments), [departments]);
  useEffect(() => storage.saveDesignations(designations), [designations]);
  useEffect(() => storage.saveAssets(assets), [assets]);
  useEffect(() => storage.saveReviews(reviews), [reviews]);

  // Handler to sync plan/pricing edits to backend/global config and local storage
  const handleUpdatePlans = async (updatedPlans: PricingPlan[]) => {
    setPlans(updatedPlans);
    storage.savePricingPlans(updatedPlans);
    // If Supabase mode, update global config in Supabase (if available)
    if (isSupabaseMode) {
      try {
        await updateGlobalConfig({ pricingPlans: updatedPlans });
      } catch (e) {
        // Optionally show error to user
        console.error('Failed to update global config:', e);
      }
    }
  };

  // ... (Wrappers unchanged) ...
  const handleAddEmployee = async (emp: Employee) => {
    if (!subscription.canAddEmployee) {
        toast.error("Plan Limit Reached. Please upgrade.");
        return;
    }
    setEmployees(prev => [...prev, emp]); 
    if (isSupabaseMode && user?.companyId) await supabaseService.saveEmployee(emp, user.companyId);
  };
  
  const handleUpdateEmployee = async (emp: Employee) => {
    setEmployees(prev => prev.map(e => e.id === emp.id ? emp : e));
    if (isSupabaseMode && user?.companyId) await supabaseService.saveEmployee(emp, user.companyId);
  };

  const handleDeleteEmployee = async (employeeId: string) => {
    setEmployees(prev => prev.filter(e => e.id !== employeeId));
    if (isSupabaseMode && user?.companyId) {
      try {
        await supabaseService.deleteEmployee(employeeId, user.companyId);
      } catch (error) {
        console.error("Error deleting employee from Supabase:", error);
        toast.error("Failed to delete employee from database.");
      }
    }
  };
  
  const handleSavePayRun = async (run: PayRunType) => {
    setPayRunHistory(prev => {
      // Check if run already exists (updating existing)
      const existingIndex = prev.findIndex(r => r.id === run.id);
      if (existingIndex >= 0) {
        // Update existing run
        const updated = [...prev];
        updated[existingIndex] = run;
        return updated;
      } else {
        // Add new run
        return [run, ...prev];
      }
    });
    if (isSupabaseMode && user?.companyId) await supabaseService.savePayRun(run, user.companyId);
  };
  const handleSaveLeaveRequest = async (req: LeaveRequest) => {
    setLeaveRequests(prev => [req, ...prev]); 
    if (isSupabaseMode && user?.companyId) await supabaseService.saveLeaveRequest(req, user.companyId);
  };
  const handleUpdateLeaveStatus = async (id: string, status: 'APPROVED' | 'REJECTED', dates?: string[]) => {
    const updated = leaveRequests.map(r => r.id === id ? { ...r, status, approvedDates: dates } : r);
    setLeaveRequests(updated);
    if (isSupabaseMode && user?.companyId) {
        const target = updated.find(r => r.id === id);
        if (target) await supabaseService.saveLeaveRequest(target, user.companyId);
    }
  };
  const handleUpdateCompany = async (data: CompanySettings) => {
    setCompanyData(data);
    storage.saveCompanyData(data);
    if (isSupabaseMode && user?.companyId) await supabaseService.saveCompany(user.companyId, data);
  };
  
  const onLoginSuccess = (u: User) => {
    if (!u.isOnboarded && u.role === Role.OWNER) navigateTo('onboarding');
    else if (!u.isOnboarded && u.role === Role.EMPLOYEE) navigateTo('employee-onboarding');
    else if (u.role === Role.EMPLOYEE) navigateTo('portal-home');
    else if (u.role === Role.RESELLER) navigateTo('reseller-dashboard');
    else if (u.role === Role.SUPER_ADMIN) navigateTo('sa-overview');
    else navigateTo('dashboard');
  };

  const onSignupSuccess = async (u: User) => {
    if (u.role === Role.OWNER) navigateTo('onboarding');
    else if (u.role === Role.EMPLOYEE) navigateTo('employee-onboarding');
    else navigateTo('dashboard');
  };
  
  const handleImpersonation = (client: any) => {
      impersonate(client);
      if (!isSupabaseMode && companyData) setCompanyData({ ...companyData, name: client.companyName });
      navigateTo('dashboard');
  };
  const handleCompanyOnboardComplete = async (data: CompanySettings, importedEmployees: Employee[]) => {
      // Ensure subscriptionStatus is set (default to ACTIVE for Free tier)
      const companyDataWithStatus: CompanySettings = {
          ...data,
          subscriptionStatus: data.subscriptionStatus || 'ACTIVE',
          plan: data.plan || 'Free'
      };
      
      setCompanyData(companyDataWithStatus);
      setEmployees(prev => [...prev, ...importedEmployees]);
      storage.saveCompanyData(companyDataWithStatus);
      
      // Only save to Supabase if we have a valid UUID companyId
      if (isSupabaseMode && user?.companyId && user.companyId.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)) {
          try {
              await supabaseService.saveCompany(user.companyId, companyDataWithStatus);
              console.log('✅ Company data saved to Supabase during onboarding');
              
              // Save employees to Supabase
              for (const emp of importedEmployees) {
                  try {
                  await supabaseService.saveEmployee(emp, user.companyId);
                  } catch (empError) {
                      console.warn(`Failed to save employee ${emp.email}:`, empError);
                  }
              }
              console.log(`✅ Saved ${importedEmployees.length} employees to Supabase`);
          } catch (error) {
              console.error('Failed to sync to Supabase:', error);
              toast.error('Failed to save to database. Data saved locally.');
          }
      }
      // Mark user as onboarded
      updateUser({ isOnboarded: true });
      toast.success('Company setup complete!');
      navigateTo('dashboard');
  };
  const handleEmployeeWizardComplete = () => { navigateTo('portal-home'); };
  
  const LoadingFallback = () => (
    <div className="flex items-center justify-center min-h-screen bg-gray-50">
      <div className="flex flex-col items-center">
        <div className="w-12 h-12 border-4 border-jam-orange border-t-transparent rounded-full animate-spin mb-4"></div>
        <p className="text-gray-500 font-medium">Loading...</p>
      </div>
    </div>
  );

  // Show loading state while checking for stored user session
  if (isLoading) {
    return <LoadingFallback />;
  }

  // Handle reset-password route without requiring authentication
  // Handle employee account setup
  const handleEmployeeAccountSetup = async (password: string) => {
    if (!employeeAccountSetup) return;

    try {
      const { employee, companyId } = employeeAccountSetup;
      
      // Get company ID - use from employeeAccountSetup or fetch it
      let finalCompanyId = companyId || '';
      
      if (!finalCompanyId && isSupabaseMode && employee.onboardingToken) {
        // Fetch employee to get company_id
        const employeeResult = await supabaseService.getEmployeeByToken(employee.onboardingToken, employee.email);
        if (employeeResult) {
          finalCompanyId = employeeResult.companyId;
        }
      }
      
      // Fallback to user's companyId if available
      if (!finalCompanyId && user?.companyId) {
        finalCompanyId = user.companyId;
      }
      
      if (!finalCompanyId) {
        toast.error('Unable to determine company. Please contact your employer.');
        return;
      }
      
      // For employees, create auth user directly without creating a company
      if (!isSupabaseMode || !supabase) {
        toast.error('Database not available. Please contact your employer.');
        return;
      }
      
      // 1. Create Supabase auth user
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: employee.email,
        password: password,
      });

      if (authError) {
        console.error('❌ Auth signup error:', authError);
        throw authError;
      }

      if (!authData.user) {
        throw new Error('No user returned from signup');
      }

      console.log('✅ Supabase Auth user created:', authData.user.id);

      // 2. Create app_users profile (linked to auth user)
      const newUser = {
        id: authData.user.id, // Use auth user ID
        email: employee.email,
        name: `${employee.firstName} ${employee.lastName}`,
        role: employee.role,
        companyId: finalCompanyId,
        isOnboarded: true // Skip the onboarding wizard, go straight to dashboard
      };
      
      await supabaseService.saveUser(newUser);
      console.log('✅ Employee user profile created');

      // Update employee status to PENDING_VERIFICATION (waiting for employer to verify documents)
      const updatedEmployee = { ...employee, status: 'PENDING_VERIFICATION' as any };
      await supabaseService.saveEmployee(updatedEmployee, finalCompanyId);
      console.log('✅ Employee status updated to PENDING_VERIFICATION');
      
      // Login the user directly
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: employee.email,
        password: password,
      });

      if (signInError) {
        console.error('❌ Sign in error:', signInError);
        toast.error('Account created but login failed. Please login manually.');
        setEmployeeAccountSetup(null);
        window.history.replaceState({}, '', window.location.pathname);
        return;
      }

      console.log('✅ User logged in successfully');
      toast.success('Account created successfully! Welcome aboard!');
      setEmployeeAccountSetup(null);
      
      // Wait for auth state to update, then reload to ensure everything is in sync
      await new Promise(resolve => setTimeout(resolve, 500));
      window.location.href = '/?page=portal-home';
      
    } catch (error: any) {
      console.error('Error setting up employee account:', error);
      toast.error(error?.message || 'Failed to create account. Please try again or contact your employer.');
    }
  };

  // Show employee account setup if needed
  if (employeeAccountSetup) {
    const EmployeeAccountSetup = lazy(() => import('./pages/EmployeeAccountSetup').then(m => ({ default: m.EmployeeAccountSetup })));
    return (
      <Suspense fallback={<div className="flex items-center justify-center min-h-screen"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-jam-orange"></div></div>}>
        <EmployeeAccountSetup
          employee={employeeAccountSetup.employee}
          companyName={employeeAccountSetup.companyName}
          onComplete={handleEmployeeAccountSetup}
          onCancel={() => {
            setEmployeeAccountSetup(null);
            window.history.replaceState({}, '', window.location.pathname);
          }}
        />
      </Suspense>
    );
  }

  if (currentPath === 'reset-password') {
    return (
      <Suspense fallback={<LoadingFallback />}>
        <Toaster richColors position="top-right" />
        <ResetPassword />
      </Suspense>
    );
  }

  if (!user) {
    return (
      <Suspense fallback={<LoadingFallback />}>
        <Toaster richColors position="top-right" />
        <CookieConsent />
        {currentPath === 'login' && <Login onLoginSuccess={onLoginSuccess} onBack={() => navigateTo('home')} onRegisterClick={() => navigateTo('signup')} />}
        {currentPath === 'signup' && <Signup onSignupSuccess={onSignupSuccess} onLoginClick={() => navigateTo('login')} onBack={() => navigateTo('home')} onNavigate={navigateTo} plans={plans} />}
        {currentPath === 'pricing' && <Pricing onSignup={() => navigateTo('signup')} onLogin={() => navigateTo('login')} onBack={() => navigateTo('home')} onFeaturesClick={() => navigateTo('features')} onFaqClick={() => navigateTo('faq')} plans={plans} />}
        {currentPath === 'features' && <Features onSignup={() => navigateTo('signup')} onLogin={() => navigateTo('login')} onBack={() => navigateTo('home')} onPricingClick={() => navigateTo('pricing')} onFaqClick={() => navigateTo('faq')} />}
        {currentPath === 'faq' && <FAQ onSignup={() => navigateTo('signup')} onLogin={() => navigateTo('login')} onBack={() => navigateTo('home')} onPricingClick={() => navigateTo('pricing')} onFeaturesClick={() => navigateTo('features')} />}
        {currentPath === 'privacy-policy' && <PrivacyPolicy onBack={() => navigateTo('home')} />}
        {currentPath === 'terms-of-service' && <TermsOfService onBack={() => navigateTo('home')} />}
        {currentPath === 'home' && <LandingPage plans={plans} onLogin={() => navigateTo('login')} onSignup={() => navigateTo('signup')} onPricingClick={() => navigateTo('pricing')} onFeaturesClick={() => navigateTo('features')} onFaqClick={() => navigateTo('faq')} onPrivacyClick={() => navigateTo('privacy-policy')} onTermsClick={() => navigateTo('terms-of-service')} />}
        {!['login','signup','pricing','features','faq','home','privacy-policy','terms-of-service'].includes(currentPath) && 
          <NotFound onGoHome={() => navigateTo('home')} />
        }
      </Suspense>
    );
  }

  const renderPage = () => {
    if (dataLoading) return <LoadingFallback />;

    if (!user.isOnboarded) {
        if (user.role === Role.EMPLOYEE) return <EmployeeOnboardingWizard companyName={companyData?.name || 'Company'} onComplete={handleEmployeeWizardComplete} />;
        return <Onboarding departments={departments} onComplete={handleCompanyOnboardComplete} onUpdateDepartments={setDepartments} />;
    }

    switch (currentPath) {
      case 'dashboard': return <Dashboard employees={employees} leaveRequests={leaveRequests} payRunHistory={payRunHistory} onNavigate={navigateTo} companyData={companyData || undefined} />;
      case 'employees': return <Employees employees={employees} payRunHistory={payRunHistory} companyData={companyData!} onAddEmployee={handleAddEmployee} onUpdateEmployee={handleUpdateEmployee} onDeleteEmployee={handleDeleteEmployee} onSimulateOnboarding={e => alert(`Link: ${window.location.origin}/?token=${e.onboardingToken}`)} departments={departments} designations={designations} assets={assets} onUpdateAssets={setAssets} reviews={reviews} onUpdateReviews={setReviews} />;
      case 'payrun': return <PayRun employees={employees} timesheets={timesheets} leaveRequests={leaveRequests} onSave={handleSavePayRun} companyData={companyData!} integrationConfig={integrationConfig} payRunHistory={payRunHistory} editRunId={editRunId} onNavigate={navigateTo} />;
      case 'leave': return <Leave requests={leaveRequests} employees={employees} onStatusChange={handleUpdateLeaveStatus} onAddRequest={handleSaveLeaveRequest} onUpdateEmployee={handleUpdateEmployee} />;
      case 'documents': 
        if (!hasFeatureAccess(companyData || undefined, 'Documents')) {
          toast.error(getFeatureUpgradeMessage('Documents', companyData?.plan));
          navigateTo('dashboard');
          return <Dashboard employees={employees} leaveRequests={leaveRequests} payRunHistory={payRunHistory} onNavigate={navigateTo} companyData={companyData || undefined} />;
        }
        return <Documents templates={templates} employees={employees} companyData={companyData!} onUpdateTemplates={setTemplates} />;
      case 'reports': return <Reports history={payRunHistory} companyData={companyData!} onUpdatePayRun={async (run) => {
        setPayRunHistory(prev => prev.map(r => r.id === run.id ? run : r));
        if (isSupabaseMode && user?.companyId) await supabaseService.savePayRun(run, user.companyId);
      }} onDeletePayRun={async (runId) => {
        setPayRunHistory(prev => prev.filter(r => r.id !== runId));
        if (isSupabaseMode && user?.companyId) await supabaseService.deletePayRun(runId, user.companyId);
      }} onNavigate={navigateTo} />;
      case 'compliance': 
        if (!hasFeatureAccess(companyData || undefined, 'Compliance')) {
          toast.error(getFeatureUpgradeMessage('Compliance', companyData?.plan));
          navigateTo('dashboard');
          return <Dashboard employees={employees} leaveRequests={leaveRequests} payRunHistory={payRunHistory} onNavigate={navigateTo} companyData={companyData || undefined} />;
        }
        return <Compliance payRunHistory={payRunHistory} companyData={companyData!} />;
      case 'ai-assistant': 
        if (!hasFeatureAccess(companyData || undefined, 'AI Assistant')) {
          toast.error(getFeatureUpgradeMessage('AI Assistant', companyData?.plan));
          navigateTo('dashboard');
          return <Dashboard employees={employees} leaveRequests={leaveRequests} payRunHistory={payRunHistory} onNavigate={navigateTo} companyData={companyData || undefined} />;
        }
        return <AiAssistant employees={employees} />;
      case 'settings': return <Settings companyData={companyData ?? undefined} onUpdateCompany={handleUpdateCompany} taxConfig={taxConfig} onUpdateTaxConfig={setTaxConfig} integrationConfig={integrationConfig} onUpdateIntegration={setIntegrationConfig} departments={departments} onUpdateDepartments={setDepartments} designations={designations} onUpdateDesignations={setDesignations} plans={plans} />;
      case 'profile': return <Profile user={user} onUpdate={updateUser} />;
      case 'timesheets': return <TimeSheets timesheets={timesheets} onUpdate={ts => setTimesheets(timesheets.map(t => t.id === ts.id ? ts : t))} />;
      case 'portal-home': return <EmployeePortal user={user} employee={employees.find(e => e.email === user.email)} view="home" leaveRequests={leaveRequests} onRequestLeave={handleSaveLeaveRequest} payRunHistory={payRunHistory} companyData={companyData || undefined} onUpdateEmployee={handleUpdateEmployee} />;
      case 'portal-timesheets': return <EmployeePortal user={user} employee={employees.find(e => e.email === user.email)} view="timesheets" leaveRequests={leaveRequests} onRequestLeave={handleSaveLeaveRequest} onUpdateEmployee={handleUpdateEmployee} />;
      case 'portal-leave': return <EmployeePortal user={user} employee={employees.find(e => e.email === user.email)} view="leave" leaveRequests={leaveRequests} onRequestLeave={handleSaveLeaveRequest} onUpdateEmployee={handleUpdateEmployee} />;
      case 'portal-docs': return <EmployeePortal user={user} employee={employees.find(e => e.email === user.email)} view="documents" leaveRequests={leaveRequests} onRequestLeave={handleSaveLeaveRequest} payRunHistory={payRunHistory} companyData={companyData || undefined} onUpdateEmployee={handleUpdateEmployee} />;
      case 'portal-profile': return <EmployeePortal user={user} employee={employees.find(e => e.email === user.email)} view="profile" leaveRequests={leaveRequests} onRequestLeave={handleSaveLeaveRequest} onUpdateEmployee={handleUpdateEmployee} />;
        case 'sa-overview': case 'sa-tenants': case 'sa-billing': case 'sa-health': case 'sa-users': case 'sa-logs': case 'sa-settings': case 'sa-plans':
          return <SuperAdmin plans={plans} onUpdatePlans={handleUpdatePlans} onImpersonate={handleImpersonation} initialTab={currentPath.replace('sa-', '')} />;
      case 'reseller-dashboard': return <ResellerDashboard onManageClient={handleImpersonation} plans={plans} />;
      default: return <NotFound onGoHome={() => navigateTo('dashboard')} />;
    }
  };

  let layoutVariant: 'admin' | 'portal' | 'super_admin' | 'blank' = 'admin';
  if (user.role === Role.EMPLOYEE) layoutVariant = 'portal';
  if (user.role === Role.SUPER_ADMIN && !user.originalRole) layoutVariant = 'super_admin';
  if (!user.isOnboarded) layoutVariant = 'blank';

  return (
    <ErrorBoundary>
      <Layout 
            currentPath={currentPath} 
            onNavigate={navigateTo} 
            variant={layoutVariant}
            managingCompanyName={companyData?.name || 'Your Company'}
            systemBanner={globalConfig?.systemBanner}
            companyData={companyData || undefined}
            subscriptionStatus={companyData?.subscriptionStatus}
            isOverLimit={subscription.isOverLimit} // NEW: Pass soft lock state
        >
          <Toaster richColors position="top-right" />
          <Suspense fallback={<LoadingFallback />}>
            {renderPage()}
          </Suspense>
          <CookieConsent />
        </Layout>
    </ErrorBoundary>
  );
}


const App = AppContent;
export default function AppWrapper() {
  return (
    <AuthProvider>
      <App />
    </AuthProvider>
  );
}