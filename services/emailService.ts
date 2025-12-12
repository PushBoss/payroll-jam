
import emailjs from '@emailjs/browser';
import { storage } from './storage';
import { smtpEmailService } from './smtpEmailService';

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
      console.warn('⚠️ SMTP failed, falling back to EmailJS');
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
   * Sends a notification that a payslip is ready.
   */
  sendPayslipNotification: async (email: string, firstName: string, period: string, netPay: string) => {
    // Try SMTP first (if API URL is configured)
    const apiUrl = import.meta.env.VITE_API_URL;
    if (apiUrl) {
      console.log('📧 Sending payslip notification via SMTP...');
      const loginLink = window.location.origin;
      const result = await smtpEmailService.sendPayslipNotification(email, firstName, period, netPay, loginLink);
      if (result.success) {
        return result;
      }
      console.warn('⚠️ SMTP failed, falling back to EmailJS');
    }

    // Fallback to EmailJS
    const config = storage.getGlobalConfig();

    if (!config?.emailjs?.publicKey) {
      console.log(`[Payslip Simulation] To: ${email} | Period: ${period} | Net: ${netPay}`);
      return { success: true, message: 'Simulation: Notification logged.' };
    }

    try {
      const templateParams = {
        to_email: email,
        to_name: firstName,
        message: `Your payslip for ${period} is now available. Net Pay: ${netPay}. Log in to the portal to view details.`,
        link: window.location.origin, // Link to the app login
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
