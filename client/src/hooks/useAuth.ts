import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo } from "react";
import type { User } from "@shared/schema";

const AUTH_CACHE_KEY = "wisequery_auth_cache";

interface AuthCache {
  isAuthenticated: boolean;
  timestamp: number;
}

function getAuthCache(): AuthCache | null {
  try {
    const cached = sessionStorage.getItem(AUTH_CACHE_KEY);
    if (!cached) return null;
    
    const parsed: AuthCache = JSON.parse(cached);
    const fiveMinutes = 5 * 60 * 1000;
    if (Date.now() - parsed.timestamp > fiveMinutes) {
      sessionStorage.removeItem(AUTH_CACHE_KEY);
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function setAuthCache(isAuthenticated: boolean): void {
  try {
    const cache: AuthCache = {
      isAuthenticated,
      timestamp: Date.now(),
    };
    sessionStorage.setItem(AUTH_CACHE_KEY, JSON.stringify(cache));
  } catch {
    // Ignore storage errors
  }
}

export function clearAuthCache(): void {
  try {
    sessionStorage.removeItem(AUTH_CACHE_KEY);
  } catch {
    // Ignore storage errors
  }
}

export function useAuth() {
  const cachedAuth = useMemo(() => getAuthCache(), []);
  
  const { data: user, isLoading: isQueryLoading, isFetched } = useQuery<User>({
    queryKey: ["/api/auth/user"],
    retry: false,
    staleTime: 30 * 1000,
  });

  useEffect(() => {
    if (isFetched) {
      setAuthCache(!!user);
    }
  }, [user, isFetched]);

  // Only trust the cache when it says the user IS authenticated.
  // A cached "false" state can be stale — e.g., after an OAuth login that redirected
  // back to "/", sessionStorage still holds the pre-login false value.
  // Trusting stale "false" causes an immediate render of the landing page (blank flash)
  // before the fresh /api/auth/user response arrives with the actual logged-in user.
  const isTrustedCache = cachedAuth?.isAuthenticated === true;
  const isLoading = isTrustedCache ? false : isQueryLoading;

  return {
    user,
    isLoading,
    isAuthenticated: isFetched ? !!user : (isTrustedCache ? true : false),
  };
}
