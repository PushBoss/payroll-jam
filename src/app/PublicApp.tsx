import React, { Suspense } from 'react';
import { Toaster } from 'sonner';
import { sendContactSupportClick } from '../services/supportService';
import { CookieConsent } from '../components/CookieConsent';
import { ContactUs } from '../pages/ContactUs';
import { User } from '../core/types';
import { AppLoadingFallback } from './AppLoadingFallback';
import { AppRoute } from './routes';
import { NavigateFunction } from './useAppNavigation';
import { AppDataModel } from './useAppData';
import {
  FAQPage,
  FeaturesPage,
  LandingPagePage,
  LoginPage,
  PricingPage,
  PrivacyPolicyPage,
  PublicPayslipDownloadPage,
  ResetPasswordPage,
  SignupPage,
  TermsOfServicePage,
  VerifyEmailPage,
} from './lazyPages';

interface PublicAppProps {
  currentPath: AppRoute;
  navigateTo: NavigateFunction;
  appData: AppDataModel;
  user: User | null;
}

export const PublicApp: React.FC<PublicAppProps> = ({ currentPath, navigateTo, appData, user }) => {
  const navigate = (path: string) => navigateTo(path as AppRoute);

  const handleContactSupport = (source: string, visitorEmail?: string) => {
    sendContactSupportClick({
      source,
      visitorEmail,
      currentUrl: typeof window !== 'undefined' ? window.location.href : undefined,
      user: null,
    }).catch((error) => console.error('Contact support click email failed:', error));

    navigateTo('contact-us');
  };

  const openVerifyEmail = (email: string) => {
    appData.setVerifyEmail(email);
    navigateTo('verify-email');
  };

  const openSignup = (plan = 'Starter', cycle: 'monthly' | 'annual' = 'monthly') => {
    appData.setSelectedPlan(plan);
    appData.setSelectedCycle(cycle);
    navigateTo('signup');
  };

  const renderRoute = () => {
    switch (currentPath) {
      case 'reset-password':
        return <ResetPasswordPage />;
      case 'contact-us':
        return (
          <ContactUs
            onBack={() => navigateTo(user ? 'dashboard' : 'home')}
            onLogin={() => navigateTo('login')}
            onSignup={() => openSignup('Starter', 'monthly')}
            onPricingClick={() => navigateTo('pricing')}
            onFeaturesClick={() => navigateTo('features')}
            onFaqClick={() => navigateTo('faq')}
            onPrivacyClick={() => navigateTo('privacy-policy')}
            onTermsClick={() => navigateTo('terms-of-service')}
          />
        );
      case 'login':
        return (
          <LoginPage
            onLoginSuccess={appData.onLoginSuccess}
            onBack={() => navigateTo('home')}
            onRegisterClick={() => navigateTo('signup')}
            onVerifyEmailClick={openVerifyEmail}
          />
        );
      case 'signup':
        return (
          <SignupPage
            initialPlan={appData.selectedPlan}
            initialBillingCycle={appData.selectedCycle}
            onLoginClick={() => navigateTo('login')}
            onVerifyEmailClick={openVerifyEmail}
            onBack={() => navigateTo('home')}
            onNavigate={navigate}
            plans={appData.plans}
          />
        );
      case 'verify-email':
        return (
          <VerifyEmailPage
            email={appData.verifyEmail}
            onLoginClick={() => navigateTo('login')}
            onBack={() => navigateTo('home')}
            onContactSupport={() => handleContactSupport('verify-email', appData.verifyEmail)}
          />
        );
      case 'download-payslip':
        return <PublicPayslipDownloadPage onBack={() => navigateTo('home')} />;
      case 'pricing':
        return (
          <PricingPage
            onSignup={(plan, cycle) => openSignup(plan, cycle)}
            onLogin={() => navigateTo('login')}
            onBack={() => navigateTo('home')}
            onFeaturesClick={() => navigateTo('features')}
            onFaqClick={() => navigateTo('faq')}
            onContactClick={() => navigateTo('contact-us')}
            onPrivacyClick={() => navigateTo('privacy-policy')}
            onTermsClick={() => navigateTo('terms-of-service')}
            plans={appData.plans}
          />
        );
      case 'features':
        return (
          <FeaturesPage
            onSignup={() => openSignup('Starter', 'monthly')}
            onLogin={() => navigateTo('login')}
            onBack={() => navigateTo('home')}
            onPricingClick={() => navigateTo('pricing')}
            onFaqClick={() => navigateTo('faq')}
            onContactClick={() => navigateTo('contact-us')}
            onPrivacyClick={() => navigateTo('privacy-policy')}
            onTermsClick={() => navigateTo('terms-of-service')}
          />
        );
      case 'faq':
        return (
          <FAQPage
            onSignup={() => openSignup('Starter', 'monthly')}
            onLogin={() => navigateTo('login')}
            onBack={() => navigateTo('home')}
            onPricingClick={() => navigateTo('pricing')}
            onFeaturesClick={() => navigateTo('features')}
            onContactClick={() => navigateTo('contact-us')}
            onPrivacyClick={() => navigateTo('privacy-policy')}
            onTermsClick={() => navigateTo('terms-of-service')}
            onContactSupport={() => handleContactSupport('faq')}
          />
        );
      case 'privacy-policy':
        return (
          <PrivacyPolicyPage
            onBack={() => navigateTo('home')}
            onFeaturesClick={() => navigateTo('features')}
            onPricingClick={() => navigateTo('pricing')}
            onFaqClick={() => navigateTo('faq')}
            onContactClick={() => navigateTo('contact-us')}
            onLogin={() => navigateTo('login')}
            onSignup={() => openSignup('Starter', 'monthly')}
            onPrivacyClick={() => navigateTo('privacy-policy')}
            onTermsClick={() => navigateTo('terms-of-service')}
          />
        );
      case 'terms-of-service':
        return (
          <TermsOfServicePage
            onBack={() => navigateTo('home')}
            onFeaturesClick={() => navigateTo('features')}
            onPricingClick={() => navigateTo('pricing')}
            onFaqClick={() => navigateTo('faq')}
            onContactClick={() => navigateTo('contact-us')}
            onLogin={() => navigateTo('login')}
            onSignup={() => openSignup('Starter', 'monthly')}
            onPrivacyClick={() => navigateTo('privacy-policy')}
            onTermsClick={() => navigateTo('terms-of-service')}
          />
        );
      case 'home':
      default:
        return (
          <LandingPagePage
            plans={appData.plans}
            onLogin={() => navigateTo('login')}
            onSignup={(plan) => openSignup(plan || 'Free', 'monthly')}
            onPricingClick={() => navigateTo('pricing')}
            onFeaturesClick={() => navigateTo('features')}
            onFaqClick={() => navigateTo('faq')}
            onContactClick={() => navigateTo('contact-us')}
            onPrivacyClick={() => navigateTo('privacy-policy')}
            onTermsClick={() => navigateTo('terms-of-service')}
          />
        );
    }
  };

  return (
    <Suspense fallback={<AppLoadingFallback />}>
      <Toaster richColors position="top-right" />
      <CookieConsent />
      {renderRoute()}
    </Suspense>
  );
};
