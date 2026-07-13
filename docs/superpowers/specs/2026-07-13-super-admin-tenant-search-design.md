<!-- ai-context
feature: super-admin/tenants
status: current
summary: Design for moving Super Admin tenant search and status filtering from broken client-side (current-page-only) filtering to server-side filtering across all tenants, and adding contact name/phone as searchable fields.
do-not-change: Enrichment logic (owner lookup, employee counts, MRR calc) in get-all-companies is unchanged - only filter predicates are added ahead of the existing sort+paginate step.
-->

# Design: Super Admin Tenant Search & Status Filter Fix

**Date:** 2026-07-13
**Status:** Approved — ready for implementation
**Scope:** `supabase/functions/admin-handler/index.ts` (`get-all-companies` action), `src/pages/SuperAdmin.tsx` (tenants tab)
**Ticket:** ClickUp 86e2ab9k7 — "Super admin tenants search" (Normal priority) — "Doesn't search by name, or phone. Currently it searches by email and company name."

---

## Problem

`SuperAdmin.tsx:1874-1877` filters tenants by search term and status entirely client-side, over `tenants` — a React state array that only ever holds the *current page* of 20 tenants (`TENANTS_PER_PAGE`), fetched server-side via the `get-all-companies` admin-handler action with `page`/`pageSize` params. The fetch `useEffect` (`SuperAdmin.tsx:1075-1097`) depends on `[activeTab, tenantPage, tenantActivitySort]` — neither `searchTerm` nor `filterStatus` triggers a re-fetch.

This causes two problems, one reported and one discovered during design:

1. **Reported**: search only checks `companyName` and `email`, not name (owner/contact name) or phone.
2. **Discovered**: even for the fields that "work," search and the status filter only ever look at the 20 tenants on the currently-viewed page. A tenant on page 3 is invisible to search while viewing page 1, regardless of which fields are checked. The status filter buttons (`ALL`/`ACTIVE`/`SUSPENDED`) have the identical bug.

The backend already computes everything needed to fix both: `get-all-companies` builds an `enriched` array (`admin-handler/index.ts:2269-2307`) containing `companyName`, `email`, `contactName`, `phone`, and `status` for **every** company (not just the current page) before slicing it down to the requested page (`admin-handler/index.ts:2309-2310`). The data required for a correct, full-dataset search already exists in that in-memory array — it's just discarded after slicing instead of being filtered first.

---

## Fix

### Backend: `get-all-companies` (`admin-handler/index.ts:2254`)

Accept two new optional payload fields: `search: string` and `status: 'ALL' | 'ACTIVE' | 'SUSPENDED'`. Insert a filter step on the `enriched` array, between enrichment and sorting:

```ts
const searchLower = String(payload?.search || '').trim().toLowerCase();
const statusFilter = payload?.status || 'ALL';

const filtered = enriched.filter((c) => {
  const matchesSearch = !searchLower || [c.companyName, c.email, c.contactName, c.phone]
    .some((value) => String(value || '').toLowerCase().includes(searchLower));
  const matchesStatus = statusFilter === 'ALL' || c.status === statusFilter;
  return matchesSearch && matchesStatus;
});

const sorted = sortByClientActivity(filtered, sort);
const paged = sorted.slice(from, to + 1);

return new Response(JSON.stringify({ companies: paged, total: filtered.length }), { ... });
```

`total` changes from the raw unfiltered company `count` to `filtered.length`, so the frontend's `totalPages = Math.ceil(tenantTotal / TENANTS_PER_PAGE)` and "Showing X–Y of Z tenants" text stay correct against the filtered result set. No changes to the enrichment `Promise.all` block itself (owner lookup, employee counts, MRR) — this is purely a filter step inserted before the existing sort/slice.

### Frontend: `SuperAdmin.tsx`

- Add a debounced search value: `const [debouncedSearchTerm, setDebouncedSearchTerm] = useState('')`, updated via a `useEffect` on `searchTerm` with a ~350ms `setTimeout`/`clearTimeout`, so typing doesn't fire a request per keystroke.
- Send `search: debouncedSearchTerm` and `status: filterStatus` in the `get-all-companies` payload.
- Change the fetch `useEffect`'s dependency array to `[activeTab, tenantPage, tenantActivitySort, debouncedSearchTerm, filterStatus]`.
- Remove the client-side `matchesSearch`/`matchesFilter` predicate at `SuperAdmin.tsx:1874-1877` — `filteredTenants` becomes `sortTenantsForTable(tenants, tenantTableSort)` directly, since `tenants` is now already the correctly filtered+paginated set from the server. `sortTenantsForTable` (client-side column-header re-sort within the current page) is unrelated and stays as-is.
- Add `setTenantPage(0)` to the status filter buttons' `onClick` (search already resets the page on input change), so switching filters never strands the user on a page that no longer exists in the filtered set.

---

## Testing

- Search by a tenant's contact name and phone number (previously unsearchable) and confirm it's found.
- Search for a tenant known to be on page 2+ while viewing page 1 and confirm it's found (validates the cross-page fix).
- Switch the status filter and confirm the page resets to 0 and the "Showing X–Y of Z" count reflects the filtered total, not the full tenant count.
- Confirm typing in the search box doesn't fire a network request on every keystroke (debounce working).
- Confirm sorting (activity sort dropdown and table column sort) still works correctly against filtered results.
