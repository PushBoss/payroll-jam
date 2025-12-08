declare const process: any;

import React, { useState, useEffect } from 'react';
import { Icons } from '../components/Icons';
import { PricingPlan, ResellerClient, GlobalConfig, User, Role, AuditLogEntry } from '../types';
import { XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, AreaChart, Area } from 'recharts';
import { storage } from '../services/storage';
import { auditService } from '../services/auditService';
import { supabaseService } from '../services/supabaseService';
import { checkDbConnection, testManualConnection, saveManualConfig, isUsingLocalOverrides } from '../services/supabaseClient';
import { toast } from 'sonner';

interface SuperAdminProps {
  plans: PricingPlan[];
  onUpdatePlans: (updatedPlans: PricingPlan[]) => void;
  onImpersonate: (tenant: ResellerClient) => void;
  initialTab?: string;
}

// Mock Data
const MOCK_TENANTS: ResellerClient[] = [
    { id: 'c1', companyName: 'JamCorp Ltd.', contactName: 'John Doe', email: 'admin@jam.com', employeeCount: 12, plan: 'Starter', status: 'ACTIVE', mrr: 2000 },
    { id: 'c2', companyName: 'Kingston Logistics', contactName: 'James Brown', email: 'james@klog.jm', employeeCount: 45, plan: 'Pro', status: 'ACTIVE', mrr: 22500 },
    { id: 'c3', companyName: 'Montego Bay Resorts', contactName: 'Sarah Lee', email: 'sarah@mobay.jm', employeeCount: 120, plan: 'Enterprise', status: 'ACTIVE', mrr: 60000 },
    { id: 'c4', companyName: 'Small Biz Hub', contactName: 'Lisa Chen', email: 'lisa@hub.jm', employeeCount: 3, plan: 'Free', status: 'ACTIVE', mrr: 0 },
    { id: 'c5', companyName: 'Ocho Rios Tours', contactName: 'Mike Davis', email: 'mike@tours.jm', employeeCount: 8, plan: 'Pro', status: 'SUSPENDED', mrr: 4000 },
    { id: 'c6', companyName: 'Tech Solutions Ja', contactName: 'Paul Wright', email: 'paul@techja.com', employeeCount: 15, plan: 'Starter', status: 'ACTIVE', mrr: 2000 },
];

