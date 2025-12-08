import { useState, useEffect, Suspense, lazy } from 'react';
import { Toaster, toast } from 'sonner';
import { Layout } from './components/Layout';
import { CookieConsent } from './components/CookieConsent';
import { ErrorBoundary } from './components/ErrorBoundary'; 
import { storage } from './services/storage';
import { supabaseService } from './services/supabaseService';
import { User, Role, Employee, PayRun as PayRunType, LeaveRequest, WeeklyTimesheet, CompanySettings, IntegrationConfig, TaxConfig, DocumentTemplate, PricingPlan, Department, Designation, Asset, PerformanceReview } from './types';
import { INITIAL_EMPLOYEES, INITIAL_DEPARTMENTS, INITIAL_DESIGNATIONS, INITIAL_ASSETS, INITIAL_REVIEWS } from './services/mockBackend';
import { AuthProvider, useAuth } from './context/AuthContext';
import { useSubscription } from './hooks/useSubscription';

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
const LandingPage = lazy(() => import('./pages/LandingPage').then(m => ({ default: m.LandingPage })));
const Pricing = lazy(() => import('./pages/Pricing').then(m => ({ default: m.Pricing })));
const Features = lazy(() => import('./pages/Features').then(m => ({ default: m.Features })));
const FAQ = lazy(() => import('./pages/FAQ').then(m => ({ default: m.FAQ })));
const Onboarding = lazy(() => import('./pages/Onboarding').then(m => ({ default: m.Onboarding })));
const EmployeePortal = lazy(() => import('./pages/EmployeePortal').then(m => ({ default: m.EmployeePortal })));
const SuperAdmin = lazy(() => import('./pages/SuperAdmin').then(m => ({ default: m.SuperAdmin })));
const ResellerDashboard = lazy(() => import('./pages/ResellerDashboard').then(m => ({ default: m.ResellerDashboard })));
const EmployeeOnboardingWizard = lazy(() => import('./pages/EmployeeOnboardingWizard').then(m => ({ default: m.EmployeeOnboardingWizard })));

const INITIAL_COMPANY_DATA: CompanySettings = {
  name: 'JamCorp Ltd.',
  trn: '123-456-789',
  address: '123 Knutsford Blvd, Kingston 5',
  phone: '(876) 555-0199',
  bankName: 'NCB',
  accountNumber: '404123456',
  branchCode: '52431',
  plan: 'Free',
  subscriptionStatus: 'ACTIVE'
};

const INITIAL_TAX_CONFIG: TaxConfig = {
  nisRate: 0.03, nisCap: 5000000,
  nhtRate: 0.02,
  edTaxRate: 0.0225,
  payeThreshold: 1500096,
  payeRateStd: 0.25, payeRateHigh: 0.30
};

const INITIAL_PLANS: PricingPlan[] = [
    { id: 'p1', name: 'Free', priceConfig: { type: 'free', monthly: 0, annual: 0 }, description: 'For small businesses (<5 emp)', limit: '5 Employees', features: ['Basic Payroll', 'Payslip PDF'], cta: 'Start Free', highlight: false, color: 'bg-white', textColor: 'text-gray-900', isActive: true },
    { id: 'p2', name: 'Starter', priceConfig: { type: 'flat', monthly: 2000, annual: 20000 }, description: 'Growing teams needing compliance', limit: '25 Employees', features: ['S01/S02 Reports', 'ACH Bank Files', 'Email Support'], cta: 'Get Started', highlight: true, color: 'bg-jam-black', textColor: 'text-white', isActive: true },
    { id: 'p3', name: 'Pro', priceConfig: { type: 'per_emp', monthly: 500, annual: 5000 }, description: 'Larger organizations', limit: 'Unlimited', features: ['GL Integration', 'Employee Portal', 'Advanced HR'], cta: 'Contact Sales', highlight: false, color: 'bg-white', textColor: 'text-gray-900', isActive: true },
    { id: 'p4', name: 'Reseller', priceConfig: { type: 'base', monthly: 0, annual: 0, baseFee: 3000, perUserFee: 100 }, description: 'For Accountants & Payroll Bureaus', limit: 'Unlimited Tenants', features: ['White Label', 'Client Management', 'Wholesale Rates'], cta: 'Partner With Us', highlight: false, color: 'bg-gray-100', textColor: 'text-gray-900', isActive: true }
];

