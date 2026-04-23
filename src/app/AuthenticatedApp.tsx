import React, { Suspense } from 'react';
import { Toaster, toast } from 'sonner';
import { ErrorBoundary } from '../components/ErrorBoundary';
import { Layout } from '../components/Layout';
import { CookieConsent } from '../components/CookieConsent';
import { User, Role } from '../core/types';
import { getFeatureUpgradeMessage, hasFeatureAccess } from '../utils/featureAccess';
import { AppLoadingFallback } from './AppLoadingFallback';
import { AppRoute } from './routes';
import { NavigateFunction } from './useAppNavigation';
import { AppDataModel } from './useAppData';
import {
  AiAssistantPage,
  CompliancePage,
  DashboardPage,
  DocumentsPage,
  EmployeeOnboardingWizardPage,
  EmployeePortalPage,
  EmployeesPage,
  NotFoundPage,
  OnboardingPage,
  PayRunPage,
  ProfilePage,
  ReportsPage,
  ResellerDashboardPage,
  SettingsPage,
  SuperAdminPage,
  TimeSheetsPage,
  LeavePage,
} from './lazyPages';

interface AuthenticatedAppProps {
  currentPath: AppRoute;
  editRunId?: string;
  navigateTo: NavigateFunction;
  user: User;
  updateUser: (updates: Partial<User>) => void;
  appData: AppDataModel;
}

