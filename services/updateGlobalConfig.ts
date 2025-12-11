// Patch for storage: add updateGlobalConfig for Supabase/global config update
import { GlobalConfig } from '../types';

export async function updateGlobalConfig(partial: Partial<GlobalConfig & { pricingPlans?: any }>) {
  // This is a stub. Replace with actual Supabase/global config update logic as needed.
  // For now, just update localStorage global config.
  const current = JSON.parse(localStorage.getItem('payroll_jam_global_config') || '{}');
  const updated = { ...current, ...partial };
  localStorage.setItem('payroll_jam_global_config', JSON.stringify(updated));
  return updated;
}
