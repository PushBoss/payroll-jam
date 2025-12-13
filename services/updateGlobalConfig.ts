// Update global config for Supabase backend ONLY (no localStorage for plans)
import { GlobalConfig } from '../types';
import { supabaseService } from './supabaseService';

export async function updateGlobalConfig(partial: Partial<GlobalConfig & { pricingPlans?: any }>) {
  // Get current config from Supabase
  const current = await supabaseService.getGlobalConfig() || {} as GlobalConfig;
  const updated = { ...current, ...partial };
  
  // Save to Supabase backend ONLY
  try {
    const success = await supabaseService.saveGlobalConfig(updated);
    if (success) {
      console.log('✅ Global config (including pricing plans) updated in Supabase backend');
      return updated;
    } else {
      console.error('❌ Global config update failed in Supabase');
      throw new Error('Failed to save global config to backend');
    }
  } catch (error) {
    console.error('❌ Failed to update global config in Supabase:', error);
    throw error;
  }
}
