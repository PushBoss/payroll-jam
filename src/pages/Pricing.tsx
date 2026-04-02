
import React, { useState } from 'react';
import { Icons } from '../components/Icons';
import { Footer } from '../components/Footer';
import { PricingPlan } from '../core/types';
import { getPlanPriceDetails } from '../utils/pricing';

interface PricingProps {
  onSignup: (plan: string, cycle: 'monthly' | 'annual') => void;
  onLogin: () => void;
  onBack: () => void;
  onFeaturesClick?: () => void;
  onFaqClick?: () => void;
  onPrivacyClick?: () => void;
  onTermsClick?: () => void;
  plans: PricingPlan[];
}

export const Pricing: React.FC<PricingProps> = ({ onSignup, onLogin, onBack, onFeaturesClick, onFaqClick, onPrivacyClick, onTermsClick, plans = [] }) => {
  const [cycle, setCycle] = useState<'monthly' | 'annual'>('monthly');

  // Filter only active plans
  const displayPlans = plans.filter(p => p.isActive);

  // Debug: Log plans to verify they're coming from backend
  React.useEffect(() => {
    console.log('🔍 Pricing page - Plans received:', displayPlans.length);
    displayPlans.forEach(plan => {
      console.log(`  - ${plan.name}: ${plan.features.length} features`, plan.features);
    });
  }, [displayPlans]);

  // If no plans, show a message (shouldn't happen with INITIAL_PLANS fallback)
  if (displayPlans.length === 0) {
    return (
      <div className="min-h-screen bg-white font-sans text-slate-900 flex items-center justify-center">
        <div className="text-center">
          <p className="text-gray-500 mb-4">No pricing plans available.</p>
          <button onClick={onBack} className="text-jam-orange hover:underline">Go back</button>
        </div>
      </div>
    );
  }

  const renderPrice = (plan: PricingPlan) => {
    const { formattedAmount, suffix, perEmpFee } = getPlanPriceDetails(plan, cycle);
    
    return (
      <div>
        <div className="text-4xl font-bold">{formattedAmount}</div>
        <div className={`text-sm mt-1 ${plan.highlight ? 'text-gray-400' : 'text-gray-500'}`}>
          {suffix}
          {plan.priceConfig.type === 'base' && perEmpFee > 0 && (
            <div className="text-xs mt-1 opacity-75">
              + ${perEmpFee.toLocaleString()} per employee
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-white font-sans text-slate-900">
      {/* Navigation */}
      <nav className="fixed w-full z-50 bg-white/80 backdrop-blur-md border-b border-gray-100">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-20">
            <button onClick={onBack} className="flex items-center text-2xl font-extrabold text-jam-black tracking-tight hover:opacity-80 transition-opacity">
              Payroll<span className="text-jam-orange">-Jam</span>
            </button>
            <div className="hidden md:flex items-center space-x-8">
              {onFeaturesClick && <button onClick={onFeaturesClick} className="text-gray-600 hover:text-gray-900 font-medium">Features</button>}
              <button className="text-jam-orange font-bold">Pricing</button>
              {onFaqClick && <button onClick={onFaqClick} className="text-gray-600 hover:text-gray-900 font-medium">FAQ</button>}
            </div>
            <div className="flex items-center space-x-4">
              <button
                onClick={onLogin}
                className="text-gray-900 font-medium hover:text-jam-orange transition-colors"
              >
                Log In
              </button>
              <button
                onClick={() => onSignup('Free', cycle)}
                className="bg-jam-black text-white px-6 py-2.5 rounded-full font-semibold hover:bg-gray-800 transition-all shadow-lg"
              >
                Sign Up Free
              </button>
            </div>
          </div>
        </div>
      </nav>

      <div className="pt-32 pb-20">
        <div className="text-center max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 mb-12">
          <h1 className="text-4xl md:text-5xl font-bold text-gray-900 mb-6">Pricing for every stage</h1>
          <p className="text-xl text-gray-500 mb-8">
            Transparent JMD pricing. From micro-businesses to enterprise payroll bureaus.
          </p>

          {/* Toggle */}
          <div className="flex items-center justify-center space-x-4">
            <span className={`text-sm font-semibold ${cycle === 'monthly' ? 'text-gray-900' : 'text-gray-500'}`}>Monthly</span>
            <button
              onClick={() => setCycle(cycle === 'monthly' ? 'annual' : 'monthly')}
              className={`relative inline-flex h-8 w-14 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${cycle === 'annual' ? 'bg-jam-orange' : 'bg-gray-200'}`}
            >
              <span className={`pointer-events-none inline-block h-7 w-7 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${cycle === 'annual' ? 'translate-x-6' : 'translate-x-0'}`} />
            </button>
            <span className={`text-sm font-semibold ${cycle === 'annual' ? 'text-gray-900' : 'text-gray-500'}`}>
              Yearly <span className="text-jam-orange text-xs ml-1 font-bold">(Save 10%)</span>
            </span>
          </div>
        </div>

        {/* Pricing Cards */}
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {displayPlans.map((plan) => (
              <div key={plan.id} className={`rounded-2xl p-6 relative flex flex-col border ${plan.highlight ? 'border-jam-black shadow-xl scale-105 z-10' : 'border-gray-200 shadow-sm'} ${plan.color} ${plan.textColor}`}>
                {plan.highlight && (
                  <div className="absolute top-0 left-1/2 transform -translate-x-1/2 -translate-y-1/2 bg-jam-orange text-jam-black px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wide">
                    Recommended
                  </div>
                )}
                <h3 className="text-xl font-bold mb-1">{plan.name}</h3>
                <p className={`text-xs uppercase font-bold mb-4 opacity-70`}>
                  {plan.limit.toLowerCase().includes('employee') ? plan.limit : `${plan.limit} Employees`}
                </p>
                <p className={`text-sm mb-6 opacity-80 min-h-[40px]`}>{plan.description}</p>

                <div className="mb-6">
                  {renderPrice(plan)}
                  {cycle === 'annual' && plan.priceConfig.type !== 'free' && (
                    <p className="text-xs text-green-500 font-medium mt-1">Billed annually</p>
                  )}
                </div>

                <ul className="space-y-3 mb-8 flex-1">
                  {plan.features.map((feature, i) => (
                    <li key={i} className="flex items-start text-sm">
                      <Icons.CheckMark className={`w-4 h-4 mr-2 flex-shrink-0 ${plan.highlight ? 'text-jam-orange' : 'text-green-600'}`} />
                      <span className="opacity-90">{feature}</span>
                    </li>
                  ))}
                </ul>

                <button
                  onClick={() => onSignup(plan.name, cycle)}
                  className={`w-full py-3 rounded-lg font-bold transition-colors text-sm ${plan.highlight
                    ? 'bg-jam-orange text-jam-black hover:bg-yellow-500'
                    : 'bg-gray-900 text-white hover:bg-gray-800'
                    }`}
                >
                  {plan.cta}
                </button>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-24 bg-gray-50 py-16 border-t border-gray-200">
          <div className="max-w-4xl mx-auto px-4 text-center">
            <h2 className="text-3xl font-bold text-gray-900 mb-4">Still have questions?</h2>
            <p className="text-gray-500 mb-8">Our team is based in Kingston and ready to help you set up your payroll compliance.</p>
            <div className="flex justify-center space-x-4">
              <button className="flex items-center text-jam-black font-semibold hover:text-jam-orange">
                <Icons.Users className="w-5 h-5 mr-2" />
                Contact Sales
              </button>
              <span className="text-gray-300">|</span>
              <button className="flex items-center text-jam-black font-semibold hover:text-jam-orange">
                <Icons.File className="w-5 h-5 mr-2" />
                Read Documentation
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Footer */}
      <Footer
        onFeaturesClick={onFeaturesClick}
        onFaqClick={onFaqClick}
        onPrivacyClick={onPrivacyClick}
        onTermsClick={onTermsClick}
      />
    </div>
  );
};
