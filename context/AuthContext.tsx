
import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { User, Role, ResellerClient } from '../types';
import { storage } from '../services/storage';
import { supabaseService } from '../services/supabaseService';
import { supabase } from '../services/supabaseClient';

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  signup: (user: User & { password: string; companyName?: string; plan?: string }) => Promise<void>;
  logout: () => Promise<void>;
  updateUser: (updates: Partial<User>) => void;
  impersonate: (client: ResellerClient) => void;
  stopImpersonation: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Check for existing Supabase session
    const initAuth = async () => {
      if (!supabase) {
        // Fallback to localStorage if Supabase not available
        const storedUser = storage.getUser();
        if (storedUser) {
          setUser(storedUser);
        }
        setIsLoading(false);
        return;
      }

      const { data: { session } } = await supabase.auth.getSession();
      
      if (session?.user) {
        // Load user profile from app_users table
        const appUser = await supabaseService.getUserByEmail(session.user.email!);
        if (appUser) {
          setUser(appUser);
          storage.saveUser(appUser);
        }
      } else {
        // Fallback to localStorage
        const storedUser = storage.getUser();
        if (storedUser) {
          setUser(storedUser);
        }
      }
      
      setIsLoading(false);
    };

    initAuth();

    // Listen for auth changes
    if (supabase) {
      const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
        if (session?.user) {
          const appUser = await supabaseService.getUserByEmail(session.user.email!);
          if (appUser) {
            setUser(appUser);
            storage.saveUser(appUser);
          }
        } else {
          setUser(null);
          storage.saveUser(null);
        }
      });

      return () => subscription.unsubscribe();
    }
  }, []);

  const login = async (email: string, password: string) => {
    if (!supabase) {
      throw new Error('Supabase not initialized');
    }

    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      console.error('Login error:', error);
      throw error;
    }

    if (data.user) {
      const appUser = await supabaseService.getUserByEmail(data.user.email!);
      if (appUser) {
        setUser(appUser);
        storage.saveUser(appUser);
      }
    }
  };

  const signup = async (userData: User & { password: string; companyName?: string; plan?: string }) => {
    if (!supabase) {
      throw new Error('Supabase not initialized');
    }

    try {
      // 1. Create auth user in Supabase Auth
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: userData.email,
        password: userData.password,
      });

      if (authError) {
        console.error('❌ Auth signup error:', authError);
        throw authError;
      }

      if (!authData.user) {
        throw new Error('No user returned from signup');
      }

      console.log('✅ Supabase Auth user created:', authData.user.id);

      // 2. Create company record first (if needed)
      if (userData.companyName && userData.companyId) {
        const isPaidPlan = userData.plan && userData.plan !== 'Free';
        const companyData = {
          name: userData.companyName,
          trn: '',
          address: '',
          phone: '',
          bankName: '',
          accountNumber: '',
          branchCode: '',
          payFrequency: 'Monthly',
          subscriptionStatus: (isPaidPlan && (userData as any).paymentMethod === 'direct-deposit' ? 'PENDING_PAYMENT' : 'ACTIVE') as 'ACTIVE' | 'PAST_DUE' | 'SUSPENDED' | 'PENDING_PAYMENT',
          plan: userData.plan || 'Free',
          paymentMethod: (userData as any).paymentMethod || 'card'
        };
        
        await supabaseService.saveCompany(userData.companyId, companyData);
        console.log('✅ Company saved to Supabase:', userData.companyName);
      }

      // 3. Create app_users profile (linked to auth user)
      const appUser: User = {
        id: authData.user.id, // Use Supabase Auth user ID
        email: userData.email,
        name: userData.name,
        role: userData.role,
        companyId: userData.companyId,
        isOnboarded: userData.isOnboarded || false
      };

      await supabaseService.saveUser(appUser);
      console.log('✅ User profile saved:', appUser.email);

      // 4. Update local state
      setUser(appUser);
      storage.saveUser(appUser);

    } catch (error) {
      console.error('❌ Signup failed:', error);
      throw error;
    }
  };

  const logout = async () => {
    if (supabase) {
      await supabase.auth.signOut();
    }
    setUser(null);
    storage.saveUser(null);
  };

  const updateUser = (updates: Partial<User>) => {
    if (!user) return;
    const updatedUser = { ...user, ...updates };
    setUser(updatedUser);
    storage.saveUser(updatedUser);
    // Attempt background sync
    supabaseService.saveUser(updatedUser).catch(err => console.warn("Auth update sync failed", err));
  };

  const impersonate = (client: ResellerClient) => {
    if (!user) return;
    const originalRole = user.originalRole || user.role;
    const impersonatedUser = {
        ...user,
        originalRole: originalRole,
        companyId: client.id,
        role: Role.ADMIN
    };
    setUser(impersonatedUser);
    storage.saveUser(impersonatedUser);
  };

  const stopImpersonation = () => {
      if (!user || !user.originalRole) return;
      const restoredUser = {
          ...user,
          role: user.originalRole,
          originalRole: undefined,
          companyId: undefined // Clear context
      };
      setUser(restoredUser);
      storage.saveUser(restoredUser);
  };

  return (
    <AuthContext.Provider value={{ user, isLoading, login, signup, logout, updateUser, impersonate, stopImpersonation }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
