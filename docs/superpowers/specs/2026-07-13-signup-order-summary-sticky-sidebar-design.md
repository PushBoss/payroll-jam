<!-- ai-context
feature: signup
status: current
summary: Design for fixing the desktop Order Summary sidebar on Signup.tsx becoming invisible on long forms by switching it from absolute-centered-in-page-height to a viewport-pinned sticky sidebar.
do-not-change: Card internals, mobile bottom-sheet summary behavior, and account/billing step form content are explicitly out of scope and must remain unchanged.
-->

# Design: Sticky Order Summary Sidebar on Signup

**Date:** 2026-07-13
**Status:** Approved — ready for implementation
**Scope:** `src/pages/Signup.tsx`, desktop (`lg:` breakpoint and up) layout only
**Ticket:** ClickUp 86e2ac6fu — "Signup form so long that pricing card is invisible" (High priority)

---

## Problem

On desktop, the Order Summary card (`Signup.tsx:1258-1284`) sits in a right-hand column wrapped in:

```jsx
<div className="hidden lg:block relative flex-1 bg-gray-50 w-0 border-l border-gray-200">
    <div className="absolute inset-0 flex flex-col justify-center px-12">
        <div className="max-w-md mx-auto w-full bg-white p-8 rounded-2xl shadow-lg border border-gray-100">
            {/* Order Summary content */}
        </div>
    </div>
</div>
```

The outer wrapper is a flex sibling of the left-hand form column inside a `min-h-screen ... flex` row (`Signup.tsx:758`). Because flex row siblings stretch to match each other's height, the right column's height equals the *left column's full content height* — not the viewport. The `absolute inset-0 + justify-center` combination then centers the card within that entire page height, not within what's currently visible on screen.

As the signup form has grown (account fields, plan/payment method selection, and now — after the DimePay payment-methods work — an additional bank-transfer/card step), the page has gotten taller, pushing the card's centered position further down a page with no `sticky`/`fixed` positioning to keep it in view while scrolling. The result: the card is frequently off-screen, matching the reported bug.

The mobile layout (`Signup.tsx:1286-1323`) already handles this correctly with a collapsible bottom sheet and is unaffected by this bug or this fix.

---

## Fix

Replace the absolute-centered-in-page-height wrapper with a `position: sticky` wrapper pinned to the viewport:

```jsx
<div className="hidden lg:block flex-1 bg-gray-50 w-0 border-l border-gray-200">
    <div className="sticky top-0 h-screen flex flex-col justify-center px-12 overflow-y-auto py-12">
        <div className="max-w-md mx-auto w-full bg-white p-8 rounded-2xl shadow-lg border border-gray-100">
            {/* Order Summary content - unchanged */}
        </div>
    </div>
</div>
```

- `sticky top-0 h-screen` makes the inner wrapper always occupy exactly one viewport height and stick to the top of the viewport as the page scrolls, rather than stretching to the full page height.
- `justify-center` now centers the card within whatever's currently visible in the viewport, not the entire page — so it stays visible and centered throughout scrolling.
- `overflow-y-auto` is a safety net for short or zoomed viewports where the card's own content could exceed one viewport height.
- `py-12` replaces the vertical centering slack that `inset-0` previously provided, keeping consistent spacing when the card is shorter than the viewport.
- The outer wrapper's `relative` class is dropped since nothing inside it is absolutely positioned anymore.
- No fixed/sticky header exists above this layout (verified — `Signup.tsx:747-758` renders the flex row directly under the optional `PendingInvitationsUI` banner, which is not fixed), so `top-0` is correct with no offset needed.

No other changes: card content, `OrderSummaryBreakdown`, the mobile bottom-sheet component, and both form steps (account, billing) are untouched.

---

## Testing

- Visually confirm on a long viewport (short window height) that the card stays pinned and visible while scrolling through both the account-details step and the billing/payment step, including the new payment-method choice sub-step.
- Confirm the mobile (`lg:hidden`) bottom-sheet summary is unaffected.
- Confirm no fixed header overlaps the sticky card at `top-0`.
