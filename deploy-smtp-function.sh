#!/bin/bash

# Deployment script for Supabase Edge Function (SMTP Email)
# This script will help you deploy the email sending function to Supabase

echo "🚀 Supabase Edge Function Deployment Script"
echo "============================================"
echo ""

# Check if Supabase CLI is installed
if ! command -v supabase &> /dev/null; then
    echo "❌ Supabase CLI is not installed."
    echo ""
    echo "Installing Supabase CLI..."
    npm install -g supabase
    
    if [ $? -ne 0 ]; then
        echo "❌ Failed to install Supabase CLI"
        echo "Please install manually: npm install -g supabase"
        exit 1
    fi
    echo "✅ Supabase CLI installed successfully"
fi

echo "✅ Supabase CLI found"
echo ""

# Check if logged in
echo "Checking Supabase login status..."
supabase projects list &> /dev/null
if [ $? -ne 0 ]; then
    echo "⚠️  Not logged in to Supabase"
    echo "Please login now..."
    supabase login
    
    if [ $? -ne 0 ]; then
        echo "❌ Login failed"
        exit 1
    fi
fi

echo "✅ Logged in to Supabase"
echo ""

# Check if project is linked
if [ ! -f ".supabase/config.toml" ]; then
    echo "⚠️  Project not linked"
    echo ""
    echo "Please enter your Supabase project reference (found in project settings):"
    read -p "Project Ref: " PROJECT_REF
    
    echo "Linking project..."
    supabase link --project-ref "$PROJECT_REF"
    
    if [ $? -ne 0 ]; then
        echo "❌ Failed to link project"
        exit 1
    fi
    echo "✅ Project linked successfully"
else
    echo "✅ Project already linked"
fi

echo ""
echo "Setting SMTP secrets..."
echo ""

# Set secrets
echo "Setting SMTP_HOST..."
supabase secrets set SMTP_HOST=smtp-relay.brevo.com

echo "Setting SMTP_PORT..."
supabase secrets set SMTP_PORT=587

echo "Setting SMTP_USER..."
supabase secrets set SMTP_USER=9dea0e001@smtp-brevo.com

echo "Setting SMTP_PASS..."
supabase secrets set SMTP_PASS=g5JHWNhvBUqp49yw

echo "--------------------------------------------"
echo "🔑 checking Brevo API Key Configuration..."
echo "To send emails reliably, we need the Brevo V3 API Key (starts with xkeysib-)."
echo "This is DIFFERENT from the SMTP password above."
echo ""
read -p "Enter your Brevo API Key: " BREVO_API_KEY

if [ ! -z "$BREVO_API_KEY" ]; then
    echo "Setting BREVO_API_KEY..."
    supabase secrets set BREVO_API_KEY="$BREVO_API_KEY"
else
    echo "⚠️  No API Key provided. The email function may fail if it relies on the web API."
fi
echo "--------------------------------------------"

echo "Setting SMTP_FROM_NAME..."
supabase secrets set SMTP_FROM_NAME="Payroll-Jam"

echo "--------------------------------------------"
echo "📧 Sender Email Configuration"
echo "Brevo requires a Verified Sender Email Address."
echo "Using an unverified address will cause emails to be dropped silently."
echo ""
read -p "Enter your Verified Sender Email (e.g., info@yourdomain.com): " SENDER_EMAIL

if [ ! -z "$SENDER_EMAIL" ]; then
    echo "Setting SMTP_FROM_EMAIL to $SENDER_EMAIL..."
    supabase secrets set SMTP_FROM_EMAIL="$SENDER_EMAIL"
else
    echo "⚠️  No Sender Email provided. Using default (likely to fail)."
    echo "Setting default SMTP_FROM_EMAIL..."
    supabase secrets set SMTP_FROM_EMAIL=9dea0e001@smtp-brevo.com
fi
echo "--------------------------------------------"

echo ""
echo "✅ All secrets set successfully"
echo ""

# Deploy the function
echo "Deploying send-email function..."
supabase functions deploy send-email --no-verify-jwt

if [ $? -ne 0 ]; then
    echo "❌ Function deployment failed"
    exit 1
fi

echo ""
echo "✅ Function deployed successfully!"
echo ""

# Get the function URL
PROJECT_REF=$(grep "project_id" .supabase/config.toml | cut -d'"' -f2)
FUNCTION_URL="https://$PROJECT_REF.supabase.co/functions/v1/send-email"

echo "============================================"
echo "✅ Deployment Complete!"
echo "============================================"
echo ""
echo "Function URL: $FUNCTION_URL"
echo ""
echo "Next steps:"
echo "1. Update your .env file with:"
echo "   VITE_API_URL=$FUNCTION_URL"
echo ""
echo "2. Test the function with:"
echo "   curl -X POST $FUNCTION_URL \\"
echo "     -H 'Content-Type: application/json' \\"
echo "     -d '{\"to\":\"test@example.com\",\"subject\":\"Test\",\"html\":\"<h1>Hello</h1>\"}'"
echo ""
echo "3. Monitor at: https://app.supabase.com/project/$PROJECT_REF/functions"
echo ""

