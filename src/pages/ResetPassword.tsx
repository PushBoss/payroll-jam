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
        console.error('❌ Supabase not initialized');
        setIsCheckingSession(false);
        toast.error('System error. Please try again.');
        return;
      }
      
      try {
        console.log('🔍 Checking password reset session...');
        console.log('Current URL:', window.location.href);
        console.log('Hash:', window.location.hash);
        
        // First, check if there's a hash fragment with tokens (from email link)
        const hashParams = new URLSearchParams(window.location.hash.substring(1));
        const accessToken = hashParams.get('access_token');
        const refreshToken = hashParams.get('refresh_token');
        const type = hashParams.get('type');
        const error = hashParams.get('error');
        const errorDescription = hashParams.get('error_description');

        console.log('Hash params:', { 
          hasAccessToken: !!accessToken, 
          hasRefreshToken: !!refreshToken,
          type, 
          error,
          errorDescription 
        });

        // Check for errors in the URL
        if (error) {
          console.error('❌ Error in URL:', error, errorDescription);
          toast.error(errorDescription || 'Invalid or expired reset link. Please request a new one.');
          setTimeout(() => {
            window.location.href = '/?page=login';
          }, 3000);
          setIsCheckingSession(false);
          return;
        }

        // If we have tokens, manually set the session
        if (accessToken && type === 'recovery') {
          console.log('✅ Found recovery tokens, setting session...');
          
          const { data, error: sessionError } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken || ''
          });

          if (sessionError) {
            console.error('❌ Error setting session:', sessionError);
            throw sessionError;
          }

          console.log('✅ Session set successfully:', data);
          
          // Wait a moment for session to be fully processed
          await new Promise(resolve => setTimeout(resolve, 500));
        }

        // Now check if we have a valid session
        const { data: { session }, error: getSessionError } = await supabase.auth.getSession();
        
        console.log('Session check result:', { hasSession: !!session, error: getSessionError });
        
        if (getSessionError) {
          console.error('❌ Error getting session:', getSessionError);
          throw getSessionError;
        }
        
        if (!session) {
          console.error('❌ No valid session found');
          toast.error('Invalid or expired reset link. Please request a new one.', {
            duration: 5000
          });
          setTimeout(() => {
            window.location.href = '/?page=login';
          }, 3000);
        } else {
          console.log('✅ Valid session found');
          setIsValidSession(true);
        }
      } catch (err: any) {
        console.error('❌ Session check error:', err);
        toast.error(err.message || 'Error verifying reset link. Please request a new one.');
        setTimeout(() => {
          window.location.href = '/?page=login';
        }, 3000);
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

      toast.success('Password updated successfully! Redirecting to login...', {
        duration: 2000,
      });
      
      // Sign out to clear session
      await supabase.auth.signOut();
      
      // Redirect to login page
      setTimeout(() => {
        window.location.href = '/?page=login';
      }, 1500);
      
      // Note: Keep isLoading true to prevent double submission
    } catch (error: any) {
      console.error('Password reset failed:', error);
      toast.error(error.message || 'Failed to reset password');
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
                  autoComplete="new-password"
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
                  autoComplete="new-password"
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
