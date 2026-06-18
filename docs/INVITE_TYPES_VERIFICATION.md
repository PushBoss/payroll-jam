<!-- ai-context
feature: signup-invite-flows
status: current
summary: Documents canonical invite/signup flow query parameters and legacy compatibility behavior.
do-not-change: New invite links should include an explicit flow parameter; legacy params remain supported for old emails already sent.
-->

# Invite Types Verification

## Canonical Rule

New invite links must include `flow` so the app does not infer intent from overlapping `token`, `email`, `type`, `reseller`, or `invitation` parameters.

Supported flows:

- `flow=employee_portal`
- `flow=team_member`
- `flow=reseller_client`
- `flow=company_signup`
- `flow=legacy_user`

Legacy links are still supported by `resolveSignupFlow()` for old emails already in inboxes.

## Active Invite Types

### Employee Portal Invite

Canonical link:

`/?flow=employee_portal&token={token}&email={email}&type=employee`

Legacy accepted:

`/?token={token}&email={email}&type=employee`

Behavior:

- Routes to employee account setup, not Signup.
- Looks up employee by onboarding token.
- Completes through `complete-employee-invite`.
- Creates an email-confirmed `EMPLOYEE` profile.

### Team Member Invite

Canonical link:

`/signup?flow=team_member&email={email}&invitation=true`

Legacy accepted:

`/signup?invitation=true&email={email}`

Behavior:

- Uses Signup in team-invitation mode.
- Hides company signup fields.
- Creates a confirmed invited user.
- Finalizes against pending `account_members` rows.

### Legacy User Invite

Canonical link:

`/signup?flow=legacy_user&token={token}&email={email}&type=user`

Legacy accepted:

`/signup?token={token}&email={email}`

Behavior:

- Supports older Settings invites that created an `app_users` pending row.
- Validates the token against `app_users.onboarding_token` or `preferences.onboardingToken`.
- Migrates the profile to the real Supabase Auth user id.
- Adds an accepted `account_members` row.

### Reseller Client Invite

Canonical link:

`/signup?flow=reseller_client&token={token}&email={email}&reseller=true`

Legacy accepted:

`/?token={token}&email={email}&reseller=true`

Behavior:

- Existing matching logged-in client can accept immediately.
- Anonymous client is sent to Signup with reseller context.
- Company signup finalization accepts the reseller invite.

### Company Signup

Canonical link:

`/signup?flow=company_signup`

Legacy accepted:

`/signup?companyInvite=true`

Behavior:

- Uses normal company signup.
- Server derives final role as `OWNER` or `RESELLER`.
- Requires acquisition source.

## Verification Checklist

- [x] Employee portal invites do not render the company signup form.
- [x] Team member invites use invite mode and skip company fields.
- [x] Reseller client invites preserve reseller context through signup.
- [x] Legacy token/email user invites are treated as `legacy_user`, not company signup.
- [x] Invite query keys are transient and removed during normal app navigation.
- [x] `admin-handler` finalization supports both `account_members` invites and legacy pending `app_users` invites.