export const AuthenticatedApp: React.FC<AuthenticatedAppProps> = ({
  currentPath,
  editRunId,
  navigateTo,
  user,
  updateUser,
  appData,
}) => {
  const navigate = (path: string) => navigateTo(path as AppRoute);
  const navigateWithEditRun = (path: string, params?: { editRunId?: string }) =>
    navigateTo(path as AppRoute, params);

  const renderPage = () => {
    if (appData.dataLoading) return <AppLoadingFallback />;

    if (!user.isOnboarded && user.role === Role.OWNER) {
      return (
        <OnboardingPage
          departments={appData.departments}
          onComplete={appData.handleCompanyOnboardComplete}
          onUpdateDepartments={appData.handleUpdateDepartments}
        />
      );
    }

    if (!user.isOnboarded && user.role === Role.EMPLOYEE) {
      return (
        <EmployeeOnboardingWizardPage
          companyName={appData.companyData?.name || 'Company'}
          onComplete={appData.handleEmployeeWizardComplete}
        />
      );
    }

    switch (currentPath) {
      case 'dashboard':
        return (
          <DashboardPage
            employees={appData.employees}
            leaveRequests={appData.leaveRequests}
            payRunHistory={appData.payRunHistory}
            onNavigate={navigate}
            companyData={appData.companyData || undefined}
          />
        );
      case 'employees':
        return (
          <EmployeesPage
            employees={appData.employees}
            payRunHistory={appData.payRunHistory}
            companyData={appData.companyData!}
            onAddEmployee={appData.handleAddEmployee}
            onUpdateEmployee={appData.handleUpdateEmployee}
            onDeleteEmployee={appData.handleDeleteEmployee}
            onSimulateOnboarding={(employee) => alert(`Link: ${window.location.origin}/?token=${employee.onboardingToken}`)}
            departments={appData.departments}
            designations={appData.designations}
            assets={appData.assets}
            onUpdateAssets={appData.setAssets}
            reviews={appData.reviews}
            onUpdateReviews={appData.setReviews}
            plans={appData.plans}
            users={appData.users}
            onNavigate={navigate}
            onUpdateDepartments={appData.handleUpdateDepartments}
            onUpdateCompany={appData.handleUpdateCompany}
          />
        );
      case 'payrun':
        return (
          <PayRunPage
            employees={appData.employees}
            timesheets={appData.timesheets}
            leaveRequests={appData.leaveRequests}
            onSave={appData.handleSavePayRun}
            companyData={appData.companyData!}
            integrationConfig={appData.integrationConfig}
            payRunHistory={appData.payRunHistory}
            editRunId={editRunId}
            onNavigate={navigateWithEditRun}
          />
        );
      case 'leave':
        return (
          <LeavePage
            requests={appData.leaveRequests}
            employees={appData.employees}
            onStatusChange={appData.handleUpdateLeaveStatus}
            onAddRequest={appData.handleSaveLeaveRequest}
            onUpdateEmployee={appData.handleUpdateEmployee}
          />
        );
      case 'documents':
        if (!hasFeatureAccess(appData.companyData || undefined, 'Documents')) {
          toast.error(getFeatureUpgradeMessage('Documents', appData.companyData?.plan));
          navigateTo('dashboard', { replace: true });
          return null;
        }
        return (
          <DocumentsPage
            templates={appData.templates}
            employees={appData.employees}
            companyData={appData.companyData!}
            onUpdateTemplates={appData.setTemplates}
          />
        );
      case 'reports':
        return (
          <ReportsPage
            history={appData.payRunHistory}
            companyData={appData.companyData!}
            onUpdatePayRun={appData.handleSavePayRun}
            onDeletePayRun={appData.handleDeletePayRun}
            onNavigate={navigate}
            employees={appData.employees}
            integrationConfig={appData.integrationConfig}
          />
        );
      case 'compliance':
        if (!hasFeatureAccess(appData.companyData || undefined, 'Compliance')) {
          toast.error(getFeatureUpgradeMessage('Compliance', appData.companyData?.plan));
          navigateTo('dashboard', { replace: true });
          return null;
        }
        return <CompliancePage payRunHistory={appData.payRunHistory} companyData={appData.companyData!} />;
      case 'ai-assistant':
        if (!hasFeatureAccess(appData.companyData || undefined, 'AI Assistant')) {
          toast.error(getFeatureUpgradeMessage('AI Assistant', appData.companyData?.plan));
          navigateTo('dashboard', { replace: true });
          return null;
        }
        return <AiAssistantPage />;
      case 'settings':
        return (
          <SettingsPage
            companyData={appData.companyData ?? undefined}
            onUpdateCompany={appData.handleUpdateCompany}
            taxConfig={appData.taxConfig}
            onUpdateTaxConfig={appData.handleUpdateTaxConfig}
            integrationConfig={appData.integrationConfig}
            onUpdateIntegration={appData.setIntegrationConfig}
            departments={appData.departments}
            onUpdateDepartments={appData.handleUpdateDepartments}
            designations={appData.designations}
            onUpdateDesignations={appData.handleUpdateDesignations}
            plans={appData.plans}
          />
        );
      case 'profile':
        return <ProfilePage user={user} onUpdate={updateUser as any} />;
      case 'timesheets':
        return (
          <TimeSheetsPage
            timesheets={appData.timesheets}
            onUpdate={(timesheet) =>
              appData.setTimesheets(appData.timesheets.map((saved) => (saved.id === timesheet.id ? timesheet : saved)))
            }
          />
        );
      case 'portal-home':
        return (
          <EmployeePortalPage
            user={user}
            employee={appData.employees.find((employee) => employee.email === user.email)}
            view="home"
            leaveRequests={appData.leaveRequests}
            onRequestLeave={appData.handleSaveLeaveRequest}
            payRunHistory={appData.payRunHistory}
            companyData={appData.companyData || undefined}
            onUpdateEmployee={appData.handleUpdateEmployee}
          />
        );
      case 'portal-timesheets':
        return (
          <EmployeePortalPage
            user={user}
            employee={appData.employees.find((employee) => employee.email === user.email)}
            view="timesheets"
            leaveRequests={appData.leaveRequests}
            onRequestLeave={appData.handleSaveLeaveRequest}
            onUpdateEmployee={appData.handleUpdateEmployee}
          />
        );
      case 'portal-leave':
        return (
          <EmployeePortalPage
            user={user}
            employee={appData.employees.find((employee) => employee.email === user.email)}
            view="leave"
            leaveRequests={appData.leaveRequests}
            onRequestLeave={appData.handleSaveLeaveRequest}
            onUpdateEmployee={appData.handleUpdateEmployee}
          />
        );
      case 'portal-docs':
        return (
          <EmployeePortalPage
            user={user}
            employee={appData.employees.find((employee) => employee.email === user.email)}
            view="documents"
            leaveRequests={appData.leaveRequests}
            onRequestLeave={appData.handleSaveLeaveRequest}
            payRunHistory={appData.payRunHistory}
            companyData={appData.companyData || undefined}
            onUpdateEmployee={appData.handleUpdateEmployee}
          />
        );
      case 'portal-profile':
        return (
          <EmployeePortalPage
            user={user}
            employee={appData.employees.find((employee) => employee.email === user.email)}
            view="profile"
            leaveRequests={appData.leaveRequests}
            onRequestLeave={appData.handleSaveLeaveRequest}
            onUpdateEmployee={appData.handleUpdateEmployee}
          />
        );
      case 'sa-overview':
      case 'sa-tenants':
      case 'sa-pending-payments':
      case 'sa-billing':
      case 'sa-health':
      case 'sa-plans':
      case 'sa-users':
      case 'sa-logs':
      case 'sa-settings':
        return (
          <SuperAdminPage
            plans={appData.plans}
            onUpdatePlans={appData.handleUpdatePlans}
            onImpersonate={appData.handleImpersonation}
            initialTab={currentPath.replace('sa-', '')}
          />
        );
      case 'reseller-dashboard':
        return <ResellerDashboardPage onManageClient={appData.handleImpersonation} plans={appData.plans} />;
      default:
        return <NotFoundPage onGoHome={() => navigateTo('dashboard')} />;
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
        onNavigate={navigate}
        variant={layoutVariant}
        managingCompanyName={appData.companyData?.name || 'Your Company'}
        systemBanner={appData.globalConfig?.systemBanner}
        companyData={appData.companyData || undefined}
        subscriptionStatus={appData.companyData?.subscriptionStatus}
        isOverLimit={appData.subscription.isOverLimit}
      >
        <Toaster richColors position="top-right" />
        <Suspense fallback={<AppLoadingFallback />}>{renderPage()}</Suspense>
        <CookieConsent />
      </Layout>
    </ErrorBoundary>
  );
};
