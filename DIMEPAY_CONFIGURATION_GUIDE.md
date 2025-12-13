# DimePay Configuration Guide

## Overview

The DimePay payment gateway now supports separate credentials for **Sandbox (Test)** and **Production (Live)** environments with easy switching.

## Key Features ✨

### 1. Separate Credential Storage
- **Sandbox Credentials**: Test API keys stored separately
- **Production Credentials**: Live API keys stored separately
- Both sets preserved when switching environments
- No need to manually update keys when toggling between modes

### 2. Easy Environment Switching
- Single dropdown to switch between 🧪 Sandbox and 🚀 Production
- Automatically uses the correct credentials for the selected environment
- Visual indicators show which environment is active

### 3. Enhanced Validation
- Validates credentials per environment
- Health check dashboard shows environment-specific status
- Clear warnings if credentials are missing for active environment

## Configuration Steps

### 1. Access Super Admin Settings

1. Navigate to **Super Admin** dashboard
2. Click on **Settings** tab
3. Scroll to **Payment Gateways** section
4. Find **DimePay** configuration

### 2. Enable DimePay

- Toggle the checkbox next to "DimePay" to enable

### 3. Configure Sandbox Credentials (Blue Section)

```
🧪 Sandbox Credentials (Test Mode)
├─ Client Key: ck_test_...
├─ Secret Key: sk_test_...
├─ Merchant ID: mQn_...
└─ API URL: https://staging.api.dimepay.app (auto-set)
```

**Default Sandbox Credentials (Pre-filled):**
- Client Key: `ck_LGKMlNpFiRr63ce0s621VuGLjYdey`
- Secret Key: `sk_rYoMG45jVM2gvhE-pm4to9EZoW9tD`
- Merchant ID: `mQn_iBSUd-KNq3K`

### 4. Configure Production Credentials (Green Section)

```
🚀 Production Credentials (Live Mode)
├─ Client Key: ck_prod_...
├─ Secret Key: sk_prod_...
├─ Merchant ID: mQn_...
└─ API URL: https://api.dimepay.app (auto-set)
```

**How to Get Production Credentials:**
1. Contact DimePay support or your account manager
2. Request production API credentials
3. They will provide:
   - Production Client Key (starts with `ck_prod_` or `ck_live_`)
   - Production Secret Key (starts with `sk_prod_` or `sk_live_`)
   - Production Merchant ID

### 5. Choose Active Environment

Use the **Active Environment** dropdown:
- **🧪 Sandbox (Test)**: For testing payments without real charges
- **🚀 Production (Live)**: For processing real customer payments

### 6. Configure Fee Handling

Choose who pays processing fees:
- **Merchant (You)**: You absorb the fees
- **Customer (Client)**: Customer pays the fees

### 7. Save Settings

Click **Save Global Settings** at the bottom

## How It Works

### Automatic Credential Selection

When a payment is initiated:

```javascript
1. Check active environment (sandbox or production)
2. Load credentials for that environment
3. Validate credentials exist
4. Initialize payment with correct keys
5. Send to correct API endpoint
```

### Health Check Dashboard

The **Health** tab shows DimePay status:

- **🟢 Active**: Credentials configured for active environment
- **🟡 Incomplete**: Missing credentials for active environment
- **⚫ Inactive**: DimePay disabled

Status shows which environment is active:
- "🧪 Sandbox - Configured"
- "🚀 Production - Configured"
- "🧪 Sandbox - Missing credentials"
- "🚀 Production - Missing credentials"

## Best Practices

### Testing Workflow

1. **Development Phase:**
   - Use Sandbox environment
   - Test with test cards provided by DimePay
   - Verify all payment flows work correctly

2. **Pre-Launch:**
   - Obtain production credentials
   - Configure production section
   - Keep environment on Sandbox for final tests

3. **Launch Day:**
   - Switch to Production environment
   - Monitor first few real transactions
   - Keep Sandbox credentials intact for future testing

### Security Tips

✅ **DO:**
- Keep production credentials secure
- Use environment variables for backend if possible
- Regularly rotate production keys
- Test in sandbox before deploying changes

❌ **DON'T:**
- Share production credentials in public repos
- Use production keys in development
- Mix sandbox and production credentials
- Delete sandbox credentials after launch (keep for testing)

## Troubleshooting

### Error: "Missing {environment} credentials"

**Solution:** Fill in all three fields for the active environment:
- Client Key
- Secret Key
- Merchant ID

### Error: "Payment gateway {environment} credentials not configured"

**Solution:** The active environment doesn't have credentials set. Either:
1. Add credentials for that environment, or
2. Switch to the environment that has credentials

### Payments Not Working After Switching

**Checklist:**
1. ✓ Is DimePay enabled?
2. ✓ Are all three credentials filled for active environment?
3. ✓ Did you click "Save Global Settings"?
4. ✓ Are the credentials valid (check with DimePay)?
5. ✓ Is the correct environment selected?

### Can't Find Production Credentials

**Contact DimePay:**
- Email: support@dimepay.app
- Request: "Production API credentials for merchant account"
- Provide: Your merchant ID and business details

## Configuration File Structure

```typescript
dimepay: {
  enabled: true,
  environment: 'sandbox' | 'production',  // Active environment
  sandbox: {
    apiKey: 'ck_test_...',
    secretKey: 'sk_test_...',
    merchantId: 'mQn_...',
    domain: 'https://staging.api.dimepay.app'
  },
  production: {
    apiKey: 'ck_prod_...',
    secretKey: 'sk_prod_...',
    merchantId: 'mQn_...',
    domain: 'https://api.dimepay.app'
  },
  passFeesTo: 'MERCHANT' | 'CUSTOMER'
}
```

## Migration from Old Config

If you have existing DimePay configuration with flat structure:

**Old Format:**
```javascript
dimepay: {
  apiKey: '...',
  secretKey: '...',
  merchantId: '...'
}
```

**Action Required:**
1. Note your existing credentials
2. Determine if they're sandbox or production keys
3. Enter them in the appropriate section (blue for sandbox, green for production)
4. Save settings

The new system will automatically handle the structure.

## Support

For technical issues:
- Check browser console for detailed error logs
- Review `dimePayService.ts` logs
- Ensure Supabase credentials are also configured

For DimePay-specific issues:
- Contact DimePay support
- Verify API endpoints are accessible
- Check if credentials are still valid

---

**Last Updated:** January 2025  
**Version:** 2.0 (Separate Environment Credentials)
