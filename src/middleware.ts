// @ts-nocheck
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// Configuration to match all protected workspace and dashboard routes
export const config = {
  matcher: [
    '/dashboard/:path*',
    '/employees/:path*',
    '/timesheets/:path*',
    '/payrun/:path*',
    '/leave/:path*',
    '/documents/:path*',
    '/reports/:path*',
    '/compliance/:path*',
    '/settings/:path*',
  ],
};

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  
  // 1. Retrieve session token/JWT from cookies
  const token = request.cookies.get('session_token')?.value;
  if (!token) {
    // If no token exists, fallback to standard authentication flow redirect
    return NextResponse.redirect(new URL('/login', request.url));
  }

  try {
    // 2. Mock token decoding/verification to retrieve active company subscription details
    // In production, decode JWT or fetch from cache/Redis database for fast Edge checks
    const subscription = await getCachedSubscription(token);

    if (!subscription) {
      return NextResponse.next();
    }

    const now = new Date();
    const periodEnd = new Date(subscription.periodEndDate);
    const isSuspended = now > periodEnd && subscription.status !== 'active_paid';

    // 3. Apply Route Guard redirection logic
    if (isSuspended) {
      // Allow access specifically to the suspension layout and sandbox actions
      const allowedSuspendedPaths = [
        '/billing/suspended',
        '/billing/suspended/sandbox'
      ];
      
      const isRouteAllowedUnderSuspension = allowedSuspendedPaths.some(path => 
        pathname.startsWith(path)
      );

      if (!isRouteAllowedUnderSuspension) {
        console.warn(`🔒 Paywall redirected user to suspension. Path: ${pathname}`);
        return NextResponse.redirect(new URL('/billing/suspended', request.url));
      }
    }
  } catch (err) {
    console.error('Middleware subscription check failed:', err);
  }

  return NextResponse.next();
}

/**
 * Placeholder logic for decrypting session and resolving billing subscription status.
 * Integrate with Redis (e.g., Upstash) or decryption logic for microsecond performance at edge.
 */
async function getCachedSubscription(token: string): Promise<any> {
  // Decode JWT contents
  try {
    const payloadBase64 = token.split('.')[1];
    const decodedPayload = JSON.parse(atob(payloadBase64));
    return decodedPayload.subscription || null;
  } catch {
    return null;
  }
}
