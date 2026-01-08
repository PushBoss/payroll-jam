// This script is just a scratchpad to manually check the logic logic with mock values
// It doesn't run in the browser
const user = {
    role: 'ADMIN',
    originalRole: 'RESELLER',
    email: 'info@pushtechsolutions.com'
};

const isImpersonating = !!user?.originalRole;
console.log('isImpersonating:', isImpersonating); // Should be true
