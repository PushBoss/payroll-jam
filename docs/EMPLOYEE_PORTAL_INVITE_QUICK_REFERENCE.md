# Employee Portal Invite Flow - Quick Reference

## Tier Access Matrix

| Plan       | Can Send Employee Portal Invites? | Notes                                    |
|------------|-----------------------------------|------------------------------------------|
| Free       | ❌ No                             | Button not visible                       |
| Starter    | ❌ No                             | Button not visible                       |
| Pro        | ✅ Yes                            | Full access to feature                   |
| Reseller   | ✅ Yes                            | Enterprise accounts are Reseller accounts |

## Employee Status & Button Visibility

| Employee Status       | "Send Invite" Button Visible? | Notes                                    |
|-----------------------|-------------------------------|------------------------------------------|
| ACTIVE                | ✅ Yes (Pro/Reseller only)    | Primary use case                         |
| PENDING_ONBOARDING    | ❌ No                         | Uses "Resend" button instead             |
| PENDING_VERIFICATION  | ❌ No                         | Uses "Verify" button instead             |
| TERMINATED            | ❌ No                         | No longer active employee                |
| ARCHIVED              | ❌ No                         | Removed from active workforce            |

## User Flow

### For Employers (Pro/Reseller Plans)

```
1. Login to Dashboard
   ↓
2. Navigate to "Employees" Tab
   ↓
3. View table of employees
   ↓
4. Find ACTIVE employee
   ↓
5. Click "Send Invite" button
   (Blue button with mail icon)
   ↓
6. System validates plan tier
   ↓
7. Token generated/reused
   ↓
8. Email sent to employee
   ↓
9. Success notification displayed
   ↓
10. Audit log entry created
```

### For Employees Receiving Invite

```
1. Receive email with subject:
   "Invitation to [Company Name] Employee Portal"
   ↓
2. Click secure link in email
   ↓
3. Redirected to employee account setup page
   ↓
4. Enter password to create account
   ↓
5. Account automatically linked to company
   ↓
6. Redirected to employee dashboard
   ↓
7. Access to:
   - View payslips
   - Request leave
   - Update profile
   - View company policies
```

## Technical Flow

```
handleSendLoginInvite(employee)
  ├─ Check: Is plan Pro or Reseller?
  │  ├─ NO  → Show error toast, exit
  │  └─ YES → Continue
  │
  ├─ Get or generate onboarding token
  │  ├─ Token exists? → Reuse it
  │  └─ No token? → Generate new UUID
  │
  ├─ Update employee record with token
  │
  ├─ Build invite link:
  │  └─ ${origin}/?token=${token}&email=${email}&type=employee
  │
  ├─ Send email via emailService.sendEmployeeInvite()
  │  ├─ Email success → Show success toast
  │  └─ Email failed → Show error toast
  │
  └─ Log action in audit trail
```

## Email Content Template

**Subject**: Invitation to [Company Name] Employee Portal

**Body**:
```
Hi [Employee First Name],

You've been invited to access the [Company Name] employee portal!

This portal allows you to:
- View your payslips
- Request time off
- Update your personal information
- And more

Click the link below to set up your account:
[Secure Invite Link]

This link is unique to you and should not be shared.

If you have any questions, please contact your HR department.

Best regards,
[Company Name]
```

## Code Locations

### 1. Invite Handler Function
```typescript
// File: pages/Employees.tsx
// Lines: 151-186
const handleSendLoginInvite = async (emp: Employee) => {
  // Validate plan tier (Pro or Reseller)
  // Generate/reuse token
  // Update employee
  // Send email
  // Log audit
}
```

### 2. UI Button
```tsx
// File: pages/Employees.tsx
// Lines: 1204-1215
{emp.status === 'ACTIVE' && (companyData?.plan === 'Pro' || 
 companyData?.plan === 'Professional' || 
 companyData?.plan === 'Reseller') && (
  <button onClick={() => handleSendLoginInvite(emp)}>
    <Icons.Mail />
    Send Invite
  </button>
)}
```

## Error Handling

| Error Scenario                    | User Feedback                                           | Technical Response              |
|----------------------------------|--------------------------------------------------------|---------------------------------|
| Wrong plan tier                  | Toast: "Only available for Pro/Reseller"               | Function exits early            |
| Email service failure            | Toast: "Failed to send invite email"                   | Error logged, state reset       |
| Employee has no email            | Toast: "Employee email required"                       | Validation in employee form     |
| Network/database error           | Toast: "Network error, please try again"               | Caught by try/catch             |
| Token generation failure         | Toast: "System error, contact support"                 | UUID generation should not fail |

## Benefits

✅ **Quick employee onboarding** - One-click invite sending  
✅ **Secure access** - Token-based authentication  
✅ **Audit trail** - All invites logged for compliance  
✅ **Tier-appropriate** - Premium feature for premium plans  
✅ **User-friendly** - Familiar email invite pattern  
✅ **Self-service** - Employees set their own passwords  
✅ **Reusable** - Can resend invites if needed  

## Troubleshooting

### "Send Invite" button not visible
- Check: Is employee status ACTIVE?
- Check: Is company plan Pro or Reseller?
- Check: Is user viewing the Active Workforce tab?

### Email not received
- Check spam/junk folder
- Verify employee email address is correct
- Check email service configuration
- Review audit logs for send confirmation

### Invite link not working
- Check: Link not expired (tokens don't expire by default)
- Check: Email matches employee record
- Check: Token is valid UUID format
- Try resending invite to generate new token
