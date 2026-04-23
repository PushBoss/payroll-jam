# SMTP Email Setup Guide for Payroll-Jam

## Your Brevo SMTP Configuration

Your SMTP credentials have been configured:

- **Server**: smtp-relay.brevo.com
- **Port**: 587
- **Username**: 9dea0e001@smtp-brevo.com
- **Password**: g5JHWNhvBUqp49yw

## Setup Options

### Option 1: Supabase Edge Functions (Recommended)

1. **Install Supabase CLI**:
```bash
npm install -g supabase
```

2. **Login to Supabase**:
```bash
supabase login
```

3. **Link your project**:
```bash
supabase link --project-ref your-project-ref
```

4. **Set secrets**:
```bash
supabase secrets set SMTP_HOST=smtp-relay.brevo.com
supabase secrets set SMTP_PORT=587
supabase secrets set SMTP_USER=9dea0e001@smtp-brevo.com
supabase secrets set SMTP_PASS=g5JHWNhvBUqp49yw
supabase secrets set SMTP_FROM_NAME="Payroll-Jam"
supabase secrets set SMTP_FROM_EMAIL=9dea0e001@smtp-brevo.com
```

5. **Deploy the function**:
```bash
supabase functions deploy send-email
```

6. **Update your app** - Add to `.env`:
```
VITE_API_URL=https://your-project-ref.supabase.co/functions/v1/send-email
```

### Option 2: Vercel Serverless Function

1. **Install dependencies**:
```bash
npm install nodemailer
npm install @types/nodemailer --save-dev
```

2. **Move `api/send-email.ts` to `api/send-email.js`**

3. **Add to `vercel.json`**:
```json
{
  "functions": {
    "api/**/*.js": {
      "memory": 1024,
      "maxDuration": 10
    }
  }
}
```

4. **Set environment variables in Vercel Dashboard**:
   - SMTP_HOST=smtp-relay.brevo.com
   - SMTP_PORT=587
   - SMTP_USER=9dea0e001@smtp-brevo.com
   - SMTP_PASS=g5JHWNhvBUqp49yw
   - SMTP_FROM_NAME=Payroll-Jam
   - SMTP_FROM_EMAIL=9dea0e001@smtp-brevo.com

5. **Deploy**:
```bash
vercel --prod
```

### Option 3: Node.js Express Backend

1. **Create a simple Express server**:

```javascript
// server.js
const express = require('express');
const nodemailer = require('nodemailer');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

const transporter = nodemailer.createTransporter({
  host: 'smtp-relay.brevo.com',
  port: 587,
  secure: false,
  auth: {
    user: '9dea0e001@smtp-brevo.com',
    pass: 'g5JHWNhvBUqp49yw',
  },
});

app.post('/api/send-email', async (req, res) => {
  try {
    const { to, subject, html, text } = req.body;
    
    const info = await transporter.sendMail({
      from: '"Payroll-Jam" <9dea0e001@smtp-brevo.com>',
      to,
      subject,
      text,
      html,
    });

    res.json({ success: true, messageId: info.messageId });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to send email' });
  }
});

app.listen(3001, () => {
  console.log('Email API running on port 3001');
});
```

2. **Install dependencies**:
```bash
npm install express nodemailer cors
```

3. **Run**:
```bash
node server.js
```

4. **Update `.env`**:
```
VITE_API_URL=http://localhost:3001/api
```

## Update Email Service

Once you've set up your backend, update your email service to use SMTP:

```typescript
import { smtpEmailService } from './services/smtpEmailService';

// Instead of emailService.sendEmployeeInvite()
await smtpEmailService.sendEmployeeInvite(email, firstName, companyName, link);
```

## Testing

Test your SMTP setup with a simple curl command:

```bash
curl -X POST http://your-api-url/send-email \
  -H "Content-Type: application/json" \
  -d '{
    "to": "test@example.com",
    "subject": "Test Email",
    "html": "<h1>Hello!</h1><p>This is a test email.</p>",
    "text": "Hello! This is a test email."
  }'
```

## Brevo Dashboard

Monitor your email sending at:
https://app.brevo.com/

- Check sent emails
- View delivery rates
- Monitor your sending quota
- Add additional sender addresses

## Security Notes

⚠️ **IMPORTANT**: 
- Never commit SMTP credentials to version control
- Use environment variables for all sensitive data
- Keep `.env` files in `.gitignore`
- Use different credentials for development and production

## Troubleshooting

### Email not sending
- Check SMTP credentials are correct
- Verify Brevo account is active
- Check sending quota hasn't been exceeded
- Review Brevo logs for blocked emails

### 550 errors
- Verify sender email is authorized in Brevo
- Add SPF/DKIM records to your domain

### Connection timeout
- Check firewall allows port 587
- Verify SMTP host is correct
- Try port 465 with secure: true

## Next Steps

1. Choose deployment option (Supabase Edge Functions recommended)
2. Set up environment variables
3. Deploy backend service
4. Update frontend to use new email service
5. Test email sending
6. Monitor Brevo dashboard

Need help? Check Brevo documentation: https://developers.brevo.com/

