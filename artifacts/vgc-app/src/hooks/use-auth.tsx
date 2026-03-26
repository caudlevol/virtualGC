import { useEffect } from "react";
import { useLocation } from "wouter";
import { useGetSession } from "@workspace/api-client-react";

export function useAuth(requireAuth = true) {
  const [, setLocation] = useLocation();
  const { data: session, isLoading, error } = useGetSession({
    query: {
      queryKey: ["/api/auth/session"],
      retry: false,
      staleTime: 5 * 60 * 1000,
    }
  });

  useEffect(() => {
    if (!isLoading && requireAuth && (error || !session)) {
      setLocation("/login");
    }
  }, [isLoading, error, session, requireAuth, setLocation]);

  return {
    user: session,
    isLoading,
    isAuthenticated: !!session && !error,
  };
}
