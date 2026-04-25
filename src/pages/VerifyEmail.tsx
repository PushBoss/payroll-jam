import React, { useState, useEffect } from 'react';
import { Icons } from '../components/Icons';
import { supabase } from '../services/supabaseClient';
import { toast } from 'sonner';

interface VerifyEmailProps {
  email?: string;
  onLoginClick: () => void;
  onBack: () => void;
  onContactSupport: () => void;
}

export const VerifyEmail: React.FC<VerifyEmailProps> = ({ email, onLoginClick, onBack, onContactSupport }) => {
  const [isResending, setIsResending] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);
  const [hasExpiredError, setHasExpiredError] = useState(false);

  // Check for expired link error in URL
  useEffect(() => {
    const hashParams = new URLSearchParams(window.location.hash.substring(1));
    const error = hashParams.get('error');
    const errorCode = hashParams.get('error_code');
    
    if (error === 'access_denied' && errorCode === 'otp_expired') {
      setHasExpiredError(true);
      // Clear error from URL
      window.history.replaceState({}, '', window.location.pathname + window.location.search);
    }
  }, []);

  const handleResendEmail = async () => {
    if (!email) {
      toast.error('Email address not found. Please sign up again.');
      return;
    }

    if (resendCooldown > 0) {
      toast.error(`Please wait ${resendCooldown} seconds before resending.`);
      return;
    }

    setIsResending(true);

    try {
      if (!supabase) {
        throw new Error('Supabase not initialized');
      }

      // Resend confirmation email
      const { error } = await supabase.auth.resend({
        type: 'signup',
        email: email,
      });

      if (error) throw error;

      toast.success('Verification email sent! Please check your inbox (and spam folder).', {
        duration: 8000,
      });

      // Start 60-second cooldown
      setResendCooldown(60);
      const interval = setInterval(() => {
        setResendCooldown((prev) => {
          if (prev <= 1) {
            clearInterval(interval);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    } catch (error: any) {
      console.error('Failed to resend email:', error);
      toast.error(error.message || 'Failed to resend verification email. Please try again.');
    } finally {
      setIsResending(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-50 to-gray-100 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-8 animate-fade-in">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="mx-auto w-16 h-16 bg-jam-orange rounded-full flex items-center justify-center mb-4">
            <Icons.Mail className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            Verify Your Email
          </h1>
          <p className="text-gray-600">
            We've sent a verification link to your email
          </p>
        </div>

        {/* Email Address Display */}
        {email && (
          <div className="bg-gray-50 rounded-lg p-4 mb-6 border border-gray-200">
            <div className="flex items-center justify-center space-x-2">
              <Icons.Mail className="w-5 h-5 text-gray-500" />
              <span className="text-sm font-medium text-gray-900">{email}</span>
            </div>
          </div>
        )}

        {/* Instructions */}
        <div className="space-y-4 mb-8">
          <div className="flex items-start space-x-3">
            <div className="flex-shrink-0 w-6 h-6 bg-jam-orange rounded-full flex items-center justify-center text-white text-xs font-bold">
              1
            </div>
            <div>
              <h3 className="font-semibold text-gray-900 mb-1">Check your inbox</h3>
              <p className="text-sm text-gray-600">
                Look for an email from PayrollJam with the subject "Confirm your email address"
              </p>
            </div>
          </div>

          <div className="flex items-start space-x-3">
            <div className="flex-shrink-0 w-6 h-6 bg-jam-orange rounded-full flex items-center justify-center text-white text-xs font-bold">
              2
            </div>
            <div>
              <h3 className="font-semibold text-gray-900 mb-1">Click the verification link</h3>
              <p className="text-sm text-gray-600">
                Click the link in the email to verify your account
              </p>
            </div>
          </div>

          <div className="flex items-start space-x-3">
            <div className="flex-shrink-0 w-6 h-6 bg-jam-orange rounded-full flex items-center justify-center text-white text-xs font-bold">
              3
            </div>
            <div>
              <h3 className="font-semibold text-gray-900 mb-1">Login to your account</h3>
              <p className="text-sm text-gray-600">
                After verification, you'll be able to login and access your dashboard
              </p>
            </div>
          </div>
        </div>

        {/* Expired Link Error */}
        {hasExpiredError && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
            <div className="flex items-start space-x-2">
              <Icons.Alert className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
              <div>
                <h4 className="font-semibold text-red-900 text-sm mb-1">
                  Verification Link Expired
                </h4>
                <p className="text-xs text-red-800">
                  The verification link you clicked has expired. Please click the button below to receive a new verification email.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Important Notice */}
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-6">
          <div className="flex items-start space-x-2">
            <Icons.Alert className="w-5 h-5 text-yellow-600 flex-shrink-0 mt-0.5" />
            <div>
              <h4 className="font-semibold text-yellow-900 text-sm mb-1">
                Can't find the email?
              </h4>
              <ul className="text-xs text-yellow-800 space-y-1">
                <li>• Check your spam or junk folder</li>
                <li>• Make sure you entered the correct email address</li>
                <li>• Wait a few minutes for the email to arrive</li>
                {hasExpiredError && <li>• Verification links expire after 24 hours</li>}
              </ul>
            </div>
          </div>
        </div>

        {/* Resend Email Button */}
        <button
          onClick={handleResendEmail}
          disabled={isResending || resendCooldown > 0}
          className="w-full mb-4 bg-jam-orange text-jam-black py-3 rounded-lg font-semibold hover:bg-yellow-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center space-x-2"
        >
          {isResending ? (
            <>
              <Icons.Refresh className="w-5 h-5 animate-spin" />
              <span>Sending...</span>
            </>
          ) : resendCooldown > 0 ? (
            <span>Resend in {resendCooldown}s</span>
          ) : (
            <>
              <Icons.Mail className="w-5 h-5" />
              <span>Resend Verification Email</span>
            </>
          )}
        </button>

        {/* Login Button */}
        <button
          onClick={onLoginClick}
          className="w-full bg-gray-100 text-gray-700 py-3 rounded-lg font-semibold hover:bg-gray-200 transition-colors flex items-center justify-center space-x-2 mb-4"
        >
          <span>I've verified my email - Login</span>
          <Icons.ChevronRight className="w-5 h-5" />
        </button>

        {/* Back to Home */}
        <button
          onClick={onBack}
          className="w-full text-gray-500 hover:text-gray-700 text-sm transition-colors"
        >
          ← Back to Home
        </button>

        {/* Support Link */}
        <div className="mt-8 text-center">
          <p className="text-xs text-gray-500">
            Need help?{' '}
            <button
              type="button"
              onClick={onContactSupport}
              className="text-jam-orange hover:underline font-medium"
            >
              Contact Support
            </button>
          </p>
        </div>
      </div>
    </div>
  );
};
