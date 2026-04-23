import { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { User } from '../core/types';
import {
  AppRoute,
  getPathForRoute,
  getRouteFromLocation,
  normalizePathname,
  parseRoute,
  TRANSIENT_QUERY_KEYS,
} from './routes';

export interface NavigateOptions {
  editRunId?: string;
  query?: Record<string, string | undefined>;
  replace?: boolean;
  preserveCurrentQuery?: boolean;
}

export type NavigateFunction = (path: AppRoute, options?: NavigateOptions) => void;

export const useAppNavigation = (user: User | null) => {
  const location = useLocation();
  const navigate = useNavigate();
  const [editRunId, setEditRunId] = useState<string | undefined>(undefined);

  const currentPath = useMemo(
    () => getRouteFromLocation(user, { pathname: location.pathname, search: location.search }),
    [location.pathname, location.search, user]
  );

  const navigateTo = useCallback<NavigateFunction>((path, options = {}) => {
    if (options.editRunId) {
      setEditRunId(options.editRunId);
    } else if (path !== 'payrun') {
      setEditRunId(undefined);
    }

    const nextParams = new URLSearchParams(location.search);

    if (!options.preserveCurrentQuery) {
      TRANSIENT_QUERY_KEYS.forEach((key) => nextParams.delete(key));
    }

    nextParams.delete('page');

    Object.entries(options.query || {}).forEach(([key, value]) => {
      if (value === undefined || value === null || value === '') {
        nextParams.delete(key);
      } else {
        nextParams.set(key, value);
      }
    });

    const search = nextParams.toString();

    navigate(
      {
        pathname: getPathForRoute(path),
        search: search ? `?${search}` : '',
        hash: location.hash,
      },
      { replace: options.replace }
    );
  }, [location.hash, location.search, navigate]);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const legacyRoute = parseRoute(params.get('page'));

    if (legacyRoute) {
      params.delete('page');
      const search = params.toString();
      const canonicalPath = getPathForRoute(legacyRoute);

      if (
        normalizePathname(location.pathname) !== normalizePathname(canonicalPath) ||
        location.search.includes('page=')
      ) {
        navigate(
          {
            pathname: canonicalPath,
            search: search ? `?${search}` : '',
            hash: location.hash,
          },
          { replace: true }
        );
      }
      return;
    }

    if (normalizePathname(location.pathname) === '/' && currentPath !== 'home') {
      navigate(
        {
          pathname: getPathForRoute(currentPath),
          search: location.search,
          hash: location.hash,
        },
        { replace: true }
      );
    }
  }, [currentPath, location.hash, location.pathname, location.search, navigate]);

  useEffect(() => {
    if (currentPath !== 'payrun') {
      setEditRunId(undefined);
    }
  }, [currentPath]);

  return {
    currentPath,
    editRunId,
    navigateTo,
  };
};
