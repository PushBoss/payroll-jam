declare const process: any;

import React, { useState, useEffect, useRef } from 'react';
import { Icons } from '../components/Icons';
import { GLMapping, IntegrationConfig, CompanySettings, TaxConfig, User, Role, Department, Designation, PricingPlan, PaymentRecord, BranchLocation } from '../core/types';
import { getPlanPriceDetails } from '../utils/pricing';
import { storage } from '../services/storage';
import { auditService } from '../core/auditService';
import { checkDbConnection } from '../services/supabaseClient';
import { BillingService } from '../services/BillingService';
import { supabase } from '../services/supabaseClient';
import { CompanyService } from '../services/CompanyService';
import { ResellerService } from '../services/ResellerService';
import { UserService } from '../services/UserService';

import { dimePayService } from '../services/dimePayService';
import { emailService } from '../services/emailService';
import { CardTokenizeCard } from '../components/billing/CardTokenizeCard';
import { BankTransferInstructions } from '../components/billing/BankTransferInstructions';
import { generateUUID } from '../utils/uuid';
import { toast } from 'sonner';
import { useAuth } from '../context/AuthContext';
import { downloadFile } from '../utils/exportHelpers';
import { useAccount } from '../hooks/useAccount';
import { getUserRoleInAccount, inviteUserToAccount, MemberRole } from '../features/employees/inviteService';
import { InviteUserCard } from '../components/InviteUserCard';
import { AccountMembersCard } from '../components/AccountMembersCard';
import { TaxConfigCard } from '../features/employees/TaxConfigCard';
import packageJson from '../../package.json';

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

const GEOFENCE_RADIUS_PRESETS = [
    { label: 'Small office', value: '50', description: 'Tight office or shop' },
    { label: 'Building', value: '100', description: 'Most offices' },
    { label: 'Compound', value: '250', description: 'Large premises' },
    { label: 'Wide area', value: '500', description: 'Campus or yard' },
];

const DEFAULT_NEW_LOCATION = {
    name: '',
    address: '',
    parish: 'Kingston',
    latitude: '',
    longitude: '',
    geofenceRadiusMeters: '100',
};

const buildJamaicaLocationQuery = (location: typeof DEFAULT_NEW_LOCATION) => (
    [location.address, location.parish, 'Jamaica']
        .map((part) => part.trim())
        .filter(Boolean)
        .join(', ')
);

const getGoogleMapsUrl = (latitude: number, longitude: number) =>
    `https://www.google.com/maps?q=${latitude},${longitude}`;


interface SettingsProps {
    companyData?: CompanySettings;
    onUpdateCompany: (data: CompanySettings) => void | Promise<void>;
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
    onSuccess: (data?: any) => void | Promise<void>;
}

interface PaymentMethodModalProps {
    currentUser: User | null;
    currentSubscription?: any;
    onClose: () => void;
    onSuccess: () => Promise<void> | void;
}

