import handler from '../../_dimepayCardRequest.js';
import { withCrashLogging } from '../../_crashLogger.js';

export default withCrashLogging(handler, { endpoint: '/api/billing/dimepay/card-request', critical: true });
