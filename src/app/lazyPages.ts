import { lazy } from 'react';

const lazyWithRetry = (componentImport: () => Promise<any>) => {
  return lazy(async () => {
    const pageHasAlreadyBeenForceRefreshed = JSON.parse(
      window.sessionStorage.getItem('page-has-been-force-refreshed') || 'false'
    );

    try {
      const component = await componentImport();
      window.sessionStorage.setItem('page-has-been-force-refreshed', 'false');
      return component;
    } catch (error) {
      if (!pageHasAlreadyBeenForceRefreshed) {
        window.sessionStorage.setItem('page-has-been-force-refreshed', 'true');
        window.location.reload();
        // Return a promise that never resolves while the page reloads
        return new Promise<{ default: any }>(() => {});
      }
      throw error;
    }
  });
};

export const DashboardPage = lazyWithRetry(() => import('../pages/Dashboard').then((m) => ({ default: m.Dashboard })));
export const EmployeesPage = lazyWithRetry(() => import('../pages/Employees').then((m) => ({ default: m.Employees })));
export const PayRunPage = lazyWithRetry(() => import('../pages/PayRun').then((m) => ({ default: m.PayRun })));
export const LeavePage = lazyWithRetry(() => import('../pages/Leave').then((m) => ({ default: m.Leave })));
export const DocumentsPage = lazyWithRetry(() => import('../pages/Documents').then((m) => ({ default: m.Documents })));
export const ReportsPage = lazyWithRetry(() => import('../pages/Reports').then((m) => ({ default: m.Reports })));
export const SettingsPage = lazyWithRetry(() => import('../pages/Settings').then((m) => ({ default: m.Settings })));
export const TimeSheetsPage = lazyWithRetry(() => import('../pages/TimeSheets').then((m) => ({ default: m.TimeSheets })));
export const CompliancePage = lazyWithRetry(() => import('../pages/Compliance').then((m) => ({ default: m.Compliance })));
export const AiAssistantPage = lazyWithRetry(() => import('../pages/AiAssistant').then((m) => ({ default: m.AiAssistant })));
export const LoginPage = lazyWithRetry(() => import('../pages/Login').then((m) => ({ default: m.Login })));
export const SignupPage = lazyWithRetry(() => import('../pages/Signup').then((m) => ({ default: m.Signup })));
export const ResetPasswordPage = lazyWithRetry(() => import('../pages/ResetPassword').then((m) => ({ default: m.ResetPassword })));
export const PrivacyPolicyPage = lazyWithRetry(() => import('../pages/PrivacyPolicy').then((m) => ({ default: m.PrivacyPolicy })));
export const TermsOfServicePage = lazyWithRetry(() => import('../pages/TermsOfService').then((m) => ({ default: m.TermsOfService })));
export const LandingPagePage = lazyWithRetry(() => import('../pages/LandingPage').then((m) => ({ default: m.LandingPage })));
export const PricingPage = lazyWithRetry(() => import('../pages/Pricing').then((m) => ({ default: m.Pricing })));
export const FeaturesPage = lazyWithRetry(() => import('../pages/Features').then((m) => ({ default: m.Features })));
export const FAQPage = lazyWithRetry(() => import('../pages/FAQ').then((m) => ({ default: m.FAQ })));
export const OnboardingPage = lazyWithRetry(() => import('../pages/Onboarding').then((m) => ({ default: m.Onboarding })));
export const EmployeePortalPage = lazyWithRetry(() => import('../pages/EmployeePortal').then((m) => ({ default: m.EmployeePortal })));
export const SuperAdminPage = lazyWithRetry(() => import('../pages/SuperAdmin').then((m) => ({ default: m.SuperAdmin })));
export const ResellerDashboardPage = lazyWithRetry(() => import('../pages/ResellerDashboard').then((m) => ({ default: m.ResellerDashboard })));
export const EmployeeOnboardingWizardPage = lazyWithRetry(() => import('../pages/EmployeeOnboardingWizard').then((m) => ({ default: m.EmployeeOnboardingWizard })));
export const NotFoundPage = lazyWithRetry(() => import('../pages/NotFound').then((m) => ({ default: m.NotFound })));
export const ProfilePage = lazyWithRetry(() => import('../pages/Profile').then((m) => ({ default: m.Profile })));
export const VerifyEmailPage = lazyWithRetry(() => import('../pages/VerifyEmail').then((m) => ({ default: m.VerifyEmail })));
export const PublicPayslipDownloadPage = lazyWithRetry(() => import('../pages/PublicPayslipDownload').then((m) => ({ default: m.PublicPayslipDownload })));
export const EmployeeAccountSetupPage = lazyWithRetry(() => import('../pages/EmployeeAccountSetup').then((m) => ({ default: m.EmployeeAccountSetup })));

