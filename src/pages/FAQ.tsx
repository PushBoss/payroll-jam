
import React, { useState } from 'react';
import { Icons } from '../components/Icons';
import { Footer } from '../components/Footer';
import { BetaBanner } from '../components/BetaBanner';
import { SUPPORT_MAILTO } from '../constants/support';

interface FAQProps {
  onSignup: () => void;
  onLogin: () => void;
  onBack: () => void;
  onPricingClick: () => void;
  onFeaturesClick: () => void;
  onPrivacyClick?: () => void;
  onTermsClick?: () => void;
}

export const FAQ: React.FC<FAQProps> = ({ onSignup, onLogin, onBack, onPricingClick, onFeaturesClick, onPrivacyClick, onTermsClick }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [activeCategory, setActiveCategory] = useState('All');

  const categories = ['All', 'General', 'Compliance', 'Billing', 'Technical'];

  const faqs = [
    {
      category: 'General',
      q: `What is Payroll-Jam?`,
      a: `Payroll-Jam is a cloud-based payroll software designed specifically for Jamaican businesses. It automates tax calculations, payslip generation, and statutory compliance reporting (S01, S02).`
    },
    {
      category: 'Compliance',
      q: `Are the tax tables up to date for 2025?`,
      a: `Yes. We continuously monitor Ministry of Finance announcements. Our system currently reflects the January 1, 2025 income tax threshold of $1.5M and the latest NIS/NHT rates.`
    },
    {
      category: 'Compliance',
      q: `Can I generate the S01 form for TAJ?`,
      a: `Absolutely. The platform generates a CSV file formatted specifically for the Tax Administration Jamaica (TAJ) portal. You can download this monthly from the Reports section.`
    },
    {
      category: 'Billing',
      q: `How does the 14-day free trial work?`,
      a: `You get full access to the 'Pro' plan features for 14 days. No credit card is required to start. At the end of the trial, you can choose a plan or downgrade to Free.`
    },
    {
      category: 'Technical',
      q: `Which banks do you support for direct deposit?`,
      a: `We generate ACH (Automated Clearing House) files compatible with National Commercial Bank (NCB), Scotiabank (BNS), and JN Bank. You simply upload this file to your corporate banking portal.`
    },
    {
      category: 'Compliance',
      q: `Does the system handle sick and vacation leave?`,
      a: `Yes. You can set accrual rates (e.g., 1.25 days/month). Employees can request leave via their portal, and balances are updated automatically upon approval.`
    },
    {
      category: 'General',
      q: `Can I invite my accountant?`,
      a: `Yes. You can invite unlimited users to your account. We recommend assigning the 'Manager' or 'Admin' role to your external accountant so they can access reports and run payroll.`
    },
    {
      category: 'Billing',
      q: `What payment methods do you accept?`,
      a: `We accept all major credit cards (Visa, Mastercard) via PayPal. For annual enterprise plans, we also accept direct bank transfer (Wire/RTGS) to our NCB account.`
    },
    {
      category: 'Technical',
      q: `Is my data secure?`,
      a: `We use bank-grade 256-bit SSL encryption for all data transmission. Our servers are hosted in secure data centers with daily backups to ensure your payroll records are never lost.`
    },
    {
      category: 'Compliance',
      q: `How do you handle bonuses and commissions?`,
      a: `Bonuses and commissions are added to the gross pay and taxed according to Jamaican law. We handle the aggregation automatically to ensure the correct PAYE bracket is applied.`
    },
    {
      category: 'General',
      q: `Do you have a mobile app?`,
      a: `Our platform is a Progressive Web App (PWA), meaning it is fully responsive and works perfectly on mobile browsers (Chrome, Safari) on both iOS and Android devices.`
    },
    {
      category: 'Billing',
      q: `Can I upgrade or downgrade anytime?`,
      a: `Yes. You can switch plans at any time in the billing settings. Prorated credits will be applied to your account for any unused time on your previous plan.`
    }
  ];

  const filteredFaqs = faqs.filter(item => {
    const matchesSearch = item.q.toLowerCase().includes(searchTerm.toLowerCase()) || item.a.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCategory = activeCategory === 'All' || item.category === activeCategory;
    return matchesSearch && matchesCategory;
  });

  return (
    <div className="min-h-screen bg-white font-sans text-slate-900">
      <div className="fixed inset-x-0 top-0 z-50">
        <BetaBanner />
      </div>

      {/* Navigation */}
      <nav className="fixed top-10 w-full z-40 bg-white/80 backdrop-blur-md border-b border-gray-100">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-20">
            <button onClick={onBack} className="flex items-center text-2xl font-extrabold text-jam-black tracking-tight hover:opacity-80 transition-opacity">
              Payroll<span className="text-jam-orange">-Jam</span>
            </button>
            <div className="hidden md:flex items-center space-x-8">
              <button onClick={onFeaturesClick} className="text-gray-600 hover:text-gray-900 font-medium">Features</button>
              <button onClick={onPricingClick} className="text-gray-600 hover:text-gray-900 font-medium">Pricing</button>
              <button className="text-jam-orange font-bold">FAQ</button>
            </div>
            <div className="flex items-center space-x-4">
              <button 
                onClick={onLogin}
                className="text-gray-900 font-medium hover:text-jam-orange transition-colors"
              >
                Log In
              </button>
              <button 
                onClick={onSignup}
                className="bg-jam-black text-white px-6 py-2.5 rounded-full font-semibold hover:bg-gray-800 transition-all shadow-lg"
              >
                Sign Up Free
              </button>
            </div>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <div className="pt-40 pb-16 bg-gray-50">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h1 className="text-4xl md:text-5xl font-extrabold text-gray-900 mb-6">
            How can we help?
          </h1>
          <p className="text-xl text-gray-600 mb-10">
            Find answers about compliance, features, and pricing.
          </p>
          
          <div className="relative max-w-2xl mx-auto">
            <Icons.Search className="absolute left-4 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
            <input 
              type="text" 
              placeholder="Search for a question..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-12 pr-4 py-4 rounded-xl border border-gray-200 shadow-sm focus:ring-2 focus:ring-jam-orange focus:border-transparent outline-none text-lg"
            />
          </div>
        </div>
      </div>

      {/* Categories */}
      <div className="border-b border-gray-200 sticky top-[7.5rem] bg-white/95 backdrop-blur-sm z-30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex space-x-8 overflow-x-auto no-scrollbar py-4">
            {categories.map(cat => (
              <button
                key={cat}
                onClick={() => setActiveCategory(cat)}
                className={`whitespace-nowrap px-4 py-2 rounded-full text-sm font-medium transition-all ${
                  activeCategory === cat 
                    ? 'bg-jam-black text-white shadow-md' 
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* FAQs Grid */}
      <section className="py-16 min-h-[500px]">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          {filteredFaqs.length === 0 ? (
            <div className="text-center py-12 text-gray-500">
              <Icons.Search className="w-12 h-12 mx-auto mb-4 opacity-20" />
              <p className="text-lg">No results found for "{searchTerm}".</p>
              <button onClick={() => setSearchTerm('')} className="mt-4 text-jam-orange font-bold hover:underline">Clear Search</button>
            </div>
          ) : (
            <div className="space-y-6">
              {filteredFaqs.map((item, idx) => (
                <div key={idx} className="bg-white border border-gray-200 rounded-2xl p-8 hover:shadow-md transition-shadow">
                  <div className="flex items-start">
                    <div className={`p-2 rounded-lg mr-4 mt-1 shrink-0 
                      ${item.category === 'Compliance' ? 'bg-blue-50 text-blue-600' : 
                        item.category === 'Billing' ? 'bg-green-50 text-green-600' : 
                        item.category === 'Technical' ? 'bg-purple-50 text-purple-600' : 'bg-gray-100 text-gray-600'}`}>
                      {item.category === 'Compliance' ? <Icons.Shield className="w-5 h-5" /> : 
                       item.category === 'Billing' ? <Icons.Bank className="w-5 h-5" /> :
                       item.category === 'Technical' ? <Icons.Zap className="w-5 h-5" /> : <Icons.Users className="w-5 h-5" />}
                    </div>
                    <div>
                      <h3 className="text-xl font-bold text-gray-900 mb-3">{item.q}</h3>
                      <p className="text-gray-600 leading-relaxed">{item.a}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* Footer CTA */}
      <section className="py-20 bg-jam-black text-white text-center">
        <div className="max-w-4xl mx-auto px-4">
          <h2 className="text-3xl font-bold mb-6">Still have questions?</h2>
          <p className="text-gray-400 mb-8">Our support team is based in Kingston and ready to assist you.</p>
          <div className="flex flex-col sm:flex-row justify-center space-y-4 sm:space-y-0 sm:space-x-4">
            <a href={SUPPORT_MAILTO} className="px-8 py-3 bg-jam-orange text-jam-black font-bold rounded-full hover:bg-yellow-500 transition-colors inline-flex items-center justify-center">
              Contact Support
            </a>
            <button onClick={onSignup} className="px-8 py-3 bg-gray-800 text-white font-bold rounded-full hover:bg-gray-700 transition-colors">
              Start Free Trial
            </button>
          </div>
        </div>
      </section>

      {/* Footer */}
      <Footer 
        onFeaturesClick={onFeaturesClick}
        onPricingClick={onPricingClick}
        onPrivacyClick={onPrivacyClick}
        onTermsClick={onTermsClick}
      />
    </div>
  );
};
