
import React, { useState } from 'react';
import { Role, User } from '../types';
import { Icons } from '../components/Icons';
import { supabaseService } from '../services/supabaseService';
import { useAuth } from '../context/AuthContext';
import { toast } from 'sonner';

interface LoginProps {
  onLogin?: (user: User) => void; // Optional now, managed by context
  onLoginSuccess?: (user: User) => void; // Navigation callback
  onBack: () => void;
  onRegisterClick: () => void;
}

export const Login: React.FC<LoginProps> = ({ onLoginSuccess, onBack, onRegisterClick }) => {
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      // Use Supabase Auth login
      await login(email, password);
      toast.success(`Welcome back!`);
      
      // Call success callback if provided
      const user = await supabaseService.getUserByEmail(email);
      if (user && onLoginSuccess) {
        onLoginSuccess(user);
      }
      
      setIsLoading(false);
    } catch (error: any) {
      console.error('Login failed:', error);
      
      // Check for specific demo accounts as fallback (for testing)
      if (['admin@jam.com', 'super@jam.com', 'reseller@jam.com', 'emp@jam.com', 'lightning@track.jm'].includes(email)) {
        const demoUser = getDemoUser(email);
        if (demoUser) {
          performDemoLogin(demoUser);
          setIsLoading(false);
          return;
        }
      }
      
      toast.error(error.message || 'Invalid email or password');
      setIsLoading(false);
    }
  };

  const getDemoUser = (email: string): User | null => {
    if (email === 'super@jam.com') {
      return { id: 'u-super', name: 'System Operator', email, role: Role.SUPER_ADMIN, isOnboarded: true };
    } else if (email === 'admin@jam.com') {
      return { id: 'u1', name: 'John Doe', email, role: Role.ADMIN, isOnboarded: true };
    } else if (email === 'reseller@jam.com') {
      return { id: 'u4', name: 'Partner Agent', email, role: Role.RESELLER, isOnboarded: true };
    } else if (email === 'lightning@track.jm') {
      return { id: 'u2', name: 'Usain Bolt', email, role: Role.EMPLOYEE, isOnboarded: true };
    }
    return null;
  };

  const performDemoLogin = (user: User) => {
    // For demo users, we can't use real auth, just set state
    // This is a fallback for testing only
    toast.warning(`Demo mode: ${user.name}`);
    if (onLoginSuccess) onLoginSuccess(user);
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
          <h2 className="mt-4 text-xl font-medium text-gray-900">Sign in to your account</h2>
          <p className="mt-2 text-sm text-gray-600">
            Manage your Jamaican workforce with ease
          </p>
        </div>

        <form className="mt-8 space-y-6" onSubmit={handleLogin}>
          <div className="-space-y-px rounded-md shadow-sm">
            <div className="mb-4">
              <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">Email address</label>
              <input
                id="email"
                name="email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="relative block w-full rounded-lg border border-gray-300 px-4 py-3 text-gray-900 placeholder-gray-500 focus:z-10 focus:border-jam-orange focus:outline-none focus:ring-1 focus:ring-jam-orange sm:text-sm"
                placeholder="admin@jam.com"
              />
            </div>
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">Password</label>
              <input
                id="password"
                name="password"
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="relative block w-full rounded-lg border border-gray-300 px-4 py-3 text-gray-900 placeholder-gray-500 focus:z-10 focus:border-jam-orange focus:outline-none focus:ring-1 focus:ring-jam-orange sm:text-sm"
                placeholder="••••••••"
              />
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
                  <Icons.Refresh className="w-4 h-4 mr-2 animate-spin"/> Checking...
                </span>
              ) : 'Sign in'}
            </button>
          </div>

          <div className="mt-6">
            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-gray-200" />
              </div>
              <div className="relative flex justify-center text-sm">
                <span className="bg-white px-2 text-gray-500">Or try a demo account</span>
              </div>
            </div>
            <div className="mt-6 grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => { setEmail('admin@jam.com'); }}
                className="inline-flex justify-center rounded-md border border-gray-300 bg-white px-4 py-2 text-xs font-medium text-gray-500 shadow-sm hover:bg-gray-50"
              >
                Admin
              </button>
              <button
                type="button"
                onClick={() => { setEmail('reseller@jam.com'); }}
                className="inline-flex justify-center rounded-md border border-gray-300 bg-white px-4 py-2 text-xs font-medium text-gray-500 shadow-sm hover:bg-gray-50"
              >
                Reseller
              </button>
              <button
                type="button"
                onClick={() => { setEmail('emp@jam.com'); }}
                className="inline-flex justify-center rounded-md border border-gray-300 bg-white px-4 py-2 text-xs font-medium text-gray-500 shadow-sm hover:bg-gray-50"
              >
                Employee
              </button>
               <button
                type="button"
                onClick={() => { setEmail('super@jam.com'); }}
                className="inline-flex justify-center rounded-md border border-gray-300 bg-white px-4 py-2 text-xs font-medium text-purple-600 shadow-sm hover:bg-gray-50"
              >
                Super Admin
              </button>
            </div>
             <div className="mt-4 text-center">
                 <button
                    type="button"
                    onClick={onRegisterClick}
                    className="text-sm font-medium text-jam-orange hover:text-yellow-600"
                >
                    Don't have an account? Sign up
                </button>
             </div>
          </div>
        </form>
      </div>
    </div>
  );
};
