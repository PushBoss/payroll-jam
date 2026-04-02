# Reseller Upgrade Flow - Test Checklist

## 🎯 Overview
Test the complete flow of upgrading a regular account to Reseller plan.

---

## ✅ Pre-requisites

1. **Account Setup**
   - [ ] Login as regular user (Owner/Admin role)
   - [ ] Currently on Free, Starter, or Pro plan
   - [ ] Not already a Reseller

2. **Reseller Plan Configuration** (in SuperAdmin)
   - [ ] Plan name: "Reseller"
   - [ ] Price type: `base` (base + per user)
   - [ ] Base fee: $5,000 (or configured amount)
   - [ ] Per user fee: $500 (or configured amount)
   - [ ] Reseller commission: 20%
   - [ ] Plan is active (`isActive: true`)

3. **DimePay Configuration**
   - [ ] Production or Sandbox credentials configured
   - [ ] Environment selected in SuperAdmin
   - [ ] Backend signing API working

---

## 📋 Test Steps

### Step 1: Navigate to Settings → Billing

1. **Login as regular user**
   - [ ] Go to Dashboard
   - [ ] Click Settings in sidebar
   - [ ] Click "Billing" tab

2. **Verify Reseller plan is visible**
   - [ ] See "Reseller" in Available Plans section
   - [ ] Price shows: $5,000/mo (or configured amount)
   - [ ] "Upgrade to Reseller" button visible
   - [ ] Plan features listed

**Expected:** Reseller plan card appears with correct pricing

---

### Step 2: Click "Upgrade to Reseller"

1. **Click upgrade button**
   - [ ] Click "Upgrade to Reseller" button
   - [ ] Checkout modal appears

2. **Verify modal contents**
   - [ ] Title: "Secure Checkout"
   - [ ] Subtitle: "Switching to Reseller"
   - [ ] Loading indicator shows initially
   - [ ] DimePay widget loads after ~1 second

**Expected:** Modal opens with DimePay payment form

---

### Step 3: Complete Payment

1. **Enter payment details in DimePay widget**
   - [ ] Card number field visible
   - [ ] Expiry date field visible
   - [ ] CVV field visible
   - [ ] Name field visible

2. **Submit payment**
   - [ ] Click "Pay" or submit button in widget
   - [ ] Loading/processing indicator shows
   - [ ] Wait for response

**Expected:** Payment processes successfully

---

### Step 4: Verify Success Actions

**After payment completes:**

1. **Check toast notifications**
   - [ ] Success toast appears
   - [ ] Message: "Successfully upgraded to Reseller! Check your email for details."
   - [ ] Toast visible for ~5 seconds

2. **Check automatic redirect**
   - [ ] Page redirects after ~1.5 seconds
   - [ ] Redirects to: `/?page=reseller-dashboard`

**Expected:** Success message + auto-redirect to Reseller Dashboard

---

### Step 5: Verify User Role Update

1. **Check sidebar navigation**
   - [ ] "Reseller Dashboard" menu item visible
   - [ ] Replaces regular Dashboard link

2. **Check user role in profile**
   - [ ] Click Profile/Settings
   - [ ] Role shows: "RESELLER"

**Expected:** User now has Reseller role

---

### Step 6: Verify Reseller Dashboard Access

1. **Check Reseller Dashboard loads**
   - [ ] Dashboard displays without errors
   - [ ] Tabs visible: "My Dashboard", "Partner Console", "Compliance", "Revenue & Costs"
   - [ ] No permission errors

2. **Check "My Dashboard" tab**
   - [ ] Can manage own employees
   - [ ] Functions like admin dashboard

3. **Check "Partner Console" tab**
   - [ ] Can invite client companies
   - [ ] Can manage client companies list
   - [ ] Commission tracking visible

**Expected:** Full Reseller Dashboard functionality available

---

### Step 7: Verify Backend Records

**Check Supabase tables:**

1. **app_users table**
   - [ ] User's role updated to `'RESELLER'`
   - [ ] Query: `SELECT role FROM app_users WHERE email = 'user@example.com'`

2. **companies table**
   - [ ] Company plan updated to `'Reseller'`
   - [ ] Query: `SELECT plan, status FROM companies WHERE id = 'company-uuid'`

3. **subscriptions table**
   - [ ] New subscription record created
   - [ ] Plan name: "Reseller"
   - [ ] Status: "active"
   - [ ] Amount: 5000 (or configured)
   - [ ] Query: `SELECT * FROM subscriptions WHERE company_id = 'company-uuid' ORDER BY created_at DESC LIMIT 1`

4. **payment_records table**
   - [ ] Payment record created
   - [ ] Status: "completed"
   - [ ] Amount: 5000 (or configured)
   - [ ] Description: "Reseller Plan - Monthly Subscription"
   - [ ] Query: `SELECT * FROM payment_records WHERE company_id = 'company-uuid' ORDER BY created_at DESC LIMIT 1`

**Expected:** All backend tables updated correctly

---

### Step 8: Verify Email Notification

1. **Check email inbox**
   - [ ] Email received at user's email address
   - [ ] Subject: "Welcome to Reseller Program" (or similar)
   - [ ] Email contains:
     - [ ] Congratulations message
     - [ ] Reseller features/benefits
     - [ ] Next steps
     - [ ] Support contact

