import { ReactNode } from "react";
import { Link, useLocation } from "wouter";
import { useLogout, useGetSession } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Building, LayoutDashboard, History, LogOut, Loader2, Sparkles } from "lucide-react";
import { motion } from "framer-motion";

export function AppLayout({ children }: { children: ReactNode }) {
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const { data: user } = useGetSession();
  const logout = useLogout({
    mutation: {
      onSuccess: () => {
        queryClient.clear();
        setLocation("/");
      }
    }
  });

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <header className="sticky top-0 z-50 w-full border-b border-white/5 bg-background/80 backdrop-blur-xl">
        <div className="container mx-auto px-4 h-16 flex items-center justify-between">
          <Link href="/dashboard" className="flex items-center gap-2 group">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary to-accent flex items-center justify-center shadow-lg shadow-primary/20 group-hover:shadow-primary/40 transition-all">
              <Building className="w-4 h-4 text-white" />
            </div>
            <span className="font-display font-bold text-lg tracking-tight">Virtual<span className="text-primary">GC</span></span>
          </Link>

          <nav className="hidden md:flex items-center gap-6">
            <Link href="/dashboard" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors flex items-center gap-2">
              <LayoutDashboard className="w-4 h-4" />
              Workspace
            </Link>
            <Link href="/quotes" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors flex items-center gap-2">
              <History className="w-4 h-4" />
              Quote History
            </Link>
          </nav>

          <div className="flex items-center gap-4">
            <div className="hidden sm:flex flex-col items-end mr-2">
              <span className="text-sm font-semibold">{user?.name}</span>
              <span className="text-xs text-muted-foreground">{user?.brokerage || user?.orgName || 'Agent'}</span>
            </div>
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={() => logout.mutate()}
              disabled={logout.isPending}
              className="text-muted-foreground hover:text-destructive hover:bg-destructive/10"
            >
              {logout.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <LogOut className="w-4 h-4" />}
            </Button>
          </div>
        </div>
      </header>

      <main className="flex-1 container mx-auto px-4 py-8 max-w-6xl">
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
        >
          {children}
        </motion.div>
      </main>
    </div>
  );
}
