import { ReactNode } from "react";
import { useGetSession } from "@workspace/api-client-react";
import { useLocation } from "wouter";
import { Loader2 } from "lucide-react";

export function AdminGuard({ children }: { children: ReactNode }) {
  const { data: user, isLoading, isError } = useGetSession();
  const [, setLocation] = useLocation();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (isError || !user) {
    setLocation("/login");
    return null;
  }

  if (user.role !== "super_admin") {
    setLocation("/dashboard");
    return null;
  }

  return <>{children}</>;
}