const DEFAULT_PAYMENT_CONFIG: GlobalConfig = {
    dataSource: 'LOCAL',
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
        apiKey: 'ck_LGKMlNpFiRr63ce0s621VuGLjYdey', // Sandbox Client Key
        secretKey: 'sk_rYoMG45jVM2gvhE-pm4to9EZoW9tD', // Sandbox Secret Key
        domain: 'https://staging.api.dimepay.app', // Updated to match Plugin Staging URL
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
  const [activeTab, setActiveTab] = useState<'overview' | 'tenants' | 'users' | 'plans' | 'logs' | 'settings' | 'health' | 'billing'>('overview');
  
  // Payment Settings State
  const [paymentConfig, setPaymentConfig] = useState<GlobalConfig>(() => storage.getGlobalConfig() || DEFAULT_PAYMENT_CONFIG);

  // Sync with prop if provided
  useEffect(() => {
      if (initialTab) {
          setActiveTab(initialTab as any);
      }
  }, [initialTab]);

  // Tenant State
  const [tenants, setTenants] = useState<ResellerClient[]>(() => {
      // If we are in local mode, default to mock/storage. If Supabase, we'll fetch in useEffect.
      if (paymentConfig.dataSource === 'SUPABASE') return [];
      return storage.getTenants() || MOCK_TENANTS;
  });
  
  const [isLoadingTenants, setIsLoadingTenants] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState<'ALL' | 'ACTIVE' | 'SUSPENDED'>('ALL');
  
  // Super Admin User State
  const [admins, setAdmins] = useState<User[]>(() => {
      const existing = storage.getSuperAdmins();
      return existing || [{ id: 'u-super', name: 'System Operator', email: 'super@jam.com', role: Role.SUPER_ADMIN, isOnboarded: true }];
  });
  const [isAddAdminOpen, setIsAddAdminOpen] = useState(false);
  const [newAdminForm, setNewAdminForm] = useState({ name: '', email: '' });

  // Logs State
  const [logs, setLogs] = useState<AuditLogEntry[]>([]);
  
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

  useEffect(() => { storage.saveGlobalConfig(paymentConfig); }, [paymentConfig]);
  useEffect(() => { storage.saveSuperAdmins(admins); }, [admins]);
  useEffect(() => {
      if (activeTab === 'overview' || activeTab === 'logs') setLogs(auditService.getLogs());
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
          if (paymentConfig.dataSource === 'SUPABASE') {
              setIsLoadingTenants(true);
              try {
                  const dbTenants = await supabaseService.getAllCompanies();
                  setTenants(dbTenants);
              } catch (e) {
                  console.error(e);
                  toast.error("Failed to fetch tenants from Supabase");
              } finally {
                  setIsLoadingTenants(false);
              }
          }
      }
      fetchDBTenants();
  }, [paymentConfig.dataSource, activeTab]); // Re-fetch on tab change or mode switch

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

  const handleAddAdmin = (e: React.FormEvent) => {
      e.preventDefault();
      const newAdmin: User = { id: `sa-${Date.now()}`, name: newAdminForm.name, email: newAdminForm.email, role: Role.SUPER_ADMIN, isOnboarded: true };
      setAdmins([...admins, newAdmin]);
      setIsAddAdminOpen(false);
      setNewAdminForm({ name: '', email: '' });
      auditService.log({id: 'sys', name: 'Super Admin', email: 'sys', role: Role.SUPER_ADMIN}, 'CREATE', 'User', `Created new super admin: ${newAdmin.email}`);
      toast.success("New admin created");
  };

  const handleRemoveAdmin = (id: string) => {
      if (admins.length <= 1) { 
          toast.error("Cannot delete the last Super Admin."); 
          return; 
      }
      if (confirm("Revoke Super Admin access for this user?")) {
          setAdmins(prev => prev.filter(u => u.id !== id));
          toast.success("Admin removed");
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

  const handleDataSourceChange = async (source: 'LOCAL' | 'SUPABASE') => {
      if (source === 'LOCAL') {
          setPaymentConfig(prev => ({ ...prev, dataSource: source }));
          toast.success("Switched to Local Demo Mode.");
          return;
      }

      // If switching to SUPABASE, verify connection first
      const loadingToast = toast.loading("Verifying Supabase connection...");
      const status = await handleCheckDb();
      toast.dismiss(loadingToast);

      if (status.connected) {
          setPaymentConfig(prev => ({ ...prev, dataSource: source }));
          auditService.log({id: 'sys', name: 'Super Admin', email: 'sys', role: Role.SUPER_ADMIN}, 'SETTINGS', 'System', `Data Source changed to ${source}`);
          toast.success(`Successfully connected to Supabase Live.`);
      } else {
          // Open Wizard if connection failed
          setConnectWizard({ open: true, step: 1 });
      }
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
    const updated = plans.map(p => p.id === editingPlan.id ? editingPlan : p);
    onUpdatePlans(updated);
    setEditingPlan(null);
    auditService.log({id: 'sys', name: 'Super Admin', email: 'sys', role: Role.SUPER_ADMIN}, 'UPDATE', 'Plan', `Updated plan: ${editingPlan.name}`);
    toast.success("Plan updated");
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
                  <form onSubmit={handleAddAdmin} className="flex items-end space-x-4">
                      <div className="flex-1">
                          <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Name</label>
                          <input 
                              required
                              type="text" 
                              className="w-full border border-gray-300 rounded px-3 py-2"
                              value={newAdminForm.name}
                              onChange={e => setNewAdminForm({...newAdminForm, name: e.target.value})}
                          />
                      </div>
                      <div className="flex-1">
                          <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Email</label>
                          <input 
                              required
                              type="email" 
                              className="w-full border border-gray-300 rounded px-3 py-2"
                              value={newAdminForm.email}
                              onChange={e => setNewAdminForm({...newAdminForm, email: e.target.value})}
                          />
                      </div>
                      <button type="submit" className="bg-jam-orange text-jam-black px-6 py-2 rounded font-bold hover:bg-yellow-500">
                          Save
                      </button>
                      <button type="button" onClick={() => setIsAddAdminOpen(false)} className="px-4 py-2 text-gray-500 hover:text-gray-700">
                          Cancel
                      </button>
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
          <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
              <h3 className="font-bold text-gray-900 mb-6">Platform Revenue</h3>
              <div className="h-72">
                  <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={MOCK_REVENUE_DATA}>
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
              </div>
          </div>
      </div>
  );

  const renderPlans = () => (
      <div className="space-y-6 animate-fade-in">
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
                          <div className="grid grid-cols-2 gap-4">
                              <div>
                                  <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Monthly Price</label>
                                  <input 
                                      type="number" 
                                      className="w-full border border-gray-300 rounded px-3 py-2"
                                      value={editingPlan.priceConfig.monthly}
                                      onChange={e => setEditingPlan({
                                          ...editingPlan, 
                                          priceConfig: { ...editingPlan.priceConfig, monthly: parseFloat(e.target.value) }
                                      })}
                                  />
                              </div>
                              <div>
                                  <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Annual Price</label>
                                  <input 
                                      type="number" 
                                      className="w-full border border-gray-300 rounded px-3 py-2"
                                      value={editingPlan.priceConfig.annual}
                                      onChange={e => setEditingPlan({
                                          ...editingPlan, 
                                          priceConfig: { ...editingPlan.priceConfig, annual: parseFloat(e.target.value) }
                                      })}
                                  />
                              </div>
                          </div>
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
                        onClick={() => handleDataSourceChange('LOCAL')}
                        className={`flex-1 py-2 text-sm font-medium rounded-lg border transition-colors ${
                            paymentConfig.dataSource === 'LOCAL' || !paymentConfig.dataSource
                            ? 'bg-blue-600 text-white border-blue-600' 
                            : 'bg-white text-blue-600 border-blue-300 hover:bg-blue-50'
                        }`}
                      >
                          Browser (Demo)
                      </button>
                      <button 
                        onClick={() => handleDataSourceChange('SUPABASE')}
                        className={`flex-1 py-2 text-sm font-medium rounded-lg border transition-colors ${
                            paymentConfig.dataSource === 'SUPABASE'
                            ? 'bg-green-600 text-white border-green-600' 
                            : 'bg-white text-green-600 border-green-300 hover:bg-green-50'
                        }`}
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
                onClick={() => { storage.saveGlobalConfig(paymentConfig); toast.success("Settings saved successfully"); }}
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
                              checked={paymentConfig.dimepay?.enabled}
                              onChange={(e) => setPaymentConfig({...paymentConfig, dimepay: {...paymentConfig.dimepay!, enabled: e.target.checked}})}
                              className="h-5 w-5 text-jam-orange focus:ring-jam-orange"
                          />
                      </div>
                      
                      {paymentConfig.dimepay?.enabled && (
                          <div className="space-y-4 animate-fade-in">
                              <div className="grid grid-cols-2 gap-4">
                                  <div>
                                      <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Environment</label>
                                      <select 
                                          value={paymentConfig.dimepay.environment || 'sandbox'}
                                          onChange={(e) => handleDimeEnvChange(e.target.value as any)}
                                          className="w-full border border-gray-300 rounded p-2 text-sm bg-white"
                                      >
                                          <option value="sandbox">Sandbox (Test)</option>
                                          <option value="production">Production (Live)</option>
                                      </select>
                                  </div>
                                  <div>
                                      <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Pass Fees To</label>
                                      <select 
                                          value={paymentConfig.dimepay.passFeesTo || 'MERCHANT'}
                                          onChange={(e) => setPaymentConfig({
                                              ...paymentConfig, 
                                              dimepay: {...paymentConfig.dimepay, passFeesTo: e.target.value as any}
                                          })}
                                          className="w-full border border-gray-300 rounded p-2 text-sm bg-white"
                                      >
                                          <option value="MERCHANT">Merchant (You)</option>
                                          <option value="CUSTOMER">Customer (Client)</option>
                                      </select>
                                  </div>
                              </div>

                              <div>
                                  <label className="block text-xs font-bold text-gray-500 uppercase mb-1">API URL</label>
                                  <input 
                                    type="text" 
                                    readOnly
                                    value={paymentConfig.dimepay.domain}
                                    className="w-full border border-gray-200 bg-gray-100 rounded p-2 text-sm text-gray-600 font-mono cursor-not-allowed"
                                  />
                              </div>

                              <div>
                                  <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Client Key (Public)</label>
                                  <input 
                                    type="text" 
                                    placeholder="ck_test_..." 
                                    value={paymentConfig.dimepay.apiKey}
                                    onChange={(e) => setPaymentConfig({...paymentConfig, dimepay: {...paymentConfig.dimepay!, apiKey: e.target.value}})}
                                    className="w-full border border-gray-300 rounded p-2 text-sm font-mono"
                                  />
                              </div>

                              <div>
                                  <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Secret Key</label>
                                  <input 
                                    type="password" 
                                    placeholder="sk_test_..." 
                                    value={paymentConfig.dimepay.secretKey}
                                    onChange={(e) => setPaymentConfig({...paymentConfig, dimepay: {...paymentConfig.dimepay!, secretKey: e.target.value}})}
                                    className="w-full border border-gray-300 rounded p-2 text-sm font-mono"
                                  />
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
                              checked={paymentConfig.paypal.enabled}
                              onChange={(e) => setPaymentConfig({...paymentConfig, paypal: {...paymentConfig.paypal, enabled: e.target.checked}})}
                              className="h-5 w-5 text-jam-orange focus:ring-jam-orange"
                          />
                      </div>
                      {paymentConfig.paypal.enabled && (
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
                            onChange={(e) => setPaymentConfig({...paymentConfig, emailjs: {...paymentConfig.emailjs, serviceId: e.target.value}})}
                            className="w-full border border-gray-300 rounded p-2 text-sm"
                          />
                          <input 
                            type="text" 
                            placeholder="Template ID" 
                            value={paymentConfig.emailjs?.templateId || ''}
                            onChange={(e) => setPaymentConfig({...paymentConfig, emailjs: {...paymentConfig.emailjs, templateId: e.target.value}})}
                            className="w-full border border-gray-300 rounded p-2 text-sm"
                          />
                          <input 
                            type="password" 
                            placeholder="Public Key" 
                            value={paymentConfig.emailjs?.publicKey || ''}
                            onChange={(e) => setPaymentConfig({...paymentConfig, emailjs: {...paymentConfig.emailjs, publicKey: e.target.value}})}
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
            {['overview', 'tenants', 'billing', 'health', 'users', 'logs', 'plans', 'settings'].map((tab) => (
                <button
                    key={tab}
                    onClick={() => setActiveTab(tab as any)}
                    className={`whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm capitalize transition-colors ${
                        activeTab === tab
                        ? 'border-jam-orange text-jam-black'
                        : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                    }`}
                >
                    {tab}
                </button>
            ))}
        </nav>
      </div>

      {/* Content Area */}
      <div className="min-h-[600px]">
         {activeTab === 'overview' && renderOverview()}
         {activeTab === 'tenants' && renderTenants()}
         {activeTab === 'users' && renderAdmins()}
         {activeTab === 'logs' && renderLogs()}
         {activeTab === 'settings' && renderSettings()}
         {activeTab === 'health' && renderHealth()}
         {activeTab === 'billing' && renderBilling()}
         {activeTab === 'plans' && renderPlans()}
      </div>
    </div>
  );
};