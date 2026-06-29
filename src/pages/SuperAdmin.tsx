declare const process: any;

import React, { useRef, useState, useEffect } from 'react';
import { Icons } from '../components/Icons';
import { PricingPlan, ResellerClient, GlobalConfig, User, Role, AuditLogEntry, TaxConfig, BillingGift } from '../core/types';
import { XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, AreaChart, Area, PieChart, Pie, Cell, ReferenceLine, BarChart, Bar } from 'recharts';
import { storage } from '../services/storage';
import { auditService } from '../core/auditService';
import { BillingService } from '../services/BillingService';
import { checkDbConnection, testManualConnection, saveManualConfig, isUsingLocalOverrides, supabase } from '../services/supabaseClient';
import { CompanyService } from '../services/CompanyService';
import { toast } from 'sonner';
import { UserService } from '../services/UserService';
import { getPlanPriceDetails } from '../utils/pricing';
import { DEFAULT_ORG_TAX_CONFIG, TaxConfigCard } from '../features/employees/TaxConfigCard';

interface SuperAdminProps {
    plans: PricingPlan[];
    onUpdatePlans: (updatedPlans: PricingPlan[]) => void;
    onImpersonate: (tenant: ResellerClient) => void;
    initialTab?: string;
}

const getFunctionErrorMessage = async (error: any, fallback = 'Edge function request failed') => {
    const context = error?.context;
    if (context && typeof context.clone === 'function') {
        try {
            const body = await context.clone().json();
            return body?.error || body?.message || error?.message || fallback;
        } catch {
            // Fall through to the SDK message.
        }
    }

    return error?.message || fallback;
};

interface PayingClient {
    id: string;
    companyName: string;
    adminName: string;
    adminEmail: string;
    adminPhone?: string;
    plan: ResellerClient['plan'];
    status: string;
    subscriptionStatus?: string | null;
    billingGift?: BillingGift;
    activeEmployees: number;
    mrr: number;
    arr: number;
    currency?: string;
    paymentMethod: string;
    dimeSubscriptionId?: string | null;
    accessUntil?: string | null;
    lastPaymentDate?: string | null;
    lastPaymentAmount?: number | null;
    lastPaymentStatus?: string | null;
    latestLedgerState?: string | null;
    latestLedgerEventType?: string | null;
    risk: 'ok' | 'attention' | 'critical';
    isTestCompany?: boolean;
    createdAt?: string;
    accountCreatedAt?: string | null;
    lastLoginAt?: string | null;
}

type ClientActivitySort = 'created_desc' | 'created_asc' | 'last_login_desc' | 'last_login_asc';
type GrowthTrendRange = '1M' | '6M' | '1Y';
type ManualPaymentAction = 'FREE_GIFT' | 'BANK_TRANSFER' | 'CARD_PAYMENT' | 'CASH';
type ManualPaymentReason = 'STANDARD_PAYMENT' | 'DIFFICULTY_UPGRADING' | 'GOODWILL' | 'TEST_ACCOUNT' | 'OTHER';
type ManualPaymentPlan = ResellerClient['plan'];

const MANUAL_PAYMENT_ACTION_LABELS: Record<ManualPaymentAction, string> = {
    FREE_GIFT: 'Free Gift',
    BANK_TRANSFER: 'Bank Transfer',
    CARD_PAYMENT: 'Card Payment',
    CASH: 'Cash',
};

const MANUAL_PAYMENT_REASON_LABELS: Record<ManualPaymentReason, string> = {
    STANDARD_PAYMENT: 'Standard Payment',
    DIFFICULTY_UPGRADING: 'Difficulty Upgrading',
    GOODWILL: 'Goodwill / Retention',
    TEST_ACCOUNT: 'Test Account',
    OTHER: 'Other',
};

const LEGACY_MANUAL_PAYMENT_LABELS: Record<string, string> = {
    FREE_GIFT: 'Free Gift',
    BANK_TRANSFER: 'Bank Transfer',
    CARD_PAYMENT: 'Card Payment',
    CASH: 'Cash',
    DIFFICULTY_UPGRADING: 'Difficulty Upgrading',
};

const normalizeManualPaymentPlan = (plan: ResellerClient['plan']): ManualPaymentPlan => plan;

const getManualPaymentAccessLabel = (billingGift?: BillingGift | null) => {
    if (!billingGift) return 'Manual access';
    if (billingGift.manualPaymentLabel) return billingGift.manualPaymentLabel;
    if (billingGift.manualPaymentType) return MANUAL_PAYMENT_ACTION_LABELS[billingGift.manualPaymentType];
    if (billingGift.reason) return LEGACY_MANUAL_PAYMENT_LABELS[billingGift.reason] || 'Manual access';
    return 'Manual access';
};

interface GrowthAnalytics {
    monthlySignupGoal: number;
    currentMonthSignups: number;
    acquisitionBreakdown: { source: string; count: number }[];
    signupTrend: { month: string; signups: number }[];
    activationFunnel: { step: string; count: number; rate: number }[];
}

interface EmailDraft {
    to: string;
    subject: string;
    body: string;
    companyName: string;
}

const DEFAULT_BANK_TRANSFER_CONFIG: NonNullable<GlobalConfig['bankTransfer']> = {
    enabled: true,
    bankName: 'NCB (National Commercial Bank)',
    accountName: 'Balance Investments Limited',
    accountNumber: '404286331',
    accountType: 'Savings Account',
    branch: 'UWI Branch',
    instructions: 'After making the deposit, your account will be activated within 24 hours. Use the signup email as the payment reference.'
};

const DEFAULT_PAYMENT_CONFIG: GlobalConfig = {
    dataSource: 'SUPABASE', // Always use Supabase - no mock data
    currency: 'JMD',
    taxConfig: DEFAULT_ORG_TAX_CONFIG,
    supportWidget: {
        enabled: false,
        whatsappUrl: 'https://wa.me/18765550123',
        position: 'bottom-right',
        customCss: ''
    },
    bankTransfer: DEFAULT_BANK_TRANSFER_CONFIG,
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
            apiKey: '',
            secretKey: '',
            merchantId: '',
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
    monthlySignupGoal: 10,
    maintenanceMode: false,
    systemBanner: {
        active: false,
        message: `System Maintenance Scheduled for 2 AM.`,
        type: 'INFO'
    }
};

const withGlobalConfigDefaults = (config?: GlobalConfig | null): GlobalConfig => ({
    ...DEFAULT_PAYMENT_CONFIG,
    ...(config || {}),
    supportWidget: {
        ...DEFAULT_PAYMENT_CONFIG.supportWidget!,
        ...(config?.supportWidget || {}),
    },
    bankTransfer: {
        ...DEFAULT_BANK_TRANSFER_CONFIG,
        ...(config?.bankTransfer || {}),
        bankName: config?.bankTransfer?.bankName || DEFAULT_BANK_TRANSFER_CONFIG.bankName,
        accountName: config?.bankTransfer?.accountName || DEFAULT_BANK_TRANSFER_CONFIG.accountName,
        accountNumber: config?.bankTransfer?.accountNumber || DEFAULT_BANK_TRANSFER_CONFIG.accountNumber,
        accountType: config?.bankTransfer?.accountType || DEFAULT_BANK_TRANSFER_CONFIG.accountType,
        branch: config?.bankTransfer?.branch || DEFAULT_BANK_TRANSFER_CONFIG.branch,
        instructions: config?.bankTransfer?.instructions || DEFAULT_BANK_TRANSFER_CONFIG.instructions,
    },
});

const getRuntimeDimePayEnvironment = (): 'sandbox' | 'production' => {
    if (typeof window === 'undefined') return 'sandbox';
    const hostname = window.location.hostname;
    return hostname === 'www.payrolljam.com' || hostname === 'payrolljam.com'
        ? 'production'
        : 'sandbox';
};

const getDimePayEnvClientKey = (environment: 'sandbox' | 'production') => (
    environment === 'production'
        ? import.meta.env.VITE_DIMEPAY_CLIENT_ID_PROD || import.meta.env.VITE_DIMEPAY_API_KEY_PROD || import.meta.env.VITE_DIMEPAY_API_KEY
        : import.meta.env.VITE_DIMEPAY_CLIENT_ID_SANDBOX || import.meta.env.VITE_DIMEPAY_API_KEY_SANDBOX || import.meta.env.VITE_DIMEPAY_API_KEY
);

const getDimePayStatus = (config: GlobalConfig) => {
    const environment = getRuntimeDimePayEnvironment();
    const dimepay = config.dimepay || DEFAULT_PAYMENT_CONFIG.dimepay;
    const activeCredentials = environment === 'production' ? dimepay.production : dimepay.sandbox;
    const hasEnvClientKey = Boolean(getDimePayEnvClientKey(environment));
    const hasStoredClientKey = Boolean(activeCredentials?.apiKey);
    const isRuntimeConfigured = hasEnvClientKey || hasStoredClientKey;
    const envLabel = environment === 'production' ? 'Production' : 'Sandbox';

    if (isRuntimeConfigured) {
        return {
            borderClass: 'bg-green-50 border-green-200',
            iconClass: 'bg-green-100 text-green-600',
            badgeClass: 'bg-green-100 text-green-700',
            icon: 'check' as const,
            label: 'Active',
            description: hasEnvClientKey
                ? `${envLabel} - Configured via environment`
                : `${envLabel} - Configured in platform settings`
        };
    }

    if (dimepay?.enabled === false) {
        return {
            borderClass: 'bg-gray-50 border-gray-200',
            iconClass: 'bg-gray-100 text-gray-400',
            badgeClass: 'bg-gray-100 text-gray-600',
            icon: 'close' as const,
            label: 'Inactive',
            description: 'No DimePay client key configured'
        };
    }

    return {
        borderClass: 'bg-yellow-50 border-yellow-200',
        iconClass: 'bg-yellow-100 text-yellow-600',
        badgeClass: 'bg-yellow-100 text-yellow-700',
        icon: 'alert' as const,
        label: 'Incomplete',
        description: `${envLabel} - Missing client key`
    };
};

const MOCK_REVENUE_DATA = [
    { name: 'Aug', revenue: 55000 },
    { name: 'Sep', revenue: 62000 },
    { name: 'Oct', revenue: 71000 },
    { name: 'Nov', revenue: 80500 },
    { name: 'Dec', revenue: 88000 },
    { name: 'Jan', revenue: 90500 },
];

const ACQUISITION_COLORS = ['#F97316', '#111827', '#10B981', '#6366F1'];

const formatGiftedUntil = (value?: string) => {
    if (!value) return null;

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return null;

    return date.toLocaleDateString(undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
    });
};

const formatActivityDate = (value?: string | null, fallback = 'Never') => {
    if (!value) return fallback;

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return fallback;

    return date.toLocaleString(undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
    });
};

const toActivityTime = (value?: string | null) => {
    if (!value) return 0;
    const time = new Date(value).getTime();
    return Number.isNaN(time) ? 0 : time;
};

const getSortedByClientActivity = <T extends { createdAt?: string | null; accountCreatedAt?: string | null; lastLoginAt?: string | null }>(
    records: T[],
    sort: ClientActivitySort
) => {
    return [...records].sort((a, b) => {
        const createdA = toActivityTime(a.accountCreatedAt || a.createdAt);
        const createdB = toActivityTime(b.accountCreatedAt || b.createdAt);
        const loginA = toActivityTime(a.lastLoginAt);
        const loginB = toActivityTime(b.lastLoginAt);

        switch (sort) {
            case 'created_asc':
                return createdA - createdB;
            case 'last_login_desc':
                return loginB - loginA;
            case 'last_login_asc':
                return loginA - loginB;
            case 'created_desc':
            default:
                return createdB - createdA;
        }
    });
};

const isActiveBillingStatus = (status?: string) => {
    const normalized = String(status || '').trim().toLowerCase();
    return normalized === 'active' || normalized === 'trialing';
};

const isRevenueActiveClient = (client: PayingClient) => {
    if (client.isTestCompany) return false;
    const companyStatus = String(client.status || '').toUpperCase();
    const subscriptionStatus = String(client.subscriptionStatus || '').toLowerCase();

    if (companyStatus === 'SUSPENDED') return false;
    if (subscriptionStatus && ['cancelled', 'canceled', 'failed', 'past_due'].includes(subscriptionStatus)) return false;

    return true;
};

const getMonthKey = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;

const getMonthEnd = (year: number, monthIndex: number) => new Date(year, monthIndex + 1, 0, 23, 59, 59, 999);

