/**
 * Backend API Endpoint for Sending Emails via SMTP
 * 
 * This file should be deployed as:
 * - Supabase Edge Function
 * - Vercel Serverless Function
 * - Netlify Function
 * - Express.js API endpoint
 * 
 * INSTALLATION:
 * npm install nodemailer
 * npm install @types/nodemailer --save-dev
 */

import nodemailer from 'nodemailer';

interface EmailRequest {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

// SMTP Configuration from environment variables
const SMTP_CONFIG = {
  host: process.env.SMTP_HOST || 'smtp-relay.brevo.com',
  port: parseInt(process.env.SMTP_PORT || '587'),
  secure: false, // true for 465, false for other ports
  auth: {
    user: process.env.SMTP_USER || '9dea0e001@smtp-brevo.com',
    pass: process.env.SMTP_PASS || 'g5JHWNhvBUqp49yw',
  },
  from: {
    name: process.env.SMTP_FROM_NAME || 'Payroll-Jam',
    email: process.env.SMTP_FROM_EMAIL || '9dea0e001@smtp-brevo.com',
  },
};

/**
 * Send email via SMTP
 */
export async function sendEmail(req: any, res: any) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // Handle preflight
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { to, subject, html, text }: EmailRequest = req.body;

    if (!to || !subject || !html) {
      return res.status(400).json({ error: 'Missing required fields: to, subject, html' });
    }

    // Create transporter
    const transporter = nodemailer.createTransporter(SMTP_CONFIG);

    // Send email
    const info = await transporter.sendMail({
      from: `"${SMTP_CONFIG.from.name}" <${SMTP_CONFIG.from.email}>`,
      to,
      subject,
      text: text || '', // Plain text version
      html, // HTML version
    });

    console.log('Email sent:', info.messageId);

    return res.status(200).json({
      success: true,
      messageId: info.messageId,
    });
  } catch (error) {
    console.error('Email sending error:', error);
    return res.status(500).json({
      error: 'Failed to send email',
      details: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}

// For Vercel/Netlify serverless
export default sendEmail;

