# Pricing Plans - Backend Storage Only

## 🎯 Overview
Pricing plans are now stored **ONLY in the Supabase backend**, not in localStorage. This ensures consistency across all sessions and devices.

## 📊 Database Structure

### Companies Table
```sql
CREATE TABLE companies (
  id UUID PRIMARY KEY,
  name TEXT NOT NULL,
  plan TEXT DEFAULT 'Free',
  settings JSONB DEFAULT '{}'::JSONB,  -- ✅ Plans stored here
  ...
);
```

### Settings JSONB Structure
```json
{
  "globalConfig": {
    "pricingPlans": [
      {
        "id": "p1",
        "name": "Free",
        "priceConfig": {
          "type": "free",
          "monthly": 0,
          "annual": 0
        },
        "description": "For small businesses (<5 emp)",
        "limit": "5",
        "features": ["Basic Payroll", "Payslip PDF"],
        "isActive": true,
        ...
      }
    ],
    ...other global config...
  }
}
```

## 🔄 How It Works

### On App Load (App.tsx)
```typescript
// ✅ Loads from Supabase backend
useEffect(() => {
  async function loadPlansFromBackend() {
    const globalConfig = await supabaseService.getGlobalConfig();
    
    if (globalConfig?.pricingPlans) {
      setPlans(globalConfig.pricingPlans);
    } else {
      // Initialize with default plans
      setPlans(INITIAL_PLANS);
      await updateGlobalConfig({ pricingPlans: INITIAL_PLANS });
    }
  }
  loadPlansFromBackend();
}, [isSupabaseMode]);
```

### On Save (SuperAdmin → handleUpdatePlans)
```typescript
// ✅ Saves to Supabase backend only
const handleUpdatePlans = async (updatedPlans: PricingPlan[]) => {
  setPlans(updatedPlans);
  await updateGlobalConfig({ pricingPlans: updatedPlans });
  // ✅ No localStorage.setItem() for plans
};
```

### updateGlobalConfig Service
```typescript
export async function updateGlobalConfig(partial: Partial<GlobalConfig>) {
  // ✅ Get current from Supabase
  const current = await supabaseService.getGlobalConfig() || {};
  const updated = { ...current, ...partial };
  
  // ✅ Save to Supabase only
  const success = await supabaseService.saveGlobalConfig(updated);
  return updated;
}
```

## ✅ What Changed

### Before (❌ localStorage)
1. Plans loaded from `localStorage.getItem('payroll_jam_pricing_plans')`
2. Plans saved to `localStorage` on every change
3. Backend out of sync with localStorage
4. Changes not persistent across sessions/devices

### After (✅ Backend only)
1. Plans loaded from `companies.settings.globalConfig.pricingPlans`
2. Plans saved to Supabase backend only
3. Single source of truth (backend)
4. Changes persistent and consistent everywhere

## 🧪 How to Verify

### 1. Check Console Logs
When you refresh the page, you should see:
```
✅ Loaded pricing plans from Supabase backend: 4
```

### 2. Edit a Plan in SuperAdmin
When you save a plan, you should see:
```
✅ Global config (including pricing plans) updated in Supabase backend
✅ Plans saved to backend only
```

### 3. Verify in Supabase Dashboard
Go to: **Supabase Dashboard → Table Editor → companies → settings column**

You should see:
```json
{
  "globalConfig": {
    "pricingPlans": [...]
  }
}
```

### 4. Test Persistence
1. Edit a plan in SuperAdmin (change name/price)
2. Close browser tab completely
3. Open new tab and login
4. ✅ Changes should be there (loaded from backend)

### 5. Clear localStorage Test
```javascript
// In browser console
localStorage.clear();
location.reload();
// ✅ Plans should still load from backend
```

## 📝 Files Modified

### `/Users/aarongardiner/Desktop/payroll-jam/App.tsx`
- ✅ Changed `loadPlans()` to `loadPlansFromBackend()` using async Supabase call
- ✅ Removed `storage.getPricingPlans()` and localStorage loading
- ✅ Removed `useEffect(() => storage.savePricingPlans(plans), [plans])`
- ✅ Updated `handleUpdatePlans()` to save to backend only

### `/Users/aarongardiner/Desktop/payroll-jam/services/updateGlobalConfig.ts`
- ✅ Removed all localStorage operations
- ✅ Now loads current config from `supabaseService.getGlobalConfig()`
- ✅ Saves to `supabaseService.saveGlobalConfig()` only
- ✅ Throws error if save fails (no silent fallback to localStorage)

## 🚨 Important Notes

1. **Supabase Mode Required**: Plans only load from backend when `isSupabaseMode = true`
2. **Initial Plans**: If no plans in backend, app will save `INITIAL_PLANS` on first load
3. **No localStorage**: Plans are NOT saved to localStorage anymore
4. **Atomic Updates**: All companies get the same global config (plans are global, not per-company)

## 🐛 Troubleshooting

### Plans Not Loading
**Check:**
1. Is Supabase configured? (`VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` set)
2. Check console for errors: `❌ Failed to load plans from backend`
3. Verify user has `company_id` (plans require company context)

### Plans Not Saving
**Check:**
1. Console shows: `✅ Global config updated in Supabase backend`
2. If error: Check Supabase RLS policies on `companies` table
3. Verify user has permission to update companies

### Plans Reset to Initial
**Possible causes:**
1. `getGlobalConfig()` returned `null` or empty
2. Backend doesn't have `settings.globalConfig.pricingPlans`
3. Solution: Edit and save a plan in SuperAdmin to initialize

## 📊 Console Log Guide

### Success Logs ✅
```
✅ Loaded pricing plans from Supabase backend: 4
✅ Global config (including pricing plans) updated in Supabase backend
✅ Plans saved to backend only
✅ Global config saved to Supabase
```

### Warning Logs ⚠️
```
⚠️ No plans in backend, using INITIAL_PLANS
```
→ Backend will be initialized with INITIAL_PLANS

### Error Logs ❌
```
❌ Failed to load plans from backend, using INITIAL_PLANS
❌ Failed to update plans in backend
❌ Global config update failed in Supabase
```
→ Check Supabase connection and permissions

## 🎉 Benefits

1. **Single Source of Truth**: Backend is authoritative
2. **Consistency**: Same plans across all sessions/devices
3. **Audit Trail**: Changes tracked in database
4. **Multi-user Safe**: No race conditions from localStorage
5. **Easy Rollback**: Database backups restore pricing
6. **Real-time Sync**: Changes visible to all users immediately

---

**Updated:** 2024
**Status:** ✅ Active - Plans now load from backend only
