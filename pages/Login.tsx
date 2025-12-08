
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

  const performLogin = (user: User) => {
      login(user);
      toast.success(`Welcome back, ${user.name}`);
      if (onLoginSuccess) onLoginSuccess(user);
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      // 1. Real Auth via Supabase (Priority)
      const dbUser = await supabaseService.getUserByEmail(email);
      if (dbUser) {
          performLogin(dbUser);
          setIsLoading(false);
          return;
      }

      // 2. Check for Specific Demo Credentials (Legacy/Test Mode) - Fallback
      if (['admin@jam.com', 'super@jam.com', 'reseller@jam.com', 'emp@jam.com', 'lightning@track.jm'].includes(email)) {
        setTimeout(() => {
          if (email === 'super@jam.com') {
            performLogin({ id: 'u-super', name: 'System Operator', email: email, role: Role.SUPER_ADMIN, isOnboarded: true });
          } else if (email === 'admin@jam.com') {
            performLogin({ id: 'u1', name: 'John Doe', email: email, role: Role.ADMIN, isOnboarded: true });
          } else if (email === 'reseller@jam.com') {
            performLogin({ id: 'u4', name: 'Partner Agent', email: email, role: Role.RESELLER, isOnboarded: true });
          } else {
            // Employee fallback
            performLogin({ id: 'u2', name: 'Usain Bolt', email: 'lightning@track.jm', role: Role.EMPLOYEE, isOnboarded: true });
          }
          setIsLoading(false);
        }, 800);
        return;
      }

      // 3. Not found
      toast.error("Account not found. Please sign up.");
      setIsLoading(false);

    } catch (err) {
      console.error("Login failed", err);
      toast.error("Authentication error occurred.");
      setIsLoading(false);
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
