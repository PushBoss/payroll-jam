import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getDimePayRequest, resolveDimePayEnvironment } from './_dimepay';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const token = typeof req.query.token === 'string' ? req.query.token : undefined;
    const environment = typeof req.query.environment === 'string' ? req.query.environment : undefined;

    if (!token) {
      return res.status(400).json({ error: 'token is required' });
    }

    const dimePayEnvironment = resolveDimePayEnvironment(environment, req);
    const response = await getDimePayRequest(`/cards/${encodeURIComponent(token)}`, dimePayEnvironment);
    const data = await response.json().catch(() => null);

    if (!response.ok) {
      return res.status(response.status).json({ error: 'Failed to load card details', details: data });
    }

    return res.status(200).json(data);
  } catch (error: any) {
    console.error('❌ Error getting card details:', error);
    return res.status(500).json({ error: error.message || 'Failed to get card details' });
  }
}
