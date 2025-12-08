
import React, { useState } from 'react';
import { User } from '../types';
import { Icons } from '../components/Icons';
import { supabaseService } from '../services/supabaseService';
import { useAuth } from '../context/AuthContext';
import { toast } from 'sonner';
import { supabase } from '../services/supabaseClient';

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
      toast.success('Welcome back!');
      
      const user = await supabaseService.getUserByEmail(email);
      if (user && onLoginSuccess) {
        onLoginSuccess(user);
      }
      
      setIsLoading(false);
    } catch (error: any) {
      console.error('Login failed:', error);
      toast.error(error.message || 'Invalid email or password');
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

      const { error } = await supabase.auth.resetPasswordForEmail(resetEmail, {
        redirectTo: `${window.location.origin}/reset-password`,
      });

      if (error) throw error;

      toast.success('Password reset email sent! Check your inbox.');
      setShowForgotPassword(false);
      setResetEmail('');
    } catch (error: any) {
      console.error('Password reset failed:', error);
      toast.error(error.message || 'Failed to send reset email');
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
