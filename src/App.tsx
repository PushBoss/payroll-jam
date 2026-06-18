import { Suspense } from 'react';
import { Toaster } from 'sonner';
import { AuthProvider, useAuth } from './context/AuthContext';
import { PublicApp } from './app/PublicApp';
import { AuthenticatedApp } from './app/AuthenticatedApp';
import { AppLoadingFallback, SyncIndicator } from './app/AppLoadingFallback';
import { useAppNavigation } from './app/useAppNavigation';
import { useAppData } from './app/useAppData';
import { useAuthRedirects } from './app/useAuthRedirects';
import { EmployeeAccountSetupPage } from './app/lazyPages';

function AppContent() {
  const { user, impersonate, updateUser, logout, isLoading, isRevalidating } = useAuth();
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

  return (
    <>
      {isRevalidating && <SyncIndicator />}
      {appData.employeeAccountSetup ? (
        <Suspense fallback={<AppLoadingFallback />}>
          <Toaster richColors position="top-right" />
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
      ) : (!user || currentPath === 'contact-us' || currentPath === 'reset-password') ? (
        <PublicApp currentPath={currentPath} navigateTo={navigateTo} appData={appData} user={user} />
      ) : (
        <AuthenticatedApp
          currentPath={currentPath}
          editRunId={editRunId}
          navigateTo={navigateTo}
          user={user}
          updateUser={updateUser}
          appData={appData}
        />
      )}
    </>
  );
}

export default function AppWrapper() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}