function AppContent() {
  const { user, impersonate, login } = useAuth(); 
  const globalConfig = storage.getGlobalConfig();
  const isSupabaseMode = globalConfig?.dataSource === 'SUPABASE';

  const getInitialPath = () => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const page = params.get('page');
      if (page) return page;
    }
    return user ? 'dashboard' : 'home';
  };

  const [currentPath, setCurrentPath] = useState(getInitialPath());
  const [isLoading, setIsLoading] = useState(false);
  
  // Data State
  const [employees, setEmployees] = useState<Employee[]>(storage.getEmployees() || INITIAL_EMPLOYEES);
  const [payRunHistory, setPayRunHistory] = useState<PayRunType[]>(storage.getPayRuns() || []);
  const [leaveRequests, setLeaveRequests] = useState<LeaveRequest[]>(storage.getLeaveRequests() || []);
  const [timesheets, setTimesheets] = useState<WeeklyTimesheet[]>(storage.getTimesheets() || []);
  
  // Config State
  const [companyData, setCompanyData] = useState<CompanySettings>(storage.getCompanyData() || INITIAL_COMPANY_DATA);
  const [taxConfig, setTaxConfig] = useState<TaxConfig>(storage.getTaxConfig() || INITIAL_TAX_CONFIG);
  const [integrationConfig, setIntegrationConfig] = useState<IntegrationConfig>(storage.getIntegrationConfig() || { provider: 'CSV', mappings: [] });
  const [templates, setTemplates] = useState<DocumentTemplate[]>(storage.getTemplates() || []);
  const [plans, setPlans] = useState<PricingPlan[]>(storage.getPricingPlans() || INITIAL_PLANS);
  const [departments, setDepartments] = useState<Department[]>(storage.getDepartments() || INITIAL_DEPARTMENTS);
  const [designations, setDesignations] = useState<Designation[]>(storage.getDesignations() || INITIAL_DESIGNATIONS);
  const [assets, setAssets] = useState<Asset[]>(storage.getAssets() || INITIAL_ASSETS);
  const [reviews, setReviews] = useState<PerformanceReview[]>(storage.getReviews() || INITIAL_REVIEWS);

  // --- SUBSCRIPTION LOGIC ---
  const subscription = useSubscription(employees, companyData, plans);

  const navigateTo = (path: string) => {
    setCurrentPath(path);
    try {
        const newUrl = new URL(window.location.href);
        newUrl.searchParams.set('page', path);
        window.history.pushState({ path }, '', newUrl.toString());
    } catch (e) {
        console.warn("Navigation failed to update URL history:", e);
    }
  };

  // ... (Invite Handler & Data Sync unchanged) ...
  useEffect(() => {
      const params = new URLSearchParams(window.location.search);
      const token = params.get('token');
      if (token && employees.length > 0) {
          const invitee = employees.find(e => e.onboardingToken === token);
          if (invitee) {
             if (!user || user.email !== invitee.email) {
                 const tempUser: User = {
                     id: invitee.id,
                     name: `${invitee.firstName} ${invitee.lastName}`,
                     email: invitee.email,
                     role: invitee.role,
                     companyId: 'comp-123',
                     isOnboarded: false
                 };
                 login(tempUser);
                 toast.success("Welcome! Please complete your onboarding.");
                 window.history.replaceState({}, '', '/');
             }
          }
      }
  }, [employees, user, login]);

  useEffect(() => {
    async function loadData() {
      if (isSupabaseMode && user?.companyId) {
        setIsLoading(true);
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
          setIsLoading(false);
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
  useEffect(() => storage.savePricingPlans(plans), [plans]);
  useEffect(() => storage.saveDepartments(departments), [departments]);
  useEffect(() => storage.saveDesignations(designations), [designations]);
  useEffect(() => storage.saveAssets(assets), [assets]);
  useEffect(() => storage.saveReviews(reviews), [reviews]);

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
  
  const handleSavePayRun = async (run: PayRunType) => {
    setPayRunHistory(prev => [run, ...prev]);
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
      if (!isSupabaseMode) setCompanyData({ ...companyData, name: client.companyName });
      navigateTo('dashboard');
  };
  const handleCompanyOnboardComplete = async (data: CompanySettings, importedEmployees: Employee[]) => {
      setCompanyData(data);
      setEmployees(prev => [...prev, ...importedEmployees]);
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

  if (!user) {
    return (
      <Suspense fallback={<LoadingFallback />}>
        <CookieConsent />
        {currentPath === 'login' && <Login onLoginSuccess={onLoginSuccess} onBack={() => navigateTo('home')} onRegisterClick={() => navigateTo('signup')} />}
        {currentPath === 'signup' && <Signup onSignupSuccess={onSignupSuccess} onLoginClick={() => navigateTo('login')} plans={plans} />}
        {currentPath === 'pricing' && <Pricing onSignup={() => navigateTo('signup')} onLogin={() => navigateTo('login')} onBack={() => navigateTo('home')} onFeaturesClick={() => navigateTo('features')} onFaqClick={() => navigateTo('faq')} plans={plans} />}
        {currentPath === 'features' && <Features onSignup={() => navigateTo('signup')} onLogin={() => navigateTo('login')} onBack={() => navigateTo('home')} onPricingClick={() => navigateTo('pricing')} onFaqClick={() => navigateTo('faq')} />}
        {currentPath === 'faq' && <FAQ onSignup={() => navigateTo('signup')} onLogin={() => navigateTo('login')} onBack={() => navigateTo('home')} onPricingClick={() => navigateTo('pricing')} onFeaturesClick={() => navigateTo('features')} />}
        {(currentPath === 'home' || !['login','signup','pricing','features','faq'].includes(currentPath)) && 
          <LandingPage onLogin={() => navigateTo('login')} onSignup={() => navigateTo('signup')} onPricingClick={() => navigateTo('pricing')} onFeaturesClick={() => navigateTo('features')} onFaqClick={() => navigateTo('faq')} />
        }
      </Suspense>
    );
  }

  const renderPage = () => {
    if (isLoading) return <LoadingFallback />;

    if (!user.isOnboarded) {
        if (user.role === Role.EMPLOYEE) return <EmployeeOnboardingWizard companyName={companyData.name} onComplete={handleEmployeeWizardComplete} />;
        return <Onboarding departments={departments} onComplete={handleCompanyOnboardComplete} />;
    }

    switch (currentPath) {
      case 'dashboard': return <Dashboard employees={employees} leaveRequests={leaveRequests} payRunHistory={payRunHistory} onNavigate={navigateTo} />;
      case 'employees': return <Employees employees={employees} payRunHistory={payRunHistory} companyData={companyData} onAddEmployee={handleAddEmployee} onUpdateEmployee={handleUpdateEmployee} onSimulateOnboarding={e => alert(`Link: ${window.location.origin}/?token=${e.onboardingToken}`)} departments={departments} designations={designations} assets={assets} onUpdateAssets={setAssets} reviews={reviews} onUpdateReviews={setReviews} />;
      case 'payrun': return <PayRun employees={employees} timesheets={timesheets} leaveRequests={leaveRequests} onSave={handleSavePayRun} companyData={companyData} integrationConfig={integrationConfig} payRunHistory={payRunHistory} />;
      case 'leave': return <Leave requests={leaveRequests} employees={employees} onStatusChange={handleUpdateLeaveStatus} onAddRequest={handleSaveLeaveRequest} onUpdateEmployee={handleUpdateEmployee} />;
      case 'documents': return <Documents templates={templates} employees={employees} companyData={companyData} onUpdateTemplates={setTemplates} />;
      case 'reports': return <Reports history={payRunHistory} companyData={companyData} />;
      case 'compliance': return <Compliance payRunHistory={payRunHistory} companyData={companyData} />;
      case 'ai-assistant': return <AiAssistant employees={employees} />;
      case 'settings': return <Settings companyData={companyData} onUpdateCompany={handleUpdateCompany} taxConfig={taxConfig} onUpdateTaxConfig={setTaxConfig} integrationConfig={integrationConfig} onUpdateIntegration={setIntegrationConfig} departments={departments} onUpdateDepartments={setDepartments} designations={designations} onUpdateDesignations={setDesignations} plans={plans} />;
      case 'timesheets': return <TimeSheets timesheets={timesheets} onUpdate={ts => setTimesheets(timesheets.map(t => t.id === ts.id ? ts : t))} />;
      case 'portal-home': return <EmployeePortal user={user} employee={employees.find(e => e.email === user.email)} view="home" leaveRequests={leaveRequests} onRequestLeave={handleSaveLeaveRequest} payRunHistory={payRunHistory} companyData={companyData} />;
      case 'portal-timesheets': return <EmployeePortal user={user} employee={employees.find(e => e.email === user.email)} view="timesheets" leaveRequests={leaveRequests} onRequestLeave={handleSaveLeaveRequest} />;
      case 'portal-leave': return <EmployeePortal user={user} employee={employees.find(e => e.email === user.email)} view="leave" leaveRequests={leaveRequests} onRequestLeave={handleSaveLeaveRequest} />;
      case 'portal-docs': return <EmployeePortal user={user} employee={employees.find(e => e.email === user.email)} view="documents" leaveRequests={leaveRequests} onRequestLeave={handleSaveLeaveRequest} payRunHistory={payRunHistory} companyData={companyData} />;
      case 'portal-profile': return <EmployeePortal user={user} employee={employees.find(e => e.email === user.email)} view="profile" leaveRequests={leaveRequests} onRequestLeave={handleSaveLeaveRequest} />;
      case 'sa-overview': case 'sa-tenants': case 'sa-billing': case 'sa-health': case 'sa-users': case 'sa-logs': case 'sa-settings': case 'sa-plans':
          return <SuperAdmin plans={plans} onUpdatePlans={setPlans} onImpersonate={handleImpersonation} initialTab={currentPath.replace('sa-', '')} />;
      case 'reseller-dashboard': return <ResellerDashboard onManageClient={handleImpersonation} plans={plans} />;
      default: return <Dashboard employees={employees} leaveRequests={leaveRequests} payRunHistory={payRunHistory} onNavigate={navigateTo} />;
    }
  };

  let layoutVariant: 'admin' | 'portal' | 'super_admin' | 'blank' = 'admin';
  if (user.role === Role.EMPLOYEE) layoutVariant = 'portal';
  if (user.role === Role.SUPER_ADMIN && !user.originalRole) layoutVariant = 'super_admin';
  if (!user.isOnboarded) layoutVariant = 'blank';

  return (
    <ErrorBoundary>
      <AuthProvider>
        <Layout 
            currentPath={currentPath} 
            onNavigate={navigateTo} 
            variant={layoutVariant}
            managingCompanyName={companyData.name}
            systemBanner={globalConfig?.systemBanner}
            subscriptionStatus={companyData.subscriptionStatus}
            isOverLimit={subscription.isOverLimit} // NEW: Pass soft lock state
        >
          <Toaster richColors position="top-right" />
          <Suspense fallback={<LoadingFallback />}>
            {renderPage()}
          </Suspense>
          <CookieConsent />
        </Layout>
      </AuthProvider>
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