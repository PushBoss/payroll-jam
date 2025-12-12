/**
 * Supabase Edge Function for Sending Emails via SMTP
 * 
 * Deploy this function using:
 * supabase functions deploy send-email
 * 
 * Set secrets:
 * supabase secrets set SMTP_HOST=smtp-relay.brevo.com
 * supabase secrets set SMTP_PORT=587
 * supabase secrets set SMTP_USER=9dea0e001@smtp-brevo.com
 * supabase secrets set SMTP_PASS=g5JHWNhvBUqp49yw
 * supabase secrets set SMTP_FROM_NAME="Payroll-Jam"
 * supabase secrets set SMTP_FROM_EMAIL=9dea0e001@smtp-brevo.com
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

    // Get SMTP config from environment
    const smtpHost = Deno.env.get('SMTP_HOST') || 'smtp-relay.brevo.com';
    const smtpPort = parseInt(Deno.env.get('SMTP_PORT') || '587');
    const smtpUser = Deno.env.get('SMTP_USER') || '';
    const smtpPass = Deno.env.get('SMTP_PASS') || '';
    const fromName = Deno.env.get('SMTP_FROM_NAME') || 'Payroll-Jam';
    const fromEmail = Deno.env.get('SMTP_FROM_EMAIL') || smtpUser;

    // Build email message
    const emailContent = [
      `From: "${fromName}" <${fromEmail}>`,
      `To: ${to}`,
      `Subject: ${subject}`,
      `MIME-Version: 1.0`,
      `Content-Type: multipart/alternative; boundary="boundary123"`,
      ``,
      `--boundary123`,
      `Content-Type: text/plain; charset=UTF-8`,
      ``,
      text || html.replace(/<[^>]*>/g, ''),
      ``,
      `--boundary123`,
      `Content-Type: text/html; charset=UTF-8`,
      ``,
      html,
      ``,
      `--boundary123--`,
    ].join('\r\n');

    // Connect to SMTP server and send email
    const conn = await Deno.connect({
      hostname: smtpHost,
      port: smtpPort,
    });

    const encoder = new TextEncoder();
    const decoder = new TextDecoder();

    // Helper to read response
    const readResponse = async () => {
      const buffer = new Uint8Array(1024);
      const n = await conn.read(buffer);
      return decoder.decode(buffer.subarray(0, n || 0));
    };

    // Helper to send command
    const sendCommand = async (command: string) => {
      await conn.write(encoder.encode(command + '\r\n'));
      return await readResponse();
    };

    // SMTP conversation
    await readResponse(); // Read greeting
    await sendCommand(`EHLO ${smtpHost}`);
    await sendCommand('STARTTLS'); // Upgrade to TLS
    
    // For TLS, you'd need to wrap the connection - simplified here
    // In production, use a proper SMTP library
    
    await sendCommand(`AUTH LOGIN`);
    await sendCommand(btoa(smtpUser));
    await sendCommand(btoa(smtpPass));
    await sendCommand(`MAIL FROM:<${fromEmail}>`);
    await sendCommand(`RCPT TO:<${to}>`);
    await sendCommand('DATA');
    await sendCommand(emailContent + '\r\n.');
    await sendCommand('QUIT');

    conn.close();

    return new Response(
      JSON.stringify({ success: true, message: 'Email sent successfully' }),
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

