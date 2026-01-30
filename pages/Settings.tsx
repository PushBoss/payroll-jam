declare const process: any;

import React, { useState, useEffect, useRef } from 'react';
import { Icons } from '../components/Icons';
import { GLMapping, IntegrationConfig, CompanySettings, TaxConfig, User, Role, Department, Designation, PricingPlan, PaymentRecord } from '../types';
import { getPlanPriceDetails } from '../utils/pricing';
import { storage } from '../services/storage';
import { auditService } from '../services/auditService';
import { checkDbConnection } from '../services/supabaseClient';
import { supabaseService } from '../services/supabaseService';
import { dimePayService } from '../services/dimePayService';
import { emailService } from '../services/emailService';
import { generateUUID } from '../utils/uuid';
import { toast } from 'sonner';
import { useAuth } from '../context/AuthContext';
import { downloadFile } from '../utils/exportHelpers';
import { useAccount } from '../hooks/useAccount';
import { getUserRoleInAccount, MemberRole } from '../services/inviteService';
import { InviteUserCard } from '../components/InviteUserCard';
import { AccountMembersCard } from '../components/AccountMembersCard';

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

    // Calculate price based on plan type - settings always monthly
    const { amount: price } = getPlanPriceDetails(plan, 'monthly');
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
                description: `${plan.name} Plan (monthly)`,
                frequency: 'monthly',
                companyId: currentUser?.companyId, // Pass companyId for webhook linking
                metadata: {
                    planId: plan.id,
                    planName: plan.name,
                    plan: plan.name,
                    planType: plan.name.toLowerCase()
                },
                onSuccess: (data) => {
                    if (isMountedRef.current) {
                        console.log('DimePay Upgrade Success:', data);
                        console.log('📦 Subscription updated:', data.subscription_id);
                        setPaymentSuccess(true);
                        setTimeout(() => { if (isMountedRef.current) onSuccess(); }, 2000);
                    }
                },
                onError: (msg) => {
                    console.error("Payment Widget Error:", msg);
                    if (isMountedRef.current) {
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

        return () => {
            isMountedRef.current = false;
            clearTimeout(timer);
            // Clean up widget container to prevent React DOM errors
            const widgetEl = document.getElementById('dimepay-upgrade-widget');
            if (widgetEl) {
                try {
                    widgetEl.innerHTML = '';
                } catch (e) {
                    console.warn('Widget cleanup warning:', e);
                }
            }
        };
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
    onUpdateDepartments = (_depts) => { },
    designations = [],
    onUpdateDesignations = (_desigs) => { },
    plans = []
}) => {
    const { user: currentUser, updateUser } = useAuth();
    const { account } = useAccount();
    const [userRole, setUserRole] = useState<MemberRole | null>(null);
    const [activeTab, setActiveTab] = useState<'company' | 'billing' | 'organization' | 'taxes' | 'integrations' | 'users'>('organization');

    // Debug: Log plans when component mounts or plans change
    useEffect(() => {
        console.log('🔍 Settings received plans:', plans.length);
        if (plans.length > 0) {
            console.log('📊 Plans data:', plans.map(p => ({
                name: p.name,
                monthly: p.priceConfig.monthly,
                type: p.priceConfig.type
            })));
        } else {
            console.warn('⚠️ Settings received EMPTY plans array!');
        }
    }, [plans]);

    // Fetch user's role in account
    useEffect(() => {
        const fetchUserRole = async () => {
            if (currentUser?.id && account?.id) {
                const role = await getUserRoleInAccount(account.id, currentUser.id);
                setUserRole(role);
            }
        };
        fetchUserRole();
    }, [currentUser?.id, account?.id]);

    // Define which tabs are visible based on role
    const isLimitedRole = userRole?.toLowerCase() === 'manager' || userRole?.toLowerCase() === 'employee';
    const visibleTabs = isLimitedRole
        ? ['company', 'billing', 'organization', 'taxes'] // Manager/Employee: no integrations or users
        : ['company', 'billing', 'organization', 'taxes', 'integrations', 'users']; // Admin/Owner: all tabs

    // User Management State
    const [users, setUsers] = useState<User[]>([]);
    const [isInviteModalOpen, setIsInviteModalOpen] = useState(false);
    const [inviteForm, setInviteForm] = useState({ name: '', email: '', role: Role.MANAGER });
    const [isSendingInvite, setIsSendingInvite] = useState(false);
    const [isSavingCompany, setIsSavingCompany] = useState(false);

    // Organization Management State
    const [newDept, setNewDept] = useState('');
    const [newDesig, setNewDesig] = useState('');
    const [newDesigDept, setNewDesigDept] = useState('');

    // DB State
    const [, setDbStatus] = useState<{ connected: boolean; message: string; details?: string } | null>(null);
    const [, setIsCheckingDb] = useState(false);

    const [upgradeTarget, setUpgradeTarget] = useState<PricingPlan | null>(null);
    const [invoices, setInvoices] = useState<PaymentRecord[]>([]);
    const [currentSubscription, setCurrentSubscription] = useState<any>(null);
    const [isLoadingBilling, setIsLoadingBilling] = useState(false);
    const [showCancelModal, setShowCancelModal] = useState(false);
    const [isCancelling, setIsCancelling] = useState(false);

    // Early return if companyData is not available
    if (!companyData) {
        return <div className="p-8 text-center">Loading company settings...</div>;
    }

    useEffect(() => {
        const loadUsers = async () => {
            if (currentUser?.companyId) {
                // Try to load from Supabase first
                const dbUsers = await supabaseService.getCompanyUsers(currentUser.companyId);
                if (dbUsers && dbUsers.length > 0) {
                    setUsers(dbUsers);
                } else {
                    // Fallback to localStorage
                    const storedUsers = storage.getCompanyUsers();
                    if (storedUsers && storedUsers.length > 0) {
                        setUsers(storedUsers);
                    }
                }
            }
        };
        loadUsers();
    }, [currentUser?.companyId]);

    useEffect(() => {
        if (activeTab === 'integrations') {
            handleCheckDb();
        }
    }, [activeTab]);

    useEffect(() => {
        const loadBillingData = async () => {
            if (!currentUser?.companyId) return;

            setIsLoadingBilling(true);

            // Load current subscription
            const subscription = await supabaseService.getSubscription(currentUser.companyId);
            setCurrentSubscription(subscription);

            // Load payment history
            const payments = await supabaseService.getPaymentHistory(currentUser.companyId);
            const formattedPayments: PaymentRecord[] = payments.map(p => ({
                id: p.invoiceNumber || p.id,
                date: new Date(p.paymentDate).toLocaleDateString(),
                amount: p.amount,
                plan: p.description || 'Subscription',
                method: (p.paymentMethod === 'card' ? 'Card' : 'Bank Transfer') as any,
                status: p.status.toUpperCase() as any,
                referenceId: p.transactionId || p.id
            }));
            setInvoices(formattedPayments);

            setIsLoadingBilling(false);
        };

        if (activeTab === 'billing') {
            loadBillingData();
        }
    }, [activeTab, currentUser?.companyId]);

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

    const handleCompanyUpdate = (newData: CompanySettings) => { onUpdateCompany(newData); };

    const handleSaveCompany = async () => {
        if (!currentUser?.companyId || !companyData) {
            toast.error('Unable to save: Missing company information');
            return;
        }

        setIsSavingCompany(true);
        try {
            await supabaseService.saveCompany(currentUser.companyId, companyData);
            auditService.log(currentUser, 'UPDATE', 'Company', 'Updated company settings');
            toast.success('Company settings saved successfully');
        } catch (error: any) {
            console.error('Error saving company:', error);
            toast.error(error.message || 'Failed to save company settings');
        } finally {
            setIsSavingCompany(false);
        }
    };

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

    const handleUpgradeSuccess = async () => {
        if (upgradeTarget && currentUser?.companyId) {
            // Note: DimePay webhook will automatically create/update subscription record
            // and payment record, so we don't need to do it here
            console.log('✅ Payment successful via DimePay - webhook will handle subscription creation');

            // Update local company data
            handleCompanyUpdate({ ...companyData, plan: upgradeTarget.name as any, subscriptionStatus: 'ACTIVE' });
            auditService.log(currentUser, 'UPDATE', 'Billing', `Upgraded plan to ${upgradeTarget.name}`);

            // Update user role if upgrading to Reseller plan
            if (upgradeTarget.name === 'Reseller' && currentUser) {
                try {
                    // Update user role in Supabase and locally
                    const updatedUser = { ...currentUser, role: Role.RESELLER };
                    await supabaseService.saveUser(updatedUser);
                    updateUser({ role: Role.RESELLER });

                    // Add their current company as a company they manage
                    // This allows them to continue managing their own company as a reseller
                    if (currentUser.companyId) {
                        try {
                            await supabaseService.saveResellerClientWithServiceRole(
                                currentUser.companyId,
                                currentUser.companyId,
                                {
                                    status: 'ACTIVE',
                                    accessLevel: 'FULL',
                                    monthlyBaseFee: 0, // No fee for their own company
                                    perEmployeeFee: 0,
                                    discountRate: 100 // 100% discount (free)
                                }
                            );
                            console.log('✅ Added own company as managed company');
                        } catch (clientError) {
                            console.warn('Could not add company as reseller client (may already exist):', clientError);
                            // Non-critical error, continue
                        }
                    }
                } catch (error) {
                    console.error('Error updating user role:', error);
                }
            }

            // Send email notification if upgrading to Reseller plan
            if (upgradeTarget.name === 'Reseller' && currentUser?.email) {
                try {
                    const emailResult = await emailService.sendResellerUpgradeNotification(
                        currentUser.email,
                        companyData?.name || 'Your Company',
                        currentUser.name || 'User'
                    );

                    if (emailResult.success && !emailResult.message?.includes('Simulation')) {
                        toast.success(`Successfully upgraded to ${upgradeTarget.name}! Check your email for details.`);
                    } else {
                        toast.success(`Successfully switched to ${upgradeTarget.name}!`);
                    }
                } catch (error) {
                    console.error('Email notification failed:', error);
                    toast.success(`Successfully switched to ${upgradeTarget.name}!`);
                }

                // Reload page to ensure reseller dashboard loads properly
                setTimeout(() => {
                    window.location.href = '/?page=reseller-dashboard';
                }, 1500);
            } else {
                toast.success(`Successfully switched to ${upgradeTarget.name}!`);
            }

            setUpgradeTarget(null);

            // Reload billing data
            const payments = await supabaseService.getPaymentHistory(currentUser.companyId);
            const formattedPayments: PaymentRecord[] = payments.map(p => ({
                id: p.invoiceNumber || p.id,
                date: new Date(p.paymentDate).toLocaleDateString(),
                amount: p.amount,
                plan: p.description || 'Subscription',
                method: (p.paymentMethod === 'card' ? 'Card' : 'Bank Transfer') as any,
                status: p.status.toUpperCase() as any,
                referenceId: p.transactionId || p.id
            }));
            setInvoices(formattedPayments);
        }
    };

    const handleDownloadInvoice = (inv: PaymentRecord) => {
        const content = `TAX INVOICE\n\nInvoice ID: ${inv.id}\nDate: ${inv.date}\nBilled To: ${companyData?.name || 'N/A'}\nAmount: JMD $${inv.amount}`;
        downloadFile(`Invoice_${inv.id}.txt`, content, 'text/plain');
    };

    const handleInviteSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        // Validate email
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(inviteForm.email)) {
            toast.error("Please enter a valid email address.");
            return;
        }

        // Check user limit - Limited to 5 seats across ALL tiers as requested
        const maxUsers = 5;

        // Fetch official member count from Supabase to be consistent with the UI
        let currentMemberCount = 0;
        try {
            const adminClient = await supabaseService.getAdminClient();
            if (!adminClient) throw new Error('Admin client unavailable');

            const { count } = await adminClient
                .from('account_members')
                .select('*', { count: 'exact', head: true })
                .eq('account_id', currentUser?.companyId);

            // Check if OWNER is in account_members. If not, add 1 for the owner.
            const { data: owner } = await adminClient
                .from('account_members')
                .select('id')
                .eq('account_id', currentUser?.companyId)
                .eq('role', 'OWNER')
                .maybeSingle();

            currentMemberCount = (count || 0) + (owner ? 0 : 1);
        } catch (e) {
            console.warn('Fallback to local user count for limit check', e);
            const filteredUsers = users.filter(u => u.id !== currentUser?.id && u.email !== currentUser?.email);
            currentMemberCount = filteredUsers.length + 1;
        }

        if (currentMemberCount >= maxUsers) {
            toast.error(`Seat limit reached. You have used all ${maxUsers} available seats (including the Owner). Remove an existing member to invite a new one.`);
            return;
        }

        setIsSendingInvite(true);

        // Generate invite token and link
        const onboardingToken = generateUUID();
        const inviteLink = `${window.location.origin}/?page=signup&token=${onboardingToken}&email=${encodeURIComponent(inviteForm.email)}`;

        const newUser: User = {
            id: `u-${Date.now()}`,
            name: inviteForm.name,
            email: inviteForm.email,
            role: inviteForm.role,
            companyId: currentUser?.companyId,
            isOnboarded: false,
            onboardingToken: onboardingToken
        };

        // Send invitation email
        const emailResult = await emailService.sendInvite(
            inviteForm.email,
            inviteForm.name.split(' ')[0] || inviteForm.name,
            inviteLink
        );

        if (!emailResult.success) {
            toast.error('Failed to send invitation email. User not created.');
            setIsSendingInvite(false);
            return;
        }

        // Save to Supabase if available
        if (currentUser?.companyId) {
            try {
                await supabaseService.saveUser(newUser);
            } catch (error) {
                console.error("Error saving user to Supabase:", error);
                toast.error("Failed to save user to database.");
                setIsSendingInvite(false);
                return;
            }
        }

        const updatedUsers = [...users, newUser];
        setUsers(updatedUsers);
        storage.saveCompanyUsers(updatedUsers);
        auditService.log(currentUser, 'CREATE', 'User', `Invited user ${newUser.email}`);
        setIsInviteModalOpen(false);
        setInviteForm({ name: '', email: '', role: Role.MANAGER });

        if (!emailResult.message?.includes('Simulation')) {
            toast.success("Invitation email sent successfully!");
        } else {
            toast.info("User invited (email simulation mode - check console for link)");
        }

        setIsSendingInvite(false);
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

    const handleCancelSubscription = async () => {
        if (!currentUser?.companyId || !currentSubscription?.dimepaySubscriptionId) {
            toast.error('Unable to cancel subscription. Missing subscription information.');
            return;
        }

        setIsCancelling(true);

        try {
            const response = await fetch('/api/cancel-subscription', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    subscription_id: currentSubscription.dimepaySubscriptionId,
                    company_id: currentUser.companyId
                })
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || 'Failed to cancel subscription');
            }

            toast.success('Subscription cancelled. You\'ll retain access until the end of your billing period.');

            // Update local state
            handleCompanyUpdate({
                ...companyData,
                plan: 'Free' as any,
                subscriptionStatus: 'SUSPENDED'
            });

            setShowCancelModal(false);

            // Reload billing data after a delay
            setTimeout(async () => {
                if (currentUser?.companyId) {
                    const payments = await supabaseService.getPaymentHistory(currentUser.companyId);
                    const formattedPayments: PaymentRecord[] = payments.map(p => ({
                        id: p.invoiceNumber || p.id,
                        date: new Date(p.paymentDate).toLocaleDateString(),
                        amount: p.amount,
                        plan: p.description || 'Subscription',
                        method: (p.paymentMethod === 'card' ? 'Card' : 'Bank Transfer') as any,
                        status: p.status.toUpperCase() as any,
                        referenceId: p.transactionId || p.id
                    }));
                    setInvoices(formattedPayments);
                }
            }, 1000);

        } catch (error: any) {
            console.error('Error cancelling subscription:', error);
            toast.error(error.message || 'Failed to cancel subscription. Please try again.');
        } finally {
            setIsCancelling(false);
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

            {/* Cancel Subscription Confirmation Modal */}
            {showCancelModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
                    <div className="bg-white rounded-xl w-full max-w-md p-6 animate-fade-in">
                        <div className="flex items-start mb-4">
                            <div className="flex-shrink-0">
                                <Icons.Alert className="w-10 h-10 text-red-500" />
                            </div>
                            <div className="ml-4">
                                <h3 className="text-xl font-bold mb-2">Cancel Subscription?</h3>
                                <p className="text-sm text-gray-600 mb-4">
                                    Are you sure you want to cancel your <strong>{currentSubscription?.planName || companyData?.plan}</strong> subscription?
                                </p>
                                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 mb-4">
                                    <p className="text-xs text-yellow-800">
                                        <strong>What happens next:</strong>
                                    </p>
                                    <ul className="text-xs text-yellow-800 mt-2 space-y-1 list-disc list-inside">
                                        <li>You'll retain access until {currentSubscription?.nextBillingDate ? new Date(currentSubscription.nextBillingDate).toLocaleDateString() : 'the end of your billing period'}</li>
                                        <li>No further charges will be made</li>
                                        <li>Your account will be downgraded to the Free plan</li>
                                        <li>You can resubscribe anytime</li>
                                    </ul>
                                </div>
                            </div>
                        </div>
                        <div className="flex justify-end space-x-2">
                            <button
                                type="button"
                                onClick={() => setShowCancelModal(false)}
                                className="px-4 py-2 text-gray-500 hover:text-gray-700"
                                disabled={isCancelling}
                            >
                                Keep Subscription
                            </button>
                            <button
                                onClick={handleCancelSubscription}
                                className="px-4 py-2 bg-red-600 text-white rounded font-bold hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center"
                                disabled={isCancelling}
                            >
                                {isCancelling ? (
                                    <>
                                        <Icons.Refresh className="w-4 h-4 mr-2 animate-spin" />
                                        Cancelling...
                                    </>
                                ) : (
                                    'Yes, Cancel Subscription'
                                )}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {isInviteModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
                    <div className="bg-white rounded-xl w-full max-w-md p-6 animate-fade-in">
                        <h3 className="text-xl font-bold mb-4">Invite User</h3>
                        <form onSubmit={handleInviteSubmit} className="space-y-4">
                            <input required placeholder="Full Name" className="w-full border p-2 rounded" value={inviteForm.name} onChange={e => setInviteForm({ ...inviteForm, name: e.target.value })} />
                            <input required type="email" placeholder="Email" className="w-full border p-2 rounded" value={inviteForm.email} onChange={e => setInviteForm({ ...inviteForm, email: e.target.value })} />
                            <select className="w-full border p-2 rounded" value={inviteForm.role} onChange={e => setInviteForm({ ...inviteForm, role: e.target.value as Role })}>
                                <option value={Role.ADMIN}>Admin</option>
                                <option value={Role.MANAGER}>Manager</option>
                                <option value={Role.EMPLOYEE}>Team member (alias)</option>
                                <option value={Role.RESELLER}>Reseller</option>
                            </select>
                            <div className="flex justify-end space-x-2">
                                <button type="button" onClick={() => setIsInviteModalOpen(false)} className="px-4 py-2 text-gray-500" disabled={isSendingInvite}>Cancel</button>
                                <button type="submit" className="px-4 py-2 bg-jam-black text-white rounded font-bold disabled:opacity-50 disabled:cursor-not-allowed flex items-center" disabled={isSendingInvite}>
                                    {isSendingInvite ? (
                                        <>
                                            <Icons.Refresh className="w-4 h-4 mr-2 animate-spin" />
                                            Sending...
                                        </>
                                    ) : (
                                        'Send Invite'
                                    )}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            <div className="flex justify-between items-center">
                <h2 className="text-3xl font-bold text-gray-900">Settings</h2>

            </div>

            <div className="border-b border-gray-200">
                <nav className="-mb-px flex space-x-8 overflow-x-auto no-scrollbar">
                    {visibleTabs.map((tab) => (
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
                            <h3 className="text-3xl font-bold mt-2">{currentSubscription?.planName || companyData?.plan || 'Free'}</h3>
                            <div className="mt-3 flex items-center space-x-4 text-sm text-gray-300">
                                <span>Status: <span className={`font-bold ${currentSubscription?.status === 'active' ? 'text-green-400' : 'text-yellow-400'}`}>{currentSubscription?.status?.toUpperCase() || companyData?.subscriptionStatus || 'ACTIVE'}</span></span>
                                {currentSubscription && <span>• Billing: {currentSubscription.billingFrequency}</span>}
                                {currentSubscription?.nextBillingDate && <span>• Next Invoice: {new Date(currentSubscription.nextBillingDate).toLocaleDateString()}</span>}
                            </div>
                            {currentSubscription && currentSubscription.amount > 0 && (
                                <div className="mt-2 text-sm text-gray-400">
                                    ${currentSubscription.amount.toLocaleString()} {currentSubscription.currency} / {currentSubscription.billingFrequency}
                                </div>
                            )}
                        </div>
                        <div className="mt-4 md:mt-0 flex flex-col space-y-2">
                            {companyData?.plan !== 'Pro' && companyData?.plan !== 'Professional' && (
                                <button
                                    onClick={() => {
                                        // Show all paid plans except current plan (consistent with cards below)
                                        const currentPlan = companyData?.plan || 'Free';
                                        const availablePlans = plans.filter(p => {
                                            // Don't show current plan
                                            if (p.name === currentPlan) return false;
                                            // Don't show Free plan (no one upgrades to Free)
                                            if (p.priceConfig.type === 'free') return false;
                                            // Show all other paid plans (Starter, Pro, Reseller, etc.)
                                            return p.isActive;
                                        });

                                        if (availablePlans.length === 0) {
                                            toast.info('No upgrade options available');
                                            return;
                                        }

                                        if (availablePlans.length === 1) {
                                            handleUpgradeClick(availablePlans[0].name);
                                        } else {
                                            // Show plan selector with all options
                                            const planNames = availablePlans.map(p => `${p.name} ($${p.priceConfig.monthly?.toLocaleString() || p.priceConfig.baseFee?.toLocaleString()}/mo)`).join('\n');
                                            const choice = window.prompt(`Choose a plan to upgrade:\n\n${planNames}\n\nEnter plan name:`);
                                            if (choice && availablePlans.find(p => p.name.toLowerCase() === choice.toLowerCase())) {
                                                const selectedPlan = availablePlans.find(p => p.name.toLowerCase() === choice.toLowerCase());
                                                if (selectedPlan) {
                                                    handleUpgradeClick(selectedPlan.name);
                                                }
                                            }
                                        }
                                    }}
                                    className="bg-jam-orange text-jam-black px-6 py-2.5 rounded-lg font-bold text-sm hover:bg-yellow-500 transition-colors"
                                >
                                    Upgrade Plan
                                </button>
                            )}
                            {currentSubscription && currentSubscription.status === 'active' && companyData?.plan !== 'Free' && (
                                <button
                                    onClick={() => setShowCancelModal(true)}
                                    className="bg-transparent border border-gray-500 text-gray-300 px-6 py-2.5 rounded-lg font-bold text-sm hover:bg-gray-800 hover:border-gray-400 transition-colors"
                                >
                                    Cancel Subscription
                                </button>
                            )}
                        </div>
                    </div>

                    {/* Plan Selection Section */}
                    {plans.length > 0 && (
                        <div className="bg-white p-6 rounded-xl border border-gray-200">
                            <h3 className="text-lg font-bold mb-4">Available Plans</h3>
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                {(() => {
                                    const currentPlan = companyData?.plan || 'Free';
                                    // Show all active plans except current plan and Free plan
                                    const filtered = plans.filter(p => {
                                        // Don't show current plan
                                        if (p.name === currentPlan) return false;
                                        // Don't show Free plan (no one upgrades to Free)
                                        if (p.priceConfig.type === 'free') return false;
                                        // Show all other active paid plans
                                        return p.isActive;
                                    });
                                    console.log('🎯 Filtered plans for display (current:', currentPlan, '):', filtered.map(p => ({ name: p.name, monthly: p.priceConfig.monthly, baseFee: p.priceConfig.baseFee })));
                                    return filtered.map(plan => {
                                        const { formattedAmount, suffix } = getPlanPriceDetails(plan, 'monthly');
                                        return (
                                            <div key={plan.id} className="border border-gray-200 rounded-lg p-4 hover:border-jam-orange transition-colors">
                                                <h4 className="font-bold text-lg mb-2">{plan.name}</h4>
                                                <div className="text-2xl font-bold mb-1">
                                                    {formattedAmount}
                                                    <span className="text-sm text-gray-500 font-normal">{suffix}</span>
                                                </div>
                                                <div className="text-xs font-bold text-jam-orange mb-2 uppercase tracking-wider">
                                                    {plan.limit.toLowerCase().includes('employee') ? plan.limit : `${plan.limit} Employees`}
                                                </div>
                                                <p className="text-xs text-gray-500 mb-3">{plan.description}</p>
                                                <ul className="text-sm text-gray-600 mb-4 space-y-1">
                                                    {plan.features.slice(0, 3).map((feature, idx) => (
                                                        <li key={idx}>• {feature}</li>
                                                    ))}
                                                </ul>
                                                <button
                                                    onClick={() => handleUpgradeClick(plan.name)}
                                                    className="w-full bg-jam-black text-white py-2 rounded font-semibold hover:bg-gray-800 transition-colors"
                                                >
                                                    Upgrade to {plan.name}
                                                </button>
                                            </div>
                                        );
                                    });
                                })()}
                            </div>
                        </div>
                    )}
                    <div className="bg-white p-6 rounded-xl border border-gray-200">
                        <h3 className="text-lg font-bold mb-4">Payment History</h3>
                        {isLoadingBilling ? (
                            <div className="flex items-center justify-center py-8">
                                <Icons.Refresh className="w-6 h-6 animate-spin text-jam-orange" />
                                <span className="ml-2 text-gray-500">Loading payment history...</span>
                            </div>
                        ) : invoices.length === 0 ? <p className="text-gray-500 text-sm">No payment history available.</p> : (
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
                                <h3 className="text-lg font-bold">Statutory Rates (2026)</h3>
                                <p className="text-xs text-gray-500">Core global policies are applied by default. Edit rates below to set local company overrides.</p>
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
                                <p className="text-[10px] text-gray-400 mt-1">Default: JMD 1,700,096 (2026)</p>
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
                    <div className="flex justify-between items-center mb-6">
                        <h3 className="text-lg font-bold">Company Settings</h3>
                        <button
                            onClick={handleSaveCompany}
                            disabled={isSavingCompany}
                            className="bg-jam-orange text-jam-black px-6 py-2 rounded-lg font-bold hover:bg-yellow-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center"
                        >
                            {isSavingCompany ? (
                                <>
                                    <Icons.Refresh className="w-4 h-4 mr-2 animate-spin" />
                                    Saving...
                                </>
                            ) : (
                                <>
                                    <Icons.Save className="w-4 h-4 mr-2" />
                                    Save Changes
                                </>
                            )}
                        </button>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                        <div className="space-y-4">
                            <h4 className="font-semibold border-b pb-2">Legal Details</h4>
                            <div className="space-y-2">
                                <label className="block text-xs font-bold text-gray-500 uppercase">Company Name</label>
                                <input type="text" value={companyData.name} onChange={e => handleCompanyUpdate({ ...companyData, name: e.target.value })} className="w-full border rounded p-2" />
                            </div>
                            <div className="space-y-2">
                                <label className="block text-xs font-bold text-gray-500 uppercase">TRN</label>
                                <input type="text" value={companyData.trn} onChange={e => handleCompanyUpdate({ ...companyData, trn: e.target.value })} className="w-full border rounded p-2" />
                            </div>
                            <div className="space-y-2">
                                <label className="block text-xs font-bold text-gray-500 uppercase">Address</label>
                                <textarea value={companyData.address} onChange={e => handleCompanyUpdate({ ...companyData, address: e.target.value })} className="w-full border rounded p-2" />
                            </div>
                            <div className="space-y-2">
                                <label className="block text-xs font-bold text-gray-500 uppercase">Phone</label>
                                <input type="text" value={companyData.phone} onChange={e => handleCompanyUpdate({ ...companyData, phone: e.target.value })} className="w-full border rounded p-2" />
                            </div>
                        </div>
                        <div className="space-y-4">
                            <h4 className="font-semibold border-b pb-2">Payroll Configuration</h4>
                            <div className="space-y-2">
                                <label className="block text-xs font-bold text-gray-500 uppercase">Default Pay Frequency</label>
                                <select value={companyData.payFrequency} onChange={e => handleCompanyUpdate({ ...companyData, payFrequency: e.target.value })} className="w-full border rounded p-2">
                                    <option value="Monthly">Monthly</option>
                                    <option value="Fortnightly">Fortnightly</option>
                                    <option value="Weekly">Weekly</option>
                                </select>
                            </div>
                            <div className="space-y-2">
                                <label className="block text-xs font-bold text-gray-500 uppercase">Company Bank</label>
                                <select value={companyData.bankName} onChange={e => handleCompanyUpdate({ ...companyData, bankName: e.target.value })} className="w-full border rounded p-2"><option value="NCB">NCB</option><option value="BNS">BNS</option></select>
                            </div>
                            <div className="space-y-2">
                                <label className="block text-xs font-bold text-gray-500 uppercase">Account Number</label>
                                <input type="text" value={companyData.accountNumber} onChange={e => handleCompanyUpdate({ ...companyData, accountNumber: e.target.value })} className="w-full border rounded p-2" />
                            </div>
                            <div className="space-y-2">
                                <label className="block text-xs font-bold text-gray-500 uppercase">Branch Code</label>
                                <input type="text" value={companyData.branchCode} onChange={e => handleCompanyUpdate({ ...companyData, branchCode: e.target.value })} className="w-full border rounded p-2" />
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
                            <button onClick={handleAddDepartment} className="bg-jam-black text-white px-3 rounded"><Icons.Plus className="w-4 h-4" /></button>
                        </div>
                        <ul className="space-y-2">
                            {departments.map(d => (
                                <li key={d.id} className="flex justify-between items-center bg-gray-50 p-2 rounded">
                                    <span>{d.name}</span>
                                    <button onClick={() => handleDeleteDepartment(d.id)} className="text-red-400"><Icons.Trash className="w-4 h-4" /></button>
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
                                    <button onClick={() => handleDeleteDesignation(d.id)} className="text-red-400"><Icons.Trash className="w-4 h-4" /></button>
                                </li>
                            ))}
                        </ul>
                    </div>
                </div>
            )}

            {activeTab === 'integrations' && (
                <div className="space-y-6 animate-fade-in">
                    {/* Restored Accounting Mapping UI */}
                    <div className="bg-white p-6 rounded-xl border border-gray-200">
                        <div className="flex justify-between items-center mb-6">
                            <div>
                                <h3 className="font-bold">Accounting Integration</h3>
                                <p className="text-sm text-gray-500">Map payroll items to your General Ledger (QuickBooks/Xero).</p>
                            </div>
                            <select
                                value={integrationConfig.provider}
                                onChange={(e) => onUpdateIntegration({ ...integrationConfig, provider: e.target.value as any })}
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

            {activeTab === 'users' && (() => {
                // Use account.id if available, fallback to currentUser.id for invitations
                // The account record will be created via trigger or manually if needed
                const accountId = account?.id || currentUser?.id;

                if (!accountId) {
                    return (
                        <div className="bg-white p-6 rounded-xl border border-gray-200 animate-fade-in">
                            <div className="py-12 text-center">
                                <p className="text-gray-500">Loading...</p>
                            </div>
                        </div>
                    );
                }

                return (
                    <div className="space-y-6 animate-fade-in">
                        <InviteUserCard
                            accountId={accountId}
                            onInviteSent={() => {
                                // Refresh members list
                                toast.success('Invitation sent successfully!');
                            }}
                        />
                        <AccountMembersCard
                            accountId={accountId}
                            isAdmin={['admin', 'owner'].includes((userRole || '').toLowerCase())}
                        />
                    </div>
                );
            })()}
        </div>
    );
};