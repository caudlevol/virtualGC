import { ReactNode, useEffect } from "react";
import { useGetSession } from "@workspace/api-client-react";
import { useLocation } from "wouter";
import { Loader2 } from "lucide-react";

export function AdminGuard({ children }: { children: ReactNode }) {
  const { data: user, isLoading, isError } = useGetSession();
  const [, setLocation] = useLocation();

  const needsRedirect = !isLoading && (isError || !user || user.role !== "super_admin");
  const redirectTarget = !user || isError ? "/login" : "/dashboard";

  useEffect(() => {
    if (needsRedirect) {
      setLocation(redirectTarget);
    }
  }, [needsRedirect, redirectTarget, setLocation]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (needsRedirect) {
    return null;
  }

  return <>{children}</>;
}
