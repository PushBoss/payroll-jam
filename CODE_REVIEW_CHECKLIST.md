# Code Review Checklist: Payroll-Jam

## 1. Security (Critical)
- [x] No leaking of `SUPABASE_SERVICE_ROLE_KEY` in client-side code. *(Verified 2026-04-22: 0 references in `/src`)*
- [x] No sensitive keys in `localStorage` or hardcoded. *(`.env` gitignored, no SERVICE_ROLE in client)*
- [ ] RLS policies are applied for new tables.
- [x] Role checks are performed for sensitive operations (`user.role === Role.OWNER` etc.). *(admin-handler verifies caller role)*
- [ ] User input is sanitized/validated before DB insertion.

## 2. Architecture & Patterns
- [x] Business logic is in `utils/` or `hooks/`, not directly in the View (JSX).
- [x] Large components are broken down into smaller, functional components.
- [x] New services are modular (avoiding making `supabaseService.ts` larger). *(Façade delegates to focused services)*
- [x] TypeScript types are used accurately (avoid using `any`). *(Reduced from 223 → 151 total `any` usages via DB row types, coercion helpers, and typed callbacks. Remaining are mostly external SDK types, test files, and catch blocks.)*

## 3. Payroll Consistency
- [ ] Calculations utilize centralized `taxUtils.ts` constants.
- [ ] Financial figures are rounded consistently (2 decimal places).
- [ ] Pay period boundaries are checked for overlap or gaps.

## 4. UI/UX Excellence
- [ ] Loading states are managed for all async operations.
- [ ] Error messages are user-friendly and actionable via `toast`.
- [ ] Responsive design is maintained (Mobile/Desktop check).
- [ ] Icons use the `Icons` wrapper component.

## 5. Performance
- [ ] Expensive calculations are wrapped in `useMemo`.
- [ ] List items use stable `key` props.
- [ ] Large data sets use lazy loading or pagination.

## 6. Documentation
- [ ] Complex logic has explanatory comments.
- [ ] `README.md` or `MODULE_SPEC.md` updated if architectural changes occurred.
- [ ] Public API/Hooks have proper JSDoc.
