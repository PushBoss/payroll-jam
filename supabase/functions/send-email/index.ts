/**
 * Supabase Edge Function for Sending Emails via Brevo API
 * 
 * Deploy this function using:
 * supabase functions deploy send-email --no-verify-jwt
 * 
 * Set secrets:
 * supabase secrets set BREVO_API_KEY=your_brevo_api_key
 * supabase secrets set SMTP_FROM_NAME="Payroll-Jam"
 * supabase secrets set SMTP_FROM_EMAIL=9dea0e001@smtp-brevo.com
 * 
 * To get your Brevo API key:
 * 1. Login to https://app.brevo.com/
 * 2. Go to Settings → SMTP & API
 * 3. Copy your API Key (v3)
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

interface EmailRequest {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

serve(async (req) => {
  // CORS headers
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  };

  // Handle preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { to, subject, html, text }: EmailRequest = await req.json();

    if (!to || !subject || !html) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields: to, subject, html' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get Brevo API key from environment
    const brevoApiKey = Deno.env.get('BREVO_API_KEY');
    const fromName = Deno.env.get('SMTP_FROM_NAME') || 'Payroll-Jam';
    const fromEmail = Deno.env.get('SMTP_FROM_EMAIL') || '9dea0e001@smtp-brevo.com';

    if (!brevoApiKey) {
      console.error('BREVO_API_KEY not set in Supabase secrets');
      return new Response(
        JSON.stringify({ error: 'Email service not configured. BREVO_API_KEY missing.' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Call Brevo Transactional Email API
    const brevoResponse = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        'api-key': brevoApiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        sender: {
          name: fromName,
          email: fromEmail,
        },
        to: [
          {
            email: to,
          },
        ],
        subject: subject,
        htmlContent: html,
        textContent: text || html.replace(/<[^>]*>/g, ''),
      }),
    });

    if (!brevoResponse.ok) {
      const errorData = await brevoResponse.text();
      console.error('Brevo API error:', errorData);
      return new Response(
        JSON.stringify({
          error: 'Failed to send email via Brevo',
          details: errorData,
        }),
        { status: brevoResponse.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const result = await brevoResponse.json();
    console.log('Email sent successfully:', result);

    return new Response(
      JSON.stringify(result),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Email sending error:', error);
    return new Response(
      JSON.stringify({
        error: 'Failed to send email',
        details: error instanceof Error ? error.message : 'Unknown error',
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

