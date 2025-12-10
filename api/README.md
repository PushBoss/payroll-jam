# DimePay Backend Integration

This folder contains Vercel serverless functions for secure payment processing.

## API Endpoints

### POST /api/sign-payment

Signs payment data with HMAC-SHA256 for DimePay integration.

**Request Body:**
```json
{
  "payload": {
    "id": "ORD-123456",
    "total": 2300,
    "currency": "JMD",
    "description": "Starter Plan (monthly)",
    "billing_email": "user@example.com",
    "billing_name": "John Doe",
    "frequency": "MONTHLY"
  },
  "environment": "sandbox" // or "production"
}
```

**Response:**
```json
{
  "jwt": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

## Environment Variables

Configure these in Vercel dashboard (Settings → Environment Variables):

- `DIMEPAY_SECRET_KEY_SANDBOX` - Sandbox secret key for testing
- `DIMEPAY_SECRET_KEY_PROD` - Production secret key for live payments

## Security Features

- CORS protection (only allows requests from payrolljam.com in production)
- Secret keys stored securely in environment variables
- JWT signing done server-side (never exposes secret keys to client)
- Separate keys for sandbox and production environments

## Local Development

1. Copy `.env.example` to `.env.local`
2. Add your DimePay secret keys
3. Run `npm run dev`

## Deployment

Environment variables are automatically loaded from Vercel project settings.
No code changes needed when switching between sandbox and production.