**Expected:** Reseller upgrade confirmation email sent

---

### Step 9: Test Reseller Features

1. **Test client invitation**
   - [ ] Go to Reseller Dashboard → Partner Console
   - [ ] Click "Invite Client Company"
   - [ ] Enter client email
   - [ ] Click "Send Invite"
   - [ ] Success toast appears
   - [ ] Client receives invitation email

2. **Test client management**
   - [ ] See invited clients in list
   - [ ] Can "Manage" client (impersonation)
   - [ ] Can view client details

**Expected:** All reseller features functional

---

### Step 10: Test Billing/Commission

1. **Add employees to own company**
   - [ ] Add test employee
   - [ ] Verify per-user fee applies

2. **Check commission calculation**
   - [ ] Go to Revenue & Costs tab
   - [ ] Verify 20% commission shown
   - [ ] Commission calculation correct

**Expected:** Billing and commission tracking works

---

## 🐛 Common Issues & Solutions

### Issue 1: DimePay Widget Not Loading
**Symptoms:** 
- Loading spinner never disappears
- "Payment initialization failed" error

**Check:**
- [ ] DimePay credentials configured in SuperAdmin
- [ ] Correct environment selected (sandbox/production)
- [ ] Backend API signing endpoint working
- [ ] Check console for JWT errors

**Fix:** Configure DimePay in SuperAdmin → Settings → Payment Gateways

---

### Issue 2: Payment Succeeds But Role Not Updated
**Symptoms:**
- Payment completes
- Still shows as regular user
- No Reseller Dashboard access

**Check:**
- [ ] Check console for `updateUser` errors
- [ ] Verify `supabaseService.saveUser()` succeeds
- [ ] Check app_users table in Supabase

**Fix:** 
```sql
-- Manually update role if needed
UPDATE app_users 
SET role = 'RESELLER' 
WHERE email = 'user@example.com';
```

---

### Issue 3: No Redirect to Reseller Dashboard
**Symptoms:**
- Payment succeeds
- Modal closes
- Stays on Settings page

**Check:**
- [ ] Check if `upgradeTarget.name === 'Reseller'` is matching
- [ ] Check console for redirect errors
- [ ] Verify `window.location.href` assignment works

**Fix:** Manually navigate to `/?page=reseller-dashboard`

---

### Issue 4: Email Not Sent
**Symptoms:**
- Upgrade succeeds
- No email received

**Check:**
- [ ] Check Brevo/email service configured
- [ ] Check console for email service errors
- [ ] Check spam folder
- [ ] Verify `sendResellerUpgradeNotification()` exists

**Fix:** Check email service configuration in SuperAdmin

---

### Issue 5: Reseller Plan Not Visible
**Symptoms:**
- Can't see Reseller plan in Settings

**Check:**
- [ ] Plan configured in SuperAdmin
- [ ] Plan `isActive = true`
- [ ] Plans loaded from backend (check console)
- [ ] Filter logic not hiding it

**Fix:** 
- Set plan to active in SuperAdmin
- Hard refresh browser (Ctrl+Shift+R)

---

## 📊 Test Results Template

```
Test Date: _______________
Tester: _______________
Environment: [ ] Production [ ] Staging [ ] Local

Pre-requisites: [ ] Pass [ ] Fail
Step 1 (Navigation): [ ] Pass [ ] Fail
Step 2 (Modal): [ ] Pass [ ] Fail
Step 3 (Payment): [ ] Pass [ ] Fail
Step 4 (Success): [ ] Pass [ ] Fail
Step 5 (Role Update): [ ] Pass [ ] Fail
Step 6 (Dashboard): [ ] Pass [ ] Fail
Step 7 (Backend): [ ] Pass [ ] Fail
Step 8 (Email): [ ] Pass [ ] Fail
Step 9 (Features): [ ] Pass [ ] Fail
Step 10 (Billing): [ ] Pass [ ] Fail

Overall: [ ] Pass [ ] Fail

Notes:
_______________________________________________
_______________________________________________
_______________________________________________
```

---

## 🔍 Console Logs to Watch For

**Successful upgrade logs:**
```javascript
💳 Paid signup - redirecting to login
✅ Signup completed successfully
✅ User profile saved to app_users table
✅ Payment successful!
✅ Subscription created
✅ Payment record created
✅ User role updated to RESELLER
✅ Email sent successfully
🔄 Redirecting to reseller-dashboard...
```

**Error logs to investigate:**
```javascript
❌ Payment widget error: ...
❌ Error updating user role: ...
❌ Failed to create subscription: ...
❌ Email notification failed: ...
```

---

## ✅ Final Verification

After completing all steps:

- [ ] User can access Reseller Dashboard
- [ ] User can invite client companies
- [ ] User can manage their own employees
- [ ] User can view revenue/commission
- [ ] Backend records are correct
- [ ] Payment recorded properly
- [ ] Email sent successfully

**Status:** [ ] Ready for Production [ ] Needs Fixes

---

**Document Version:** 1.0  
**Last Updated:** 2024  
**Maintained By:** Development Team
