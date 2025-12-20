import React from 'react';

interface FooterProps {
  onFeaturesClick?: () => void;
  onPricingClick?: () => void;
  onPrivacyClick?: () => void;
  onTermsClick?: () => void;
  onFaqClick?: () => void;
}

export const Footer: React.FC<FooterProps> = ({ 
  onFeaturesClick, 
  onPricingClick, 
  onPrivacyClick, 
  onTermsClick,
  onFaqClick 
}) => {
  return (
    <footer className="bg-gray-900 text-white py-12 border-t border-gray-800">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
          {/* Logo and Description */}
          <div className="col-span-1 md:col-span-2">
            <div className="flex items-center space-x-2 mb-4">
              <div className="w-10 h-10 bg-jam-orange rounded-lg flex items-center justify-center">
                <span className="text-2xl font-bold text-jam-black">PJ</span>
              </div>
              <span className="text-2xl font-extrabold text-white tracking-tight">
                Payroll<span className="text-jam-orange">-Jam</span>
              </span>
            </div>
            <p className="text-gray-400 max-w-xs">
              Making payroll compliant, fast, and easy for Jamaican businesses. Built for Jamaica, trusted by businesses.
            </p>
          </div>
          
          {/* Product Links */}
          <div>
            <h4 className="text-sm font-bold uppercase tracking-wider text-gray-500 mb-4">Product</h4>
            <ul className="space-y-2 text-gray-400">
              {onFeaturesClick && (
                <li>
                  <button onClick={onFeaturesClick} className="hover:text-white transition-colors">
                    Features
                  </button>
                </li>
              )}
              {onPricingClick && (
                <li>
                  <button onClick={onPricingClick} className="hover:text-white transition-colors">
                    Pricing
                  </button>
                </li>
              )}
              {onFaqClick && (
                <li>
                  <button onClick={onFaqClick} className="hover:text-white transition-colors">
                    FAQ
                  </button>
                </li>
              )}
            </ul>
          </div>
          
          {/* Legal Links */}
          <div>
            <h4 className="text-sm font-bold uppercase tracking-wider text-gray-500 mb-4">Legal</h4>
            <ul className="space-y-2 text-gray-400">
              {onPrivacyClick && (
                <li>
                  <button onClick={onPrivacyClick} className="hover:text-white transition-colors">
                    Privacy Policy
                  </button>
                </li>
              )}
              {onTermsClick && (
                <li>
                  <button onClick={onTermsClick} className="hover:text-white transition-colors">
                    Terms of Service
                  </button>
                </li>
              )}
            </ul>
          </div>
        </div>
        
        {/* Copyright */}
        <div className="mt-12 pt-8 border-t border-gray-800 text-center text-gray-500 text-sm">
          &copy; {new Date().getFullYear()} Payroll-Jam Ltd. All rights reserved. Kingston, Jamaica.
        </div>
      </div>
    </footer>
  );
};
