import { CompanyService } from './CompanyService';
import { storage } from './storage';
import { smtpEmailService } from './smtpEmailService';

type SupportUserContext = {
  id?: string;
  email?: string;
  name?: string;
  role?: string;
  companyId?: string;
};

const escapeHtml = (value: string): string =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

export async function getSupportEmail(): Promise<string | null> {
  try {
    const config = await CompanyService.getGlobalConfig();
    const fromConfig = config?.supportEmail;
    const fromStorage = (storage.getGlobalConfig() as { supportEmail?: string } | null)?.supportEmail;

    const raw = typeof fromConfig === 'string' ? fromConfig : typeof fromStorage === 'string' ? fromStorage : '';
    const trimmed = String(raw || '').trim();
    return trimmed || null;
  } catch {
    const fromStorage = (storage.getGlobalConfig() as { supportEmail?: string } | null)?.supportEmail;
    const trimmed = typeof fromStorage === 'string' ? fromStorage.trim() : '';
    return trimmed || null;
  }
}

export async function sendContactSupportClick(params: {
  source: string;
  currentUrl?: string;
  visitorEmail?: string;
  user?: SupportUserContext | null;
}): Promise<{ success: boolean; message?: string; error?: string }> {
  const to = (await getSupportEmail()) || 'support@payrolljam.com';

  const subject = `Support requested (${params.source})`;

  const html = `
    <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #111827;">
      <h2 style="margin: 0 0 12px;">Support requested</h2>
      <p style="margin: 0 0 12px;">A user clicked a <strong>Contact Support</strong> button.</p>
      <table style="border-collapse: collapse; width: 100%;">
        <tr><td style="padding: 6px 0; width: 140px;"><strong>Source</strong></td><td style="padding: 6px 0;">${escapeHtml(params.source)}</td></tr>
        <tr><td style="padding: 6px 0;"><strong>URL</strong></td><td style="padding: 6px 0;">${escapeHtml(params.currentUrl || '')}</td></tr>
        <tr><td style="padding: 6px 0;"><strong>Visitor Email</strong></td><td style="padding: 6px 0;">${escapeHtml(params.visitorEmail || '')}</td></tr>
        <tr><td style="padding: 6px 0;"><strong>User ID</strong></td><td style="padding: 6px 0;">${escapeHtml(params.user?.id || '')}</td></tr>
        <tr><td style="padding: 6px 0;"><strong>User Email</strong></td><td style="padding: 6px 0;">${escapeHtml(params.user?.email || '')}</td></tr>
        <tr><td style="padding: 6px 0;"><strong>User Role</strong></td><td style="padding: 6px 0;">${escapeHtml(params.user?.role || '')}</td></tr>
        <tr><td style="padding: 6px 0;"><strong>Company ID</strong></td><td style="padding: 6px 0;">${escapeHtml(params.user?.companyId || '')}</td></tr>
      </table>
    </div>
  `.trim();

  return smtpEmailService.sendEmail({ to, subject, html });
}

export async function sendContactUsSubmission(params: {
  name: string;
  email: string;
  subject?: string;
  message: string;
  currentUrl?: string;
  user?: SupportUserContext | null;
}): Promise<{ success: boolean; message?: string; error?: string }> {
  const to = (await getSupportEmail()) || 'support@payrolljam.com';

  const safeName = String(params.name || '').trim();
  const safeEmail = String(params.email || '').trim();
  const safeSubject = String(params.subject || 'Contact Us Submission').trim();
  const safeMessage = String(params.message || '').trim();

  const subject = `Contact Us: ${safeSubject}`;

  const html = `
    <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #111827;">
      <h2 style="margin: 0 0 12px;">Contact Us Submission</h2>
      <table style="border-collapse: collapse; width: 100%; margin-bottom: 16px;">
        <tr><td style="padding: 6px 0; width: 140px;"><strong>Name</strong></td><td style="padding: 6px 0;">${escapeHtml(safeName)}</td></tr>
        <tr><td style="padding: 6px 0;"><strong>Email</strong></td><td style="padding: 6px 0;">${escapeHtml(safeEmail)}</td></tr>
        <tr><td style="padding: 6px 0;"><strong>Subject</strong></td><td style="padding: 6px 0;">${escapeHtml(safeSubject)}</td></tr>
        <tr><td style="padding: 6px 0;"><strong>URL</strong></td><td style="padding: 6px 0;">${escapeHtml(params.currentUrl || '')}</td></tr>
        <tr><td style="padding: 6px 0;"><strong>User ID</strong></td><td style="padding: 6px 0;">${escapeHtml(params.user?.id || '')}</td></tr>
        <tr><td style="padding: 6px 0;"><strong>User Email</strong></td><td style="padding: 6px 0;">${escapeHtml(params.user?.email || '')}</td></tr>
        <tr><td style="padding: 6px 0;"><strong>User Role</strong></td><td style="padding: 6px 0;">${escapeHtml(params.user?.role || '')}</td></tr>
        <tr><td style="padding: 6px 0;"><strong>Company ID</strong></td><td style="padding: 6px 0;">${escapeHtml(params.user?.companyId || '')}</td></tr>
      </table>
      <h3 style="margin: 0 0 8px;">Message</h3>
      <pre style="white-space: pre-wrap; background: #f3f4f6; padding: 12px; border-radius: 8px;">${escapeHtml(safeMessage)}</pre>
    </div>
  `.trim();

  return smtpEmailService.sendEmail({ to, subject, html });
}
