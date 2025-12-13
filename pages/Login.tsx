
import React, { useState } from 'react';
import { User } from '../types';
import { Icons } from '../components/Icons';
import { supabaseService } from '../services/supabaseService';
import { useAuth } from '../context/AuthContext';
import { toast } from 'sonner';
import { supabase } from '../services/supabaseClient';
import { storage } from '../services/storage';

interface LoginProps {
  onLogin?: (user: User) => void;
  onLoginSuccess?: (user: User) => void;
  onBack: () => void;
  onRegisterClick: () => void;
}

export const Login: React.FC<LoginProps> = ({ onLoginSuccess, onBack, onRegisterClick }) => {
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [resetEmail, setResetEmail] = useState('');
  const [isResetting, setIsResetting] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      await login(email, password);
      
      // Get user from storage (already set by login function)
      const user = storage.getUser();
      
      // Check if user's company has pending payment
      if (user?.companyId) {
        const company = await supabaseService.getCompanyById(user.companyId);
        if (company?.subscriptionStatus === 'PENDING_PAYMENT') {
          toast.error('Your account is pending payment verification. You will be able to login once your payment is confirmed.', {
            duration: 8000,
          });
          await supabase?.auth.signOut();
          setIsLoading(false);
          return;
        }
      }
      
      toast.success('Welcome back!');
      
      // Set loading to false BEFORE navigation
      setIsLoading(false);
      
      if (user && onLoginSuccess) {
        onLoginSuccess(user);
      }
    } catch (error: any) {
      console.error('Login failed:', error);
      console.log('Error message:', error.message);
      console.log('Error code:', error.code);
      console.log('Error status:', error.status);
      
      // Provide specific error messages based on error type
      if (error.message?.toLowerCase().includes('profile not found') || 
          error.message?.toLowerCase().includes('user not found')) {
        toast.error('Account setup incomplete. Please check your email to verify your account, or contact support if the issue persists.', {
          duration: 8000,
        });
      } else if (error.message?.toLowerCase().includes('invalid') || 
          error.message?.toLowerCase().includes('credentials') ||
          error.message?.toLowerCase().includes('password') ||
          error.status === 400) {
        toast.error('Wrong password or email. Please try again.', {
          duration: 5000,
        });
      } else if (error.message?.toLowerCase().includes('email not confirmed') || 
                 error.message?.toLowerCase().includes('not confirmed')) {
        toast.error('Please verify your email before logging in. Check your inbox for the confirmation link.', {
          duration: 8000,
        });
      } else {
        toast.error(error.message || 'Login failed. Please try again.', {
          duration: 5000,
        });
      }
      
      setIsLoading(false);
    }
  };

  const handlePasswordReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsResetting(true);

    try {
      if (!supabase) {
        throw new Error('Supabase not initialized');
      }

      console.log('🔄 Requesting password reset for:', resetEmail);
      
      // Use the full URL with hash for better compatibility
      const redirectUrl = `${window.location.origin}/?page=reset-password`;
      console.log('Redirect URL:', redirectUrl);
      
      const { data, error } = await supabase.auth.resetPasswordForEmail(resetEmail, {
        redirectTo: redirectUrl,
      });

      console.log('📧 Password reset response:', { data, error });

      if (error) throw error;

      toast.success('Password reset email sent! Please check your email (including spam folder).', {
        duration: 8000,
      });
      setShowForgotPassword(false);
      setResetEmail('');
    } catch (error: any) {
      console.error('❌ Password reset failed:', error);
      toast.error(error.message || 'Failed to send reset email. Please try again.', {
        duration: 5000,
      });
    } finally {
      setIsResetting(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4 py-12 sm:px-6 lg:px-8 relative">
      <button 
        onClick={onBack}
        className="absolute top-8 left-8 flex items-center text-gray-500 hover:text-jam-black transition-colors"
      >
        <Icons.Back className="w-5 h-5 mr-2" />
        Back to Home
      </button>

      <div className="w-full max-w-md space-y-8 bg-white p-10 rounded-2xl shadow-xl border border-gray-100">
        <div className="text-center">
          <h1 className="text-4xl font-extrabold text-jam-black">
            Payroll<span className="text-jam-orange">-Jam</span>
          </h1>
          <h2 className="mt-4 text-xl font-medium text-gray-900">
            {showForgotPassword ? 'Reset Password' : 'Sign in to your account'}
          </h2>
          <p className="mt-2 text-sm text-gray-600">
            {showForgotPassword ? 'Enter your email to receive a reset link' : 'Manage your Jamaican workforce with ease'}
          </p>
        </div>

        {!showForgotPassword ? (
          <form className="mt-8 space-y-6" onSubmit={handleLogin}>
            <div className="space-y-4">
              <div>
                <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
                  Email address
                </label>
                <input
                  id="email"
                  name="email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="block w-full rounded-lg border border-gray-300 px-4 py-3 text-gray-900 placeholder-gray-500 focus:border-jam-orange focus:outline-none focus:ring-1 focus:ring-jam-orange sm:text-sm"
                  placeholder="you@company.com"
                />
              </div>
              
              <div>
                <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">
                  Password
                </label>
                <div className="relative">
                  <input
                    id="password"
                    name="password"
                    type={showPassword ? 'text' : 'password'}
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="block w-full rounded-lg border border-gray-300 px-4 py-3 pr-12 text-gray-900 placeholder-gray-500 focus:border-jam-orange focus:outline-none focus:ring-1 focus:ring-jam-orange sm:text-sm"
                    placeholder="••••••••"
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
            </div>

            <div className="flex items-center justify-between">
              <div className="text-sm">
                <button
                  type="button"
                  onClick={() => setShowForgotPassword(true)}
                  className="font-medium text-jam-orange hover:text-yellow-600"
                >
                  Forgot your password?
                </button>
              </div>
            </div>

            <div>
              <button
                type="submit"
                disabled={isLoading}
                className="group relative flex w-full justify-center rounded-lg bg-jam-black px-4 py-3 text-sm font-semibold text-white hover:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-jam-orange focus:ring-offset-2 disabled:opacity-50 transition-all"
              >
                {isLoading ? (
                  <span className="flex items-center">
                    <Icons.Refresh className="w-4 h-4 mr-2 animate-spin" /> Signing in...
                  </span>
                ) : (
                  'Sign in'
                )}
              </button>
            </div>

            <div className="mt-6 text-center">
              <button
                type="button"
                onClick={onRegisterClick}
                className="text-sm font-medium text-jam-orange hover:text-yellow-600"
              >
                Don't have an account? Sign up
              </button>
            </div>
          </form>
        ) : (
          <form className="mt-8 space-y-6" onSubmit={handlePasswordReset}>
            <div>
              <label htmlFor="reset-email" className="block text-sm font-medium text-gray-700 mb-1">
                Email address
              </label>
              <input
                id="reset-email"
                name="email"
                type="email"
                required
                value={resetEmail}
                onChange={(e) => setResetEmail(e.target.value)}
                className="block w-full rounded-lg border border-gray-300 px-4 py-3 text-gray-900 placeholder-gray-500 focus:border-jam-orange focus:outline-none focus:ring-1 focus:ring-jam-orange sm:text-sm"
                placeholder="you@company.com"
              />
            </div>

            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setShowForgotPassword(false)}
                className="flex-1 rounded-lg border border-gray-300 px-4 py-3 text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-all"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isResetting}
                className="flex-1 rounded-lg bg-jam-black px-4 py-3 text-sm font-semibold text-white hover:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-jam-orange focus:ring-offset-2 disabled:opacity-50 transition-all"
              >
                {isResetting ? (
                  <span className="flex items-center justify-center">
                    <Icons.Refresh className="w-4 h-4 mr-2 animate-spin" /> Sending...
                  </span>
                ) : (
                  'Send Reset Link'
                )}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
