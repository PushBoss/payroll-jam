
import React, { useState, useEffect, useRef } from 'react';
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
  onSignupSuccess?: (user: User) => void;
  onLoginClick: () => void;
  initialPlan?: string;
  initialBillingCycle?: 'monthly' | 'annual';
  plans: PricingPlan[]; 
}

export const Signup: React.FC<SignupProps> = ({ onLoginClick, initialPlan = 'Starter', initialBillingCycle = 'monthly', plans }) => {
  const { signup } = useAuth();
  const [step, setStep] = useState<'account' | 'billing'>('account');
  const [paymentError, setPaymentError] = useState<string | null>(null);
  const [widgetStatus, setWidgetStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [legalConsent, setLegalConsent] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<'card' | 'direct-deposit'>('card');
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  // Timer Ref for cleanup
  const timerRef = useRef<any>(null);
  const isMountedRef = useRef(true);
  
  // Fetch Global Payment Configuration
  const paymentConfig = storage.getGlobalConfig();
  const payPalEnabled = paymentConfig?.paypal?.enabled ?? true;
  const dimePayEnabled = paymentConfig?.dimepay?.enabled ?? false;

  const [formData, setFormData] = useState({
    name: '',
    email: '',
    companyName: '',
    password: '',
    plan: initialPlan,
    billingCycle: initialBillingCycle,
    numEmployees: '', 
    address: '',
    city: 'Kingston',
    parish: 'Kingston',
  });

  useEffect(() => {
      isMountedRef.current = true;
      return () => { isMountedRef.current = false; };
  }, []);

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
        } else {
             basePrice = formData.billingCycle === 'monthly' ? selectedPlan.priceConfig.monthly : selectedPlan.priceConfig.annual;
             if (type === 'per_emp') perEmpPrice = basePrice;
        }
    }

    let subtotal = 0;
    if (type === 'flat' || type === 'base') {
        subtotal = basePrice;
    } else if (type === 'per_emp') {
        const count = parseInt(formData.numEmployees) || 26;
        subtotal = count * perEmpPrice;
    }
    
    const billableAmount = subtotal;
    const gct = billableAmount * 0.15;
    const total = billableAmount + gct;
    const totalUSD = (total / 155).toFixed(2);

    return { type, basePrice, perEmpPrice, subtotal, billableAmount, gct, total, totalUSD };
  };

  const pricing = getPricing();

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
              metadata: {
                  name: formData.name,
                  company: formData.companyName,
                  plan: formData.plan
              },
              onSuccess: (data) => {
                  if (!isMountedRef.current) return;
                  console.log('DimePay Success:', data);
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

  // Initialize DimePay Widget when on billing step
  useEffect(() => {
      if (step === 'billing' && dimePayEnabled) {
          initDimePay();
      }
      return () => {
          if (timerRef.current) clearTimeout(timerRef.current);
      };
  }, [step, dimePayEnabled]);

  const handleAccountSubmit = (e: React.FormEvent) => {
      e.preventDefault();
      
      if (!legalConsent) {
          toast.error("Please agree to the Terms and Privacy Policy to continue.");
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
        companyId: generateUUID(),
        isOnboarded: false,
        companyName: formData.companyName,
        plan: formData.plan,
        paymentMethod: paymentMethod
      };
      
      await signup(newUser);
      console.log('✅ Signup completed, calling onSignupSuccess');
      
      if (requiresApproval) {
        toast.success('Account created! You will be able to login once payment is received and verified by our team.', {
          duration: 8000,
        });
        
        // Redirect to login after showing message
        setTimeout(() => {
          onLoginClick();
        }, 3000);
      } else {
        toast.success('Account created successfully! Redirecting to setup...', {
          duration: 3000,
        });
        
        // Call onSignupSuccess to trigger onboarding flow
        setTimeout(() => {
          if (onSignupSuccess) {
            console.log('✅ Calling onSignupSuccess with user:', newUser);
            onSignupSuccess(newUser);
          } else {
            console.warn('⚠️ onSignupSuccess is undefined');
          }
        }, 500);
      }
    } catch (error: any) {
      console.error('Signup failed:', error);
      
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
                            <input required type="email" value={formData.email} onChange={(e) => setFormData({...formData, email: e.target.value})} className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-jam-orange focus:border-jam-orange sm:text-sm" />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700">Company Name</label>
                            <input required type="text" value={formData.companyName} onChange={(e) => setFormData({...formData, companyName: e.target.value})} className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-jam-orange focus:border-jam-orange sm:text-sm" />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700">Password</label>
                            <div className="relative mt-1">
                                <input 
                                    required 
                                    type={showPassword ? 'text' : 'password'} 
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
                                    I agree to the <span className="underline hover:text-jam-orange">Terms of Service</span> and <span className="underline hover:text-jam-orange">Privacy Policy</span>.
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
                                        <span className="font-medium">Bank Name:</span> NCB Jamaica
                                    </div>
                                    <div>
                                        <span className="font-medium">Account Name:</span> Payroll-Jam Ltd
                                    </div>
                                    <div>
                                        <span className="font-medium">Account Number:</span> 123456789
                                    </div>
                                    <div>
                                        <span className="font-medium">Branch Code:</span> 001
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
                <div className="flex items-start justify-between pb-6 border-b border-gray-100">
                    <div>
                        <p className="font-bold text-gray-900 text-lg">{formData.plan} Plan</p>
                        <p className="text-sm text-gray-500 mt-1 capitalize">{formData.billingCycle} Subscription</p>
                    </div>
                    <div className="text-right">
                        <span className="text-2xl font-bold text-jam-orange">${pricing.total.toLocaleString()}</span>
                        <p className="text-xs text-gray-400">JMD / {formData.billingCycle === 'annual' ? 'Year' : 'Month'}</p>
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
