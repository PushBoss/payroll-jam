# Deployment Instructions

## Quick Deploy to Production

### 1. Final Code Review
```bash
# Check for any uncommitted changes
git status

# Run linter (should show no errors)
npm run build
```

### 2. Set Production Environment Variables in Vercel

Go to Vercel Dashboard → Your Project → Settings → Environment Variables

Add/Verify these variables:
- `VITE_SUPABASE_URL` - Your Supabase project URL
- `VITE_SUPABASE_ANON_KEY` - Your Supabase anon key
- `DIMEPAY_SECRET_KEY_PROD` - Production DimePay secret key
- `DIMEPAY_SECRET_KEY_SANDBOX` - Sandbox DimePay secret key (for testing)
- `NODE_ENV` - Set to `production`

### 3. Commit and Push

```bash
# Stage all changes
git add .

# Commit with descriptive message
git commit -m "Production release: Payment integration, feature access control, compliance features, user management"

# Push to main branch
git push origin main
```

### 4. Verify Deployment

1. Check Vercel build logs
2. Visit production URL: https://www.payrolljam.com
3. Test critical flows:
   - User signup
   - Payment processing
   - Dashboard access
   - Feature restrictions

### 5. Post-Deployment Testing

Run through the TESTING_CHECKLIST.md to verify all features work in production.

## Rollback Plan

If issues are found:
```bash
# Revert to previous commit
git revert HEAD
git push origin main
```

Or use Vercel's deployment rollback feature in the dashboard.


