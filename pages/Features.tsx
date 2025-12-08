
import React from 'react';
import { Icons } from '../components/Icons';

interface FeaturesProps {
  onSignup: () => void;
  onLogin: () => void;
  onBack: () => void;
  onPricingClick: () => void;
  onFaqClick: () => void;
}

export const Features: React.FC<FeaturesProps> = ({ onSignup, onLogin, onBack, onPricingClick, onFaqClick }) => {
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
              <button className="text-jam-orange font-bold">Features</button>
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
      <div className="pt-32 pb-16 bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h1 className="text-4xl md:text-5xl font-extrabold text-gray-900 mb-6">
            Built for Jamaica's <br/>
            <span className="text-jam-orange">Business Landscape</span>
          </h1>
          <p className="text-xl text-gray-600 max-w-3xl mx-auto mb-10">
            From statutory compliance to direct bank deposits, we handle the complexities of Jamaican payroll so you can focus on growth.
          </p>
        </div>
      </div>

      {/* Module 1: Payroll */}
      <section className="py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="lg:grid lg:grid-cols-2 lg:gap-16 items-center">
            <div>
              <div className="inline-flex items-center px-3 py-1 rounded-full bg-green-100 text-green-800 text-sm font-bold mb-4">
                <Icons.Payroll className="w-4 h-4 mr-2" />
                Core Payroll
              </div>
              <h2 className="text-3xl font-bold text-gray-900 mb-4">Run Payroll in Minutes, Not Days</h2>
              <p className="text-lg text-gray-600 mb-6">
                Say goodbye to spreadsheets. Our engine handles hourly, salaried, and commission-based pay with ease.
              </p>
              <ul className="space-y-4">
                {[
                  `Unlimited Pay Runs (Weekly, Fortnightly, Monthly)`,
                  `Automatic NIS, NHT, Ed Tax & PAYE calculations`,
                  `Support for Bonuses, Overtime, and Deductions`,
                  `Direct ACH File Generation (NCB, Scotiabank, JN)`
                ].map((item, i) => (
                  <li key={i} className="flex items-start">
                    <Icons.CheckCircle className="w-5 h-5 text-jam-orange mt-0.5 mr-3 flex-shrink-0" />
                    <span className="text-gray-700">{item}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="mt-12 lg:mt-0 relative">
               <div className="bg-white rounded-2xl shadow-xl border border-gray-200 p-6 transform rotate-2 hover:rotate-0 transition-transform">
                  <div className="flex items-center justify-between border-b border-gray-100 pb-4 mb-4">
                      <h3 className="font-bold text-gray-900">Pay Run Summary</h3>
                      <span className="text-xs bg-green-100 text-green-800 px-2 py-1 rounded-full">Finalized</span>
                  </div>
                  <div className="space-y-3">
                      <div className="flex justify-between text-sm">
                          <span className="text-gray-500">Total Gross</span>
                          <span className="font-medium">$1,250,000.00</span>
                      </div>
                      <div className="flex justify-between text-sm">
                          <span className="text-gray-500">Statutory Deductions</span>
                          <span className="font-medium text-red-500">-$185,400.00</span>
                      </div>
                      <div className="flex justify-between text-sm pt-2 border-t border-gray-100">
                          <span className="font-bold text-gray-900">Net Pay</span>
                          <span className="font-bold text-jam-orange">$1,064,600.00</span>
                      </div>
                  </div>
                  <button className="w-full mt-6 bg-jam-black text-white py-2 rounded-lg text-sm font-medium">Export Bank File</button>
               </div>
            </div>
          </div>
        </div>
      </section>

      {/* Module 2: Compliance */}
      <section className="py-20 bg-gray-900 text-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="lg:grid lg:grid-cols-2 lg:gap-16 items-center">
             <div className="order-2 lg:order-1 mt-12 lg:mt-0">
                <div className="grid grid-cols-2 gap-4">
                    <div className="bg-gray-800 p-6 rounded-xl border border-gray-700">
                        <Icons.Document className="w-8 h-8 text-jam-yellow mb-3" />
                        <h4 className="font-bold text-lg">S01 Monthly</h4>
                        <p className="text-gray-400 text-sm mt-2">Auto-generated CSV ready for TAJ portal upload.</p>
                    </div>
                    <div className="bg-gray-800 p-6 rounded-xl border border-gray-700">
                        <Icons.Calendar className="w-8 h-8 text-jam-orange mb-3" />
                        <h4 className="font-bold text-lg">S02 Annual</h4>
                        <p className="text-gray-400 text-sm mt-2">Year-end returns compiled automatically from history.</p>
                    </div>
                    <div className="bg-gray-800 p-6 rounded-xl border border-gray-700">
                        <Icons.User className="w-8 h-8 text-blue-400 mb-3" />
                        <h4 className="font-bold text-lg">P24 / P45</h4>
                        <p className="text-gray-400 text-sm mt-2">Certificates for employees and terminations.</p>
                    </div>
                    <div className="bg-gray-800 p-6 rounded-xl border border-gray-700">
                        <Icons.Shield className="w-8 h-8 text-green-400 mb-3" />
                        <h4 className="font-bold text-lg">2025 Ready</h4>
                        <p className="text-gray-400 text-sm mt-2">Always updated with the latest Ministry of Finance rates.</p>
                    </div>
                </div>
             </div>
             <div className="order-1 lg:order-2">
                <div className="inline-flex items-center px-3 py-1 rounded-full bg-jam-orange/20 text-jam-orange text-sm font-bold mb-4 border border-jam-orange/50">
                    <Icons.Shield className="w-4 h-4 mr-2" />
                    Statutory Compliance
                </div>
                <h2 className="text-3xl font-bold mb-4">Stay Compliant with TAJ</h2>
                <p className="text-lg text-gray-300 mb-6">
                    Avoid penalties and late fees. We track your filing deadlines and generate the exact forms required by Tax Administration Jamaica.
                </p>
                <p className="text-gray-400">
                    Our system handles the $1.5M tax-free threshold, NIS caps, and higher rate PAYE calculations automatically.
                </p>
             </div>
          </div>
        </div>
      </section>

      {/* Module 3: HR & Portal */}
      <section className="py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="lg:grid lg:grid-cols-2 lg:gap-16 items-center">
            <div>
              <div className="inline-flex items-center px-3 py-1 rounded-full bg-purple-100 text-purple-800 text-sm font-bold mb-4">
                <Icons.Users className="w-4 h-4 mr-2" />
                HR & Employee Portal
              </div>
              <h2 className="text-3xl font-bold text-gray-900 mb-4">Empower Your Workforce</h2>
              <p className="text-lg text-gray-600 mb-6">
                Give your team the transparency they deserve with a dedicated self-service portal.
              </p>
              <div className="space-y-6">
                  <div className="flex">
                      <div className="flex-shrink-0">
                          <div className="flex items-center justify-center h-10 w-10 rounded-md bg-jam-black text-white">
                              <Icons.DownloadCloud className="w-6 h-6" />
                          </div>
                      </div>
                      <div className="ml-4">
                          <h3 className="text-lg font-medium text-gray-900">Digital Payslips</h3>
                          <p className="mt-1 text-gray-500">Employees can view and download their pay stubs and tax forms 24/7.</p>
                      </div>
                  </div>
                  <div className="flex">
                      <div className="flex-shrink-0">
                          <div className="flex items-center justify-center h-10 w-10 rounded-md bg-jam-black text-white">
                              <Icons.Plane className="w-6 h-6" />
                          </div>
                      </div>
                      <div className="ml-4">
                          <h3 className="text-lg font-medium text-gray-900">Leave Management</h3>
                          <p className="mt-1 text-gray-500">Track vacation and sick leave balances. Employees request time off, you approve.</p>
                      </div>
                  </div>
                  <div className="flex">
                      <div className="flex-shrink-0">
                          <div className="flex items-center justify-center h-10 w-10 rounded-md bg-jam-black text-white">
                              <Icons.Document className="w-6 h-6" />
                          </div>
                      </div>
                      <div className="ml-4">
                          <h3 className="text-lg font-medium text-gray-900">Document Generator</h3>
                          <p className="mt-1 text-gray-500">Generate employment contracts and job letters instantly using our templates.</p>
                      </div>
                  </div>
              </div>
            </div>
            <div className="mt-12 lg:mt-0">
               <div className="bg-gray-50 rounded-2xl border-2 border-dashed border-gray-300 p-8 flex flex-col items-center justify-center text-center">
                   <Icons.AI className="w-20 h-20 text-gray-300 mb-4" />
                   <h3 className="text-xl font-bold text-gray-900">Plus: JamBot AI Assistant</h3>
                   <p className="text-gray-500 mt-2 max-w-sm">
                       Need help with the Labour Code? Ask our AI assistant questions like "How is holiday pay calculated for Christmas?"
                   </p>
               </div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-20 bg-jam-orange">
        <div className="max-w-4xl mx-auto px-4 text-center">
          <h2 className="text-3xl md:text-4xl font-extrabold text-jam-black mb-6">
            Ready to streamline your payroll?
          </h2>
          <p className="text-xl text-jam-black/80 mb-10">
            Join hundreds of Jamaican businesses saving time and avoiding penalties.
          </p>
          <button 
            onClick={onSignup}
            className="bg-jam-black text-white text-lg font-bold px-10 py-4 rounded-full shadow-2xl hover:bg-gray-900 hover:scale-105 transition-all"
          >
            Get Started Free
          </button>
          <p className="mt-4 text-sm text-jam-black/60 font-medium">No credit card required for 14-day trial.</p>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-gray-900 text-white py-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center text-gray-500 text-sm">
            &copy; 2025 Payroll-Jam Ltd. Kingston, Jamaica.
        </div>
      </footer>
    </div>
  );
};
