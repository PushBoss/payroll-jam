import type { VercelRequest, VercelResponse } from '@vercel/node';
import {
  buildAbsoluteUrl,
  buildCardReferenceId,
  postSignedDimePayRequest,
  resolveDimePayEnvironment
} from './_dimepay';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const {
      company_id,
      local_subscription_id,
      subscription_id,
      redirect_url,
      environment
    } = req.body || {};

    if (!company_id) {
      return res.status(400).json({ error: 'company_id is required' });
    }

    const dimePayEnvironment = resolveDimePayEnvironment(environment, req);
    const response = await postSignedDimePayRequest(
      '/card-request',
      {
        id: buildCardReferenceId({
          companyId: company_id,
          localSubscriptionId: local_subscription_id,
          dimepaySubscriptionId: subscription_id
        }),
        webhookUrl: buildAbsoluteUrl(req, '/api/dimepay-card-webhook'),
        redirectUrl: redirect_url || buildAbsoluteUrl(req, '/?page=settings')
      },
      dimePayEnvironment,
      'POST'
    );

    const data = await response.json().catch(() => null);

    if (!response.ok) {
      return res.status(response.status).json({
        error: 'Failed to create card request',
        details: data
      });
    }

    return res.status(200).json(data);
  } catch (error: any) {
    console.error('❌ Error creating card request:', error);
    return res.status(500).json({ error: error.message || 'Failed to create card request' });
  }
}
