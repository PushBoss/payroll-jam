
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Icons } from '../components/Icons';
import { Role, User, PricingPlan } from '../types';
import { PayPalScriptProvider, PayPalButtons } from "@paypal/react-paypal-js";
import { storage } from '../services/storage';
import { dimePayService } from '../services/dimePayService';
import { toast } from 'sonner';
import { useAuth } from '../context/AuthContext';
import { generateUUID } from '../utils/uuid';

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

export const Signup: React.FC<SignupProps> = ({ onLoginClick, onVerifyEmailClick, onBack, onNavigate, initialPlan = 'Starter', initialBillingCycle = 'monthly', plans }) => {
  const { signup } = useAuth();
  const [step, setStep] = useState<'account' | 'billing'>('account');
  const [paymentError, setPaymentError] = useState<string | null>(null);
  const [widgetStatus, setWidgetStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [legalConsent, setLegalConsent] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<'card' | 'direct-deposit'>('card');
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  // Timer Ref for cleanup
  const timerRef = useRef<any>(null);
  const isMountedRef = useRef(true);
  
  // State to store reseller invite token
  const [resellerInviteToken, setResellerInviteToken] = useState<string | null>(null);
  
  // Fetch Global Payment Configuration
  const paymentConfig = storage.getGlobalConfig();
  const payPalEnabled = false; // PayPal disabled - only using DimePay
  const dimePayEnabled = paymentConfig?.dimepay?.enabled ?? true; // DimePay enabled by default

  const [formData, setFormData] = useState({
    name: '',
    email: '',
    companyName: '',
    password: '',
    confirmPassword: '',
    plan: initialPlan,
    billingCycle: initialBillingCycle,
    numEmployees: '', 
    numCompanies: '', // For reseller plan
    address: '',
    city: 'Kingston',
    parish: 'Kingston',
  });

  useEffect(() => {
      isMountedRef.current = true;
      
      // Check for invite token and pre-fill email
      const params = new URLSearchParams(window.location.search);
      const token = params.get('token');
      const email = params.get('email');
      const isResellerInvite = params.get('reseller') === 'true';
      
      // Pre-fill email if provided
      if (email) {
          setFormData(prev => ({ ...prev, email: decodeURIComponent(email) }));
      }
      
      // Store reseller invite token if this is a reseller invite
      if (token && isResellerInvite) {
          console.log('🔗 Reseller invite token detected:', token);
          setResellerInviteToken(token);
          toast.info('You\'re signing up through a reseller invitation!', { duration: 5000 });
      }
      
      return () => { isMountedRef.current = false; };
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
    let basePrice = 0;
    let perEmpPrice = 0;
    let type = 'flat';

    if (selectedPlan) {
        type = selectedPlan.priceConfig.type;
        if (type === 'free') {
             basePrice = 0;
        } else if (type === 'flat') {
             // Flat rate plans - use the monthly/annual price directly
             basePrice = formData.billingCycle === 'monthly' ? selectedPlan.priceConfig.monthly : selectedPlan.priceConfig.annual;
        } else if (type === 'per_emp') {
             // Per-employee plans - price is per employee
             perEmpPrice = formData.billingCycle === 'monthly' ? selectedPlan.priceConfig.monthly : selectedPlan.priceConfig.annual;
        } else if (type === 'base') {
             // Base fee plans (like Reseller)
             basePrice = selectedPlan.priceConfig.baseFee || 0;
             perEmpPrice = selectedPlan.priceConfig.perUserFee || 0;
        }
    }

    let subtotal = 0;
    if (type === 'free') {
        subtotal = 0;
    } else if (type === 'flat') {
        subtotal = basePrice;
    } else if (type === 'per_emp') {
        const count = parseInt(formData.numEmployees) || 1; // Default to 1 if not specified
        subtotal = count * perEmpPrice;
    } else if (type === 'base') {
        // Base fee plans (like Reseller)
        if (formData.plan === 'Reseller') {
            // For resellers: (companies × baseFee) + (employees × perUserFee)
            const numCompanies = parseInt(formData.numCompanies) || 1;
            const numEmployees = parseInt(formData.numEmployees) || 1;
            subtotal = (numCompanies * basePrice) + (numEmployees * perEmpPrice);
        } else {
            // For other base plans: base fee + (employees × per-employee fee)
            const count = parseInt(formData.numEmployees) || 1;
            subtotal = basePrice + (count * perEmpPrice);
        }
    }
    
    const billableAmount = subtotal;
    const platformFees = billableAmount * 0.035; // Dime platform fees (3.5%)
    const total = billableAmount + platformFees;
    const totalUSD = (total / 155).toFixed(2);

    return { type, basePrice, perEmpPrice, subtotal, billableAmount, platformFees, total, totalUSD };
  };

  // Recalculate pricing whenever formData changes (especially billingCycle, plan, or employee counts)
  const pricing = useMemo(() => getPricing(), [formData.plan, formData.billingCycle, formData.numEmployees, formData.numCompanies]);

  // Generate companyId early so it can be passed to DimePay for webhook linking
  const [companyId] = useState(() => generateUUID());

  const initDimePay = () => {
      if (!isMountedRef.current) return;
      setWidgetStatus('loading');
      setPaymentError(null);
      
      if (timerRef.current) clearTimeout(timerRef.current);
      
      timerRef.current = setTimeout(() => {
          if (!isMountedRef.current) return;
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
                  planType: formData.plan.toLowerCase()
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
      }, 800);
  };

  // Initialize DimePay Widget when on billing step with card payment
  useEffect(() => {
      if (step === 'billing' && paymentMethod === 'card' && dimePayEnabled) {
          initDimePay();
      }
      return () => {
          if (timerRef.current) clearTimeout(timerRef.current);
      };
  }, [step, paymentMethod, dimePayEnabled, formData.email, pricing.total]);

  const handleAccountSubmit = (e: React.FormEvent) => {
      e.preventDefault();
      
      if (!legalConsent) {
          toast.error("Please agree to the Terms and Privacy Policy to continue.");
          return;
      }

      if (formData.password !== formData.confirmPassword) {
          toast.error("Passwords do not match. Please try again.");
          return;
      }

      if (formData.plan === 'Free' || pricing.total === 0) {
          handleSubmit();
      } else {
          setStep('billing');
      }
  };

  const handleSubmit = async () => {
    if (isSubmitting) return; // Prevent double submission
    setIsSubmitting(true);
    
    try {
      const role = formData.plan === 'Reseller' ? Role.RESELLER : Role.OWNER;
      const isPaidPlan = formData.plan !== 'Free' && pricing.total > 0;
      const requiresApproval = isPaidPlan && paymentMethod === 'direct-deposit';
      
      const newUser = {
        id: generateUUID(),
        name: formData.name,
        email: formData.email,
        password: formData.password,
        role: role,
        companyId: companyId, // Use pre-generated companyId for DimePay webhook linking
        isOnboarded: false,
        companyName: formData.name + "'s Company", // Temporary name, will be set in onboarding
        plan: formData.plan,
        paymentMethod: paymentMethod,
        resellerInviteToken: resellerInviteToken || undefined // Pass reseller invite token if present
      };
      
      await signup(newUser);
      console.log('✅ Signup completed successfully');
      
      // All signups redirect to verify email page
      if (requiresApproval) {
        console.log('📝 Direct deposit - redirecting to verify email page');
        toast.success('🎉 Account created! Payment pending verification.', {
          duration: 5000,
        });
      } else if (isPaidPlan) {
        console.log('💳 Paid signup - redirecting to verify email page');
        toast.success('🎉 Account created and payment successful!', {
          duration: 5000,
        });
      } else {
        console.log('✅ Free signup - redirecting to verify email page');
        toast.success('🎉 Account created successfully!', {
          duration: 5000,
        });
      }
      
      // Redirect to verify email page after showing message
      setTimeout(() => {
        console.log('🔄 Redirecting to verify email page...');
        onVerifyEmailClick(formData.email);
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
        toast.error('Email already exists. Please login instead.');
      } else {
        toast.error(error.message || 'Signup failed. Please try again.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex">
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
                        <div className="bg-gray-50 p-4 rounded-lg border border-gray-200 mb-6">
                            <div className="flex justify-between items-center mb-3">
                                <label className="block text-sm font-medium text-gray-700">Selected Plan</label>
                                <div className="flex bg-gray-200 rounded-lg p-1">
                                    <button 
                                        type="button"
                                        onClick={() => setFormData({...formData, billingCycle: 'monthly'})}
                                        className={`px-3 py-1 text-xs font-medium rounded-md transition-all ${formData.billingCycle === 'monthly' ? 'bg-white shadow text-gray-900' : 'text-gray-500 hover:text-gray-900'}`}
                                    >
                                        Monthly
                                    </button>
                                    <button 
                                        type="button"
                                        onClick={() => setFormData({...formData, billingCycle: 'annual'})}
                                        className={`px-3 py-1 text-xs font-medium rounded-md transition-all ${formData.billingCycle === 'annual' ? 'bg-white shadow text-gray-900' : 'text-gray-500 hover:text-gray-900'}`}
                                    >
                                        Annual
                                    </button>
                                </div>
                            </div>
                            <select
                                value={formData.plan}
                                onChange={(e) => setFormData({...formData, plan: e.target.value})}
                                className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-jam-orange focus:border-jam-orange sm:text-sm"
                            >
                                {plans.filter(p => p.isActive).map(p => (
                                    <option key={p.id} value={p.name}>{p.name} ({p.limit})</option>
                                ))}
                            </select>
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-700">Full Name</label>
                            <input required type="text" value={formData.name} onChange={(e) => setFormData({...formData, name: e.target.value})} className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-jam-orange focus:border-jam-orange sm:text-sm" />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700">Work Email</label>
                            <input required type="email" autoComplete="email" value={formData.email} onChange={(e) => setFormData({...formData, email: e.target.value})} className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-jam-orange focus:border-jam-orange sm:text-sm" />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700">Number of Employees</label>
                            <input
                                required
                                type="number"
                                min="1"
                                max={formData.plan === 'Reseller' ? 9999 : employeeLimit}
                                value={formData.numEmployees}
                                onChange={(e) => setFormData({...formData, numEmployees: e.target.value})}
                                className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-jam-orange focus:border-jam-orange sm:text-sm"
                                placeholder="e.g., 10"
                            />
                            <p className="mt-1 text-xs text-gray-500">
                                {formData.plan === 'Reseller' 
                                    ? 'Total employees across all your client companies' 
                                    : employeeLimit < 9999 
                                        ? `${formData.plan} plan supports up to ${employeeLimit} employees` 
                                        : 'This helps us calculate your plan pricing accurately'}
                            </p>
                        </div>
                        {formData.plan === 'Reseller' && (
                            <div>
                                <label className="block text-sm font-medium text-gray-700">Number of Companies</label>
                                <input
                                    required
                                    type="number"
                                    min="1"
                                    max="9999"
                                    value={formData.numCompanies}
                                    onChange={(e) => setFormData({...formData, numCompanies: e.target.value})}
                                    className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-jam-orange focus:border-jam-orange sm:text-sm"
                                    placeholder="e.g., 5"
                                />
                                <p className="mt-1 text-xs text-gray-500">Number of client companies you'll manage</p>
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
                                    onChange={(e) => setFormData({...formData, password: e.target.value})} 
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
                                    onChange={(e) => setFormData({...formData, confirmPassword: e.target.value})} 
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
                                                href="/?page=terms-of-service"
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="underline hover:text-jam-orange text-jam-orange"
                                            >
                                                Terms of Service
                                            </a>
                                            {' '}and{' '}
                                            <a
                                                href="/?page=privacy-policy"
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="underline hover:text-jam-orange text-jam-orange"
                                            >
                                                Privacy Policy
                                            </a>
                                        </>
                                    ) : (
                                        <>
                                            <a href="/?page=terms-of-service" target="_blank" rel="noopener noreferrer" className="underline hover:text-jam-orange">Terms of Service</a> and <a href="/?page=privacy-policy" target="_blank" rel="noopener noreferrer" className="underline hover:text-jam-orange">Privacy Policy</a>
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
                                    formData.plan === 'Free' || pricing.total === 0 ? 'Create Free Account' : 'Continue to Payment'
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
                            <div className="grid grid-cols-2 gap-3">
                                <button
                                    type="button"
                                    onClick={() => setPaymentMethod('card')}
                                    className={`flex flex-col items-center justify-center p-4 border-2 rounded-lg transition-all ${
                                        paymentMethod === 'card'
                                            ? 'border-jam-orange bg-orange-50'
                                            : 'border-gray-200 hover:border-gray-300'
                                    }`}
                                >
                                    <Icons.CreditCard className="w-6 h-6 mb-2" />
                                    <span className="text-sm font-medium">Card Payment</span>
                                    <span className="text-xs text-gray-500 mt-1">Visa, Mastercard</span>
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setPaymentMethod('direct-deposit')}
                                    className={`flex flex-col items-center justify-center p-4 border-2 rounded-lg transition-all ${
                                        paymentMethod === 'direct-deposit'
                                            ? 'border-jam-orange bg-orange-50'
                                            : 'border-gray-200 hover:border-gray-300'
                                    }`}
                                >
                                    <Icons.Building className="w-6 h-6 mb-2" />
                                    <span className="text-sm font-medium">Direct Deposit</span>
                                    <span className="text-xs text-gray-500 mt-1">Bank Transfer</span>
                                </button>
                            </div>
                        </div>
                        
                        {paymentMethod === 'card' && dimePayEnabled && (
                            <div className="mb-6">
                                <div id="dimepay-widget" className="min-h-[400px] w-full rounded-lg border border-gray-100 shadow-sm bg-white overflow-hidden relative">
                                    <div className="absolute inset-0 flex flex-col items-center justify-center text-gray-400 z-0">
                                        <Icons.Refresh className="w-6 h-6 animate-spin mr-2 mb-2" />
                                        <span className="text-sm">Loading Payment Gateway...</span>
                                    </div>
                                    {widgetStatus === 'error' && (
                                        <div className="absolute inset-0 flex flex-col items-center justify-center bg-white z-10 p-6 text-center">
                                            <Icons.Alert className="w-8 h-8 text-red-500 mb-2" />
                                            <p className="text-red-600 font-medium mb-4">Failed to load payment widget.</p>
                                            <button type="button" onClick={initDimePay} className="px-4 py-2 bg-gray-100 text-gray-700 rounded hover:bg-gray-200 text-sm">Retry Connection</button>
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}

                        {paymentMethod === 'direct-deposit' && (
                            <div className="mb-6 p-6 bg-blue-50 border border-blue-200 rounded-lg">
                                <h3 className="font-semibold text-gray-900 mb-4 flex items-center">
                                    <Icons.Building className="w-5 h-5 mr-2 text-blue-600" />
                                    Direct Deposit Payment Instructions
                                </h3>
                                <div className="space-y-3 text-sm text-gray-700">
                                    <div>
                                        <span className="font-medium">Bank Name:</span> NCB (National Commercial Bank)
                                    </div>
                                    <div>
                                        <span className="font-medium">Account Name:</span> Balance Investments Limited
                                    </div>
                                    <div>
                                        <span className="font-medium">Account Number:</span> 404286331
                                    </div>
                                    <div>
                                        <span className="font-medium">Account Type:</span> Savings Account
                                    </div>
                                    <div>
                                        <span className="font-medium">Branch:</span> UWI Branch
                                    </div>
                                    <div>
                                        <span className="font-medium">Amount:</span> JMD ${pricing.total.toLocaleString()}
                                    </div>
                                    <div className="pt-2 border-t border-blue-200">
                                        <span className="font-medium">Reference:</span> {formData.email}
                                    </div>
                                </div>
                                <div className="mt-4 p-3 bg-white rounded border border-blue-100">
                                    <p className="text-xs text-gray-600">
                                        <strong>Note:</strong> After making the deposit, your account will be activated within 24 hours. 
                                        You'll receive a confirmation email once payment is verified.
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
                                        "I've Made the Payment - Create Account"
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
      <div className="hidden lg:block relative flex-1 bg-gray-50 w-0 border-l border-gray-200">
         <div className="absolute inset-0 flex flex-col justify-center px-12">
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
                    
                    {/* Pricing Breakdown */}
                    <div className="space-y-2 text-sm">
                        {pricing.type === 'per_emp' && (
                            <div className="flex justify-between text-gray-600">
                                <span>{formData.numEmployees || 1} Employee{(parseInt(formData.numEmployees) || 1) > 1 ? 's' : ''} × ${pricing.perEmpPrice.toLocaleString()}</span>
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
                                            <span>{formData.numCompanies || 1} Compan{(parseInt(formData.numCompanies) || 1) > 1 ? 'ies' : 'y'} × ${pricing.basePrice.toLocaleString()}</span>
                                            <span>${((parseInt(formData.numCompanies) || 1) * pricing.basePrice).toLocaleString()}</span>
                                        </div>
                                        <div className="flex justify-between text-gray-600">
                                            <span>{formData.numEmployees || 1} employee{(parseInt(formData.numEmployees) || 1) > 1 ? 's' : ''} × ${pricing.perEmpPrice.toLocaleString()}</span>
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
                                            <span>{formData.numEmployees || 1} employee{(parseInt(formData.numEmployees) || 1) > 1 ? 's' : ''} × ${pricing.perEmpPrice.toLocaleString()}</span>
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
                        <div className="flex justify-between font-bold text-gray-900 pt-2 border-t border-gray-200">
                            <span>Total</span>
                            <span>${pricing.total.toLocaleString()}</span>
                        </div>
                    </div>
                </div>
                <div className="pt-6 text-xs text-gray-400 text-center">
                    <p>Secure payment processing via {dimePayEnabled ? 'Dime Pay' : 'PayPal'}.</p>
                </div>
             </div>
         </div>
      </div>
    </div>
  );
};
