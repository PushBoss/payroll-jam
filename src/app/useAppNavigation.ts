import { useCallback, useEffect, useState } from 'react';
import { User } from '../core/types';
import { AppRoute, getRouteFromLocation, TRANSIENT_QUERY_KEYS } from './routes';

export interface NavigateOptions {
  editRunId?: string;
  query?: Record<string, string | undefined>;
  replace?: boolean;
  preserveCurrentQuery?: boolean;
}

export type NavigateFunction = (path: AppRoute, options?: NavigateOptions) => void;

export const useAppNavigation = (user: User | null) => {
  const [currentPath, setCurrentPath] = useState<AppRoute>(() => getRouteFromLocation(user));
  const [editRunId, setEditRunId] = useState<string | undefined>(undefined);

  const navigateTo = useCallback<NavigateFunction>((path, options = {}) => {
    setCurrentPath(path);

    if (options.editRunId) {
      setEditRunId(options.editRunId);
    } else if (path !== 'payrun') {
      setEditRunId(undefined);
    }

    if (typeof window === 'undefined') return;

    try {
      const newUrl = new URL(window.location.href);

      if (!options.preserveCurrentQuery) {
        TRANSIENT_QUERY_KEYS.forEach((key) => newUrl.searchParams.delete(key));
      }

      newUrl.searchParams.set('page', path);
      Object.entries(options.query || {}).forEach(([key, value]) => {
        if (value === undefined || value === null || value === '') {
          newUrl.searchParams.delete(key);
        } else {
          newUrl.searchParams.set(key, value);
        }
      });

      const method = options.replace ? 'replaceState' : 'pushState';
      window.history[method]({ path }, '', newUrl.toString());
    } catch (error) {
      console.warn('Navigation failed to update URL history:', error);
    }
  }, []);

  useEffect(() => {
    const handlePopState = () => {
      setCurrentPath(getRouteFromLocation(user));
      setEditRunId(undefined);
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [user]);

  return {
    currentPath,
    editRunId,
    navigateTo,
  };
};
