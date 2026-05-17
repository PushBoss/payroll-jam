// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  // 1. Verify Cron Security authorization header to prevent malicious runs
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return new NextResponse('Unauthorized trigger', { status: 401 });
  }

  try {
    const today = new Date();
    
    // Calculate target date exactly 5 days from now
    const targetExpiryDate = new Date();
    targetExpiryDate.setDate(today.getDate() + 5);
    
    // Start of target day
    const startOfTargetDay = new Date(targetExpiryDate.setHours(0, 0, 0, 0));
    // End of target day
    const endOfTargetDay = new Date(targetExpiryDate.setHours(23, 59, 59, 999));

    console.log(`Searching subscriptions expiring between ${startOfTargetDay.toISOString()} and ${endOfTargetDay.toISOString()}`);

    // 2. Fetch expiring subscriptions that are flagged to cancel
    // In database terms (SQL dialect example):
    // SELECT * FROM subscriptions WHERE cancel_at_period_end = true AND period_end_date BETWEEN startOfTargetDay AND endOfTargetDay
    const expiringSubscriptions = await db.subscription.findMany({
      where: {
        cancelAtPeriodEnd: true,
        periodEndDate: {
          gte: startOfTargetDay,
          lte: endOfTargetDay
        },
        showExpiryBannerWindow: false // Avoid duplicate updates/notifications
      },
      include: {
        company: {
          select: {
            id: true,
            name: true,
            adminEmail: true
          }
        }
      }
    });

    if (expiringSubscriptions.length === 0) {
      return NextResponse.json({ success: true, count: 0, message: 'No subscriptions expiring in 5 days.' });
    }

    const updates = expiringSubscriptions.map(async (sub) => {
      // A. Update DB to flip showExpiryBannerWindow flag
      await db.subscription.update({
        where: { id: sub.id },
        data: { showExpiryBannerWindow: true }
      });

      // B. Trigger email notification service
      await sendExpiryWarningEmail({
        email: sub.company.adminEmail,
        companyName: sub.company.name,
        daysRemaining: 5,
        expiryDate: sub.periodEndDate
      });
    });

    await Promise.all(updates);

    return NextResponse.json({
      success: true,
      count: expiringSubscriptions.length,
      message: `Successfully processed ${expiringSubscriptions.length} expiring subscription alerts.`
    });
  } catch (error: any) {
    console.error('Expiry Cron Job failure:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

// Mock Email sender utility
async function sendExpiryWarningEmail(params: { email: string; companyName: string; daysRemaining: number; expiryDate: Date }) {
  console.log(`✉️ Sending Expiry Warning Email to ${params.email} for company ${params.companyName}. Expires: ${params.expiryDate}`);
  // Connect your SMTP / SendGrid / Resend client wrapper here
}

// Mock database connection client helper
const db = {
  subscription: {
    findMany: async (args: any) => [] as any[],
    update: async (args: any) => ({})
  }
};