export const SuperAdmin: React.FC<SuperAdminProps> = ({ plans, onUpdatePlans, onImpersonate, initialTab }) => {
    const [activeTab, setActiveTab] = useState<'overview' | 'tenants' | 'users' | 'plans' | 'logs' | 'settings' | 'health' | 'billing' | 'pending-payments' | 'paying-clients' | 'releases' | 'broadcasts'>('overview');
    const hasLoadedGlobalConfigRef = useRef(false);

    // Payment Settings State
    const [paymentConfig, setPaymentConfig] = useState<GlobalConfig>(() => withGlobalConfigDefaults(storage.getGlobalConfig()));

    // Sync with prop if provided
    useEffect(() => {
        if (initialTab) {
            setActiveTab(initialTab as any);
        }
    }, [initialTab]);

    // Tenant State - Always fetch from Supabase via Edge Function
    const [tenants, setTenants] = useState<ResellerClient[]>([]);
    const [tenantPage, setTenantPage] = useState(0);
    const [tenantTotal, setTenantTotal] = useState(0);
    const TENANTS_PER_PAGE = 20;

    const [isLoadingTenants, setIsLoadingTenants] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [filterStatus, setFilterStatus] = useState<'ALL' | 'ACTIVE' | 'SUSPENDED'>('ALL');
    const [tenantActivitySort, setTenantActivitySort] = useState<ClientActivitySort>('created_desc');
    const [giftingTenant, setGiftingTenant] = useState<ResellerClient | null>(null);
    const [giftMonths, setGiftMonths] = useState(1);
    const [giftNote, setGiftNote] = useState('');
    const [manualPaymentAction, setManualPaymentAction] = useState<ManualPaymentAction>('FREE_GIFT');
    const [manualPaymentReason, setManualPaymentReason] = useState<ManualPaymentReason>('STANDARD_PAYMENT');
    const [manualPaymentPlan, setManualPaymentPlan] = useState<ManualPaymentPlan>('Starter');
    const [isGiftingAccess, setIsGiftingAccess] = useState(false);

    // Super Admin User State
    const [admins, setAdmins] = useState<User[]>(() => {
        const existing = storage.getSuperAdmins();
        return existing || [{ id: 'u-super', name: 'System Operator', email: 'super@jam.com', role: Role.SUPER_ADMIN, isOnboarded: true }];
    });
    const [isAddAdminOpen, setIsAddAdminOpen] = useState(false);
    const [newAdminForm, setNewAdminForm] = useState({ name: '', email: '', password: '' });

    // Logs State
    const [logs, setLogs] = useState<AuditLogEntry[]>([]);

    // Releases State
    const [vercelDeployments, setVercelDeployments] = useState<any[]>([]);
    const [currentVersion, setCurrentVersion] = useState('1.0.0');
    const [latestReleaseNotes, setLatestReleaseNotes] = useState('');
    const [isLoadingReleases, setIsLoadingReleases] = useState(false);
    const [selectedDeployment, setSelectedDeployment] = useState<any | null>(null);
    const [targetVersion, setTargetVersion] = useState('');
    const [releaseNotesInput, setReleaseNotesInput] = useState('');
    const [productionDomain, setProductionDomain] = useState('payroll-jam.com');
    const [skipAlias, setSkipAlias] = useState(true);
    const [isPromoting, setIsPromoting] = useState(false);

    // Broadcasts State
    const [broadcasts, setBroadcasts] = useState<any[]>([]);
    const [broadcastForm, setBroadcastForm] = useState({ subject: '', audience: 'ALL_USERS', bodyMarkdown: '' });
    const [isSendingBroadcast, setIsSendingBroadcast] = useState(false);

    // Billing State
    const [revenueData, setRevenueData] = useState<{ name: string; revenue: number }[]>([]);
    const [isLoadingBilling, setIsLoadingBilling] = useState(false);
    const [revenueFilter, setRevenueFilter] = useState<'month' | 'quarter' | '6M' | 'year' | 'all'>('6M');
    
    const [billingStats, setBillingStats] = useState({
        totalRevenue: 0,
        monthlyRecurringRevenue: 0,
        annualRecurringRevenue: 0,
        totalSubscriptions: 0,
        activeSubscriptions: 0,
        totalPayments: 0
    });

    // Plan Editing State
    const [editingPlan, setEditingPlan] = useState<PricingPlan | null>(null);
    const [newFeatureText, setNewFeatureText] = useState('');

    // Pending Payments State
    const [pendingPayments, setPendingPayments] = useState<any[]>([]);
    const [isLoadingPending, setIsLoadingPending] = useState(false);

    // Paying Clients State
    const [payingClients, setPayingClients] = useState<PayingClient[]>([]);
    const [isLoadingPayingClients, setIsLoadingPayingClients] = useState(false);
    const [payingClientSearch, setPayingClientSearch] = useState('');
    const [payingClientPlanFilter, setPayingClientPlanFilter] = useState<'ALL' | ResellerClient['plan']>('ALL');
    const [payingClientRiskFilter, setPayingClientRiskFilter] = useState<'ALL' | PayingClient['risk']>('ALL');
    const [payingClientActivitySort, setPayingClientActivitySort] = useState<ClientActivitySort>('created_desc');
    const [selectedPayingClient, setSelectedPayingClient] = useState<PayingClient | null>(null);
    const [selectedTenant, setSelectedTenant] = useState<ResellerClient | null>(null);
    const [emailDraft, setEmailDraft] = useState<EmailDraft | null>(null);

    // Database Connection State & Wizard
    const [dbStatus, setDbStatus] = useState<{ connected: boolean; message: string; details?: string } | null>(null);
    const [isCheckingDb, setIsCheckingDb] = useState(false);
    const [connectWizard, setConnectWizard] = useState<{ open: boolean, step: number }>({ open: false, step: 1 });
    const [manualCreds, setManualCreds] = useState({ url: '', key: '' });
    const [manualTestResult, setManualTestResult] = useState<{ success?: boolean, msg?: string } | null>(null);

    // Platform-wide Stats (cached from edge function)
    const [platformStats, setPlatformStats] = useState({
        totalTenants: 0,
        activeTenants: 0,
        pendingApprovals: 0,
        totalEmployees: 0,
        totalMRR: 0
    });
    const [growthAnalytics, setGrowthAnalytics] = useState<GrowthAnalytics>({
        monthlySignupGoal: 10,
        currentMonthSignups: 0,
        acquisitionBreakdown: [],
        signupTrend: [],
        activationFunnel: []
    });
    const [isLoadingGrowthAnalytics, setIsLoadingGrowthAnalytics] = useState(false);
    const [growthTrendRange, setGrowthTrendRange] = useState<GrowthTrendRange>('6M');

    // Stats - These are now primarily fetched via Edge Function for accuracy across pages
    // We fall back to local count if edge function isn't used
    const calculateTenantMRR = (tenant: ResellerClient) => {
        if (tenant.isTestCompany) return 0;
        if (tenant.status !== 'ACTIVE') return 0;
        const plan = plans.find(p => p.name === tenant.plan);
        if (!plan) return Number(tenant.mrr || 0);
        const { baseFee, perEmpFee } = getPlanPriceDetails(plan, 'monthly');
        return baseFee + ((Number(tenant.employeeCount) || 0) * perEmpFee);
    };

    const derivedTenantMRR = tenants.reduce((acc, tenant) => acc + calculateTenantMRR(tenant), 0);
    const totalMRR = (platformStats.totalMRR > 0) ? platformStats.totalMRR : derivedTenantMRR;
    const totalARR = totalMRR * 12;
    const totalTenants = (platformStats.totalTenants > 0) ? platformStats.totalTenants : tenants.filter(t => !t.isTestCompany).length;
    const activeTenants = (platformStats.activeTenants > 0) ? platformStats.activeTenants : tenants.filter(t => t.status === 'ACTIVE' && !t.isTestCompany).length;
    const totalEmployees = (platformStats.totalEmployees > 0) ? platformStats.totalEmployees : tenants.filter(t => !t.isTestCompany).reduce((acc, t) => acc + (t.employeeCount || 0), 0);
    const pendingApprovals = platformStats.pendingApprovals;
    const dimePayStatus = getDimePayStatus(paymentConfig);
    const trendWindowSize: Record<GrowthTrendRange, number> = { '1M': 2, '6M': 6, '1Y': 12 };
    const selectedSignupTrend = growthAnalytics.signupTrend.slice(-trendWindowSize[growthTrendRange]);
    const fullMonthOverMonthGrowth = growthAnalytics.signupTrend.map((point, index, records) => {
        const previous = index > 0 ? records[index - 1].signups : 0;
        const growth = previous > 0
            ? Math.round(((point.signups - previous) / previous) * 1000) / 10
            : point.signups > 0 ? 100 : 0;

        return {
            month: point.month,
            growth,
            signups: point.signups
        };
    });
    const monthOverMonthGrowth = fullMonthOverMonthGrowth.slice(-trendWindowSize[growthTrendRange]);
    const currentMomGrowth = monthOverMonthGrowth.length > 0
        ? monthOverMonthGrowth[monthOverMonthGrowth.length - 1].growth
        : 0;
    const momStatus = currentMomGrowth >= 10
        ? { label: 'On Track', className: 'bg-green-100 text-green-700' }
        : currentMomGrowth >= 0
            ? { label: 'Below Target', className: 'bg-amber-100 text-amber-700' }
            : { label: 'Negative Growth', className: 'bg-red-100 text-red-700' };

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
                const config = await CompanyService.getGlobalConfig();
                if (config) {
                    setPaymentConfig(withGlobalConfigDefaults(config));
                }
            } catch (e) {
                console.error("Error loading global config from Supabase:", e);
            } finally {
                hasLoadedGlobalConfigRef.current = true;
            }
        };
        loadGlobalConfig();
    }, []);

    // Save global config to both localStorage and Supabase
    useEffect(() => {
        if (!hasLoadedGlobalConfigRef.current) return;

        storage.saveGlobalConfig(paymentConfig);
        // Also save to Supabase
        CompanyService.saveGlobalConfig(paymentConfig).catch(e => {
            console.error("Error saving global config to Supabase:", e);
        });
    }, [paymentConfig]);
    useEffect(() => { storage.saveSuperAdmins(admins); }, [admins]);
    useEffect(() => {
        const loadLogs = async () => {
            if (activeTab === 'overview' || activeTab === 'logs') {
                try {
                    // Use Edge Function to bypass RLS for super admin audit log access
                    const { data, error } = await supabase!.functions.invoke('admin-handler', {
                        body: { action: 'get-audit-logs', payload: { limit: 500 } }
                    });
                    if (!error && data?.logs) {
                        setLogs(data.logs);
                    } else {
                        // Fallback to regular auditService (reads own company only)
                        const fallbackLogs = await auditService.getLogs(null, 'SUPER_ADMIN');
                        setLogs(fallbackLogs);
                    }
                } catch (e) {
                    console.error('Error loading audit logs:', e);
                }
            }
        };
        loadLogs();
    }, [activeTab]);

    // Load pending payments when tab is active
    useEffect(() => {
        const loadPendingPayments = async () => {
            if (activeTab !== 'pending-payments') return;
            setIsLoadingPending(true);
            try {
                const { data, error } = await supabase!.functions.invoke('admin-handler', {
                    body: { action: 'get-pending-approvals', payload: {} }
                });
                if (error) throw error;
                // Our new action returns { pending: [...] }
                setPendingPayments(data?.pending || []);
            } catch (error) {
                console.error('Error loading pending payments:', error);
                toast.error('Failed to load pending payments');
            } finally {
                setIsLoadingPending(false);
            }
        };
        loadPendingPayments();
    }, [activeTab]);

    // Load paying clients when tab is active
    useEffect(() => {
        const loadPayingClients = async () => {
            if (activeTab !== 'paying-clients') return;
            setIsLoadingPayingClients(true);
            try {
                const { data, error } = await supabase!.functions.invoke('admin-handler', {
                    body: { action: 'get-paying-clients', payload: {} }
                });
                if (error) throw error;
                setPayingClients(data?.clients || []);
            } catch (error) {
                console.error('Error loading paying clients:', error);
                toast.error('Failed to load paying clients');
            } finally {
                setIsLoadingPayingClients(false);
            }
        };
        loadPayingClients();
    }, [activeTab]);

    // Load super admins from Supabase when users tab is active
    useEffect(() => {
        const loadSuperAdmins = async () => {
            if (activeTab !== 'users') return;

            try {
                // Use admin-handler to bypass RLS and see ALL admins
                const { data, error } = await supabase!.functions.invoke('admin-handler', {
                    body: { action: 'get-all-super-admins', payload: {} }
                });
                
                if (error) throw error;
                
                const dbAdmins = data?.admins || [];
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

    // Load platform stats when overview or tenants tab is active
    useEffect(() => {
        const loadPlatformStats = async () => {
            if (activeTab !== 'overview' && activeTab !== 'tenants') return;
            
            try {
                const { data, error } = await supabase!.functions.invoke('admin-handler', {
                    body: { action: 'get-platform-stats', payload: {} }
                });
                
                if (error) throw error;
                if (data) {
                    setPlatformStats({
                        totalTenants: data.totalTenants || 0,
                        activeTenants: data.activeTenants || 0,
                        pendingApprovals: data.pendingApprovals || 0,
                        totalEmployees: data.totalEmployees || 0,
                        totalMRR: data.totalMRR || 0
                    });
                }
            } catch (error) {
                console.error('Error loading platform stats:', error);
            }
        };

        if (paymentConfig.dataSource === 'SUPABASE') {
            loadPlatformStats();
        }
    }, [activeTab, paymentConfig.dataSource]);

    // Load billing data when billing tab is active
    useEffect(() => {
        const loadBillingData = async () => {
            if (activeTab !== 'billing') return;

            setIsLoadingBilling(true);
            try {
                // Fetch all subscriptions via BillingService (no admin client needed)
                const [subscriptions, payingClientsResponse] = await Promise.all([
                    BillingService.getAllSubscriptions(),
                    supabase!.functions.invoke('admin-handler', {
                        body: { action: 'get-paying-clients', payload: {} }
                    })
                ]);
                if (payingClientsResponse.error) throw payingClientsResponse.error;

                const billingPayingClients: PayingClient[] = payingClientsResponse.data?.clients || [];
                setPayingClients(billingPayingClients);
                const activeSubs = subscriptions.filter((s: any) => isActiveBillingStatus(s.status));

                // Calculate MRR from active subscriptions
                const subscriptionMRR = activeSubs.reduce((sum: number, sub: any) => {
                    const frequency = String(sub.billing_frequency || sub.billing_cycle || '').toLowerCase();
                    const amount = Number(sub.amount || sub.base_price || 0);
                    if (frequency === 'monthly') {
                        return sum + amount;
                    } else if (frequency === 'yearly' || frequency === 'annual') {
                        return sum + (amount / 12);
                    }
                    return sum;
                }, 0);

                const payingClientMRR = billingPayingClients
                    .filter(isRevenueActiveClient)
                    .reduce((sum, client) => sum + Number(client.mrr || 0), 0);
                const tenantMRR = tenants.reduce((sum, tenant) => sum + calculateTenantMRR(tenant), 0);
                const mrr = Math.max(subscriptionMRR, payingClientMRR, tenantMRR);
                
                const arr = mrr * 12;

                // Fetch all completed payments
                let payments = await BillingService.getAllPayments();
                
                // Filter payments by selected timeframe
                const now = new Date();
                const filteredPayments = (payments || []).filter((p: any) => {
                    if (revenueFilter === 'all') return true;
                    const pDate = new Date(p.payment_date);
                    const diffTime = Math.abs(now.getTime() - pDate.getTime());
                    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                    
                    if (revenueFilter === 'month') return diffDays <= 30;
                    if (revenueFilter === 'quarter') return diffDays <= 90;
                    if (revenueFilter === '6M') return diffDays <= 183;
                    if (revenueFilter === 'year') return diffDays <= 365;
                    return true;
                });

                // Calculate total revenue from filtered timeframe
                const totalRevenue = filteredPayments.reduce((sum: number, p: any) => sum + Number(p.amount || 0), 0);

                // Group payments by month for chart (Always group by month for visual trend, but only within filter)
                const monthlyRevenue: Record<string, number> = {};
                filteredPayments.forEach((payment: any) => {
                    const date = new Date(payment.payment_date);
                    if (Number.isNaN(date.getTime())) return;
                    const monthKey = getMonthKey(date);
                    if (!monthlyRevenue[monthKey]) {
                        monthlyRevenue[monthKey] = 0;
                    }
                    monthlyRevenue[monthKey] += Number(payment.amount || 0);
                });

                // Convert to chart data format
                const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
                const currentMonth = new Date().getMonth();
                const chartData = [];
                // standard 6 months look back if month/quarter, or 12 months if year/all
                const lookBackMonths = (revenueFilter === 'year' || revenueFilter === 'all') ? 12 : 6;
                
                for (let i = lookBackMonths - 1; i >= 0; i--) {
                    const monthIndex = (currentMonth - i + 12) % 12;
                    const monthYear = currentMonth - i < 0 ? new Date().getFullYear() - 1 : new Date().getFullYear();
                    const monthName = months[monthIndex];
                    const monthKey = `${monthYear}-${String(monthIndex + 1).padStart(2, '0')}`;
                    const monthEnd = getMonthEnd(monthYear, monthIndex);
                    const projectedClientRevenue = billingPayingClients
                        .filter(isRevenueActiveClient)
                        .filter((client) => {
                            if (!client.createdAt) return true;
                            const createdAt = new Date(client.createdAt);
                            return Number.isNaN(createdAt.getTime()) || createdAt <= monthEnd;
                        })
                        .reduce((sum, client) => sum + Number(client.mrr || 0), 0);

                    chartData.push({
                        name: monthName,
                        revenue: monthlyRevenue[monthKey] || projectedClientRevenue
                    });
                }

                setBillingStats({
                    totalRevenue,
                    monthlyRecurringRevenue: mrr,
                    annualRecurringRevenue: arr,
                    totalSubscriptions: Math.max(subscriptions.length, billingPayingClients.length),
                    activeSubscriptions: Math.max(activeSubs.length, billingPayingClients.filter(isRevenueActiveClient).length),
                    totalPayments: filteredPayments.length
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
    }, [activeTab, revenueFilter]);

    // Check DB Connection when Settings tab is active
    useEffect(() => {
        if (activeTab === 'releases') {
            const loadReleases = async () => {
                setIsLoadingReleases(true);
                try {
                    const { data, error } = await supabase!.functions.invoke('admin-handler', {
                        body: { action: 'get-vercel-deployments', payload: {} }
                    });
                    if (error) throw error;
                    
                    setCurrentVersion(data.current_version || '1.0.0');
                    setLatestReleaseNotes(data.latest_release_notes || '');
                    setVercelDeployments(data.deployments || []);
                    
                    if (data.error) {
                        toast.error(data.error);
                    }
                } catch (err) {
                    console.error('Failed to load Vercel deployments:', err);
                    toast.error('Failed to load deployments');
                } finally {
                    setIsLoadingReleases(false);
                }
            };
            loadReleases();
        }

        if (activeTab === 'broadcasts') {
            const loadBroadcasts = async () => {
                const { data } = await supabase!.from('system_broadcasts').select('*').order('created_at', { ascending: false });
                if (data) setBroadcasts(data);
            };
            loadBroadcasts();
        }

        if (activeTab === 'settings') {
            handleCheckDb();
        }
    }, [activeTab]);

    useEffect(() => {
        const loadGrowthAnalytics = async () => {
            if (activeTab !== 'overview') return;

            setIsLoadingGrowthAnalytics(true);
            try {
                const { data, error } = await supabase!.functions.invoke('admin-handler', {
                    body: { action: 'get-growth-analytics', payload: {} }
                });
                if (error) throw error;

                setGrowthAnalytics({
                    monthlySignupGoal: Number(data?.monthlySignupGoal || paymentConfig.monthlySignupGoal || 10),
                    currentMonthSignups: Number(data?.currentMonthSignups || 0),
                    acquisitionBreakdown: data?.acquisitionBreakdown || [],
                    signupTrend: data?.signupTrend || [],
                    activationFunnel: data?.activationFunnel || []
                });
            } catch (error) {
                console.error('Error loading growth analytics:', error);
                setGrowthAnalytics(prev => ({
                    ...prev,
                    monthlySignupGoal: Number(paymentConfig.monthlySignupGoal || 10)
                }));
            } finally {
                setIsLoadingGrowthAnalytics(false);
            }
        };

        loadGrowthAnalytics();
    }, [activeTab, paymentConfig.monthlySignupGoal]);

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

    // --- Fetch Tenants from Supabase via Edge Function (bypasses RLS) ---
    useEffect(() => {
        async function fetchDBTenants() {
            setIsLoadingTenants(true);
            try {
                const { data, error } = await supabase!.functions.invoke('admin-handler', {
                    body: {
                        action: 'get-all-companies',
                        payload: { page: tenantPage, pageSize: TENANTS_PER_PAGE, sort: tenantActivitySort }
                    }
                });
                if (error) throw error;
                setTenants(data?.companies || []);
                setTenantTotal(data?.total || 0);
            } catch (e) {
                console.error('Error fetching tenants:', e);
                toast.error('Failed to fetch companies');
                setTenants([]);
            } finally {
                setIsLoadingTenants(false);
            }
        }
        fetchDBTenants();
    }, [activeTab, tenantPage, tenantActivitySort]); // Re-fetch whenever tab, page, or sort changes

    // --- Handlers ---
    const handleSuspend = async (id: string) => {
        const tenant = tenants.find(t => t.id === id);
        if (!tenant) return;

        const newStatus = tenant.status === 'SUSPENDED' ? 'ACTIVE' : 'SUSPENDED';

        try {
            await CompanyService.updateCompanyStatus(id, newStatus as any);
            setTenants(prev => prev.map(t => t.id === id ? { ...t, status: newStatus as any } : t));
            toast.success(`Tenant ${newStatus === 'ACTIVE' ? 'activated' : 'suspended'}`);
            auditService.log(
                { id: 'sys', name: 'Super Admin', email: 'sys', role: Role.SUPER_ADMIN },
                'UPDATE',
                'Company',
                `${newStatus === 'ACTIVE' ? 'Activated' : 'Suspended'} tenant: ${tenant.companyName}`
            );
        } catch (error) {
            console.error('Error updating tenant status:', error);
            toast.error("Failed to update status in database");
        }
    };

    const handleDeleteTenant = async (id: string) => {
        const tenant = tenants.find(t => t.id === id);
        if (!tenant) return;

        const confirmationName = window.prompt(
            `This permanently deletes ${tenant.companyName}'s operational data, users, payroll records, documents, timesheets, and settings. Audit/payment ledgers may be retained for compliance.\n\nType the exact company name to continue:`
        );

        if (confirmationName === null) return;
        if (confirmationName !== tenant.companyName) {
            toast.error('Company name did not match. Delete cancelled.');
            return;
        }

        const deleteAuthUsers = window.confirm(
            `Also delete Supabase Auth login identities for users in ${tenant.companyName}?\n\nUse this for test accounts when you need to reuse the same email. Choose Cancel for real customers or shared employee accounts.`
        );

        if (confirm(`Final confirmation: permanently delete ${tenant.companyName}? This action cannot be undone.`)) {
            try {
                const success = await CompanyService.deleteCompany(id, confirmationName, { deleteAuthUsers });
                if (success) {
                    setTenants(prev => prev.filter(t => t.id !== id));
                    toast.success("Tenant deleted from records");
                    auditService.log(
                        { id: 'sys', name: 'Super Admin', email: 'sys', role: Role.SUPER_ADMIN },
                        'DELETE',
                        'Company',
                        `Deleted tenant: ${tenant.companyName}`
                    );
                } else {
                    toast.error("Failed to delete tenant");
                }
            } catch (error) {
                console.error('Error deleting tenant:', error);
                toast.error("An error occurred during deletion");
            }
        }
    };

    const closeGiftModal = () => {
        setGiftingTenant(null);
        setGiftMonths(1);
        setGiftNote('');
        setManualPaymentAction('FREE_GIFT');
        setManualPaymentReason('STANDARD_PAYMENT');
        setManualPaymentPlan('Starter');
        setIsGiftingAccess(false);
    };

    const handleGiftMonths = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!giftingTenant) return;

        setIsGiftingAccess(true);
        try {
            const { data, error } = await supabase!.functions.invoke('admin-handler', {
                body: {
                    action: 'gift-company-months',
                    payload: {
                        companyId: giftingTenant.id,
                        months: giftMonths,
                        note: giftNote.trim(),
                        reason: manualPaymentReason,
                        manualPaymentType: manualPaymentAction,
                        plan: manualPaymentPlan,
                        manualPaymentLabel: MANUAL_PAYMENT_ACTION_LABELS[manualPaymentAction],
                    },
                },
            });

            if (error) throw new Error(await getFunctionErrorMessage(error, 'Failed to apply manual payment access'));

            const updatedCompany = data?.company;
            setTenants((prev) => prev.map((tenant) => (
                tenant.id === giftingTenant.id
                    ? {
                        ...tenant,
                        plan: manualPaymentPlan,
                        billingGift: updatedCompany?.billingGift ?? tenant.billingGift,
                        hasActiveBillingGift: updatedCompany?.hasActiveBillingGift ?? true,
                    }
                    : tenant
            )));

            auditService.log(
                { id: 'sys', name: 'Super Admin', email: 'sys', role: Role.SUPER_ADMIN },
                'UPDATE',
                'Company',
                `Applied manual payment access for ${giftMonths} month${giftMonths === 1 ? '' : 's'} to tenant: ${giftingTenant.companyName}`
            );
            const emailSent = data?.emailNotification?.sent === true;
            toast.success(
                `Applied ${giftMonths} month${giftMonths === 1 ? '' : 's'} of ${manualPaymentPlan} access to ${giftingTenant.companyName}${emailSent ? ' and emailed the account.' : '.'}`
            );
            closeGiftModal();
        } catch (error: any) {
            console.error('Error applying manual payment access:', error);
            toast.error(error.message || 'Failed to apply manual payment access');
            setIsGiftingAccess(false);
        }
    };

    const handleAddAdmin = async (e: React.FormEvent) => {
        e.preventDefault();

        const email = newAdminForm.email.trim().toLowerCase();
        const name = newAdminForm.name.trim();
        const password = newAdminForm.password;

        if (!name) {
            toast.error('Name is required');
            return;
        }

        if (!email) {
            toast.error('Email is required');
            return;
        }

        if (!password || password.length < 6) {
            toast.error("Password must be at least 6 characters");
            return;
        }

        try {
            if (!supabase) {
                throw new Error('Supabase not initialized');
            }

            // 1. Create auth user in Supabase Auth using edge function
            const { data: adminRes, error: invokeError } = await supabase.functions.invoke('admin-handler', {
                body: {
                    action: 'create-super-admin',
                    payload: {
                        email,
                        password,
                        name
                    }
                }
            });

            if (invokeError || !adminRes?.user) {
                const rawBody = (invokeError as any)?.context?.body;
                let edgeMessage: string | undefined;
                if (typeof rawBody === 'string' && rawBody.length > 0) {
                    try {
                        const parsed = JSON.parse(rawBody);
                        edgeMessage = parsed?.error;
                    } catch {
                        edgeMessage = rawBody;
                    }
                }

                console.error('❌ Auth signup error:', { invokeError, adminRes, edgeMessage });
                toast.error(edgeMessage || invokeError?.message || 'Failed to create admin user');
                return;
            }
            
            const authData = { user: adminRes.user };

            if (!authData.user) {
                throw new Error('No user returned from signup');
            }

            console.log('✅ Supabase Auth user created:', authData.user.id);

            // 2. app_users profile is created in admin-handler using service role

            // 3. Update local state and refresh from DB
            setIsAddAdminOpen(false);
            setNewAdminForm({ name: '', email: '', password: '' });
            auditService.log({ id: 'sys', name: 'Super Admin', email: 'sys', role: Role.SUPER_ADMIN }, 'CREATE', 'User', `Created new super admin: ${email}`);
            toast.success("New admin created successfully");

            // Refresh admins list from database
            const updatedAdmins = await UserService.getAllSuperAdmins();
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
                const deleted = await UserService.deleteUser(id);
                if (!deleted) {
                    toast.error("Failed to remove admin from database");
                    return;
                }

                // Also try to delete from auth
                if (supabase) {
                    try {
                        await supabase.functions.invoke('admin-handler', {
                            body: { action: 'delete-super-admin', payload: { userId: id } }
                        });
                    } catch (authError) {
                        console.warn("Could not delete auth user:", authError);
                        // Continue anyway - app_users record is deleted
                    }
                }

                // Refresh admins list from database
                const updatedAdmins = await UserService.getAllSuperAdmins();
                if (updatedAdmins && updatedAdmins.length > 0) {
                    setAdmins(updatedAdmins);
                    storage.saveSuperAdmins(updatedAdmins);
                } else {
                    // Fallback: remove from local state
                    setAdmins(prev => prev.filter(u => u.id !== id));
                }

                auditService.log({ id: 'sys', name: 'Super Admin', email: 'sys', role: Role.SUPER_ADMIN }, 'DELETE', 'User', `Removed super admin: ${id}`);
                toast.success("Admin removed successfully");
            } catch (error: any) {
                console.error('Error removing admin:', error);
                toast.error(error.message || "Failed to remove admin");
            }
        }
    };

    const handleApprovePayment = async (companyId: string, companyName: string) => {
        if (!confirm(`Approve payment for ${companyName}? This will activate their account.`)) return;

        try {
            const { data, error } = await supabase!.functions.invoke('admin-handler', {
                body: { action: 'approve-payment', payload: { companyId } }
            });
            if (error) throw error;

            if (data?.success) {
                toast.success(`Payment approved for ${companyName}`);
                auditService.log(
                    { id: 'sys', name: 'Super Admin', email: 'sys', role: Role.SUPER_ADMIN },
                    'APPROVE',
                    'Payment',
                    `Approved payment for company: ${companyName}`
                );
                
                // Reload pending payments using the new action
                const { data: refreshed } = await supabase!.functions.invoke('admin-handler', {
                    body: { action: 'get-pending-approvals', payload: {} }
                });
                setPendingPayments(refreshed?.pending || []);
            } else {
                toast.error('Failed to approve payment');
            }
        } catch (error: any) {
            console.error('Error approving payment:', error);
            toast.error(error.message || 'Failed to approve payment');
        }
    };

    const handleCreateClientEmail = (client: PayingClient) => {
        if (!client.adminEmail) {
            toast.error('No admin email found for this client');
            return;
        }

        const subject = '[SaaS Admin Update] Regarding Your Workspace Subscription';
        const body = [
            `Hi ${client.adminName || 'there'},`,
            '',
            `I am reaching out about ${client.companyName}'s Payroll-Jam subscription.`,
            '',
            `Plan: ${client.plan}`,
            `Status: ${client.subscriptionStatus || client.status}`,
            `Monthly recurring amount: JMD ${client.mrr.toLocaleString()}`,
            '',
            'Regards,',
            'Payroll-Jam Admin'
        ].join('\n');

        setEmailDraft({
            to: client.adminEmail,
            subject,
            body,
            companyName: client.companyName
        });
    };

    const handleOpenEmailDraft = () => {
        if (!emailDraft) return;
        const mailto = `mailto:${encodeURIComponent(emailDraft.to)}?subject=${encodeURIComponent(emailDraft.subject)}&body=${encodeURIComponent(emailDraft.body)}`;
        window.location.assign(mailto);
        toast.success('Opening your email app...');
    };

    const handleCopyEmailDraft = async () => {
        if (!emailDraft) return;
        const draft = `To: ${emailDraft.to}\nSubject: ${emailDraft.subject}\n\n${emailDraft.body}`;
        try {
            await navigator.clipboard.writeText(draft);
            toast.success('Email draft copied');
        } catch (error) {
            console.error('Failed to copy email draft:', error);
            toast.error('Could not copy draft automatically');
        }
    };

    const handleManagePayingClient = (client: PayingClient) => {
        onImpersonate({
            id: client.id,
            companyName: client.companyName,
            contactName: client.adminName,
            email: client.adminEmail,
            employeeCount: client.activeEmployees,
            plan: client.plan,
            status: client.status === 'SUSPENDED' ? 'SUSPENDED' : 'ACTIVE',
            subscriptionStatus: client.subscriptionStatus?.toUpperCase() as any,
            mrr: client.mrr,
            createdAt: client.createdAt
        });
    };

    const handleToggleTestCompany = async (companyId: string, isTestCompany: boolean) => {
        try {
            const { error } = await supabase!.functions.invoke('admin-handler', {
                body: { action: 'toggle-test-company', payload: { companyId, isTestCompany } }
            });
            if (error) throw error;

            // Update local paying clients state
            setPayingClients(prev => prev.map(c => c.id === companyId ? { ...c, isTestCompany } : c));

            // Update selected paying client if open
            setSelectedPayingClient(prev => prev && prev.id === companyId ? { ...prev, isTestCompany } : prev);

            // Update tenants state (for the tenants tab)
            setTenants(prev => prev.map(t => t.id === companyId ? { ...t, isTestCompany } as any : t));

            // Update selected tenant if open
            setSelectedTenant(prev => prev && prev.id === companyId ? { ...prev, isTestCompany } as any : prev);

            toast.success(isTestCompany ? 'Marked as test company' : 'Removed test company flag');
        } catch (error) {
            console.error('Error toggling test company:', error);
            toast.error('Failed to update test company status');
        }
    };

    const handleSaveGlobalTaxConfig = async (config: TaxConfig) => {
        const nextConfig = { ...paymentConfig, taxConfig: config };
        setPaymentConfig(nextConfig);
        storage.saveGlobalConfig(nextConfig);
        await CompanyService.saveGlobalConfig(nextConfig);
        auditService.log({ id: 'sys', name: 'Super Admin', email: 'sys', role: Role.SUPER_ADMIN }, 'UPDATE', 'System', 'Updated global tax defaults');
        toast.success('Global tax defaults saved');
    };

    const handleToggleMaintenance = (enabled: boolean) => {
        setPaymentConfig(prev => ({ ...prev, maintenanceMode: enabled }));
        auditService.log({ id: 'sys', name: 'Super Admin', email: 'sys', role: Role.SUPER_ADMIN }, 'SETTINGS', 'System', `Maintenance Mode set to ${enabled}`);
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
            auditService.log({ id: 'sys', name: 'Super Admin', email: 'sys', role: Role.SUPER_ADMIN }, 'UPDATE', 'Plan', `Updated plan: ${editingPlan.name}`);
            console.log('🔍 Saving updated plan:', editingPlan);
            console.log('🔍 Updated plans array:', updated);
            toast.success("Plan updated");
        } else {
            updated = [...plans, editingPlan];
            auditService.log({ id: 'sys', name: 'Super Admin', email: 'sys', role: Role.SUPER_ADMIN }, 'CREATE', 'Plan', `Created plan: ${editingPlan.name}`);
            console.log('🔍 Creating new plan:', editingPlan);
            console.log('🔍 Updated plans array:', updated);
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
        auditService.log({ id: 'sys', name: 'Super Admin', email: 'sys', role: Role.SUPER_ADMIN }, 'UPDATE', 'System', `Toggled plan ${plan.name} status`);
        toast.success(`Plan ${plan.isActive ? 'deactivated' : 'activated'}`);
    };

    const handleDeletePlan = (plan: PricingPlan) => {
        // Prevent deleting if it's the only active plan
        const activePlans = plans.filter(p => p.isActive);
        if (activePlans.length === 1 && plan.isActive) {
            toast.error('Cannot delete the last active plan!');
            return;
        }

        // Confirm deletion
        if (window.confirm(`Are you sure you want to delete the "${plan.name}" plan? This action cannot be undone.`)) {
            const updated = plans.filter(p => p.id !== plan.id);
            onUpdatePlans(updated);
            auditService.log({ id: 'sys', name: 'Super Admin', email: 'sys', role: Role.SUPER_ADMIN }, 'DELETE', 'Plan', `Deleted plan: ${plan.name}`);
            toast.success(`Plan "${plan.name}" deleted successfully`);
        }
    };

    // --- Render Components ---

    const renderOverview = () => (
        <div className="space-y-6 animate-fade-in">
            <div className="grid grid-cols-1 md:grid-cols-5 gap-6">
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
                            <p className="text-sm text-gray-500 uppercase font-bold">Platform ARR</p>
                            <h3 className="text-3xl font-bold text-gray-900 mt-2">${totalARR.toLocaleString()}</h3>
                        </div>
                        <div className="p-3 bg-emerald-50 text-emerald-600 rounded-lg">
                            <Icons.Trending className="w-6 h-6" />
                        </div>
                    </div>
                    <p className="text-xs text-gray-400 mt-2">Projected annual recurring revenue</p>
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
                            <p className="text-sm text-gray-500 uppercase font-bold">Pending Approvals</p>
                            <h3 className={`text-3xl font-bold mt-2 ${pendingApprovals > 0 ? 'text-jam-orange' : 'text-gray-900'}`}>{pendingApprovals}</h3>
                        </div>
                        <div className={`p-3 rounded-lg ${pendingApprovals > 0 ? 'bg-orange-50 text-jam-orange' : 'bg-gray-50 text-gray-400'}`}>
                            <Icons.Alert className="w-6 h-6" />
                        </div>
                    </div>
                    <p className="text-xs text-gray-400 mt-2">Requires admin review</p>
                </div>
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                <div className="px-6 py-4 border-b border-gray-100 bg-gray-50 flex items-center justify-between">
                    <div>
                        <h3 className="font-bold text-gray-900">Growth & Analytics</h3>
                        <p className="text-sm text-gray-600 mt-1">Monthly signup progress, acquisition source, and organic trend.</p>
                    </div>
                    {isLoadingGrowthAnalytics && (
                        <Icons.Refresh className="w-5 h-5 animate-spin text-jam-orange" />
                    )}
                </div>
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 p-6">
                    <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
                        <div className="flex items-center justify-between mb-4">
                            <div>
                                <p className="text-sm text-gray-500 uppercase font-bold">Monthly Signup Goal</p>
                                <h3 className="text-3xl font-bold text-gray-900 mt-2">
                                    {growthAnalytics.currentMonthSignups}
                                    <span className="text-base font-semibold text-gray-400"> / {growthAnalytics.monthlySignupGoal}</span>
                                </h3>
                            </div>
                            <div className="p-3 bg-orange-50 text-jam-orange rounded-lg">
                                <Icons.Trending className="w-6 h-6" />
                            </div>
                        </div>
                        <div className="h-3 bg-gray-100 rounded-full overflow-hidden">
                            <div
                                className="h-full bg-jam-orange rounded-full transition-all"
                                style={{ width: `${Math.min(100, Math.round((growthAnalytics.currentMonthSignups / Math.max(1, growthAnalytics.monthlySignupGoal)) * 100))}%` }}
                            />
                        </div>
                        <p className="text-xs text-gray-400 mt-3">
                            {Math.max(0, growthAnalytics.monthlySignupGoal - growthAnalytics.currentMonthSignups)} signups left this month
                        </p>
                    </div>

                    <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
                        <div className="flex items-center justify-between mb-4">
                            <div>
                                <p className="text-sm text-gray-500 uppercase font-bold">Acquisition Source</p>
                                <h3 className="text-xl font-bold text-gray-900 mt-2">Signup Mix</h3>
                            </div>
                        </div>
                        {growthAnalytics.acquisitionBreakdown.length === 0 ? (
                            <div className="h-56 flex items-center justify-center text-sm text-gray-400">No source data yet</div>
                        ) : (
                            <div className="grid grid-cols-1 sm:grid-cols-[140px_1fr] gap-4 items-center">
                                <div className="h-40">
                                    <ResponsiveContainer width="100%" height="100%">
                                        <PieChart>
                                            <Pie
                                                data={growthAnalytics.acquisitionBreakdown}
                                                dataKey="count"
                                                nameKey="source"
                                                innerRadius={42}
                                                outerRadius={64}
                                                paddingAngle={3}
                                            >
                                                {growthAnalytics.acquisitionBreakdown.map((entry, index) => (
                                                    <Cell key={entry.source} fill={ACQUISITION_COLORS[index % ACQUISITION_COLORS.length]} />
                                                ))}
                                            </Pie>
                                            <Tooltip />
                                        </PieChart>
                                    </ResponsiveContainer>
                                </div>
                                <div className="space-y-2">
                                    {growthAnalytics.acquisitionBreakdown.map((entry, index) => (
                                        <div key={entry.source} className="flex items-center justify-between text-sm">
                                            <span className="flex items-center text-gray-600">
                                                <span
                                                    className="w-2.5 h-2.5 rounded-full mr-2"
                                                    style={{ backgroundColor: ACQUISITION_COLORS[index % ACQUISITION_COLORS.length] }}
                                                />
                                                {entry.source}
                                            </span>
                                            <span className="font-bold text-gray-900">{entry.count}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>

                    <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
                        <div className="flex items-start justify-between gap-3 mb-4">
                            <div>
                                <p className="text-sm text-gray-500 uppercase font-bold">Organic Signup Trend</p>
                                <h3 className="text-xl font-bold text-gray-900 mt-2">
                                    {growthTrendRange === '1M' ? 'Last Month' : growthTrendRange === '1Y' ? 'Last Year' : 'Last 6 Months'}
                                </h3>
                            </div>
                            <select
                                value={growthTrendRange}
                                onChange={(event) => setGrowthTrendRange(event.target.value as GrowthTrendRange)}
                                className="px-2 py-1.5 border border-gray-300 rounded-lg bg-white text-xs font-medium focus:outline-none focus:ring-2 focus:ring-jam-orange"
                            >
                                <option value="1M">Last Month</option>
                                <option value="6M">Last 6 Months</option>
                                <option value="1Y">Last Year</option>
                            </select>
                        </div>
                        <div className="h-56">
                            <ResponsiveContainer width="100%" height="100%">
                                <AreaChart data={selectedSignupTrend}>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                                    <XAxis dataKey="month" fontSize={12} tickLine={false} axisLine={false} />
                                    <YAxis allowDecimals={false} fontSize={12} tickLine={false} axisLine={false} />
                                    <Tooltip />
                                    <Area type="monotone" dataKey="signups" stroke="#F97316" fill="#FED7AA" strokeWidth={2} />
                                </AreaChart>
                            </ResponsiveContainer>
                        </div>
                    </div>

                    <div className="lg:col-span-3 bg-white p-6 rounded-xl shadow-sm border border-gray-200">
                        <div className="flex flex-col gap-4 mb-4 lg:flex-row lg:items-start lg:justify-between">
                            <div>
                                <p className="text-sm text-gray-500 uppercase font-bold">Month Over Month Growth</p>
                                <h3 className="text-xl font-bold text-gray-900 mt-2">Signup Momentum</h3>
                                <p className="text-xs text-gray-500 mt-1">Target is at least 10% month over month growth.</p>
                            </div>
                            <div className="flex flex-wrap items-center gap-3">
                                <div className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 text-right">
                                    <p className="text-xs font-bold uppercase text-gray-500">Current MoM</p>
                                    <p className={`text-2xl font-bold ${currentMomGrowth >= 10 ? 'text-green-600' : currentMomGrowth >= 0 ? 'text-amber-600' : 'text-red-600'}`}>
                                        {currentMomGrowth}%
                                    </p>
                                </div>
                                <span className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-bold uppercase ${momStatus.className}`}>
                                    {momStatus.label}
                                </span>
                                <div className="p-3 bg-emerald-50 text-emerald-600 rounded-lg">
                                    <Icons.Trending className="w-6 h-6" />
                                </div>
                            </div>
                        </div>
                        <div className="h-64">
                            <ResponsiveContainer width="100%" height="100%">
                                <AreaChart data={monthOverMonthGrowth}>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                                    <XAxis dataKey="month" fontSize={12} tickLine={false} axisLine={false} />
                                    <YAxis
                                        fontSize={12}
                                        tickLine={false}
                                        axisLine={false}
                                        tickFormatter={(value) => `${value}%`}
                                    />
                                    <Tooltip formatter={(value) => [`${value}%`, 'Growth']} />
                                    <ReferenceLine y={10} stroke="#F97316" strokeDasharray="4 4" label={{ value: '10% target', position: 'insideTopRight', fill: '#F97316', fontSize: 12 }} />
                                    <Area type="monotone" dataKey="growth" stroke="#10B981" fill="#D1FAE5" strokeWidth={2} />
                                </AreaChart>
                            </ResponsiveContainer>
                        </div>
                    </div>

                    <div className="lg:col-span-3 bg-white p-6 rounded-xl shadow-sm border border-gray-200">
                        <div className="flex flex-col gap-4 mb-4 lg:flex-row lg:items-start lg:justify-between">
                            <div>
                                <p className="text-sm text-gray-500 uppercase font-bold">Activation Funnel</p>
                                <h3 className="text-xl font-bold text-gray-900 mt-2">Signup to First Payroll</h3>
                                <p className="text-xs text-gray-500 mt-1">
                                    Cohort tracks companies signed up in the last 12 months through onboarding, roster setup, and finalized payroll.
                                </p>
                            </div>
                            <div className="p-3 bg-blue-50 text-blue-600 rounded-lg">
                                <Icons.Reports className="w-6 h-6" />
                            </div>
                        </div>
                        {growthAnalytics.activationFunnel.length === 0 ? (
                            <div className="h-64 flex items-center justify-center text-sm text-gray-400">No activation data yet</div>
                        ) : (
                            <div className="grid grid-cols-1 lg:grid-cols-[1fr_280px] gap-6 items-center">
                                <div className="h-72">
                                    <ResponsiveContainer width="100%" height="100%">
                                        <BarChart
                                            data={growthAnalytics.activationFunnel}
                                            layout="vertical"
                                            margin={{ top: 8, right: 24, left: 20, bottom: 8 }}
                                        >
                                            <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                                            <XAxis type="number" allowDecimals={false} fontSize={12} tickLine={false} axisLine={false} />
                                            <YAxis type="category" dataKey="step" width={120} fontSize={12} tickLine={false} axisLine={false} />
                                            <Tooltip formatter={(value, name) => [value, name === 'count' ? 'Companies' : name]} />
                                            <Bar dataKey="count" fill="#F97316" radius={[0, 6, 6, 0]} />
                                        </BarChart>
                                    </ResponsiveContainer>
                                </div>
                                <div className="space-y-3">
                                    {growthAnalytics.activationFunnel.map((item) => (
                                        <div key={item.step} className="rounded-lg border border-gray-200 bg-gray-50 p-3">
                                            <div className="flex items-center justify-between gap-3">
                                                <p className="text-sm font-bold text-gray-900">{item.step}</p>
                                                <span className="text-xs font-bold text-gray-500">{item.rate}%</span>
                                            </div>
                                            <div className="mt-2 flex items-end justify-between">
                                                <p className="text-2xl font-bold text-gray-900">{item.count}</p>
                                                <p className="text-xs text-gray-500">of signups</p>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>
            
            {/* System Status Banner */}
            <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
                 <div className="flex items-center justify-between">
                    <div className="flex items-center">
                        <div className="p-3 bg-green-50 text-green-600 rounded-lg mr-4">
                            <Icons.Zap className="w-6 h-6" />
                        </div>
                        <div>
                            <h3 className="text-lg font-bold text-gray-900">System Status</h3>
                            <p className="text-sm text-gray-500">All systems operational</p>
                        </div>
                    </div>
                    <span className="px-3 py-1 bg-green-100 text-green-700 text-xs font-bold rounded-full uppercase">Healthy</span>
                </div>
            </div>
        </div>
    );

    const renderTenants = () => {
        const filteredTenants = tenants.filter(t => {
            const matchesSearch = t.companyName.toLowerCase().includes(searchTerm.toLowerCase()) || (t.email || '').toLowerCase().includes(searchTerm.toLowerCase());
            const matchesFilter = filterStatus === 'ALL' || t.status === filterStatus;
            return matchesSearch && matchesFilter;
        });

        const totalPages = Math.ceil(tenantTotal / TENANTS_PER_PAGE);

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
                            onChange={(e) => { setSearchTerm(e.target.value); setTenantPage(0); }}
                        />
                    </div>
                    <div className="flex flex-wrap items-center justify-end gap-3">
                        <span className="text-xs text-gray-500">{tenantTotal} total tenants</span>
                        <select
                            className="px-3 py-2 border border-gray-300 rounded-lg bg-white text-sm focus:outline-none focus:ring-2 focus:ring-jam-orange"
                            value={tenantActivitySort}
                            onChange={(e) => { setTenantActivitySort(e.target.value as ClientActivitySort); setTenantPage(0); }}
                        >
                            <option value="created_desc">Newest signups</option>
                            <option value="created_asc">Oldest signups</option>
                            <option value="last_login_desc">Recent logins</option>
                            <option value="last_login_asc">Oldest logins</option>
                        </select>
                        <div className="flex space-x-2">
                            {(['ALL', 'ACTIVE', 'SUSPENDED'] as const).map(status => (
                                <button
                                    key={status}
                                    onClick={() => setFilterStatus(status)}
                                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${filterStatus === status ? 'bg-jam-black text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                                        }`}
                                >
                                    {status}
                                </button>
                            ))}
                        </div>
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
                                    <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase">Activity</th>
                                    <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase">Status</th>
                                    <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase text-right">Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {isLoadingTenants ? (
                                    <tr>
                                        <td colSpan={7} className="p-12 text-center text-gray-500">
                                            <div className="flex flex-col items-center">
                                                <Icons.Refresh className="w-8 h-8 animate-spin text-jam-orange mb-2" />
                                                <p>Loading records from Supabase...</p>
                                            </div>
                                        </td>
                                    </tr>
                                ) : filteredTenants.length === 0 ? (
                                    <tr>
                                        <td colSpan={7} className="p-8 text-center text-gray-500">
                                            No companies found.
                                        </td>
                                    </tr>
                                ) : (
                                    filteredTenants.map(tenant => (
                                        <tr
                                            key={tenant.id}
                                            onClick={() => setSelectedTenant(tenant)}
                                            className={`cursor-pointer hover:bg-gray-50 border-b border-gray-100 last:border-0 ${(tenant as any).isTestCompany ? 'opacity-60' : ''}`}
                                        >
                                            <td className="px-6 py-4">
                                                <div className="flex items-center gap-2">
                                                    <span className="font-medium text-gray-900">{tenant.companyName}</span>
                                                    {(tenant as any).isTestCompany && (
                                                        <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold uppercase bg-purple-100 text-purple-700">🧪 Test</span>
                                                    )}
                                                </div>
                                            </td>
                                            <td className="px-6 py-4 text-sm text-gray-500">
                                                {tenant.contactName}
                                                <div className="text-xs text-gray-400">{tenant.email}</div>
                                                <div className="text-xs text-gray-400">{tenant.phone || 'No phone on file'}</div>
                                            </td>
                                            <td className="px-6 py-4">
                                                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                                                    {tenant.plan}
                                                </span>
                                            </td>
                                            <td className="px-6 py-4 text-sm text-gray-500">{tenant.employeeCount}</td>
                                            <td className="px-6 py-4 text-sm text-gray-500">
                                                <div>
                                                    <span className="font-medium text-gray-700">Last login</span>
                                                    <div className="text-xs text-gray-500">{formatActivityDate(tenant.lastLoginAt)}</div>
                                                </div>
                                                <div className="mt-2">
                                                    <span className="font-medium text-gray-700">Created</span>
                                                    <div className="text-xs text-gray-500">{formatActivityDate(tenant.accountCreatedAt || tenant.createdAt, 'N/A')}</div>
                                                </div>
                                            </td>
                                            <td className="px-6 py-4">
                                                <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${tenant.status === 'ACTIVE' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                                                    }`}>
                                                    {tenant.status}
                                                </span>
                                                {tenant.hasActiveBillingGift && (
                                                    <div className="mt-2 inline-flex items-center rounded-full bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-700">
                                                        <Icons.CalendarDays className="mr-1.5 h-3.5 w-3.5" />
                                                        {getManualPaymentAccessLabel(tenant.billingGift)} through {formatGiftedUntil(tenant.billingGift?.giftedUntil) || 'active period'}
                                                    </div>
                                                )}
                                            </td>
                                            <td className="px-6 py-4 text-right space-x-2">
                                                <button onClick={(e) => { e.stopPropagation(); onImpersonate(tenant); }} className="text-jam-orange hover:text-yellow-600 text-xs font-bold uppercase">
                                                    Manage
                                                </button>
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        setGiftingTenant(tenant);
                                                        setGiftMonths(1);
                                                        setGiftNote('');
                                                        setManualPaymentAction('FREE_GIFT');
                                                        setManualPaymentReason('STANDARD_PAYMENT');
                                                        setManualPaymentPlan(tenant.plan === 'Free' ? 'Starter' : normalizeManualPaymentPlan(tenant.plan));
                                                    }}
                                                    className="text-amber-600 hover:text-amber-700 text-xs font-bold uppercase"
                                                >
                                                    Manual Payment
                                                </button>
                                                <button onClick={(e) => { e.stopPropagation(); handleSuspend(tenant.id); }} className="text-gray-500 hover:text-gray-900 text-xs font-bold uppercase">
                                                    {tenant.status === 'ACTIVE' ? 'Suspend' : 'Activate'}
                                                </button>
                                                <button onClick={(e) => { e.stopPropagation(); handleDeleteTenant(tenant.id); }} className="text-red-400 hover:text-red-600">
                                                    <Icons.Trash className="w-4 h-4" />
                                                </button>
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>

                    {/* Pagination Controls */}
                    {totalPages > 1 && (
                        <div className="flex items-center justify-between px-6 py-4 border-t border-gray-200">
                            <p className="text-sm text-gray-500">
                                Showing {tenantPage * TENANTS_PER_PAGE + 1}–{Math.min((tenantPage + 1) * TENANTS_PER_PAGE, tenantTotal)} of {tenantTotal} tenants
                            </p>
                            <div className="flex items-center space-x-2">
                                <button
                                    onClick={() => setTenantPage(p => Math.max(0, p - 1))}
                                    disabled={tenantPage === 0}
                                    className="px-3 py-1.5 rounded-lg text-xs font-medium bg-gray-100 text-gray-700 hover:bg-gray-200 disabled:opacity-40 disabled:cursor-not-allowed"
                                >
                                    ← Prev
                                </button>
                                {Array.from({ length: totalPages }, (_, i) => i).map(pg => (
                                    <button
                                        key={pg}
                                        onClick={() => setTenantPage(pg)}
                                        className={`w-8 h-8 rounded-lg text-xs font-bold transition-colors ${
                                            pg === tenantPage
                                                ? 'bg-jam-orange text-jam-black'
                                                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                                        }`}
                                    >
                                        {pg + 1}
                                    </button>
                                ))}
                                <button
                                    onClick={() => setTenantPage(p => Math.min(totalPages - 1, p + 1))}
                                    disabled={tenantPage >= totalPages - 1}
                                    className="px-3 py-1.5 rounded-lg text-xs font-medium bg-gray-100 text-gray-700 hover:bg-gray-200 disabled:opacity-40 disabled:cursor-not-allowed"
                                >
                                    Next →
                                </button>
                            </div>
                        </div>
                    )}
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
                                    onChange={e => setNewAdminForm({ ...newAdminForm, name: e.target.value })}
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Email</label>
                                <input
                                    required
                                    type="email"
                                    className="w-full border border-gray-300 rounded px-3 py-2"
                                    value={newAdminForm.email}
                                    onChange={e => setNewAdminForm({ ...newAdminForm, email: e.target.value })}
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Password</label>
                                <input
                                    required
                                    type="password"
                                    minLength={6}
                                    name="new-password"
                                    autoComplete="new-password"
                                    className="w-full border border-gray-300 rounded px-3 py-2"
                                    value={newAdminForm.password}
                                    onChange={e => setNewAdminForm({ ...newAdminForm, password: e.target.value })}
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
                        onClick={() => setActiveTab('settings')}
                        className="w-full py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 flex items-center justify-center"
                    >
                        <Icons.Settings className="w-4 h-4 mr-2" /> Manage Global Tax Defaults
                    </button>
                </div>
            </div>
        </div>
    );

    const handlePromoteDeployment = async () => {
        if (!selectedDeployment) return;
        setIsPromoting(true);
        try {
            const { data, error } = await supabase!.functions.invoke('admin-handler', {
                body: { 
                    action: 'promote-vercel-deployment',
                    payload: {
                        deploymentId: selectedDeployment.uid,
                        targetVersion,
                        releaseNotes: releaseNotesInput,
                        productionDomain,
                        skipAlias
                    }
                }
            });
            if (error) throw error;
            
            if (data?.success === false) {
                toast.error(data.error || 'Failed to promote deployment');
                return;
            }

            if (data?.warning) {
                toast.warning('Version promoted internally, but Vercel alias failed: ' + data.warning, { duration: 6000 });
            } else {
                toast.success('Deployment promoted successfully!');
            }
            
            setCurrentVersion(targetVersion);
            setLatestReleaseNotes(releaseNotesInput);
            setSelectedDeployment(null);
        } catch (err: any) {
            console.error('Promotion error:', err);
            toast.error(err.message || 'Failed to promote deployment');
        } finally {
            setIsPromoting(false);
        }
    };

    const renderReleases = () => (
        <div className="space-y-6 animate-fade-in relative">
            <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
                <div className="flex justify-between items-center mb-6">
                    <div>
                        <h3 className="text-lg font-bold text-gray-900">Release Management</h3>
                        <p className="text-sm text-gray-500">Manage Vercel deployments and promote to production.</p>
                    </div>
                    <div className="text-right">
                        <p className="text-xs font-bold text-gray-500 uppercase">Current Live Version</p>
                        <p className="text-2xl font-black text-jam-orange">v{currentVersion}</p>
                    </div>
                </div>

                <div className="bg-gray-50 p-4 rounded-lg border border-gray-200 mb-6">
                    <p className="text-sm font-bold text-gray-700 mb-2">Latest Release Notes</p>
                    <p className="text-sm text-gray-600 whitespace-pre-wrap">{latestReleaseNotes || 'No notes provided.'}</p>
                </div>

                {isLoadingReleases ? (
                    <div className="py-12 text-center text-gray-500">Loading Vercel deployments...</div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-left text-sm">
                            <thead className="bg-gray-50 text-gray-500">
                                <tr>
                                    <th className="px-4 py-3 font-medium rounded-tl-lg">Commit Message</th>
                                    <th className="px-4 py-3 font-medium">Branch</th>
                                    <th className="px-4 py-3 font-medium">State</th>
                                    <th className="px-4 py-3 font-medium">Created At</th>
                                    <th className="px-4 py-3 font-medium text-right rounded-tr-lg">Action</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                {vercelDeployments.map(dep => (
                                    <tr key={dep.uid} className="hover:bg-gray-50">
                                        <td className="px-4 py-3 text-gray-900 font-medium">
                                            {dep.meta?.githubCommitMessage || 'Manual Deployment'}
                                            <div className="text-xs text-gray-500 font-mono mt-1">{dep.uid.substring(0, 8)}...</div>
                                        </td>
                                        <td className="px-4 py-3 text-gray-600">
                                            {dep.meta?.githubCommitRef ? (
                                                <span className="bg-gray-100 px-2 py-1 rounded text-xs font-mono">{dep.meta.githubCommitRef}</span>
                                            ) : '-'}
                                        </td>
                                        <td className="px-4 py-3">
                                            <span className={`px-2 py-1 rounded-full text-xs font-bold uppercase ${dep.state === 'READY' ? 'bg-green-100 text-green-800' : dep.state === 'ERROR' ? 'bg-red-100 text-red-800' : 'bg-blue-100 text-blue-800'}`}>
                                                {dep.state}
                                            </span>
                                        </td>
                                        <td className="px-4 py-3 text-gray-500">
                                            {new Date(dep.created).toLocaleString()}
                                        </td>
                                        <td className="px-4 py-3 text-right">
                                            <div className="flex justify-end space-x-2">
                                                <a href={`https://${dep.url}`} target="_blank" rel="noopener noreferrer" className="text-jam-orange hover:text-yellow-600 text-sm font-medium">Preview</a>
                                                {dep.state === 'READY' && (
                                                    <button 
                                                        onClick={() => {
                                                            setSelectedDeployment(dep);
                                                            setTargetVersion('');
                                                            setReleaseNotesInput(dep.meta?.githubCommitMessage || '');
                                                        }}
                                                        className="text-gray-700 hover:text-jam-black font-medium text-sm border px-2 py-1 rounded border-gray-200"
                                                    >
                                                        Promote
                                                    </button>
                                                )}
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {selectedDeployment && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
                    <div className="w-full max-w-lg overflow-hidden rounded-xl bg-white shadow-2xl animate-scale-in">
                        <div className="flex items-center justify-between border-b border-gray-100 bg-gray-50 p-6">
                            <div>
                                <h3 className="text-xl font-bold text-gray-900">Promote Deployment</h3>
                                <p className="text-sm text-gray-500">Attach production domain to selected build.</p>
                            </div>
                            <button onClick={() => setSelectedDeployment(null)} className="text-gray-400 hover:text-gray-600">
                                <Icons.Close className="h-6 w-6" />
                            </button>
                        </div>
                        <div className="p-6 space-y-4">
                            <div>
                                <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Target Version Number</label>
                                <input
                                    type="text"
                                    placeholder="e.g. 1.0.1"
                                    className="w-full border border-gray-300 rounded p-2"
                                    value={targetVersion}
                                    onChange={e => setTargetVersion(e.target.value)}
                                />
                            </div>
                            <div>
                                <label className="flex items-center space-x-2">
                                    <input 
                                        type="checkbox" 
                                        checked={skipAlias}
                                        onChange={e => setSkipAlias(e.target.checked)}
                                        className="form-checkbox h-4 w-4 text-jam-black rounded border-gray-300"
                                    />
                                    <span className="text-sm font-medium text-gray-700">Skip Vercel Aliasing (I use GitHub Auto-Deploy)</span>
                                </label>
                            </div>
                            {!skipAlias && (
                                <div>
                                    <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Production Domain</label>
                                    <input
                                        type="text"
                                        className="w-full border border-gray-300 rounded p-2 text-gray-500 bg-gray-50"
                                        value={productionDomain}
                                        onChange={e => setProductionDomain(e.target.value)}
                                    />
                                    <p className="text-xs text-gray-400 mt-1">The Vercel domain alias to assign this deployment to.</p>
                                </div>
                            )}
                            <div>
                                <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Release Notes</label>
                                <textarea
                                    rows={4}
                                    className="w-full border border-gray-300 rounded p-2"
                                    value={releaseNotesInput}
                                    onChange={e => setReleaseNotesInput(e.target.value)}
                                />
                            </div>
                        </div>
                        <div className="p-6 border-t border-gray-100 flex justify-end space-x-3 bg-gray-50">
                            <button onClick={() => setSelectedDeployment(null)} className="px-4 py-2 text-gray-500">Cancel</button>
                            <button 
                                onClick={handlePromoteDeployment}
                                disabled={isPromoting || !targetVersion || !productionDomain}
                                className="bg-jam-black text-white px-6 py-2 rounded font-bold hover:bg-gray-800 disabled:opacity-50"
                            >
                                {isPromoting ? 'Promoting...' : 'Confirm Rollout'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );

    const handleSendBroadcast = async () => {
        if (!broadcastForm.subject || !broadcastForm.bodyMarkdown) return;
        setIsSendingBroadcast(true);
        try {
            const { data, error } = await supabase!.functions.invoke('admin-handler', {
                body: { 
                    action: 'send-platform-broadcast',
                    payload: {
                        subject: broadcastForm.subject,
                        bodyMarkdown: broadcastForm.bodyMarkdown,
                        targetAudience: broadcastForm.audience
                    }
                }
            });
            if (error) throw error;
            toast.success(`Broadcast sent successfully to ${data.count} recipients!`);
            setBroadcastForm({ subject: '', audience: 'ALL_USERS', bodyMarkdown: '' });
            // Refresh broadcasts
            const { data: refreshed } = await supabase!.from('system_broadcasts').select('*').order('created_at', { ascending: false });
            if (refreshed) setBroadcasts(refreshed);
        } catch (err: any) {
            console.error('Broadcast error:', err);
            toast.error(err.message || 'Failed to send broadcast');
        } finally {
            setIsSendingBroadcast(false);
        }
    };

    const renderBroadcasts = () => (
        <div className="space-y-6 animate-fade-in grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
                <div className="mb-6">
                    <h3 className="text-lg font-bold text-gray-900">New Platform Broadcast</h3>
                    <p className="text-sm text-gray-500">Send an email update to the user base.</p>
                </div>
                
                <div className="space-y-4">
                    <div>
                        <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Subject</label>
                        <input
                            type="text"
                            placeholder="e.g. Platform Update: New Features!"
                            className="w-full border border-gray-300 rounded p-2"
                            value={broadcastForm.subject}
                            onChange={e => setBroadcastForm({ ...broadcastForm, subject: e.target.value })}
                        />
                    </div>
                    <div>
                        <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Target Audience</label>
                        <select
                            className="w-full border border-gray-300 rounded p-2 bg-white"
                            value={broadcastForm.audience}
                            onChange={e => setBroadcastForm({ ...broadcastForm, audience: e.target.value })}
                        >
                            <option value="ALL_USERS">All Active Users</option>
                            <option value="OWNERS_ONLY">Company Owners & Resellers Only</option>
                        </select>
                    </div>
                    <div>
                        <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Message (Markdown supported)</label>
                        <textarea
                            rows={8}
                            className="w-full border border-gray-300 rounded p-2 font-mono text-sm"
                            placeholder="Write your email body here..."
                            value={broadcastForm.bodyMarkdown}
                            onChange={e => setBroadcastForm({ ...broadcastForm, bodyMarkdown: e.target.value })}
                        />
                    </div>
                    
                    <button 
                        onClick={handleSendBroadcast}
                        disabled={isSendingBroadcast || !broadcastForm.subject || !broadcastForm.bodyMarkdown}
                        className="w-full bg-jam-black text-white px-6 py-3 rounded-lg font-bold hover:bg-gray-800 disabled:opacity-50 flex items-center justify-center transition-colors"
                    >
                        {isSendingBroadcast ? 'Sending...' : 'Send Broadcast'}
                        <Icons.ArrowRight className="w-4 h-4 ml-2" />
                    </button>
                </div>
            </div>

            <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
                <div className="mb-6">
                    <h3 className="text-lg font-bold text-gray-900">Past Broadcasts</h3>
                    <p className="text-sm text-gray-500">History of platform announcements.</p>
                </div>

                <div className="space-y-4 max-h-[600px] overflow-y-auto pr-2">
                    {broadcasts.length === 0 ? (
                        <div className="text-center py-12 text-gray-500 border-2 border-dashed border-gray-200 rounded-lg">
                            <Icons.Mail className="w-8 h-8 mx-auto mb-2 text-gray-300" />
                            <p className="text-sm">No past broadcasts found.</p>
                        </div>
                    ) : (
                        broadcasts.map(b => (
                            <div key={b.id} className="p-4 rounded-lg border border-gray-200 hover:border-gray-300 transition-colors bg-gray-50">
                                <div className="flex justify-between items-start mb-2">
                                    <h4 className="font-bold text-gray-900 line-clamp-1 flex-1 pr-4">{b.subject}</h4>
                                    <span className={`px-2 py-0.5 rounded-full text-xs font-bold uppercase shrink-0 ${b.status === 'COMPLETED' ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'}`}>
                                        {b.status}
                                    </span>
                                </div>
                                <div className="flex items-center text-xs text-gray-500 mb-3 space-x-4">
                                    <span>Audience: {b.target_audience === 'ALL_USERS' ? 'All Users' : 'Owners Only'}</span>
                                    <span>{new Date(b.created_at).toLocaleString()}</span>
                                </div>
                                <p className="text-sm text-gray-600 line-clamp-3 bg-white p-3 rounded border border-gray-100 font-mono text-xs">
                                    {b.body_markdown}
                                </p>
                            </div>
                        ))
                    )}
                </div>
            </div>
        </div>
    );

    const renderPendingPayments = () => (
        <div className="space-y-6 animate-fade-in">
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                <div className="p-6 border-b border-gray-100 bg-gray-50">
                    <h3 className="font-bold text-gray-900">Companies Pending Payment Approval</h3>
                    <p className="text-sm text-gray-600 mt-1">
                        These companies have signed up with Direct Deposit or Reseller Billing and are waiting for payment confirmation.
                    </p>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full">
                        <thead className="bg-gray-50">
                            <tr>
                                <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase text-left">Company</th>
                                <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase text-left">Contact</th>
                                <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase text-left">Plan</th>
                                <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase text-left">Amount</th>
                                <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase text-left">Signed Up</th>
                                <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {isLoadingPending ? (
                                <tr>
                                    <td colSpan={6} className="p-12 text-center text-gray-500">
                                        <div className="flex flex-col items-center">
                                            <Icons.Refresh className="w-8 h-8 animate-spin text-jam-orange mb-2" />
                                            <p>Loading pending payments...</p>
                                        </div>
                                    </td>
                                </tr>
                            ) : pendingPayments.length === 0 ? (
                                <tr>
                                    <td colSpan={6} className="p-12 text-center text-gray-500">
                                        <div className="flex flex-col items-center">
                                            <Icons.Check className="w-12 h-12 text-green-500 mb-2" />
                                            <p className="font-medium">All caught up!</p>
                                            <p className="text-sm">No pending payment approvals at the moment.</p>
                                        </div>
                                    </td>
                                </tr>
                            ) : (
                                pendingPayments.map((company) => (
                                    <tr key={company.id} className="hover:bg-gray-50 border-b border-gray-100">
                                        <td className="px-6 py-4">
                                            <div className="font-medium text-gray-900">{company.name}</div>
                                            <div className="text-xs text-gray-500">{company.email}</div>
                                        </td>
                                        <td className="px-6 py-4">
                                            <div className="text-sm text-gray-900">{company.owner_name || 'N/A'}</div>
                                            <div className="text-xs text-gray-500">{company.owner_email || company.email}</div>
                                        </td>
                                        <td className="px-6 py-4">
                                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                                                {company.plan || 'Starter'}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4">
                                            <div className="text-sm font-medium text-gray-900">
                                                JMD ${company.monthly_fee?.toLocaleString() || 'N/A'}
                                            </div>
                                            <div className="text-xs text-gray-500">per month</div>
                                        </td>
                                        <td className="px-6 py-4 text-sm text-gray-500">
                                            {company.created_at ? new Date(company.created_at).toLocaleDateString() : 'N/A'}
                                        </td>
                                        <td className="px-6 py-4 text-right">
                                            <button
                                                onClick={() => handleApprovePayment(company.id, company.name)}
                                                className="inline-flex items-center px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white text-sm font-medium rounded transition-colors"
                                            >
                                                <Icons.Check className="w-4 h-4 mr-1" />
                                                Approve
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

    const renderPayingClients = () => {
        const filteredClients = getSortedByClientActivity(payingClients.filter((client) => {
            const query = payingClientSearch.trim().toLowerCase();
            const matchesSearch = !query
                || client.companyName.toLowerCase().includes(query)
                || client.adminEmail.toLowerCase().includes(query)
                || client.adminName.toLowerCase().includes(query);
            const matchesPlan = payingClientPlanFilter === 'ALL' || client.plan === payingClientPlanFilter;
            const matchesRisk = payingClientRiskFilter === 'ALL' || client.risk === payingClientRiskFilter;
            return matchesSearch && matchesPlan && matchesRisk;
        }), payingClientActivitySort);

        const totalClientMRR = filteredClients.filter(c => !c.isTestCompany).reduce((sum, client) => sum + Number(client.mrr || 0), 0);
        const totalClientARR = totalClientMRR * 12;
        const clientsNeedingAttention = filteredClients.filter((client) => !client.isTestCompany && client.risk !== 'ok').length;
        const clientsWithCards = filteredClients.filter((client) => !client.isTestCompany && client.paymentMethod !== 'No card on file').length;
        const realClientCount = filteredClients.filter(c => !c.isTestCompany).length;
        const testClientCount = filteredClients.filter(c => c.isTestCompany).length;

        const riskClasses: Record<PayingClient['risk'], string> = {
            ok: 'bg-green-100 text-green-800',
            attention: 'bg-amber-100 text-amber-800',
            critical: 'bg-red-100 text-red-800'
        };

        return (
            <div className="space-y-6 animate-fade-in">
                <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
                    <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-200">
                        <p className="text-xs text-gray-500 uppercase font-bold mb-1">Paying Clients</p>
                        <p className="text-2xl font-bold text-gray-900">{realClientCount}</p>
                        {testClientCount > 0 && <p className="text-xs text-gray-400 mt-1">{testClientCount} test excluded</p>}
                    </div>
                    <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-200">
                        <p className="text-xs text-gray-500 uppercase font-bold mb-1">Filtered MRR</p>
                        <p className="text-2xl font-bold text-jam-orange">JMD {totalClientMRR.toLocaleString()}</p>
                    </div>
                    <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-200">
                        <p className="text-xs text-gray-500 uppercase font-bold mb-1">Filtered ARR</p>
                        <p className="text-2xl font-bold text-jam-orange">JMD {totalClientARR.toLocaleString()}</p>
                    </div>
                    <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-200">
                        <p className="text-xs text-gray-500 uppercase font-bold mb-1">Cards On File</p>
                        <p className="text-2xl font-bold text-green-600">{clientsWithCards}</p>
                    </div>
                    <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-200">
                        <p className="text-xs text-gray-500 uppercase font-bold mb-1">Needs Attention</p>
                        <p className={`text-2xl font-bold ${clientsNeedingAttention > 0 ? 'text-amber-600' : 'text-gray-900'}`}>{clientsNeedingAttention}</p>
                    </div>
                </div>

                <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                    <div className="p-4 border-b border-gray-100 bg-gray-50 flex flex-col lg:flex-row lg:items-center gap-3 justify-between">
                        <div>
                            <h3 className="font-bold text-gray-900">Paying Clients</h3>
                            <p className="text-sm text-gray-600 mt-1">Operational billing view for active paid workspaces, card status, access dates, and DimePay ledger state.</p>
                        </div>
                        <div className="flex flex-col sm:flex-row gap-3">
                            <div className="relative min-w-[260px]">
                                <Icons.Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
                                <input
                                    type="text"
                                    placeholder="Search company or admin..."
                                    className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-jam-orange"
                                    value={payingClientSearch}
                                    onChange={(event) => setPayingClientSearch(event.target.value)}
                                />
                            </div>
                            <select
                                className="px-3 py-2 border border-gray-300 rounded-lg bg-white text-sm focus:outline-none focus:ring-2 focus:ring-jam-orange"
                                value={payingClientPlanFilter}
                                onChange={(event) => setPayingClientPlanFilter(event.target.value as any)}
                            >
                                <option value="ALL">All Plans</option>
                                <option value="Starter">Starter</option>
                                <option value="Pro">Pro</option>
                                <option value="Enterprise">Enterprise</option>
                                <option value="Reseller">Reseller</option>
                            </select>
                            <select
                                className="px-3 py-2 border border-gray-300 rounded-lg bg-white text-sm focus:outline-none focus:ring-2 focus:ring-jam-orange"
                                value={payingClientRiskFilter}
                                onChange={(event) => setPayingClientRiskFilter(event.target.value as any)}
                            >
                                <option value="ALL">All Risk</option>
                                <option value="ok">Healthy</option>
                                <option value="attention">Attention</option>
                                <option value="critical">Critical</option>
                            </select>
                            <select
                                className="px-3 py-2 border border-gray-300 rounded-lg bg-white text-sm focus:outline-none focus:ring-2 focus:ring-jam-orange"
                                value={payingClientActivitySort}
                                onChange={(event) => setPayingClientActivitySort(event.target.value as ClientActivitySort)}
                            >
                                <option value="created_desc">Newest signups</option>
                                <option value="created_asc">Oldest signups</option>
                                <option value="last_login_desc">Recent logins</option>
                                <option value="last_login_asc">Oldest logins</option>
                            </select>
                        </div>
                    </div>

                    <div className="overflow-x-auto">
                        <table className="w-full text-left">
                            <thead className="bg-gray-50 border-b border-gray-200">
                                <tr>
                                    <th className="px-5 py-4 text-xs font-bold text-gray-500 uppercase">Company</th>
                                    <th className="px-5 py-4 text-xs font-bold text-gray-500 uppercase">Admin</th>
                                    <th className="px-5 py-4 text-xs font-bold text-gray-500 uppercase">Plan</th>
                                    <th className="px-5 py-4 text-xs font-bold text-gray-500 uppercase">MRR</th>
                                    <th className="px-5 py-4 text-xs font-bold text-gray-500 uppercase">Payment</th>
                                    <th className="px-5 py-4 text-xs font-bold text-gray-500 uppercase">Activity</th>
                                    <th className="px-5 py-4 text-xs font-bold text-gray-500 uppercase">Access</th>
                                    <th className="px-5 py-4 text-xs font-bold text-gray-500 uppercase">Ledger</th>
                                    <th className="px-5 py-4 text-xs font-bold text-gray-500 uppercase text-right">Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {isLoadingPayingClients ? (
                                    <tr>
                                        <td colSpan={9} className="p-12 text-center text-gray-500">
                                            <Icons.Refresh className="w-8 h-8 animate-spin text-jam-orange mx-auto mb-2" />
                                            Loading paying clients...
                                        </td>
                                    </tr>
                                ) : filteredClients.length === 0 ? (
                                    <tr>
                                        <td colSpan={9} className="p-12 text-center text-gray-500">
                                            No paying clients match the current filters.
                                        </td>
                                    </tr>
                                ) : (
                                    filteredClients.map((client) => (
                                        <tr
                                            key={client.id}
                                            onClick={() => setSelectedPayingClient(client)}
                                            className={`cursor-pointer hover:bg-gray-50 border-b border-gray-100 last:border-0 ${client.isTestCompany ? 'opacity-60' : ''}`}
                                        >
                                            <td className="px-5 py-4">
                                                <div className="flex items-center gap-2">
                                                    <span className="font-medium text-gray-900">{client.companyName}</span>
                                                    {client.isTestCompany && (
                                                        <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold uppercase bg-purple-100 text-purple-700">🧪 Test</span>
                                                    )}
                                                </div>
                                                <div className="text-xs text-gray-500">{client.activeEmployees} active employees</div>
                                            </td>
                                            <td className="px-5 py-4">
                                                <div className="text-sm text-gray-900">{client.adminName}</div>
                                                <div className="text-xs text-gray-500">{client.adminEmail}</div>
                                                {client.adminPhone && <div className="text-xs text-gray-400">{client.adminPhone}</div>}
                                            </td>
                                            <td className="px-5 py-4">
                                                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                                                    {client.plan}
                                                </span>
                                                <div className="mt-2">
                                                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${riskClasses[client.risk]}`}>
                                                        {client.risk === 'ok' ? 'Healthy' : client.risk === 'attention' ? 'Attention' : 'Critical'}
                                                    </span>
                                                </div>
                                            </td>
                                            <td className="px-5 py-4">
                                                <div className="text-sm font-bold text-gray-900">JMD {client.mrr.toLocaleString()}</div>
                                                <div className="text-xs text-gray-500">ARR JMD {client.arr.toLocaleString()}</div>
                                            </td>
                                            <td className="px-5 py-4">
                                                <div className="text-sm text-gray-900">{client.paymentMethod}</div>
                                                <div
                                                    className="text-xs text-gray-500"
                                                    title={client.dimeSubscriptionId
                                                        ? 'DimePay has an active recurring subscription schedule for this company.'
                                                        : 'No automated recurring DimePay subscription schedule is attached yet. This usually means the company is on manual, reseller, legacy, or pending card-binding billing.'}
                                                >
                                                    {client.dimeSubscriptionId ? `Schedule ${client.dimeSubscriptionId}` : 'No recurring DimePay schedule'}
                                                </div>
                                                {client.lastPaymentDate && (
                                                    <div className="text-xs text-gray-400">
                                                        Last paid {new Date(client.lastPaymentDate).toLocaleDateString()}
                                                    </div>
                                                )}
                                            </td>
                                            <td className="px-5 py-4">
                                                <div className="text-sm text-gray-900">{formatActivityDate(client.lastLoginAt)}</div>
                                                <div className="text-xs text-gray-500">Created {formatActivityDate(client.accountCreatedAt || client.createdAt, 'N/A')}</div>
                                            </td>
                                            <td className="px-5 py-4">
                                                <div className="text-sm text-gray-900">{client.subscriptionStatus || client.status}</div>
                                                <div className="text-xs text-gray-500">
                                                    {client.accessUntil ? `Until ${new Date(client.accessUntil).toLocaleDateString()}` : 'No access date'}
                                                </div>
                                            </td>
                                            <td className="px-5 py-4">
                                                <div className="text-sm text-gray-900">{client.latestLedgerState || 'No events'}</div>
                                                <div className="text-xs text-gray-500">{client.latestLedgerEventType || 'Awaiting DimePay event'}</div>
                                            </td>
                                            <td className="px-5 py-4 text-right">
                                                <div className="flex justify-end gap-2">
                                                    <button
                                                        onClick={(event) => {
                                                            event.stopPropagation();
                                                            handleCreateClientEmail(client);
                                                        }}
                                                        className="inline-flex items-center justify-center w-9 h-9 rounded-lg border border-gray-200 text-gray-600 hover:text-jam-orange hover:border-jam-orange"
                                                        title="Create email"
                                                    >
                                                        <Icons.Mail className="w-4 h-4" />
                                                    </button>
                                                    <button
                                                        onClick={(event) => {
                                                            event.stopPropagation();
                                                            handleManagePayingClient(client);
                                                        }}
                                                        className="inline-flex items-center justify-center w-9 h-9 rounded-lg border border-gray-200 text-gray-600 hover:text-jam-orange hover:border-jam-orange"
                                                        title="Manage company"
                                                    >
                                                        <Icons.ExternalLink className="w-4 h-4" />
                                                    </button>
                                                </div>
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

    const renderBilling = () => (
        <div className="space-y-6 animate-fade-in">
            {/* Stats Cards */}
            <div className="grid grid-cols-1 md:grid-cols-6 gap-4">
                <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-200">
                    <p className="text-xs text-gray-500 uppercase font-bold mb-1">Total Revenue</p>
                    <p className="text-2xl font-bold text-gray-900">${billingStats.totalRevenue.toLocaleString()}</p>
                </div>
                <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-200">
                    <p className="text-xs text-gray-500 uppercase font-bold mb-1">MRR</p>
                    <p className="text-2xl font-bold text-jam-orange">${billingStats.monthlyRecurringRevenue.toLocaleString()}</p>
                </div>
                <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-200">
                    <p className="text-xs text-gray-500 uppercase font-bold mb-1">ARR</p>
                    <p className="text-2xl font-bold text-jam-orange">${billingStats.annualRecurringRevenue.toLocaleString()}</p>
                </div>
                <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-200">
                    <p className="text-xs text-gray-500 uppercase font-bold mb-1">Total Subs</p>
                    <p className="text-2xl font-bold text-gray-900">{billingStats.totalSubscriptions}</p>
                </div>
                <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-200">
                    <p className="text-xs text-gray-500 uppercase font-bold mb-1">Active Subs</p>
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
                    <h3 className="font-bold text-gray-900">Platform Revenue</h3>
                    <div className="flex items-center space-x-4">
                        {isLoadingBilling && (
                            <div className="flex items-center text-sm text-gray-500">
                                <Icons.Refresh className="w-4 h-4 mr-2 animate-spin" />
                                Loading...
                            </div>
                        )}
                        <select
                            value={revenueFilter}
                            onChange={(e) => setRevenueFilter(e.target.value as any)}
                            className="text-sm font-medium bg-gray-50 border border-gray-300 text-gray-700 rounded-lg focus:ring-jam-orange focus:border-jam-orange block p-2"
                        >
                            <option value="month">Last 30 Days</option>
                            <option value="quarter">This Quarter</option>
                            <option value="6M">Last 6 Months</option>
                            <option value="year">Last 12 Months</option>
                            <option value="all">All Time</option>
                        </select>
                    </div>
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
                                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#9CA3AF' }} dy={10} />
                                <YAxis axisLine={false} tickLine={false} tick={{ fill: '#9CA3AF' }} tickFormatter={(val) => `$${val / 1000}k`} />
                                <Tooltip
                                    cursor={{ stroke: '#F3F4F6' }}
                                    formatter={(val: number) => [`$${val.toLocaleString()}`, 'Revenue']}
                                    contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)' }}
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
                    {plans.map(plan => {
                        // Helper function to render price based on pricing type
                        const renderPlanPrice = () => {
                            if (plan.priceConfig.type === 'free') {
                                return (
                                    <div>
                                        <div className="text-2xl font-bold text-gray-900">$0</div>
                                        <div className="text-xs text-gray-500 mt-1">Free forever</div>
                                    </div>
                                );
                            }

                            if (plan.priceConfig.type === 'flat') {
                                const monthly = plan.priceConfig.monthly || 0;
                                return (
                                    <div>
                                        <div className="text-2xl font-bold text-gray-900">
                                            ${monthly.toLocaleString()}
                                            <span className="text-sm font-normal text-gray-500">/mo</span>
                                        </div>
                                    </div>
                                );
                            }

                            if (plan.priceConfig.type === 'per_emp') {
                                const perEmp = plan.priceConfig.monthly || plan.priceConfig.perUserFee || 0;
                                return (
                                    <div>
                                        <div className="text-2xl font-bold text-gray-900">
                                            ${perEmp.toLocaleString()}
                                            <span className="text-sm font-normal text-gray-500">/emp/mo</span>
                                        </div>
                                    </div>
                                );
                            }

                            if (plan.priceConfig.type === 'base') {
                                // Base fee plans (Starter, Pro, Reseller) - show base + per employee
                                const baseFee = plan.priceConfig.monthly || plan.priceConfig.baseFee || 0;
                                const perEmpFee = plan.priceConfig.perUserFee || 0;
                                return (
                                    <div>
                                        <div className="text-2xl font-bold text-gray-900">
                                            ${baseFee.toLocaleString()}
                                            <span className="text-sm font-normal text-gray-500">/mo base</span>
                                        </div>
                                        {perEmpFee > 0 && (
                                            <div className="text-xs text-gray-500 mt-1">
                                                + ${perEmpFee.toLocaleString()} per employee
                                            </div>
                                        )}
                                    </div>
                                );
                            }

                            // Fallback
                            return (
                                <div>
                                    <div className="text-2xl font-bold text-gray-900">$0</div>
                                </div>
                            );
                        };

                        return (
                            <div key={plan.id} className={`p-6 rounded-xl border-2 transition-all ${plan.isActive ? 'bg-white border-gray-200' : 'bg-gray-50 border-gray-100 opacity-75'}`}>
                                <div className="flex justify-between items-start mb-4">
                                    <h3 className="font-bold text-lg text-gray-900">{plan.name}</h3>
                                    <div className={`w-3 h-3 rounded-full ${plan.isActive ? 'bg-green-500' : 'bg-gray-300'}`}></div>
                                </div>
                                <div className="mb-4">
                                    {renderPlanPrice()}
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
                                        title={plan.isActive ? 'Deactivate plan' : 'Activate plan'}
                                    >
                                        <Icons.Zap className="w-4 h-4" />
                                    </button>
                                    <button
                                        onClick={() => handleDeletePlan(plan)}
                                        className="px-3 py-2 rounded border text-red-600 border-red-200 hover:bg-red-50"
                                        title="Delete plan"
                                    >
                                        <Icons.Trash className="w-4 h-4" />
                                    </button>
                                </div>
                            </div>
                        );
                    })}
                </div>

            </div>
        );
    };

    const renderSettings = () => (
        <div className="grid grid-cols-1 gap-6 animate-fade-in">
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
                    <div className={`p-4 rounded-lg border ${dbStatus?.connected
                        ? 'bg-green-50 border-green-200'
                        : 'bg-red-50 border-red-200'
                        }`}>
                        <div className="flex items-start">
                            <div className={`p-2 rounded-full mr-3 ${dbStatus?.connected ? 'bg-green-100 text-green-600' : 'bg-red-100 text-red-600'
                                }`}>
                                {dbStatus?.connected ? <Icons.CheckCircle className="w-5 h-5" /> : <Icons.Alert className="w-5 h-5" />}
                            </div>
                            <div>
                                <h4 className={`font-bold text-sm ${dbStatus?.connected ? 'text-green-800' : 'text-red-800'
                                    }`}>
                                    {dbStatus?.message || 'Not Checked'}
                                </h4>
                                <p className={`text-xs mt-1 ${dbStatus?.connected ? 'text-green-600' : 'text-red-600'
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
                        <div className={`p-3 rounded-lg border ${dimePayStatus.borderClass}`}>
                            <div className="flex items-center justify-between">
                                <div className="flex items-center">
                                    <div className={`p-1.5 rounded-full mr-2 ${dimePayStatus.iconClass}`}>
                                        {dimePayStatus.icon === 'check' && <Icons.CheckCircle className="w-4 h-4" />}
                                        {dimePayStatus.icon === 'alert' && <Icons.Alert className="w-4 h-4" />}
                                        {dimePayStatus.icon === 'close' && <Icons.Close className="w-4 h-4" />}
                                    </div>
                                    <div>
                                        <h4 className="font-semibold text-sm text-gray-900">DimePay</h4>
                                        <p className="text-xs text-gray-600">{dimePayStatus.description}</p>
                                    </div>
                                </div>
                                <span className={`text-xs px-2 py-1 rounded font-medium ${dimePayStatus.badgeClass}`}>
                                    {dimePayStatus.label}
                                </span>
                            </div>
                        </div>

                        {/* Stripe Status */}
                        <div className={`p-3 rounded-lg border ${paymentConfig.stripe?.enabled && paymentConfig.stripe?.publishableKey && paymentConfig.stripe?.secretKey
                            ? 'bg-green-50 border-green-200'
                            : paymentConfig.stripe?.enabled
                                ? 'bg-yellow-50 border-yellow-200'
                                : 'bg-gray-50 border-gray-200'
                            }`}>
                            <div className="flex items-center justify-between">
                                <div className="flex items-center">
                                    <div className={`p-1.5 rounded-full mr-2 ${paymentConfig.stripe?.enabled && paymentConfig.stripe?.publishableKey && paymentConfig.stripe?.secretKey
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
                                <span className={`text-xs px-2 py-1 rounded font-medium ${paymentConfig.stripe?.enabled && paymentConfig.stripe?.publishableKey && paymentConfig.stripe?.secretKey
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
                        <div className={`p-3 rounded-lg border ${paymentConfig.paypal?.enabled && paymentConfig.paypal?.clientId && paymentConfig.paypal?.secret
                            ? 'bg-green-50 border-green-200'
                            : paymentConfig.paypal?.enabled
                                ? 'bg-yellow-50 border-yellow-200'
                                : 'bg-gray-50 border-gray-200'
                            }`}>
                            <div className="flex items-center justify-between">
                                <div className="flex items-center">
                                    <div className={`p-1.5 rounded-full mr-2 ${paymentConfig.paypal?.enabled && paymentConfig.paypal?.clientId && paymentConfig.paypal?.secret
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
                                <span className={`text-xs px-2 py-1 rounded font-medium ${paymentConfig.paypal?.enabled && paymentConfig.paypal?.clientId && paymentConfig.paypal?.secret
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

                {/* Support Email Configuration */}
                <div className="mb-6 bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                    <div className="flex justify-between items-start mb-4">
                        <div>
                            <h3 className="text-sm font-bold text-gray-900">Support Email</h3>
                            <p className="text-xs text-gray-500">Where Contact Us messages are delivered</p>
                        </div>
                    </div>
                    <div>
                        <label className="block text-xs font-bold text-gray-600 uppercase mb-1">Support Inbox</label>
                        <input
                            type="email"
                            value={paymentConfig.supportEmail || ''}
                            onChange={(e) => setPaymentConfig({
                                ...paymentConfig,
                                supportEmail: e.target.value
                            })}
                            placeholder="support@yourdomain.com"
                            className="w-full border border-gray-300 rounded p-2 text-sm"
                        />
                        <p className="text-xs text-gray-500 mt-2">
                            This email address will receive Contact Support clicks and Contact Us form submissions.
                        </p>
                    </div>
                </div>

                {/* Bank Transfer Configuration */}
                <div className="mb-6 bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                    <div className="flex justify-between items-start mb-4">
                        <div>
                            <h3 className="text-sm font-bold text-gray-900">Bank Transfer Details</h3>
                            <p className="text-xs text-gray-500">Shown to clients who choose bank transfer during signup.</p>
                        </div>
                        <label className="flex items-center gap-2 text-xs font-bold uppercase text-gray-500">
                            <input
                                type="checkbox"
                                checked={paymentConfig.bankTransfer?.enabled ?? true}
                                onChange={(e) => setPaymentConfig({
                                    ...paymentConfig,
                                    bankTransfer: {
                                        enabled: e.target.checked,
                                        bankName: paymentConfig.bankTransfer?.bankName || 'NCB (National Commercial Bank)',
                                        accountName: paymentConfig.bankTransfer?.accountName || 'Balance Investments Limited',
                                        accountNumber: paymentConfig.bankTransfer?.accountNumber || '404286331',
                                        accountType: paymentConfig.bankTransfer?.accountType || 'Savings Account',
                                        branch: paymentConfig.bankTransfer?.branch || 'UWI Branch',
                                        instructions: paymentConfig.bankTransfer?.instructions || ''
                                    }
                                })}
                                className="h-4 w-4 text-jam-orange focus:ring-jam-orange"
                            />
                            Enabled
                        </label>
                    </div>
                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                        {[
                            ['Bank Name', 'bankName', 'NCB (National Commercial Bank)'],
                            ['Account Name', 'accountName', 'Balance Investments Limited'],
                            ['Account Number', 'accountNumber', '404286331'],
                            ['Account Type', 'accountType', 'Savings Account'],
                            ['Branch', 'branch', 'UWI Branch'],
                        ].map(([label, key, fallback]) => (
                            <div key={key}>
                                <label className="block text-xs font-bold text-gray-600 uppercase mb-1">{label}</label>
                                <input
                                    type="text"
                                    value={(paymentConfig.bankTransfer as any)?.[key] || ''}
                                    onChange={(e) => setPaymentConfig({
                                        ...paymentConfig,
                                        bankTransfer: {
                                            enabled: paymentConfig.bankTransfer?.enabled ?? true,
                                            bankName: paymentConfig.bankTransfer?.bankName || 'NCB (National Commercial Bank)',
                                            accountName: paymentConfig.bankTransfer?.accountName || 'Balance Investments Limited',
                                            accountNumber: paymentConfig.bankTransfer?.accountNumber || '404286331',
                                            accountType: paymentConfig.bankTransfer?.accountType || 'Savings Account',
                                            branch: paymentConfig.bankTransfer?.branch || 'UWI Branch',
                                            instructions: paymentConfig.bankTransfer?.instructions || '',
                                            [key]: e.target.value || fallback,
                                        }
                                    })}
                                    className="w-full border border-gray-300 rounded p-2 text-sm"
                                />
                            </div>
                        ))}
                        <div className="md:col-span-2">
                            <label className="block text-xs font-bold text-gray-600 uppercase mb-1">Instructions</label>
                            <textarea
                                rows={3}
                                value={paymentConfig.bankTransfer?.instructions || ''}
                                onChange={(e) => setPaymentConfig({
                                    ...paymentConfig,
                                    bankTransfer: {
                                        enabled: paymentConfig.bankTransfer?.enabled ?? true,
                                        bankName: paymentConfig.bankTransfer?.bankName || 'NCB (National Commercial Bank)',
                                        accountName: paymentConfig.bankTransfer?.accountName || 'Balance Investments Limited',
                                        accountNumber: paymentConfig.bankTransfer?.accountNumber || '404286331',
                                        accountType: paymentConfig.bankTransfer?.accountType || 'Savings Account',
                                        branch: paymentConfig.bankTransfer?.branch || 'UWI Branch',
                                        instructions: e.target.value
                                    }
                                })}
                                placeholder="After making the deposit, your account will be activated within 24 hours."
                                className="w-full border border-gray-300 rounded p-2 text-sm"
                            />
                        </div>
                    </div>
                </div>

                {/* Growth Analytics Configuration */}
                <div className="mb-6 bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                    <div className="flex justify-between items-start mb-4">
                        <div>
                            <h3 className="text-sm font-bold text-gray-900">Growth Analytics</h3>
                            <p className="text-xs text-gray-500">Monthly signup target used by the Super Admin overview.</p>
                        </div>
                    </div>
                    <div>
                        <label className="block text-xs font-bold text-gray-600 uppercase mb-1">Monthly Signup Goal</label>
                        <input
                            type="number"
                            min="1"
                            value={paymentConfig.monthlySignupGoal || 10}
                            onChange={(e) => setPaymentConfig({
                                ...paymentConfig,
                                monthlySignupGoal: Math.max(1, parseInt(e.target.value, 10) || 10)
                            })}
                            className="w-full border border-gray-300 rounded p-2 text-sm"
                        />
                        <p className="text-xs text-gray-500 mt-2">
                            Current-month company signups are compared against this target in Growth & Analytics.
                        </p>
                    </div>
                </div>

                {/* WhatsApp Support Widget Configuration */}
                <div className="mb-6 bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                    <div className="flex justify-between items-start mb-4">
                        <div>
                            <h3 className="text-sm font-bold text-gray-900">WhatsApp Support Widget</h3>
                            <p className="text-xs text-gray-500">Floating support shortcut shown inside the app</p>
                        </div>
                        <label className="flex items-center gap-2 text-xs font-bold uppercase text-gray-500">
                            <input
                                type="checkbox"
                                checked={paymentConfig.supportWidget?.enabled || false}
                                onChange={(e) => setPaymentConfig({
                                    ...paymentConfig,
                                    supportWidget: {
                                        enabled: e.target.checked,
                                        whatsappUrl: paymentConfig.supportWidget?.whatsappUrl || 'https://wa.me/18765550123',
                                        position: paymentConfig.supportWidget?.position || 'bottom-right',
                                        customCss: paymentConfig.supportWidget?.customCss || ''
                                    }
                                })}
                                className="h-4 w-4 text-jam-orange focus:ring-jam-orange"
                            />
                            Visible
                        </label>
                    </div>
                    <div className="space-y-4">
                        <div>
                            <label className="block text-xs font-bold text-gray-600 uppercase mb-1">WhatsApp Link Target</label>
                            <input
                                type="url"
                                value={paymentConfig.supportWidget?.whatsappUrl || ''}
                                onChange={(e) => setPaymentConfig({
                                    ...paymentConfig,
                                    supportWidget: {
                                        enabled: paymentConfig.supportWidget?.enabled || false,
                                        whatsappUrl: e.target.value,
                                        position: paymentConfig.supportWidget?.position || 'bottom-right',
                                        customCss: paymentConfig.supportWidget?.customCss || ''
                                    }
                                })}
                                placeholder="https://wa.me/18765550123"
                                className="w-full border border-gray-300 rounded p-2 text-sm"
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-gray-600 uppercase mb-1">Placement</label>
                            <select
                                value={paymentConfig.supportWidget?.position || 'bottom-right'}
                                onChange={(e) => setPaymentConfig({
                                    ...paymentConfig,
                                    supportWidget: {
                                        enabled: paymentConfig.supportWidget?.enabled || false,
                                        whatsappUrl: paymentConfig.supportWidget?.whatsappUrl || 'https://wa.me/18765550123',
                                        position: e.target.value as NonNullable<GlobalConfig['supportWidget']>['position'],
                                        customCss: paymentConfig.supportWidget?.customCss || ''
                                    }
                                })}
                                className="w-full border border-gray-300 rounded p-2 text-sm"
                            >
                                <option value="top-left">Top Left</option>
                                <option value="top-right">Top Right</option>
                                <option value="bottom-left">Bottom Left</option>
                                <option value="bottom-right">Bottom Right</option>
                            </select>
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-gray-600 uppercase mb-1">Custom CSS</label>
                            <textarea
                                rows={5}
                                value={paymentConfig.supportWidget?.customCss || ''}
                                onChange={(e) => setPaymentConfig({
                                    ...paymentConfig,
                                    supportWidget: {
                                        enabled: paymentConfig.supportWidget?.enabled || false,
                                        whatsappUrl: paymentConfig.supportWidget?.whatsappUrl || 'https://wa.me/18765550123',
                                        position: paymentConfig.supportWidget?.position || 'bottom-right',
                                        customCss: e.target.value
                                    }
                                })}
                                placeholder=".payroll-jam-support-widget { background: #25D366; }"
                                className="w-full border border-gray-300 rounded p-2 text-sm font-mono"
                            />
                        </div>
                    </div>
                </div>

                <div className="mb-6">
                    <div className="mb-3">
                        <h3 className="text-sm font-bold text-gray-900">Global Tax Defaults</h3>
                        <p className="text-xs text-gray-500">
                            Platform-wide Jamaican statutory defaults used when a company has not saved its own tax override.
                        </p>
                    </div>
                    <TaxConfigCard
                        config={paymentConfig.taxConfig || DEFAULT_ORG_TAX_CONFIG}
                        onSave={handleSaveGlobalTaxConfig}
                    />
                </div>

                {/* Data Source Toggle */}
                <div className="hidden">
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
                    <input type="checkbox" checked={paymentConfig.maintenanceMode} onChange={(e) => handleToggleMaintenance(e.target.checked)} className="h-5 w-5 text-jam-orange focus:ring-jam-orange" />
                </div>
                {/* Added Save Button */}
                <button
                    onClick={async () => {
                        try {
                            await CompanyService.saveGlobalConfig(paymentConfig);
                            toast.success("Platform settings saved successfully");
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
            <div className="hidden">
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
                                    onChange={(e) => setPaymentConfig({ ...paymentConfig, paypal: { ...paymentConfig.paypal, clientId: e.target.value } })}
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
                                onChange={(e) => setPaymentConfig({ ...paymentConfig, emailjs: { serviceId: e.target.value, templateId: paymentConfig.emailjs?.templateId || '', publicKey: paymentConfig.emailjs?.publicKey || '' } })}
                                className="w-full border border-gray-300 rounded p-2 text-sm"
                            />
                            <input
                                type="text"
                                placeholder="Template ID"
                                value={paymentConfig.emailjs?.templateId || ''}
                                onChange={(e) => setPaymentConfig({ ...paymentConfig, emailjs: { serviceId: paymentConfig.emailjs?.serviceId || '', templateId: e.target.value, publicKey: paymentConfig.emailjs?.publicKey || '' } })}
                                className="w-full border border-gray-300 rounded p-2 text-sm"
                            />
                            <input
                                type="password"
                                placeholder="Public Key"
                                value={paymentConfig.emailjs?.publicKey || ''}
                                onChange={(e) => setPaymentConfig({ ...paymentConfig, emailjs: { serviceId: paymentConfig.emailjs?.serviceId || '', templateId: paymentConfig.emailjs?.templateId || '', publicKey: e.target.value } })}
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
                            <button onClick={() => setConnectWizard({ ...connectWizard, open: false })} className="text-gray-400 hover:text-white">
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
                                        onClick={() => setConnectWizard({ ...connectWizard, step: 4 })}
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
                                            onChange={e => setManualCreds({ ...manualCreds, url: e.target.value })}
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Anon Key</label>
                                        <input
                                            type="text"
                                            className="w-full border border-gray-300 rounded p-2 text-sm"
                                            placeholder="eyJh..."
                                            value={manualCreds.key}
                                            onChange={e => setManualCreds({ ...manualCreds, key: e.target.value })}
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
                                <button onClick={() => setConnectWizard({ ...connectWizard, open: false })} className="text-gray-500">Cancel</button>
                            ) : (
                                <button onClick={() => setConnectWizard({ ...connectWizard, step: 1 })} className="text-gray-500">Back</button>
                            )}

                            {connectWizard.step < 3 && connectWizard.step !== 4 && (
                                <button onClick={() => setConnectWizard({ ...connectWizard, step: connectWizard.step + 1 })} className="bg-jam-black text-white px-4 py-2 rounded">Next</button>
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

            {/* Content Area */}
            <div className="min-h-[600px] mt-8">
                {activeTab === 'overview' && renderOverview()}
                {activeTab === 'tenants' && renderTenants()}
                {activeTab === 'paying-clients' && renderPayingClients()}
                {activeTab === 'pending-payments' && renderPendingPayments()}
                {activeTab === 'users' && renderAdmins()}
                {activeTab === 'releases' && renderReleases()}
                {activeTab === 'broadcasts' && renderBroadcasts()}
                {activeTab === 'logs' && renderLogs()}
                {activeTab === 'settings' && renderSettings()}
                {activeTab === 'health' && renderHealth()}
                {activeTab === 'billing' && renderBilling()}
                {activeTab === 'plans' && renderPlans()}
            </div>
            {selectedPayingClient && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
                    <div className="w-full max-w-4xl max-h-[90vh] overflow-y-auto rounded-xl bg-white shadow-2xl animate-scale-in">
                        <div className="sticky top-0 z-10 flex items-start justify-between border-b border-gray-100 bg-gray-50 p-6">
                            <div>
                                <div className="flex items-center gap-3">
                                    <h3 className="text-xl font-bold text-gray-900">{selectedPayingClient.companyName}</h3>
                                    {selectedPayingClient.isTestCompany && (
                                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-bold uppercase bg-purple-100 text-purple-700">🧪 Test</span>
                                    )}
                                </div>
                                <p className="mt-1 text-sm text-gray-500">
                                    Paying customer details, activity, billing notes, and support signals.
                                </p>
                            </div>
                            <div className="flex items-center gap-4">
                                <label className="flex items-center gap-2 cursor-pointer select-none" title="Flag as test company — excluded from revenue metrics">
                                    <span className="text-xs font-medium text-gray-500">Test Company</span>
                                    <button
                                        type="button"
                                        role="switch"
                                        aria-checked={selectedPayingClient.isTestCompany || false}
                                        onClick={() => handleToggleTestCompany(selectedPayingClient.id, !selectedPayingClient.isTestCompany)}
                                        className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${selectedPayingClient.isTestCompany ? 'bg-purple-500' : 'bg-gray-300'}`}
                                    >
                                        <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${selectedPayingClient.isTestCompany ? 'translate-x-[18px]' : 'translate-x-[3px]'}`} />
                                    </button>
                                </label>
                                <button onClick={() => setSelectedPayingClient(null)} className="text-gray-400 hover:text-gray-600">
                                    <Icons.Close className="h-6 w-6" />
                                </button>
                            </div>
                        </div>

                        <div className="space-y-6 p-6">
                            <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
                                <div className="rounded-xl border border-gray-200 p-4">
                                    <p className="text-xs font-bold uppercase text-gray-500">Plan</p>
                                    <p className="mt-1 text-lg font-bold text-gray-900">{selectedPayingClient.plan}</p>
                                    <p className="text-xs text-gray-500">{selectedPayingClient.subscriptionStatus || selectedPayingClient.status}</p>
                                </div>
                                <div className="rounded-xl border border-gray-200 p-4">
                                    <p className="text-xs font-bold uppercase text-gray-500">MRR</p>
                                    <p className="mt-1 text-lg font-bold text-jam-orange">JMD {selectedPayingClient.mrr.toLocaleString()}</p>
                                    <p className="text-xs text-gray-500">ARR JMD {selectedPayingClient.arr.toLocaleString()}</p>
                                </div>
                                <div className="rounded-xl border border-gray-200 p-4">
                                    <p className="text-xs font-bold uppercase text-gray-500">Last Login</p>
                                    <p className="mt-1 text-lg font-bold text-gray-900">{formatActivityDate(selectedPayingClient.lastLoginAt)}</p>
                                    <p className="text-xs text-gray-500">Created {formatActivityDate(selectedPayingClient.accountCreatedAt || selectedPayingClient.createdAt, 'N/A')}</p>
                                </div>
                                <div className="rounded-xl border border-gray-200 p-4">
                                    <p className="text-xs font-bold uppercase text-gray-500">Risk</p>
                                    <p className={`mt-1 text-lg font-bold ${selectedPayingClient.risk === 'critical' ? 'text-red-600' : selectedPayingClient.risk === 'attention' ? 'text-amber-600' : 'text-green-600'}`}>
                                        {selectedPayingClient.risk === 'ok' ? 'Healthy' : selectedPayingClient.risk === 'attention' ? 'Attention' : 'Critical'}
                                    </p>
                                    <p className="text-xs text-gray-500">{selectedPayingClient.activeEmployees} active employees</p>
                                </div>
                            </div>

                            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                                <div className="rounded-xl border border-gray-200 p-5">
                                    <div className="mb-4 flex items-center gap-2">
                                        <Icons.CreditCard className="h-5 w-5 text-gray-400" />
                                        <h4 className="font-bold text-gray-900">Card And Payment Status</h4>
                                    </div>
                                    <div className="space-y-3 text-sm">
                                        <div className="flex justify-between gap-4">
                                            <span className="text-gray-500">Payment method</span>
                                            <span className="font-medium text-gray-900">{selectedPayingClient.paymentMethod}</span>
                                        </div>
                                        <div className="flex justify-between gap-4">
                                            <span className="text-gray-500">DimePay schedule</span>
                                            <span className="font-medium text-gray-900">{selectedPayingClient.dimeSubscriptionId || 'No recurring schedule'}</span>
                                        </div>
                                        <div className="flex justify-between gap-4">
                                            <span className="text-gray-500">Last payment</span>
                                            <span className="font-medium text-gray-900">
                                                {selectedPayingClient.lastPaymentDate
                                                    ? `${new Date(selectedPayingClient.lastPaymentDate).toLocaleDateString()} · JMD ${(selectedPayingClient.lastPaymentAmount || 0).toLocaleString()}`
                                                    : 'No payment recorded'}
                                            </span>
                                        </div>
                                        <div className="flex justify-between gap-4">
                                            <span className="text-gray-500">Last payment status</span>
                                            <span className="font-medium text-gray-900">{selectedPayingClient.lastPaymentStatus || 'N/A'}</span>
                                        </div>
                                    </div>
                                </div>

                                <div className="rounded-xl border border-gray-200 p-5">
                                    <div className="mb-4 flex items-center gap-2">
                                        <Icons.CalendarDays className="h-5 w-5 text-gray-400" />
                                        <h4 className="font-bold text-gray-900">Access And Manual Payment Notes</h4>
                                    </div>
                                    <div className="space-y-3 text-sm">
                                        <div className="flex justify-between gap-4">
                                            <span className="text-gray-500">Access until</span>
                                            <span className="font-medium text-gray-900">
                                                {selectedPayingClient.accessUntil ? new Date(selectedPayingClient.accessUntil).toLocaleDateString() : 'No access date'}
                                            </span>
                                        </div>
                                        <div className="flex justify-between gap-4">
                                            <span className="text-gray-500">Manual access</span>
                                            <span className="font-medium text-gray-900">
                                                {selectedPayingClient.billingGift?.giftedUntil
                                                    ? `${getManualPaymentAccessLabel(selectedPayingClient.billingGift)} through ${formatGiftedUntil(selectedPayingClient.billingGift.giftedUntil)}`
                                                    : 'None'}
                                            </span>
                                        </div>
                                        <div>
                                            <p className="text-gray-500">Internal note</p>
                                            <p className="mt-1 rounded-lg bg-gray-50 p-3 text-gray-800">
                                                {selectedPayingClient.billingGift?.note || 'No manual payment note recorded.'}
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                                <div className="rounded-xl border border-gray-200 p-5">
                                    <div className="mb-4 flex items-center gap-2">
                                        <Icons.Info className="h-5 w-5 text-gray-400" />
                                        <h4 className="font-bold text-gray-900">Ledger Snapshot</h4>
                                    </div>
                                    <div className="space-y-3 text-sm">
                                        <div className="flex justify-between gap-4">
                                            <span className="text-gray-500">Latest state</span>
                                            <span className="font-medium text-gray-900">{selectedPayingClient.latestLedgerState || 'No events'}</span>
                                        </div>
                                        <div className="flex justify-between gap-4">
                                            <span className="text-gray-500">Latest event</span>
                                            <span className="font-medium text-gray-900">{selectedPayingClient.latestLedgerEventType || 'Awaiting DimePay event'}</span>
                                        </div>
                                        <p className="rounded-lg bg-gray-50 p-3 text-xs text-gray-500">
                                            Full DimePay event timeline and transfer history are scoped for the 1.0.6 detail endpoint.
                                        </p>
                                    </div>
                                </div>

                                <div className="rounded-xl border border-gray-200 p-5">
                                    <div className="mb-4 flex items-center gap-2">
                                        <Icons.Users className="h-5 w-5 text-gray-400" />
                                        <h4 className="font-bold text-gray-900">Admin Contact</h4>
                                    </div>
                                    <div className="space-y-3 text-sm">
                                        <div>
                                            <p className="text-gray-500">Primary admin</p>
                                            <p className="font-medium text-gray-900">{selectedPayingClient.adminName}</p>
                                            <p className="text-gray-500">{selectedPayingClient.adminEmail}</p>
                                            {selectedPayingClient.adminPhone && <p className="text-gray-500">{selectedPayingClient.adminPhone}</p>}
                                        </div>
                                        <div className="flex flex-wrap gap-2 pt-2">
                                            <button onClick={() => handleCreateClientEmail(selectedPayingClient)} className="rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
                                                Create Email
                                            </button>
                                            <button onClick={() => handleManagePayingClient(selectedPayingClient)} className="rounded-lg bg-jam-black px-3 py-2 text-sm font-medium text-white hover:bg-gray-800">
                                                Manage Company
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}
            {selectedTenant && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
                    <div className="w-full max-w-4xl max-h-[90vh] overflow-y-auto rounded-xl bg-white shadow-2xl animate-scale-in">
                        <div className="sticky top-0 z-10 flex items-start justify-between border-b border-gray-100 bg-gray-50 p-6">
                            <div>
                                <div className="flex items-center gap-3">
                                    <h3 className="text-xl font-bold text-gray-900">{selectedTenant.companyName}</h3>
                                    {(selectedTenant as any).isTestCompany && (
                                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-bold uppercase bg-purple-100 text-purple-700">🧪 Test</span>
                                    )}
                                </div>
                                <p className="mt-1 text-sm text-gray-500">
                                    Company details, activity, billing, and admin contact.
                                </p>
                            </div>
                            <div className="flex items-center gap-4">
                                <label className="flex items-center gap-2 cursor-pointer select-none" title="Flag as test company — excluded from revenue metrics">
                                    <span className="text-xs font-medium text-gray-500">Test Company</span>
                                    <button
                                        type="button"
                                        role="switch"
                                        aria-checked={(selectedTenant as any).isTestCompany || false}
                                        onClick={() => handleToggleTestCompany(selectedTenant.id, !(selectedTenant as any).isTestCompany)}
                                        className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${(selectedTenant as any).isTestCompany ? 'bg-purple-500' : 'bg-gray-300'}`}
                                    >
                                        <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${(selectedTenant as any).isTestCompany ? 'translate-x-[18px]' : 'translate-x-[3px]'}`} />
                                    </button>
                                </label>
                                <button onClick={() => setSelectedTenant(null)} className="text-gray-400 hover:text-gray-600">
                                    <Icons.Close className="h-6 w-6" />
                                </button>
                            </div>
                        </div>

                        <div className="space-y-6 p-6">
                            <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
                                <div className="rounded-xl border border-gray-200 p-4">
                                    <p className="text-xs font-bold uppercase text-gray-500">Plan</p>
                                    <p className="mt-1 text-lg font-bold text-gray-900">{selectedTenant.plan}</p>
                                    <p className="text-xs text-gray-500">{selectedTenant.subscriptionStatus || selectedTenant.status}</p>
                                </div>
                                <div className="rounded-xl border border-gray-200 p-4">
                                    <p className="text-xs font-bold uppercase text-gray-500">MRR</p>
                                    <p className="mt-1 text-lg font-bold text-jam-orange">JMD {(selectedTenant.mrr || 0).toLocaleString()}</p>
                                    <p className="text-xs text-gray-500">ARR JMD {((selectedTenant.mrr || 0) * 12).toLocaleString()}</p>
                                </div>
                                <div className="rounded-xl border border-gray-200 p-4">
                                    <p className="text-xs font-bold uppercase text-gray-500">Last Login</p>
                                    <p className="mt-1 text-lg font-bold text-gray-900">{formatActivityDate(selectedTenant.lastLoginAt)}</p>
                                    <p className="text-xs text-gray-500">Created {formatActivityDate(selectedTenant.accountCreatedAt || selectedTenant.createdAt, 'N/A')}</p>
                                </div>
                                <div className="rounded-xl border border-gray-200 p-4">
                                    <p className="text-xs font-bold uppercase text-gray-500">Employees</p>
                                    <p className="mt-1 text-lg font-bold text-gray-900">{selectedTenant.employeeCount}</p>
                                    <p className="text-xs text-gray-500">{selectedTenant.status === 'ACTIVE' ? 'Active workspace' : selectedTenant.status}</p>
                                </div>
                            </div>

                            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                                <div className="rounded-xl border border-gray-200 p-5">
                                    <div className="mb-4 flex items-center gap-2">
                                        <Icons.CalendarDays className="h-5 w-5 text-gray-400" />
                                        <h4 className="font-bold text-gray-900">Billing & Manual Payment</h4>
                                    </div>
                                    <div className="space-y-3 text-sm">
                                        <div className="flex justify-between gap-4">
                                            <span className="text-gray-500">Status</span>
                                            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${selectedTenant.status === 'ACTIVE' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                                                {selectedTenant.status}
                                            </span>
                                        </div>
                                        <div className="flex justify-between gap-4">
                                            <span className="text-gray-500">Manual access</span>
                                            <span className="font-medium text-gray-900">
                                                {selectedTenant.billingGift?.giftedUntil
                                                    ? `${getManualPaymentAccessLabel(selectedTenant.billingGift)} through ${formatGiftedUntil(selectedTenant.billingGift.giftedUntil)}`
                                                    : 'None'}
                                            </span>
                                        </div>
                                        <div>
                                            <p className="text-gray-500">Internal note</p>
                                            <p className="mt-1 rounded-lg bg-gray-50 p-3 text-gray-800">
                                                {selectedTenant.billingGift?.note || 'No manual payment note recorded.'}
                                            </p>
                                        </div>
                                    </div>
                                </div>

                                <div className="rounded-xl border border-gray-200 p-5">
                                    <div className="mb-4 flex items-center gap-2">
                                        <Icons.Users className="h-5 w-5 text-gray-400" />
                                        <h4 className="font-bold text-gray-900">Admin Contact</h4>
                                    </div>
                                    <div className="space-y-3 text-sm">
                                        <div>
                                            <p className="text-gray-500">Primary contact</p>
                                            <p className="font-medium text-gray-900">{selectedTenant.contactName}</p>
                                            <p className="text-gray-500">{selectedTenant.email}</p>
                                            {selectedTenant.phone && <p className="text-gray-500">{selectedTenant.phone}</p>}
                                        </div>
                                        <div className="flex flex-wrap gap-2 pt-2">
                                            <button
                                                onClick={() => {
                                                    setSelectedTenant(null);
                                                    onImpersonate(selectedTenant);
                                                }}
                                                className="rounded-lg bg-jam-black px-3 py-2 text-sm font-medium text-white hover:bg-gray-800"
                                            >
                                                Manage Company
                                            </button>
                                            <button
                                                onClick={() => {
                                                    setSelectedTenant(null);
                                                    setGiftingTenant(selectedTenant);
                                                    setGiftMonths(1);
                                                    setGiftNote('');
                                                    setManualPaymentAction('FREE_GIFT');
                                                    setManualPaymentReason('STANDARD_PAYMENT');
                                                    setManualPaymentPlan(selectedTenant.plan === 'Free' ? 'Starter' : normalizeManualPaymentPlan(selectedTenant.plan));
                                                }}
                                                className="rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                                            >
                                                Manual Payment
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}
            {emailDraft && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
                    <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl overflow-hidden animate-scale-in">
                        <div className="p-6 border-b border-gray-100 bg-gray-50 flex justify-between items-start">
                            <div>
                                <h3 className="text-xl font-bold text-gray-900">Email Draft</h3>
                                <p className="text-sm text-gray-500 mt-1">Prepared for {emailDraft.companyName}</p>
                            </div>
                            <button onClick={() => setEmailDraft(null)} className="text-gray-400 hover:text-gray-600">
                                <Icons.Close className="w-6 h-6" />
                            </button>
                        </div>
                        <div className="p-6 space-y-4">
                            <div>
                                <label className="block text-xs font-bold text-gray-500 uppercase mb-1">To</label>
                                <input
                                    readOnly
                                    value={emailDraft.to}
                                    className="w-full rounded border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-700"
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Subject</label>
                                <input
                                    readOnly
                                    value={emailDraft.subject}
                                    className="w-full rounded border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-700"
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Message</label>
                                <textarea
                                    readOnly
                                    rows={9}
                                    value={emailDraft.body}
                                    className="w-full rounded border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-700"
                                />
                            </div>
                        </div>
                        <div className="p-6 border-t border-gray-100 flex flex-col sm:flex-row justify-end gap-3 bg-gray-50">
                            <button
                                onClick={handleCopyEmailDraft}
                                className="inline-flex items-center justify-center px-4 py-2 rounded-lg border border-gray-300 text-gray-700 hover:bg-white"
                            >
                                <Icons.Copy className="w-4 h-4 mr-2" /> Copy Draft
                            </button>
                            <button
                                onClick={handleOpenEmailDraft}
                                className="inline-flex items-center justify-center px-5 py-2 rounded-lg bg-jam-black text-white font-bold hover:bg-gray-800"
                            >
                                <Icons.Mail className="w-4 h-4 mr-2" /> Open Mail App
                            </button>
                        </div>
                    </div>
                </div>
            )}
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
                                    onChange={e => setEditingPlan({ ...editingPlan, name: e.target.value })}
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
                                    <option value="base">Base + Usage (Standard/Reseller)</option>
                                </select>
                            </div>

                            <div>
                                <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Employee Limit</label>
                                <select
                                    className="w-full border border-gray-300 rounded px-3 py-2"
                                    value={editingPlan.limit}
                                    onChange={e => setEditingPlan({ ...editingPlan, limit: e.target.value })}
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
                                            value={editingPlan.priceConfig.monthly || ''}
                                            onChange={e => setEditingPlan({
                                                ...editingPlan,
                                                priceConfig: { ...editingPlan.priceConfig, monthly: e.target.value === '' ? 0 : parseFloat(e.target.value) || 0 }
                                            })}
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Annual Price</label>
                                        <input
                                            type="number"
                                            className="w-full border border-gray-300 rounded px-3 py-2"
                                            value={editingPlan.priceConfig.annual || ''}
                                            onChange={e => setEditingPlan({
                                                ...editingPlan,
                                                priceConfig: { ...editingPlan.priceConfig, annual: e.target.value === '' ? 0 : parseFloat(e.target.value) || 0 }
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
                                                value={editingPlan.priceConfig.baseFee || ''}
                                                onChange={e => setEditingPlan({
                                                    ...editingPlan,
                                                    priceConfig: { ...editingPlan.priceConfig, baseFee: e.target.value === '' ? 0 : parseFloat(e.target.value) || 0 }
                                                })}
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Per Employee Fee</label>
                                            <input
                                                type="number"
                                                className="w-full border border-gray-300 rounded px-3 py-2"
                                                value={editingPlan.priceConfig.perUserFee || ''}
                                                onChange={e => setEditingPlan({
                                                    ...editingPlan,
                                                    priceConfig: { ...editingPlan.priceConfig, perUserFee: e.target.value === '' ? 0 : parseFloat(e.target.value) || 0 }
                                                })}
                                            />
                                        </div>
                                    </div>
                                    {editingPlan.name.toLowerCase().includes('reseller') && (
                                        <div>
                                            <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Reseller Commission (%)</label>
                                            <input
                                                type="number"
                                                className="w-full border border-gray-300 rounded px-3 py-2"
                                                value={editingPlan.priceConfig.resellerCommission || ''}
                                                onChange={e => setEditingPlan({
                                                    ...editingPlan,
                                                    priceConfig: { ...editingPlan.priceConfig, resellerCommission: e.target.value === '' ? 0 : parseFloat(e.target.value) || 0 }
                                                })}
                                            />
                                        </div>
                                    )}
                                </>
                            )}
                            <div>
                                <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Description</label>
                                <textarea
                                    rows={2}
                                    className="w-full border border-gray-300 rounded px-3 py-2"
                                    value={editingPlan.description}
                                    onChange={e => setEditingPlan({ ...editingPlan, description: e.target.value })}
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Button Text (CTA)</label>
                                <input
                                    type="text"
                                    className="w-full border border-gray-300 rounded px-3 py-2"
                                    placeholder="e.g., Get Started, Start Free"
                                    value={editingPlan.cta}
                                    onChange={e => setEditingPlan({ ...editingPlan, cta: e.target.value })}
                                />
                                <p className="text-xs text-gray-500 mt-1">Text shown on the pricing card button</p>
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
            {giftingTenant && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
                    <div className="w-full max-w-lg overflow-hidden rounded-xl bg-white shadow-2xl animate-scale-in">
                        <div className="flex items-center justify-between border-b border-gray-100 bg-gray-50 p-6">
                            <div>
                                <h3 className="text-xl font-bold text-gray-900">Manual Payment</h3>
                                <p className="mt-1 text-sm text-gray-500">
                                    Record a support-approved payment or access override for {giftingTenant.companyName}.
                                </p>
                            </div>
                            <button onClick={closeGiftModal} className="text-gray-400 hover:text-gray-600">
                                <Icons.Close className="h-6 w-6" />
                            </button>
                        </div>
                        <form onSubmit={handleGiftMonths} className="space-y-5 p-6">
                            <div className="rounded-lg border border-amber-100 bg-amber-50 p-4 text-sm text-amber-900">
                                This applies a temporary active billing window, records the reason, and can move the tenant to the selected tier.
                            </div>
                            <div>
                                <label className="mb-1 block text-xs font-bold uppercase text-gray-500">Support Action</label>
                                <select
                                    className="w-full rounded border border-gray-300 px-3 py-2"
                                    value={manualPaymentAction}
                                    onChange={(event) => setManualPaymentAction(event.target.value as ManualPaymentAction)}
                                >
                                    {Object.entries(MANUAL_PAYMENT_ACTION_LABELS).map(([value, label]) => (
                                        <option key={value} value={value}>{label}</option>
                                    ))}
                                </select>
                            </div>
                            <div>
                                <label className="mb-1 block text-xs font-bold uppercase text-gray-500">Reason</label>
                                <select
                                    className="w-full rounded border border-gray-300 px-3 py-2"
                                    value={manualPaymentReason}
                                    onChange={(event) => setManualPaymentReason(event.target.value as ManualPaymentReason)}
                                >
                                    {Object.entries(MANUAL_PAYMENT_REASON_LABELS).map(([value, label]) => (
                                        <option key={value} value={value}>{label}</option>
                                    ))}
                                </select>
                            </div>
                            <div>
                                <label className="mb-1 block text-xs font-bold uppercase text-gray-500">Tier To Grant</label>
                                <select
                                    className="w-full rounded border border-gray-300 px-3 py-2"
                                    value={manualPaymentPlan}
                                    onChange={(event) => setManualPaymentPlan(event.target.value as ManualPaymentPlan)}
                                >
                                    <option value="Free">Free</option>
                                    <option value="Starter">Starter</option>
                                    <option value="Pro">Pro</option>
                                    <option value="Enterprise">Enterprise</option>
                                    <option value="Reseller">Reseller</option>
                                </select>
                            </div>
                            <div>
                                <label className="mb-1 block text-xs font-bold uppercase text-gray-500">Months To Apply</label>
                                <input
                                    type="number"
                                    min={1}
                                    max={12}
                                    required
                                    className="w-full rounded border border-gray-300 px-3 py-2"
                                    value={giftMonths}
                                    onChange={(event) => setGiftMonths(Math.min(12, Math.max(1, Number(event.target.value) || 1)))}
                                />
                                <p className="mt-1 text-xs text-gray-500">Each window extends from today, or from the end of an existing active manual access period.</p>
                            </div>
                            <div>
                                <label className="mb-1 block text-xs font-bold uppercase text-gray-500">Internal Note</label>
                                <textarea
                                    rows={3}
                                    className="w-full rounded border border-gray-300 px-3 py-2"
                                    placeholder="Bank transfer reference, card-payment note, or why support applied this access."
                                    value={giftNote}
                                    onChange={(event) => setGiftNote(event.target.value)}
                                />
                            </div>
                            <div className="flex justify-end space-x-2 border-t border-gray-100 pt-4">
                                <button type="button" onClick={closeGiftModal} className="px-4 py-2 text-gray-500 hover:text-gray-700">
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    disabled={isGiftingAccess}
                                    className="rounded bg-jam-orange px-6 py-2 font-bold text-jam-black hover:bg-yellow-500 disabled:cursor-not-allowed disabled:opacity-60"
                                >
                                    {isGiftingAccess ? 'Applying...' : 'Apply Manual Payment'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};
