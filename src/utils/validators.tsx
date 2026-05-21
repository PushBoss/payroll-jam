/**
 * Validates a Jamaican Tax Registration Number (TRN)
 * Format: 9 digits (e.g., 123-456-789 or 123456789)
 */
export const isValidTRN = (trn: string): boolean => {
    if (!trn) return false;
    const normalized = trn.toUpperCase().trim();
    if (normalized === 'PENDING') return true;
    // Remove dashes and spaces
    const cleanTRN = trn.replace(/[^0-9]/g, '');

    if (cleanTRN.length !== 9) return false;

    // Optional: Implement Luhn algorithm or specific TRN checksum if required by strict auditing
    // For standard validation, checking 9 digits is the baseline requirement.
    return true;
};

/**
 * Validates a National Insurance Scheme (NIS) Number
 * Format: Letter + 6 Digits (e.g., A123456) or just digits in some legacy systems, 
 * but standard modern format is 1 Letter + 6 Numbers.
 */
export const isValidNIS = (nis: string): boolean => {
    if (!nis) return false;
    const normalized = nis.toUpperCase().trim();
    if (normalized === 'PENDING') return true;
    const cleanNIS = normalized.replace(/[^A-Z0-9]/g, '');

    // Standard Jamaican NIS is typically 1 Letter + 6 Digits (e.g., A123456).
    // However, older or alternative formats can vary, sometimes including a trailing letter (A123456B).
    // We allow any alphanumeric string between 6 and 9 characters to be safe.
    const nisRegex = /^[A-Z0-9]{6,9}$/;
    return nisRegex.test(cleanNIS);
};

/**
 * Basic Email Validator
 */
export const isValidEmail = (email: string): boolean => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
};

/**
 * Formats TRN for display (XXX-XXX-XXX)
 */
export const formatTRN = (trn: string): string => {
    const clean = trn.replace(/[^0-9]/g, '');
    if (clean.length !== 9) return trn;
    return `${clean.slice(0, 3)}-${clean.slice(3, 6)}-${clean.slice(6, 9)}`;
};