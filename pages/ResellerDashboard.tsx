
import React, { useState, useEffect } from 'react';
import { Icons } from '../components/Icons';
import { ResellerClient, PricingPlan } from '../types';
import { supabaseService } from '../services/supabaseService';
import { emailService } from '../services/emailService';
import { useAuth } from '../context/AuthContext';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { toast } from 'sonner';

interface ResellerDashboardProps {
    onManageClient?: (client: ResellerClient) => void;
    plans?: PricingPlan[];
}

export const ResellerDashboard: React.FC<ResellerDashboardProps> = ({ onManageClient, plans = [] }) => {
  const { user } = useAuth();
  const [clients, setClients] = useState<ResellerClient[]>([]);
  const [pendingInvites, setPendingInvites] = useState<any[]>([]);
  const [financialData, setFinancialData] = useState<any[]>([]);
  const [billingHistory, setBillingHistory] = useState<any[]>([]);
  const [isLoadingData, setIsLoadingData] = useState(true);

  const [activeTab, setActiveTab] = useState<'dashboard' | 'partners' | 'compliance' | 'financials'>('dashboard');
  const [searchTerm, setSearchTerm] = useState('');
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [currentClient, setCurrentClient] = useState<ResellerClient | null>(null);
  
  // Form State
  const [formData, setFormData] = useState<Partial<ResellerClient>>({});

  // Load clients and financial data from Supabase
  useEffect(() => {
      async function loadData() {
          setIsLoadingData(true);
          try {
              // If user has companyId, load reseller clients from reseller_clients table
              if (user?.companyId) {
                  const resellerClients = await supabaseService.getResellerClients(user.companyId);
                  setClients(Array.isArray(resellerClients) ? resellerClients : []);
                  
                  // Load pending invites
                  const invites = await supabaseService.getResellerInvites(user.companyId);
                  setPendingInvites(Array.isArray(invites) ? invites : []);
                  
                  // Load reseller's own billing history (payments made by reseller)
                  const paymentsData = await supabaseService.getPaymentHistory(user.companyId, 100);
                  // Ensure payments is always an array
                  const payments = Array.isArray(paymentsData) ? paymentsData : [];
                  setBillingHistory(payments);
                  
                  // Calculate financial data from actual payments (last 6 months)
                  const now = new Date();
                  const last6Months: Array<{ name: string; month: number; year: number }> = [];
                  for (let i = 5; i >= 0; i--) {
                      const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
                      last6Months.push({
                          name: date.toLocaleString('default', { month: 'short' }),
                          month: date.getMonth(),
                          year: date.getFullYear()
                      });
                  }
                  
                  // Get baseFee and perUserFee for calculations
                  const resellerPlan = plans.find(p => p.priceConfig.type === 'base' || p.name === 'Reseller');
                  const baseFee = resellerPlan?.priceConfig.baseFee ?? 3000;
                  const perUserFee = resellerPlan?.priceConfig.perUserFee ?? 100;
                  
                  const calculatedFinancialData = last6Months.map(({ name, month, year }) => {
                      // Get payments for this month - ensure payments is an array
                      const monthPayments = Array.isArray(payments) ? payments.filter(p => {
                          if (!p || !p.paymentDate) return false;
                          const paymentDate = new Date(p.paymentDate);
                          return paymentDate.getMonth() === month && paymentDate.getFullYear() === year && p.status === 'completed';
                      }) : [];
                      
                      const revenue = monthPayments.reduce((sum, p) => sum + (p.amount || 0), 0);
                      // Calculate profit (revenue - platform fees for that month)
                      const activeClientsInMonth = Array.isArray(resellerClients) ? resellerClients.filter(c => c.status === 'ACTIVE').length : 0;
                      const activeEmpInMonth = Array.isArray(resellerClients) ? resellerClients
                          .filter(c => c.status === 'ACTIVE')
                          .reduce((sum, c) => sum + (c.employeeCount || 0), 0) : 0;
                      const platformFeesForMonth = (activeClientsInMonth * baseFee) + (activeEmpInMonth * perUserFee);
                      const profit = Math.max(0, revenue - platformFeesForMonth);
                      
                      return { name, revenue, profit };
                  });
                  setFinancialData(calculatedFinancialData);
              } else {
                  // Fallback to all companies if no reseller relationship
                  const data = await supabaseService.getAllCompanies();
                  setClients(Array.isArray(data) ? data : []);
                  setFinancialData([]);
                  setBillingHistory([]);
              }
          } catch (error) {
              console.error('Error loading data:', error);
              toast.error('Failed to load data');
              setClients([]);
              setFinancialData([]);
              setBillingHistory([]);
          } finally {
              setIsLoadingData(false);
          }
      }
      loadData();
  }, [user?.companyId, plans]);

  // Stats Calculation
  const totalRev = clients.reduce((acc, curr) => curr.status === 'ACTIVE' ? acc + curr.mrr : acc, 0);
  const totalEmployees = clients.reduce((acc, curr) => acc + curr.employeeCount, 0);
  
  // Wholesale Fee Calculation (Dynamic from Reseller Plan if available)
  const resellerPlan = plans.find(p => p.priceConfig.type === 'base' || p.name === 'Reseller');
  const baseFee = resellerPlan?.priceConfig.baseFee ?? 3000;
  const perUserFee = resellerPlan?.priceConfig.perUserFee ?? 100;

  const activeClientsList = clients.filter(c => c.status === 'ACTIVE');
  const activeEmpCount = activeClientsList.reduce((acc, c) => acc + c.employeeCount, 0);
  const platformFees = (activeClientsList.length * baseFee) + (activeEmpCount * perUserFee);
  const netProfit = totalRev - platformFees;

  // Get compliance status from backend (placeholder - compliance tracking not yet implemented)
  const getComplianceStatus = () => {
      // TODO: Fetch real compliance data from database once compliance tracking is implemented
      // For now, return placeholder data
      const nextMonth = new Date();
      nextMonth.setMonth(nextMonth.getMonth() + 1);
      return {
          so1: 'PENDING',
          s02: 'PENDING',
          nextDue: nextMonth.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
      };
  };

  // Actions
  const handleAddNew = () => {
      setFormData({
          companyName: '',
          contactName: '',
          email: '',
          plan: 'Starter',
          status: 'ACTIVE',
          employeeCount: 5,
          mrr: 0
      });
      setIsAddModalOpen(true);
  };

  const handleEdit = (client: ResellerClient) => {
      setCurrentClient(client);
      setFormData({ ...client });
      setIsEditModalOpen(true);
  };

  const handleDelete = (id: string) => {
      if (confirm('Are you sure you want to remove this client? This action cannot be undone.')) {
          setClients(clients.filter(c => c.id !== id));
      }
  };

  const handleManage = (client: ResellerClient) => {
      if (onManageClient) {
          onManageClient(client);
      }
  };

  const calculateMRR = (plan: string, empCount: number) => {
      switch(plan) {
          case 'Free': return 0;
          case 'Starter': return 2000;
          case 'Pro': return empCount * 500;
          case 'Enterprise': return 60000; // Base estimate
          default: return 0;
      }
  };

  const saveNewClient = async (e: React.FormEvent) => {
      e.preventDefault();
      if (!user?.companyId) {
          toast.error('Reseller company ID not found');
          return;
      }

      // Generate invite token
      const inviteToken = `reseller-invite-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      const inviteLink = `${window.location.origin}/?token=${inviteToken}&email=${encodeURIComponent(formData.email || '')}&reseller=true`;
      
      // Save the invite to database
      const inviteSaved = await supabaseService.saveResellerInvite(
          user.companyId,
          formData.email || '',
          inviteToken,
          formData.contactName,
          formData.companyName
      );
      
      if (!inviteSaved) {
          toast.error('Failed to create invitation');
          return;
      }
      
      // Send invite email
      const emailResult = await emailService.sendInvite(
          formData.email || '',
          formData.contactName || 'Admin',
          inviteLink
      );
      
      if (emailResult.success) {
          toast.success(`Invitation sent to ${formData.email}. They will appear in your portfolio once they accept.`);
          
          // Reload pending invites
          const invites = await supabaseService.getResellerInvites(user.companyId);
          setPendingInvites(Array.isArray(invites) ? invites : []);
      } else {
          toast.error('Failed to send invitation email');
      }
      
      setIsAddModalOpen(false);
      setFormData({});
  };

  const updateClient = (e: React.FormEvent) => {
      e.preventDefault();
      if (!currentClient) return;

      const plan = formData.plan as string;
      const count = formData.employeeCount || 0;

      const updated: ResellerClient = {
          ...currentClient,
          ...formData as ResellerClient,
          mrr: calculateMRR(plan, count)
      };

      setClients(clients.map(c => c.id === currentClient.id ? updated : c));
      setIsEditModalOpen(false);
      setCurrentClient(null);
  };

  const filteredClients = clients.filter(c => 
      c.companyName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      c.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
      c.contactName.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleCancelInvite = async (inviteId: string, email: string) => {
    if (!window.confirm(`Are you sure you want to cancel the invitation to ${email}?`)) {
      return;
    }

    try {
      const success = await supabaseService.cancelResellerInvite(inviteId);
      
      if (success) {
        toast.success('Invitation cancelled successfully');
        // Reload pending invites
        if (user?.companyId) {
          const invites = await supabaseService.getResellerInvites(user.companyId);
          setPendingInvites(Array.isArray(invites) ? invites : []);
        }
      } else {
        toast.error('Failed to cancel invitation');
      }
    } catch (error) {
      console.error('Error canceling invite:', error);
      toast.error('Failed to cancel invitation');
    }
  };

  const renderClientsTab = () => (
      <>
        {/* Pending Invites Section */}
        {pendingInvites.length > 0 && (
            <div className="mb-6 bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                <div className="flex items-center mb-3">
                    <Icons.Clock className="w-5 h-5 text-yellow-600 mr-2" />
                    <h3 className="text-sm font-semibold text-yellow-800">
                        Pending Invitations ({pendingInvites.length})
                    </h3>
                </div>
                <div className="space-y-2">
                    {pendingInvites.map((invite) => (
                        <div key={invite.id} className="flex items-center justify-between bg-white p-3 rounded border border-yellow-200">
                            <div className="flex-1">
                                <p className="text-sm font-medium text-gray-900">
                                    {invite.company_name || 'Company'}
                                </p>
                                <p className="text-xs text-gray-600">
                                    {invite.invite_email} • {invite.contact_name || 'Contact'}
                                </p>
                                <p className="text-xs text-gray-500 mt-1">
                                    Invited {new Date(invite.invited_at).toLocaleDateString()}
                                </p>
                            </div>
                            <div className="flex items-center space-x-2">
                                <span className="px-3 py-1 bg-yellow-100 text-yellow-800 rounded-full text-xs font-medium">
                                    Pending
                                </span>
                                <button
                                    onClick={() => handleCancelInvite(invite.id, invite.invite_email)}
                                    className="p-1.5 text-red-600 hover:bg-red-50 rounded transition-colors"
                                    title="Cancel invitation"
                                >
                                    <Icons.Close className="w-4 h-4" />
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        )}

        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden animate-fade-in">
        <div className="px-6 py-4 border-b border-gray-200 bg-gray-50 flex justify-between items-center">
            <h3 className="font-semibold text-gray-800">Client Portfolio</h3>
            <div className="flex space-x-2 w-1/3">
                <div className="relative w-full">
                    <Icons.Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                    <input 
                        type="text" 
                        placeholder="Search clients..." 
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="w-full pl-10 pr-4 py-1.5 border border-gray-300 rounded-md text-sm focus:ring-jam-orange focus:outline-none" 
                    />
                </div>
            </div>
        </div>
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-white border-b border-gray-200">
              <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase">Company</th>
              <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase">Contact</th>
              <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase">Plan</th>
              <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase">Revenue</th>
              <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase">Status</th>
              <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase text-right">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {filteredClients.map((client) => (
              <tr key={client.id} className="hover:bg-gray-50 group">
                <td className="px-6 py-4">
                    <div className="font-medium text-gray-900">{client.companyName}</div>
                    <div className="text-xs text-gray-500">{client.employeeCount} Employees</div>
                </td>
                <td className="px-6 py-4">
                    <div className="text-sm text-gray-900">{client.contactName}</div>
                    <div className="text-xs text-gray-500">{client.email}</div>
                </td>
                <td className="px-6 py-4">
                    <span className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-medium 
                        ${client.plan === 'Enterprise' ? 'bg-purple-100 text-purple-800' : 
                          client.plan === 'Pro' ? 'bg-blue-100 text-blue-800' : 'bg-gray-100 text-gray-800'}`}>
                        {client.plan}
                    </span>
                </td>
                <td className="px-6 py-4 font-medium text-gray-900">
                    ${client.mrr.toLocaleString()}
                </td>
                 <td className="px-6 py-4">
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium 
                         ${client.status === 'ACTIVE' ? 'bg-green-100 text-green-800' : 
                           client.status === 'SUSPENDED' ? 'bg-red-100 text-red-800' : 'bg-yellow-100 text-yellow-800'}`}>
                        {client.status}
                    </span>
                </td>
                <td className="px-6 py-4 text-right">
                    <div className="flex justify-end space-x-3">
                        <button 
                            onClick={() => handleManage(client)}
                            className="text-white bg-jam-black hover:bg-gray-800 px-3 py-1.5 rounded text-xs font-medium transition-colors shadow-sm flex items-center"
                        >
                            <Icons.Settings className="w-3 h-3 mr-1" /> Manage
                        </button>
                        <button 
                            onClick={() => handleEdit(client)}
                            className="text-jam-orange hover:text-yellow-600 text-sm font-medium"
                        >
                            Edit
                        </button>
                        <button 
                            onClick={() => handleDelete(client.id)}
                            className="text-gray-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                            title="Remove Client"
                        >
                            <Icons.Trash className="w-4 h-4" />
                        </button>
                    </div>
                </td>
              </tr>
            ))}
            {filteredClients.length === 0 && (
                <tr>
                    <td colSpan={6} className="px-6 py-8 text-center text-gray-500">
                        No clients found matching your search.
                    </td>
                </tr>
            )}
          </tbody>
        </table>
      </div>
      </>
  );

  const renderComplianceTab = () => (
      <div className="space-y-6 animate-fade-in">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
             <div className="bg-white p-6 rounded-xl shadow-sm border-l-4 border-jam-orange">
                <div className="flex justify-between items-start">
                    <div>
                        <p className="text-xs text-gray-500 uppercase font-bold">Upcoming SO1s</p>
                        <p className="text-3xl font-bold text-gray-900 mt-2">{filteredClients.length}</p>
                    </div>
                    <div className="p-2 bg-orange-50 rounded-lg">
                        <Icons.CalendarDays className="w-6 h-6 text-jam-orange" />
                    </div>
                </div>
                        <p className="text-xs text-gray-500 mt-2">
                            {clients.length > 0 ? `${clients.length} client${clients.length !== 1 ? 's' : ''} to review` : 'No clients'}
                        </p>
             </div>
             <div className="bg-white p-6 rounded-xl shadow-sm border-l-4 border-red-500">
                <div className="flex justify-between items-start">
                    <div>
                        <p className="text-xs text-gray-500 uppercase font-bold">Compliance Risk</p>
                        <p className="text-3xl font-bold text-gray-900 mt-2">0</p>
                    </div>
                    <div className="p-2 bg-red-50 rounded-lg">
                        <Icons.Alert className="w-6 h-6 text-red-500" />
                    </div>
                </div>
                <p className="text-xs text-gray-500 mt-2">Clients with overdue filings</p>
             </div>
             <div className="bg-white p-6 rounded-xl shadow-sm border-l-4 border-green-500">
                <div className="flex justify-between items-start">
                    <div>
                        <p className="text-xs text-gray-500 uppercase font-bold">Tax Health Score</p>
                        <p className="text-3xl font-bold text-gray-900 mt-2">94%</p>
                    </div>
                    <div className="p-2 bg-green-50 rounded-lg">
                        <Icons.Shield className="w-6 h-6 text-green-500" />
                    </div>
                </div>
                        <p className="text-xs text-gray-500 mt-2">
                            {clients.length > 0 ? 'Based on client compliance' : 'No data available'}
                        </p>
             </div>
          </div>

          <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
              <table className="w-full text-left border-collapse">
                <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                        <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase">Client</th>
                        <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase">SO1 Status (Feb)</th>
                        <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase">S02 Status (Annual)</th>
                        <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase">Next Due Date</th>
                        <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase text-right">Actions</th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                    {filteredClients.map(client => {
                        const status = getComplianceStatus();
                        return (
                            <tr key={client.id} className="hover:bg-gray-50">\n                                <td className="px-6 py-4 font-medium text-gray-900">{client.companyName}</td>
                                <td className="px-6 py-4">
                                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium 
                                        ${status.so1 === 'FILED' ? 'bg-green-100 text-green-800' : 
                                          status.so1 === 'OVERDUE' ? 'bg-red-100 text-red-800' : 'bg-yellow-100 text-yellow-800'}`}>
                                        {status.so1}
                                    </span>
                                </td>
                                <td className="px-6 py-4">
                                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
                                        {status.s02}
                                    </span>
                                </td>
                                <td className="px-6 py-4 text-sm text-gray-500">{status.nextDue}</td>
                                <td className="px-6 py-4 text-right">
                                    {status.so1 !== 'FILED' && (
                                        <button 
                                            onClick={() => alert(`Reminder sent to ${client.email}`)}
                                            className="text-jam-orange hover:text-yellow-600 text-sm font-medium flex items-center justify-end w-full"
                                        >
                                            <Icons.Mail className="w-3 h-3 mr-1" /> Send Reminder
                                        </button>
                                    )}
                                </td>
                            </tr>
                        );
                    })}
                </tbody>
              </table>
          </div>
      </div>
  );

  const renderFinancialsTab = () => (
      <div className="space-y-6 animate-fade-in">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="lg:col-span-2 bg-white p-6 rounded-xl shadow-sm border border-gray-200">
                  <h3 className="font-bold text-gray-900 mb-6">Revenue & Profit Analysis</h3>
                  <div className="h-72">
                    <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={financialData}>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f3f4f6" />
                            <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fill: '#9CA3AF'}} dy={10} />
                            <YAxis axisLine={false} tickLine={false} tick={{fill: '#9CA3AF'}} tickFormatter={(val) => `$${val/1000}k`} />
                            <Tooltip 
                                cursor={{fill: '#F3F4F6'}}
                                formatter={(val: number) => [`$${val.toLocaleString()}`]}
                                contentStyle={{borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)'}}
                            />
                            <Bar dataKey="revenue" fill="#1f2937" radius={[4, 4, 0, 0]} name="Client Revenue" />
                            <Bar dataKey="profit" fill="#10B981" radius={[4, 4, 0, 0]} name="Net Profit" />
                        </BarChart>
                    </ResponsiveContainer>
                  </div>
              </div>
              <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200 flex flex-col">
                  <h3 className="font-bold text-gray-900 mb-2">Est. Platform Bill</h3>
                  <h1 className="text-4xl font-extrabold text-red-600 mb-1">${platformFees.toLocaleString()}</h1>
                  <p className="text-sm text-gray-500 mb-8">
                    Due: {new Date(new Date().setMonth(new Date().getMonth() + 1)).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
                  </p>
                  
                  <div className="bg-gray-50 p-4 rounded-lg border border-gray-100 text-sm text-gray-600 mb-6">
                      <div className="flex justify-between mb-2">
                          <span>Company Base Fees ({activeClientsList.length} x ${baseFee})</span>
                          <span>${(activeClientsList.length * baseFee).toLocaleString()}</span>
                      </div>
                      <div className="flex justify-between">
                          <span>Per Employee Fees ({activeEmpCount} x ${perUserFee})</span>
                          <span>${(activeEmpCount * perUserFee).toLocaleString()}</span>
                      </div>
                  </div>

                  <div className="space-y-3 mt-auto">
                      <button className="w-full py-2.5 bg-jam-black text-white font-bold rounded-lg hover:bg-gray-800">
                          Pay Now
                      </button>
                      <button className="w-full py-2.5 bg-white border border-gray-300 text-gray-700 font-medium rounded-lg hover:bg-gray-50">
                          View Invoice
                      </button>
                  </div>
              </div>
          </div>

          <div className="bg-white rounded-xl shadow-sm border border-gray-200">
              <div className="px-6 py-4 border-b border-gray-200 bg-gray-50">
                  <h3 className="font-bold text-gray-900">Billing History</h3>
              </div>
              <table className="w-full text-left border-collapse">
                <thead className="bg-white border-b border-gray-200">
                    <tr>
                        <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase">Date</th>
                        <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase">Invoice #</th>
                        <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase">Method</th>
                        <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase">Amount Paid</th>
                        <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase text-right">Status</th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                    {billingHistory.length > 0 ? (
                        billingHistory.map((payment) => (
                            <tr key={payment.id} className="hover:bg-gray-50">
                                <td className="px-6 py-4 text-sm text-gray-900">
                                    {new Date(payment.paymentDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                                </td>
                                <td className="px-6 py-4 text-sm text-gray-500 font-mono">
                                    {payment.invoiceNumber || payment.id.substring(0, 8)}
                                </td>
                                <td className="px-6 py-4 text-sm text-gray-500">
                                    {payment.paymentMethod === 'card' ? 'Card' : payment.paymentMethod === 'bank_transfer' ? 'Bank Transfer' : payment.paymentMethod || 'N/A'}
                                </td>
                                <td className="px-6 py-4 text-sm font-bold text-gray-900">
                                    ${payment.amount.toLocaleString()}
                                </td>
                                <td className="px-6 py-4 text-right">
                                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                                        payment.status === 'completed' ? 'bg-green-100 text-green-800' :
                                        payment.status === 'pending' ? 'bg-yellow-100 text-yellow-800' :
                                        payment.status === 'failed' ? 'bg-red-100 text-red-800' :
                                        'bg-gray-100 text-gray-800'
                                    }`}>
                                        {payment.status?.toUpperCase() || 'PENDING'}
                                    </span>
                                </td>
                            </tr>
                        ))
                    ) : (
                        <tr>
                            <td colSpan={5} className="px-6 py-8 text-center text-gray-500">
                                {isLoadingData ? 'Loading billing history...' : 'No billing history found.'}
                            </td>
                        </tr>
                    )}
                </tbody>
              </table>
          </div>
      </div>
  );

  return (
    <div className="space-y-6 animate-fade-in">
      
      {/* Add/Edit Modal */}
      {(isAddModalOpen || isEditModalOpen) && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
              <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg overflow-hidden animate-scale-in">
                  <div className="flex justify-between items-center p-6 border-b border-gray-100 bg-gray-50">
                      <h3 className="text-xl font-bold text-gray-900">
                          {isAddModalOpen ? 'Add New Client' : 'Manage Client'}
                      </h3>
                      <button 
                        onClick={() => { setIsAddModalOpen(false); setIsEditModalOpen(false); }}
                        className="text-gray-400 hover:text-gray-600"
                      >
                          <Icons.Close className="w-6 h-6" />
                      </button>
                  </div>
                  <form onSubmit={isAddModalOpen ? saveNewClient : updateClient} className="p-6 space-y-4">
                      <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">Company Name</label>
                          <input 
                            required
                            type="text" 
                            className="w-full border border-gray-300 rounded-lg p-2.5 focus:ring-2 focus:ring-jam-orange"
                            value={formData.companyName}
                            onChange={e => setFormData({...formData, companyName: e.target.value})}
                          />
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                          <div>
                              <label className="block text-sm font-medium text-gray-700 mb-1">Contact Name</label>
                              <input 
                                required
                                type="text" 
                                className="w-full border border-gray-300 rounded-lg p-2.5 focus:ring-2 focus:ring-jam-orange"
                                value={formData.contactName}
                                onChange={e => setFormData({...formData, contactName: e.target.value})}
                              />
                          </div>
                          <div>
                              <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                              <input 
                                required
                                type="email" 
                                className="w-full border border-gray-300 rounded-lg p-2.5 focus:ring-2 focus:ring-jam-orange"
                                value={formData.email}
                                onChange={e => setFormData({...formData, email: e.target.value})}
                              />
                          </div>
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                           <div>
                              <label className="block text-sm font-medium text-gray-700 mb-1">Subscription Plan</label>
                              <select 
                                className="w-full border border-gray-300 rounded-lg p-2.5 focus:ring-2 focus:ring-jam-orange"
                                value={formData.plan}
                                onChange={e => setFormData({...formData, plan: e.target.value as any})}
                              >
                                  <option value="Free">Free</option>
                                  <option value="Starter">Starter ($2,000)</option>
                                  <option value="Pro">Pro ($500/emp)</option>
                                  <option value="Enterprise">Enterprise</option>
                              </select>
                          </div>
                          <div>
                              <label className="block text-sm font-medium text-gray-700 mb-1">Employee Count</label>
                              <input 
                                type="number" 
                                className="w-full border border-gray-300 rounded-lg p-2.5 focus:ring-2 focus:ring-jam-orange"
                                value={formData.employeeCount}
                                onChange={e => setFormData({...formData, employeeCount: parseInt(e.target.value)})}
                              />
                          </div>
                      </div>
                      <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">Account Status</label>
                          <select 
                            className="w-full border border-gray-300 rounded-lg p-2.5 focus:ring-2 focus:ring-jam-orange"
                            value={formData.status}
                            onChange={e => setFormData({...formData, status: e.target.value as any})}
                          >
                              <option value="ACTIVE">Active</option>
                              <option value="PENDING">Pending Onboarding</option>
                              <option value="SUSPENDED">Suspended (Payment)</option>
                          </select>
                      </div>

                      <div className="pt-4 flex justify-end space-x-3">
                          <button 
                            type="button"
                            onClick={() => { setIsAddModalOpen(false); setIsEditModalOpen(false); }}
                            className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg"
                          >
                              Cancel
                          </button>
                          <button 
                            type="submit" 
                            className="px-6 py-2 bg-jam-black text-white font-semibold rounded-lg hover:bg-gray-800"
                          >
                              {isAddModalOpen ? 'Create Client' : 'Save Changes'}
                          </button>
                      </div>
                  </form>
              </div>
          </div>
      )}

      <div className="flex justify-between items-center">
        <div>
            <h2 className="text-3xl font-bold text-gray-900">Reseller Dashboard</h2>
            <p className="text-gray-500">Manage your clients and track commissions.</p>
        </div>
        <div className="flex space-x-3">
            <button 
                onClick={handleAddNew}
                className="bg-jam-black text-white px-6 py-2.5 rounded-lg hover:bg-gray-800 flex items-center shadow-lg transition-transform hover:-translate-y-0.5"
            >
                <Icons.Plus className="w-4 h-4 mr-2" />
                Add New Client
            </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200">
         <div className="border-b border-gray-200 px-6">
            <nav className="-mb-px flex space-x-8">
                {[
                    {key: 'dashboard', label: 'My Dashboard'},
                    {key: 'partners', label: 'Partner Console'},
                    {key: 'compliance', label: 'Compliance'},
                    {key: 'financials', label: 'Revenue & Costs'}
                ].map((tab) => (
                    <button
                        key={tab.key}
                        onClick={() => setActiveTab(tab.key as any)}
                        className={`whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm transition-colors ${
                            activeTab === tab.key
                            ? 'border-jam-orange text-jam-black'
                            : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                        }`}
                    >
                        {tab.label}
                    </button>
                ))}
            </nav>
         </div>
         
         <div className="p-6 bg-gray-50">
            {activeTab === 'dashboard' && (
                <div className="space-y-4">
                    <p className="text-sm text-gray-600 mb-6">
                        Manage your own company's employees, run payroll, and access all standard admin features.
                    </p>
                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                        <div className="flex items-start">
                            <Icons.Alert className="w-5 h-5 text-blue-600 mr-3 mt-0.5" />
                            <div>
                                <h4 className="text-sm font-semibold text-blue-900 mb-1">Coming Soon: Employee Management</h4>
                                <p className="text-sm text-blue-700">
                                    Full employee dashboard integration is being finalized. For now, please use the main admin dashboard 
                                    to manage your employees. Use the "Partner Console" tab to manage your client companies.
                                </p>
                            </div>
                        </div>
                    </div>
                    <div className="bg-white rounded-lg border border-gray-200 p-6 text-center">
                        <Icons.Users className="w-12 h-12 text-gray-400 mx-auto mb-3" />
                        <h3 className="text-lg font-semibold text-gray-900 mb-2">Employee Management Dashboard</h3>
                        <p className="text-gray-600 mb-4">Navigate to the main Dashboard to manage your own employees</p>
                        <button 
                            onClick={() => window.location.href = '/?page=dashboard'}
                            className="px-6 py-2 bg-jam-orange text-white rounded-lg hover:bg-yellow-600 transition-colors"
                        >
                            Go to Dashboard
                        </button>
                    </div>
                </div>
            )}
            {activeTab === 'partners' && (
                <>
                     {/* Stats Cards - Only show on Clients tab */}
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-6">
                        <div className="bg-jam-black text-white p-6 rounded-xl shadow-lg">
                        <div className="flex justify-between items-start">
                            <div>
                            <p className="text-sm text-gray-400 uppercase font-bold">Monthly Revenue</p>
                            <h3 className="text-3xl font-bold text-white mt-2">${totalRev.toLocaleString()}</h3>
                            </div>
                            <div className="p-2 bg-gray-800 rounded-lg">
                            <Icons.Trending className="w-6 h-6 text-jam-yellow" />
                            </div>
                        </div>
                        <div className="mt-4 text-sm text-gray-400">
                            From client billing
                        </div>
                        </div>

                        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
                        <div className="flex justify-between items-start">
                            <div>
                            <p className="text-sm text-gray-500 uppercase font-bold">Platform Fees</p>
                            <h3 className="text-3xl font-bold text-red-600 mt-2">-${platformFees.toLocaleString()}</h3>
                            </div>
                            <div className="p-2 bg-red-50 rounded-lg">
                            <Icons.Payroll className="w-6 h-6 text-red-500" />
                            </div>
                        </div>
                        <div className="mt-4 text-sm text-gray-500">
                            Based on active usage
                        </div>
                        </div>

                        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
                        <div className="flex justify-between items-start">
                            <div>
                            <p className="text-sm text-gray-500 uppercase font-bold">Net Profit</p>
                            <h3 className="text-3xl font-bold text-green-600 mt-2">${netProfit.toLocaleString()}</h3>
                            </div>
                            <div className="p-2 bg-green-50 rounded-lg">
                            <Icons.Company className="w-6 h-6 text-green-600" />
                            </div>
                        </div>
                        <div className="mt-4 text-sm text-gray-500">
                            {((netProfit / totalRev) * 100).toFixed(1)}% Margin
                        </div>
                        </div>
                        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
                        <div className="flex justify-between items-start">
                            <div>
                            <p className="text-sm text-gray-500 uppercase font-bold">Total Employees</p>
                            <h3 className="text-3xl font-bold text-gray-900 mt-2">
                                {totalEmployees}
                            </h3>
                            </div>
                            <div className="p-2 bg-gray-100 rounded-lg">
                            <Icons.Users className="w-6 h-6 text-gray-600" />
                            </div>
                        </div>
                        <div className="mt-4 text-sm text-gray-500">
                            Across all managed entities
                        </div>
                        </div>
                    </div>
                    {renderClientsTab()}
                </>
            )}
            {activeTab === 'compliance' && renderComplianceTab()}
            {activeTab === 'financials' && renderFinancialsTab()}
         </div>
      </div>
    </div>
  );
};
