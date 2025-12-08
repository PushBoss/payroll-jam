
import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { User, Role, ResellerClient } from '../types';
import { storage } from '../services/storage';
import { supabaseService } from '../services/supabaseService';

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  login: (user: User) => void;
  signup: (user: User) => Promise<void>;
  logout: () => void;
  updateUser: (updates: Partial<User>) => void;
  impersonate: (client: ResellerClient) => void;
  stopImpersonation: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Initialize from storage on mount
    const storedUser = storage.getUser();
    if (storedUser) {
      setUser(storedUser);
    }
    setIsLoading(false);
  }, []);

  const login = (userData: User) => {
    setUser(userData);
    storage.saveUser(userData);
  };

  const signup = async (userData: User) => {
    setUser(userData);
    storage.saveUser(userData);
    // Persist to Supabase immediately
    try {
      await supabaseService.saveUser(userData);
    } catch (error) {
      console.error("AuthContext: Failed to persist signup to DB", error);
    }
  };

  const logout = () => {
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
