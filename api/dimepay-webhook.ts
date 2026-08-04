import handler from './_dimepayWebhook.js';
import { withCrashLogging } from './_crashLogger.js';

export default withCrashLogging(handler, { endpoint: '/api/dimepay-webhook', critical: true });
