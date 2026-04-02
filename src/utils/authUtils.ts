import { User } from '../core/types';

/**
 * Resolves the effective company_id for the current user.
 * Correctly handles:
 * 1. Standard users (uses profile company_id)
 * 2. Resellers (uses active impersonation company_id or profile company_id)
 * 3. Admins
 */
export const get_current_company_id = (user: User | null): string | null => {
    if (!user) return null;

    // If impersonating (Reseller view), prioritize the target company
    if ((user as any).isResellerView || (user as any).originalRole) {
        return user.companyId || null;
    }

    // Fallback to the user's primary company_id
    return user.companyId || null;
};
