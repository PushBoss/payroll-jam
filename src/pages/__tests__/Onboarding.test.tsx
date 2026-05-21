// @vitest-environment jsdom
import React from 'react';
import { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { Onboarding } from '../Onboarding';

// Mock useAuth since Onboarding now imports and uses it
vi.mock('../../context/AuthContext', () => ({
  useAuth: () => ({
    user: {
      id: 'owner-1',
      name: 'Owner User',
      email: 'owner@example.com',
      role: 'OWNER',
    },
  }),
}));

// Mock supabaseClient
vi.mock('../../services/supabaseClient', () => ({
  supabase: {
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: {
          user: {
            email_confirmed_at: '2026-05-20T19:47:48Z',
          },
        },
        error: null,
      }),
      resend: vi.fn().mockResolvedValue({ error: null }),
    },
  },
}));

const setNativeValue = (element: HTMLInputElement | HTMLTextAreaElement, value: string) => {
  const valueSetter = Object.getOwnPropertyDescriptor(element, 'value')?.set;
  const prototype = Object.getPrototypeOf(element);
  const prototypeValueSetter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set;
  
  if (prototypeValueSetter && valueSetter !== prototypeValueSetter) {
    prototypeValueSetter.call(element, value);
  } else if (valueSetter) {
    valueSetter.call(element, value);
  } else {
    element.value = value;
  }
};

describe('Onboarding Wizard Integration Test', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it('navigates through company details, payroll configuration, employee import, email verification, and finishes onboarding', async () => {
    const onCompleteSpy = vi.fn();

    // 1. Render Onboarding component
    act(() => {
      root.render(<Onboarding onComplete={onCompleteSpy} />);
    });

    // Check we are in Step 1
    expect(container.textContent).toContain('Company Information');
    expect(container.textContent).toContain('Company Name');

    // Fill Step 1 Inputs
    const nameInput = container.querySelector('input[type="text"]') as HTMLInputElement;
    expect(nameInput).not.toBeNull();
    act(() => {
      setNativeValue(nameInput, 'ACME Corp');
      nameInput.dispatchEvent(new Event('change', { bubbles: true }));
    });

    // Click Continue
    let continueBtn: HTMLButtonElement | null = null;
    container.querySelectorAll('button').forEach((btn) => {
      if (btn.textContent === 'Continue') {
        continueBtn = btn as HTMLButtonElement;
      }
    });
    expect(continueBtn).not.toBeNull();

    await act(async () => {
      continueBtn!.click();
      await Promise.resolve();
    });

    // We should now be in Step 2: Payroll Configuration
    expect(container.textContent).toContain('Payroll Configuration');
    expect(container.textContent).toContain('Banking Details');

    // Fill Account Number
    const accountInput = container.querySelector('input[placeholder="Account Number"]') as HTMLInputElement;
    expect(accountInput).not.toBeNull();
    act(() => {
      setNativeValue(accountInput, '987654321');
      accountInput.dispatchEvent(new Event('change', { bubbles: true }));
    });

    // Click Continue to step 3
    await act(async () => {
      continueBtn!.click();
      await Promise.resolve();
    });

    // We should now be in Step 3: Import Employees
    expect(container.textContent).toContain('Import Employees');

    // Click Continue to step 4
    await act(async () => {
      continueBtn!.click();
      await Promise.resolve();
    });

    // We should now be in Step 4: Success / You're All Set!
    expect(container.textContent).toContain("You're All Set!");
    expect(container.textContent).toContain('Continue to Verify Email');

    // Find and click "Continue to Verify Email"
    let continueVerifyBtn: HTMLButtonElement | null = null;
    container.querySelectorAll('button').forEach((btn) => {
      if (btn.textContent === 'Continue to Verify Email') {
        continueVerifyBtn = btn as HTMLButtonElement;
      }
    });
    expect(continueVerifyBtn).not.toBeNull();

    await act(async () => {
      continueVerifyBtn!.click();
      await Promise.resolve();
    });

    // We should now be in Step 5: Verify Your Email
    expect(container.textContent).toContain('Verify Your Email');
    expect(container.textContent).toContain('Check Verification Status');

    // Click Check Verification Status (test/mock mode will auto-resolve and call handleFinish)
    let checkStatusBtn: HTMLButtonElement | null = null;
    container.querySelectorAll('button').forEach((btn) => {
      if (btn.textContent === 'Check Verification Status') {
        checkStatusBtn = btn as HTMLButtonElement;
      }
    });
    expect(checkStatusBtn).not.toBeNull();

    await act(async () => {
      checkStatusBtn!.click();
      await Promise.resolve();
    });

    // Verify onComplete was called with correct company data
    expect(onCompleteSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'ACME Corp',
        accountNumber: '987654321',
        bankName: 'NCB',
      }),
      []
    );
  });
});
