# Payroll Jam - Testing Checklist & Deployment Guide

## Pre-Deployment Testing Checklist

### ✅ Code Quality
- [x] No linter errors
- [x] TypeScript compilation successful
- [x] All imports resolved

### 🔐 Payment Integration (DimePay)

#### Sandbox Testing
- [ ] Test payment widget loads correctly
- [ ] Test successful payment flow
- [ ] Test payment failure handling
- [ ] Verify payment records are saved to Supabase
- [ ] Test subscription creation after payment

#### Production Readiness
- [ ] Verify production DimePay credentials are set in environment variables:
  - `DIMEPAY_SECRET_KEY_PROD` (production secret key)
  - `DIMEPAY_SECRET_KEY_SANDBOX` (sandbox secret key - for testing)
- [ ] Test backend API endpoint `/api/sign-payment` is accessible
- [ ] Verify CORS is configured correctly for production domain
- [ ] Test that production mode requires backend signing (no client-side fallback)

### 🗄️ Database & Supabase
- [ ] Verify Supabase connection is working
- [ ] Test data persistence (companies, employees, pay runs)
- [ ] Verify payment gateway settings are saved to Supabase
- [ ] Test user management and limits
- [ ] Verify compliance audit data is accurate

### 🎯 Feature Testing

#### User Management & Tier Limits
- [ ] Test Free plan: Can add up to 5 users (including owner)
- [ ] Test Starter plan: Can add up to 25 users
- [ ] Test Pro plan: Unlimited users
- [ ] Verify upgrade flow blocks adding users when limit reached

#### Feature Access Control
- [ ] Free plan: Can access Basic Payroll, Payslip PDF
- [ ] Free plan: Cannot access AI Assistant, Compliance, Documents (shows upgrade message)
- [ ] Starter plan: Can access all Starter features
- [ ] Pro plan: Can access all features

#### Compliance Audit
- [ ] Dashboard shows missing TRN count
- [ ] Dashboard shows missing NIS count
- [ ] Dashboard shows missing bank details count
- [ ] "Fix →" buttons navigate to Employees page

#### CSV Import
- [ ] Test employee CSV import during onboarding
- [ ] Verify departments are auto-created from CSV
- [ ] Verify employees are assigned to correct departments

#### Pricing Page
- [ ] Plans display correctly
- [ ] Monthly/Yearly toggle works
- [ ] Price displays show "/mo" for monthly, "/yr" for yearly

### 🌐 Environment Variables Required

#### Vercel/Production Environment Variables:
```
VITE_SUPABASE_URL=your_supabase_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
DIMEPAY_SECRET_KEY_PROD=your_production_secret_key
DIMEPAY_SECRET_KEY_SANDBOX=your_sandbox_secret_key
NODE_ENV=production
```

### 🚀 Deployment Steps

1. **Build the application:**
   ```bash
   npm run build
   ```

2. **Test the build locally:**
   ```bash
   npm run preview
   ```

3. **Commit all changes:**
   ```bash
   git add .
   git commit -m "Production ready: Payment integration, feature access control, compliance audit, user limits"
   ```

4. **Push to main branch:**
   ```bash
   git push origin main
   ```

5. **Verify deployment on Vercel:**
   - Check build logs for errors
   - Verify environment variables are set
   - Test production URL

### 🔍 Post-Deployment Verification

- [ ] Production site loads correctly
- [ ] Payment widget loads on signup page
- [ ] Test a real payment transaction (small amount)
- [ ] Verify payment is recorded in Supabase
- [ ] Test user signup and onboarding flow
- [ ] Verify all features work as expected
- [ ] Check browser console for errors
- [ ] Test on mobile devices

### ⚠️ Known Considerations

1. **Payment Security**: Production payments require backend signing. Ensure `/api/sign-payment` endpoint is deployed and accessible.

2. **DimePay SDK**: Ensure DimePay SDK script is loaded in production. Check the HTML head for the script tag.

3. **CORS**: The API endpoint has CORS configured for `https://www.payrolljam.com` in production.

4. **Environment Detection**: The app automatically detects production vs sandbox based on DimePay config in SuperAdmin settings.

### 📝 Notes

- All console.log statements are present for debugging but should be removed or gated for production
- Payment integration has proper error handling and fallbacks
- Feature access control is enforced at both route and UI levels
- User limits are enforced when adding users

