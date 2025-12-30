#!/usr/bin/env node

/**
 * Test Script for DimePay Recurring Payments Webhook
 * 
 * This script tests the webhook endpoint by simulating DimePay webhook events.
 * 
 * Usage:
 *   node scripts/test-recurring-payments.js [event-type] [webhook-url]
 * 
 * Examples:
 *   node scripts/test-recurring-payments.js subscription.created
 *   node scripts/test-recurring-payments.js invoice.payment_succeeded https://www.payrolljam.com/api/dimepay-webhook
 */

import crypto from 'crypto';
import https from 'https';
import http from 'http';

// Configuration
const WEBHOOK_SECRET = process.env.DIMEPAY_WEBHOOK_SECRET || 'test-secret-key';
const DEFAULT_WEBHOOK_URL = process.env.WEBHOOK_URL || 'http://localhost:3000/api/dimepay-webhook';
const TEST_COMPANY_ID = 'test-company-' + Date.now();

// Generate HMAC-SHA256 signature for webhook
function generateSignature(payload, secret) {
  const payloadString = JSON.stringify(payload);
  return crypto
    .createHmac('sha256', secret)
    .update(payloadString)
    .digest('hex');
}

// Test event payloads
const TEST_EVENTS = {
  'subscription.created': {
    type: 'subscription.created',
    data: {
      subscription_id: 'sub_test_' + Date.now(),
      customer_id: 'cust_test_' + Date.now(),
      order_id: 'ORD_' + Date.now(),
      amount: 5000,
      currency: 'JMD',
      recurring_frequency: 'MONTHLY',
      next_billing_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      transaction_id: 'txn_test_' + Date.now(),
      invoice_number: 'INV-' + Date.now(),
      card_last4: '4242',
      card_brand: 'Visa',
      billing_cycles: 9999,
      metadata: {
        company_id: TEST_COMPANY_ID,
        plan_name: 'Starter Plan',
        plan_type: 'subscription'
      }
    }
  },
  'invoice.payment_succeeded': {
    type: 'invoice.payment_succeeded',
    data: {
      subscription_id: 'sub_test_existing',
      invoice_id: 'inv_test_' + Date.now(),
      amount: 5000,
      currency: 'JMD',
      cycle_number: 2,
      invoice_number: 'INV-RECURRING-' + Date.now(),
      next_billing_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      card_last4: '4242',
      payment_date: new Date().toISOString()
    }
  },
  'invoice.payment_failed': {
    type: 'invoice.payment_failed',
    data: {
      subscription_id: 'sub_test_existing',
      invoice_id: 'inv_failed_' + Date.now(),
      amount: 5000,
      currency: 'JMD',
      failure_reason: 'Card declined',
      invoice_number: 'INV-FAILED-' + Date.now()
    }
  },
  'subscription.canceled': {
    type: 'subscription.canceled',
    data: {
      subscription_id: 'sub_test_existing',
      canceled_at: new Date().toISOString(),
      reason: 'User requested cancellation'
    }
  },
  'subscription.paused': {
    type: 'subscription.paused',
    data: {
      subscription_id: 'sub_test_existing',
      paused_at: new Date().toISOString(),
      reason: 'Temporary pause'
    }
  }
};

// Send webhook test
async function testWebhook(eventType, webhookUrl) {
  const event = TEST_EVENTS[eventType];
  
  if (!event) {
    console.error(`❌ Unknown event type: ${eventType}`);
    console.log(`Available event types: ${Object.keys(TEST_EVENTS).join(', ')}`);
    process.exit(1);
  }

  console.log(`\n🧪 Testing ${eventType}...`);
  console.log(`📍 Webhook URL: ${webhookUrl}`);
  console.log(`🔑 Using secret: ${WEBHOOK_SECRET.substring(0, 10)}...`);
  console.log(`\n📦 Payload:`, JSON.stringify(event, null, 2));

  // Generate signature
  const signature = generateSignature(event, WEBHOOK_SECRET);
  console.log(`\n🔐 Generated signature: ${signature.substring(0, 20)}...`);

  // Prepare request
  const url = new URL(webhookUrl);
  const isHttps = url.protocol === 'https:';
  const client = isHttps ? https : http;
  
  const payload = JSON.stringify(event);
  const options = {
    hostname: url.hostname,
    port: url.port || (isHttps ? 443 : 80),
    path: url.pathname,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(payload),
      'dimepay-signature': signature,
      'x-dimepay-signature': signature, // Some systems use x- prefix
      'User-Agent': 'DimePay-Webhook-Test/1.0'
    }
  };

  return new Promise((resolve, reject) => {
    const req = client.request(options, (res) => {
      let data = '';
      
      res.on('data', (chunk) => {
        data += chunk;
      });
      
      res.on('end', () => {
        console.log(`\n📊 Response Status: ${res.statusCode}`);
        console.log(`📋 Response Headers:`, res.headers);
        
        try {
          const jsonData = JSON.parse(data);
          console.log(`📄 Response Body:`, JSON.stringify(jsonData, null, 2));
        } catch (e) {
          console.log(`📄 Response Body:`, data);
        }

        if (res.statusCode >= 200 && res.statusCode < 300) {
          console.log(`\n✅ Webhook test successful!`);
          resolve({ status: res.statusCode, body: data });
        } else {
          console.log(`\n❌ Webhook test failed with status ${res.statusCode}`);
          reject(new Error(`HTTP ${res.statusCode}: ${data}`));
        }
      });
    });

    req.on('error', (error) => {
      console.error(`\n❌ Request error:`, error.message);
      reject(error);
    });

    req.write(payload);
    req.end();
  });
}

// Main execution
async function main() {
  const args = process.argv.slice(2);
  const eventType = args[0] || 'subscription.created';
  const webhookUrl = args[1] || DEFAULT_WEBHOOK_URL;

  console.log('🚀 DimePay Recurring Payments Webhook Test');
  console.log('=' .repeat(50));

  if (!process.env.DIMEPAY_WEBHOOK_SECRET) {
    console.warn('⚠️  Warning: DIMEPAY_WEBHOOK_SECRET not set, using test secret');
    console.warn('   Set it with: export DIMEPAY_WEBHOOK_SECRET=your-secret\n');
  }

  try {
    await testWebhook(eventType, webhookUrl);
    console.log('\n✅ All tests passed!');
    process.exit(0);
  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
    process.exit(1);
  }
}

// Run all event types if 'all' is specified
if (process.argv[2] === 'all') {
  (async () => {
    const webhookUrl = process.argv[3] || DEFAULT_WEBHOOK_URL;
    const events = Object.keys(TEST_EVENTS);
    
    console.log('🚀 Testing All Webhook Events');
    console.log('=' .repeat(50));
    
    for (const eventType of events) {
      try {
        await testWebhook(eventType, webhookUrl);
        await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1s between tests
      } catch (error) {
        console.error(`Failed: ${eventType}`, error.message);
      }
    }
    
    console.log('\n✅ All event tests completed!');
  })();
} else {
  main();
}