const CheckoutModal: React.FC<CheckoutModalProps> = ({ plan, currentUser, onClose, onSuccess }) => {
    // Restored state for UI feedback
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [paymentSuccess, setPaymentSuccess] = useState(false);
    const isMountedRef = useRef(true);
    const onSuccessRef = useRef(onSuccess);

    // Calculate price based on plan type - settings always monthly
    const { amount: price } = getPlanPriceDetails(plan, 'monthly');
    const isPaid = price > 0;

    useEffect(() => {
        onSuccessRef.current = onSuccess;
    }, [onSuccess]);

    useEffect(() => {
        isMountedRef.current = true;

        if (paymentSuccess) {
            return () => {
                isMountedRef.current = false;
            };
        }

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
                    planType: plan.name.toLowerCase(),
                    name: currentUser?.name // FIX: Pass user name to fix "Hi Guest" email issue
                },
                onSuccess: (data) => {
                    if (isMountedRef.current) {
                        console.log('DimePay Upgrade Success:', data);
                        console.log('📦 Subscription updated:', data?.subscription_id || data?.data?.subscription_id || data?.data?.subscription?.subscription_id);
                        setPaymentSuccess(true);
                        setTimeout(() => { if (isMountedRef.current) onSuccessRef.current(data); }, 2000);
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
    }, [plan, isPaid, currentUser, price, paymentSuccess]);

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

const PaymentMethodModal: React.FC<PaymentMethodModalProps> = ({ currentUser, currentSubscription, onClose, onSuccess }) => {
    if (!currentUser?.companyId) {
        return (
            <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
                <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg p-6 text-center">
                    <Icons.Alert className="w-10 h-10 text-red-500 mb-3 mx-auto" />
                    <p className="text-red-600 font-medium mb-4">Missing company information.</p>
                    <button onClick={onClose} className="px-4 py-2 bg-gray-100 text-gray-700 rounded hover:bg-gray-200 text-sm">Close</button>
                </div>
            </div>
        );
    }

    return (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl overflow-hidden flex flex-col max-h-[90vh] animate-scale-in">
                <div className="bg-jam-black text-white p-6 flex justify-between items-center shrink-0">
                    <div>
                        <h3 className="text-xl font-bold">Add payment method</h3>
                        <p className="text-xs text-gray-400">Your first saved card becomes primary. Later cards are saved until you explicitly make one primary.</p>
                    </div>
                    <button onClick={onClose}><Icons.Close className="w-6 h-6 text-gray-400 hover:text-white" /></button>
                </div>
                <div className="p-6 overflow-y-auto">
                    <CardTokenizeCard
                        initiate={() => BillingService.initiateCardUpdate(currentUser.id, {
                            companyId: currentUser.companyId,
                            subscription: currentSubscription
                        })}
                        onVerified={async (result) => {
                            await dimePayService.updateSubscriptionPaymentMethod({
                                companyId: currentUser.companyId!,
                                localSubscriptionId: currentSubscription?.id,
                                subscriptionId: currentSubscription?.dimepaySubscriptionId,
                                cardToken: result.cardToken,
                                cardRequestToken: result.cardRequestToken,
                                cardLast4: result.cardLast4,
                                cardBrand: result.cardBrand,
                                cardExpiry: result.cardExpiry
                            });
                        }}
                        onSuccess={onSuccess}
                        successToast="Payment method saved successfully."
                    />
                </div>
            </div>
        </div>
    );
};

interface PlanSelectorModalProps {
    plans: PricingPlan[];
    currentPlan: string;
    onClose: () => void;
    onSelectPlan: (planName: string) => void;
}

const PlanSelectorModal: React.FC<PlanSelectorModalProps> = ({ plans, currentPlan, onClose, onSelectPlan }) => {
    const availablePlans = plans.filter(p => {
        if (p.name === currentPlan) return false;
        if (p.name === 'Reseller' && currentPlan === 'Enterprise') return false;
        if (p.name === 'Enterprise' && currentPlan === 'Reseller') return false;
        if (p.name === 'Pro' && currentPlan === 'Professional') return false;
        if (p.name === 'Professional' && currentPlan === 'Pro') return false;
        if (p.priceConfig.type === 'free') return false;
        return p.isActive;
    });

    return (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh] animate-scale-in text-gray-800">
                <div className="bg-jam-black text-white p-6 flex justify-between items-center shrink-0">
                    <div>
                        <h3 className="text-xl font-bold">Select Upgrade Plan</h3>
                        <p className="text-xs text-gray-400">Choose a new plan to unlock more features</p>
                    </div>
                    <button onClick={onClose}>
                        <Icons.Close className="w-6 h-6 text-gray-400 hover:text-white" />
                    </button>
                </div>
                <div className="p-6 overflow-y-auto space-y-4">
                    {availablePlans.length === 0 ? (
                        <p className="text-center text-gray-500 py-8">No other upgrade plans available.</p>
                    ) : (
                        availablePlans.map(plan => {
                            const monthlyPrice = plan.priceConfig.monthly || plan.priceConfig.baseFee || 0;
                            return (
                                <div key={plan.id} className="border border-gray-200 hover:border-jam-orange rounded-xl p-4 transition-all flex flex-col justify-between hover:shadow-md bg-gray-50/50">
                                    <div className="flex justify-between items-start mb-2">
                                        <div>
                                            <h4 className="font-bold text-lg text-gray-900">{plan.name}</h4>
                                            <p className="text-xs text-gray-500 mt-0.5">{plan.description}</p>
                                        </div>
                                        <div className="text-right">
                                            <span className="text-xl font-extrabold text-jam-black">${monthlyPrice.toLocaleString()}</span>
                                            <span className="text-xs text-gray-500 block">/month</span>
                                        </div>
                                    </div>
                                    <button
                                        onClick={() => onSelectPlan(plan.name)}
                                        className="mt-3 w-full py-2 bg-jam-black text-white font-bold rounded-lg hover:bg-jam-orange hover:text-jam-black transition-colors text-sm"
                                    >
                                        Select {plan.name}
                                    </button>
                                </div>
                            );
                        })
                    )}
                </div>
            </div>
        </div>
    );
};

interface PaymentMethodChoiceModalProps {
    plan: PricingPlan;
    currentUser: User | null;
    onClose: () => void;
    onAddNewCard: () => void;
    onSuccess: () => Promise<void> | void;
}

const bankTransferDefaults = {
    enabled: true,
    bankName: 'NCB (National Commercial Bank)',
    accountName: 'Balance Investments Limited',
    accountNumber: '404286331',
    accountType: 'Savings Account',
    branch: 'UWI Branch',
    instructions: 'After making the deposit, your account will be activated within 24 hours. You will receive a confirmation email once payment is verified.'
};

const PaymentMethodChoiceModal: React.FC<PaymentMethodChoiceModalProps> = ({ plan, currentUser, onClose, onAddNewCard, onSuccess }) => {
    const { amount: price } = getPlanPriceDetails(plan, 'monthly');
    const paymentConfig = storage.getGlobalConfig();
    const bankTransfer = { ...bankTransferDefaults, ...(paymentConfig?.bankTransfer || {}) };

    const [mode, setMode] = useState<'card' | 'bank-transfer'>('card');
    const [methods, setMethods] = useState<any[]>([]);
    const [isLoadingMethods, setIsLoadingMethods] = useState(true);
    const [selectedMethodId, setSelectedMethodId] = useState<string | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [showCardStepForTransfer, setShowCardStepForTransfer] = useState(false);
    const [cardJustAdded, setCardJustAdded] = useState(false);

    useEffect(() => {
        let cancelled = false;
        const load = async () => {
            if (!currentUser?.companyId) {
                setIsLoadingMethods(false);
                return;
            }
            try {
                const list = await BillingService.listPaymentMethods(currentUser.companyId);
                if (cancelled) return;
                setMethods(list);
                const primary = list.find((m: any) => m.isPrimary);
                setSelectedMethodId(primary?.id || list[0]?.id || null);
            } catch (err) {
                console.error('Failed to load payment methods:', err);
            } finally {
                if (!cancelled) setIsLoadingMethods(false);
            }
        };
        void load();
        return () => { cancelled = true; };
    }, [currentUser?.companyId]);

    const handlePayWithExistingCard = async () => {
        if (!currentUser?.companyId || !selectedMethodId) return;
        setIsSubmitting(true);
        setError(null);
        try {
            await BillingService.upgradeWithExistingCard({
                companyId: currentUser.companyId,
                paymentMethodId: selectedMethodId,
                planName: plan.name,
                planType: plan.name.toLowerCase(),
                amount: price
            });
            await onSuccess();
        } catch (err: any) {
            setError(err.message || 'Failed to upgrade with this card.');
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleBankTransferConfirm = async () => {
        if (!currentUser?.companyId) return;
        if (methods.length === 0 && !cardJustAdded) {
            setShowCardStepForTransfer(true);
            return;
        }
        setIsSubmitting(true);
        setError(null);
        try {
            await BillingService.initiateBankTransferUpgrade({
                companyId: currentUser.companyId,
                planName: plan.name,
                planType: plan.name.toLowerCase(),
                amount: price
            });
            toast.success('Upgrade request submitted. Your plan will update once the transfer is verified.');
            onClose();
        } catch (err: any) {
            setError(err.message || 'Failed to submit upgrade request.');
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh] animate-scale-in text-gray-800">
                <div className="bg-jam-black text-white p-6 flex justify-between items-center shrink-0">
                    <div>
                        <h3 className="text-xl font-bold">Pay for {plan.name}</h3>
                        <p className="text-xs text-gray-400">Choose how you'd like to pay</p>
                    </div>
                    <button onClick={onClose}><Icons.Close className="w-6 h-6 text-gray-400 hover:text-white" /></button>
                </div>
                <div className="p-6 overflow-y-auto space-y-4">
                    <div className="grid grid-cols-2 gap-3">
                        <button
                            type="button"
                            onClick={() => { setMode('card'); setShowCardStepForTransfer(false); }}
                            className={`flex flex-col items-center justify-center p-4 border-2 rounded-lg transition-all ${mode === 'card' ? 'border-jam-orange bg-orange-50' : 'border-gray-200 hover:border-gray-300'}`}
                        >
                            <Icons.CreditCard className="w-6 h-6 mb-2" />
                            <span className="text-sm font-medium">Card</span>
                        </button>
                        {bankTransfer.enabled !== false && (
                            <button
                                type="button"
                                onClick={() => setMode('bank-transfer')}
                                className={`flex flex-col items-center justify-center p-4 border-2 rounded-lg transition-all ${mode === 'bank-transfer' ? 'border-jam-orange bg-orange-50' : 'border-gray-200 hover:border-gray-300'}`}
                            >
                                <Icons.Building className="w-6 h-6 mb-2" />
                                <span className="text-sm font-medium">Bank Transfer</span>
                            </button>
                        )}
                    </div>

                    {error && (
                        <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-600">{error}</div>
                    )}

                    {mode === 'card' && (
                        isLoadingMethods ? (
                            <div className="py-8 flex justify-center"><Icons.Refresh className="w-6 h-6 animate-spin text-jam-orange" /></div>
                        ) : methods.length > 0 ? (
                            <div className="space-y-3">
                                <div className="space-y-2">
                                    {methods.map((m) => (
                                        <label key={m.id} className={`flex items-center justify-between p-3 border rounded-lg cursor-pointer ${selectedMethodId === m.id ? 'border-jam-orange bg-orange-50' : 'border-gray-200'}`}>
                                            <div className="flex items-center gap-3">
                                                <input
                                                    type="radio"
                                                    name="payment-method"
                                                    checked={selectedMethodId === m.id}
                                                    onChange={() => setSelectedMethodId(m.id)}
                                                />
                                                <span className="text-sm font-medium capitalize">{m.cardBrand || 'Card'} •••• {m.cardLast4}</span>
                                            </div>
                                            {m.isPrimary && <span className="text-xs font-semibold text-jam-orange">Primary</span>}
                                        </label>
                                    ))}
                                </div>
                                <button
                                    type="button"
                                    onClick={handlePayWithExistingCard}
                                    disabled={isSubmitting || !selectedMethodId}
                                    className="w-full py-3 bg-jam-black text-white font-bold rounded-lg hover:bg-gray-800 transition-colors disabled:opacity-50"
                                >
                                    {isSubmitting ? 'Processing...' : `Pay $${price.toLocaleString()} with selected card`}
                                </button>
                                <button
                                    type="button"
                                    onClick={onAddNewCard}
                                    disabled={isSubmitting}
                                    className="w-full py-2 text-sm text-jam-orange font-semibold hover:underline"
                                >
                                    + Add a new card instead
                                </button>
                            </div>
                        ) : (
                            <div className="text-center py-4">
                                <p className="text-sm text-gray-600 mb-4">No saved cards yet.</p>
                                <button
                                    type="button"
                                    onClick={onAddNewCard}
                                    className="w-full py-3 bg-jam-black text-white font-bold rounded-lg hover:bg-gray-800 transition-colors"
                                >
                                    Add a card to pay ${price.toLocaleString()}
                                </button>
                            </div>
                        )
                    )}

                    {mode === 'bank-transfer' && !showCardStepForTransfer && (
                        <BankTransferInstructions
                            bankTransfer={bankTransfer}
                            amount={price}
                            currency="JMD"
                            referenceLabel={currentUser?.email || ''}
                            isSubmitting={isSubmitting}
                            confirmLabel="I've Made the Payment - Submit for Approval"
                            submittingLabel="Submitting..."
                            onConfirm={handleBankTransferConfirm}
                        />
                    )}

                    {mode === 'bank-transfer' && showCardStepForTransfer && (
                        <div>
                            <div className="mb-4 p-3 bg-orange-50 border border-orange-200 rounded-lg text-xs text-gray-700">
                                A card is required on file before paying by bank transfer, since it's a subscription. Add one below, then submit your transfer.
                            </div>
                            <CardTokenizeCard
                                mountId="dimepay-upgrade-transfer-card"
                                successToast="Card added."
                                initiate={() => BillingService.initiateCardUpdate(currentUser!.id, { companyId: currentUser!.companyId })}
                                onVerified={async (result) => {
                                    await dimePayService.updateSubscriptionPaymentMethod({
                                        companyId: currentUser!.companyId!,
                                        cardToken: result.cardToken,
                                        cardRequestToken: result.cardRequestToken,
                                        cardLast4: result.cardLast4,
                                        cardBrand: result.cardBrand,
                                        cardExpiry: result.cardExpiry
                                    });
                                }}
                                onSuccess={() => {
                                    setCardJustAdded(true);
                                    setShowCardStepForTransfer(false);
                                }}
                            />
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

const MAX_SAVED_PAYMENT_METHODS = 5;

interface PaymentMethodsCardProps {
    currentUser: User | null;
    currentSubscription?: any;
}

const PaymentMethodsCard: React.FC<PaymentMethodsCardProps> = ({ currentUser, currentSubscription }) => {
    const [methods, setMethods] = useState<any[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [busyId, setBusyId] = useState<string | null>(null);
    const [showAddModal, setShowAddModal] = useState(false);

    const load = async () => {
        if (!currentUser?.companyId) {
            setIsLoading(false);
            return;
        }
        setIsLoading(true);
        try {
            const list = await BillingService.listPaymentMethods(currentUser.companyId);
            setMethods(list);
        } catch (err) {
            console.error('Failed to load payment methods:', err);
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        void load();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [currentUser?.companyId]);

    const handleSetPrimary = async (id: string) => {
        if (!currentUser?.companyId) return;
        setBusyId(id);
        try {
            await BillingService.setPrimaryPaymentMethod(currentUser.companyId, id);
            toast.success('Primary payment method updated.');
            await load();
        } catch (err: any) {
            toast.error(err.message || 'Failed to set primary payment method.');
        } finally {
            setBusyId(null);
        }
    };

    const handleRemove = async (id: string) => {
        if (!currentUser?.companyId) return;
        if (!confirm('Remove this payment method?')) return;
        setBusyId(id);
        try {
            await BillingService.removePaymentMethod(currentUser.companyId, id);
            toast.success('Payment method removed.');
            await load();
        } catch (err: any) {
            toast.error(err.message || 'Failed to remove payment method.');
        } finally {
            setBusyId(null);
        }
    };

    return (
        <div className="bg-white p-6 rounded-xl border border-gray-200">
            <div className="flex flex-wrap justify-between items-start gap-3 mb-4">
                <div>
                    <h3 className="text-lg font-bold">Payment methods</h3>
                    <p className="text-sm text-gray-500">Your primary card is used for recurring billing. Choose a different saved card only when you want to change it.</p>
                </div>
                <button
                    onClick={() => setShowAddModal(true)}
                    disabled={methods.length >= MAX_SAVED_PAYMENT_METHODS}
                    title={methods.length >= MAX_SAVED_PAYMENT_METHODS ? `Maximum of ${MAX_SAVED_PAYMENT_METHODS} saved cards reached` : undefined}
                    className="bg-gray-100 hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed text-gray-800 text-sm font-semibold px-4 py-2 rounded-lg transition-colors border border-gray-300"
                >
                    {methods.length === 0 ? '+ Add payment method' : '+ Add another card'}
                </button>
            </div>
            {isLoading ? (
                <div className="flex items-center justify-center py-6">
                    <Icons.Refresh className="w-5 h-5 animate-spin text-jam-orange" />
                </div>
            ) : methods.length === 0 ? (
                <div className="flex items-center gap-3 p-4 bg-yellow-50 rounded-lg border border-yellow-200">
                    <Icons.Alert className="w-5 h-5 shrink-0 text-yellow-600" />
                    <p className="text-sm text-yellow-800">No saved cards yet. The first card you add will become your primary billing card.</p>
                </div>
            ) : (
                <div className="space-y-2">
                    {methods.map((m) => (
                        <div key={m.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg border border-gray-200">
                            <div className="flex items-center gap-3">
                                <Icons.CreditCard className="w-5 h-5 text-gray-500" />
                                <div>
                                    <p className="text-sm font-semibold text-gray-900 capitalize">{m.cardBrand || 'Card'} •••• {m.cardLast4}</p>
                                    {m.isPrimary && <p className="text-xs font-semibold text-jam-orange">Primary billing card</p>}
                                </div>
                            </div>
                            <div className="flex items-center gap-3">
                                {!m.isPrimary && (
                                    <button
                                        onClick={() => handleSetPrimary(m.id)}
                                        disabled={busyId === m.id}
                                        className="text-xs font-semibold text-jam-orange hover:underline disabled:opacity-50"
                                    >
                                        Set as primary
                                    </button>
                                )}
                                <button
                                    onClick={() => handleRemove(m.id)}
                                    disabled={busyId === m.id}
                                    className="text-xs font-semibold text-red-600 hover:underline disabled:opacity-50"
                                >
                                    Remove
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            )}
            {showAddModal && (
                <PaymentMethodModal
                    currentUser={currentUser}
                    currentSubscription={currentSubscription}
                    onClose={() => setShowAddModal(false)}
                    onSuccess={async () => {
                        setShowAddModal(false);
                        await load();
                    }}
                />
            )}
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
    const [activeTab, setActiveTab] = useState<'company' | 'billing' | 'organization' | 'taxes' | 'integrations' | 'users'>('company');

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
    const [memberRefreshTrigger, setMemberRefreshTrigger] = useState(0);
    const [isSavingCompany, setIsSavingCompany] = useState(false);

    // Organization Management State
    const [newDept, setNewDept] = useState('');
    const [newDesig, setNewDesig] = useState('');
    const [newDesigDept, setNewDesigDept] = useState('');
    const [newLocation, setNewLocation] = useState(DEFAULT_NEW_LOCATION);
    const [isLocatingBranch, setIsLocatingBranch] = useState(false);
    const [isGeocodingBranch, setIsGeocodingBranch] = useState(false);
    const [showAdvancedLocationFields, setShowAdvancedLocationFields] = useState(false);

    // DB State
    const [, setDbStatus] = useState<{ connected: boolean; message: string; details?: string } | null>(null);
    const [, setIsCheckingDb] = useState(false);

    const [upgradeTarget, setUpgradeTarget] = useState<PricingPlan | null>(null);
    const [paymentMethodChoiceTarget, setPaymentMethodChoiceTarget] = useState<PricingPlan | null>(null);
    const [invoices, setInvoices] = useState<PaymentRecord[]>([]);
    const [currentSubscription, setCurrentSubscription] = useState<any>(null);
    const [isLoadingBilling, setIsLoadingBilling] = useState(false);
    const [showCancelModal, setShowCancelModal] = useState(false);
    const [isCancelling, setIsCancelling] = useState(false);
    const [requestRefund, setRequestRefund] = useState(false);
    const [showPlanSelectorModal, setShowPlanSelectorModal] = useState(false);
    const [appVersion, setAppVersion] = useState<string>('Loading...');

    useEffect(() => {
        const fetchAppVersion = async () => {
            try {
                if (!supabase) {
                    setAppVersion(packageJson.version);
                    return;
                }

                const { data, error } = await supabase.from('system_settings').select('current_version').eq('id', 1).maybeSingle();
                if (!error && data?.current_version) {
                    setAppVersion(data.current_version);
                } else {
                    setAppVersion(packageJson.version);
                }
            } catch (err) {
                setAppVersion(packageJson.version);
            }
        };
        fetchAppVersion();
    }, []);

    const mapPaymentHistoryToInvoices = (payments: any[]): PaymentRecord[] => (
        payments.map(p => ({
            id: p.invoiceNumber || p.id,
            date: new Date(p.paymentDate).toLocaleDateString(),
            amount: p.amount,
            plan: p.description || 'Subscription',
            method: (p.paymentMethod === 'card' ? 'Card' : 'Bank Transfer') as any,
            status: p.status.toUpperCase() as any,
            referenceId: p.transactionId || p.id
        }))
    );

    const refreshBillingData = async (companyId: string) => {
        const subscription = await BillingService.getSubscription(companyId);
        const payments = await BillingService.getPaymentHistory(companyId);

        setCurrentSubscription(subscription);
        setInvoices(mapPaymentHistoryToInvoices(payments));

        return subscription;
    };

    const waitForBillingSync = async (companyId: string, attempts = 6, delayMs = 1500) => {
        for (let attempt = 0; attempt < attempts; attempt++) {
            const subscription = await refreshBillingData(companyId);
            if (subscription?.dimepaySubscriptionId || subscription?.paymentMethodLast4 || subscription?.dimeCardToken || subscription?.metadata?.card_last4 || subscription?.metadata?.dime_card_token) {
                return true;
            }

            await new Promise(resolve => setTimeout(resolve, delayMs));
        }

        return false;
    };

    const BILLING_GRACE_DAYS = 7;
    const currentRetryCount = Number(currentSubscription?.metadata?.retry_count || 0);
    const failedAtRaw = currentSubscription?.metadata?.last_failed_date;
    const failedAtDate = failedAtRaw ? new Date(failedAtRaw) : null;
    const graceEndsAt = failedAtDate
        ? new Date(failedAtDate.getTime() + (BILLING_GRACE_DAYS * 24 * 60 * 60 * 1000))
        : null;
    const daysUntilSuspension = graceEndsAt
        ? Math.max(0, Math.ceil((graceEndsAt.getTime() - Date.now()) / (24 * 60 * 60 * 1000)))
        : null;
    const isPastDue = currentSubscription?.status === 'past_due';
    const shouldShowGraceCountdown = isPastDue && graceEndsAt && currentRetryCount > 0;

    // Early return if companyData is not available
    if (!companyData) {
        return <div className="p-8 text-center">Loading company settings...</div>;
    }

    useEffect(() => {
        const loadUsers = async () => {
            if (currentUser?.companyId) {
                // Try to load from Supabase first
                const dbUsers = await UserService.getCompanyUsers(currentUser.companyId);
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
            try {
                await refreshBillingData(currentUser.companyId);
            } finally {
                setIsLoadingBilling(false);
            }
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




    const handleCompanyUpdate = async (newData: CompanySettings) => {
        await onUpdateCompany(newData);
    };

    const handleUseCurrentLocation = () => {
        if (!navigator.geolocation) {
            toast.error('This browser does not support current-location lookup.');
            return;
        }

        setIsLocatingBranch(true);
        navigator.geolocation.getCurrentPosition((position) => {
            setNewLocation((prev) => ({
                ...prev,
                name: prev.name || `${companyData?.name || 'Main'} Branch`,
                latitude: position.coords.latitude.toFixed(6),
                longitude: position.coords.longitude.toFixed(6),
            }));
            setShowAdvancedLocationFields(true);
            setIsLocatingBranch(false);
            toast.success('Current location captured. Review the branch details, then add it.');
        }, () => {
            setIsLocatingBranch(false);
            toast.error('Location permission is required to use your current location.');
        }, {
            enableHighAccuracy: true,
            timeout: 15000,
            maximumAge: 0,
        });
    };

    const handleFindLocationFromAddress = async () => {
        if (!newLocation.address.trim()) {
            toast.error('Enter a street address or landmark first.');
            return;
        }

        const query = buildJamaicaLocationQuery(newLocation);
        setIsGeocodingBranch(true);
        try {
            const response = await fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=jm&q=${encodeURIComponent(query)}`, {
                headers: {
                    Accept: 'application/json',
                },
            });

            if (!response.ok) throw new Error('Address lookup failed');
            const results = await response.json();
            const match = Array.isArray(results) ? results[0] : null;
            const latitude = Number(match?.lat);
            const longitude = Number(match?.lon);

            if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
                toast.error('Could not find that address. Try a nearby landmark or use current location.');
                return;
            }

            setNewLocation((prev) => ({
                ...prev,
                name: prev.name || match.display_name?.split(',')?.[0] || `${prev.parish} Branch`,
                latitude: latitude.toFixed(6),
                longitude: longitude.toFixed(6),
            }));
            setShowAdvancedLocationFields(true);
            toast.success('Address found. Review the branch pin, then add the branch.');
        } catch (error) {
            console.error('Branch address lookup failed:', error);
            toast.error('Address lookup is unavailable right now. Use current location or advanced coordinates.');
        } finally {
            setIsGeocodingBranch(false);
        }
    };

    const handleAddLocation = () => {
        if (!companyData || !newLocation.name.trim()) {
            toast.error('Enter a branch location name');
            return;
        }

        const latitude = Number(newLocation.latitude);
        const longitude = Number(newLocation.longitude);
        const geofenceRadiusMeters = Number(newLocation.geofenceRadiusMeters);

        if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
            toast.error('Enter valid latitude and longitude');
            return;
        }

        const nextLocation: BranchLocation = {
            id: generateUUID(),
            name: newLocation.name.trim(),
            address: newLocation.address.trim() || undefined,
            parish: newLocation.parish || undefined,
            latitude,
            longitude,
            geofenceRadiusMeters: Number.isFinite(geofenceRadiusMeters) && geofenceRadiusMeters > 0 ? geofenceRadiusMeters : 100,
        };

        handleCompanyUpdate({
            ...companyData,
            locations: [...(companyData.locations || []), nextLocation],
        });
        setNewLocation(DEFAULT_NEW_LOCATION);
        setShowAdvancedLocationFields(false);
        toast.success('Business location added');
    };

    const handleUpdateLocation = (locationId: string, updates: Partial<BranchLocation>) => {
        if (!companyData) return;
        handleCompanyUpdate({
            ...companyData,
            locations: (companyData.locations || []).map((location) =>
                location.id === locationId ? { ...location, ...updates } : location
            ),
        });
    };

    const handleDeleteLocation = (locationId: string) => {
        if (!companyData) return;
        handleCompanyUpdate({
            ...companyData,
            locations: (companyData.locations || []).filter((location) => location.id !== locationId),
        });
    };

    const handleSaveCompany = async () => {
        if (!currentUser?.companyId || !companyData) {
            toast.error('Unable to save: Missing company information');
            return;
        }

        setIsSavingCompany(true);
        try {
            await CompanyService.saveCompany(currentUser.companyId, companyData);
            auditService.log(currentUser, 'UPDATE', 'Company', 'Updated company settings');
            toast.success('Company settings saved successfully');
        } catch (error: any) {
            console.error('Error saving company:', error);
            toast.error(error.message || 'Failed to save company settings');
        } finally {
            setIsSavingCompany(false);
        }
    };



    const handleUpgradeClick = (planName: string) => {
        const targetPlan = plans.find(p => p.name === planName);
        if (!targetPlan) return;
        const { amount: price } = getPlanPriceDetails(targetPlan, 'monthly');
        // Free-plan switches (or a plan with no charge) skip payment-method selection entirely.
        if (price <= 0) {
            setUpgradeTarget(targetPlan);
            return;
        }
        setPaymentMethodChoiceTarget(targetPlan);
    };

    const finalizeUpgrade = async (targetPlan: PricingPlan) => {
        if (!currentUser?.companyId) return;

        // Persist the company plan before changing the user's role. A failed plan
        // write must not turn the account into a reseller while its tenant remains
        // on the previous tier.
        await handleCompanyUpdate({ ...companyData, plan: targetPlan.name as any, subscriptionStatus: 'ACTIVE' });
        auditService.log(currentUser, 'UPDATE', 'Billing', `Upgraded plan to ${targetPlan.name}`);

        // Update user role only when upgrading to Reseller plan.
        if (targetPlan.name === 'Reseller' && currentUser) {
            try {
                // Update user role in Supabase and locally
                const updatedUser = { ...currentUser, role: Role.RESELLER };
                await UserService.saveUser(updatedUser);
                updateUser({ role: Role.RESELLER });

                // Add their current company as a company they manage
                // This allows them to continue managing their own company as a reseller
                if (currentUser.companyId) {
                    try {
                        await ResellerService.saveResellerClientWithServiceRole(
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
        if (targetPlan.name === 'Reseller' && currentUser?.email) {
            try {
                const emailResult = await emailService.sendResellerUpgradeNotification(
                    currentUser.email,
                    companyData?.name || 'Your Company',
                    currentUser.name || 'User'
                );

                if (emailResult.success && !emailResult.message?.includes('Simulation')) {
                    toast.success(`Successfully upgraded to ${targetPlan.name}! Check your email for details.`);
                } else {
                    toast.success(`Successfully switched to ${targetPlan.name}!`);
                }
            } catch (error) {
                console.error('Email notification failed:', error);
                toast.success(`Successfully switched to ${targetPlan.name}!`);
            }

            // Reload page to ensure reseller dashboard loads properly
            setTimeout(() => {
                window.location.href = '/partner';
            }, 1500);
        } else {
            toast.success(`Successfully switched to ${targetPlan.name}!`);
        }

        // Reload billing data (wait for the record to land - synchronous upgrades land
        // immediately, webhook-driven ones (embedded payment widget) take a moment)
        setIsLoadingBilling(true);
        try {
            const synced = await waitForBillingSync(currentUser.companyId, 10, 1500);
            await refreshBillingData(currentUser.companyId);

            if (!synced) {
                toast.warning('Payment received, but subscription confirmation has not arrived yet. If this persists, check DimePay webhook configuration for this environment.');
            }
        } finally {
            setIsLoadingBilling(false);
        }
    };

    const handleUpgradeSuccess = async (_paymentData?: any) => {
        if (upgradeTarget) {
            const targetPlan = upgradeTarget;
            setUpgradeTarget(null);
            await finalizeUpgrade(targetPlan);
        }
    };

    const handlePaymentMethodChoiceSuccess = async () => {
        if (paymentMethodChoiceTarget) {
            const targetPlan = paymentMethodChoiceTarget;
            setPaymentMethodChoiceTarget(null);
            toast.success('Upgrade payment received!');
            await finalizeUpgrade(targetPlan);
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
            if (!supabase) throw new Error('No supabase client');
            const { count } = await supabase
                .from('account_members')
                .select('*', { count: 'exact', head: true })
                .eq('account_id', currentUser?.companyId);

            // Check if OWNER is in account_members. If not, add 1 for the owner.
            const { data: owner } = await supabase
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

        try {
            if (!currentUser?.companyId || !currentUser?.id) {
                toast.error('Unable to determine your company. Please refresh and try again.');
                return;
            }

            const result = await inviteUserToAccount({
                accountId: currentUser.companyId,
                email: inviteForm.email.trim(),
                role: inviteForm.role as MemberRole,
                invitedBy: currentUser.id,
            });

            if (!result.success) {
                toast.error(result.error || 'Failed to send invitation.');
                return;
            }

            auditService.log(currentUser, 'CREATE', 'User', `Invited user ${inviteForm.email}`);
            setIsInviteModalOpen(false);
            setInviteForm({ name: '', email: '', role: Role.MANAGER });
            setMemberRefreshTrigger((value) => value + 1);
            toast.success("Invitation email sent successfully!");
        } finally {
            setIsSendingInvite(false);
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

    const handleCancelSubscription = async () => {
        if (!currentUser?.companyId) {
            toast.error('Unable to cancel subscription. Missing company information.');
            return;
        }

        setIsCancelling(true);

        try {
            const response = await fetch('/api/cancel-subscription', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    subscription_id: currentSubscription?.dimepaySubscriptionId || 'legacy',
                    company_id: currentUser.companyId,
                    request_refund: requestRefund
                })
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || 'Failed to cancel subscription');
            }

            toast.success(requestRefund 
                ? 'Subscription cancelled and refund requested successfully.' 
                : 'Subscription cancelled. You\'ll retain access until the end of your billing period.'
            );

            setShowCancelModal(false);

            if (requestRefund && companyData) {
                handleCompanyUpdate({ ...companyData, plan: 'Free', subscriptionStatus: 'ACTIVE' });
            }

            // Reload billing data after a delay
            setTimeout(async () => {
                if (currentUser?.companyId) {
                    await refreshBillingData(currentUser.companyId);
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
            {paymentMethodChoiceTarget && (
                <PaymentMethodChoiceModal
                    plan={paymentMethodChoiceTarget}
                    currentUser={currentUser}
                    onClose={() => setPaymentMethodChoiceTarget(null)}
                    onAddNewCard={() => {
                        const target = paymentMethodChoiceTarget;
                        setPaymentMethodChoiceTarget(null);
                        setUpgradeTarget(target);
                    }}
                    onSuccess={handlePaymentMethodChoiceSuccess}
                />
            )}
            {showPlanSelectorModal && (
                <PlanSelectorModal
                    plans={plans}
                    currentPlan={companyData?.plan || 'Free'}
                    onClose={() => setShowPlanSelectorModal(false)}
                    onSelectPlan={(planName) => {
                        setShowPlanSelectorModal(false);
                        handleUpgradeClick(planName);
                    }}
                />
            )}
            {/* Cancel Subscription Confirmation Modal */}
            {showCancelModal && (() => {
                const getDaysSinceSubscriptionStart = () => {
                    if (!currentSubscription?.startDate) return 0;
                    const start = new Date(currentSubscription.startDate);
                    const now = new Date();
                    const diffTime = Math.abs(now.getTime() - start.getTime());
                    return Math.floor(diffTime / (1000 * 60 * 60 * 24));
                };

                const daysSinceStart = getDaysSinceSubscriptionStart();
                const canRequestRefund = daysSinceStart <= 15;

                return (
                    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
                        <div className="bg-white rounded-xl w-full max-w-md p-6 animate-fade-in text-gray-800">
                            <div className="flex items-start mb-4">
                                <div className="flex-shrink-0 mt-1">
                                    <Icons.Alert className="w-10 h-10 text-red-500" />
                                </div>
                                <div className="ml-4 w-full">
                                    <h3 className="text-xl font-bold mb-2">Cancel Subscription?</h3>
                                    <p className="text-sm text-gray-600 mb-4">
                                        Are you sure you want to cancel your <strong>{currentSubscription?.planName || companyData?.plan}</strong> subscription?
                                    </p>
                                    <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 mb-4">
                                        <p className="text-xs text-yellow-800 font-semibold">
                                            What happens next:
                                        </p>
                                        <ul className="text-xs text-yellow-800 mt-2 space-y-1 list-disc list-inside">
                                            {requestRefund ? (
                                                <li>Your access to paid plan features will end immediately</li>
                                            ) : (
                                                <li>You'll retain access until {currentSubscription?.nextBillingDate ? new Date(currentSubscription.nextBillingDate).toLocaleDateString() : 'the end of your billing period'}</li>
                                            )}
                                            <li>No further charges will be made</li>
                                            <li>Your subscription will stop renewing after the current billing period</li>
                                            <li>You can resubscribe anytime</li>
                                        </ul>
                                    </div>

                                    {canRequestRefund ? (
                                        <div className="mt-4 p-3 bg-green-50 border border-green-200 rounded-lg">
                                            <label className="flex items-center space-x-2 cursor-pointer">
                                                <input
                                                    type="checkbox"
                                                    checked={requestRefund}
                                                    onChange={(e) => setRequestRefund(e.target.checked)}
                                                    className="rounded border-gray-300 text-green-600 focus:ring-green-500"
                                                />
                                                <span className="text-xs font-semibold text-green-800">
                                                    Request a full refund
                                                </span>
                                            </label>
                                            <p className="text-[11px] text-green-700 mt-1 pl-5">
                                                You are within the 15-day refund window ({daysSinceStart} days elapsed). If requested, your access will end immediately.
                                            </p>
                                        </div>
                                    ) : (
                                        <div className="mt-4 p-3 bg-gray-50 border border-gray-200 rounded-lg">
                                            <div className="flex items-center space-x-2 text-gray-500">
                                                <Icons.Alert className="w-4 h-4 text-gray-400" />
                                                <span className="text-xs font-semibold text-gray-600">
                                                    Refund not available
                                                </span>
                                            </div>
                                            <p className="text-[11px] text-gray-400 mt-1">
                                                Refunds are only available within the first 15 days of purchase ({daysSinceStart} days elapsed).
                                            </p>
                                        </div>
                                    )}
                                </div>
                            </div>
                            <div className="flex justify-end space-x-2 mt-4">
                                <button
                                    type="button"
                                    onClick={() => {
                                        setShowCancelModal(false);
                                        setRequestRefund(false);
                                    }}
                                    className="px-4 py-2 text-gray-500 hover:text-gray-700 font-semibold"
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
                );
            })()}

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
                            {shouldShowGraceCountdown && (
                                <div className="mt-4 rounded-lg border border-yellow-500/40 bg-yellow-500/10 p-3 max-w-xl">
                                    <p className="text-sm font-semibold text-yellow-300">
                                        Payment overdue: {daysUntilSuspension} day{daysUntilSuspension === 1 ? '' : 's'} until account lock
                                    </p>
                                    <p className="text-xs text-yellow-100/90 mt-1">
                                        Attempt {currentRetryCount} of 3. Please pay this invoice or update your payment method before {graceEndsAt?.toLocaleDateString()} to avoid suspension.
                                    </p>
                                </div>
                            )}
                        </div>
                        <div className="mt-4 md:mt-0 flex flex-col space-y-2">
                            {companyData?.plan !== 'Reseller' && companyData?.plan !== 'Enterprise' && (
                                <button
                                    onClick={() => {
                                        // Show all paid plans except current plan (consistent with cards below)
                                        const currentPlan = companyData?.plan || 'Free';
                                        const availablePlans = plans.filter(p => {
                                            // Don't show current plan (handle potential name variations)
                                            if (p.name === currentPlan) return false;
                                            if (p.name === 'Reseller' && currentPlan === 'Enterprise') return false;
                                            if (p.name === 'Enterprise' && currentPlan === 'Reseller') return false;
                                            if (p.name === 'Pro' && currentPlan === 'Professional') return false;
                                            if (p.name === 'Professional' && currentPlan === 'Pro') return false;
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
                                            setShowPlanSelectorModal(true);
                                        }
                                    }}
                                    className="bg-jam-orange text-jam-black px-6 py-2.5 rounded-lg font-bold text-sm hover:bg-yellow-500 transition-colors"
                                >
                                    Upgrade Plan
                                </button>
                            )}
                            {companyData?.plan && companyData.plan !== 'Free' && currentSubscription?.status !== 'cancelled' && (
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
                    
                    <PaymentMethodsCard currentUser={currentUser} currentSubscription={currentSubscription} />

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
                    {/* Tax Calculation Configuration — powered by TaxConfigCard */}
                    <TaxConfigCard
                        config={taxConfig}
                        onSave={async (newConfig) => {
                            onUpdateTaxConfig(newConfig);
                            auditService.log(currentUser, 'UPDATE', 'Settings', 'Updated statutory tax configuration');
                            toast.success('Tax configuration saved');
                        }}
                        isSaving={false}
                    />
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
                            <div className="space-y-2">
                                <label className="block text-xs font-bold text-gray-500 uppercase">Company Logo URL</label>
                                <input
                                    type="url"
                                    value={companyData.logoUrl || ''}
                                    onChange={e => handleCompanyUpdate({ ...companyData, logoUrl: e.target.value })}
                                    placeholder="https://example.com/logo.png"
                                    className="w-full border rounded p-2"
                                />
                                <p className="text-xs text-gray-500">Used on generated employee job letters and contracts unless a template has its own logo URL.</p>
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

                    <div className="mt-8 border-t border-gray-100 pt-6">
                        <div className="mb-4 flex items-start justify-between gap-4">
                            <div>
                                <h4 className="font-semibold">Business Locations</h4>
                                <p className="text-sm text-gray-500">
                                    These branches appear in the Time &amp; Attendance QR code location dropdown.
                                </p>
                            </div>
                        </div>

                        <div className="mb-5 space-y-4 rounded-lg border border-gray-200 bg-gray-50 p-4">
                            <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
                            <div className="md:col-span-2">
                                <label className="block text-xs font-bold text-gray-500 uppercase">Location Name</label>
                                <input
                                    type="text"
                                    value={newLocation.name}
                                    onChange={(event) => setNewLocation((prev) => ({ ...prev, name: event.target.value }))}
                                    placeholder="Montego Bay Office"
                                    className="mt-1 w-full rounded border border-gray-300 p-2 text-sm"
                                />
                            </div>
                            <div className="md:col-span-2">
                                <label className="block text-xs font-bold text-gray-500 uppercase">Parish</label>
                                <select
                                    value={newLocation.parish}
                                    onChange={(event) => setNewLocation((prev) => ({ ...prev, parish: event.target.value }))}
                                    className="mt-1 w-full rounded border border-gray-300 p-2 text-sm"
                                >
                                    {JAMAICA_PARISHES.map((parish) => (
                                        <option key={parish} value={parish}>{parish}</option>
                                    ))}
                                </select>
                            </div>
                            <div className="md:col-span-4">
                                <label className="block text-xs font-bold text-gray-500 uppercase">Street Address or Landmark</label>
                                <input
                                    type="text"
                                    value={newLocation.address}
                                    onChange={(event) => setNewLocation((prev) => ({ ...prev, address: event.target.value }))}
                                    placeholder="123 Knutsford Blvd, near New Kingston"
                                    className="mt-1 w-full rounded border border-gray-300 p-2 text-sm"
                                />
                                <p className="mt-1 text-xs text-gray-500">No coordinates needed. Search the address, or use current location if you are already at the branch.</p>
                            </div>
                            </div>

                            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                                <button
                                    type="button"
                                    onClick={handleFindLocationFromAddress}
                                    disabled={isGeocodingBranch}
                                    className="flex items-center justify-center rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60"
                                >
                                    <Icons.Search className={`mr-2 h-4 w-4 ${isGeocodingBranch ? 'animate-spin' : ''}`} />
                                    {isGeocodingBranch ? 'Finding address...' : 'Find Pin From Address'}
                                </button>
                                <button
                                    type="button"
                                    onClick={handleUseCurrentLocation}
                                    disabled={isLocatingBranch}
                                    className="flex items-center justify-center rounded-lg border border-jam-orange bg-white px-4 py-2 text-sm font-semibold text-jam-black hover:bg-yellow-50 disabled:cursor-not-allowed disabled:opacity-60"
                                >
                                    <Icons.Smartphone className={`mr-2 h-4 w-4 ${isLocatingBranch ? 'animate-pulse' : ''}`} />
                                    {isLocatingBranch ? 'Getting location...' : 'Use My Current Location'}
                                </button>
                            </div>

                            <div>
                                <label className="block text-xs font-bold text-gray-500 uppercase">Clock-in Boundary</label>
                                <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
                                    {GEOFENCE_RADIUS_PRESETS.map((preset) => (
                                        <button
                                            key={preset.value}
                                            type="button"
                                            onClick={() => setNewLocation((prev) => ({ ...prev, geofenceRadiusMeters: preset.value }))}
                                            className={`rounded-lg border p-3 text-left text-sm transition-colors ${
                                                newLocation.geofenceRadiusMeters === preset.value
                                                    ? 'border-jam-orange bg-yellow-50 text-jam-black'
                                                    : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50'
                                            }`}
                                        >
                                            <span className="block font-bold">{preset.label}</span>
                                            <span className="text-xs text-gray-500">{preset.value}m · {preset.description}</span>
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <div className="rounded-lg border border-gray-200 bg-white p-3">
                                <button
                                    type="button"
                                    onClick={() => setShowAdvancedLocationFields((value) => !value)}
                                    className="flex w-full items-center justify-between text-left text-sm font-semibold text-gray-700"
                                >
                                    Advanced location settings
                                    {showAdvancedLocationFields ? <Icons.ChevronUp className="h-4 w-4" /> : <Icons.ChevronDown className="h-4 w-4" />}
                                </button>
                                {showAdvancedLocationFields && (
                                    <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-3">
                                        <div>
                                            <label className="block text-xs font-bold text-gray-500 uppercase">Latitude</label>
                                            <input
                                                type="number"
                                                step="0.000001"
                                                value={newLocation.latitude}
                                                onChange={(event) => setNewLocation((prev) => ({ ...prev, latitude: event.target.value }))}
                                                placeholder="18.0179"
                                                className="mt-1 w-full rounded border border-gray-300 p-2 text-sm"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-xs font-bold text-gray-500 uppercase">Longitude</label>
                                            <input
                                                type="number"
                                                step="0.000001"
                                                value={newLocation.longitude}
                                                onChange={(event) => setNewLocation((prev) => ({ ...prev, longitude: event.target.value }))}
                                                placeholder="-76.8099"
                                                className="mt-1 w-full rounded border border-gray-300 p-2 text-sm"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-xs font-bold text-gray-500 uppercase">Custom Radius (m)</label>
                                            <input
                                                type="number"
                                                min="1"
                                                value={newLocation.geofenceRadiusMeters}
                                                onChange={(event) => setNewLocation((prev) => ({ ...prev, geofenceRadiusMeters: event.target.value }))}
                                                className="mt-1 w-full rounded border border-gray-300 p-2 text-sm"
                                            />
                                        </div>
                                    </div>
                                )}
                            </div>

                            <div className="flex flex-col gap-3 border-t border-gray-200 pt-4 sm:flex-row sm:items-center sm:justify-between">
                                <div className="text-sm text-gray-600">
                                    {newLocation.latitude && newLocation.longitude ? (
                                        <>
                                            Pin ready at {newLocation.latitude}, {newLocation.longitude}.{' '}
                                            <a
                                                href={getGoogleMapsUrl(Number(newLocation.latitude), Number(newLocation.longitude))}
                                                target="_blank"
                                                rel="noreferrer"
                                                className="font-semibold text-jam-orange hover:underline"
                                            >
                                                Preview map
                                            </a>
                                        </>
                                    ) : (
                                        'Find or capture the branch pin before adding this location.'
                                    )}
                                </div>
                                <button
                                    type="button"
                                    onClick={handleAddLocation}
                                    className="inline-flex items-center justify-center rounded-lg bg-jam-black px-4 py-2 text-sm font-semibold text-white hover:bg-gray-800"
                                >
                                    <Icons.Plus className="mr-2 h-4 w-4" />
                                    Add Location
                                </button>
                            </div>
                        </div>

                        {(companyData.locations || []).length > 0 ? (
                            <div className="space-y-3">
                                {(companyData.locations || []).map((location) => (
                                    <div key={location.id} className="grid grid-cols-1 gap-3 rounded-lg border border-gray-200 p-4 md:grid-cols-12 md:items-end">
                                        <div className="md:col-span-4">
                                            <label className="block text-xs font-bold text-gray-500 uppercase">Name</label>
                                            <input
                                                type="text"
                                                value={location.name}
                                                onChange={(event) => handleUpdateLocation(location.id, { name: event.target.value })}
                                                className="mt-1 w-full rounded border border-gray-300 p-2 text-sm"
                                            />
                                        </div>
                                        <div className="md:col-span-3">
                                            <label className="block text-xs font-bold text-gray-500 uppercase">Address</label>
                                            <input
                                                type="text"
                                                value={location.address || ''}
                                                onChange={(event) => handleUpdateLocation(location.id, { address: event.target.value })}
                                                placeholder="Street address or landmark"
                                                className="mt-1 w-full rounded border border-gray-300 p-2 text-sm"
                                            />
                                        </div>
                                        <div className="md:col-span-2">
                                            <label className="block text-xs font-bold text-gray-500 uppercase">Parish</label>
                                            <select
                                                value={location.parish || 'Kingston'}
                                                onChange={(event) => handleUpdateLocation(location.id, { parish: event.target.value })}
                                                className="mt-1 w-full rounded border border-gray-300 p-2 text-sm"
                                            >
                                                {JAMAICA_PARISHES.map((parish) => (
                                                    <option key={parish} value={parish}>{parish}</option>
                                                ))}
                                            </select>
                                        </div>
                                        <div className="md:col-span-2">
                                            <label className="block text-xs font-bold text-gray-500 uppercase">Boundary</label>
                                            <select
                                                value={String(location.geofenceRadiusMeters)}
                                                onChange={(event) => handleUpdateLocation(location.id, { geofenceRadiusMeters: Number(event.target.value) || 100 })}
                                                className="mt-1 w-full rounded border border-gray-300 p-2 text-sm"
                                            >
                                                {GEOFENCE_RADIUS_PRESETS.map((preset) => (
                                                    <option key={preset.value} value={preset.value}>{preset.label} ({preset.value}m)</option>
                                                ))}
                                            </select>
                                        </div>
                                        <button
                                            type="button"
                                            onClick={() => handleDeleteLocation(location.id)}
                                            className="rounded border border-red-200 p-2 text-red-600 hover:bg-red-50 md:col-span-1"
                                            title="Delete location"
                                        >
                                            <Icons.Trash className="mx-auto h-4 w-4" />
                                        </button>
                                        <div className="md:col-span-2">
                                            <label className="block text-xs font-bold text-gray-500 uppercase">Latitude</label>
                                            <input
                                                type="number"
                                                step="0.000001"
                                                value={location.latitude}
                                                onChange={(event) => handleUpdateLocation(location.id, { latitude: Number(event.target.value) })}
                                                className="mt-1 w-full rounded border border-gray-300 p-2 text-sm"
                                            />
                                        </div>
                                        <div className="md:col-span-2">
                                            <label className="block text-xs font-bold text-gray-500 uppercase">Longitude</label>
                                            <input
                                                type="number"
                                                step="0.000001"
                                                value={location.longitude}
                                                onChange={(event) => handleUpdateLocation(location.id, { longitude: Number(event.target.value) })}
                                                className="mt-1 w-full rounded border border-gray-300 p-2 text-sm"
                                            />
                                        </div>
                                        <div className="md:col-span-8">
                                            <p className="rounded-lg bg-gray-50 p-3 text-xs text-gray-600">
                                                Employees must be within {location.geofenceRadiusMeters}m of this pin to clock in/out.
                                                {' '}
                                                <a
                                                    href={getGoogleMapsUrl(location.latitude, location.longitude)}
                                                    target="_blank"
                                                    rel="noreferrer"
                                                    className="font-semibold text-jam-orange hover:underline"
                                                >
                                                    Preview map
                                                </a>
                                            </p>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div className="rounded-lg border border-dashed border-gray-300 p-5 text-sm text-gray-500">
                                No business locations saved yet. The QR tool will use a temporary Main Branch fallback until you add one here.
                            </div>
                        )}
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
                const accountId = account?.id || currentUser?.companyId;

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
                                setMemberRefreshTrigger((value) => value + 1);
                                toast.success('Invitation sent successfully!');
                            }}
                        />
                        <AccountMembersCard
                            accountId={accountId}
                            isAdmin={['admin', 'owner'].includes((userRole || '').toLowerCase())}
                            refreshTrigger={memberRefreshTrigger}
                        />
                    </div>
                );
            })()}

            <p className="pt-6 text-center text-xs font-medium text-gray-400">
                Version {appVersion}
            </p>
        </div>
    );
};
