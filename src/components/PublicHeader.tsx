import React, { useMemo, useState } from 'react';
import { Icons } from './Icons';
import { useAuth } from '../context/AuthContext';

interface PublicHeaderProps {
  currentPage: 'home' | 'features' | 'pricing' | 'faq' | 'contact-us' | 'privacy-policy' | 'terms-of-service';
  onHomeClick: () => void;
  onFeaturesClick?: () => void;
  onPricingClick?: () => void;
  onFaqClick?: () => void;
  onContactClick?: () => void;
  onLogin?: () => void;
  onSignup?: () => void;
  onAppBack?: () => void;
}

export const PublicHeader: React.FC<PublicHeaderProps> = ({
  currentPage,
  onHomeClick,
  onFeaturesClick,
  onPricingClick,
  onFaqClick,
  onContactClick,
  onLogin,
  onSignup,
  onAppBack,
}) => {
  const { user } = useAuth();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const navItems = useMemo(() => {
    return [
      { id: 'features', label: 'Features', onClick: onFeaturesClick },
      { id: 'pricing', label: 'Pricing', onClick: onPricingClick },
      { id: 'faq', label: 'FAQ', onClick: onFaqClick },
      { id: 'contact-us', label: 'Contact Us', onClick: onContactClick },
    ].filter((item): item is { id: 'features' | 'pricing' | 'faq' | 'contact-us'; label: string; onClick: () => void } => !!item.onClick);
  }, [onContactClick, onFaqClick, onFeaturesClick, onPricingClick]);

  const closeMobileMenu = () => setIsMobileMenuOpen(false);
  const showAppBack = !!user && !!onAppBack;

  return (
    <nav className="fixed w-full z-50 bg-white/80 backdrop-blur-md border-b border-gray-100">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-20">
          <button
            onClick={() => {
              onHomeClick();
              closeMobileMenu();
            }}
            className="flex items-center text-2xl font-extrabold text-jam-black tracking-tight hover:opacity-80 transition-opacity"
          >
            Payroll<span className="text-jam-orange">-Jam</span>
          </button>

          <div className="hidden md:flex items-center space-x-8">
            {navItems.map((item) => (
              <button
                key={item.id}
                onClick={item.onClick}
                className={currentPage === item.id ? 'text-jam-orange font-bold' : 'text-gray-600 hover:text-gray-900 font-medium'}
              >
                {item.label}
              </button>
            ))}
          </div>

          <div className="flex items-center space-x-4">
            {showAppBack ? (
              <button
                onClick={() => {
                  onAppBack?.();
                  closeMobileMenu();
                }}
                className="hidden sm:block bg-jam-black text-white px-6 py-2.5 rounded-full font-semibold hover:bg-gray-800 transition-all shadow-lg"
              >
                Back to App
              </button>
            ) : (
              <>
                {onLogin && (
                  <button
                    onClick={() => {
                      onLogin();
                      closeMobileMenu();
                    }}
                    className="hidden md:block text-gray-900 font-medium hover:text-jam-orange transition-colors"
                  >
                    Log In
                  </button>
                )}

                {onSignup && (
                  <button
                    onClick={() => {
                      onSignup();
                      closeMobileMenu();
                    }}
                    className="hidden sm:block bg-jam-black text-white px-6 py-2.5 rounded-full font-semibold hover:bg-gray-800 transition-all shadow-lg"
                  >
                    Sign Up Free
                  </button>
                )}
              </>
            )}

            <button
              onClick={() => setIsMobileMenuOpen((prev) => !prev)}
              className="md:hidden p-2 rounded-lg text-gray-700 hover:bg-gray-100 transition-colors"
              aria-label="Toggle menu"
            >
              {isMobileMenuOpen ? <Icons.Close className="h-6 w-6" /> : <Icons.Menu className="h-6 w-6" />}
            </button>
          </div>
        </div>
      </div>

      {isMobileMenuOpen && (
        <div className="md:hidden border-t border-gray-100 bg-white/95 backdrop-blur-md shadow-lg">
          <div className="px-4 py-4 space-y-1">
            {navItems.map((item) => (
              <button
                key={item.id}
                onClick={() => {
                  item.onClick();
                  closeMobileMenu();
                }}
                className={`w-full text-left px-4 py-3 rounded-lg font-medium transition-colors ${
                  currentPage === item.id
                    ? 'bg-orange-50 text-jam-orange'
                    : 'text-gray-700 hover:bg-gray-50 hover:text-jam-orange'
                }`}
              >
                {item.label}
              </button>
            ))}

            <div className="pt-3 border-t border-gray-100 space-y-2">
              {showAppBack ? (
                <button
                  onClick={() => {
                    onAppBack?.();
                    closeMobileMenu();
                  }}
                  className="w-full text-center px-6 py-3 bg-jam-black text-white rounded-full font-semibold hover:bg-gray-800 transition-all shadow-md"
                >
                  Back to App
                </button>
              ) : (
                <>
                  {onLogin && (
                    <button
                      onClick={() => {
                        onLogin();
                        closeMobileMenu();
                      }}
                      className="w-full text-center px-6 py-3 border-2 border-gray-200 rounded-full font-semibold text-gray-800 hover:border-gray-400 transition-colors"
                    >
                      Log In
                    </button>
                  )}
                  {onSignup && (
                    <button
                      onClick={() => {
                        onSignup();
                        closeMobileMenu();
                      }}
                      className="w-full text-center px-6 py-3 bg-jam-black text-white rounded-full font-semibold hover:bg-gray-800 transition-all shadow-md"
                    >
                      Sign Up Free
                    </button>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </nav>
  );
};