#!/bin/bash

# Quick script to update sender email after verification

echo "🔧 Update Brevo Sender Email"
echo "============================"
echo ""

read -p "Enter your verified email address (e.g., pushtechja@gmail.com): " NEW_EMAIL

if [ -z "$NEW_EMAIL" ]; then
    echo "❌ Email address is required"
    exit 1
fi

echo ""
echo "🔐 Updating Supabase secret..."
supabase secrets set SMTP_FROM_EMAIL="$NEW_EMAIL" || {
    echo "❌ Failed to update secret"
    exit 1
}

echo ""
echo "🚀 Redeploying function..."
supabase functions deploy send-email --no-verify-jwt || {
    echo "❌ Failed to deploy function"
    exit 1
}

echo ""
echo "✅ Done! Sender email updated to: $NEW_EMAIL"
echo ""
echo "🧪 Test it:"
echo "curl -X POST https://arqbxlaudfbmiqvwwmnt.supabase.co/functions/v1/send-email \\"
echo "  -H \"Content-Type: application/json\" \\"
echo "  -d '{\"to\": \"pushtechja@gmail.com\", \"subject\": \"Test\", \"html\": \"<p>Test</p>\"}'"
