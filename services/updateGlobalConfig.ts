// Update global config for Supabase/global config update
import { GlobalConfig } from '../types';
import { storage } from './storage';
import { supabaseService } from './supabaseService';

export async function updateGlobalConfig(partial: Partial<GlobalConfig & { pricingPlans?: any }>) {
  // Update localStorage first
  const current = storage.getGlobalConfig() || {} as GlobalConfig;
  const updated = { ...current, ...partial };
  
  // Save to localStorage
  localStorage.setItem('payroll_jam_global_config', JSON.stringify(updated));
  
  // Save pricing plans specifically to localStorage if provided
  if (partial.pricingPlans) {
    storage.savePricingPlans(partial.pricingPlans);
  }
  
  // Save to Supabase global config
  try {
    const success = await supabaseService.saveGlobalConfig(updated);
    if (success) {
      console.log('✅ Global config updated in Supabase');
    } else {
      console.warn('⚠️ Global config saved to localStorage only (Supabase update failed)');
    }
  } catch (error) {
    console.error('❌ Failed to update global config in Supabase:', error);
    // Don't throw - localStorage update already succeeded
  }
  
  return updated;
}
