
import React, { useEffect } from 'react';
import { Icons } from '../components/Icons';

import { PricingPlan } from '../types';
interface LandingPageProps {
  plans?: PricingPlan[];
  onLogin: () => void;
  onSignup: (plan?: string) => void;
  onPricingClick: () => void;
  onFeaturesClick: () => void;
  onFaqClick: () => void;
  onPrivacyClick?: () => void;
  onTermsClick?: () => void;
}

export const LandingPage: React.FC<LandingPageProps> = ({ plans = [], onLogin, onSignup, onPricingClick, onFeaturesClick, onFaqClick, onPrivacyClick, onTermsClick }) => {
  // SEO: Update page title and meta tags
  useEffect(() => {
    document.title = 'Payroll-Jam | Jamaican Payroll Software - NIS, NHT & PAYE Compliance';
    
    // Update meta description
    const metaDescription = document.querySelector('meta[name="description"]');
    if (metaDescription) {
      metaDescription.setAttribute('content', 'Automate your Jamaican payroll with Payroll-Jam. Built-in NIS, NHT, PAYE, and Education Tax calculations. Generate S01 reports instantly. Start free today!');
    }
    
    // Update keywords
    const metaKeywords = document.querySelector('meta[name="keywords"]');
    if (metaKeywords) {
      metaKeywords.setAttribute('content', 'Jamaica payroll, payroll software Jamaica, TRN, NIS, NHT, PAYE, Jamaican payroll system, cloud payroll, employee management, salary calculator, TAJ compliance, S01 reports, Jamaican tax software');
    }
    
    // Update OG tags
    const ogTitle = document.querySelector('meta[property="og:title"]');
    if (ogTitle) {
      ogTitle.setAttribute('content', 'Payroll-Jam | Jamaican Payroll Software - NIS, NHT & PAYE Compliance');
    }
    
    const ogDescription = document.querySelector('meta[property="og:description"]');
    if (ogDescription) {
      ogDescription.setAttribute('content', 'Automate your Jamaican payroll with Payroll-Jam. Built-in NIS, NHT, PAYE, and Education Tax calculations. Generate S01 reports instantly. Start free today!');
    }
    
    const ogUrl = document.querySelector('meta[property="og:url"]');
    if (ogUrl) {
      ogUrl.setAttribute('content', window.location.href);
    }
    
    // Update Twitter tags
    const twitterTitle = document.querySelector('meta[property="twitter:title"]');
    if (twitterTitle) {
      twitterTitle.setAttribute('content', 'Payroll-Jam | Jamaican Payroll Software - NIS, NHT & PAYE Compliance');
    }
    
    const twitterDescription = document.querySelector('meta[property="twitter:description"]');
    if (twitterDescription) {
      twitterDescription.setAttribute('content', 'Automate your Jamaican payroll with Payroll-Jam. Built-in NIS, NHT, PAYE, and Education Tax calculations. Generate S01 reports instantly.');
    }
    
    const twitterUrl = document.querySelector('meta[property="twitter:url"]');
    if (twitterUrl) {
      twitterUrl.setAttribute('content', window.location.href);
    }
    
    // Add or update canonical URL
    let canonicalLink = document.querySelector('link[rel="canonical"]');
    if (!canonicalLink) {
      canonicalLink = document.createElement('link');
      canonicalLink.setAttribute('rel', 'canonical');
      document.head.appendChild(canonicalLink);
    }
    canonicalLink.setAttribute('href', window.location.href);
  }, []);
  
  // Filter only active plans for display
  const activePlans = plans.filter(p => p.isActive);
  
  // Helper function to render pricing
  const renderPrice = (plan: PricingPlan) => {
    if (plan.priceConfig.type === 'free') {
      return (
        <div className="flex items-baseline">
          <span className="text-4xl font-bold">$0</span>
        </div>
      );
    }
    
    const amount = plan.priceConfig.monthly;
    
    if (plan.priceConfig.type === 'flat') {
      return (
        <div className="flex items-baseline">
          <span className="text-4xl font-bold">${amount.toLocaleString()}</span>
          <span className={`ml-1 ${plan.highlight ? 'text-gray-400' : 'text-gray-500'}`}>/mo</span>
        </div>
      );
    }
    if (plan.priceConfig.type === 'per_emp') {
      return (
        <div className="flex items-baseline">
          <span className="text-4xl font-bold">${amount.toLocaleString()}</span>
          <span className={`ml-1 ${plan.highlight ? 'text-gray-400' : 'text-gray-500'}`}>/emp</span>
        </div>
      );
    }
    if (plan.priceConfig.type === 'base') {
      return (
        <div className="flex items-baseline">
          <span className="text-4xl font-bold">${amount.toLocaleString()}</span>
          <span className={`ml-1 ${plan.highlight ? 'text-gray-400' : 'text-gray-500'}`}>+</span>
        </div>
      );
    }
  };
  
  const faqs = [
    {
      q: `Is this compliant with the latest 2025 tax laws?`,
      a: `Yes. We update our tax tables within 24 hours of any Ministry of Finance announcement. Our system currently reflects the January 1, 2025 threshold adjustments.`
    },
    {
      q: `Can I export data to my accounting software?`,
      a: `Absolutely. We support CSV and Excel exports compatible with QuickBooks, Xero, and Sage. We also provide direct ACH files for NCB and Scotiabank.`
    },
    {
      q: `What happens after my 14-day trial?`,
      a: `You can choose to upgrade to a paid plan or downgrade to a read-only mode. We will never charge your card without your explicit permission.`
    },
    {
      q: `Do you support hourly and salaried employees?`,
      a: `Yes, we support multiple pay structures including hourly, weekly, fortnightly, and monthly salaries, as well as commission-based pay.`
    }
  ];

  // Optionally show plans/pricing on the landing page if provided
  return (
    <div className="min-h-screen bg-white font-sans text-slate-900 scroll-smooth">
      {/* Navigation */}
      <nav className="fixed w-full z-50 bg-white/80 backdrop-blur-md border-b border-gray-100">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-20">
            <div className="flex items-center">
              <span className="text-2xl font-extrabold text-jam-black tracking-tight">
                Payroll<span className="text-jam-orange">-Jam</span>
              </span>
            </div>
            <div className="hidden md:flex items-center space-x-8">
              <button onClick={onFeaturesClick} className="text-gray-600 hover:text-gray-900 font-medium">Features</button>
              <button onClick={onPricingClick} className="text-gray-600 hover:text-gray-900 font-medium">Pricing</button>
              <button onClick={onFaqClick} className="text-gray-600 hover:text-gray-900 font-medium">FAQ</button>
            </div>
            <div className="flex items-center space-x-4">
              <button 
                onClick={onLogin}
                className="text-gray-900 font-medium hover:text-jam-orange transition-colors"
              >
                Log In
              </button>
              <button 
                onClick={() => onSignup()}
                className="bg-jam-black text-white px-6 py-2.5 rounded-full font-semibold hover:bg-gray-800 transition-all shadow-lg hover:shadow-xl transform hover:-translate-y-0.5"
              >
                Get Started
              </button>
            </div>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="pt-32 pb-20 lg:pt-40 lg:pb-28 overflow-hidden">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative">
          <div className="lg:grid lg:grid-cols-12 lg:gap-16 items-center">
            <div className="lg:col-span-6 text-center lg:text-left z-10">
              <div className="inline-flex items-center px-3 py-1 rounded-full bg-orange-50 text-jam-orange text-sm font-semibold mb-6 border border-orange-100">
                <span className="mr-2">🇯🇲</span> Made for Jamaica
              </div>
              <h1 className="text-4xl lg:text-6xl font-extrabold text-gray-900 tracking-tight leading-tight mb-6">
                Payroll Compliance <br />
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-jam-orange to-yellow-500">
                  Made Simple.
                </span>
              </h1>
              <p className="text-lg text-gray-600 mb-8 leading-relaxed max-w-2xl mx-auto lg:mx-0">
                Automate your NIS, NHT, and PAYE calculations. Generate S01 reports in seconds and manage your Jamaican workforce with our AI-powered platform.
              </p>
              <div className="flex flex-col sm:flex-row items-center justify-center lg:justify-start space-y-4 sm:space-y-0 sm:space-x-4">
                <button 
                  onClick={() => onSignup('Free')}
                  className="w-full sm:w-auto px-8 py-4 bg-jam-black text-white rounded-full font-bold text-lg shadow-xl hover:bg-gray-900 transition-all flex items-center justify-center"
                >
                  Start Free
                  <Icons.ArrowRight className="ml-2 w-5 h-5" />
                </button>
                <button onClick={onLogin} className="w-full sm:w-auto px-8 py-4 bg-white border-2 border-gray-100 text-gray-700 rounded-full font-bold text-lg hover:border-gray-300 hover:bg-gray-50 transition-all">
                  Live Demo
                </button>
              </div>
              <div className="mt-10 flex items-center justify-center lg:justify-start space-x-6 text-sm text-gray-500">
                <div className="flex items-center">
                  <Icons.Check className="w-5 h-5 text-green-500 mr-2" />
                  TAJ Compliant
                </div>
                <div className="flex items-center">
                  <Icons.Check className="w-5 h-5 text-green-500 mr-2" />
                  NCB Integration
                </div>
                <div className="flex items-center">
                  <Icons.Check className="w-5 h-5 text-green-500 mr-2" />
                  AI Support
                </div>
              </div>
            </div>
            <div className="lg:col-span-6 mt-16 lg:mt-0 relative">
              <div className="relative rounded-2xl bg-gray-900 p-2 shadow-2xl transform rotate-2 hover:rotate-0 transition-transform duration-500">
                <div className="absolute -top-10 -right-10 w-40 h-40 bg-jam-yellow rounded-full mix-blend-multiply filter blur-xl opacity-70 animate-blob"></div>
                <div className="absolute -bottom-10 -left-10 w-40 h-40 bg-jam-orange rounded-full mix-blend-multiply filter blur-xl opacity-70 animate-blob animation-delay-2000"></div>
                <img 
                  src="https://images.unsplash.com/photo-1554224155-8d04cb21cd6c?ixlib=rb-4.0.3&auto=format&fit=crop&w=1000&q=80" 
                  alt="Dashboard Preview" 
                  className="rounded-xl shadow-inner relative z-10 border border-gray-800"
                />
                <div className="absolute bottom-8 -left-8 bg-white p-4 rounded-xl shadow-xl border border-gray-100 z-20 max-w-xs">
                  <div className="flex items-center mb-2">
                    <div className="w-8 h-8 bg-green-100 rounded-full flex items-center justify-center text-green-600">
                      <Icons.CheckMark className="w-4 h-4" />
                    </div>
                    <div className="ml-3">
                      <p className="text-sm font-bold text-gray-900">Payroll Run Success</p>
                      <p className="text-xs text-gray-500">All employees paid on time</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features Grid */}
      <section id="features" className="py-24 bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4">Everything you need to run payroll</h2>
            <p className="text-xl text-gray-500 max-w-2xl mx-auto">Built specifically for the Jamaican regulatory environment, giving you peace of mind.</p>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <div className="bg-white p-8 rounded-2xl shadow-sm hover:shadow-md transition-shadow border border-gray-100 cursor-pointer" onClick={onFeaturesClick}>
              <div className="w-12 h-12 bg-blue-50 rounded-xl flex items-center justify-center text-blue-600 mb-6">
                <Icons.Compliance className="w-6 h-6" />
              </div>
              <h3 className="text-xl font-bold text-gray-900 mb-3">Statutory Compliance</h3>
              <p className="text-gray-600 leading-relaxed">
                Automatically calculate NIS, NHT, Education Tax, and PAYE based on the latest 2025 thresholds. Download S01/S02 forms instantly.
              </p>
            </div>

            <div className="bg-white p-8 rounded-2xl shadow-sm hover:shadow-md transition-shadow border border-gray-100 cursor-pointer" onClick={onFeaturesClick}>
              <div className="w-12 h-12 bg-purple-50 rounded-xl flex items-center justify-center text-purple-600 mb-6">
                <Icons.AI className="w-6 h-6" />
              </div>
              <h3 className="text-xl font-bold text-gray-900 mb-3">AI HR Assistant</h3>
              <p className="text-gray-600 leading-relaxed">
                Ask "JamBot" questions about Jamaican labour laws, holidays, or draft employment contracts in seconds.
              </p>
            </div>

            <div className="bg-white p-8 rounded-2xl shadow-sm hover:shadow-md transition-shadow border border-gray-100 cursor-pointer" onClick={onFeaturesClick}>
              <div className="w-12 h-12 bg-orange-50 rounded-xl flex items-center justify-center text-jam-orange mb-6">
                <Icons.Bank className="w-6 h-6" />
              </div>
              <h3 className="text-xl font-bold text-gray-900 mb-3">Direct Deposit</h3>
              <p className="text-gray-600 leading-relaxed">
                Generate ACH files compatible with NCB, Scotiabank, and JN Bank for one-click salary disbursement.
              </p>
            </div>
          </div>
          <div className="mt-12 text-center">
             <button onClick={onFeaturesClick} className="text-jam-orange font-bold hover:text-yellow-600 flex items-center justify-center mx-auto">
                View All Features <Icons.ArrowRight className="w-4 h-4 ml-2"/>
            </button>
          </div>
        </div>
      </section>

      {/* Testimonials */}
      <section id="testimonials" className="py-24 bg-white border-t border-gray-100">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center mb-16">
                <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4">Trusted by Jamaican Businesses</h2>
                <p className="text-xl text-gray-500">See what our customers have to say.</p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                {[
                    {
                        text: `Payroll-Jam saved us hours every month. The S01 generation is a lifesaver, no more manual calculations.`,
                        author: `Karen M.`,
                        role: `HR Manager, Island Grill`,
                        color: `bg-blue-50`
                    },
                    {
                        text: `Finally a system that understands Jamaican tax laws properly. The support for bonuses and statutory deductions is spot on.`,
                        author: `David R.`,
                        role: `CEO, Kingston Logistics`,
                        color: `bg-orange-50`
                    },
                    {
                        text: `The AI assistant helped me draft an employment contract in 2 minutes. Highly recommended for small business owners.`,
                        author: `Sarah L.`,
                        role: `Founder, Mobay Tech`,
                        color: `bg-purple-50`
                    }
                ].map((t, i) => (
                    <div key={i} className={`p-8 rounded-2xl ${t.color}`}>
                        <div className="flex space-x-1 mb-4 text-jam-orange">
                            {[1,2,3,4,5].map(s => <Icons.Star key={s} className="w-5 h-5 fill-current" />)}
                        </div>
                        <p className="text-gray-800 italic mb-6">"{t.text}"</p>
                        <div>
                            <p className="font-bold text-gray-900">{t.author}</p>
                            <p className="text-sm text-gray-500">{t.role}</p>
                        </div>
                    </div>
                ))}
            </div>
        </div>
      </section>

      {/* Pricing Teaser */}
      <section id="pricing-teaser" className="py-24 bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
           <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4">Plans for every business size</h2>
            <p className="text-xl text-gray-500 mb-8">From solopreneurs to enterprise teams. All prices in JMD.</p>
            <button onClick={onPricingClick} className="text-jam-orange font-bold hover:text-yellow-600 flex items-center justify-center">
                View Full Pricing & Features <Icons.ArrowRight className="w-4 h-4 ml-2"/>
            </button>
          </div>

          {activePlans.length > 0 ? (
            <div className={`grid grid-cols-1 md:grid-cols-${Math.min(activePlans.length, 4)} gap-8 max-w-6xl mx-auto`}>
              {activePlans.slice(0, 4).map((plan) => (
                <div 
                  key={plan.id}
                  className={`rounded-2xl p-8 shadow-sm hover:shadow-md transition-all relative ${
                    plan.highlight 
                      ? 'bg-jam-black text-white border border-gray-900 shadow-xl transform md:-translate-y-4' 
                      : 'bg-white border border-gray-200'
                  }`}
                >
                  {plan.highlight && (
                    <div className="absolute top-0 right-0 -mt-2 -mr-2 bg-jam-orange text-jam-black text-xs font-bold px-2 py-1 rounded-full">
                      POPULAR
                    </div>
                  )}
                  
                  <h3 className={`text-lg font-semibold mb-2 ${plan.highlight ? 'text-white' : 'text-gray-900'}`}>
                    {plan.name}
                  </h3>
                  
                  <div className={`flex items-baseline mb-6 ${plan.highlight ? 'text-white' : 'text-gray-900'}`}>
                    {renderPrice(plan)}
                  </div>
                  
                  <p className={`text-sm mb-6 min-h-[48px] ${plan.highlight ? 'text-gray-400' : 'text-gray-500'}`}>
                    {plan.description}
                  </p>
                  
                  <button 
                    onClick={() => onSignup(plan.name)}
                    className={`w-full py-3 rounded-lg font-semibold transition-colors ${
                      plan.highlight
                        ? 'bg-jam-orange text-jam-black hover:bg-yellow-500'
                        : 'border border-gray-300 text-gray-900 hover:bg-gray-50'
                    }`}
                  >
                    {plan.cta}
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-5xl mx-auto">
              {/* Fallback to static plans if no plans available */}
              <div className="bg-white rounded-2xl border border-gray-200 p-8 shadow-sm hover:shadow-md transition-shadow">
                <h3 className="text-lg font-semibold text-gray-900 mb-2">Free</h3>
                <div className="flex items-baseline mb-6">
                  <span className="text-4xl font-bold text-gray-900">$0</span>
                </div>
                <p className="text-sm text-gray-500 mb-6">For up to 5 employees. No credit card required.</p>
                <button onClick={() => onSignup('Free')} className="w-full py-3 border border-gray-300 rounded-lg font-semibold text-gray-900 hover:bg-gray-50">Start Free</button>
              </div>

              <div className="bg-jam-black rounded-2xl border border-gray-900 p-8 shadow-xl transform md:-translate-y-4 relative">
                <div className="absolute top-0 right-0 -mt-2 -mr-2 bg-jam-orange text-jam-black text-xs font-bold px-2 py-1 rounded-full">POPULAR</div>
                <h3 className="text-lg font-semibold text-white mb-2">Starter</h3>
                <div className="flex items-baseline mb-6">
                  <span className="text-4xl font-bold text-white">$5,000</span>
                  <span className="text-gray-400 ml-1">/mo</span>
                </div>
                <p className="text-sm text-gray-400 mb-6">For growing teams. Full compliance.</p>
                <button onClick={() => onSignup('Starter')} className="w-full py-3 bg-jam-orange text-jam-black rounded-lg font-bold hover:bg-yellow-500">Get Started</button>
              </div>

              <div className="bg-white rounded-2xl border border-gray-200 p-8 shadow-sm hover:shadow-md transition-shadow">
                <h3 className="text-lg font-semibold text-gray-900 mb-2">Pro</h3>
                <div className="flex items-baseline mb-6">
                  <span className="text-4xl font-bold text-gray-900">$500</span>
                  <span className="text-gray-500 ml-1">/emp</span>
                </div>
                <p className="text-sm text-gray-500 mb-6">For larger teams. Advanced features.</p>
                <button onClick={() => onSignup('Pro')} className="w-full py-3 border border-gray-300 rounded-lg font-semibold text-gray-900 hover:bg-gray-50">View Features</button>
              </div>
            </div>
          )}
        </div>
      </section>

      {/* FAQ Section */}
      <section id="faq" className="py-24 bg-white border-t border-gray-100">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center mb-16">
                <h2 className="text-3xl font-bold text-gray-900 mb-4">Frequently Asked Questions</h2>
                <p className="text-lg text-gray-500">Have a different question? Contact our sales team.</p>
            </div>
            <div className="space-y-8">
                {faqs.map((item, idx) => (
                    <div key={idx} className="bg-gray-50 rounded-xl p-8 border border-gray-100">
                        <h3 className="text-lg font-bold text-gray-900 mb-3">{item.q}</h3>
                        <p className="text-gray-600">{item.a}</p>
                    </div>
                ))}
            </div>
            <div className="mt-12 text-center">
                <button onClick={onFaqClick} className="text-jam-orange font-bold hover:text-yellow-600 flex items-center justify-center mx-auto">
                    View All FAQs <Icons.ArrowRight className="w-4 h-4 ml-2"/>
                </button>
            </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-gray-900 text-white py-12 border-t border-gray-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
            <div className="col-span-1 md:col-span-2">
               <span className="text-2xl font-extrabold text-white tracking-tight">
                Payroll<span className="text-jam-orange">-Jam</span>
              </span>
              <p className="mt-4 text-gray-400 max-w-xs">
                Making payroll compliant, fast, and easy for Jamaican businesses.
              </p>
            </div>
            <div>
              <h4 className="text-sm font-bold uppercase tracking-wider text-gray-500 mb-4">Product</h4>
              <ul className="space-y-2 text-gray-400">
                <li><button onClick={onFeaturesClick} className="hover:text-white">Features</button></li>
                <li><button onClick={onPricingClick} className="hover:text-white">Pricing</button></li>
                <li><a href="#" className="hover:text-white">API</a></li>
              </ul>
            </div>
            <div>
              <h4 className="text-sm font-bold uppercase tracking-wider text-gray-500 mb-4">Legal</h4>
              <ul className="space-y-2 text-gray-400">
                <li><button onClick={onPrivacyClick} className="hover:text-white">Privacy Policy</button></li>
                <li><button onClick={onTermsClick} className="hover:text-white">Terms of Service</button></li>
              </ul>
            </div>
          </div>
          <div className="mt-12 pt-8 border-t border-gray-800 text-center text-gray-500 text-sm">
            &copy; 2025 Payroll-Jam Ltd. All rights reserved. Kingston, Jamaica.
          </div>
        </div>
      </footer>
    </div>
  );
};
