declare const process: any;

import React, { useState, useEffect } from 'react';
import { Icons } from '../components/Icons';
import { PricingPlan, ResellerClient, GlobalConfig, User, Role, AuditLogEntry } from '../types';
import { XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, AreaChart, Area } from 'recharts';
import { storage } from '../services/storage';
import { auditService } from '../services/auditService';
import { supabaseService } from '../services/supabaseService';
import { checkDbConnection, testManualConnection, saveManualConfig, isUsingLocalOverrides, supabase } from '../services/supabaseClient';
import { toast } from 'sonner';

interface SuperAdminProps {
  plans: PricingPlan[];
  onUpdatePlans: (updatedPlans: PricingPlan[]) => void;
  onImpersonate: (tenant: ResellerClient) => void;
  initialTab?: string;
}

const DEFAULT_PAYMENT_CONFIG: GlobalConfig = {
    dataSource: 'SUPABASE', // Always use Supabase - no mock data
    currency: 'JMD',
    emailjs: {
        serviceId: '',
        templateId: '',
        publicKey: ''
    },
    paypal: {
        enabled: true,
        mode: 'sandbox',
        clientId: '',
        secret: ''
    },
    dimepay: {
        enabled: true,
        environment: 'sandbox',
        sandbox: {
            apiKey: 'ck_LGKMlNpFiRr63ce0s621VuGLjYdey',
            secretKey: 'sk_rYoMG45jVM2gvhE-pm4to9EZoW9tD',
            merchantId: 'mQn_iBSUd-KNq3K',
            domain: 'https://staging.api.dimepay.app'
        },
        production: {
            apiKey: '',
            secretKey: '',
            merchantId: '',
            domain: 'https://api.dimepay.app'
        },
        passFeesTo: 'MERCHANT'
    },
    stripe: {
        enabled: false,
        publishableKey: '',
        secretKey: ''
    },
    manual: {
        enabled: true,
        instructions: `Please wire funds to NCB Account 404-392-XXX. Ref: Company Name`
    },
    maintenanceMode: false,
    systemBanner: {
        active: false,
        message: `System Maintenance Scheduled for 2 AM.`,
        type: 'INFO'
    }
};

const MOCK_REVENUE_DATA = [
    { name: 'Aug', revenue: 55000 },
    { name: 'Sep', revenue: 62000 },
    { name: 'Oct', revenue: 71000 },
    { name: 'Nov', revenue: 80500 },
    { name: 'Dec', revenue: 88000 },
    { name: 'Jan', revenue: 90500 },
];

