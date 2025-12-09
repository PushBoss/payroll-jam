import React, { useState, useEffect } from 'react';
import { Icons } from '../components/Icons';
import { supabase } from '../services/supabaseClient';
import { toast } from 'sonner';

export const ResetPassword: React.FC = () => {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isValidSession, setIsValidSession] = useState(false);
  const [isCheckingSession, setIsCheckingSession] = useState(true);

  useEffect(() => {
    // Check if user came from a valid password reset link
    const checkSession = async () => {
      if (!supabase) {
        setIsCheckingSession(false);
        return;
      }
      
      try {
        // First, check if there's a hash fragment with tokens (from email link)
        const hashParams = new URLSearchParams(window.location.hash.substring(1));
        const accessToken = hashParams.get('access_token');
        const type = hashParams.get('type');

        if (accessToken && type === 'recovery') {
          // Session will be automatically set by Supabase
          // Wait a moment for it to process
          await new Promise(resolve => setTimeout(resolve, 1000));
        }

        const { data: { session }, error } = await supabase.auth.getSession();
        
        if (error || !session) {
          toast.error('Invalid or expired reset link. Please request a new one.');
          setTimeout(() => {
            window.location.href = '/?page=login';
          }, 2000);
        } else {
          setIsValidSession(true);
        }
      } catch (err) {
        console.error('Session check error:', err);
        toast.error('Error verifying reset link');
      } finally {
        setIsCheckingSession(false);
      }
    };
    
    checkSession();
  }, []);

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();

    if (password.length < 6) {
      toast.error('Password must be at least 6 characters');
      return;
    }

    if (password !== confirmPassword) {
      toast.error('Passwords do not match');
      return;
    }

    setIsLoading(true);

    try {
      if (!supabase) {
        throw new Error('Supabase not initialized');
      }

      const { error } = await supabase.auth.updateUser({
        password: password
      });

      if (error) throw error;

      toast.success('Password updated successfully! Redirecting to login...');
      
      // Sign out and redirect to login
      await supabase.auth.signOut();
      setTimeout(() => {
        window.location.href = '/?page=login';
      }, 2000);
    } catch (error: any) {
      console.error('Password reset failed:', error);
      toast.error(error.message || 'Failed to reset password');
    } finally {
      setIsLoading(false);
    }
  };

  if (isCheckingSession) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <div className="text-center">
          <Icons.Refresh className="w-8 h-8 animate-spin mx-auto text-jam-orange" />
          <p className="mt-4 text-gray-600">Verifying reset link...</p>
        </div>
      </div>
    );
  }

  if (!isValidSession) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <div className="text-center">
          <Icons.Refresh className="w-8 h-8 animate-spin mx-auto text-jam-orange" />
          <p className="mt-4 text-gray-600">Verifying reset link...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4 py-12 sm:px-6 lg:px-8">
      <div className="w-full max-w-md space-y-8 bg-white p-10 rounded-2xl shadow-xl border border-gray-100">
        <div className="text-center">
          <h1 className="text-4xl font-extrabold text-jam-black">
            Payroll<span className="text-jam-orange">-Jam</span>
          </h1>
          <h2 className="mt-4 text-xl font-medium text-gray-900">
            Set New Password
          </h2>
          <p className="mt-2 text-sm text-gray-600">
            Enter your new password below
          </p>
        </div>

        <form className="mt-8 space-y-6" onSubmit={handleResetPassword}>
          <div className="space-y-4">
            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">
                New Password
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
                  minLength={6}
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

            <div>
              <label htmlFor="confirm-password" className="block text-sm font-medium text-gray-700 mb-1">
                Confirm New Password
              </label>
              <div className="relative">
                <input
                  id="confirm-password"
                  name="confirm-password"
                  type={showConfirmPassword ? 'text' : 'password'}
                  required
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="block w-full rounded-lg border border-gray-300 px-4 py-3 pr-12 text-gray-900 placeholder-gray-500 focus:border-jam-orange focus:outline-none focus:ring-1 focus:ring-jam-orange sm:text-sm"
                  placeholder="••••••••"
                  minLength={6}
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  {showConfirmPassword ? (
                    <Icons.EyeOff className="w-5 h-5" />
                  ) : (
                    <Icons.Eye className="w-5 h-5" />
                  )}
                </button>
              </div>
            </div>
          </div>

          {password && confirmPassword && password !== confirmPassword && (
            <p className="text-sm text-red-600">Passwords do not match</p>
          )}

          <div>
            <button
              type="submit"
              disabled={isLoading || password !== confirmPassword}
              className="group relative flex w-full justify-center rounded-lg bg-jam-black px-4 py-3 text-sm font-semibold text-white hover:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-jam-orange focus:ring-offset-2 disabled:opacity-50 transition-all"
            >
              {isLoading ? (
                <span className="flex items-center">
                  <Icons.Refresh className="w-4 h-4 mr-2 animate-spin" /> Updating Password...
                </span>
              ) : (
                'Update Password'
              )}
            </button>
          </div>

          <div className="mt-6 text-center">
            <a
              href="/?page=login"
              className="text-sm font-medium text-jam-orange hover:text-yellow-600"
            >
              Back to Login
            </a>
          </div>
        </form>
      </div>
    </div>
  );
};
