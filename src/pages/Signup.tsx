
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Icons } from '../components/Icons';
import { PendingInvitationsUI } from '../components/PendingInvitationsUI';
import { AcquisitionSource, Role, User, PricingPlan } from '../core/types';
import { getPlanPriceDetails } from '../utils/pricing';
import { PayPalScriptProvider, PayPalButtons } from "@paypal/react-paypal-js";
import { storage } from '../services/storage';
import { dimePayService } from '../services/dimePayService';
import { BankTransferInstructions } from '../components/billing/BankTransferInstructions';
import { CardTokenizeCard } from '../components/billing/CardTokenizeCard';
import { acceptMultipleInvitations, AccountMember } from '../features/employees/inviteService';
import { toast } from 'sonner';
import { useAuth } from '../context/AuthContext';
import { generateUUID } from '../utils/uuid';
import { isResellerClientFlow, isTeamMemberFlow, resolveSignupFlow, SignupFlow } from '../app/signupFlows';

interface SignupProps {
    onSignup?: (user: User) => void;
    onLoginClick: () => void;
    onVerifyEmailClick: (email: string) => void;
    onBack?: () => void; // Optional back button handler
    onNavigate?: (path: string) => void; // Optional navigation handler for Terms/Privacy
    initialPlan?: string;
    initialBillingCycle?: 'monthly' | 'annual';
    plans: PricingPlan[];
}

const JAMAICA_PARISHES = [
    'Kingston',
    'St. Andrew',
    'St. Catherine',
    'Clarendon',
    'Manchester',
    'St. Elizabeth',
    'Westmoreland',
    'Hanover',
    'St. James',
    'Trelawny',
    'St. Ann',
    'St. Mary',
    'Portland',
    'St. Thomas',
];

const ACQUISITION_SOURCE_OPTIONS: AcquisitionSource[] = [
    'Google Search',
    'Word of Mouth / Referral',
    'Social Media',
    'Other',
];

const sanitizeIntegerInput = (value: string) => value.replace(/\D/g, '');
const sanitizePhoneInput = (value: string) => value.replace(/[^\d\s()+-]/g, '');
const isValidPhone = (value: string) => {
    const digits = value.replace(/\D/g, '');
    return digits.length >= 7 && digits.length <= 15;
};

