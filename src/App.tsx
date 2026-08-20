import { Suspense, useState } from 'react';
import { Toaster } from 'sonner';
import { AuthProvider, useAuth } from './context/AuthContext';
import { PublicApp } from './app/PublicApp';
import { AuthenticatedApp } from './app/AuthenticatedApp';
import { AppLoadingFallback, SyncIndicator } from './app/AppLoadingFallback';
import { useAppNavigation } from './app/useAppNavigation';
import { useAppData } from './app/useAppData';
import { useAuthRedirects } from './app/useAuthRedirects';
import { EmployeeAccountSetupPage } from './app/lazyPages';
import type { EmployeeCompanyMembership } from './context/AuthContext';

const EmployeeCompanyPicker = ({
  memberships,
  onSelect,
}: {
  memberships: EmployeeCompanyMembership[];
  onSelect: (companyId: string) => Promise<void>;
}) => {
  const [isSelecting, setIsSelecting] = useState(false);
  const [error, setError] = useState('');

  const selectCompany = async (companyId: string) => {
    setIsSelecting(true);
    setError('');
    try {
      await onSelect(companyId);
    } catch (selectionError: any) {
      setError(selectionError?.message || 'Unable to open this employee portal. Please try again.');
    } finally {
      setIsSelecting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl border border-gray-100">
        <h1 className="text-2xl font-bold text-jam-black">Choose your company</h1>
        <p className="mt-2 text-sm text-gray-600">Your employee account belongs to more than one company. Choose the portal you want to open.</p>
        <div className="mt-5 space-y-3">
          {memberships.map((membership) => (
            <button
              key={membership.companyId}
              type="button"
              disabled={isSelecting}
              onClick={() => void selectCompany(membership.companyId)}
              className="w-full rounded-xl border border-gray-200 p-4 text-left transition-colors hover:border-jam-orange hover:bg-yellow-50 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <span className="block font-semibold text-gray-900">{membership.companyName}</span>
              <span className="mt-1 block text-xs text-gray-500">Employee Portal · {membership.plan}</span>
            </button>
          ))}
        </div>
        {memberships.length === 0 && (
          <p className="mt-5 rounded-lg bg-red-50 p-3 text-sm text-red-700">We could not verify an accepted employee membership. Refresh the page, or ask your employer to check your invitation.</p>
        )}
        {error && <p className="mt-4 text-sm text-red-600">{error}</p>}
      </div>
    </div>
  );
};

function AppContent() {
  const {
    user,
    impersonate,
    updateUser,
    logout,
    isLoading,
    isRevalidating,
    employeeCompanyMemberships,
    employeeCompanySelectionRequired,
    employeeCompanyContextLoading,
    selectEmployeeCompany,
  } = useAuth();
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

  if (user?.role === 'EMPLOYEE' && employeeCompanyContextLoading) {
    return <AppLoadingFallback />;
  }

  if (user && employeeCompanySelectionRequired) {
    return <EmployeeCompanyPicker memberships={employeeCompanyMemberships} onSelect={selectEmployeeCompany} />;
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
