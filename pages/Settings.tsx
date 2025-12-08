declare const process: any;

import React, { useState, useEffect, useRef } from 'react';
import { Icons } from '../components/Icons';
import { GLMapping, IntegrationConfig, CompanySettings, TaxConfig, User, Role, Department, Designation, PricingPlan, PaymentRecord } from '../types';
import { storage } from '../services/storage';
import { auditService } from '../services/auditService';
import { checkDbConnection } from '../services/supabaseClient';
import { dimePayService } from '../services/dimePayService';
import { toast } from 'sonner';
import { useAuth } from '../context/AuthContext';
import { downloadFile } from '../utils/exportHelpers';

interface SettingsProps {
  companyData?: CompanySettings;
  onUpdateCompany: (data: CompanySettings) => void;
  taxConfig: TaxConfig;
  onUpdateTaxConfig: (data: TaxConfig) => void;
  integrationConfig: IntegrationConfig;
  onUpdateIntegration: (data: IntegrationConfig) => void;
  departments?: Department[];
  onUpdateDepartments?: (depts: Department[]) => void;
  designations?: Designation[];
  onUpdateDesignations?: (desigs: Designation[]) => void;
  plans?: PricingPlan[];
}

interface CheckoutModalProps {
    plan: PricingPlan;
    currentUser: User | null;
    onClose: () => void;
    onSuccess: () => void;
}

