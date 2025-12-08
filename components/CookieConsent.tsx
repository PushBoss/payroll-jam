
import React, { useState, useEffect } from 'react';
import { Icons } from './Icons';

export const CookieConsent: React.FC = () => {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const consent = localStorage.getItem('payroll_jam_cookie_consent');
    if (!consent) {
      setIsVisible(true);
    }
  }, []);

  const handleAccept = () => {
    localStorage.setItem('payroll_jam_cookie_consent', 'true');
    setIsVisible(false);
  };

  const handleDecline = () => {
    localStorage.setItem('payroll_jam_cookie_consent', 'false');
    setIsVisible(false);
  };

  if (!isVisible) return null;

  return (
    <div className="fixed bottom-0 left-0 w-full bg-gray-900 text-white p-4 shadow-lg z-[100] animate-fade-in border-t border-gray-700">
      <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="p-2 bg-gray-800 rounded-lg shrink-0">
            <Icons.Shield className="w-6 h-6 text-jam-orange" />
          </div>
          <div>
            <p className="font-bold text-sm mb-1">We value your privacy</p>
            <p className="text-xs text-gray-400 max-w-2xl leading-relaxed">
              We use cookies and local storage to enhance your experience, maintain session security, and analyze site usage. 
              By continuing to use this site, you consent to our data processing practices in accordance with the 
              <span className="text-white font-medium"> Jamaican Data Protection Act (JDPA)</span> and 
              <span className="text-white font-medium"> GDPR</span> regulations.
            </p>
          </div>
        </div>
        <div className="flex gap-3 shrink-0">
          <button 
            onClick={handleDecline}
            className="px-4 py-2 text-sm text-gray-400 hover:text-white border border-gray-700 rounded-lg hover:bg-gray-800 transition-colors"
          >
            Necessary Only
          </button>
          <button 
            onClick={handleAccept}
            className="px-6 py-2 text-sm bg-jam-orange text-jam-black font-bold rounded-lg hover:bg-yellow-500 transition-colors shadow-md"
          >
            Accept All
          </button>
        </div>
      </div>
    </div>
  );
};
