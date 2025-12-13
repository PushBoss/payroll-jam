#!/bin/bash

# Brevo Email Setup Script for Payroll-Jam
# This script helps you set up Brevo SMTP email functionality

set -e

echo "🔧 Brevo Email Setup for Payroll-Jam"
echo "======================================"
echo ""

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Check if Supabase CLI is installed
if ! command -v supabase &> /dev/null; then
    echo -e "${RED}❌ Supabase CLI is not installed${NC}"
    echo "Install it with: npm install -g supabase"
    exit 1
fi

echo -e "${GREEN}✅ Supabase CLI found${NC}"
echo ""

# Get project reference
PROJECT_REF=""
if [ -f "supabase/.temp/pooler-url" ]; then
    PROJECT_REF=$(cat supabase/.temp/pooler-url | grep -oP 'postgres\.\K[^.]+' | head -1)
    echo -e "${GREEN}✅ Found project reference: ${PROJECT_REF}${NC}"
else
    echo -e "${YELLOW}⚠️  Could not auto-detect project reference${NC}"
    read -p "Enter your Supabase project reference (e.g., arqbxlaudfbmiqvwwmnt): " PROJECT_REF
fi

echo ""
echo "📋 Setup Steps:"
echo "==============="
echo ""
echo "1. Get your Brevo API Key:"
echo "   - Go to: https://app.brevo.com/"
echo "   - Login → Settings → SMTP & API"
echo "   - Copy your API Key (v3)"
echo ""
read -p "Press Enter when you have your Brevo API key ready..."

# Get Brevo API Key
echo ""
read -p "Enter your Brevo API Key (starts with xkeysib-): " BREVO_API_KEY

if [ -z "$BREVO_API_KEY" ]; then
    echo -e "${RED}❌ Brevo API Key is required${NC}"
    exit 1
fi

if [[ ! $BREVO_API_KEY == xkeysib-* ]]; then
    echo -e "${YELLOW}⚠️  Warning: API key should start with 'xkeysib-'${NC}"
    read -p "Continue anyway? (y/n): " confirm
    if [ "$confirm" != "y" ]; then
        exit 1
    fi
fi

echo ""
echo "🔐 Setting Supabase secrets..."
echo ""

# Set secrets
supabase secrets set BREVO_API_KEY="$BREVO_API_KEY" || {
    echo -e "${RED}❌ Failed to set BREVO_API_KEY${NC}"
    echo "Make sure you're linked to your Supabase project:"
    echo "  supabase link --project-ref $PROJECT_REF"
    exit 1
}

supabase secrets set SMTP_FROM_NAME="Payroll-Jam" || {
    echo -e "${YELLOW}⚠️  Failed to set SMTP_FROM_NAME (may already be set)${NC}"
}

supabase secrets set SMTP_FROM_EMAIL="9dea0e001@smtp-brevo.com" || {
    echo -e "${YELLOW}⚠️  Failed to set SMTP_FROM_EMAIL (may already be set)${NC}"
}

echo ""
echo -e "${GREEN}✅ Secrets set successfully${NC}"
echo ""

# Verify secrets
echo "📋 Verifying secrets..."
supabase secrets list

echo ""
echo "🚀 Deploying Edge Function..."
echo ""

# Deploy function
supabase functions deploy send-email --no-verify-jwt || {
    echo -e "${RED}❌ Failed to deploy function${NC}"
    exit 1
}

echo ""
echo -e "${GREEN}✅ Function deployed successfully${NC}"
echo ""

# Create/update .env file
echo "📝 Updating .env file..."
echo ""

ENV_FILE=".env"
FUNCTION_URL="https://${PROJECT_REF}.supabase.co/functions/v1"

if [ -f "$ENV_FILE" ]; then
    # Check if VITE_API_URL already exists
    if grep -q "VITE_API_URL" "$ENV_FILE"; then
        # Update existing
        if [[ "$OSTYPE" == "darwin"* ]]; then
            # macOS
            sed -i '' "s|VITE_API_URL=.*|VITE_API_URL=$FUNCTION_URL|" "$ENV_FILE"
        else
            # Linux
            sed -i "s|VITE_API_URL=.*|VITE_API_URL=$FUNCTION_URL|" "$ENV_FILE"
        fi
        echo -e "${GREEN}✅ Updated VITE_API_URL in .env${NC}"
    else
        # Add new
        echo "" >> "$ENV_FILE"
        echo "# Brevo Email Service" >> "$ENV_FILE"
        echo "VITE_API_URL=$FUNCTION_URL" >> "$ENV_FILE"
        echo -e "${GREEN}✅ Added VITE_API_URL to .env${NC}"
    fi
else
    # Create new .env file
    echo "# Brevo Email Service" > "$ENV_FILE"
    echo "VITE_API_URL=$FUNCTION_URL" >> "$ENV_FILE"
    echo -e "${GREEN}✅ Created .env file with VITE_API_URL${NC}"
fi

echo ""
echo "======================================"
echo -e "${GREEN}✅ Setup Complete!${NC}"
echo "======================================"
echo ""
echo "📧 Test Email Function:"
echo "   curl -X POST $FUNCTION_URL/send-email \\"
echo "     -H \"Content-Type: application/json\" \\"
echo "     -d '{\"to\": \"pushtechja@gmail.com\", \"subject\": \"Test\", \"html\": \"<p>Test</p>\"}'"
echo ""
echo "🧪 Next Steps:"
echo "   1. Restart your dev server: npm run dev"
echo "   2. Go to Employees → Invite Employee"
echo "   3. Enter pushtechja@gmail.com and send invite"
echo "   4. Check your email inbox!"
echo ""
echo "📊 Monitor emails in Brevo Dashboard:"
echo "   https://app.brevo.com/statistics/email-activity"
echo ""
