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
      // Check if API URL is configured
      const apiUrl = import.meta.env.VITE_API_URL;
      
      if (!apiUrl) {
        console.error('SMTP not configured - VITE_API_URL missing');
        return { success: false, error: 'SMTP not configured' };
      }

      // Call backend API endpoint (Supabase Edge Function)
      // SMTP credentials are stored in Supabase secrets, not in global config
      const response = await fetch(`${apiUrl}/send-email`, {
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
   * Send company invitation email
   */
  sendCompanyInvite: async (
    email: string,
    contactName: string,
    invitingCompanyName: string,
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
            <h1>You're Invited to Join Payroll-Jam!</h1>
          </div>
          <div class="content">
            <p>Hi ${contactName},</p>
            <p><strong>${invitingCompanyName}</strong> has invited your company to join Payroll-Jam, a comprehensive payroll management system designed for Jamaican businesses.</p>
            <p>With Payroll-Jam, you'll be able to:</p>
            <ul>
              <li>Manage payroll for your employees efficiently</li>
              <li>Generate statutory reports (S01, S02, P24, P25)</li>
              <li>Process bank files for direct deposits</li>
              <li>Track employee leave and timesheets</li>
              <li>Maintain compliance with Jamaican tax regulations</li>
            </ul>
            <center>
              <a href="${inviteLink}" class="button">Accept Invitation & Sign Up</a>
            </center>
            <p style="color: #6b7280; font-size: 14px; margin-top: 20px;">
              Or copy and paste this link into your browser:<br>
              <span style="word-break: break-all;">${inviteLink}</span>
            </p>
            <p style="margin-top: 20px; padding-top: 20px; border-top: 1px solid #e5e7eb; color: #6b7280; font-size: 14px;">
              This invitation was sent by ${invitingCompanyName}. If you have any questions, please contact them directly.
            </p>
          </div>
          <div class="footer">
            <p>This invitation was sent by ${invitingCompanyName} via Payroll-Jam</p>
            <p>If you did not expect this invitation, you can safely ignore this email.</p>
          </div>
        </div>
      </body>
      </html>
    `;

    const textContent = `
You're Invited to Join Payroll-Jam!

Hi ${contactName},

${invitingCompanyName} has invited your company to join Payroll-Jam, a comprehensive payroll management system designed for Jamaican businesses.

With Payroll-Jam, you'll be able to manage payroll, generate statutory reports, process bank files, track employee leave, and maintain compliance with Jamaican tax regulations.

Accept your invitation here: ${inviteLink}

This invitation was sent by ${invitingCompanyName}. If you have any questions, please contact them directly.

---
This invitation was sent by ${invitingCompanyName} via Payroll-Jam
If you did not expect this invitation, you can safely ignore this email.
    `;

    return await smtpEmailService.sendEmail({
      to: email,
      subject: `${invitingCompanyName} has invited you to join Payroll-Jam`,
      html: htmlContent,
      text: textContent,
    });
  },

  /**
   * Send reseller plan upgrade notification
   */
  sendResellerUpgradeNotification: async (
    email: string,
    companyName: string,
    userName: string,
    dashboardUrl?: string
  ): Promise<{ success: boolean; message?: string }> => {
    const dashboardLink = dashboardUrl || (typeof window !== 'undefined' ? `${window.location.origin}/?page=reseller-dashboard` : 'https://payroll-jam.com/?page=reseller-dashboard');
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
            <h1>Welcome to Reseller Plan!</h1>
          </div>
          <div class="content">
            <p>Hi ${userName},</p>
            <p>Congratulations! <strong>${companyName}</strong> has successfully upgraded to the <strong>Reseller Plan</strong>.</p>
            <div class="highlight">
              <p style="margin: 0; font-size: 16px; font-weight: bold; color: #92400e;">You now have access to:</p>
              <ul style="margin: 10px 0 0 0; padding-left: 20px; color: #92400e;">
                <li>White Label capabilities</li>
                <li>Client Management Dashboard</li>
                <li>Wholesale pricing rates</li>
                <li>Unlimited tenant management</li>
                <li>Reseller Partner Console</li>
              </ul>
            </div>
            <p>You can now start inviting and managing client companies from your Reseller Dashboard.</p>
            <center>
              <a href="${dashboardLink}" class="button">Access Reseller Dashboard</a>
            </center>
            <p style="color: #6b7280; font-size: 14px; margin-top: 20px;">
              If you have any questions about your Reseller account, please contact our support team.
            </p>
          </div>
          <div class="footer">
            <p>This is an automated notification from Payroll-Jam</p>
            <p>Thank you for choosing Payroll-Jam as your payroll solution!</p>
          </div>
        </div>
      </body>
      </html>
    `;

    const textContent = `
Welcome to Reseller Plan!

Hi ${userName},

Congratulations! ${companyName} has successfully upgraded to the Reseller Plan.

You now have access to:
- White Label capabilities
- Client Management Dashboard
- Wholesale pricing rates
- Unlimited tenant management
- Reseller Partner Console

You can now start inviting and managing client companies from your Reseller Dashboard.

Access your dashboard: ${dashboardLink}

If you have any questions about your Reseller account, please contact our support team.

---
This is an automated notification from Payroll-Jam
Thank you for choosing Payroll-Jam as your payroll solution!
    `;

    return await smtpEmailService.sendEmail({
      to: email,
      subject: `Welcome to Reseller Plan - ${companyName}`,
      html: htmlContent,
      text: textContent,
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
    loginLink: string,
    hasPortalAccess: boolean = true
  ): Promise<{ success: boolean; message?: string }> => {
    const buttonText = hasPortalAccess ? 'View Payslip in Portal' : 'Download PDF Payslip';
    const buttonUrl = hasPortalAccess ? `${loginLink}/?page=portal-home` : `${loginLink}/?page=login`;
    const instructionText = hasPortalAccess 
      ? 'Log in to your employee portal to view your full payslip and access all your pay history.'
      : 'Click the button below to download your payslip PDF. Contact your employer for portal access.';
    
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
            <p>${instructionText}</p>
            <center>
              <a href="${buttonUrl}" class="button">${buttonText}</a>
            </center>
          </div>
          <div class="footer">
            <p>This is an automated notification from Payroll-Jam</p>
          </div>
        </div>
      </body>
      </html>
    `;

    const textContent = hasPortalAccess
      ? `Hi ${firstName}, Your payslip for ${period} is now available. Net Pay: ${netPay}. Log in to your employee portal: ${buttonUrl}`
      : `Hi ${firstName}, Your payslip for ${period} is now available. Net Pay: ${netPay}. Log in to download your PDF: ${buttonUrl}`;
    
    return await smtpEmailService.sendEmail({
      to: email,
      subject: `Your Payslip for ${period} is Ready`,
      html: htmlContent,
      text: textContent,
    });
  },
};

