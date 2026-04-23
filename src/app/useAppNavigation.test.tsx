// @vitest-environment jsdom
import { act } from 'react';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { createRoot, Root } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { Role, User } from '../core/types';
import { useAppNavigation } from './useAppNavigation';

const originalActEnvironment = (globalThis as any).IS_REACT_ACT_ENVIRONMENT;

type HookRenderResult<T> = {
  result: { current: T };
  rerender: () => void;
  unmount: () => void;
};

const makeUser = (overrides: Partial<User> = {}): User => ({
  id: 'user-1',
  name: 'Test User',
  email: 'test@example.com',
  role: Role.OWNER,
  isOnboarded: true,
  ...overrides,
});

const renderHook = <T,>(hook: () => T): HookRenderResult<T> => {
  const result = { current: undefined as T };
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root: Root = createRoot(container);

  function TestComponent() {
    result.current = hook();
    return null;
  }

  act(() => {
    root.render(
      <BrowserRouter>
        <TestComponent />
      </BrowserRouter>
    );
  });

  return {
    result,
    rerender: () => {
      act(() => {
        root.render(
          <BrowserRouter>
            <TestComponent />
          </BrowserRouter>
        );
      });
    },
    unmount: () => {
      act(() => {
        root.unmount();
      });
      container.remove();
    },
  };
};

describe('useAppNavigation', () => {
  beforeAll(() => {
    (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  });

  afterAll(() => {
    (globalThis as any).IS_REACT_ACT_ENVIRONMENT = originalActEnvironment;
  });

  afterEach(() => {
    window.history.replaceState({}, '', '/');
    document.body.innerHTML = '';
  });

  it('initializes from the current page query', () => {
    window.history.replaceState({}, '', '/?page=reports');

    const { result, unmount } = renderHook(() => useAppNavigation(makeUser()));

    expect(result.current.currentPath).toBe('reports');
    expect(result.current.editRunId).toBeUndefined();
    unmount();
  });

  it('updates state and url when navigating, including edit run state', () => {
    window.history.replaceState({}, '', '/?token=stale-token&email=old@example.com');
    const { result, unmount } = renderHook(() => useAppNavigation(makeUser()));

    act(() => {
      result.current.navigateTo('payrun', {
        editRunId: 'run-123',
        query: { filter: 'draft' },
      });
    });

    expect(result.current.currentPath).toBe('payrun');
    expect(result.current.editRunId).toBe('run-123');
    expect(window.location.pathname).toBe('/app/payrun');
    expect(window.location.search).toContain('filter=draft');
    expect(window.location.search).not.toContain('stale-token');
    expect(window.location.search).not.toContain('old%40example.com');

    act(() => {
      result.current.navigateTo('dashboard');
    });

    expect(result.current.currentPath).toBe('dashboard');
    expect(window.location.pathname).toBe('/app/dashboard');
    expect(result.current.editRunId).toBeUndefined();
    unmount();
  });

  it('responds to browser history navigation', () => {
    const { result, unmount } = renderHook(() => useAppNavigation(makeUser()));

    act(() => {
      result.current.navigateTo('payrun', { editRunId: 'run-999' });
    });

    window.history.pushState({}, '', '/app/employees');
    act(() => {
      window.dispatchEvent(new PopStateEvent('popstate'));
    });

    expect(result.current.currentPath).toBe('employees');
    expect(result.current.editRunId).toBeUndefined();
    unmount();
  });
});
