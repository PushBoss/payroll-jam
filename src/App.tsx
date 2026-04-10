import { Suspense } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { PublicApp } from './app/PublicApp';
import { AuthenticatedApp } from './app/AuthenticatedApp';
import { AppLoadingFallback } from './app/AppLoadingFallback';
import { useAppNavigation } from './app/useAppNavigation';
import { useAppData } from './app/useAppData';
import { useAuthRedirects } from './app/useAuthRedirects';
import { EmployeeAccountSetupPage } from './app/lazyPages';

function AppContent() {
  const { user, impersonate, updateUser, logout, isLoading } = useAuth();
  const { currentPath, editRunId, navigateTo } = useAppNavigation(user);
  const appData = useAppData({ user, updateUser, impersonate, navigateTo });

  useAuthRedirects({
    user,
    isLoading,
    currentPath,
    navigateTo,
    logout,
    employees: appData.employees,
    isSupabaseMode: appData.isSupabaseMode,
    companyData: appData.companyData,
    setVerifyEmail: appData.setVerifyEmail,
    setEmployeeAccountSetup: appData.setEmployeeAccountSetup,
  });

  if (isLoading) {
    return <AppLoadingFallback />;
  }

  if (appData.employeeAccountSetup) {
    return (
      <Suspense fallback={<AppLoadingFallback />}>
        <EmployeeAccountSetupPage
          employee={appData.employeeAccountSetup.employee}
          companyName={appData.employeeAccountSetup.companyName}
          onComplete={appData.handleEmployeeAccountSetup}
          onCancel={() => {
            appData.setEmployeeAccountSetup(null);
            if (typeof window !== 'undefined') {
              window.history.replaceState({}, '', window.location.pathname);
            }
          }}
        />
      </Suspense>
    );
  }

  if (!user || currentPath === 'contact-us' || currentPath === 'reset-password') {
    return <PublicApp currentPath={currentPath} navigateTo={navigateTo} appData={appData} user={user} />;
  }

  return (
    <AuthenticatedApp
      currentPath={currentPath}
      editRunId={editRunId}
      navigateTo={navigateTo}
      user={user}
      updateUser={updateUser}
      appData={appData}
    />
  );
}

export default function AppWrapper() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}