export const Signup: React.FC<SignupProps> = ({ onLoginClick, onVerifyEmailClick, onBack, onNavigate, initialPlan = 'Starter', initialBillingCycle = 'monthly', plans }) => {
    const { signup, updateUser } = useAuth();
    const [step, setStep] = useState<'account' | 'billing'>('account');
    const [paymentError, setPaymentError] = useState<string | null>(null);
    const [widgetStatus, setWidgetStatus] = useState<'loading' | 'ready' | 'error'>('loading');
    const [legalConsent, setLegalConsent] = useState(false);
    const [showPassword, setShowPassword] = useState(false);
    const [showConfirmPassword, setShowConfirmPassword] = useState(false);
    const [paymentMethod, setPaymentMethod] = useState<'card' | 'direct-deposit' | 'reseller-billing'>('card');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [showMobileSummary, setShowMobileSummary] = useState(false);
    const [pendingInvitations, setPendingInvitations] = useState<(AccountMember & { company_name?: string; inviter_name?: string; company_plan?: string })[]>([]);
    const [newUserId, setNewUserId] = useState<string | null>(null);

    // Bank transfer still requires a card on file for renewals - this tracks the required second step.
    const [directDepositCardStep, setDirectDepositCardStep] = useState(false);
    const pendingDirectDepositCardRef = useRef<{ cardToken: string; cardRequestToken?: string; cardLast4?: string; cardBrand?: string; cardExpiry?: string } | null>(null);

    // Timer Ref for cleanup
    const timerRef = useRef<any>(null);
    const isMountedRef = useRef(true);
    const widgetInitializedRef = useRef(false); // Track if widget has been initialized
    const widgetContainerRef = useRef<HTMLDivElement>(null); // Ref for widget container

    // State to store reseller invite token
    const [resellerInviteToken, setResellerInviteToken] = useState<string | null>(null);
    const [resellerUserId, setResellerUserId] = useState<string | null>(null);
    const [resellerEmail, setResellerEmail] = useState<string | null>(null);
    const [resellerCompanyId, setResellerCompanyId] = useState<string | null>(null);
    const [isTeamInvitation, setIsTeamInvitation] = useState(false);
    const [signupFlow, setSignupFlow] = useState<SignupFlow>('company_signup');
    const [inviteToken, setInviteToken] = useState<string | null>(null);

    // Fetch Global Payment Configuration
    const paymentConfig = storage.getGlobalConfig();
    const payPalEnabled = false; // PayPal disabled - only using DimePay
    const dimePayEnabled = paymentConfig?.dimepay?.enabled ?? true; // DimePay enabled by default
    const bankTransferDefaults = {
        enabled: true,
        bankName: 'NCB (National Commercial Bank)',
        accountName: 'Balance Investments Limited',
        accountNumber: '404286331',
        accountType: 'Savings Account',
        branch: 'UWI Branch',
        instructions: 'After making the deposit, your account will be activated within 24 hours. You will receive a confirmation email once payment is verified.'
    };
    const bankTransfer = {
        ...bankTransferDefaults,
        ...(paymentConfig?.bankTransfer || {}),
        bankName: paymentConfig?.bankTransfer?.bankName || bankTransferDefaults.bankName,
        accountName: paymentConfig?.bankTransfer?.accountName || bankTransferDefaults.accountName,
        accountNumber: paymentConfig?.bankTransfer?.accountNumber || bankTransferDefaults.accountNumber,
        accountType: paymentConfig?.bankTransfer?.accountType || bankTransferDefaults.accountType,
        branch: paymentConfig?.bankTransfer?.branch || bankTransferDefaults.branch,
        instructions: paymentConfig?.bankTransfer?.instructions || bankTransferDefaults.instructions,
    };

    const [formData, setFormData] = useState({
        name: '',
        email: '',
        companyName: '',
        phone: '',
        password: '',
        confirmPassword: '',
        plan: initialPlan === 'Enterprise' ? 'Starter' : initialPlan,
        billingCycle: initialBillingCycle,
        numEmployees: '',
        numCompanies: '', // For reseller plan
        address: '',
        city: 'Kingston',
        parish: 'Kingston',
        acquisitionSource: '' as AcquisitionSource | '',
    });

    // Cleanup function to safely remove widget
    const cleanupWidget = () => {
        const widgetEl = document.getElementById('dimepay-widget');
        if (widgetEl) {
            // Clear the innerHTML before React tries to clean it up
            // This prevents the "removeChild" error when DimePay iframe is removed
            try {
                widgetEl.innerHTML = '';
            } catch (e) {
                console.warn('Widget cleanup warning:', e);
            }
        }
        widgetInitializedRef.current = false;
    };

    useEffect(() => {
        isMountedRef.current = true;

        // Check for invite token and pre-fill email
        const params = new URLSearchParams(window.location.search);
        const token = params.get('token');
        const email = params.get('email');
        const rUserId = params.get('resellerUserId');
        const rEmail = params.get('resellerEmail');
        const rCompanyId = params.get('resellerCompanyId');
        const invitedPlan = params.get('plan');
        const resolvedFlow = resolveSignupFlow(params);

        setSignupFlow(resolvedFlow);
        setInviteToken(token);

        // Pre-fill email if provided
        if (email) {
            const decodedEmail = decodeURIComponent(email);
            setFormData(prev => ({ ...prev, email: decodedEmail }));
        }

        // Team invitation mode should ONLY be enabled for explicit invitation links.
        // Do not infer invitation mode from `email` query params alone; that can misclassify
        // regular signups and create users without a company context.
        if (isTeamMemberFlow(params)) {
            console.log('👥 Team member invitation detected:', { flow: resolvedFlow, email });
            setIsTeamInvitation(true);
            toast.info('Joining as a team member. Just set your name and password!', { duration: 5000 });
        }

        // Store reseller invite info if this is a reseller invite
        if (token && isResellerClientFlow(params)) {
            console.log('🔗 Reseller invite detected:', { token, rUserId, rEmail, rCompanyId });
            setResellerInviteToken(token);
            if (rUserId) setResellerUserId(rUserId);
            if (rEmail) setResellerEmail(decodeURIComponent(rEmail));
            if (rCompanyId) setResellerCompanyId(rCompanyId);
            if (invitedPlan) {
                setFormData(prev => ({ ...prev, plan: invitedPlan }));
            }
            setPaymentMethod('reseller-billing');
            toast.info('You\'re signing up through a reseller invitation!', { duration: 5000 });
        }

        return () => {
            isMountedRef.current = false;
            // Clean up widget on component unmount
            cleanupWidget();
            if (timerRef.current) clearTimeout(timerRef.current);
        };
    }, []);

    // Get selected plan and its employee limit
    const selectedPlan = plans.find(p => p.name === formData.plan);
    const getEmployeeLimit = () => {
        if (!selectedPlan) return 9999;
        const limit = selectedPlan.limit;
        if (limit === 'Unlimited') return 9999;
        return parseInt(limit) || 9999;
    };
    const employeeLimit = getEmployeeLimit();

    // Pricing Logic 
    const getPricing = () => {
        const selectedPlan = plans.find(p => p.name === formData.plan);
        if (!selectedPlan) return {
            type: 'flat',
            basePrice: 0,
            perEmpPrice: 0,
            subtotal: 0,
            billableAmount: 0,
            resellerCommissionRate: 0,
            resellerCommissionAmount: 0,
            platformFees: 0,
            total: 0,
            totalUSD: '0.00'
        };

        const { amount: basePrice, perEmpFee: perEmpPrice } = getPlanPriceDetails(selectedPlan, formData.billingCycle);
        const type = selectedPlan.priceConfig.type;

        let subtotal = 0;
        if (type === 'free') {
            subtotal = 0;
        } else if (type === 'flat') {
            subtotal = basePrice;
        } else if (type === 'per_emp') {
            const count = parseInt(formData.numEmployees) || 1; // Default to 1 if not specified
            subtotal = count * perEmpPrice;
        } else if (type === 'base') {
            // Base fee plans (Starter, Pro, Reseller)
            // Use the calculated basePrice which already handles monthly vs annual
            const baseFeeAmount = basePrice;

            if (formData.plan === 'Reseller') {
                // For resellers: (companies × baseFee) + (employees × perUserFee)
                // User's own company is always included, so numCompanies is 1 + additional companies
                const numCompanies = Math.max(1, parseInt(formData.numCompanies) || 1); // Ensure at least 1 (their own company)
                const numEmployees = parseInt(formData.numEmployees) || 1;
                subtotal = (numCompanies * baseFeeAmount) + (numEmployees * perEmpPrice);
            } else {
                // For other base-type plans: basePrice + (employees × perEmpPrice)
                const count = parseInt(formData.numEmployees) || 1;
                subtotal = baseFeeAmount + (count * perEmpPrice);
            }
        }

        const commissionRate = (selectedPlan?.priceConfig.resellerCommission || 20) / 100;
        // Reseller commission is partner payout metadata; it should not reduce customer checkout amount.
        const resellerCommissionAmount = formData.plan === 'Reseller' ? (subtotal * commissionRate) : 0;
        const billableAmount = subtotal;

        const platformFees = billableAmount * 0.035; // Dime platform fees (3.5%)
        const total = billableAmount + platformFees;
        const totalUSD = (total / 155).toFixed(2);

        return {
            type,
            basePrice,
            perEmpPrice,
            subtotal,
            billableAmount,
            resellerCommissionRate: commissionRate,
            resellerCommissionAmount,
            platformFees,
            total,
            totalUSD
        };
    };

    // Recalculate pricing whenever formData changes (especially billingCycle, plan, or employee counts)
    const pricing = useMemo(() => getPricing(), [formData.plan, formData.billingCycle, formData.numEmployees, formData.numCompanies]);

    const OrderSummaryBreakdown = () => (
        <div className="space-y-2 text-sm">
            {pricing.type === 'per_emp' && (
                <div className="flex justify-between text-gray-600">
                    <span>{formData.numEmployees || 1} Employee{(parseInt(formData.numEmployees) || 1) > 1 ? 's' : ''} x ${pricing.perEmpPrice.toLocaleString()}</span>
                    <span>${pricing.subtotal.toLocaleString()}</span>
                </div>
            )}
            {pricing.type === 'flat' && (
                <div className="flex justify-between text-gray-600">
                    <span>Base Plan</span>
                    <span>${pricing.subtotal.toLocaleString()}</span>
                </div>
            )}
            {pricing.type === 'base' && (
                <>
                    {formData.plan === 'Reseller' ? (
                        <>
                            <div className="flex justify-between text-gray-600">
                                <span className="font-medium">Company Fees:</span>
                                <span></span>
                            </div>
                            <div className="flex justify-between text-gray-600 text-sm pl-3">
                                <span>{Math.max(1, parseInt(formData.numCompanies) || 1)} Compan{(Math.max(1, parseInt(formData.numCompanies) || 1)) > 1 ? 'ies' : 'y'} x ${pricing.basePrice.toLocaleString()}/ea</span>
                                <span>${(Math.max(1, parseInt(formData.numCompanies) || 1) * pricing.basePrice).toLocaleString()}</span>
                            </div>
                            <div className="flex justify-between text-gray-600 mt-2">
                                <span className="font-medium">Employee Fees:</span>
                                <span></span>
                            </div>
                            <div className="flex justify-between text-gray-600 text-sm pl-3">
                                <span>{formData.numEmployees || 1} Employee{(parseInt(formData.numEmployees) || 1) > 1 ? 's' : ''} x ${pricing.perEmpPrice.toLocaleString()}/ea</span>
                                <span>${((parseInt(formData.numEmployees) || 1) * pricing.perEmpPrice).toLocaleString()}</span>
                            </div>
                        </>
                    ) : (
                        <>
                            <div className="flex justify-between text-gray-600">
                                <span>Base Fee</span>
                                <span>${pricing.basePrice.toLocaleString()}</span>
                            </div>
                            <div className="flex justify-between text-gray-600">
                                <span>{formData.numEmployees || 1} Employee{(parseInt(formData.numEmployees) || 1) > 1 ? 's' : ''} x ${pricing.perEmpPrice.toLocaleString()}/ea</span>
                                <span>${((parseInt(formData.numEmployees) || 1) * pricing.perEmpPrice).toLocaleString()}</span>
                            </div>
                        </>
                    )}
                </>
            )}
            {pricing.platformFees > 0 && (
                <div className="flex justify-between text-gray-600">
                    <span>Dime Platform Fees (3.5%)</span>
                    <span>${pricing.platformFees.toLocaleString()}</span>
                </div>
            )}
            {formData.plan === 'Reseller' && pricing.resellerCommissionAmount > 0 && (
                <div className="flex justify-between text-gray-500 text-xs">
                    <span>Partner commission payout ({Math.round(pricing.resellerCommissionRate * 100)}%)</span>
                    <span>${pricing.resellerCommissionAmount.toLocaleString()}</span>
                </div>
            )}
            <div className="flex justify-between font-bold text-gray-900 pt-2 border-t border-gray-200">
                <span>Total</span>
                <span>${pricing.total.toLocaleString()}</span>
            </div>
        </div>
    );

    // Generate companyId early so it can be passed to DimePay for webhook linking
    const [companyId] = useState(() => generateUUID());

    const initDimePay = () => {
        if (!isMountedRef.current) return;

        // Prevent multiple initializations
        if (widgetInitializedRef.current) {
            console.log('⚠️ Widget already initialized, skipping...');
            return;
        }

        setWidgetStatus('loading');
        setPaymentError(null);

        if (timerRef.current) clearTimeout(timerRef.current);

        // Wait for mount element to exist and ensure DimePay SDK is loaded
        const checkAndInit = () => {
            const mountElement = document.getElementById('dimepay-widget');
            const dimepaySDK = (window as any).dimepay || (window as any).DimePay;

            if (!mountElement) {
                console.warn('⏳ Waiting for mount element...');
                timerRef.current = setTimeout(checkAndInit, 100);
                return;
            }

            if (!dimepaySDK) {
                console.warn('⏳ Waiting for DimePay SDK...');
                timerRef.current = setTimeout(checkAndInit, 100);
                return;
            }

            if (!isMountedRef.current || widgetInitializedRef.current) return;

            // Mark as initialized to prevent duplicate calls
            widgetInitializedRef.current = true;

            console.log('✅ Mount element and SDK ready, initializing widget...');
            dimePayService.renderPaymentWidget({
                mountId: 'dimepay-widget',
                email: formData.email,
                amount: pricing.total,
                currency: 'JMD',
                description: `${formData.plan} Plan (${formData.billingCycle})`,
                frequency: formData.billingCycle,
                companyId: companyId, // Pass company ID for webhook linking
                metadata: {
                    name: formData.name,
                    company: formData.companyName,
                    plan: formData.plan,
                    planName: formData.plan,
                    planType: formData.plan.toLowerCase()
                },
                onReady: () => {
                    if (!isMountedRef.current) return;
                    console.log('✅ DimePay widget is ready and rendered');
                    setWidgetStatus('ready');
                },
                onSuccess: (data) => {
                    if (!isMountedRef.current) return;
                    console.log('DimePay Success:', data);
                    console.log('📦 Subscription created:', data.subscription_id);
                    setWidgetStatus('ready');
                    toast.success('Payment successful!');
                    handleSubmit();
                },
                onError: (err) => {
                    if (!isMountedRef.current) return;
                    console.error('DimePay Error:', err);
                    setWidgetStatus('error');
                    setPaymentError('Payment failed or SDK missing. Check configuration.');
                }
            });
        };

        // Start checking after a short delay to ensure DOM is ready
        timerRef.current = setTimeout(checkAndInit, 100);
    };

    // Initialize DimePay Widget when on billing step with card payment
    useEffect(() => {
        // Reset initialization flag when step changes or payment method changes
        if (step !== 'billing' || paymentMethod !== 'card') {
            cleanupWidget();
            return;
        }

        if (step === 'billing' && paymentMethod === 'card' && dimePayEnabled && !widgetInitializedRef.current) {
            initDimePay();
        }

        return () => {
            if (timerRef.current) clearTimeout(timerRef.current);
            // Clean up widget when effect is cleaned up (unmount or dependencies change)
            cleanupWidget();
        };
    }, [step, paymentMethod, dimePayEnabled]);

    // Default numCompanies to "1" when Reseller is selected (their own company)
    useEffect(() => {
        setFormData(prev => {
            if (prev.plan === 'Free' && (prev.numEmployees || prev.numCompanies)) {
                return { ...prev, numEmployees: '', numCompanies: '' };
            }

            if (prev.plan === 'Reseller' && (!prev.numCompanies || prev.numCompanies === '')) {
                return { ...prev, numCompanies: '1' };
            }

            if (prev.plan !== 'Reseller' && prev.numCompanies) {
                return { ...prev, numCompanies: '' };
            }

            return prev;
        });
    }, [formData.plan]);

    const handleAccountSubmit = (e: React.FormEvent) => {
        e.preventDefault();

        if (!formData.email.trim()) {
            toast.error("Please enter your work email to continue.");
            return;
        }

        if (!isTeamInvitation && !formData.phone.trim()) {
            toast.error("Please enter your phone number to continue.");
            return;
        }

        if (formData.phone.trim() && !isValidPhone(formData.phone)) {
            toast.error("Please enter a valid phone number.");
            return;
        }

        if (!isTeamInvitation && !formData.companyName.trim()) {
            toast.error("Company name is required.");
            return;
        }

        if (!isTeamInvitation && !formData.acquisitionSource) {
            toast.error("Please tell us how you heard about Payroll-Jam.");
            return;
        }

        if (!isTeamInvitation && formData.plan !== 'Free') {
            const employeeCount = Number(formData.numEmployees);
            if (!Number.isInteger(employeeCount) || employeeCount < 1) {
                toast.error("Please enter a valid number of employees.");
                return;
            }

            if (formData.plan !== 'Reseller' && employeeCount > employeeLimit) {
                toast.error(`${formData.plan} supports up to ${employeeLimit} employees. Please reduce the count or choose another plan.`);
                return;
            }
        }

        if (!isTeamInvitation && formData.plan === 'Reseller') {
            const companyCount = Number(formData.numCompanies);
            if (!Number.isInteger(companyCount) || companyCount < 1) {
                toast.error("Please enter a valid number of companies.");
                return;
            }
        }

        if (!legalConsent) {
            toast.error("Please agree to the Terms and Privacy Policy to continue.");
            return;
        }

        if (formData.password !== formData.confirmPassword) {
            toast.error("Passwords do not match. Please try again.");
            return;
        }

        // Debug logging to understand why payment might be skipped
        console.log('🔍 Account Submit Check:', {
            plan: formData.plan,
            pricingTotal: pricing.total,
            pricingType: pricing.type,
            isTeamInvitation,
            willSkipPayment: isTeamInvitation || formData.plan === 'Free' || pricing.total === 0
        });

        if (isTeamInvitation || formData.plan === 'Free' || pricing.total === 0) {
            console.log('⏭️ Skipping payment step - proceeding directly to signup');
            handleSubmit();
        } else {
            console.log('💳 Proceeding to billing step for payment');
            setStep('billing');
        }
    };

    const handleSubmit = async () => {
        if (isSubmitting) return; // Prevent double submission
        setIsSubmitting(true);

        try {
            const role = isTeamInvitation ? Role.MANAGER : (formData.plan === 'Reseller' ? Role.RESELLER : Role.OWNER);
            const isPaidPlan = !isTeamInvitation && formData.plan !== 'Free' && pricing.total > 0;
            const requiresApproval = isPaidPlan && (paymentMethod === 'direct-deposit' || paymentMethod === 'reseller-billing');

            // Get the selected plan to extract employee limit
            const selectedPlan = plans.find(p => p.name === formData.plan);
            const employeeLimit = selectedPlan?.limit || 'Unlimited';

            const newUser = {
                id: generateUUID(),
                name: formData.name,
                email: formData.email.trim(),
                phone: formData.phone.trim(),
                password: formData.password,
                role: role,
                // Use the same pre-generated companyId passed to DimePay so webhook subscription rows
                // are written against the exact company created at signup.
                companyId: isTeamInvitation ? undefined : companyId,
                isOnboarded: isTeamInvitation, // Team members are considered "onboarded" manually
                companyName: isTeamInvitation ? undefined : formData.companyName.trim(),
                address: formData.address.trim() || undefined,
                city: formData.city.trim() || undefined,
                parish: formData.parish,
                acquisitionSource: isTeamInvitation ? undefined : formData.acquisitionSource as AcquisitionSource,
                plan: isTeamInvitation ? 'Free' : formData.plan,
                billingCycle: formData.billingCycle,
                employeeLimit: employeeLimit,
                paymentMethod: paymentMethod,
                numEmployees: formData.plan === 'Free' ? undefined : (parseInt(formData.numEmployees) || undefined),
                numCompanies: formData.plan === 'Reseller' ? (parseInt(formData.numCompanies) || undefined) : undefined,
                legalConsentAccepted: legalConsent,
                legalConsentAcceptedAt: new Date().toISOString(),
                resellerInviteToken: resellerInviteToken || undefined,
                resellerUserId: resellerUserId || undefined,
                resellerEmail: resellerEmail || undefined,
                resellerCompanyId: resellerCompanyId || undefined,
                skipEmailVerification: isTeamInvitation,
                signupFlow,
                inviteToken: inviteToken || undefined
            };

            // Call signup and get pending invitations
            const signupResult = await signup(newUser);
            console.log('✅ Signup completed successfully');

            // USE THE REAL USER ID FROM AUTH, NOT THE RANDOMLY GENERATED ONE
            const actualUserId = signupResult.userId;
            setNewUserId(actualUserId);

            // Persist the card tokenized during the bank-transfer "card required" step now
            // that the company row actually exists (it didn't when the card was tokenized).
            if (paymentMethod === 'direct-deposit' && pendingDirectDepositCardRef.current) {
                try {
                    await dimePayService.updateSubscriptionPaymentMethod({
                        companyId,
                        cardToken: pendingDirectDepositCardRef.current.cardToken,
                        cardRequestToken: pendingDirectDepositCardRef.current.cardRequestToken,
                        cardLast4: pendingDirectDepositCardRef.current.cardLast4,
                        cardBrand: pendingDirectDepositCardRef.current.cardBrand,
                        cardExpiry: pendingDirectDepositCardRef.current.cardExpiry
                    });
                } catch (cardPersistError) {
                    console.error('⚠️ Failed to persist card on file after bank-transfer signup (will rely on DimePay webhook fallback):', cardPersistError);
                }
            }

            // Check if there are pending invitations
            if (signupResult && signupResult.pendingInvitations && signupResult.pendingInvitations.length > 0) {
                console.log('📬 Found pending invitations:', signupResult.pendingInvitations.length);
                setPendingInvitations(signupResult.pendingInvitations);
                // Show the invitations UI - component will handle auto-accept if only one
                return; // Don't proceed to email verification yet
            }

            // All signups redirect to verify email page
            if (requiresApproval) {
                console.log('📝 Direct deposit - redirecting to verify email page');
                toast.success('🎉 Account created! Payment pending verification.', {
                    duration: 5000,
                });
            } else if (isPaidPlan) {
                console.log('💳 Paid signup - redirecting to verify email page');
                console.log('🔍 Paid plan details:', {
                    plan: formData.plan,
                    pricingTotal: pricing.total,
                    paymentMethod: paymentMethod
                });
                toast.success('🎉 Account created and payment successful!', {
                    duration: 5000,
                });
            } else {
                console.log('✅ Free signup - redirecting to verify email page');
                console.log('🔍 Free plan details:', {
                    plan: formData.plan,
                    pricingTotal: pricing.total,
                    isFreePlan: formData.plan === 'Free',
                    isZeroTotal: pricing.total === 0
                });
                toast.success('🎉 Account created successfully!', {
                    duration: 5000,
                });
            }

            // Redirect to verify email page or dashboard after showing message
            setTimeout(() => {
                if (isTeamInvitation) {
                    console.log('🔄 Team member signup - redirecting to dashboard...');
                    // Since we auto-verify email for invitations, we can go to dashboard
                    if (onNavigate) {
                        onNavigate('dashboard');
                    } else {
                        // Fallback to login if navigate not available, but should be there
                        onLoginClick();
                    }
                } else {
                    console.log('🔄 Redirecting to verify email page...');
                    onVerifyEmailClick(formData.email);
                }
            }, 1500);
        } catch (error: any) {
            console.error('❌ Signup failed:', error);
            console.error('Error details:', {
                message: error.message,
                code: error.code,
                status: error.status
            });

            // Check if email already exists
            if (error.message?.includes('already registered') || error.code === '23505') {
                if (resellerInviteToken) {
                    toast.info('Account exists! Redirecting to login to accept your invitation...');
                    setTimeout(() => {
                        onLoginClick();
                    }, 2000);
                } else {
                    toast.error('Email already exists. Please login instead.');
                }
            } else {
                toast.error(error.message || 'Signup failed. Please try again.');
            }
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleInvitationsAccepted = async (acceptedInvitations: typeof pendingInvitations) => {
        if (!newUserId) {
            console.error('❌ User ID not found');
            toast.error('Error accepting invitations');
            return;
        }

        try {
            // Accept all the selected invitations
            const invitationIds = acceptedInvitations.map(inv => inv.id);
            const result = await acceptMultipleInvitations(invitationIds, newUserId, true);

            if (result.success) {
                console.log('✅ Invitations accepted:', result.acceptedCount);
                toast.success(`Accepted ${result.acceptedCount} invitation${result.acceptedCount !== 1 ? 's' : ''}!`);

                // Update local user state with the first accepted company to ensure dashboard loads correctly
                if (acceptedInvitations.length > 0) {
                    updateUser({ companyId: acceptedInvitations[0].account_id });
                }

                // Clear pending invitations and proceed to verification
                setPendingInvitations([]);

                setTimeout(() => {
                    console.log('🔄 Redirecting to dashboard...');
                    // Instead of going to verify email, go directly to dashboard since email is verified
                    if (onNavigate) {
                        onNavigate('dashboard');
                    } else {
                        onVerifyEmailClick(formData.email);
                    }
                }, 1000);
            } else {
                toast.error(`Failed to accept ${result.failedCount} invitation${result.failedCount !== 1 ? 's' : ''}`);
            }
        } catch (error) {
            console.error('❌ Error accepting invitations:', error);
            toast.error('Failed to accept invitations');
        }
    };

    const handleSkipInvitations = () => {
        setPendingInvitations([]);
        setTimeout(() => {
            console.log('🔄 Redirecting to verify email page...');
            onVerifyEmailClick(formData.email);
        }, 500);
    };

    return (
        <>
            {/* Show Pending Invitations UI if there are invitations waiting */}
            {pendingInvitations.length > 0 && newUserId && (
                <PendingInvitationsUI
                    invitations={pendingInvitations}
                    onInvitationsAccepted={handleInvitationsAccepted}
                    onSkip={handleSkipInvitations}
                />
            )}

            <div className="min-h-screen bg-gray-50 flex pb-24 lg:pb-0">
                {/* Left Side - Form */}
                <div className="flex-1 flex flex-col justify-center py-12 px-4 sm:px-6 lg:px-20 xl:px-24 bg-white">
                    <div className="mx-auto w-full max-w-sm lg:w-96">
                        <div className="mb-10">
                            {/* Back Button */}
                            {onBack && (
                                <button
                                    onClick={onBack}
                                    className="flex items-center text-gray-600 hover:text-jam-orange mb-4 transition-colors"
                                >
                                    <Icons.ArrowLeft className="w-5 h-5 mr-2" />
                                    Back
                                </button>
                            )}
                            <h2 className="text-3xl font-extrabold text-jam-black cursor-pointer" onClick={onLoginClick}>
                                Payroll<span className="text-jam-orange">-Jam</span>
                            </h2>
                            <h2 className="mt-6 text-2xl font-bold text-gray-900">
                                {step === 'account' ? 'Create your account' : 'Payment Details'}
                            </h2>
                            <p className="mt-2 text-sm text-gray-600">
                                {step === 'account' ? 'Start managing your payroll in minutes.' : 'Secure recurring billing.'}
                            </p>
                        </div>

                        <form className="space-y-6" onSubmit={step === 'account' ? handleAccountSubmit : (e) => { e.preventDefault(); }}>
                            {/* ... (Form Rendering Code unchanged, just handlers updated above) ... */}
                            {/* For brevity in response, keeping JSX same as original file but using updated handlers */}
                            {step === 'account' ? (
                                <>
                                    {/* Plan selection - hidden for team invitations */}
                                    {!isTeamInvitation && (
                                        <div className="bg-gray-50 p-4 rounded-lg border border-gray-200 mb-6">
                                            <div className="flex justify-between items-center mb-3">
                                                <label className="block text-sm font-medium text-gray-700">Selected Plan</label>
                                                <div className="flex bg-gray-200 rounded-lg p-1">
                                                    <button
                                                        type="button"
                                                        onClick={() => setFormData({ ...formData, billingCycle: 'monthly' })}
                                                        className={`px-3 py-1 text-xs font-medium rounded-md transition-all ${formData.billingCycle === 'monthly' ? 'bg-white shadow text-gray-900' : 'text-gray-500 hover:text-gray-900'}`}
                                                    >
                                                        Monthly
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={() => setFormData({ ...formData, billingCycle: 'annual' })}
                                                        className={`px-3 py-1 text-xs font-medium rounded-md transition-all ${formData.billingCycle === 'annual' ? 'bg-white shadow text-gray-900' : 'text-gray-500 hover:text-gray-900'}`}
                                                    >
                                                        Annual
                                                    </button>
                                                </div>
                                            </div>
                                            <select
                                                value={formData.plan}
                                                onChange={(e) => setFormData({ ...formData, plan: e.target.value })}
                                                className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-jam-orange focus:border-jam-orange sm:text-sm"
                                            >
                                                {plans.filter(p => p.isActive && p.name !== 'Enterprise').map(p => (
                                                    <option key={p.id} value={p.name}>{p.name} ({p.limit})</option>
                                                ))}
                                            </select>
                                        </div>
                                    )}

                                    <div>
                                        <label className="block text-sm font-medium text-gray-700">Full Name</label>
                                        <input required type="text" value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-jam-orange focus:border-jam-orange sm:text-sm" />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700">Work Email</label>
                                        <input required type="email" autoComplete="email" value={formData.email} onChange={(e) => setFormData({ ...formData, email: e.target.value })} className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-jam-orange focus:border-jam-orange sm:text-sm" />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700">
                                            Phone {!isTeamInvitation && <span className="text-red-500">*</span>}
                                        </label>
                                        <input required={!isTeamInvitation} type="tel" inputMode="tel" autoComplete="tel" pattern="[0-9\\s()+-]{7,20}" title="Enter a valid phone number using digits, spaces, +, -, or parentheses." value={formData.phone} onChange={(e) => setFormData({ ...formData, phone: sanitizePhoneInput(e.target.value) })} className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-jam-orange focus:border-jam-orange sm:text-sm" />
                                    </div>
                                    {!isTeamInvitation && (
                                        <>
                                            <div>
                                                <label className="block text-sm font-medium text-gray-700">Company Name</label>
                                                <input required type="text" value={formData.companyName} onChange={(e) => setFormData({ ...formData, companyName: e.target.value })} className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-jam-orange focus:border-jam-orange sm:text-sm" />
                                            </div>
                                            <div>
                                                <label className="block text-sm font-medium text-gray-700">Business Address</label>
                                                <input type="text" autoComplete="street-address" value={formData.address} onChange={(e) => setFormData({ ...formData, address: e.target.value })} className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-jam-orange focus:border-jam-orange sm:text-sm" />
                                            </div>
                                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                                <div>
                                                    <label className="block text-sm font-medium text-gray-700">City</label>
                                                    <input type="text" value={formData.city} onChange={(e) => setFormData({ ...formData, city: e.target.value })} className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-jam-orange focus:border-jam-orange sm:text-sm" />
                                                </div>
                                                <div>
                                                    <label className="block text-sm font-medium text-gray-700">Parish</label>
                                                    <select value={formData.parish} onChange={(e) => setFormData({ ...formData, parish: e.target.value })} className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-jam-orange focus:border-jam-orange sm:text-sm">
                                                        {JAMAICA_PARISHES.map(parish => (
                                                            <option key={parish} value={parish}>{parish}</option>
                                                        ))}
                                                    </select>
                                                </div>
                                            </div>
                                            <div>
                                                <label className="block text-sm font-medium text-gray-700">How did you hear about us?</label>
                                                <select
                                                    required
                                                    value={formData.acquisitionSource}
                                                    onChange={(e) => setFormData({ ...formData, acquisitionSource: e.target.value as AcquisitionSource })}
                                                    className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-jam-orange focus:border-jam-orange sm:text-sm"
                                                >
                                                    <option value="">Select one</option>
                                                    {ACQUISITION_SOURCE_OPTIONS.map(source => (
                                                        <option key={source} value={source}>{source}</option>
                                                    ))}
                                                </select>
                                            </div>
                                        </>
                                    )}
                                    {/* Show employee count field for all plans except Free - hidden for team invitations */}
                                    {!isTeamInvitation && formData.plan !== 'Free' && (
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700">Number of Employees</label>
                                            <input
                                                required
                                                type="number"
                                                min="1"
                                                max={formData.plan === 'Reseller' ? 9999 : employeeLimit}
                                                value={formData.numEmployees}
                                                onChange={(e) => setFormData({ ...formData, numEmployees: sanitizeIntegerInput(e.target.value) })}
                                                className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-jam-orange focus:border-jam-orange sm:text-sm"
                                                placeholder="e.g., 10"
                                            />
                                            <p className="mt-1 text-xs text-gray-500">
                                                {formData.plan === 'Reseller'
                                                    ? 'Total employees across all your client companies'
                                                    : formData.plan === 'Starter' || formData.plan === 'Pro'
                                                        ? `Share how many employees you have (${formData.plan} plan supports up to ${employeeLimit} employees)`
                                                        : employeeLimit < 9999
                                                            ? `${formData.plan} plan supports up to ${employeeLimit} employees`
                                                            : 'This helps us calculate your plan pricing accurately'}
                                            </p>
                                        </div>
                                    )}
                                    {!isTeamInvitation && formData.plan === 'Reseller' && (
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700">Number of Companies</label>
                                            <input
                                                required
                                                type="number"
                                                min="1"
                                                max="9999"
                                                value={formData.numCompanies}
                                                onChange={(e) => setFormData({ ...formData, numCompanies: sanitizeIntegerInput(e.target.value) })}
                                                className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-jam-orange focus:border-jam-orange sm:text-sm"
                                                placeholder="1 (your company)"
                                            />
                                            <p className="mt-1 text-xs text-gray-500">Number of companies you'll manage (includes your own company + any additional client companies)</p>
                                        </div>
                                    )}
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700">Password</label>
                                        <div className="relative mt-1">
                                            <input
                                                required
                                                type={showPassword ? 'text' : 'password'}
                                                autoComplete="new-password"
                                                value={formData.password}
                                                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                                                className="block w-full px-3 py-2 pr-12 border border-gray-300 rounded-md shadow-sm focus:ring-jam-orange focus:border-jam-orange sm:text-sm"
                                                placeholder="Minimum 6 characters"
                                                minLength={6}
                                            />
                                            <button
                                                type="button"
                                                onClick={() => setShowPassword(!showPassword)}
                                                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                                            >
                                                {showPassword ? (
                                                    <Icons.EyeOff className="w-5 h-5" />
                                                ) : (
                                                    <Icons.Eye className="w-5 h-5" />
                                                )}
                                            </button>
                                        </div>
                                    </div>

                                    <div>
                                        <label className="block text-sm font-medium text-gray-700">Confirm Password</label>
                                        <div className="relative mt-1">
                                            <input
                                                required
                                                type={showConfirmPassword ? 'text' : 'password'}
                                                value={formData.confirmPassword}
                                                onChange={(e) => setFormData({ ...formData, confirmPassword: e.target.value })}
                                                className="block w-full px-3 py-2 pr-12 border border-gray-300 rounded-md shadow-sm focus:ring-jam-orange focus:border-jam-orange sm:text-sm"
                                                placeholder="Re-enter your password"
                                                minLength={6}
                                            />
                                            <button
                                                type="button"
                                                onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                                                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                                            >
                                                {showConfirmPassword ? (
                                                    <Icons.EyeOff className="w-5 h-5" />
                                                ) : (
                                                    <Icons.Eye className="w-5 h-5" />
                                                )}
                                            </button>
                                        </div>
                                    </div>

                                    <div className="flex items-start">
                                        <div className="flex items-center h-5">
                                            <input
                                                id="consent"
                                                name="consent"
                                                type="checkbox"
                                                required
                                                checked={legalConsent}
                                                onChange={(e) => setLegalConsent(e.target.checked)}
                                                className="focus:ring-jam-orange h-4 w-4 text-jam-orange border-gray-300 rounded cursor-pointer"
                                            />
                                        </div>
                                        <div className="ml-3 text-sm">
                                            <label htmlFor="consent" className="font-medium text-gray-700 cursor-pointer">
                                                I agree to the{' '}
                                                {onNavigate ? (
                                                    <>
                                                        <a
                                                            href="/terms-of-service"
                                                            target="_blank"
                                                            rel="noopener noreferrer"
                                                            className="underline hover:text-jam-orange text-jam-orange"
                                                        >
                                                            Terms of Service
                                                        </a>
                                                        {' '}and{' '}
                                                        <a
                                                            href="/privacy-policy"
                                                            target="_blank"
                                                            rel="noopener noreferrer"
                                                            className="underline hover:text-jam-orange text-jam-orange"
                                                        >
                                                            Privacy Policy
                                                        </a>
                                                    </>
                                                ) : (
                                                    <>
                                                        <a href="/terms-of-service" target="_blank" rel="noopener noreferrer" className="underline hover:text-jam-orange">Terms of Service</a> and <a href="/privacy-policy" target="_blank" rel="noopener noreferrer" className="underline hover:text-jam-orange">Privacy Policy</a>
                                                    </>
                                                )}
                                                .
                                            </label>
                                            <p className="text-gray-500 text-xs mt-1">
                                                I consent to the processing of my payroll data in accordance with the Data Protection Act.
                                            </p>
                                        </div>
                                    </div>

                                    <div>
                                        <button
                                            type="submit"
                                            disabled={isSubmitting}
                                            className="w-full flex justify-center items-center py-3 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-jam-black hover:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-jam-orange transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                                        >
                                            {isSubmitting ? (
                                                <>
                                                    <Icons.Refresh className="w-5 h-5 animate-spin mr-2" />
                                                    Creating Account...
                                                </>
                                            ) : (
                                                isTeamInvitation ? 'Create My Account' : (formData.plan === 'Free' || pricing.total === 0 ? 'Create Free Account' : 'Continue to Payment')
                                            )}
                                        </button>
                                    </div>
                                </>
                            ) : (
                                <>
                                    <div className="relative py-2">
                                        <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-gray-300" /></div>
                                        <div className="relative flex justify-center text-sm"><span className="bg-white px-2 text-gray-500">Secure Payment</span></div>
                                    </div>

                                    {/* Payment Method Selection */}
                                    <div className="mb-6">
                                        <label className="block text-sm font-medium text-gray-700 mb-3">Select Payment Method</label>
                                        <div className={`grid ${resellerInviteToken && bankTransfer.enabled !== false ? 'grid-cols-3' : 'grid-cols-1 sm:grid-cols-2'} gap-3`}>
                                            <button
                                                type="button"
                                                onClick={() => setPaymentMethod('card')}
                                                className={`flex flex-col items-center justify-center p-4 border-2 rounded-lg transition-all ${paymentMethod === 'card'
                                                    ? 'border-jam-orange bg-orange-50'
                                                    : 'border-gray-200 hover:border-gray-300'
                                                    }`}
                                            >
                                                <Icons.CreditCard className="w-6 h-6 mb-2" />
                                                <span className="text-sm font-medium">Card Payment</span>
                                                <span className="text-xs text-gray-500 mt-1">Visa, Mastercard</span>
                                            </button>
                                            {bankTransfer.enabled !== false && (
                                                <button
                                                    type="button"
                                                    onClick={() => setPaymentMethod('direct-deposit')}
                                                    className={`flex flex-col items-center justify-center p-4 border-2 rounded-lg transition-all ${paymentMethod === 'direct-deposit'
                                                        ? 'border-jam-orange bg-orange-50'
                                                        : 'border-gray-200 hover:border-gray-300'
                                                        }`}
                                                >
                                                    <Icons.Building className="w-6 h-6 mb-2" />
                                                    <span className="text-sm font-medium">Direct Deposit</span>
                                                    <span className="text-xs text-gray-500 mt-1">Bank Transfer</span>
                                                </button>
                                            )}
                                            {resellerInviteToken && (
                                                <button
                                                    type="button"
                                                    onClick={() => setPaymentMethod('reseller-billing')}
                                                    className={`flex flex-col items-center justify-center p-4 border-2 rounded-lg transition-all ${paymentMethod === 'reseller-billing'
                                                        ? 'border-jam-orange bg-orange-50'
                                                        : 'border-gray-200 hover:border-gray-300'
                                                        }`}
                                                >
                                                    <Icons.Users className="w-6 h-6 mb-2" />
                                                    <span className="text-sm font-medium">Reseller Billing</span>
                                                    <span className="text-xs text-gray-500 mt-1">Billed by Partner</span>
                                                </button>
                                            )}
                                        </div>
                                    </div>

                                    {paymentMethod === 'card' && dimePayEnabled && (
                                        <div className="mb-6 relative">
                                            {/* Widget container - React should NOT manage children here */}
                                            <div
                                                ref={widgetContainerRef}
                                                id="dimepay-widget"
                                                className="min-h-[400px] w-full rounded-lg border border-gray-100 shadow-sm bg-white overflow-hidden"
                                                suppressHydrationWarning
                                                suppressContentEditableWarning
                                            />
                                            {/* Loading overlay - rendered outside widget container to avoid DOM conflicts */}
                                            {widgetStatus === 'loading' && (
                                                <div className="absolute inset-0 flex flex-col items-center justify-center bg-white z-10 pointer-events-none rounded-lg">
                                                    <Icons.Refresh className="w-6 h-6 animate-spin text-jam-orange mb-2" />
                                                    <span className="text-sm text-gray-500">Loading Payment Gateway...</span>
                                                </div>
                                            )}
                                            {/* Error overlay - rendered outside widget container to avoid DOM conflicts */}
                                            {widgetStatus === 'error' && (
                                                <div className="absolute inset-0 flex flex-col items-center justify-center bg-white z-10 p-6 text-center rounded-lg">
                                                    <Icons.Alert className="w-8 h-8 text-red-500 mb-2" />
                                                    <p className="text-red-600 font-medium mb-4">Failed to load payment widget.</p>
                                                    <button
                                                        type="button"
                                                        onClick={() => {
                                                            cleanupWidget();
                                                            setWidgetStatus('loading');
                                                            setPaymentError(null);
                                                            initDimePay();
                                                        }}
                                                        className="px-4 py-2 bg-gray-100 text-gray-700 rounded hover:bg-gray-200 text-sm"
                                                    >
                                                        Retry Connection
                                                    </button>
                                                </div>
                                            )}
                                        </div>
                                    )}

                                    {paymentMethod === 'direct-deposit' && !directDepositCardStep && (
                                        <BankTransferInstructions
                                            bankTransfer={bankTransfer}
                                            amount={pricing.total}
                                            currency="JMD"
                                            referenceLabel={formData.email}
                                            isSubmitting={isSubmitting}
                                            confirmLabel="I've Made the Payment - Continue"
                                            onConfirm={() => setDirectDepositCardStep(true)}
                                        />
                                    )}

                                    {paymentMethod === 'direct-deposit' && directDepositCardStep && (
                                        <div className="mb-6">
                                            <div className="mb-4 p-3 bg-orange-50 border border-orange-200 rounded-lg text-xs text-gray-700">
                                                A card is required to keep your subscription active for renewals, even though you're paying this cycle by bank transfer.
                                            </div>
                                            <CardTokenizeCard
                                                mountId="dimepay-signup-direct-deposit-card"
                                                successToast="Card verified."
                                                initiate={() => dimePayService.createCardRequest({
                                                    companyId,
                                                    // 'card_update', not 'signup': this only tokenizes the card for renewals.
                                                    // 'signup' would make the webhook immediately CHARGE it via
                                                    // createDimePayRecurringSubscription, contradicting "pay by transfer".
                                                    flow: 'card_update',
                                                    planName: formData.plan,
                                                    planType: formData.plan.toLowerCase(),
                                                    amount: pricing.total,
                                                    currency: 'JMD',
                                                    redirectUrl: `${window.location.origin}/api/billing/dimepay/card-return`
                                                })}
                                                onVerified={async (result) => {
                                                    pendingDirectDepositCardRef.current = result;
                                                }}
                                                onSuccess={() => {
                                                    void handleSubmit();
                                                }}
                                            />
                                            <button
                                                type="button"
                                                onClick={() => setDirectDepositCardStep(false)}
                                                disabled={isSubmitting}
                                                className="w-full mt-3 text-sm text-gray-600 hover:text-gray-900"
                                            >
                                                Back to payment instructions
                                            </button>
                                        </div>
                                    )}

                                    {paymentMethod === 'reseller-billing' && resellerInviteToken && (
                                        <div className="mb-6 p-6 bg-purple-50 border border-purple-200 rounded-lg">
                                            <h3 className="font-semibold text-gray-900 mb-4 flex items-center">
                                                <Icons.Users className="w-5 h-5 mr-2 text-purple-600" />
                                                Reseller-Managed Billing
                                            </h3>
                                            <div className="space-y-3 text-sm text-gray-700">
                                                <p>
                                                    Your account will be managed by your reseller partner. They will handle all billing and payment collection on your behalf.
                                                </p>
                                                <div className="pt-3 border-t border-purple-200">
                                                    <div className="mb-2">
                                                        <span className="font-medium">Plan:</span> {formData.plan}
                                                    </div>
                                                    <div className="mb-2">
                                                        <span className="font-medium">Monthly Rate:</span> JMD ${pricing.total.toLocaleString()}
                                                    </div>
                                                    <div>
                                                        <span className="font-medium">Billing Contact:</span> Your reseller partner
                                                    </div>
                                                </div>
                                            </div>
                                            <div className="mt-4 p-3 bg-white rounded border border-purple-100">
                                                <p className="text-xs text-gray-600">
                                                    <strong>Note:</strong> By continuing, you agree to have your reseller partner manage your subscription billing. You can change this arrangement at any time from your account settings.
                                                </p>
                                            </div>
                                            <button
                                                type="button"
                                                onClick={handleSubmit}
                                                disabled={isSubmitting}
                                                className="w-full mt-4 py-3 px-4 bg-jam-black text-white rounded-lg hover:bg-gray-800 transition-all font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
                                            >
                                                {isSubmitting ? (
                                                    <>
                                                        <Icons.Refresh className="w-5 h-5 animate-spin mr-2" />
                                                        Creating Account...
                                                    </>
                                                ) : (
                                                    "Accept & Create Account"
                                                )}
                                            </button>
                                        </div>
                                    )}

                                    {payPalEnabled && paymentConfig?.paypal?.clientId && !dimePayEnabled && paymentMethod === 'card' && (
                                        <div className="w-full min-h-[150px] mt-6">
                                            <div className="text-center text-xs text-gray-400 mb-2">PAY VIA PAYPAL (USD)</div>
                                            <PayPalScriptProvider options={{ clientId: paymentConfig.paypal.clientId, currency: "USD" }}>
                                                <PayPalButtons
                                                    style={{ layout: "vertical", color: "gold", shape: "rect", label: "pay" }}
                                                    createOrder={(_data, actions) => {
                                                        return actions.order.create({
                                                            intent: "CAPTURE",
                                                            purchase_units: [{ amount: { currency_code: "USD", value: pricing.totalUSD } }],
                                                        });
                                                    }}
                                                    onApprove={async (_data, actions) => {
                                                        if (actions.order) {
                                                            await actions.order.capture();
                                                            handleSubmit();
                                                        }
                                                    }}
                                                />
                                            </PayPalScriptProvider>
                                        </div>
                                    )}

                                    {paymentError && <p className="text-red-500 text-sm text-center mt-4">{paymentError}</p>}

                                    <button type="button" onClick={() => setStep('account')} className="w-full mt-4 text-sm text-gray-600 hover:text-gray-900">
                                        &larr; Back to Account Details
                                    </button>
                                </>
                            )}
                        </form>
                    </div>
                </div>

                {/* Right Side - Order Summary */}
                {!isTeamInvitation && (
                    <div className="hidden lg:block flex-1 bg-gray-50 w-0 border-l border-gray-200">
                        <div className="sticky top-0 h-screen flex flex-col justify-center px-12 overflow-y-auto py-12">
                            <div className="max-w-md mx-auto w-full bg-white p-8 rounded-2xl shadow-lg border border-gray-100">
                                <h3 className="text-lg font-medium text-gray-900 mb-6">Order Summary</h3>
                                <div className="pb-6 border-b border-gray-100">
                                    <div className="flex items-start justify-between mb-4">
                                        <div>
                                            <p className="font-bold text-gray-900 text-lg">{formData.plan} Plan</p>
                                            <p className="text-sm text-gray-500 mt-1 capitalize">{formData.billingCycle} Subscription</p>
                                        </div>
                                        <div className="text-right">
                                            <span className="text-2xl font-bold text-jam-orange">${pricing.total.toLocaleString()}</span>
                                            <p className="text-xs text-gray-400">JMD / {formData.billingCycle === 'annual' ? 'Year' : 'Month'}</p>
                                        </div>
                                    </div>

                                    <OrderSummaryBreakdown />
                                </div>
                                <div className="pt-6 text-xs text-gray-400 text-center">
                                    <p>Secure payment processing via {dimePayEnabled ? 'Dime Pay' : 'PayPal'}.</p>
                                </div>
                            </div>
                        </div>
                    </div>
                )}
            </div>
            {!isTeamInvitation && (
                <div className="lg:hidden fixed inset-x-0 bottom-0 z-40 border-t border-gray-200 bg-white shadow-2xl">
                    {showMobileSummary && (
                        <div className="max-h-[55vh] overflow-y-auto border-b border-gray-100 p-4">
                            <div className="mb-3 flex items-start justify-between">
                                <div>
                                    <p className="font-bold text-gray-900">{formData.plan} Plan</p>
                                    <p className="text-xs text-gray-500 capitalize">{formData.billingCycle} Subscription</p>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => setShowMobileSummary(false)}
                                    className="rounded-full p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
                                    aria-label="Close order summary"
                                >
                                    <Icons.Close className="h-5 w-5" />
                                </button>
                            </div>
                            <OrderSummaryBreakdown />
                        </div>
                    )}
                    <button
                        type="button"
                        onClick={() => setShowMobileSummary((value) => !value)}
                        className="flex w-full items-center justify-between px-4 py-3 text-left"
                        aria-expanded={showMobileSummary}
                    >
                        <div>
                            <p className="text-xs font-bold uppercase text-gray-500">Estimated fees</p>
                            <p className="text-sm font-medium text-gray-900">{formData.plan} - {formData.billingCycle}</p>
                        </div>
                        <div className="text-right">
                            <p className="text-lg font-bold text-jam-orange">JMD ${pricing.total.toLocaleString()}</p>
                            <p className="text-xs text-gray-500">{showMobileSummary ? 'Hide details' : 'View breakdown'}</p>
                        </div>
                    </button>
                </div>
            )}
        </>
    );
};