const CheckoutModal: React.FC<CheckoutModalProps> = ({ plan, currentUser, onClose, onSuccess }) => {
    // Restored state for UI feedback
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [paymentSuccess, setPaymentSuccess] = useState(false);
    const isMountedRef = useRef(true);
    
    const price = plan.priceConfig.type === 'free' ? 0 : plan.priceConfig.monthly;
    const isPaid = price > 0;

    useEffect(() => {
        isMountedRef.current = true;
        
        if (!isPaid) { 
            setLoading(false); 
            return; 
        }

        const timer = setTimeout(() => {
            if (!isMountedRef.current) return;
            
            dimePayService.renderPaymentWidget({
                mountId: 'dimepay-upgrade-widget',
                email: currentUser?.email || 'billing@company.com',
                amount: price,
                currency: 'JMD',
                description: `Upgrade to ${plan.name} Plan`,
                frequency: 'monthly',
                metadata: { planId: plan.id, planName: plan.name },
                onSuccess: () => {
                    if (isMountedRef.current) {
                        setPaymentSuccess(true);
                        setTimeout(() => { if (isMountedRef.current) onSuccess(); }, 2000);
                    }
                },
                onError: (msg) => {
                    console.error("Payment Widget Error:", msg);
                    if(isMountedRef.current) { 
                        setError(typeof msg === 'string' ? msg : "Payment initialization failed. Please check configuration."); 
                        setLoading(false); 
                    }
                }
            });
            
            // Give widget a moment to mount then hide loader
            setTimeout(() => {
                if (isMountedRef.current && !error) setLoading(false);
            }, 1500);

        }, 500);
        
        return () => { isMountedRef.current = false; clearTimeout(timer); };
    }, [plan, isPaid, currentUser, price, onSuccess, error]);

    const handleFreeDowngrade = () => { setPaymentSuccess(true); setTimeout(onSuccess, 1500); };

    if (paymentSuccess) return <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"><div className="bg-white rounded-xl p-8 text-center animate-fade-in"><h3 className="text-2xl font-bold mb-2 text-green-600">Success!</h3><p className="text-gray-600">Plan updated to {plan.name}.</p></div></div>;

    return (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh] animate-scale-in">
                <div className="bg-jam-black text-white p-6 flex justify-between items-center shrink-0">
                    <div><h3 className="text-xl font-bold">{isPaid ? 'Secure Checkout' : 'Confirm Plan Change'}</h3><p className="text-xs text-gray-400">Switching to {plan.name}</p></div>
                    <button onClick={onClose}><Icons.Close className="w-6 h-6 text-gray-400 hover:text-white" /></button>
                </div>
                <div className="p-6 overflow-y-auto relative min-h-[300px]">
                    {isPaid ? (
                        <>
                            {loading && (
                                <div className="absolute inset-0 flex flex-col items-center justify-center bg-white z-10">
                                    <Icons.Refresh className="w-8 h-8 animate-spin text-jam-orange mb-2" />
                                    <p className="text-sm text-gray-500">Loading Payment Gateway...</p>
                                </div>
                            )}
                            {error ? (
                                <div className="flex flex-col items-center justify-center h-full text-center">
                                    <Icons.Alert className="w-10 h-10 text-red-500 mb-3" />
                                    <p className="text-red-600 font-medium mb-2">Unable to load payment</p>
                                    <p className="text-xs text-gray-500 max-w-xs mx-auto">{error}</p>
                                </div>
                            ) : (
                                <div id="dimepay-upgrade-widget" className="w-full min-h-[350px]"></div>
                            )}
                        </>
                    ) : (
                        <div className="text-center py-8">
                            <p className="mb-6 text-gray-600">You are switching to the Free plan. Features will be limited immediately.</p>
                            <button onClick={handleFreeDowngrade} className="w-full py-3 bg-jam-black text-white font-bold rounded-lg hover:bg-gray-800 transition-colors">Confirm Switch</button>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export const Settings: React.FC<SettingsProps> = ({ 
  companyData, 
  onUpdateCompany,
  taxConfig,
  onUpdateTaxConfig,
  integrationConfig, 
  onUpdateIntegration, 
  departments = [],
  onUpdateDepartments = (_depts) => {},
  designations = [],
  onUpdateDesignations = (_desigs) => {},
  plans = []
}) => {
  const { user: currentUser } = useAuth();
  const [activeTab, setActiveTab] = useState<'company' | 'billing' | 'organization' | 'taxes' | 'integrations' | 'users'>('organization');
  
  // User Management State
  const [users, setUsers] = useState<User[]>([]);
  const [isInviteModalOpen, setIsInviteModalOpen] = useState(false);
  const [inviteForm, setInviteForm] = useState({ name: '', email: '', role: Role.MANAGER });

  // Organization Management State
  const [newDept, setNewDept] = useState('');
  const [newDesig, setNewDesig] = useState('');
  const [newDesigDept, setNewDesigDept] = useState('');

  // DB State
  const [dbStatus, setDbStatus] = useState<{ connected: boolean; message: string; details?: string } | null>(null);
  const [isCheckingDb, setIsCheckingDb] = useState(false);
  
  const [upgradeTarget, setUpgradeTarget] = useState<PricingPlan | null>(null);
  const [invoices, setInvoices] = useState<PaymentRecord[]>([]);

  // Early return if companyData is not available
  if (!companyData) {
    return <div className="p-8 text-center">Loading company settings...</div>;
  }

  useEffect(() => {
      const storedUsers = storage.getCompanyUsers();
      if (storedUsers && storedUsers.length > 0) {
          setUsers(storedUsers);
      }
  }, []);

  useEffect(() => {
      if (activeTab === 'integrations') {
          handleCheckDb();
      }
  }, [activeTab]);

  useEffect(() => {
      const mockPayments: PaymentRecord[] = [
          { id: 'inv-101', date: '2025-01-01', amount: 2000, plan: 'Starter', method: 'Card', status: 'COMPLETED', referenceId: 'TXN-001' }
      ];
      if (companyData?.plan !== 'Free') setInvoices(mockPayments);
  }, [companyData?.plan]);

  const handleCheckDb = async () => {
      setIsCheckingDb(true);
      const status = await checkDbConnection();
      setDbStatus(status);
      setIsCheckingDb(false);
  };

  const handleRestore = () => {
    if (confirm("Are you sure you want to restore default 2025 tax rates?")) {
        onUpdateTaxConfig({
            nisRate: 0.03, nisCap: 5000000, nhtRate: 0.02, edTaxRate: 0.0225, payeThreshold: 1500009, payeRateStd: 0.25, payeRateHigh: 0.30
        });
        auditService.log(currentUser, 'UPDATE', 'Settings', 'Restored default 2025 statutory tax rates');
        toast.success("Default tax rates restored");
    }
  };
  
  const handleResetDemo = () => {
    if (confirm("Are you sure you want to reset all demo data?")) {
        auditService.log(currentUser, 'DELETE', 'System', 'Performed factory reset');
        storage.clearAll();
        window.location.reload();
    }
  };

  const handleCompanyUpdate = (newData: CompanySettings) => { onUpdateCompany(newData); };

  const handleTaxChange = (field: keyof TaxConfig, value: string) => {
      const num = parseFloat(value);
      if (!isNaN(num)) {
          onUpdateTaxConfig({ ...taxConfig, [field]: num });
      }
  };

  const handleUpgradeClick = (planName: string) => {
      const targetPlan = plans.find(p => p.name === planName);
      if (targetPlan) setUpgradeTarget(targetPlan);
  };
  
  const handleUpgradeSuccess = () => {
      if (upgradeTarget) {
          handleCompanyUpdate({ ...companyData, plan: upgradeTarget.name as any, subscriptionStatus: 'ACTIVE' });
          auditService.log(currentUser, 'UPDATE', 'Billing', `Upgraded plan to ${upgradeTarget.name}`);
          toast.success(`Successfully switched to ${upgradeTarget.name}!`);
          setUpgradeTarget(null);
      }
  };

  const handleDownloadInvoice = (inv: PaymentRecord) => {
      const content = `TAX INVOICE\n\nInvoice ID: ${inv.id}\nDate: ${inv.date}\nBilled To: ${companyData?.name || 'N/A'}\nAmount: JMD $${inv.amount}`;
      downloadFile(`Invoice_${inv.id}.txt`, content, 'text/plain');
  };

  const handleInviteSubmit = (e: React.FormEvent) => {
      e.preventDefault();
      const newUser: User = { id: `u-${Date.now()}`, name: inviteForm.name, email: inviteForm.email, role: inviteForm.role, isOnboarded: false };
      const updatedUsers = [...users, newUser];
      setUsers(updatedUsers);
      storage.saveCompanyUsers(updatedUsers);
      auditService.log(currentUser, 'CREATE', 'User', `Invited user ${newUser.email}`);
      setIsInviteModalOpen(false);
      setInviteForm({ name: '', email: '', role: Role.MANAGER });
      toast.success("User invited");
  };

  const handleDeleteUser = (id: string) => {
      if (confirm('Revoke access for this user?')) {
          const updatedUsers = users.filter(u => u.id !== id);
          setUsers(updatedUsers);
          storage.saveCompanyUsers(updatedUsers);
          toast.success("User removed");
      }
  };

  const handleAddDepartment = (e: React.FormEvent) => {
      e.preventDefault();
      if (!newDept.trim()) return;
      const newDep: Department = { id: `dept-${Date.now()}`, name: newDept.trim() };
      onUpdateDepartments([...departments, newDep]);
      auditService.log(currentUser, 'CREATE', 'Organization', `Added department: ${newDept}`);
      setNewDept('');
      toast.success("Department added");
  };

  const handleDeleteDepartment = (id: string) => {
      const linkedDesignations = designations.filter(d => d.departmentId === id);
      if (linkedDesignations.length > 0) {
          toast.error(`Cannot delete this department because it has ${linkedDesignations.length} designation(s) assigned.`);
          return;
      }
      if (confirm('Delete this department?')) {
          onUpdateDepartments(departments.filter(d => d.id !== id));
          auditService.log(currentUser, 'DELETE', 'Organization', `Deleted department ID: ${id}`);
          toast.success("Department deleted");
      }
  };

  const handleAddDesignation = (e: React.FormEvent) => {
      e.preventDefault();
      if (!newDesig.trim() || !newDesigDept) { toast.error("Please enter a title and select a department."); return; }
      const newD: Designation = { id: `desig-${Date.now()}`, title: newDesig.trim(), departmentId: newDesigDept };
      onUpdateDesignations([...designations, newD]);
      auditService.log(currentUser, 'CREATE', 'Organization', `Added designation: ${newDesig}`);
      setNewDesig('');
      toast.success("Designation added");
  };

  const handleDeleteDesignation = (id: string) => {
      if (confirm('Remove this designation?')) {
          onUpdateDesignations(designations.filter(d => d.id !== id));
          auditService.log(currentUser, 'DELETE', 'Organization', `Deleted designation ID: ${id}`);
          toast.success("Designation removed");
      }
  };

  const updateMapping = (id: string, field: keyof GLMapping, value: string) => {
      const newMappings = integrationConfig.mappings.map(m => 
          m.id === id ? { ...m, [field]: value } : m
      );
      
      onUpdateIntegration({
          ...integrationConfig,
          mappings: newMappings
      });
  };

  return (
    <div className="space-y-6">
      {upgradeTarget && <CheckoutModal plan={upgradeTarget} currentUser={currentUser} onClose={() => setUpgradeTarget(null)} onSuccess={handleUpgradeSuccess} />}
      
      {isInviteModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
              <div className="bg-white rounded-xl w-full max-w-md p-6 animate-fade-in">
                  <h3 className="text-xl font-bold mb-4">Invite User</h3>
                  <form onSubmit={handleInviteSubmit} className="space-y-4">
                      <input required placeholder="Full Name" className="w-full border p-2 rounded" value={inviteForm.name} onChange={e => setInviteForm({...inviteForm, name: e.target.value})} />
                      <input required type="email" placeholder="Email" className="w-full border p-2 rounded" value={inviteForm.email} onChange={e => setInviteForm({...inviteForm, email: e.target.value})} />
                      <select className="w-full border p-2 rounded" value={inviteForm.role} onChange={e => setInviteForm({...inviteForm, role: e.target.value as Role})}>
                          <option value={Role.ADMIN}>Admin</option>
                          <option value={Role.MANAGER}>Manager</option>
                          <option value={Role.EMPLOYEE}>Employee</option>
                      </select>
                      <div className="flex justify-end space-x-2">
                          <button type="button" onClick={() => setIsInviteModalOpen(false)} className="px-4 py-2 text-gray-500">Cancel</button>
                          <button type="submit" className="px-4 py-2 bg-jam-black text-white rounded font-bold">Invite</button>
                      </div>
                  </form>
              </div>
          </div>
      )}

      <div className="flex justify-between items-center">
        <h2 className="text-3xl font-bold text-gray-900">Settings</h2>
        <button onClick={handleResetDemo} className="text-xs text-red-500 hover:text-red-700 underline">Reset Demo Data</button>
      </div>

      <div className="border-b border-gray-200">
        <nav className="-mb-px flex space-x-8 overflow-x-auto no-scrollbar">
          {['company', 'billing', 'organization', 'taxes', 'integrations', 'users'].map((tab) => (
            <button key={tab} onClick={() => setActiveTab(tab as any)} className={`whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm capitalize ${activeTab === tab ? 'border-jam-orange text-jam-black' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
              {tab === 'taxes' ? 'Statutory Rates' : tab}
            </button>
          ))}
        </nav>
      </div>
      
      {activeTab === 'billing' && (
          <div className="space-y-6 animate-fade-in">
              <div className="bg-jam-black rounded-xl p-8 text-white shadow-lg flex flex-col md:flex-row justify-between items-center">
                  <div>
                      <p className="text-sm text-gray-400 uppercase font-bold">Current Plan</p>
                      <h3 className="text-3xl font-bold mt-2">{companyData?.plan || 'Free'}</h3>
                      <div className="mt-3 flex items-center space-x-4 text-sm text-gray-300">
                          <span>Status: <span className="text-green-400 font-bold">{companyData?.subscriptionStatus || 'ACTIVE'}</span></span>
                          {companyData?.plan !== 'Free' && <span>• Billing: Monthly</span>}
                          {companyData?.plan !== 'Free' && <span>• Next Invoice: Feb 25, 2025</span>}
                      </div>
                  </div>
                  {companyData?.plan === 'Free' && <button onClick={() => handleUpgradeClick('Starter')} className="mt-4 md:mt-0 bg-jam-orange text-jam-black px-6 py-2.5 rounded-lg font-bold text-sm hover:bg-yellow-500 transition-colors">Upgrade to Starter</button>}
              </div>
              <div className="bg-white p-6 rounded-xl border border-gray-200">
                   <h3 className="text-lg font-bold mb-4">Payment History</h3>
                   {invoices.length === 0 ? <p className="text-gray-500 text-sm">No history available.</p> : (
                       <div className="space-y-2">
                           {invoices.map(inv => (
                               <div key={inv.id} className="flex justify-between text-sm border-b pb-2 last:border-0 items-center">
                                   <div>
                                        <p className="font-medium text-gray-900">{inv.date}</p>
                                        <p className="text-xs text-gray-500">{inv.plan} • {inv.method}</p>
                                   </div>
                                   <div className="text-right flex items-center space-x-4">
                                       <span className="font-bold">${inv.amount.toLocaleString()}</span>
                                       <button onClick={() => handleDownloadInvoice(inv)} className="text-jam-orange hover:underline text-xs">Invoice</button>
                                   </div>
                               </div>
                           ))}
                       </div>
                   )}
              </div>
          </div>
      )}

      {activeTab === 'taxes' && (
        <div className="space-y-6 animate-fade-in">
             <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
                <div className="flex justify-between items-center mb-6">
                    <div>
                        <h3 className="text-lg font-bold">Statutory Rates (2025)</h3>
                        <p className="text-xs text-gray-500">Edit rates below to override defaults.</p>
                    </div>
                    <button onClick={handleRestore} className="text-sm text-jam-orange hover:underline flex items-center">
                        <Icons.Refresh className="w-3 h-3 mr-1" /> Restore Defaults
                    </button>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                        <label className="text-xs font-bold text-gray-500 uppercase mb-1 block">NIS Rate (e.g. 0.03)</label>
                        <input type="number" step="0.001" value={taxConfig.nisRate} onChange={(e) => handleTaxChange('nisRate', e.target.value)} className="w-full border p-2 rounded focus:ring-2 focus:ring-jam-orange" />
                    </div>
                    <div>
                        <label className="text-xs font-bold text-gray-500 uppercase mb-1 block">NHT Rate (e.g. 0.02)</label>
                        <input type="number" step="0.001" value={taxConfig.nhtRate} onChange={(e) => handleTaxChange('nhtRate', e.target.value)} className="w-full border p-2 rounded focus:ring-2 focus:ring-jam-orange" />
                    </div>
                    <div>
                        <label className="text-xs font-bold text-gray-500 uppercase mb-1 block">Ed Tax Rate (e.g. 0.0225)</label>
                        <input type="number" step="0.0001" value={taxConfig.edTaxRate} onChange={(e) => handleTaxChange('edTaxRate', e.target.value)} className="w-full border p-2 rounded focus:ring-2 focus:ring-jam-orange" />
                    </div>
                    <div>
                        <label className="text-xs font-bold text-gray-500 uppercase mb-1 block">NIS Annual Cap</label>
                        <input type="number" value={taxConfig.nisCap} onChange={(e) => handleTaxChange('nisCap', e.target.value)} className="w-full border p-2 rounded focus:ring-2 focus:ring-jam-orange" />
                    </div>
                    <div>
                        <label className="text-xs font-bold text-gray-500 uppercase mb-1 block">PAYE Threshold</label>
                        <input type="number" value={taxConfig.payeThreshold} onChange={(e) => handleTaxChange('payeThreshold', e.target.value)} className="w-full border p-2 rounded focus:ring-2 focus:ring-jam-orange" />
                    </div>
                    <div>
                         <label className="text-xs font-bold text-gray-500 uppercase mb-1 block">Standard PAYE Rate</label>
                        <input type="number" step="0.01" value={taxConfig.payeRateStd} onChange={(e) => handleTaxChange('payeRateStd', e.target.value)} className="w-full border p-2 rounded focus:ring-2 focus:ring-jam-orange" />
                    </div>
                </div>
             </div>
        </div>
      )}

      {activeTab === 'company' && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8 animate-fade-in">
               <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                   <div className="space-y-4">
                      <h4 className="font-semibold border-b pb-2">Legal Details</h4>
                      <div className="space-y-2">
                          <label className="block text-xs font-bold text-gray-500 uppercase">Company Name</label>
                          <input type="text" value={companyData.name} onChange={e => handleCompanyUpdate({...companyData, name: e.target.value})} className="w-full border rounded p-2" />
                      </div>
                      <div className="space-y-2">
                          <label className="block text-xs font-bold text-gray-500 uppercase">TRN</label>
                          <input type="text" value={companyData.trn} onChange={e => handleCompanyUpdate({...companyData, trn: e.target.value})} className="w-full border rounded p-2" />
                      </div>
                      <div className="space-y-2">
                          <label className="block text-xs font-bold text-gray-500 uppercase">Address</label>
                          <textarea value={companyData.address} onChange={e => handleCompanyUpdate({...companyData, address: e.target.value})} className="w-full border rounded p-2" />
                      </div>
                       <div className="space-y-2">
                          <label className="block text-xs font-bold text-gray-500 uppercase">Phone</label>
                          <input type="text" value={companyData.phone} onChange={e => handleCompanyUpdate({...companyData, phone: e.target.value})} className="w-full border rounded p-2" />
                      </div>
                   </div>
                   <div className="space-y-4">
                      <h4 className="font-semibold border-b pb-2">Payroll Configuration</h4>
                      <div className="space-y-2">
                          <label className="block text-xs font-bold text-gray-500 uppercase">Default Pay Frequency</label>
                          <select value={companyData.payFrequency} onChange={e => handleCompanyUpdate({...companyData, payFrequency: e.target.value})} className="w-full border rounded p-2">
                              <option value="Monthly">Monthly</option>
                              <option value="Fortnightly">Fortnightly</option>
                              <option value="Weekly">Weekly</option>
                          </select>
                      </div>
                      <div className="space-y-2">
                          <label className="block text-xs font-bold text-gray-500 uppercase">Company Bank</label>
                          <select value={companyData.bankName} onChange={e => handleCompanyUpdate({...companyData, bankName: e.target.value})} className="w-full border rounded p-2"><option value="NCB">NCB</option><option value="BNS">BNS</option></select>
                      </div>
                      <div className="space-y-2">
                          <label className="block text-xs font-bold text-gray-500 uppercase">Account Number</label>
                          <input type="text" value={companyData.accountNumber} onChange={e => handleCompanyUpdate({...companyData, accountNumber: e.target.value})} className="w-full border rounded p-2" />
                      </div>
                      <div className="space-y-2">
                          <label className="block text-xs font-bold text-gray-500 uppercase">Branch Code</label>
                          <input type="text" value={companyData.branchCode} onChange={e => handleCompanyUpdate({...companyData, branchCode: e.target.value})} className="w-full border rounded p-2" />
                      </div>
                   </div>
               </div>
          </div>
      )}

      {activeTab === 'organization' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 animate-fade-in">
              <div className="bg-white p-6 rounded-xl border border-gray-200">
                  <h3 className="font-bold mb-4">Departments</h3>
                  <div className="flex space-x-2 mb-4">
                      <input placeholder="New Department" className="border p-2 rounded flex-1" value={newDept} onChange={e => setNewDept(e.target.value)} />
                      <button onClick={handleAddDepartment} className="bg-jam-black text-white px-3 rounded"><Icons.Plus className="w-4 h-4"/></button>
                  </div>
                  <ul className="space-y-2">
                      {departments.map(d => (
                          <li key={d.id} className="flex justify-between items-center bg-gray-50 p-2 rounded">
                              <span>{d.name}</span>
                              <button onClick={() => handleDeleteDepartment(d.id)} className="text-red-400"><Icons.Trash className="w-4 h-4"/></button>
                          </li>
                      ))}
                  </ul>
              </div>
               <div className="bg-white p-6 rounded-xl border border-gray-200">
                  <h3 className="font-bold mb-4">Designations</h3>
                  <div className="space-y-2 mb-4">
                      <input placeholder="Job Title" className="border p-2 rounded w-full" value={newDesig} onChange={e => setNewDesig(e.target.value)} />
                      <select className="border p-2 rounded w-full" value={newDesigDept} onChange={e => setNewDesigDept(e.target.value)}>
                          <option value="">Select Department</option>
                          {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                      </select>
                      <button onClick={handleAddDesignation} className="bg-jam-black text-white w-full py-2 rounded text-sm">Add Designation</button>
                  </div>
                  <ul className="space-y-2 max-h-60 overflow-y-auto">
                      {designations.map(d => (
                          <li key={d.id} className="flex justify-between items-center bg-gray-50 p-2 rounded">
                              <div>
                                  <div className="text-sm font-medium">{d.title}</div>
                                  <div className="text-xs text-gray-500">{departments.find(dep => dep.id === d.departmentId)?.name}</div>
                              </div>
                              <button onClick={() => handleDeleteDesignation(d.id)} className="text-red-400"><Icons.Trash className="w-4 h-4"/></button>
                          </li>
                      ))}
                  </ul>
              </div>
          </div>
      )}

      {activeTab === 'integrations' && (
          <div className="space-y-6 animate-fade-in">
             <div className="bg-white p-6 rounded-xl border border-gray-200">
                <div className="flex justify-between items-center mb-4">
                    <h3 className="font-bold">Database Connection</h3>
                    <button onClick={handleCheckDb} className="text-xs bg-gray-100 px-2 py-1 rounded hover:bg-gray-200 flex items-center">
                        {isCheckingDb ? <Icons.Refresh className="w-3 h-3 animate-spin mr-1"/> : <Icons.Refresh className="w-3 h-3 mr-1"/>} Check Status
                    </button>
                </div>
                <div className={`p-4 rounded border ${dbStatus?.connected ? 'bg-green-50 border-green-200 text-green-800' : 'bg-red-50 border-red-200 text-red-800'}`}>
                    <div className="flex items-center font-bold mb-1">
                        {dbStatus?.connected ? <Icons.CheckCircle className="w-4 h-4 mr-2"/> : <Icons.Alert className="w-4 h-4 mr-2"/>}
                        {dbStatus?.message || 'Not Connected'}
                    </div>
                    <p className="text-xs ml-6">{dbStatus?.details || 'Click check status to verify connection.'}</p>
                </div>
            </div>

            {/* Restored Accounting Mapping UI */}
            <div className="bg-white p-6 rounded-xl border border-gray-200">
                <div className="flex justify-between items-center mb-6">
                    <div>
                        <h3 className="font-bold">Accounting Integration</h3>
                        <p className="text-sm text-gray-500">Map payroll items to your General Ledger (QuickBooks/Xero).</p>
                    </div>
                    <select 
                        value={integrationConfig.provider}
                        onChange={(e) => onUpdateIntegration({...integrationConfig, provider: e.target.value as any})}
                        className="border p-2 rounded"
                    >
                        <option value="QuickBooks">QuickBooks</option>
                        <option value="Xero">Xero</option>
                        <option value="CSV">CSV Export</option>
                    </select>
                </div>
                
                <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left">
                        <thead>
                            <tr className="border-b bg-gray-50">
                                <th className="p-3">Payroll Item</th>
                                <th className="p-3">GL Account Code</th>
                                <th className="p-3">Account Name</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y">
                            {/* Default mapping items if empty */}
                            {(integrationConfig.mappings.length > 0 ? integrationConfig.mappings : [
                                { id: 'm1', payrollItem: 'Gross Salary', glCode: '6000', accountName: 'Wages & Salaries' },
                                { id: 'm2', payrollItem: 'Employer NIS', glCode: '6100', accountName: 'Payroll Tax Expense' },
                                { id: 'm3', payrollItem: 'PAYE Payable', glCode: '2100', accountName: 'PAYE Liability' },
                                { id: 'm4', payrollItem: 'Net Salary Payable', glCode: '2200', accountName: 'Wages Payable' }
                            ]).map(m => (
                                <tr key={m.id}>
                                    <td className="p-3 font-medium">{m.payrollItem}</td>
                                    <td className="p-3">
                                        <input 
                                            className="border rounded p-1 w-24" 
                                            value={m.glCode}
                                            onChange={(e) => updateMapping(m.id, 'glCode', e.target.value)}
                                        />
                                    </td>
                                    <td className="p-3">
                                        <input 
                                            className="border rounded p-1 w-full" 
                                            value={m.accountName}
                                            onChange={(e) => updateMapping(m.id, 'accountName', e.target.value)}
                                        />
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
          </div>
      )}

      {activeTab === 'users' && (
          <div className="bg-white p-6 rounded-xl border border-gray-200 animate-fade-in">
               <div className="flex justify-between items-center mb-4">
                   <h3 className="font-bold">User Management</h3>
                   <button onClick={() => setIsInviteModalOpen(true)} className="bg-jam-black text-white px-3 py-1.5 rounded text-sm font-medium hover:bg-gray-800">Invite User</button>
               </div>
               <table className="w-full text-left">
                   <thead><tr className="border-b"><th className="pb-2 text-xs text-gray-500">Name</th><th className="pb-2 text-xs text-gray-500">Email</th><th className="pb-2 text-xs text-gray-500">Role</th><th className="pb-2 text-xs text-gray-500 text-right">Action</th></tr></thead>
                   <tbody>
                       {users.map(u => (
                           <tr key={u.id} className="border-b border-gray-50 last:border-0">
                               <td className="py-3 text-sm">{u.name}</td>
                               <td className="py-3 text-sm text-gray-500">{u.email}</td>
                               <td className="py-3"><span className="text-xs bg-gray-100 px-2 py-1 rounded">{u.role}</span></td>
                               <td className="py-3 text-right"><button onClick={() => handleDeleteUser(u.id)} className="text-red-500 hover:text-red-700"><Icons.Trash className="w-4 h-4"/></button></td>
                           </tr>
                       ))}
                   </tbody>
               </table>
          </div>
      )}
    </div>
  );
};