export const SuperAdmin: React.FC<SuperAdminProps> = ({ plans, onUpdatePlans, onImpersonate, initialTab }) => {
  const [activeTab, setActiveTab] = useState<'overview' | 'tenants' | 'users' | 'plans' | 'logs' | 'settings' | 'health' | 'billing' | 'pending-payments'>('overview');
  
  // Payment Settings State
  const [paymentConfig, setPaymentConfig] = useState<GlobalConfig>(() => storage.getGlobalConfig() || DEFAULT_PAYMENT_CONFIG);

  // Sync with prop if provided
  useEffect(() => {
      if (initialTab) {
          setActiveTab(initialTab as any);
      }
  }, [initialTab]);

  // Tenant State - Always fetch from Supabase
  const [tenants, setTenants] = useState<ResellerClient[]>([]);
  
  const [isLoadingTenants, setIsLoadingTenants] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState<'ALL' | 'ACTIVE' | 'SUSPENDED'>('ALL');
  
  // Super Admin User State
  const [admins, setAdmins] = useState<User[]>(() => {
      const existing = storage.getSuperAdmins();
      return existing || [{ id: 'u-super', name: 'System Operator', email: 'super@jam.com', role: Role.SUPER_ADMIN, isOnboarded: true }];
  });
  const [isAddAdminOpen, setIsAddAdminOpen] = useState(false);
  const [newAdminForm, setNewAdminForm] = useState({ name: '', email: '', password: '' });

  // Logs State
  const [logs, setLogs] = useState<AuditLogEntry[]>([]);
  
  // Billing State
  const [revenueData, setRevenueData] = useState<{ name: string; revenue: number }[]>([]);
  const [isLoadingBilling, setIsLoadingBilling] = useState(false);
  const [billingStats, setBillingStats] = useState({
    totalRevenue: 0,
    monthlyRecurringRevenue: 0,
    totalSubscriptions: 0,
    activeSubscriptions: 0,
    totalPayments: 0
  });
  
  // Plan Editing State
  const [editingPlan, setEditingPlan] = useState<PricingPlan | null>(null);
  const [newFeatureText, setNewFeatureText] = useState('');

  // Database Connection State & Wizard
  const [dbStatus, setDbStatus] = useState<{ connected: boolean; message: string; details?: string } | null>(null);
  const [isCheckingDb, setIsCheckingDb] = useState(false);
  const [connectWizard, setConnectWizard] = useState<{open: boolean, step: number}>({ open: false, step: 1 });
  const [manualCreds, setManualCreds] = useState({ url: '', key: '' });
  const [manualTestResult, setManualTestResult] = useState<{success?: boolean, msg?: string} | null>(null);

  // Stats
  const totalMRR = tenants.reduce((acc, t) => t.status === 'ACTIVE' ? acc + t.mrr : acc, 0);
  const totalTenants = tenants.length;
  const activeTenants = tenants.filter(t => t.status === 'ACTIVE').length;
  const totalEmployees = tenants.reduce((acc, t) => acc + t.employeeCount, 0);

  // --- Persistence Effects ---
  useEffect(() => { 
      // Only save to local storage if we are in local mode
      if (paymentConfig.dataSource !== 'SUPABASE') {
          storage.saveTenants(tenants); 
      }
  }, [tenants, paymentConfig.dataSource]);

  // Load global config from Supabase on mount
  useEffect(() => {
    const loadGlobalConfig = async () => {
      try {
        const config = await supabaseService.getGlobalConfig();
        if (config) {
          setPaymentConfig(config);
        }
      } catch (e) {
        console.error("Error loading global config from Supabase:", e);
      }
    };
    loadGlobalConfig();
  }, []);

  // Save global config to both localStorage and Supabase
  useEffect(() => { 
    storage.saveGlobalConfig(paymentConfig);
    // Also save to Supabase
    supabaseService.saveGlobalConfig(paymentConfig).catch(e => {
      console.error("Error saving global config to Supabase:", e);
    });
  }, [paymentConfig]);
  useEffect(() => { storage.saveSuperAdmins(admins); }, [admins]);
  useEffect(() => {
      if (activeTab === 'overview' || activeTab === 'logs') setLogs(auditService.getLogs());
  }, [activeTab]);

  // Load super admins from Supabase when users tab is active
  useEffect(() => {
      const loadSuperAdmins = async () => {
          if (activeTab !== 'users') return;
          
          try {
              const dbAdmins = await supabaseService.getAllSuperAdmins();
              if (dbAdmins && dbAdmins.length > 0) {
                  setAdmins(dbAdmins);
                  // Also save to localStorage as backup
                  storage.saveSuperAdmins(dbAdmins);
              } else {
                  // Fallback to localStorage if no admins in DB
                  const storedAdmins = storage.getSuperAdmins();
                  if (storedAdmins && storedAdmins.length > 0) {
                      setAdmins(storedAdmins);
                  }
              }
          } catch (error) {
              console.error('Error loading super admins:', error);
              // Fallback to localStorage on error
              const storedAdmins = storage.getSuperAdmins();
              if (storedAdmins && storedAdmins.length > 0) {
                  setAdmins(storedAdmins);
              }
          }
      };

      loadSuperAdmins();
  }, [activeTab]);

  // Load billing data when billing tab is active
  useEffect(() => {
      const loadBillingData = async () => {
          if (activeTab !== 'billing') return;
          
          setIsLoadingBilling(true);
          try {
              // Fetch all subscriptions
              const subscriptions = await supabaseService.getAllSubscriptions();
              const activeSubs = subscriptions.filter(s => s.status === 'active');
              
              // Calculate MRR from active subscriptions
              const mrr = activeSubs.reduce((sum, sub) => {
                  if (sub.billing_frequency === 'monthly') {
                      return sum + Number(sub.amount || 0);
                  } else if (sub.billing_frequency === 'yearly') {
                      return sum + (Number(sub.amount || 0) / 12);
                  }
                  return sum;
              }, 0);

              // Fetch all completed payments
              const payments = await supabaseService.getAllPayments();
              
              // Calculate total revenue
              const totalRevenue = payments.reduce((sum, p) => sum + Number(p.amount || 0), 0);

              // Group payments by month for chart
              const monthlyRevenue: Record<string, number> = {};
              payments.forEach(payment => {
                  const date = new Date(payment.payment_date);
                  const monthKey = date.toLocaleDateString('en-US', { month: 'short' });
                  if (!monthlyRevenue[monthKey]) {
                      monthlyRevenue[monthKey] = 0;
                  }
                  monthlyRevenue[monthKey] += Number(payment.amount || 0);
              });

              // Convert to chart data format (last 6 months)
              const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
              const currentMonth = new Date().getMonth();
              // Get last 6 months including current month
              const chartData = [];
              for (let i = 5; i >= 0; i--) {
                  const monthIndex = (currentMonth - i + 12) % 12;
                  const monthName = months[monthIndex];
                  chartData.push({
                      name: monthName,
                      revenue: monthlyRevenue[monthName] || 0
                  });
              }

              setBillingStats({
                  totalRevenue,
                  monthlyRecurringRevenue: mrr,
                  totalSubscriptions: subscriptions.length,
                  activeSubscriptions: activeSubs.length,
                  totalPayments: payments.length
              });
              
              setRevenueData(chartData.length > 0 ? chartData : MOCK_REVENUE_DATA);
          } catch (error) {
              console.error('Error loading billing data:', error);
              setRevenueData(MOCK_REVENUE_DATA);
          } finally {
              setIsLoadingBilling(false);
          }
      };

      loadBillingData();
  }, [activeTab]);

  // Check DB Connection when Settings tab is active
  useEffect(() => {
      if (activeTab === 'settings') {
          handleCheckDb();
      }
  }, [activeTab]);

  const handleCheckDb = async () => {
      setIsCheckingDb(true);
      const status = await checkDbConnection();
      setDbStatus(status);
      setIsCheckingDb(false);
      return status;
  };

  const handleManualTest = async () => {
      setManualTestResult(null);
      if (!manualCreds.url || !manualCreds.key) {
          setManualTestResult({ success: false, msg: 'Please fill in both fields.' });
          return;
      }
      
      const result = await testManualConnection(manualCreds.url, manualCreds.key);
      if (result.success) {
          setManualTestResult({ success: true, msg: 'Connection Successful! Applying settings...' });
          setTimeout(() => {
              saveManualConfig(manualCreds.url, manualCreds.key);
          }, 1500);
      } else {
          setManualTestResult({ success: false, msg: result.error || 'Connection Failed' });
      }
  };

  // --- Fetch Tenants from Supabase ---
  useEffect(() => {
      async function fetchDBTenants() {
          setIsLoadingTenants(true);
          try {
              const dbTenants = await supabaseService.getAllCompanies();
              setTenants(dbTenants || []);
              if (!dbTenants || dbTenants.length === 0) {
                  console.log('No companies found in database');
              }
          } catch (e) {
              console.error('Error fetching tenants:', e);
              toast.error("Failed to fetch companies from Supabase");
              setTenants([]);
          } finally {
              setIsLoadingTenants(false);
          }
      }
      fetchDBTenants();
  }, [activeTab]); // Re-fetch on tab change

  // --- Handlers ---
  const handleSuspend = (id: string) => {
      setTenants(prev => prev.map(t => t.id === id ? { ...t, status: t.status === 'SUSPENDED' ? 'ACTIVE' : 'SUSPENDED' } : t));
      toast.info(`Tenant status updated`);
  };

  const handleDeleteTenant = (id: string) => {
      if (confirm('Are you sure you want to delete this tenant? This action cannot be undone.')) {
          setTenants(prev => prev.filter(t => t.id !== id));
          toast.success("Tenant deleted");
      }
  };

  const handleAddAdmin = async (e: React.FormEvent) => {
      e.preventDefault();
      
      if (!newAdminForm.password || newAdminForm.password.length < 6) {
          toast.error("Password must be at least 6 characters");
          return;
      }

      try {
          if (!supabase) {
              throw new Error('Supabase not initialized');
          }

          // Check if service role key is available for admin operations
          const serviceRoleKey = import.meta.env?.VITE_SUPABASE_SERVICE_ROLE_KEY;
          if (!serviceRoleKey) {
              toast.error('Service role key not configured. Admin user creation requires service role key.');
              return;
          }

          // Create admin client with service role key
          const { createClient } = await import('@supabase/supabase-js');
          const supabaseUrl = import.meta.env?.VITE_SUPABASE_URL || localStorage.getItem('VITE_SUPABASE_URL');
          if (!supabaseUrl) {
              throw new Error('Supabase URL not configured');
          }
          
          const adminClient = createClient(supabaseUrl, serviceRoleKey, {
              auth: {
                  autoRefreshToken: false,
                  persistSession: false
              }
          });

          // 1. Create auth user in Supabase Auth using admin client
          const { data: authData, error: authError } = await adminClient.auth.admin.createUser({
              email: newAdminForm.email,
              password: newAdminForm.password,
              email_confirm: true // Auto-confirm email for super admins
          });

          if (authError) {
              console.error('❌ Auth signup error:', authError);
              toast.error(authError.message || 'Failed to create admin user');
              return;
          }

          if (!authData.user) {
              throw new Error('No user returned from signup');
          }

          console.log('✅ Supabase Auth user created:', authData.user.id);

          // 2. Create app_users record with SUPER_ADMIN role
          const { error: userError } = await supabase
              .from('app_users')
              .insert({
                  id: authData.user.id,
                  auth_user_id: authData.user.id,
                  email: newAdminForm.email,
                  name: newAdminForm.name,
                  role: 'SUPER_ADMIN',
                  is_onboarded: true
              });

          if (userError) {
              console.error('❌ Error creating app_users record:', userError);
              // Try to clean up auth user if app_users insert fails
              const { createClient } = await import('@supabase/supabase-js');
              const supabaseUrl = import.meta.env?.VITE_SUPABASE_URL || localStorage.getItem('VITE_SUPABASE_URL');
              const serviceRoleKey = import.meta.env?.VITE_SUPABASE_SERVICE_ROLE_KEY;
              if (supabaseUrl && serviceRoleKey) {
                  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
                      auth: { autoRefreshToken: false, persistSession: false }
                  });
                  await adminClient.auth.admin.deleteUser(authData.user.id);
              }
              toast.error('Failed to create admin profile. Please try again.');
              return;
          }

          // 3. Update local state and refresh from DB
          setIsAddAdminOpen(false);
          setNewAdminForm({ name: '', email: '', password: '' });
          auditService.log({id: 'sys', name: 'Super Admin', email: 'sys', role: Role.SUPER_ADMIN}, 'CREATE', 'User', `Created new super admin: ${newAdminForm.email}`);
          toast.success("New admin created successfully");
          
          // Refresh admins list from database
          const updatedAdmins = await supabaseService.getAllSuperAdmins();
          if (updatedAdmins && updatedAdmins.length > 0) {
              setAdmins(updatedAdmins);
              storage.saveSuperAdmins(updatedAdmins);
          }
      } catch (error: any) {
          console.error('Error creating admin:', error);
          toast.error(error.message || 'Failed to create admin');
      }
  };

  const handleRemoveAdmin = async (id: string) => {
      if (admins.length <= 1) { 
          toast.error("Cannot delete the last Super Admin."); 
          return; 
      }
      if (confirm("Revoke Super Admin access for this user? This action cannot be undone.")) {
          try {
              // Delete from Supabase
              const deleted = await supabaseService.deleteUser(id);
              if (!deleted) {
                  toast.error("Failed to remove admin from database");
                  return;
              }

              // Also try to delete from auth (optional, may require service role)
              const serviceRoleKey = import.meta.env?.VITE_SUPABASE_SERVICE_ROLE_KEY;
              if (serviceRoleKey && supabase) {
                  try {
                      const { createClient } = await import('@supabase/supabase-js');
                      const supabaseUrl = import.meta.env?.VITE_SUPABASE_URL || localStorage.getItem('VITE_SUPABASE_URL');
                      if (supabaseUrl) {
                          const adminClient = createClient(supabaseUrl, serviceRoleKey, {
                              auth: { autoRefreshToken: false, persistSession: false }
                          });
                          await adminClient.auth.admin.deleteUser(id);
                      }
                  } catch (authError) {
                      console.warn("Could not delete auth user (may require service role key):", authError);
                      // Continue anyway - app_users record is deleted
                  }
              }

              // Refresh admins list from database
              const updatedAdmins = await supabaseService.getAllSuperAdmins();
              if (updatedAdmins && updatedAdmins.length > 0) {
                  setAdmins(updatedAdmins);
                  storage.saveSuperAdmins(updatedAdmins);
              } else {
                  // Fallback: remove from local state
                  setAdmins(prev => prev.filter(u => u.id !== id));
              }
              
              auditService.log({id: 'sys', name: 'Super Admin', email: 'sys', role: Role.SUPER_ADMIN}, 'DELETE', 'User', `Removed super admin: ${id}`);
              toast.success("Admin removed successfully");
          } catch (error: any) {
              console.error('Error removing admin:', error);
              toast.error(error.message || "Failed to remove admin");
          }
      }
  };

  const handlePushTaxUpdate = () => {
      if (confirm("This will push the 2025 Default Tax Tables to all active tenants. Continue?")) {
          auditService.log({id: 'sys', name: 'Super Admin', email: 'sys', role: Role.SUPER_ADMIN}, 'UPDATE', 'System', 'Pushed Global Tax Update 2025');
          toast.success("Tax update pushed successfully.");
      }
  };

  const handleToggleMaintenance = (enabled: boolean) => {
      setPaymentConfig(prev => ({ ...prev, maintenanceMode: enabled }));
      auditService.log({id: 'sys', name: 'Super Admin', email: 'sys', role: Role.SUPER_ADMIN}, 'SETTINGS', 'System', `Maintenance Mode set to ${enabled}`);
      toast.info(`Maintenance mode ${enabled ? 'enabled' : 'disabled'}`);
  };

  const handleDataSourceChange = async () => {
      // Always using Supabase - this option is disabled
      toast.info("Data source is set to Supabase only");
      return;
  };

  const handleWizardRetry = async () => {
      setIsCheckingDb(true);
      const status = await checkDbConnection();
      setDbStatus(status);
      setIsCheckingDb(false);

      if (status.connected) {
          setPaymentConfig(prev => ({ ...prev, dataSource: 'SUPABASE' }));
          setConnectWizard({ ...connectWizard, open: false });
          toast.success("Connection successful! Live mode active.");
      } else {
          toast.error("Still unable to connect. Please check settings again.");
      }
  };

  const handleDimeEnvChange = (env: 'sandbox' | 'production') => {
      // Use standard endpoint bases based on plugin discovery
      const newUrl = env === 'sandbox' 
        ? 'https://staging.api.dimepay.app' 
        : 'https://api.dimepay.app';
      
      setPaymentConfig(prev => ({
          ...prev,
          dimepay: {
              ...prev.dimepay,
              environment: env,
              domain: newUrl
          }
      }));
  };

    const handleSavePlan = () => {
        if (!editingPlan) return;
        let updated;
        const exists = plans.some(p => p.id === editingPlan.id);
        if (exists) {
            updated = plans.map(p => p.id === editingPlan.id ? editingPlan : p);
            auditService.log({id: 'sys', name: 'Super Admin', email: 'sys', role: Role.SUPER_ADMIN}, 'UPDATE', 'Plan', `Updated plan: ${editingPlan.name}`);
            toast.success("Plan updated");
        } else {
            updated = [...plans, editingPlan];
            auditService.log({id: 'sys', name: 'Super Admin', email: 'sys', role: Role.SUPER_ADMIN}, 'CREATE', 'Plan', `Created plan: ${editingPlan.name}`);
            toast.success("Plan created");
        }
        onUpdatePlans(updated);
        setEditingPlan(null);
    };

  const removeFeature = (index: number) => {
    if (!editingPlan) return;
    const newFeatures = editingPlan.features.filter((_, i) => i !== index);
    setEditingPlan({ ...editingPlan, features: newFeatures });
  };

  const addFeature = () => {
    if (!editingPlan || !newFeatureText.trim()) return;
    setEditingPlan({ ...editingPlan, features: [...editingPlan.features, newFeatureText] });
    setNewFeatureText('');
  };

  const toggleActiveStatus = (plan: PricingPlan) => {
      const updated = plans.map(p => p.id === plan.id ? { ...p, isActive: !p.isActive } : p);
      onUpdatePlans(updated);
      auditService.log({id: 'sys', name: 'Super Admin', email: 'sys', role: Role.SUPER_ADMIN}, 'UPDATE', 'System', `Toggled plan ${plan.name} status`);
      toast.success(`Plan ${plan.isActive ? 'deactivated' : 'activated'}`);
  };

  // --- Render Components ---

  const renderOverview = () => (
      <div className="space-y-6 animate-fade-in">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
              <div className="bg-jam-black text-white p-6 rounded-xl shadow-lg relative overflow-hidden">
                  <div className="relative z-10">
                      <p className="text-sm text-gray-400 uppercase font-bold">Platform MRR</p>
                      <h3 className="text-4xl font-bold mt-2">${totalMRR.toLocaleString()}</h3>
                      <p className="text-xs text-jam-yellow mt-2 flex items-center">
                        <Icons.Trending className="w-3 h-3 mr-1" /> +8.5% Growth
                      </p>
                  </div>
                  <Icons.Trending className="absolute right-4 bottom-4 w-24 h-24 text-white opacity-5 transform rotate-12" />
              </div>
              <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
                  <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm text-gray-500 uppercase font-bold">Active Tenants</p>
                        <h3 className="text-3xl font-bold text-gray-900 mt-2">{activeTenants}</h3>
                      </div>
                      <div className="p-3 bg-blue-50 text-blue-600 rounded-lg">
                          <Icons.Company className="w-6 h-6" />
                      </div>
                  </div>
                  <p className="text-xs text-gray-400 mt-2">of {totalTenants} total signups</p>
              </div>
              <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
                  <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm text-gray-500 uppercase font-bold">Managed Employees</p>
                        <h3 className="text-3xl font-bold text-gray-900 mt-2">{totalEmployees}</h3>
                      </div>
                      <div className="p-3 bg-purple-50 text-purple-600 rounded-lg">
                          <Icons.Users className="w-6 h-6" />
                      </div>
                  </div>
                  <p className="text-xs text-gray-400 mt-2">Across all accounts</p>
              </div>
              <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
                  <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm text-gray-500 uppercase font-bold">System Health</p>
                        <h3 className="text-3xl font-bold text-green-600 mt-2">99.9%</h3>
                      </div>
                      <div className="p-3 bg-green-50 text-green-600 rounded-lg">
                          <Icons.Zap className="w-6 h-6" />
                      </div>
                  </div>
                  <p className="text-xs text-gray-400 mt-2">All systems operational</p>
              </div>
          </div>
      </div>
  );

  const renderTenants = () => {
      const filteredTenants = tenants.filter(t => {
        const matchesSearch = t.companyName.toLowerCase().includes(searchTerm.toLowerCase()) || t.email.toLowerCase().includes(searchTerm.toLowerCase());
        const matchesFilter = filterStatus === 'ALL' || t.status === filterStatus;
        return matchesSearch && matchesFilter;
      });

      return (
        <div className="space-y-6 animate-fade-in">
             <div className="flex justify-between items-center bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
                <div className="relative w-96">
                    <Icons.Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                    <input 
                        type="text" 
                        placeholder="Search tenants..." 
                        className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-jam-orange"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </div>
                <div className="flex space-x-2">
                    {(['ALL', 'ACTIVE', 'SUSPENDED'] as const).map(status => (
                        <button
                            key={status}
                            onClick={() => setFilterStatus(status)}
                            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                                filterStatus === status ? 'bg-jam-black text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                            }`}
                        >
                            {status}
                        </button>
                    ))}
                </div>
             </div>

             <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-left">
                        <thead className="bg-gray-50 border-b border-gray-200">
                            <tr>
                                <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase">Company</th>
                                <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase">Contact</th>
                                <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase">Plan</th>
                                <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase">Employees</th>
                                <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase">Status</th>
                                <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {isLoadingTenants ? (
                                <tr>
                                    <td colSpan={6} className="p-12 text-center text-gray-500">
                                        <div className="flex flex-col items-center">
                                            <Icons.Refresh className="w-8 h-8 animate-spin text-jam-orange mb-2" />
                                            <p>Loading records from Supabase...</p>
                                        </div>
                                    </td>
                                </tr>
                            ) : filteredTenants.length === 0 ? (
                                <tr>
                                    <td colSpan={6} className="p-8 text-center text-gray-500">
                                        No companies found.
                                    </td>
                                </tr>
                            ) : (
                                filteredTenants.map(tenant => (
                                    <tr key={tenant.id} className="hover:bg-gray-50">
                                        <td className="px-6 py-4 font-medium text-gray-900">{tenant.companyName}</td>
                                        <td className="px-6 py-4 text-sm text-gray-500">
                                            {tenant.contactName}
                                            <div className="text-xs text-gray-400">{tenant.email}</div>
                                        </td>
                                        <td className="px-6 py-4">
                                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                                                {tenant.plan}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4 text-sm text-gray-500">{tenant.employeeCount}</td>
                                        <td className="px-6 py-4">
                                            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                                                tenant.status === 'ACTIVE' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                                            }`}>
                                                {tenant.status}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4 text-right space-x-2">
                                            <button onClick={() => onImpersonate(tenant)} className="text-jam-orange hover:text-yellow-600 text-xs font-bold uppercase">
                                                Manage
                                            </button>
                                            <button onClick={() => handleSuspend(tenant.id)} className="text-gray-500 hover:text-gray-900 text-xs font-bold uppercase">
                                                {tenant.status === 'ACTIVE' ? 'Suspend' : 'Activate'}
                                            </button>
                                            <button onClick={() => handleDeleteTenant(tenant.id)} className="text-red-400 hover:text-red-600">
                                                <Icons.Trash className="w-4 h-4" />
                                            </button>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
             </div>
        </div>
      );
  };

  const renderAdmins = () => (
      <div className="space-y-6 animate-fade-in">
          <div className="flex justify-between items-center">
              <h3 className="text-lg font-bold text-gray-900">System Administrators</h3>
              <button 
                  onClick={() => setIsAddAdminOpen(true)}
                  className="bg-jam-black text-white px-4 py-2 rounded-lg hover:bg-gray-800 flex items-center shadow-sm"
              >
                  <Icons.Plus className="w-4 h-4 mr-2" /> Add Admin
              </button>
          </div>

          {isAddAdminOpen && (
              <div className="bg-gray-50 p-4 rounded-xl border border-gray-200 mb-6 animate-scale-in">
                  <form onSubmit={handleAddAdmin} className="space-y-4">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div>
                          <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Name</label>
                          <input 
                              required
                              type="text" 
                              className="w-full border border-gray-300 rounded px-3 py-2"
                              value={newAdminForm.name}
                              onChange={e => setNewAdminForm({...newAdminForm, name: e.target.value})}
                          />
                      </div>
                          <div>
                          <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Email</label>
                          <input 
                              required
                              type="email" 
                              className="w-full border border-gray-300 rounded px-3 py-2"
                              value={newAdminForm.email}
                              onChange={e => setNewAdminForm({...newAdminForm, email: e.target.value})}
                          />
                      </div>
                          <div>
                              <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Password</label>
                              <input 
                                  required
                                  type="password" 
                                  minLength={6}
                                  className="w-full border border-gray-300 rounded px-3 py-2"
                                  value={newAdminForm.password}
                                  onChange={e => setNewAdminForm({...newAdminForm, password: e.target.value})}
                                  placeholder="Minimum 6 characters"
                              />
                          </div>
                      </div>
                      <div className="flex justify-end space-x-2">
                          <button type="button" onClick={() => { setIsAddAdminOpen(false); setNewAdminForm({ name: '', email: '', password: '' }); }} className="px-4 py-2 text-gray-500 hover:text-gray-700">
                          Cancel
                      </button>
                          <button type="submit" className="bg-jam-orange text-jam-black px-6 py-2 rounded font-bold hover:bg-yellow-500">
                              Create Admin
                          </button>
                      </div>
                  </form>
              </div>
          )}

          <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
              <table className="w-full text-left">
                  <thead className="bg-gray-50 border-b border-gray-200">
                      <tr>
                          <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase">Admin User</th>
                          <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase">Email</th>
                          <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase">Role</th>
                          <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase text-right">Actions</th>
                      </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                      {admins.map(admin => (
                          <tr key={admin.id} className="hover:bg-gray-50">
                              <td className="px-6 py-4 font-medium text-gray-900">{admin.name}</td>
                              <td className="px-6 py-4 text-gray-500">{admin.email}</td>
                              <td className="px-6 py-4">
                                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-800">
                                      SUPER ADMIN
                                  </span>
                              </td>
                              <td className="px-6 py-4 text-right">
                                  <button onClick={() => handleRemoveAdmin(admin.id)} className="text-red-400 hover:text-red-600">
                                      <Icons.Trash className="w-4 h-4" />
                                  </button>
                              </td>
                          </tr>
                      ))}
                  </tbody>
              </table>
          </div>
      </div>
  );

  const renderLogs = () => (
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden animate-fade-in">
          <div className="px-6 py-4 border-b border-gray-200 bg-gray-50">
              <h3 className="font-bold text-gray-900">System Audit Trail</h3>
          </div>
          <div className="max-h-[600px] overflow-y-auto">
              <table className="w-full text-left border-collapse">
                  <thead className="bg-white border-b border-gray-200 sticky top-0 z-10">
                      <tr>
                          <th className="px-6 py-3 text-xs font-semibold text-gray-500 uppercase">Time</th>
                          <th className="px-6 py-3 text-xs font-semibold text-gray-500 uppercase">Actor</th>
                          <th className="px-6 py-3 text-xs font-semibold text-gray-500 uppercase">Action</th>
                          <th className="px-6 py-3 text-xs font-semibold text-gray-500 uppercase">Details</th>
                      </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                      {logs.map((log) => (
                          <tr key={log.id} className="hover:bg-gray-50">
                              <td className="px-6 py-3 text-xs text-gray-500 font-mono">{new Date(log.timestamp).toLocaleString()}</td>
                              <td className="px-6 py-3 text-sm font-medium text-gray-900">{log.actorName}</td>
                              <td className="px-6 py-3">
                                  <span className="text-xs font-bold uppercase tracking-wider">{log.action}</span>
                              </td>
                              <td className="px-6 py-3 text-sm text-gray-600">{log.description}</td>
                          </tr>
                      ))}
                      {logs.length === 0 && (
                          <tr><td colSpan={4} className="p-8 text-center text-gray-500">No logs found.</td></tr>
                      )}
                  </tbody>
              </table>
          </div>
      </div>
  );

  const renderHealth = () => (
      <div className="space-y-6 animate-fade-in">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
                  <h3 className="font-bold text-gray-900 mb-4">System Status</h3>
                  <div className="space-y-4">
                      <div className="flex justify-between items-center p-3 bg-green-50 rounded-lg border border-green-100">
                          <div className="flex items-center">
                              <div className="w-2 h-2 bg-green-500 rounded-full mr-3 animate-pulse"></div>
                              <span className="font-medium text-green-900">API Gateway</span>
                          </div>
                          <span className="text-xs font-bold text-green-700">OPERATIONAL</span>
                      </div>
                      <div className="flex justify-between items-center p-3 bg-green-50 rounded-lg border border-green-100">
                          <div className="flex items-center">
                              <div className="w-2 h-2 bg-green-500 rounded-full mr-3 animate-pulse"></div>
                              <span className="font-medium text-green-900">Database (Supabase)</span>
                          </div>
                          <span className="text-xs font-bold text-green-700">{dbStatus?.connected ? 'CONNECTED' : 'UNKNOWN'}</span>
                      </div>
                      <div className="flex justify-between items-center p-3 bg-green-50 rounded-lg border border-green-100">
                          <div className="flex items-center">
                              <div className="w-2 h-2 bg-green-500 rounded-full mr-3 animate-pulse"></div>
                              <span className="font-medium text-green-900">Tax Engine</span>
                          </div>
                          <span className="text-xs font-bold text-green-700">v2025.1.0</span>
                      </div>
                  </div>
              </div>

              <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
                  <h3 className="font-bold text-gray-900 mb-4">Maintenance Controls</h3>
                  <div className="flex items-center justify-between mb-4">
                      <div>
                          <p className="font-medium text-gray-900">Maintenance Mode</p>
                          <p className="text-sm text-gray-500">Prevent non-admin logins</p>
                      </div>
                      <button 
                          onClick={() => handleToggleMaintenance(!paymentConfig.maintenanceMode)}
                          className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${paymentConfig.maintenanceMode ? 'bg-jam-orange' : 'bg-gray-200'}`}
                      >
                          <span className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${paymentConfig.maintenanceMode ? 'translate-x-5' : 'translate-x-0'}`} />
                      </button>
                  </div>
                  <button 
                      onClick={handlePushTaxUpdate}
                      className="w-full py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 flex items-center justify-center"
                  >
                      <Icons.Refresh className="w-4 h-4 mr-2" /> Push 2025 Tax Update
                  </button>
              </div>
          </div>
      </div>
  );

  const renderBilling = () => (
      <div className="space-y-6 animate-fade-in">
          {/* Stats Cards */}
          <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
              <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-200">
                  <p className="text-xs text-gray-500 uppercase font-bold mb-1">Total Revenue</p>
                  <p className="text-2xl font-bold text-gray-900">${billingStats.totalRevenue.toLocaleString()}</p>
              </div>
              <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-200">
                  <p className="text-xs text-gray-500 uppercase font-bold mb-1">MRR</p>
                  <p className="text-2xl font-bold text-jam-orange">${billingStats.monthlyRecurringRevenue.toLocaleString()}</p>
              </div>
              <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-200">
                  <p className="text-xs text-gray-500 uppercase font-bold mb-1">Total Subscriptions</p>
                  <p className="text-2xl font-bold text-gray-900">{billingStats.totalSubscriptions}</p>
              </div>
              <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-200">
                  <p className="text-xs text-gray-500 uppercase font-bold mb-1">Active Subscriptions</p>
                  <p className="text-2xl font-bold text-green-600">{billingStats.activeSubscriptions}</p>
              </div>
              <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-200">
                  <p className="text-xs text-gray-500 uppercase font-bold mb-1">Total Payments</p>
                  <p className="text-2xl font-bold text-gray-900">{billingStats.totalPayments}</p>
              </div>
          </div>

          {/* Revenue Chart */}
          <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
              <div className="flex justify-between items-center mb-6">
                  <h3 className="font-bold text-gray-900">Platform Revenue (Last 6 Months)</h3>
                  {isLoadingBilling && (
                      <div className="flex items-center text-sm text-gray-500">
                          <Icons.Refresh className="w-4 h-4 mr-2 animate-spin" />
                          Loading...
                      </div>
                  )}
              </div>
              <div className="h-72">
                  {isLoadingBilling ? (
                      <div className="flex items-center justify-center h-full">
                          <Icons.Refresh className="w-8 h-8 animate-spin text-jam-orange" />
                      </div>
                  ) : revenueData.length > 0 ? (
                      <ResponsiveContainer width="100%" height="100%">
                          <AreaChart data={revenueData}>
                              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f3f4f6" />
                              <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fill: '#9CA3AF'}} dy={10} />
                              <YAxis axisLine={false} tickLine={false} tick={{fill: '#9CA3AF'}} tickFormatter={(val) => `$${val/1000}k`} />
                              <Tooltip 
                                  cursor={{stroke: '#F3F4F6'}}
                                  formatter={(val: number) => [`$${val.toLocaleString()}`, 'Revenue']}
                                  contentStyle={{borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)'}}
                              />
                              <Area type="monotone" dataKey="revenue" stroke="#F59E0B" fill="rgba(245, 158, 11, 0.1)" strokeWidth={3} />
                          </AreaChart>
                      </ResponsiveContainer>
                  ) : (
                      <div className="flex items-center justify-center h-full text-gray-500">
                          <p>No revenue data available</p>
                      </div>
                  )}
              </div>
          </div>
      </div>
  );

    const renderPlans = () => {
        const handleCreatePlan = () => {
            console.log('Create Plan clicked');
            setEditingPlan({
                id: `plan-${Date.now()}`,
                name: '',
                priceConfig: { type: 'flat', monthly: 0, annual: 0 },
                description: '',
                limit: '5 Employees',
                features: [],
                cta: 'Get Started',
                highlight: false,
                color: 'bg-white',
                textColor: 'text-gray-900',
                isActive: true
            });
        };
        if (!plans || plans.length === 0) {
            return (
                <div className="text-center py-12 text-gray-500">
                    <p>No plans configured</p>
                    <button
                        onClick={handleCreatePlan}
                        className="mt-6 px-6 py-2 bg-jam-orange text-white rounded-lg font-semibold shadow hover:bg-orange-500 transition"
                    >
                        Create Plan
                    </button>
                </div>
            );
        }
        return (
            <div className="space-y-6 animate-fade-in">
                <div className="flex justify-end mb-4">
                    <button
                        onClick={handleCreatePlan}
                        className="px-5 py-2 bg-jam-orange text-white rounded-lg font-semibold shadow hover:bg-orange-500 transition"
                    >
                        + Create Plan
                    </button>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                    {plans.map(plan => (
                        <div key={plan.id} className={`p-6 rounded-xl border-2 transition-all ${plan.isActive ? 'bg-white border-gray-200' : 'bg-gray-50 border-gray-100 opacity-75'}`}>
                            <div className="flex justify-between items-start mb-4">
                                <h3 className="font-bold text-lg text-gray-900">{plan.name}</h3>
                                <div className={`w-3 h-3 rounded-full ${plan.isActive ? 'bg-green-500' : 'bg-gray-300'}`}></div>
                            </div>
                            <div className="mb-4">
                                <p className="text-2xl font-bold text-gray-900">
                                    ${plan.priceConfig.monthly.toLocaleString()}
                                    <span className="text-sm font-normal text-gray-500">/mo</span>
                                </p>
                                <p className="text-xs text-gray-500 mt-1">{plan.description}</p>
                            </div>
                            <div className="space-y-2 mb-6">
                                {plan.features.slice(0, 3).map((f, i) => (
                                    <div key={i} className="flex items-center text-xs text-gray-600">
                                        <Icons.Check className="w-3 h-3 mr-2 text-green-500" />
                                        {f}
                                    </div>
                                ))}
                        </div>
                        <div className="flex space-x-2">
                            <button 
                                onClick={() => setEditingPlan(plan)}
                                className="flex-1 py-2 border border-gray-300 rounded text-sm font-medium hover:bg-gray-50"
                            >
                                Edit
                            </button>
                            <button 
                                onClick={() => toggleActiveStatus(plan)}
                                className={`px-3 py-2 rounded border ${plan.isActive ? 'text-red-600 border-red-200 hover:bg-red-50' : 'text-green-600 border-green-200 hover:bg-green-50'}`}
                            >
                                <Icons.Zap className="w-4 h-4" />
                            </button>
                        </div>
                    </div>
                ))}
            </div>

        </div>
    );
};

  const renderPendingPayments = () => {
    const pendingCompanies = tenants.filter(c => c.subscriptionStatus === 'PENDING_PAYMENT');
    
    const handleApprovePayment = async (companyId: string) => {
      try {
        await supabaseService.updateCompanyStatus(companyId, 'ACTIVE');
        toast.success('Payment approved! Company account activated.');
        // Refresh tenants list
        const updatedTenants = await supabaseService.getAllCompanies();
        setTenants(updatedTenants || []);
      } catch (error) {
        console.error('Error approving payment:', error);
        toast.error('Failed to approve payment');
      }
    };

    const handleRejectPayment = async (companyId: string) => {
      try {
        await supabaseService.updateCompanyStatus(companyId, 'SUSPENDED');
        toast.info('Payment rejected. Company account suspended.');
        // Refresh tenants list
        const updatedTenants = await supabaseService.getAllCompanies();
        setTenants(updatedTenants || []);
      } catch (error) {
        console.error('Error rejecting payment:', error);
        toast.error('Failed to reject payment');
      }
    };

    return (
      <div className="animate-fade-in">
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          <div className="p-6 border-b border-gray-200">
            <h3 className="text-lg font-bold text-gray-900">Pending Payment Approvals</h3>
            <p className="text-sm text-gray-500 mt-1">
              Companies awaiting direct deposit payment verification
            </p>
          </div>
          
          {pendingCompanies.length === 0 ? (
            <div className="p-12 text-center">
              <Icons.CheckCircle className="w-12 h-12 text-gray-300 mx-auto mb-3" />
              <p className="text-gray-500">No pending payments to approve</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase">Company</th>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase">Plan</th>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase">MRR</th>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase">Employees</th>
                    <th className="px-6 py-4 text-right text-xs font-semibold text-gray-500 uppercase">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {pendingCompanies.map((company) => (
                    <tr key={company.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4">
                        <div>
                          <p className="font-medium text-gray-900">{company.companyName}</p>
                          <p className="text-sm text-gray-500">{company.email}</p>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                          {company.plan}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-900">
                        ${company.mrr?.toLocaleString() || 0}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-500">
                        {company.employeeCount}
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex justify-end space-x-2">
                          <button
                            onClick={() => handleApprovePayment(company.id)}
                            className="inline-flex items-center px-3 py-1.5 bg-green-600 text-white text-sm font-medium rounded hover:bg-green-700 transition-colors"
                          >
                            <Icons.CheckCircle className="w-4 h-4 mr-1" />
                            Approve
                          </button>
                          <button
                            onClick={() => handleRejectPayment(company.id)}
                            className="inline-flex items-center px-3 py-1.5 bg-red-600 text-white text-sm font-medium rounded hover:bg-red-700 transition-colors"
                          >
                            <Icons.Close className="w-4 h-4 mr-1" />
                            Reject
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    );
  };

  const renderSettings = () => (
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 animate-fade-in">
          <div className="bg-white p-8 rounded-xl shadow-sm border border-gray-200">
              <h3 className="text-lg font-bold text-gray-900 mb-4">General Configuration</h3>
              
              {/* Database Connection Status Card */}
               <div className="mb-6 bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                   <div className="flex justify-between items-start mb-4">
                       <div>
                           <h3 className="text-sm font-bold text-gray-900">Database Status</h3>
                           <p className="text-xs text-gray-500">Supabase Connection</p>
                       </div>
                       <div className="flex items-center">
                           {isCheckingDb ? (
                               <span className="text-gray-500 text-xs flex items-center">
                                   <Icons.Refresh className="w-3 h-3 mr-2 animate-spin" /> Checking...
                               </span>
                           ) : (
                               <button 
                                   onClick={handleCheckDb}
                                   className="text-xs text-jam-orange hover:text-yellow-600 font-medium flex items-center"
                               >
                                   <Icons.Refresh className="w-3 h-3 mr-1" /> Re-check
                               </button>
                           )}
                       </div>
                   </div>
                   <div className={`p-4 rounded-lg border ${
                       dbStatus?.connected 
                           ? 'bg-green-50 border-green-200' 
                           : 'bg-red-50 border-red-200'
                   }`}>
                       <div className="flex items-start">
                           <div className={`p-2 rounded-full mr-3 ${
                               dbStatus?.connected ? 'bg-green-100 text-green-600' : 'bg-red-100 text-red-600'
                           }`}>
                               {dbStatus?.connected ? <Icons.CheckCircle className="w-5 h-5" /> : <Icons.Alert className="w-5 h-5" />}
                           </div>
                           <div>
                               <h4 className={`font-bold text-sm ${
                                   dbStatus?.connected ? 'text-green-800' : 'text-red-800'
                               }`}>
                                   {dbStatus?.message || 'Not Checked'}
                               </h4>
                               <p className={`text-xs mt-1 ${
                                   dbStatus?.connected ? 'text-green-600' : 'text-red-600'
                               }`}>
                                   {dbStatus?.details || 'Click Re-check to verify connection.'}
                               </p>
                           </div>
                       </div>
                   </div>
                   {/* Local Connection Warning */}
                   {dbStatus?.connected && isUsingLocalOverrides() && (
                       <div className="mt-3 bg-yellow-50 border border-yellow-200 p-3 rounded-md text-xs text-yellow-800 flex items-start">
                           <Icons.Alert className="w-4 h-4 mr-2 flex-shrink-0" />
                           <div>
                               <strong>Local Override Active:</strong> You are connected via browser storage manually entered keys. 
                               <p className="mt-1">This will <strong>NOT work</strong> in Incognito mode or on other devices. To fix this, add the keys to your Vercel Environment Variables.</p>
                           </div>
                       </div>
                   )}
               </div>

              {/* Gateway Status Card */}
              <div className="mb-6 bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                  <div className="flex justify-between items-start mb-4">
                      <div>
                          <h3 className="text-sm font-bold text-gray-900">Payment Gateway Status</h3>
                          <p className="text-xs text-gray-500">Gateway Configuration & Availability</p>
                      </div>
                  </div>
                  <div className="space-y-3">
                      {/* DimePay Status */}
                      <div className={`p-3 rounded-lg border ${
                          (() => {
                              if (!paymentConfig.dimepay?.enabled) return 'bg-gray-50 border-gray-200';
                              const activeEnv = paymentConfig.dimepay.environment || 'sandbox';
                              const activeCreds = activeEnv === 'production' ? paymentConfig.dimepay.production : paymentConfig.dimepay.sandbox;
                              const isConfigured = activeCreds?.apiKey && activeCreds?.secretKey && activeCreds?.merchantId;
                              return isConfigured ? 'bg-green-50 border-green-200' : 'bg-yellow-50 border-yellow-200';
                          })()
                      }`}>
                          <div className="flex items-center justify-between">
                              <div className="flex items-center">
                                  <div className={`p-1.5 rounded-full mr-2 ${
                                      (() => {
                                          if (!paymentConfig.dimepay?.enabled) return 'bg-gray-100 text-gray-400';
                                          const activeEnv = paymentConfig.dimepay.environment || 'sandbox';
                                          const activeCreds = activeEnv === 'production' ? paymentConfig.dimepay.production : paymentConfig.dimepay.sandbox;
                                          const isConfigured = activeCreds?.apiKey && activeCreds?.secretKey && activeCreds?.merchantId;
                                          return isConfigured ? 'bg-green-100 text-green-600' : 'bg-yellow-100 text-yellow-600';
                                      })()
                                  }`}>
                                      {(() => {
                                          if (!paymentConfig.dimepay?.enabled) return <Icons.Close className="w-4 h-4" />;
                                          const activeEnv = paymentConfig.dimepay.environment || 'sandbox';
                                          const activeCreds = activeEnv === 'production' ? paymentConfig.dimepay.production : paymentConfig.dimepay.sandbox;
                                          const isConfigured = activeCreds?.apiKey && activeCreds?.secretKey && activeCreds?.merchantId;
                                          return isConfigured ? <Icons.CheckCircle className="w-4 h-4" /> : <Icons.Alert className="w-4 h-4" />;
                                      })()}
                                  </div>
                                  <div>
                                      <h4 className="font-semibold text-sm text-gray-900">DimePay</h4>
                                      <p className="text-xs text-gray-600">
                                          {(() => {
                                              if (!paymentConfig.dimepay?.enabled) return 'Disabled';
                                              const activeEnv = paymentConfig.dimepay.environment || 'sandbox';
                                              const activeCreds = activeEnv === 'production' ? paymentConfig.dimepay.production : paymentConfig.dimepay.sandbox;
                                              const isConfigured = activeCreds?.apiKey && activeCreds?.secretKey && activeCreds?.merchantId;
                                              const envLabel = activeEnv === 'production' ? '🚀 Production' : '🧪 Sandbox';
                                              return isConfigured ? `${envLabel} - Configured` : `${envLabel} - Missing credentials`;
                                          })()}
                                      </p>
                                  </div>
                              </div>
                              <span className={`text-xs px-2 py-1 rounded font-medium ${
                                  (() => {
                                      if (!paymentConfig.dimepay?.enabled) return 'bg-gray-100 text-gray-600';
                                      const activeEnv = paymentConfig.dimepay.environment || 'sandbox';
                                      const activeCreds = activeEnv === 'production' ? paymentConfig.dimepay.production : paymentConfig.dimepay.sandbox;
                                      const isConfigured = activeCreds?.apiKey && activeCreds?.secretKey && activeCreds?.merchantId;
                                      return isConfigured ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700';
                                  })()
                              }`}>
                                  {(() => {
                                      if (!paymentConfig.dimepay?.enabled) return 'Inactive';
                                      const activeEnv = paymentConfig.dimepay.environment || 'sandbox';
                                      const activeCreds = activeEnv === 'production' ? paymentConfig.dimepay.production : paymentConfig.dimepay.sandbox;
                                      const isConfigured = activeCreds?.apiKey && activeCreds?.secretKey && activeCreds?.merchantId;
                                      return isConfigured ? 'Active' : 'Incomplete';
                                  })()}
                              </span>
                          </div>
                      </div>

                      {/* Stripe Status */}
                      <div className={`p-3 rounded-lg border ${
                          paymentConfig.stripe?.enabled && paymentConfig.stripe?.publishableKey && paymentConfig.stripe?.secretKey
                              ? 'bg-green-50 border-green-200' 
                              : paymentConfig.stripe?.enabled
                                  ? 'bg-yellow-50 border-yellow-200'
                                  : 'bg-gray-50 border-gray-200'
                      }`}>
                          <div className="flex items-center justify-between">
                              <div className="flex items-center">
                                  <div className={`p-1.5 rounded-full mr-2 ${
                                      paymentConfig.stripe?.enabled && paymentConfig.stripe?.publishableKey && paymentConfig.stripe?.secretKey
                                          ? 'bg-green-100 text-green-600' 
                                          : paymentConfig.stripe?.enabled
                                              ? 'bg-yellow-100 text-yellow-600'
                                              : 'bg-gray-100 text-gray-400'
                                  }`}>
                                      {paymentConfig.stripe?.enabled && paymentConfig.stripe?.publishableKey && paymentConfig.stripe?.secretKey
                                          ? <Icons.CheckCircle className="w-4 h-4" />
                                          : paymentConfig.stripe?.enabled
                                              ? <Icons.Alert className="w-4 h-4" />
                                              : <Icons.Close className="w-4 h-4" />
                                      }
                                  </div>
                                  <div>
                                      <h4 className="font-semibold text-sm text-gray-900">Stripe</h4>
                                      <p className="text-xs text-gray-600">
                                          {paymentConfig.stripe?.enabled && paymentConfig.stripe?.publishableKey && paymentConfig.stripe?.secretKey
                                              ? 'Configured'
                                              : paymentConfig.stripe?.enabled
                                                  ? 'Enabled but missing credentials'
                                                  : 'Disabled'
                                          }
                                      </p>
                                  </div>
                              </div>
                              <span className={`text-xs px-2 py-1 rounded font-medium ${
                                  paymentConfig.stripe?.enabled && paymentConfig.stripe?.publishableKey && paymentConfig.stripe?.secretKey
                                      ? 'bg-green-100 text-green-700'
                                      : paymentConfig.stripe?.enabled
                                          ? 'bg-yellow-100 text-yellow-700'
                                          : 'bg-gray-100 text-gray-600'
                              }`}>
                                  {paymentConfig.stripe?.enabled && paymentConfig.stripe?.publishableKey && paymentConfig.stripe?.secretKey
                                      ? 'Active'
                                      : paymentConfig.stripe?.enabled
                                          ? 'Incomplete'
                                          : 'Inactive'
                                  }
                              </span>
                          </div>
                      </div>

                      {/* PayPal Status */}
                      <div className={`p-3 rounded-lg border ${
                          paymentConfig.paypal?.enabled && paymentConfig.paypal?.clientId && paymentConfig.paypal?.secret
                              ? 'bg-green-50 border-green-200' 
                              : paymentConfig.paypal?.enabled
                                  ? 'bg-yellow-50 border-yellow-200'
                                  : 'bg-gray-50 border-gray-200'
                      }`}>
                          <div className="flex items-center justify-between">
                              <div className="flex items-center">
                                  <div className={`p-1.5 rounded-full mr-2 ${
                                      paymentConfig.paypal?.enabled && paymentConfig.paypal?.clientId && paymentConfig.paypal?.secret
                                          ? 'bg-green-100 text-green-600' 
                                          : paymentConfig.paypal?.enabled
                                              ? 'bg-yellow-100 text-yellow-600'
                                              : 'bg-gray-100 text-gray-400'
                                  }`}>
                                      {paymentConfig.paypal?.enabled && paymentConfig.paypal?.clientId && paymentConfig.paypal?.secret
                                          ? <Icons.CheckCircle className="w-4 h-4" />
                                          : paymentConfig.paypal?.enabled
                                              ? <Icons.Alert className="w-4 h-4" />
                                              : <Icons.Close className="w-4 h-4" />
                                      }
                                  </div>
                                  <div>
                                      <h4 className="font-semibold text-sm text-gray-900">PayPal</h4>
                                      <p className="text-xs text-gray-600">
                                          {paymentConfig.paypal?.enabled && paymentConfig.paypal?.clientId && paymentConfig.paypal?.secret
                                              ? `${paymentConfig.paypal.mode === 'live' ? 'Live' : 'Sandbox'} - Configured`
                                              : paymentConfig.paypal?.enabled
                                                  ? 'Enabled but missing credentials'
                                                  : 'Disabled'
                                          }
                                      </p>
                                  </div>
                              </div>
                              <span className={`text-xs px-2 py-1 rounded font-medium ${
                                  paymentConfig.paypal?.enabled && paymentConfig.paypal?.clientId && paymentConfig.paypal?.secret
                                      ? 'bg-green-100 text-green-700'
                                      : paymentConfig.paypal?.enabled
                                          ? 'bg-yellow-100 text-yellow-700'
                                          : 'bg-gray-100 text-gray-600'
                              }`}>
                                  {paymentConfig.paypal?.enabled && paymentConfig.paypal?.clientId && paymentConfig.paypal?.secret
                                      ? 'Active'
                                      : paymentConfig.paypal?.enabled
                                          ? 'Incomplete'
                                          : 'Inactive'
                                  }
                              </span>
                          </div>
                      </div>
                  </div>
              </div>

              {/* Email Service Status Card */}
              <div className="mb-6 bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                  <div className="flex justify-between items-start mb-4">
                      <div>
                          <h3 className="text-sm font-bold text-gray-900">Email Service Status</h3>
                          <p className="text-xs text-gray-500">EmailJS Configuration</p>
                      </div>
                  </div>
                  <div className="p-4 rounded-lg border bg-green-50 border-green-200">
                      <div className="flex items-start">
                          <div className="p-2 rounded-full mr-3 bg-green-100 text-green-600">
                              <Icons.CheckCircle className="w-5 h-5" />
                          </div>
                          <div className="flex-1">
                              <h4 className="font-bold text-sm text-green-800">
                                  Email Service Active (SMTP)
                              </h4>
                              <p className="text-xs mt-1 text-green-600">
                                  Email invitations and notifications are enabled via Brevo SMTP.
                              </p>
                              <div className="mt-2 text-xs text-green-700">
                                  <p className="font-semibold">Active Features:</p>
                                  <ul className="list-disc list-inside mt-1 space-y-0.5">
                                      <li>Employee Invitations</li>
                                      <li>Reseller Invitations</li>
                                      <li>Payslip Notifications</li>
                                      <li>Password Reset Emails</li>
                                  </ul>
                              </div>
                          </div>
                      </div>
                  </div>
              </div>

              {/* Data Source Toggle */}
              <div className="mb-4 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                  <div className="flex justify-between items-center mb-2">
                      <h4 className="font-bold text-blue-900">Data Source</h4>
                      <div className="text-xs bg-white border border-blue-200 px-2 py-1 rounded text-blue-800 font-mono">
                          {paymentConfig.dataSource || 'LOCAL'}
                      </div>
                  </div>
                  <p className="text-sm text-blue-800 mb-3">
                      Select where application data is stored.
                  </p>
                  <div className="flex space-x-2">
                      <button 
                        onClick={() => handleDataSourceChange()}
                        disabled
                        className="flex-1 py-2 text-sm font-medium rounded-lg border transition-colors opacity-50 cursor-not-allowed bg-white text-blue-600 border-blue-300"
                      >
                          Browser (Demo) - Disabled
                      </button>
                      <button 
                        onClick={() => handleDataSourceChange()}
                        className="flex-1 py-2 text-sm font-medium rounded-lg border transition-colors bg-green-600 text-white border-green-600"
                      >
                          Supabase (Live)
                      </button>
                  </div>
              </div>

              <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg border border-gray-200 mb-4">
                  <div><h4 className="font-bold">Maintenance Mode</h4><p className="text-sm text-gray-500">Lockout non-admins.</p></div>
                  <input type="checkbox" checked={paymentConfig.maintenanceMode} onChange={(e) => handleToggleMaintenance(e.target.checked)} className="h-5 w-5 text-jam-orange focus:ring-jam-orange"/>
              </div>
              <button onClick={handlePushTaxUpdate} className="w-full py-2 border border-gray-300 rounded-lg text-sm font-medium hover:bg-gray-50 mb-3">Push Global Tax Update</button>
              
              {/* Added Save Button */}
              <button 
                onClick={async () => { 
                  // Save to Supabase (this will also update localStorage via useEffect)
                  try {
                    await supabaseService.saveGlobalConfig(paymentConfig);
                    
                    // Also save payment gateway settings to each company's settings
                    const allCompanies = await supabaseService.getAllCompanies();
                    for (const company of allCompanies) {
                      await supabaseService.savePaymentGatewaySettings(company.id, {
                        dimepay: paymentConfig.dimepay,
                        paypal: paymentConfig.paypal,
                        emailjs: paymentConfig.emailjs,
                        stripe: paymentConfig.stripe
                      });
                    }
                    toast.success("Settings saved successfully to Supabase");
                  } catch (error) {
                    console.error("Error saving to Supabase:", error);
                    storage.saveGlobalConfig(paymentConfig);
                    toast.success("Settings saved locally");
                  }
                }}
                className="w-full py-3 bg-jam-black text-white rounded-lg font-bold hover:bg-gray-800 shadow-md"
              >
                  Save Global Settings
              </button>
          </div>
          <div className="bg-white p-8 rounded-xl shadow-sm border border-gray-200">
              <h3 className="text-lg font-bold text-gray-900 mb-4">Payment Gateways</h3>
              <div className="space-y-4">
                  {/* DimePay Config Input */}
                  <div className="mb-4 p-4 bg-gray-50 rounded-lg border border-gray-200">
                      <div className="flex justify-between items-center mb-4">
                          <h4 className="font-bold text-gray-800">DimePay</h4>
                          <input 
                              type="checkbox" 
                              checked={!!paymentConfig.dimepay?.enabled}
                              onChange={(e) => setPaymentConfig({
                                  ...paymentConfig, 
                                  dimepay: {
                                      ...(paymentConfig.dimepay || {}),
                                      enabled: e.target.checked
                                  }
                              })}
                              className="h-5 w-5 text-jam-orange focus:ring-jam-orange"
                          />
                      </div>
                      
                      {paymentConfig.dimepay?.enabled && (
                          <div className="space-y-4 animate-fade-in">
                              <div className="grid grid-cols-2 gap-4">
                                  <div>
                                      <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Active Environment</label>
                                      <select 
                                          value={paymentConfig.dimepay?.environment || 'sandbox'}
                                          onChange={(e) => handleDimeEnvChange(e.target.value as any)}
                                          className="w-full border border-gray-300 rounded p-2 text-sm bg-white font-semibold"
                                      >
                                          <option value="sandbox">🧪 Sandbox (Test)</option>
                                          <option value="production">🚀 Production (Live)</option>
                                      </select>
                                  </div>
                                  <div>
                                      <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Pass Fees To</label>
                                      <select 
                                          value={paymentConfig.dimepay?.passFeesTo || 'MERCHANT'}
                                          onChange={(e) => setPaymentConfig({
                                              ...paymentConfig, 
                                              dimepay: {
                                                  ...(paymentConfig.dimepay || {}),
                                                  passFeesTo: e.target.value as any
                                              }
                                          })}
                                          className="w-full border border-gray-300 rounded p-2 text-sm bg-white"
                                      >
                                          <option value="MERCHANT">Merchant (You)</option>
                                          <option value="CUSTOMER">Customer (Client)</option>
                                      </select>
                                  </div>
                              </div>

                              {/* Sandbox Credentials */}
                              <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
                                  <h5 className="font-semibold text-sm text-blue-900 mb-3 flex items-center">
                                      <Icons.Shield className="w-4 h-4 mr-2" />
                                      Sandbox Credentials (Test Mode)
                                  </h5>
                                  <div className="space-y-3">
                                      <div>
                                          <label className="block text-xs font-bold text-gray-600 uppercase mb-1">Client Key</label>
                                          <input 
                                            type="text" 
                                            placeholder="ck_test_..." 
                                            value={paymentConfig.dimepay?.sandbox?.apiKey || ''}
                                            onChange={(e) => setPaymentConfig({
                                                ...paymentConfig, 
                                                dimepay: {
                                                    ...(paymentConfig.dimepay || {}),
                                                    sandbox: {
                                                        ...(paymentConfig.dimepay?.sandbox || { domain: 'https://staging.api.dimepay.app' }),
                                                        apiKey: e.target.value
                                                    }
                                                }
                                            })}
                                            className="w-full border border-blue-300 rounded p-2 text-sm font-mono"
                                          />
                                      </div>
                                      <div>
                                          <label className="block text-xs font-bold text-gray-600 uppercase mb-1">Secret Key</label>
                                          <input 
                                            type="password" 
                                            placeholder="sk_test_..." 
                                            value={paymentConfig.dimepay?.sandbox?.secretKey || ''}
                                            onChange={(e) => setPaymentConfig({
                                                ...paymentConfig, 
                                                dimepay: {
                                                    ...(paymentConfig.dimepay || {}),
                                                    sandbox: {
                                                        ...(paymentConfig.dimepay?.sandbox || { domain: 'https://staging.api.dimepay.app' }),
                                                        secretKey: e.target.value
                                                    }
                                                }
                                            })}
                                            className="w-full border border-blue-300 rounded p-2 text-sm font-mono"
                                          />
                                      </div>
                                      <div>
                                          <label className="block text-xs font-bold text-gray-600 uppercase mb-1">Merchant ID</label>
                                          <input 
                                            type="text" 
                                            placeholder="mQn_..." 
                                            value={paymentConfig.dimepay?.sandbox?.merchantId || ''}
                                            onChange={(e) => setPaymentConfig({
                                                ...paymentConfig, 
                                                dimepay: {
                                                    ...(paymentConfig.dimepay || {}),
                                                    sandbox: {
                                                        ...(paymentConfig.dimepay?.sandbox || { domain: 'https://staging.api.dimepay.app' }),
                                                        merchantId: e.target.value
                                                    }
                                                }
                                            })}
                                            className="w-full border border-blue-300 rounded p-2 text-sm font-mono"
                                          />
                                      </div>
                                      <div>
                                          <label className="block text-xs font-bold text-gray-600 uppercase mb-1">API URL</label>
                                          <input 
                                            type="text" 
                                            readOnly
                                            value={paymentConfig.dimepay?.sandbox?.domain || 'https://staging.api.dimepay.app'}
                                            className="w-full border border-blue-200 bg-blue-100 rounded p-2 text-sm text-blue-700 font-mono cursor-not-allowed"
                                          />
                                      </div>
                                  </div>
                              </div>

                              {/* Production Credentials */}
                              <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
                                  <h5 className="font-semibold text-sm text-green-900 mb-3 flex items-center">
                                      <Icons.CheckCircle className="w-4 h-4 mr-2" />
                                      Production Credentials (Live Mode)
                                  </h5>
                                  <div className="space-y-3">
                                      <div>
                                          <label className="block text-xs font-bold text-gray-600 uppercase mb-1">Client Key</label>
                                          <input 
                                            type="text" 
                                            placeholder="ck_prod_..." 
                                            value={paymentConfig.dimepay?.production?.apiKey || ''}
                                            onChange={(e) => setPaymentConfig({
                                                ...paymentConfig, 
                                                dimepay: {
                                                    ...(paymentConfig.dimepay || {}),
                                                    production: {
                                                        ...(paymentConfig.dimepay?.production || { domain: 'https://api.dimepay.app' }),
                                                        apiKey: e.target.value
                                                    }
                                                }
                                            })}
                                            className="w-full border border-green-300 rounded p-2 text-sm font-mono"
                                          />
                                      </div>
                                      <div>
                                          <label className="block text-xs font-bold text-gray-600 uppercase mb-1">Secret Key</label>
                                          <input 
                                            type="password" 
                                            placeholder="sk_prod_..." 
                                            value={paymentConfig.dimepay?.production?.secretKey || ''}
                                            onChange={(e) => setPaymentConfig({
                                                ...paymentConfig, 
                                                dimepay: {
                                                    ...(paymentConfig.dimepay || {}),
                                                    production: {
                                                        ...(paymentConfig.dimepay?.production || { domain: 'https://api.dimepay.app' }),
                                                        secretKey: e.target.value
                                                    }
                                                }
                                            })}
                                            className="w-full border border-green-300 rounded p-2 text-sm font-mono"
                                          />
                                      </div>
                                      <div>
                                          <label className="block text-xs font-bold text-gray-600 uppercase mb-1">Merchant ID</label>
                                          <input 
                                            type="text" 
                                            placeholder="mQn_..." 
                                            value={paymentConfig.dimepay?.production?.merchantId || ''}
                                            onChange={(e) => setPaymentConfig({
                                                ...paymentConfig, 
                                                dimepay: {
                                                    ...(paymentConfig.dimepay || {}),
                                                    production: {
                                                        ...(paymentConfig.dimepay?.production || { domain: 'https://api.dimepay.app' }),
                                                        merchantId: e.target.value
                                                    }
                                                }
                                            })}
                                            className="w-full border border-green-300 rounded p-2 text-sm font-mono"
                                          />
                                      </div>
                                      <div>
                                          <label className="block text-xs font-bold text-gray-600 uppercase mb-1">API URL</label>
                                          <input 
                                            type="text" 
                                            readOnly
                                            value={paymentConfig.dimepay?.production?.domain || 'https://api.dimepay.app'}
                                            className="w-full border border-green-200 bg-green-100 rounded p-2 text-sm text-green-700 font-mono cursor-not-allowed"
                                          />
                                      </div>
                                  </div>
                              </div>
                          </div>
                      )}
                  </div>

                  {/* PayPal Config Input */}
                  <div className="mb-4 p-4 bg-gray-50 rounded-lg border border-gray-200">
                      <div className="flex justify-between items-center mb-2">
                          <h4 className="font-bold text-gray-800">PayPal</h4>
                          <input 
                              type="checkbox" 
                              checked={!!paymentConfig.paypal?.enabled}
                              onChange={(e) => setPaymentConfig({
                                  ...paymentConfig, 
                                  paypal: {
                                      ...(paymentConfig.paypal || {}),
                                      enabled: e.target.checked
                                  }
                              })}
                              className="h-5 w-5 text-jam-orange focus:ring-jam-orange"
                          />
                      </div>
                      {paymentConfig.paypal?.enabled && (
                          <div>
                              <input 
                                type="text" 
                                placeholder="Client ID" 
                                value={paymentConfig.paypal.clientId}
                                onChange={(e) => setPaymentConfig({...paymentConfig, paypal: {...paymentConfig.paypal, clientId: e.target.value}})}
                                className="w-full border border-gray-300 rounded p-2 text-sm"
                              />
                          </div>
                      )}
                  </div>

                  {/* EmailJS Config Input */}
                  <div className="p-4 bg-gray-50 rounded-lg border border-gray-200">
                      <h4 className="font-bold text-gray-800 mb-2">EmailJS</h4>
                      <div className="space-y-2">
                          <input 
                            type="text" 
                            placeholder="Service ID" 
                            value={paymentConfig.emailjs?.serviceId || ''}
                            onChange={(e) => setPaymentConfig({...paymentConfig, emailjs: {serviceId: e.target.value, templateId: paymentConfig.emailjs?.templateId || '', publicKey: paymentConfig.emailjs?.publicKey || ''}})}
                            className="w-full border border-gray-300 rounded p-2 text-sm"
                          />
                          <input 
                            type="text" 
                            placeholder="Template ID" 
                            value={paymentConfig.emailjs?.templateId || ''}
                            onChange={(e) => setPaymentConfig({...paymentConfig, emailjs: {serviceId: paymentConfig.emailjs?.serviceId || '', templateId: e.target.value, publicKey: paymentConfig.emailjs?.publicKey || ''}})}
                            className="w-full border border-gray-300 rounded p-2 text-sm"
                          />
                          <input 
                            type="password" 
                            placeholder="Public Key" 
                            value={paymentConfig.emailjs?.publicKey || ''}
                            onChange={(e) => setPaymentConfig({...paymentConfig, emailjs: {serviceId: paymentConfig.emailjs?.serviceId || '', templateId: paymentConfig.emailjs?.templateId || '', publicKey: e.target.value}})}
                            className="w-full border border-gray-300 rounded p-2 text-sm"
                          />
                      </div>
                  </div>
              </div>
          </div>
      </div>
  );

  return (
    <div className="space-y-8 animate-fade-in relative">
      {/* Connection Wizard Modal */}
      {connectWizard.open && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
              <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh]">
                  <div className="bg-jam-black text-white p-6 flex justify-between items-center">
                      <div>
                          <h3 className="text-xl font-bold">Connect to Database</h3>
                          <p className="text-xs text-gray-400">
                              {connectWizard.step === 4 ? 'Manual Test' : `Step ${connectWizard.step} of 3`}
                          </p>
                      </div>
                      <button onClick={() => setConnectWizard({...connectWizard, open: false})} className="text-gray-400 hover:text-white">
                          <Icons.Close className="w-6 h-6" />
                      </button>
                  </div>
                  
                  <div className="p-6 overflow-y-auto">
                      {connectWizard.step === 1 && (
                          <div className="space-y-4 text-center">
                              <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
                                  <Icons.Alert className="w-8 h-8 text-red-600" />
                              </div>
                              <h4 className="text-xl font-bold text-gray-900">Connection Failed</h4>
                              <p className="text-gray-600">
                                  We couldn't connect to Supabase. Environment variables might be missing.
                              </p>
                              <div className="bg-gray-100 p-4 rounded text-left text-sm font-mono mt-4 border border-gray-200 break-words">
                                  <p className="text-red-600 font-bold mb-1">Error:</p>
                                  {dbStatus?.details || 'Unknown Error'}
                              </div>
                              <button 
                                onClick={() => setConnectWizard({...connectWizard, step: 4})}
                                className="text-jam-orange hover:underline text-sm font-bold mt-2"
                              >
                                  Or try entering credentials manually &rarr;
                              </button>
                          </div>
                      )}

                      {connectWizard.step === 2 && (
                          <div className="space-y-4">
                              <h4 className="font-bold text-gray-900 border-b pb-2">Required Variables</h4>
                              <p className="text-sm text-gray-600">
                                  Add these to your Vercel Project Settings (Settings &gt; Environment Variables).
                              </p>
                              <div className="space-y-3 mt-4">
                                  <div className="bg-blue-50 p-3 rounded border border-blue-100">
                                      <p className="text-xs font-bold text-blue-800 uppercase">URL Variable</p>
                                      <p className="font-mono text-sm text-blue-900 select-all">VITE_SUPABASE_URL</p>
                                  </div>
                                  <div className="bg-blue-50 p-3 rounded border border-blue-100">
                                      <p className="text-xs font-bold text-blue-800 uppercase">Key Variable</p>
                                      <p className="font-mono text-sm text-blue-900 select-all">VITE_SUPABASE_ANON_KEY</p>
                                  </div>
                              </div>
                          </div>
                      )}

                      {connectWizard.step === 3 && (
                          <div className="space-y-4 text-center">
                              <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
                                  <Icons.Refresh className="w-8 h-8 text-blue-600" />
                              </div>
                              <h4 className="text-xl font-bold text-gray-900">Ready to Retry?</h4>
                              <p className="text-gray-600">
                                  If you've updated settings in Vercel, you may need to redeploy or restart the dev server.
                              </p>
                          </div>
                      )}

                      {/* Step 4: Manual Input */}
                      {connectWizard.step === 4 && (
                          <div className="space-y-4">
                              <h4 className="font-bold text-gray-900 border-b pb-2">Manual Connection Test</h4>
                              <p className="text-sm text-gray-600">
                                  Paste your Supabase credentials directly to test validity.
                              </p>
                              <div>
                                  <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Project URL</label>
                                  <input 
                                    type="text" 
                                    className="w-full border border-gray-300 rounded p-2 text-sm"
                                    placeholder="https://xyz.supabase.co"
                                    value={manualCreds.url}
                                    onChange={e => setManualCreds({...manualCreds, url: e.target.value})}
                                  />
                              </div>
                              <div>
                                  <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Anon Key</label>
                                  <input 
                                    type="text" 
                                    className="w-full border border-gray-300 rounded p-2 text-sm"
                                    placeholder="eyJh..."
                                    value={manualCreds.key}
                                    onChange={e => setManualCreds({...manualCreds, key: e.target.value})}
                                  />
                              </div>
                              
                              {manualTestResult && (
                                  <div className={`p-3 rounded text-sm font-bold text-center ${manualTestResult.success ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                                      {manualTestResult.msg}
                                  </div>
                              )}

                              <button 
                                onClick={handleManualTest}
                                className="w-full py-2 bg-jam-black text-white rounded font-bold hover:bg-gray-800"
                              >
                                  Test Connection
                              </button>
                          </div>
                      )}
                  </div>

                  <div className="p-6 border-t border-gray-100 flex justify-between bg-gray-50">
                      {connectWizard.step === 1 ? (
                          <button onClick={() => setConnectWizard({...connectWizard, open: false})} className="text-gray-500">Cancel</button>
                      ) : (
                          <button onClick={() => setConnectWizard({...connectWizard, step: 1})} className="text-gray-500">Back</button>
                      )}
                      
                      {connectWizard.step < 3 && connectWizard.step !== 4 && (
                          <button onClick={() => setConnectWizard({...connectWizard, step: connectWizard.step + 1})} className="bg-jam-black text-white px-4 py-2 rounded">Next</button>
                      )}
                      
                      {connectWizard.step === 3 && (
                          <button onClick={handleWizardRetry} className="bg-green-600 text-white px-4 py-2 rounded font-bold">Retry Auto-Connect</button>
                      )}
                  </div>
              </div>
          </div>
      )}

      {/* Header */}
      <div className="flex justify-between items-end pb-4 border-b border-gray-200">
        <div>
          <h2 className="text-4xl font-extrabold text-jam-black">Super Admin</h2>
          <p className="text-gray-500 mt-2 font-medium">Platform administration & analytics.</p>
        </div>
        <div className="flex space-x-2">
            <div className="bg-red-50 text-red-700 px-4 py-1.5 rounded-full text-xs font-bold uppercase tracking-wider flex items-center border border-red-100">
                <Icons.Shield className="w-3 h-3 mr-2" /> Root Access
            </div>
        </div>
      </div>

      {/* Navigation */}
      <div className="border-b border-gray-200">
        <nav className="-mb-px flex space-x-8">
            {['overview', 'tenants', 'pending-payments', 'billing', 'health', 'users', 'logs', 'plans', 'settings'].map((tab) => (
                <button
                    key={tab}
                    onClick={() => setActiveTab(tab as any)}
                    className={`whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm capitalize transition-colors ${
                        activeTab === tab
                        ? 'border-jam-orange text-jam-black'
                        : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                    }`}
                >
                    {tab === 'pending-payments' ? 'Pending Payments' : tab}
                </button>
            ))}
        </nav>
      </div>

      {/* Content Area */}
      <div className="min-h-[600px]">
         {activeTab === 'overview' && renderOverview()}
         {activeTab === 'tenants' && renderTenants()}
         {activeTab === 'pending-payments' && renderPendingPayments()}
         {activeTab === 'users' && renderAdmins()}
         {activeTab === 'logs' && renderLogs()}
         {activeTab === 'settings' && renderSettings()}
         {activeTab === 'health' && renderHealth()}
         {activeTab === 'billing' && renderBilling()}
         {activeTab === 'plans' && renderPlans()}
      </div>
      {editingPlan && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg overflow-hidden animate-scale-in">
            <div className="p-6 border-b border-gray-100 bg-gray-50 flex justify-between items-center">
              <h3 className="text-xl font-bold text-gray-900">Edit {editingPlan.name} Plan</h3>
              <button onClick={() => setEditingPlan(null)} className="text-gray-400 hover:text-gray-600">
                <Icons.Close className="w-6 h-6" />
              </button>
            </div>
            <div className="p-6 space-y-4 max-h-[60vh] overflow-y-auto">
              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Plan Name</label>
                <input
                  type="text"
                  className="w-full border border-gray-300 rounded px-3 py-2"
                  value={editingPlan.name}
                  onChange={e => setEditingPlan({...editingPlan, name: e.target.value})}
                />
              </div>
              
              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Pricing Model</label>
                <select
                  className="w-full border border-gray-300 rounded px-3 py-2"
                  value={editingPlan.priceConfig.type}
                  onChange={e => setEditingPlan({
                    ...editingPlan,
                    priceConfig: { ...editingPlan.priceConfig, type: e.target.value as any }
                  })}
                >
                  <option value="free">Free</option>
                  <option value="flat">Flat Rate</option>
                  <option value="per_emp">Per Employee</option>
                  <option value="base">Base + Usage (Reseller)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Employee Limit</label>
                <select
                  className="w-full border border-gray-300 rounded px-3 py-2"
                  value={editingPlan.limit}
                  onChange={e => setEditingPlan({...editingPlan, limit: e.target.value})}
                >
                  <option value="5">5 Employees</option>
                  <option value="25">25 Employees</option>
                  <option value="100">100 Employees</option>
                  <option value="Unlimited">Unlimited</option>
                </select>
              </div>

              {editingPlan.priceConfig.type !== 'free' && (
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Monthly Price</label>
                    <input 
                      type="number"
                      className="w-full border border-gray-300 rounded px-3 py-2"
                      value={editingPlan.priceConfig.monthly || 0}
                      onChange={e => setEditingPlan({
                        ...editingPlan,
                        priceConfig: { ...editingPlan.priceConfig, monthly: parseFloat(e.target.value) || 0 }
                      })}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Annual Price</label>
                    <input 
                      type="number"
                      className="w-full border border-gray-300 rounded px-3 py-2"
                      value={editingPlan.priceConfig.annual || 0}
                      onChange={e => setEditingPlan({
                        ...editingPlan,
                        priceConfig: { ...editingPlan.priceConfig, annual: parseFloat(e.target.value) || 0 }
                      })}
                    />
                  </div>
                </div>
              )}

              {editingPlan.priceConfig.type === 'base' && (
                <>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Base Fee (per company)</label>
                      <input
                        type="number"
                        className="w-full border border-gray-300 rounded px-3 py-2"
                        value={editingPlan.priceConfig.baseFee || 0}
                        onChange={e => setEditingPlan({
                          ...editingPlan,
                          priceConfig: { ...editingPlan.priceConfig, baseFee: parseFloat(e.target.value) || 0 }
                        })}
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Per Employee Fee</label>
                      <input
                        type="number"
                        className="w-full border border-gray-300 rounded px-3 py-2"
                        value={editingPlan.priceConfig.perUserFee || 0}
                        onChange={e => setEditingPlan({
                          ...editingPlan,
                          priceConfig: { ...editingPlan.priceConfig, perUserFee: parseFloat(e.target.value) || 0 }
                        })}
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Reseller Commission (%)</label>
                    <input
                      type="number"
                      className="w-full border border-gray-300 rounded px-3 py-2"
                      value={editingPlan.priceConfig.resellerCommission || 0}
                      onChange={e => setEditingPlan({
                        ...editingPlan,
                        priceConfig: { ...editingPlan.priceConfig, resellerCommission: parseFloat(e.target.value) || 0 }
                      })}
                    />
                  </div>
                </>
              )}
              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Description</label>
                <textarea 
                  rows={2}
                  className="w-full border border-gray-300 rounded px-3 py-2"
                  value={editingPlan.description}
                  onChange={e => setEditingPlan({...editingPlan, description: e.target.value})}
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Features</label>
                <div className="space-y-2 mb-2">
                  {editingPlan.features.map((feature, idx) => (
                    <div key={idx} className="flex items-center space-x-2">
                      <div className="flex-1 bg-gray-50 px-3 py-2 rounded text-sm">{feature}</div>
                      <button onClick={() => removeFeature(idx)} className="text-red-400 hover:text-red-600">
                        <Icons.Close className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
                <div className="flex space-x-2">
                  <input 
                    type="text" 
                    placeholder="Add feature..." 
                    className="flex-1 border border-gray-300 rounded px-3 py-2 text-sm"
                    value={newFeatureText}
                    onChange={e => setNewFeatureText(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addFeature())}
                  />
                  <button onClick={addFeature} className="bg-gray-100 hover:bg-gray-200 px-3 py-2 rounded text-gray-600">
                    <Icons.Plus className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
            <div className="p-6 border-t border-gray-100 flex justify-end space-x-3 bg-gray-50">
              <button onClick={() => setEditingPlan(null)} className="px-4 py-2 text-gray-500 hover:text-gray-700">Cancel</button>
              <button onClick={handleSavePlan} className="bg-jam-black text-white px-6 py-2 rounded font-bold hover:bg-gray-800">Save Changes</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};