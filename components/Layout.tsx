import React, { useState } from 'react';
import { Icons } from './Icons';
import { Role } from '../types';
import { useAuth } from '../context/AuthContext';

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
}

export const Layout: React.FC<LayoutProps> = ({ 
  children, 
  currentPath, 
  onNavigate, 
  variant = 'admin',
  managingCompanyName,
  systemBanner,
  subscriptionStatus = 'ACTIVE',
  isOverLimit = false
}) => {
  const { user, logout, stopImpersonation } = useAuth();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  if (variant === 'blank') {
    return <div className="min-h-screen bg-gray-50">{children}</div>;
  }

  const adminNavItems = [
    { id: 'dashboard', label: 'Dashboard', icon: Icons.Dashboard },
    { id: 'employees', label: 'Employees', icon: Icons.Users },
    { id: 'timesheets', label: 'Time Sheets', icon: Icons.Clock },
    { id: 'payrun', label: 'Pay Runs', icon: Icons.Payroll },
    { id: 'leave', label: 'Time Off', icon: Icons.Plane },
    { id: 'documents', label: 'Documents', icon: Icons.Document },
    { id: 'reports', label: 'Reports', icon: Icons.Reports },
    { id: 'compliance', label: 'Compliance', icon: Icons.Compliance },
    { id: 'ai-assistant', label: 'AI Assistant', icon: Icons.AI },
    { id: 'settings', label: 'Settings', icon: Icons.Settings },
  ];

  const portalNavItems = [
    { id: 'portal-home', label: 'My Pay', icon: Icons.Payroll },
    { id: 'portal-timesheets', label: 'My Hours', icon: Icons.Clock },
    { id: 'portal-leave', label: 'Time Off', icon: Icons.Plane },
    { id: 'portal-docs', label: 'Documents', icon: Icons.Compliance },
    { id: 'portal-profile', label: 'My Profile', icon: Icons.Users },
  ];

  const superAdminNavItems = [
    { id: 'sa-overview', label: 'Overview', icon: Icons.Dashboard },
    { id: 'sa-tenants', label: 'Tenants', icon: Icons.Company },
    { id: 'sa-billing', label: 'Billing', icon: Icons.Bank },
    { id: 'sa-health', label: 'System Health', icon: Icons.Zap },
    { id: 'sa-plans', label: 'Plan Config', icon: Icons.FileEdit },
    { id: 'sa-users', label: 'Administrators', icon: Icons.Shield },
    { id: 'sa-logs', label: 'Audit Logs', icon: Icons.Reports },
    { id: 'sa-settings', label: 'Platform Settings', icon: Icons.Settings },
  ];

  const resellerNavItems = [
    { id: 'reseller-dashboard', label: 'Partner Console', icon: Icons.Dashboard },
  ];

  let navItems = adminNavItems;
  let appTitle = 'Payroll-Jam';

  if (variant === 'portal') {
    navItems = portalNavItems;
    appTitle = 'Employee Portal';
  } else if (variant === 'super_admin') {
    navItems = superAdminNavItems;
    appTitle = 'Super Admin';
  } else if (user?.role === Role.RESELLER && !user.originalRole) {
    navItems = resellerNavItems;
    appTitle = 'Partner Portal';
  }

  const isImpersonating = !!user?.originalRole;
  const isSuperAdminImpersonating = user?.originalRole === Role.SUPER_ADMIN;

  const handleLogout = (e: React.MouseEvent) => {
      e.preventDefault();
      logout();
      // Hard reload ensuring full state flush
      window.location.href = '/';
  };

  return (
    <div className="flex flex-col h-screen bg-gray-100 font-sans text-slate-900 overflow-hidden print:h-auto print:overflow-visible">
      
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
        <div className={`px-4 py-2 text-sm font-bold flex justify-between items-center shadow-md z-50 ${
            isSuperAdminImpersonating 
                ? 'bg-red-900 text-white' 
                : 'bg-jam-black text-jam-yellow'
        }`}>
            <div className="flex items-center">
                <Icons.Shield className="w-4 h-4 mr-2" />
                <span className="uppercase tracking-wider">
                    {isSuperAdminImpersonating ? 'Super Admin Mode' : 'Reseller Mode'}: Managing {managingCompanyName}
                </span>
            </div>
            <button 
                onClick={stopImpersonation}
                className={`px-3 py-1 rounded text-xs transition-colors flex items-center ${
                    isSuperAdminImpersonating
                        ? 'bg-white text-red-900 hover:bg-gray-200'
                        : 'bg-jam-yellow text-jam-black hover:bg-white'
                }`}
            >
                <Icons.Back className="w-3 h-3 mr-1" /> Return to Console
            </button>
        </div>
      )}

      <div id="main-layout" className="flex flex-1 overflow-hidden">
      <aside className="hidden md:flex flex-col w-64 bg-jam-black text-white h-full flex-shrink-0 no-print">
        <div className="p-6 flex items-center justify-center border-b border-gray-800 flex-shrink-0">
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
              className={`w-full flex items-center px-4 py-3 rounded-lg transition-colors ${
                currentPath === item.id
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
                  className={`w-full flex items-center px-4 py-3 rounded-lg ${
                    currentPath === item.id
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