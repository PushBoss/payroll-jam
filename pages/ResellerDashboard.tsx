
import React, { useState, useEffect } from 'react';
import { Icons } from '../components/Icons';
import { ResellerClient, PricingPlan } from '../types';
import { getPlanPriceDetails } from '../utils/pricing';
import { supabaseService } from '../services/supabaseService';
import { dimePayService } from '../services/dimePayService';
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
    const [isSyncing, setIsSyncing] = useState(false);
    const [complianceMap, setComplianceMap] = useState<Record<string, any>>({});

    const [activeTab, setActiveTab] = useState<'clients' | 'compliance' | 'financials'>('clients');
    const [searchTerm, setSearchTerm] = useState('');
    const [isAddModalOpen, setIsAddModalOpen] = useState(false);
    const [isEditModalOpen, setIsEditModalOpen] = useState(false);
    const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
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

                    // Get compliance data
                    const compOverview = await supabaseService.getComplianceOverview(user.companyId);
                    setComplianceMap(compOverview);


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

                    const calculatedFinancialData = last6Months.map(({ name, month, year }) => {
                        const monthEnd = new Date(year, month + 1, 0);

                        // Cost: What Reseller paid to Platform this month
                        const cost = Array.isArray(payments) ? payments.filter(p => {
                            if (!p || !p.paymentDate) return false;
                            const paymentDate = new Date(p.paymentDate);
                            return paymentDate.getMonth() === month && paymentDate.getFullYear() === year && p.status === 'completed';
                        }).reduce((sum, p) => sum + (p.amount || 0), 0) : 0;

                        // Revenue: Estimated Client MRR
                        const activeClientsInMonth = Array.isArray(resellerClients) ? resellerClients.filter(c => {
                            if (c.status !== 'ACTIVE') return false;
                            if (!c.createdAt) return true;
                            return new Date(c.createdAt) <= monthEnd;
                        }) : [];

                        const revenue = activeClientsInMonth.reduce((sum, c) => sum + (c.mrr || 0), 0);

                        return { name, revenue, profit: revenue - cost, cost };
                    });
                    setFinancialData(calculatedFinancialData);
                } else {
                    console.warn('ResellerDashboard: No companyId found for user. Cannot load clients.');
                    setClients([]);
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
    const totalEmployees = clients.reduce((acc, curr) => acc + curr.employeeCount, 0);

    // Reseller Pricing Model:
    // Uses values from the 'Reseller' plan in the global config
    const resellerPlan = plans.find(p => p.name === 'Reseller');
    const BASE_FEE_CLIENT = resellerPlan?.priceConfig.baseFee || 3000;
    const PER_EMP_FEE_CLIENT = resellerPlan?.priceConfig.perUserFee || 500;
    const PLATFORM_COMMISSION_RATE = (resellerPlan?.priceConfig.resellerCommission || 20) / 100;

    const activeClientsList = clients.filter(c => c.status === 'ACTIVE');

    // Calculate standardized revenue based on the active clients and their employee counts
    const calculatedTotalRevenue = activeClientsList.reduce((sum, client) => {
        return sum + BASE_FEE_CLIENT + (client.employeeCount * PER_EMP_FEE_CLIENT);
    }, 0);

    const platformFees = calculatedTotalRevenue * PLATFORM_COMMISSION_RATE;

    // Note: We use calculatedTotalRevenue for consistency in the dashboard view, 
    // overriding the 'mrr' field from DB for display purposes if they differ.
    const netProfit = calculatedTotalRevenue - platformFees;

    // Use calculated revenue for the Summary Cards as well
    const totalRev = calculatedTotalRevenue;

    // Get compliance status - use real data map if available
    const getComplianceStatus = (clientId: string) => {
        const nextMonth = new Date();
        nextMonth.setMonth(nextMonth.getMonth() + 1);
        nextMonth.setDate(15);
        const nextDueDate = nextMonth.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }); // SO1 usually due on 15th

        const clientData = complianceMap[clientId];
        if (clientData) {
            // Logic: If last pay run was in current month or last month, SO1 is likely filed or pending processing
            // For now, if we have a record, we mark SO1 as FILED for the previous period
            return {
                so1: 'FILED',
                s02: 'PENDING', // Annual is usually pending until year end
                nextDue: nextDueDate
            };
        }

        return {
            so1: 'PENDING',
            s02: 'PENDING',
            nextDue: nextDueDate
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

    const handleDelete = async (clientCompanyId: string) => {
        const client = clients.find(c => c.id === clientCompanyId);
        const clientLabel = client?.companyName || 'this client';

        if (!window.confirm(`Remove ${clientLabel} from your portfolio? This will revoke their reseller access.`)) {
            return;
        }

        if (!user?.companyId) {
            toast.error('Reseller company ID not found');
            return;
        }

        try {
            const success = await supabaseService.removeResellerClient(user.companyId, clientCompanyId);

            if (success) {
                setClients(prev => prev.filter(c => c.id !== clientCompanyId));
                toast.success(`${clientLabel} removed from portfolio`);
            } else {
                toast.error('Failed to remove client');
            }
        } catch (error) {
            console.error('Error removing reseller client:', error);
            toast.error('Failed to remove client');
        }
    };

    const handleManage = (client: ResellerClient) => {
        if (onManageClient) {
            onManageClient(client);
        }
    };

    const handleJoinTeam = async (client: ResellerClient) => {
        if (!user?.id || !user?.email) {
            toast.error('Reseller user information missing');
            return;
        }

        try {
            toast.loading(`Joining ${client.companyName} team...`, { id: 'join-team' });
            const success = await supabaseService.joinClientTeam(client.id, user.id, user.email);

            if (success) {
                toast.success(`You are now a manager of ${client.companyName}`, { id: 'join-team' });
                // Optional: trigger a refresh or just rely on the next navigation to work
            } else {
                toast.error('Failed to join team. Please try again.', { id: 'join-team' });
            }
        } catch (error) {
            console.error('Error joining team:', error);
            toast.error('Failed to join team', { id: 'join-team' });
        }
    };

    const handleSyncPortfolio = async () => {
        if (!user?.id) return;
        setIsSyncing(true);
        toast.loading('Syncing your client portfolio...', { id: 'sync-portfolio' });

        try {
            const result = await supabaseService.syncResellerPortfolio(user.id);
            if (result.success) {
                if (result.syncedCount > 0) {
                    toast.success(`Synced ${result.syncedCount} companies to your portfolio!`, { id: 'sync-portfolio' });
                    // Reload clients
                    if (user.companyId) {
                        const resellerClients = await supabaseService.getResellerClients(user.companyId);
                        setClients(Array.isArray(resellerClients) ? resellerClients : []);
                    }
                } else {
                    toast.info('Portfolio is already up to date.', { id: 'sync-portfolio' });
                }
            } else {
                toast.error(`Sync failed: ${result.error}`, { id: 'sync-portfolio' });
            }
        } catch (error) {
            console.error('Error syncing portfolio:', error);
            toast.error('An unexpected error occurred during sync.', { id: 'sync-portfolio' });
        } finally {
            setIsSyncing(false);
        }
    };

    const calculateMRR = (plan: string, empCount: number) => {
        // Updated Reseller Model: $3000 Base + $500 per Employee
        if (plan === 'Free') return 0;
        return 3000 + (empCount * 500);
    };

    const saveNewClient = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!user?.companyId || !user?.id) {
            toast.error('Reseller company ID not found');
            return;
        }

        const clientEmail = formData.email?.trim().toLowerCase();
        if (!clientEmail) {
            toast.error('Email is required');
            return;
        }

        try {
            // Check if user/company exists (use admin lookup to bypass RLS)
            const existingUser = await supabaseService.getUserByEmailAdmin(clientEmail);

            if (existingUser && existingUser.companyId) {
                // Company exists - add reseller as team member (manager role) and link to portfolio
                const clientCompanyId = existingUser.companyId;

                // 1. Add reseller user as team member (manager role) to the existing company directly (accepted status)
                // This function also handles the linking in reseller_clients using admin privileges
                const clientSaved = await supabaseService.joinClientTeam(clientCompanyId, user.id, user.email);

                if (clientSaved) {
                    toast.success(`${formData.companyName || 'Company'} added to your portfolio!`);

                    // Reload clients
                    const resellerClients = await supabaseService.getResellerClients(user.companyId);
                    setClients(Array.isArray(resellerClients) ? resellerClients : []);
                } else {
                    toast.error('Failed to link existing company to your portfolio');
                }
            } else {
                // Company doesn't exist - create reseller invite with plan info
                const inviteToken = `reseller-invite-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

                // Include Reseller's own user ID, email, and company ID in the signup link 
                // This allows the client to link to the reseller and add them as a team member 
                // during signup without needing to perform complex database lookups that RLS might block.
                const signupLink = `${window.location.origin}/?page=signup&token=${inviteToken}&resellerUserId=${user.id}&resellerEmail=${encodeURIComponent(user.email)}&resellerCompanyId=${user.companyId}&email=${encodeURIComponent(clientEmail)}&reseller=true&plan=${encodeURIComponent(formData.plan || 'Starter')}`;

                // Save the invite to database
                const inviteSaved = await supabaseService.saveResellerInvite(
                    user.companyId,
                    clientEmail,
                    inviteToken,
                    formData.contactName,
                    formData.companyName
                );

                if (!inviteSaved) {
                    toast.error('Failed to create invitation');
                    return;
                }

                // Send reseller invite email
                const emailResult = await emailService.sendResellerInvite(
                    clientEmail,
                    formData.contactName || 'Admin',
                    (user as any)?.companyName || 'Our Partner',
                    signupLink
                );

                if (emailResult.success) {
                    toast.success(`Invitation sent to ${clientEmail}. They will appear in your portfolio once they sign up and accept.`);

                    // Reload pending invites
                    const invites = await supabaseService.getResellerInvites(user.companyId);
                    setPendingInvites(Array.isArray(invites) ? invites : []);
                } else {
                    toast.error('Failed to send invitation email');
                }
            }

            setIsAddModalOpen(false);
            setFormData({});
        } catch (error: any) {
            console.error('Error adding client:', error);
            toast.error(error.message || 'Failed to add client');
        }
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

    const handlePaymentSuccess = (data: any) => {
        setIsPaymentModalOpen(false);
        toast.success(`Payment of $${platformFees.toLocaleString()} processed successfully!`);

        // Add billing entry to history
        const newPayment = {
            id: data?.id || `pay_${Date.now()}`,
            paymentDate: new Date().toISOString(),
            invoiceNumber: data?.order_id || `INV-${new Date().getFullYear()}-${Math.floor(Math.random() * 10000)}`,
            paymentMethod: 'DimePay',
            amount: platformFees,
            status: 'completed'
        };
        setBillingHistory(prev => [newPayment, ...prev]);
    };

    const handlePaymentError = (error: any) => {
        console.error("Payment failed", error);
        toast.error("Payment initialization failed. Please try again.");
    };

    // Initialize DimePay when modal opens
    useEffect(() => {
        if (isPaymentModalOpen && platformFees > 0) {
            // Small delay to ensure DOM element is ready
            const timer = setTimeout(() => {
                dimePayService.renderPaymentWidget({
                    mountId: 'dimepay-mount',
                    email: user?.email || '',
                    amount: platformFees,
                    currency: 'JMD',
                    description: 'Platform Commission Fee',
                    onSuccess: handlePaymentSuccess,
                    onError: handlePaymentError,
                    metadata: {
                        plan: 'Reseller Commission',
                        companyId: user?.companyId,
                        name: (user as any)?.user_metadata?.full_name || 'Reseller'
                    }
                });
            }, 100);
            return () => clearTimeout(timer);
        }
    }, [isPaymentModalOpen, platformFees, user]);

    const handleViewInvoice = () => {
        const w = window.open('', '_blank');
        if (w) {
            w.document.write(`
                <html>
                    <head>
                        <title>Invoice - Payroll Jam</title>
                        <style>
                            body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; padding: 40px; color: #1f2937; max-width: 800px; margin: 0 auto; }
                            .header { display: flex; justify-content: space-between; margin-bottom: 60px; border-bottom: 2px solid #f3f4f6; padding-bottom: 20px; }
                            .logo { font-size: 24px; font-weight: 800; color: #1f2937; }
                            .meta { text-align: right; font-size: 14px; color: #6b7280; line-height: 1.5; }
                            h2 { font-size: 20px; margin-bottom: 20px; }
                            table { width: 100%; border-collapse: collapse; margin-top: 30px; }
                            th { text-align: left; border-bottom: 2px solid #e5e7eb; padding: 12px; font-size: 12px; text-transform: uppercase; color: #6b7280; }
                            td { padding: 16px 12px; border-bottom: 1px solid #f3f4f6; font-size: 14px; }
                            .amount { font-weight: 600; text-align: right; }
                            .total-section { margin-top: 40px; border-top: 2px solid #e5e7eb; padding-top: 20px; display: flex; justify-content: flex-end; }
                            .total-row { display: flex; justify-content: space-between; width: 300px; margin-bottom: 10px; }
                            .total-label { font-weight: 500; color: #6b7280; }
                            .total-value { font-weight: 800; font-size: 24px; color: #1f2937; }
                            .footer { margin-top: 80px; text-align: center; color: #9ca3af; font-size: 12px; }
                            .btn-print { background: #1f2937; color: white; border: none; padding: 10px 24px; border-radius: 8px; cursor: pointer; font-weight: 600; font-size: 14px; transition: background 0.2s; }
                            .btn-print:hover { background: #111827; }
                            @media print { .no-print { display: none; } }
                        </style>
                    </head>
                    <body>
                        <div class="header">
                            <div class="logo">PAYROLL JAM</div>
                            <div class="meta">
                                <p><strong>Invoice #:</strong> INV-${new Date().getFullYear()}-${Math.floor(Math.random() * 10000)}</p>
                                <p><strong>Date:</strong> ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</p>
                                <p><strong>Due Date:</strong> ${new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toLocaleDateString()}</p>
                            </div>
                        </div>

                        <div style="margin-bottom: 40px;">
                            <p style="color: #6b7280; font-size: 12px; text-transform: uppercase; font-weight: 600; margin-bottom: 8px;">Bill To</p>
                            <p style="font-weight: 600; font-size: 16px;">${user?.email || 'Reseller Partner'}</p>
                        </div>

                        <h2>Platform Commission Statement</h2>
                        
                        <table>
                            <thead>
                                <tr>
                                    <th>Description</th>
                                    <th>Details</th>
                                    <th style="text-align: right;">Amount</th>
                                </tr>
                            </thead>
                            <tbody>
                                <tr>
                                    <td><strong>Platform Commission (20%)</strong></td>
                                    <td style="color: #6b7280;">Based on Total Managed Revenue of $${totalRev.toLocaleString()}</td>
                                    <td class="amount">$${platformFees.toLocaleString()}</td>
                                </tr>
                            </tbody>
                        </table>

                        <div class="total-section">
                            <div>
                                <div class="total-row">
                                    <span class="total-label">Subtotal</span>
                                    <span>$${platformFees.toLocaleString()}</span>
                                </div>
                                <div class="total-row" style="align-items: center;">
                                    <span class="total-label">Total Due</span>
                                    <span class="total-value">$${platformFees.toLocaleString()}</span>
                                </div>
                            </div>
                        </div>

                        <div class="footer">
                            <p>Thank you for your partnership with Payroll Jam.</p>
                            <p>Questions? Contact support@payrolljam.com</p>
                        </div>

                        <div class="no-print" style="margin-top: 60px; text-align: center;">
                            <button onclick="window.print()" class="btn-print">Print Invoice</button>
                        </div>
                    </body>
                </html>
            `);
            w.document.close();
        } else {
            toast.error('Pop-up blocked. Please allow pop-ups to view invoice.');
        }
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

    const handleResendInvite = async (invite: any) => {
        try {
            const inviteLink = `${window.location.origin}/?token=${invite.invite_token}&email=${encodeURIComponent(invite.invite_email || '')}&reseller=true`;

            // Use the specific Reseller Invite method, not the generic employee one
            const emailResult = await emailService.sendResellerInvite(
                invite.invite_email,
                invite.contact_name || 'Valued Client',
                (user as any)?.companyName || 'Our Partner',
                inviteLink
            );

            if (emailResult.success) {
                toast.success(`Invitation resent to ${invite.invite_email}`);
            } else {
                toast.error('Failed to resend invitation email');
            }
        } catch (error) {
            console.error('Error resending invite:', error);
            toast.error('Failed to resend invitation');
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
                                        onClick={() => handleResendInvite(invite)}
                                        className="p-1.5 text-blue-600 hover:bg-blue-50 rounded transition-colors"
                                        title="Resend invitation"
                                    >
                                        <Icons.Refresh className="w-4 h-4" />
                                    </button>
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
                                    ${(client.plan === 'Free' ? 0 : 3000 + (client.employeeCount * 500)).toLocaleString()}
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

    // ...existing code...
    // Move renderManageCompanyTab above component and use inline below

    const renderComplianceTab = () => (
        <div className="space-y-6 animate-fade-in">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="bg-white p-6 rounded-xl shadow-sm border-l-4 border-jam-orange">
                    <div className="flex justify-between items-start">
                        <div>
                            <p className="text-xs text-gray-500 uppercase font-bold">Upcoming SO1s</p>
                            <p className="text-3xl font-bold text-gray-900 mt-2">{filteredClients.filter(c => getComplianceStatus(c.id).so1 !== 'FILED').length}</p>
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
                            const status = getComplianceStatus(client.id);
                            return (
                                <tr key={client.id} className="hover:bg-gray-50">
                                    <td className="px-6 py-4 font-medium text-gray-900">{client.companyName}</td>
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
                                        <div className="flex flex-col gap-2 items-end">
                                            <button
                                                onClick={() => handleManage(client)}
                                                className="text-jam-black hover:text-gray-700 text-sm font-bold flex items-center justify-end"
                                            >
                                                <Icons.ExternalLink className="w-3 h-3 mr-1" /> Manage
                                            </button>

                                            <button
                                                onClick={() => handleJoinTeam(client)}
                                                className="text-blue-600 hover:text-blue-800 text-sm font-medium flex items-center justify-end"
                                                title="Ensure you have access to this client's team"
                                            >
                                                <Icons.Users className="w-3 h-3 mr-1" /> Sync Access
                                            </button>

                                            {status.so1 !== 'FILED' && (
                                                <button
                                                    onClick={() => alert(`Reminder sent to ${client.email}`)}
                                                    className="text-jam-orange hover:text-yellow-600 text-sm font-medium flex items-center justify-end"
                                                >
                                                    <Icons.Mail className="w-3 h-3 mr-1" /> Send Reminder
                                                </button>
                                            )}
                                        </div>
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
                                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#9CA3AF' }} dy={10} />
                                <YAxis axisLine={false} tickLine={false} tick={{ fill: '#9CA3AF' }} tickFormatter={(val) => `$${val / 1000}k`} />
                                <Tooltip
                                    cursor={{ fill: '#F3F4F6' }}
                                    formatter={(val: number) => [`$${val.toLocaleString()}`]}
                                    contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)' }}
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
                            <span>Total Client Revenue</span>
                            <span>${totalRev.toLocaleString()}</span>
                        </div>
                        <div className="flex justify-between pt-2 border-t border-gray-200 mt-2">
                            <span className="font-semibold text-gray-900">Platform Commission (20%)</span>
                            <span className="font-bold text-red-600">${platformFees.toLocaleString()}</span>
                        </div>
                    </div>

                    <div className="space-y-3 mt-auto">
                        <button
                            onClick={() => setIsPaymentModalOpen(true)}
                            className="w-full py-2.5 bg-jam-black text-white font-bold rounded-lg hover:bg-gray-800 transition-colors"
                        >
                            Pay Now
                        </button>
                        <button
                            onClick={handleViewInvoice}
                            className="w-full py-2.5 bg-white border border-gray-300 text-gray-700 font-medium rounded-lg hover:bg-gray-50 transition-colors"
                        >
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
                                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${payment.status === 'completed' ? 'bg-green-100 text-green-800' :
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
                                {isAddModalOpen ? 'Add New Company' : 'Manage Company'}
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
                                    onChange={e => setFormData({ ...formData, companyName: e.target.value })}
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
                                        onChange={e => setFormData({ ...formData, contactName: e.target.value })}
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                                    <input
                                        required
                                        type="email"
                                        className="w-full border border-gray-300 rounded-lg p-2.5 focus:ring-2 focus:ring-jam-orange"
                                        value={formData.email}
                                        onChange={e => setFormData({ ...formData, email: e.target.value })}
                                    />
                                </div>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Subscription Plan</label>
                                    <select
                                        className="w-full border border-gray-300 rounded-lg p-2.5 focus:ring-2 focus:ring-jam-orange"
                                        value={formData.plan}
                                        onChange={e => setFormData({ ...formData, plan: e.target.value as any })}
                                    >
                                        {plans.filter(p => p.isActive && p.name !== 'Reseller').map(plan => {
                                            const { formattedAmount, suffix } = getPlanPriceDetails(plan, 'monthly');
                                            return (
                                                <option key={plan.id} value={plan.name}>
                                                    {plan.name} ({formattedAmount}{suffix})
                                                </option>
                                            );
                                        })}
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Employee Count</label>
                                    <input
                                        type="number"
                                        className="w-full border border-gray-300 rounded-lg p-2.5 focus:ring-2 focus:ring-jam-orange"
                                        value={formData.employeeCount}
                                        onChange={e => setFormData({ ...formData, employeeCount: parseInt(e.target.value) })}
                                    />
                                </div>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Account Status</label>
                                <select
                                    className="w-full border border-gray-300 rounded-lg p-2.5 focus:ring-2 focus:ring-jam-orange"
                                    value={formData.status}
                                    onChange={e => setFormData({ ...formData, status: e.target.value as any })}
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
                        onClick={handleSyncPortfolio}
                        disabled={isSyncing}
                        className="bg-white border border-gray-300 text-gray-700 px-4 py-2.5 rounded-lg hover:bg-gray-50 flex items-center shadow-sm transition-all disabled:opacity-50"
                        title="Sync your client portfolio if companies you joined are missing"
                    >
                        <Icons.Refresh className={`w-4 h-4 mr-2 ${isSyncing ? 'animate-spin' : ''}`} />
                        {isSyncing ? 'Syncing...' : 'Sync Portfolio'}
                    </button>
                    <button
                        onClick={handleAddNew}
                        className="bg-jam-black text-white px-6 py-2.5 rounded-lg hover:bg-gray-800 flex items-center shadow-lg transition-transform hover:-translate-y-0.5"
                    >
                        <Icons.Plus className="w-4 h-4 mr-2" />
                        Add New Company
                    </button>
                </div>
            </div>

            {/* Tabs */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200">
                <div className="border-b border-gray-200 px-6">
                    <nav className="-mb-px flex space-x-8">
                        {[
                            { key: 'clients', label: 'Client Management' },
                            { key: 'compliance', label: 'Compliance' },
                            { key: 'financials', label: 'Revenue & Costs' }
                        ].map((tab) => (
                            <button
                                key={tab.key}
                                onClick={() => setActiveTab(tab.key as any)}
                                className={`whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm transition-colors ${activeTab === tab.key
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

                    {activeTab === 'clients' && (
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

            {/* Payment Modal */}
            {isPaymentModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-fade-in">
                    <div className="bg-white rounded-xl shadow-2xl w-full max-w-md overflow-hidden animate-scale-in">
                        <div className="p-6 border-b border-gray-100 bg-gray-50 flex justify-between items-center">
                            <h3 className="text-xl font-bold text-gray-900">Process Payment</h3>
                            <button
                                onClick={() => setIsPaymentModalOpen(false)}
                                className="text-gray-400 hover:text-gray-600"
                            >
                                <Icons.Close className="w-6 h-6" />
                            </button>
                        </div>
                        <div className="p-6 space-y-4">
                            <div className="bg-gray-50 p-4 rounded-lg border border-gray-100 mb-4">
                                <div className="flex justify-between items-center mb-1">
                                    <span className="text-gray-600">Total Amount Due</span>
                                    <span className="text-2xl font-bold text-gray-900">${platformFees.toLocaleString()}</span>
                                </div>
                                <p className="text-xs text-gray-500">Includes 20% platform commission fees</p>
                            </div>

                            <div
                                id="dimepay-mount"
                                className="w-full min-h-[400px] flex items-center justify-center bg-white rounded-lg border border-gray-100"
                            >
                                <div className="text-center text-gray-400">
                                    <Icons.Spinner className="w-8 h-8 mx-auto mb-2 animate-spin text-jam-orange" />
                                    <p className="text-sm">Loading Payment Gateway...</p>
                                </div>
                            </div>

                            <p className="text-xs text-center text-gray-400 mt-4">
                                <Icons.Lock className="w-3 h-3 inline mr-1" />
                                Payments are secure and encrypted by DimePay
                            </p>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
