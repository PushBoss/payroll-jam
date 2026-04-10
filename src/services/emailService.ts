
import emailjs from '@emailjs/browser';
import { storage } from './storage';
import { smtpEmailService } from './smtpEmailService';
import { buildAppUrl } from '../app/routes';

export const emailService = {
  /**
   * Sends an invitation email to a new employee.
   */
  sendInvite: async (email: string, firstName: string, link: string) => {
    // Try SMTP first (if API URL is configured)
    const apiUrl = import.meta.env.VITE_API_URL;
    if (apiUrl) {
      console.log('📧 Sending invite via SMTP...');
      const companyName = storage.getCompanyData()?.name || 'Payroll-Jam';
      const result = await smtpEmailService.sendEmployeeInvite(email, firstName, companyName, link);
      if (result.success) {
        return result;
      }
      console.warn('⚠️ SMTP failed, falling back to EmailJS. Reason:', result.error);
    }

    // Fallback to EmailJS
    const config = storage.getGlobalConfig();
    
    if (!config?.emailjs?.publicKey) {
      console.log(`[Email Simulation] To: ${email} | Link: ${link}`);
      return { success: true, message: 'Simulation: Email logged to console.' };
    }

    try {
      // Using a generic template structure. In EmailJS, you map variables to your template fields.
      // Recommended EmailJS Template variables: to_email, to_name, message, link
      const templateParams = {
        to_email: email,
        to_name: firstName,
        message: "You have been invited to join Payroll-Jam. Please click the link below to complete your onboarding.",
        link: link,
        action_type: 'INVITE'
      };

      await emailjs.send(
        config.emailjs.serviceId,
        config.emailjs.templateId,
        templateParams,
        config.emailjs.publicKey
      );

      return { success: true, message: 'Email sent successfully.' };
    } catch (error) {
      console.error('EmailJS Error:', error);
      return { success: false, message: 'Failed to send email.' };
    }
  },

  /**
   * Sends an employee account setup invitation email.
   */
  sendEmployeeInvite: async (email: string, firstName: string, companyName: string, link: string) => {
    // Try SMTP first (if API URL is configured)
    const apiUrl = import.meta.env.VITE_API_URL;
    if (apiUrl) {
      console.log('📧 Sending employee invite via SMTP...');
      const result = await smtpEmailService.sendEmployeeInvite(email, firstName, companyName, link);
      if (result.success) {
        return result;
      }
      console.warn('⚠️ SMTP failed, falling back to EmailJS');
    }

    // Fallback to EmailJS
    const config = storage.getGlobalConfig();
    
    if (!config?.emailjs?.publicKey) {
      console.log(`[Email Simulation] Employee Invite`);
      console.log(`To: ${email}`);
      console.log(`Company: ${companyName}`);
      console.log(`Link: ${link}`);
      return { success: true, message: 'Simulation: Email logged to console.' };
    }

    try {
      const templateParams = {
        to_email: email,
        to_name: firstName,
        message: `Welcome to ${companyName}! Your employer has added you to their payroll system. Click the link below to set up your account and complete your employee onboarding. You'll be able to view your payslips, update your information, and more.`,
        link: link,
        company_name: companyName,
        action_type: 'EMPLOYEE_INVITE'
      };

      await emailjs.send(
        config.emailjs.serviceId,
        config.emailjs.templateId,
        templateParams,
        config.emailjs.publicKey
      );

      return { success: true, message: 'Email sent successfully.' };
    } catch (error) {
      console.error('EmailJS Error:', error);
      return { success: false, message: 'Failed to send email.' };
    }
  },

  /**
   * Sends a reseller invitation email.
   */
  sendResellerInvite: async (email: string, contactName: string, resellerCompanyName: string, link: string) => {
    // Try SMTP first (if API URL is configured)
    const apiUrl = import.meta.env.VITE_API_URL;
    if (apiUrl) {
      console.log('📧 Sending reseller invite via SMTP...');
      const result = await smtpEmailService.sendResellerInvite(email, contactName, resellerCompanyName, link);
      if (result.success) {
        return result;
      }
      console.warn('⚠️ SMTP failed for reseller invite.', result.error);
    }

    // Fallback to simulation (Reseller invites not supported on EmailJS fallback in this version)
    console.log(`[Email Simulation] Reseller Invite`);
    console.log(`To: ${email}`);
    console.log(`From: ${resellerCompanyName}`);
    console.log(`Link: ${link}`);
    return { success: true, message: 'Simulation: Email logged to console.' };
  },

  /**
   * Sends a manager/admin invitation email.
   * @param requiresUpgrade - If true, includes message about upgrading to Reseller plan to manage multiple companies
   */
  sendManagerInvite: async (email: string, contactName: string, invitingCompanyName: string, link: string, role: string, requiresUpgrade?: boolean) => {
    // Try SMTP first (if API URL is configured)
    const apiUrl = import.meta.env.VITE_API_URL;
    if (apiUrl) {
      console.log('📧 Sending manager invite via SMTP...');
      const result = await smtpEmailService.sendManagerInvite(email, contactName, invitingCompanyName, link, role, requiresUpgrade);
      if (result.success) {
        return result;
      }
      console.warn('⚠️ SMTP failed, falling back to EmailJS');
    }

    // Fallback to EmailJS (using generic template for now or simulation)
    const config = storage.getGlobalConfig();
    
    if (!config?.emailjs?.publicKey) {
      console.log(`[Email Simulation] Manager Invite`);
      console.log(`To: ${email}`);
      console.log(`Company: ${invitingCompanyName}`);
      console.log(`Role: ${role}`);
      console.log(`Link: ${link}`);
      console.log(`Requires Upgrade: ${requiresUpgrade ? 'Yes' : 'No'}`);
      return { success: true, message: 'Simulation: Email logged to console.' };
    }

    // For EmailJS fallback, we use the standard invite template but with updated message
    try {
      let message = `${invitingCompanyName} has invited you to join their team as a ${role}. Click the link below to accept the invitation.`;
      if (requiresUpgrade) {
        message += `\n\nNote: To manage multiple companies, you'll need to upgrade to the Reseller plan.`;
      }
      
      const templateParams = {
        to_email: email,
        to_name: contactName,
        message: message,
        link: link,
        company_name: invitingCompanyName,
        action_type: 'MANAGER_INVITE'
      };

      await emailjs.send(
        config.emailjs.serviceId,
        config.emailjs.templateId,
        templateParams,
        config.emailjs.publicKey
      );

      return { success: true, message: 'Email sent successfully.' };
    } catch (error) {
      console.error('EmailJS Error:', error);
      return { success: false, message: 'Failed to send email.' };
    }
  },

  /**
   * Sends a company invitation email.
   */
  sendCompanyInvite: async (email: string, contactName: string, invitingCompanyName: string, link: string) => {
    // Try SMTP first (if API URL is configured)
    const apiUrl = import.meta.env.VITE_API_URL;
    if (apiUrl) {
      console.log('📧 Sending company invite via SMTP...');
      const result = await smtpEmailService.sendCompanyInvite(email, contactName, invitingCompanyName, link);
      if (result.success) {
        return result;
      }
      console.warn('⚠️ SMTP failed, falling back to EmailJS');
    }

    // Fallback to EmailJS
    const config = storage.getGlobalConfig();
    
    if (!config?.emailjs?.publicKey) {
      console.log(`[Email Simulation] Company Invite`);
      console.log(`To: ${email}`);
      console.log(`Company: ${invitingCompanyName}`);
      console.log(`Link: ${link}`);
      return { success: true, message: 'Simulation: Email logged to console.' };
    }

    try {
      const templateParams = {
        to_email: email,
        to_name: contactName,
        message: `${invitingCompanyName} has invited your company to join Payroll-Jam. Click the link below to accept the invitation and sign up.`,
        link: link,
        company_name: invitingCompanyName,
        action_type: 'COMPANY_INVITE'
      };

      await emailjs.send(
        config.emailjs.serviceId,
        config.emailjs.templateId,
        templateParams,
        config.emailjs.publicKey
      );

      return { success: true, message: 'Email sent successfully.' };
    } catch (error) {
      console.error('EmailJS Error:', error);
      return { success: false, message: 'Failed to send email.' };
    }
  },

  /**
   * Sends a reseller plan upgrade notification email.
   */
  sendResellerUpgradeNotification: async (email: string, companyName: string, userName: string) => {
    // Try SMTP first (if API URL is configured)
    const apiUrl = import.meta.env.VITE_API_URL;
    if (apiUrl) {
      console.log('📧 Sending reseller upgrade notification via SMTP...');
      const dashboardUrl = buildAppUrl('reseller-dashboard');
      const result = await smtpEmailService.sendResellerUpgradeNotification(email, companyName, userName, dashboardUrl);
      if (result.success) {
        return result;
      }
      console.warn('⚠️ SMTP failed, falling back to EmailJS');
    }

    // Fallback to EmailJS
    const config = storage.getGlobalConfig();
    
    if (!config?.emailjs?.publicKey) {
      console.log(`[Email Simulation] Reseller Upgrade Notification`);
      console.log(`To: ${email}`);
      console.log(`Company: ${companyName}`);
      console.log(`User: ${userName}`);
      return { success: true, message: 'Simulation: Email logged to console.' };
    }

    try {
      const templateParams = {
        to_email: email,
        to_name: userName,
        message: `Congratulations! ${companyName} has successfully upgraded to the Reseller Plan. You now have access to white label capabilities, client management, and wholesale pricing.`,
        link: buildAppUrl('reseller-dashboard'),
        company_name: companyName,
        action_type: 'RESELLER_UPGRADE'
      };

      await emailjs.send(
        config.emailjs.serviceId,
        config.emailjs.templateId,
        templateParams,
        config.emailjs.publicKey
      );

      return { success: true, message: 'Email sent successfully.' };
    } catch (error) {
      console.error('EmailJS Error:', error);
      return { success: false, message: 'Failed to send email.' };
    }
  },

  /**
   * Sends a notification that a payslip is ready.
   * @param hasPortalAccess - Whether employee has access to portal (Starter/Pro plans)
   * @param downloadToken - Secure token for direct PDF download (Free plan users)
   */
  sendPayslipNotification: async (email: string, firstName: string, period: string, netPay: string, hasPortalAccess?: boolean, downloadToken?: string) => {
    hasPortalAccess = hasPortalAccess ?? true; // Default to true if not provided
    
    // Try SMTP first (if API URL is configured)
    const apiUrl = import.meta.env.VITE_API_URL;
    if (apiUrl) {
      console.log('📧 Sending payslip notification via SMTP...');
      const loginLink = window.location.origin;
      const result = await smtpEmailService.sendPayslipNotification(email, firstName, period, netPay, loginLink, hasPortalAccess, downloadToken);
      if (result.success) {
        return result;
      }
      console.warn('⚠️ SMTP failed, falling back to EmailJS');
    }

    // Fallback to EmailJS
    const config = storage.getGlobalConfig();

    if (!config?.emailjs?.publicKey) {
      console.log(`[Payslip Simulation] To: ${email} | Period: ${period} | Net: ${netPay} | Portal: ${hasPortalAccess} | Token: ${downloadToken ? 'Yes' : 'No'}`);
      return { success: true, message: 'Simulation: Notification logged.' };
    }

    try {
      const downloadLink = downloadToken ? buildAppUrl('download-payslip', { token: downloadToken }) : buildAppUrl('home');
      
      const templateParams = {
        to_email: email,
        to_name: firstName,
        message: hasPortalAccess
          ? `Your payslip for ${period} is now available. Net Pay: ${netPay}. Log in to your employee portal to view details.`
          : `Your payslip for ${period} is now available. Net Pay: ${netPay}. Click the button below to download your PDF.`,
        link: downloadLink,
        action_type: 'PAYSLIP'
      };

      await emailjs.send(
        config.emailjs.serviceId,
        config.emailjs.templateId,
        templateParams,
        config.emailjs.publicKey
      );

      return { success: true };
    } catch (error) {
      console.error('EmailJS Error:', error);
      return { success: false };
    }
  }
};
