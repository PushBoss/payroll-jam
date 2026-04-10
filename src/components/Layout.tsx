import React, { useState, useMemo } from 'react';
import { Icons } from './Icons';
import { Role, CompanySettings } from '../core/types';
import { useAuth } from '../context/AuthContext';
import { hasFeatureAccess } from '../utils/featureAccess';

interface LayoutProps {
  children: React.ReactNode;
  currentPath: string;
  onNavigate: (path: string) => void;
  variant?: 'admin' | 'portal' | 'super_admin' | 'blank';
  managingCompanyName?: string;
  systemBanner?: {
    active: boolean;
    message: string;
    type: 'INFO' | 'WARNING' | 'ERROR';
  };
  subscriptionStatus?: 'ACTIVE' | 'PAST_DUE' | 'SUSPENDED' | 'PENDING_PAYMENT';
  isOverLimit?: boolean; // Soft Lock Prop
  companyData?: CompanySettings;
}

export const Layout: React.FC<LayoutProps> = ({
  children,
  currentPath,
  onNavigate,
  variant = 'admin',
  managingCompanyName,
  systemBanner,
  subscriptionStatus = 'ACTIVE',
  isOverLimit = false,
  companyData
}) => {
  const { user, logout, stopImpersonation } = useAuth();

  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  // Filter admin nav items based on feature access
  const adminNavItems = useMemo(() => {
    const allItems = [
      { id: 'dashboard', label: 'Dashboard', icon: Icons.Dashboard, feature: null },
      { id: 'employees', label: 'Employees', icon: Icons.Users, feature: null },
      { id: 'timesheets', label: 'Time Sheets', icon: Icons.Clock, feature: null },
      { id: 'payrun', label: 'Pay Runs', icon: Icons.Payroll, feature: null },
      { id: 'leave', label: 'Time Off', icon: Icons.Plane, feature: null },
      { id: 'documents', label: 'Documents', icon: Icons.Document, feature: 'Documents' },
      { id: 'reports', label: 'Reports', icon: Icons.Reports, feature: null },
      { id: 'compliance', label: 'Compliance', icon: Icons.Compliance, feature: 'Compliance' },
      { id: 'ai-assistant', label: 'AI Assistant', icon: Icons.AI, feature: 'AI Assistant' },
      { id: 'settings', label: 'Settings', icon: Icons.Settings, feature: null },
      { id: 'contact-us', label: 'Contact Us', icon: Icons.Mail, feature: null },
    ];

    // Add Partner Console item if user is Reseller
    if (user?.role === Role.RESELLER) {
      allItems.unshift({ id: 'reseller-dashboard', label: 'Partner Console', icon: Icons.LayoutGrid, feature: null });
    }

    // Filter out items that require features the plan doesn't have
    return allItems.filter(item => {
      if (!item.feature) return true; // Always show items without feature requirements
      return hasFeatureAccess(companyData, item.feature);
    });
  }, [companyData, user?.role]);

  if (variant === 'blank') {
    return <div className="min-h-screen bg-gray-50">{children}</div>;
  }

  const portalNavItems = [
    { id: 'portal-home', label: 'My Pay', icon: Icons.Payroll, feature: null },
    { id: 'portal-timesheets', label: 'My Hours', icon: Icons.Clock, feature: null },
    { id: 'portal-leave', label: 'Time Off', icon: Icons.Plane, feature: null },
    { id: 'portal-docs', label: 'Documents', icon: Icons.Compliance, feature: null },
    { id: 'portal-profile', label: 'My Profile', icon: Icons.Users, feature: null },
    { id: 'contact-us', label: 'Contact Us', icon: Icons.Mail, feature: null },
  ];

  const superAdminNavItems = [
    { id: 'sa-overview', label: 'Overview', icon: Icons.Dashboard, feature: null },
    { id: 'sa-tenants', label: 'Tenants', icon: Icons.Company, feature: null },
    { id: 'sa-pending-payments', label: 'Pending Payments', icon: Icons.Clock, feature: null },
    { id: 'sa-billing', label: 'Billing', icon: Icons.Bank, feature: null },
    { id: 'sa-health', label: 'System Health', icon: Icons.Zap, feature: null },
    { id: 'sa-plans', label: 'Plan Config', icon: Icons.FileEdit, feature: null },
    { id: 'sa-users', label: 'Administrators', icon: Icons.Shield, feature: null },
    { id: 'sa-logs', label: 'Audit Logs', icon: Icons.Reports, feature: null },
    { id: 'sa-settings', label: 'Platform Settings', icon: Icons.Settings, feature: null },
    { id: 'contact-us', label: 'Contact Us', icon: Icons.Mail, feature: null },
  ];

  const resellerNavItems = [
    { id: 'reseller-dashboard', label: 'Partner Console', icon: Icons.LayoutGrid, feature: null },
    { id: 'dashboard', label: 'My Company', icon: Icons.Building, feature: null },
  ];

  let navItems = adminNavItems;
  let appTitle = 'Payroll-Jam';

  if (variant === 'portal') {
    navItems = portalNavItems;
    appTitle = 'Employee Portal';
  } else if (variant === 'super_admin') {
    navItems = superAdminNavItems;
    appTitle = 'Super Admin';
  } else if (user?.role === Role.RESELLER && currentPath === 'reseller-dashboard' && !user.originalRole) {
    navItems = resellerNavItems;
    appTitle = 'Partner Portal';
  }

  // --- Reseller Managing Own Company Logic ---
  const isResellerManagingSelf = user?.role === Role.RESELLER && currentPath !== 'reseller-dashboard' && !user.originalRole;


  const isImpersonating = !!user?.originalRole;
  const isSuperAdminImpersonating = user?.originalRole === Role.SUPER_ADMIN;

  const handleLogout = async (e: React.MouseEvent) => {
    e.preventDefault();
    await logout();
    // Clear all storage and redirect
    window.location.href = '/login';
  };

  return (
    <div className="flex flex-col h-screen bg-gray-100 font-sans text-slate-900 overflow-hidden print:h-auto print:overflow-visible">
      {/* Reseller Managing Self Banner */}
      {isResellerManagingSelf && (
        <div className="bg-gray-900 text-white px-4 py-3 text-sm font-bold flex justify-between items-center shadow-md z-[70] relative border-b border-gray-800">
          <div className="flex items-center">
            <div className="w-8 h-8 rounded-full bg-jam-orange bg-opacity-20 flex items-center justify-center mr-3">
              <Icons.Settings className="w-4 h-4 text-jam-orange" />
            </div>
            <div>
              <span className="uppercase tracking-wider text-xs text-jam-orange block mb-0.5">Partner Console</span>
              <span>Editing My Company</span>
            </div>
          </div>
          <button
            onClick={() => onNavigate('reseller-dashboard')}
            className="p-1 hover:bg-gray-800 rounded-full text-gray-400 hover:text-white transition-all transform hover:rotate-90"
            title="Close and return to Partner Console"
          >
            <Icons.Close className="w-5 h-5" />
          </button>
        </div>
      )}


      {/* 1. Global System Banner (Super Admin) */}
      {systemBanner?.active && (
        <div className={`px-4 py-2 text-sm font-bold flex justify-center items-center shadow-sm z-[60] text-center
            ${systemBanner.type === 'ERROR' ? 'bg-red-600 text-white' :
            systemBanner.type === 'WARNING' ? 'bg-orange-500 text-white' : 'bg-blue-600 text-white'}`
        }>
          <Icons.Alert className="w-4 h-4 mr-2" />
          <span>{systemBanner.message}</span>
        </div>
      )}

      {/* 2. Subscription Status Banner (Billing) */}
      {variant === 'admin' && subscriptionStatus === 'SUSPENDED' && (
        <div className="bg-red-600 text-white px-4 py-3 text-sm font-bold flex justify-center items-center shadow-md z-[55]">
          <Icons.Alert className="w-5 h-5 mr-2" />
          <span>ACCOUNT SUSPENDED: Payment required. Payroll features are currently disabled.</span>
          <button onClick={() => onNavigate('settings')} className="ml-4 underline hover:text-red-100">Update Billing</button>
        </div>
      )}

      {/* 3. Plan Limit Banner (Soft Lock) */}
      {variant === 'admin' && isOverLimit && subscriptionStatus !== 'SUSPENDED' && (
        <div className="bg-orange-500 text-white px-4 py-2 text-sm font-bold flex justify-center items-center shadow-sm z-[55]">
          <Icons.Alert className="w-4 h-4 mr-2" />
          <span>PLAN LIMIT EXCEEDED: You have more active employees than your plan allows. Some features are locked.</span>
          <button onClick={() => onNavigate('settings')} className="ml-4 underline hover:text-orange-100">Upgrade Now</button>
        </div>
      )}

      {/* 4. Impersonation Banner */}
      {isImpersonating && (
        <div className={`px-4 py-3 text-sm font-bold flex justify-between items-center shadow-md z-[70] relative border-b border-gray-800 ${isSuperAdminImpersonating
          ? 'bg-red-900 text-white'
          : 'bg-gray-900 text-white'
          }`}>
          <div className="flex items-center">
            <div className={`w-8 h-8 rounded-full bg-opacity-20 flex items-center justify-center mr-3 ${isSuperAdminImpersonating ? 'bg-red-500' : 'bg-jam-orange'}`}>
              {isSuperAdminImpersonating ? <Icons.Shield className="w-4 h-4 text-red-200" /> : <Icons.Settings className="w-4 h-4 text-jam-orange" />}
            </div>
            <div>
              <span className={`uppercase tracking-wider text-xs block mb-0.5 ${isSuperAdminImpersonating ? 'text-red-200' : 'text-jam-orange'}`}>
                {isSuperAdminImpersonating ? 'Super Admin Mode' : 'Partner Console'}
              </span>
              <span>Managing: {managingCompanyName}</span>
            </div>
          </div>
          <button
            onClick={() => {
              stopImpersonation();
              if (!isSuperAdminImpersonating) {
                onNavigate('reseller-dashboard');
              } else {
                onNavigate('sa-overview');
              }
            }}
            className="p-1 hover:bg-gray-800 rounded-full text-gray-400 hover:text-white transition-all transform hover:rotate-90"
            title="Return to Console"
          >
            <Icons.Close className="w-5 h-5" />
          </button>
        </div>
      )}

      <div id="main-layout" className="flex flex-1 overflow-hidden">
        <aside className="hidden md:flex flex-col w-64 bg-jam-black text-white h-full flex-shrink-0 no-print">
          <div className="p-6 flex flex-col items-center justify-center border-b border-gray-800 flex-shrink-0">
            <img
              src="/assets/icons/android-chrome-192x192.png"
              alt="Payroll-Jam Logo"
              className="w-12 h-12 mb-3"
            />
            <h1 className="text-2xl font-bold tracking-wider text-white">
              {variant === 'portal' ? 'My' : variant === 'super_admin' ? 'Admin' : (user?.role === Role.RESELLER && !user.originalRole) ? 'Partner' : 'Payroll'}
              <span className="text-jam-orange">{variant === 'portal' ? 'Portal' : (user?.role === Role.RESELLER && !user.originalRole) ? 'Hub' : '-Jam'}</span>
            </h1>
          </div>
          <nav className="flex-1 py-6 px-3 space-y-1 overflow-y-auto scrollbar-thin scrollbar-thumb-gray-700 scrollbar-track-transparent">
            {navItems.map((item) => (
              <button
                key={item.id}
                onClick={() => onNavigate(item.id)}
                className={`w-full flex items-center px-4 py-3 rounded-lg transition-colors ${currentPath === item.id
                  ? 'bg-jam-orange text-jam-black font-semibold'
                  : 'text-gray-400 hover:bg-gray-900 hover:text-white'
                  }`}
              >
                <item.icon className="w-5 h-5 mr-3 flex-shrink-0" />
                {item.label}
              </button>
            ))}
          </nav>
          <div className="p-4 border-t border-gray-800 flex-shrink-0">
            <div
              onClick={() => onNavigate('profile')}
              className="flex items-center mb-4 cursor-pointer hover:bg-gray-700 rounded-lg p-2 -mx-2 transition-colors"
            >
              {user?.avatarUrl ? (
                <img
                  src={user.avatarUrl}
                  alt={user.name}
                  className="w-8 h-8 rounded-full object-cover flex-shrink-0"
                />
              ) : (
                <div className="w-8 h-8 rounded-full bg-jam-yellow text-jam-black flex items-center justify-center font-bold text-sm flex-shrink-0">
                  {user?.name.split(' ').map(n => n[0]).join('').substring(0, 2) || 'JD'}
                </div>
              )}
              <div className="ml-3 overflow-hidden">
                <p className="text-sm font-medium text-white truncate">{user?.name || 'User'}</p>
                <p className="text-xs text-gray-500">{user?.role}</p>
              </div>
            </div>
            <button
              type="button"
              onClick={handleLogout}
              className="w-full flex items-center px-2 py-2 text-sm text-gray-400 hover:text-white"
            >
              <Icons.Logout className="w-4 h-4 mr-2" />
              Sign Out
            </button>
          </div>
        </aside>

        <div className="flex-1 flex flex-col h-full overflow-hidden w-full print:h-auto print:overflow-visible">
          <header className="md:hidden bg-jam-black text-white flex items-center justify-between p-4 flex-shrink-0 z-20 no-print">
            <h1 className="text-xl font-bold">{appTitle}</h1>
            <button onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}>
              {isMobileMenuOpen ? <Icons.Close /> : <Icons.Menu />}
            </button>
          </header>

          {isMobileMenuOpen && (
            <div className="md:hidden absolute top-16 left-0 w-full bg-jam-black z-50 border-t border-gray-800 max-h-[calc(100vh-4rem)] overflow-y-auto no-print">
              <nav className="p-4 space-y-2 pb-20">
                {navItems.map((item) => (
                  <button
                    key={item.id}
                    onClick={() => {
                      onNavigate(item.id);
                      setIsMobileMenuOpen(false);
                    }}
                    className={`w-full flex items-center px-4 py-3 rounded-lg ${currentPath === item.id
                      ? 'bg-jam-orange text-jam-black'
                      : 'text-gray-400'
                      }`}
                  >
                    <item.icon className="w-5 h-5 mr-3" />
                    {item.label}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={handleLogout}
                  className="w-full flex items-center px-4 py-3 text-gray-400 border-t border-gray-800 mt-4"
                >
                  <Icons.Logout className="w-5 h-5 mr-3" />
                  Sign Out
                </button>
              </nav>
            </div>
          )}

          <main className="flex-1 overflow-auto p-4 md:p-8 print:h-auto print:overflow-visible">
            {children}
          </main>
        </div>
      </div>
    </div>
  );
};