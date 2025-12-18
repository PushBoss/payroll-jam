#!/bin/bash

# Deploy get-payslip Supabase Edge Function
# This function allows public access to payslips via secure tokens (Free plan)

echo "🚀 Deploying get-payslip Edge Function..."

# Check if supabase CLI is installed
if ! command -v supabase &> /dev/null; then
    echo "❌ Supabase CLI not found. Install it first:"
    echo "   brew install supabase/tap/supabase"
    exit 1
fi

# Deploy the function
echo "📦 Deploying get-payslip function..."
supabase functions deploy get-payslip --project-ref arqbxlaudfbmiqvwwmnt

if [ $? -eq 0 ]; then
    echo "✅ get-payslip function deployed successfully!"
    echo ""
    echo "📝 Function URL:"
    echo "   https://arqbxlaudfbmiqvwwmnt.supabase.co/functions/v1/get-payslip"
    echo ""
    echo "🔐 This function uses the SERVICE_ROLE_KEY to bypass RLS"
    echo "   Make sure SUPABASE_SERVICE_ROLE_KEY is set in your Supabase project secrets"
    echo ""
    echo "✅ Public payslip download should now work for Free plan users!"
else
    echo "❌ Deployment failed. Check the error above."
    exit 1
fi
