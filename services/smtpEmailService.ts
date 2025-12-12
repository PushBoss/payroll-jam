/**
 * SMTP Email Service for Server-Side Email Sending
 * 
 * NOTE: This service requires a backend/server environment to work.
 * SMTP credentials should NEVER be exposed in the frontend.
 * 
 * Options for implementation:
 * 1. Supabase Edge Functions (recommended)
 * 2. Node.js backend API
 * 3. Serverless functions (Vercel, Netlify, etc.)
 */

import { supabaseService } from './supabaseService';

export interface SMTPConfig {
  host: string;
  port: number;
  secure: boolean; // true for 465, false for other ports
  auth: {
    user: string;
    pass: string;
  };
  from: {
    name: string;
    email: string;
  };
}

export interface EmailPayload {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

/**
 * Send email via backend API endpoint
 */
export const smtpEmailService = {
  /**
   * Send email through backend API
   */
  sendEmail: async (payload: EmailPayload): Promise<{ success: boolean; message?: string; error?: string }> => {
    try {
      // Get SMTP config from Supabase
      const config = await supabaseService.getGlobalConfig();
      
      if (!config?.smtp?.host) {
        console.error('SMTP not configured');
        return { success: false, error: 'SMTP not configured' };
      }

      // In production, this should call your backend API endpoint
      // For now, log to console for simulation
      if (import.meta.env.DEV) {
        console.log('📧 [SMTP Email Simulation]');
        console.log('To:', payload.to);
        console.log('Subject:', payload.subject);
        console.log('Content:', payload.text || 'HTML email');
        console.log('SMTP Server:', config.smtp.host);
        return { success: true, message: 'Simulation: Email logged to console' };
      }

      // Call backend API endpoint
      const apiUrl = import.meta.env.VITE_API_URL || '/api/send-email';
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(error || 'Failed to send email');
      }

      return { success: true, message: 'Email sent successfully' };
    } catch (error) {
      console.error('SMTP Email Error:', error);
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Failed to send email' 
      };
    }
  },

  /**
   * Send employee invitation email
   */
  sendEmployeeInvite: async (
    email: string,
    firstName: string,
    companyName: string,
    inviteLink: string
  ): Promise<{ success: boolean; message?: string }> => {
    const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: linear-gradient(135deg, #f97316 0%, #fbbf24 100%); color: white; padding: 30px; text-align: center; border-radius: 8px 8px 0 0; }
          .content { background: #ffffff; padding: 30px; border: 1px solid #e5e7eb; }
          .button { display: inline-block; padding: 12px 30px; background: #f97316; color: white; text-decoration: none; border-radius: 6px; font-weight: bold; margin: 20px 0; }
          .footer { text-align: center; padding: 20px; color: #6b7280; font-size: 12px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>Welcome to ${companyName}!</h1>
          </div>
          <div class="content">
            <p>Hi ${firstName},</p>
            <p>Welcome to <strong>${companyName}</strong>! Your employer has added you to their payroll system.</p>
            <p>Click the button below to set up your account and complete your employee onboarding. You'll be able to:</p>
            <ul>
              <li>View your payslips</li>
              <li>Update your personal information</li>
              <li>Request time off</li>
              <li>And much more!</li>
            </ul>
            <center>
              <a href="${inviteLink}" class="button">Set Up My Account</a>
            </center>
            <p style="color: #6b7280; font-size: 14px; margin-top: 20px;">
              Or copy and paste this link into your browser:<br>
              <span style="word-break: break-all;">${inviteLink}</span>
            </p>
          </div>
          <div class="footer">
            <p>This invitation was sent by ${companyName} via Payroll-Jam</p>
            <p>If you have any questions, please contact your employer.</p>
          </div>
        </div>
      </body>
      </html>
    `;

    const textContent = `
Welcome to ${companyName}!

Hi ${firstName},

Your employer has added you to their payroll system. Click the link below to set up your account and complete your employee onboarding.

${inviteLink}

You'll be able to view your payslips, update your information, request time off, and more.

If you have any questions, please contact your employer.

---
This invitation was sent by ${companyName} via Payroll-Jam
    `;

    return await smtpEmailService.sendEmail({
      to: email,
      subject: `Welcome to ${companyName} - Set Up Your Account`,
      html: htmlContent,
      text: textContent,
    });
  },

  /**
   * Send reseller invitation email
   */
  sendResellerInvite: async (
    email: string,
    contactName: string,
    resellerCompanyName: string,
    inviteLink: string
  ): Promise<{ success: boolean; message?: string }> => {
    const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: linear-gradient(135deg, #f97316 0%, #fbbf24 100%); color: white; padding: 30px; text-align: center; border-radius: 8px 8px 0 0; }
          .content { background: #ffffff; padding: 30px; border: 1px solid #e5e7eb; }
          .button { display: inline-block; padding: 12px 30px; background: #f97316; color: white; text-decoration: none; border-radius: 6px; font-weight: bold; margin: 20px 0; }
          .footer { text-align: center; padding: 20px; color: #6b7280; font-size: 12px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>You've Been Invited!</h1>
          </div>
          <div class="content">
            <p>Hi ${contactName},</p>
            <p><strong>${resellerCompanyName}</strong> has invited you to use Payroll-Jam with them as your accountant/reseller.</p>
            <p>This means they'll be able to help manage your payroll, making compliance and processing easier for you.</p>
            <center>
              <a href="${inviteLink}" class="button">Accept Invitation</a>
            </center>
            <p style="color: #6b7280; font-size: 14px; margin-top: 20px;">
              Or copy and paste this link into your browser:<br>
              <span style="word-break: break-all;">${inviteLink}</span>
            </p>
          </div>
          <div class="footer">
            <p>This invitation was sent by ${resellerCompanyName} via Payroll-Jam</p>
          </div>
        </div>
      </body>
      </html>
    `;

    return await smtpEmailService.sendEmail({
      to: email,
      subject: `${resellerCompanyName} has invited you to Payroll-Jam`,
      html: htmlContent,
      text: `${resellerCompanyName} has invited you to use Payroll-Jam. Click here to accept: ${inviteLink}`,
    });
  },

  /**
   * Send payslip notification
   */
  sendPayslipNotification: async (
    email: string,
    firstName: string,
    period: string,
    netPay: string,
    loginLink: string
  ): Promise<{ success: boolean; message?: string }> => {
    const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: linear-gradient(135deg, #f97316 0%, #fbbf24 100%); color: white; padding: 30px; text-align: center; border-radius: 8px 8px 0 0; }
          .content { background: #ffffff; padding: 30px; border: 1px solid #e5e7eb; }
          .button { display: inline-block; padding: 12px 30px; background: #f97316; color: white; text-decoration: none; border-radius: 6px; font-weight: bold; margin: 20px 0; }
          .footer { text-align: center; padding: 20px; color: #6b7280; font-size: 12px; }
          .highlight { background: #fef3c7; padding: 15px; border-radius: 6px; margin: 20px 0; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>Your Payslip is Ready!</h1>
          </div>
          <div class="content">
            <p>Hi ${firstName},</p>
            <p>Your payslip for <strong>${period}</strong> is now available.</p>
            <div class="highlight">
              <p style="margin: 0; font-size: 14px; color: #92400e;">Net Pay</p>
              <p style="margin: 5px 0 0 0; font-size: 24px; font-weight: bold; color: #92400e;">${netPay}</p>
            </div>
            <p>Log in to your employee portal to view your full payslip and download a PDF copy.</p>
            <center>
              <a href="${loginLink}" class="button">View Payslip</a>
            </center>
          </div>
          <div class="footer">
            <p>This is an automated notification from Payroll-Jam</p>
          </div>
        </div>
      </body>
      </html>
    `;

    return await smtpEmailService.sendEmail({
      to: email,
      subject: `Your Payslip for ${period} is Ready`,
      html: htmlContent,
      text: `Hi ${firstName}, Your payslip for ${period} is now available. Net Pay: ${netPay}. Log in to view: ${loginLink}`,
    });
  },
};

