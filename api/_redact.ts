// Shared redaction helper: strips tokens/secrets/signatures out of any object
// before it's written to a log table, so sensitive values never persist in
// system_crash_logs or dimepay_webhook_events.
export const redact = (value: any): any => {
  if (Array.isArray(value)) return value.map(redact);
  if (!value || typeof value !== 'object') return value;

  return Object.fromEntries(Object.entries(value).map(([key, entry]) => {
    const lowerKey = key.toLowerCase();
    if (lowerKey.includes('token') || lowerKey.includes('secret') || lowerKey.includes('signature')) {
      return [key, typeof entry === 'string' ? `${entry.slice(0, 8)}...redacted` : 'redacted'];
    }
    return [key, redact(entry)];
  }));
};
