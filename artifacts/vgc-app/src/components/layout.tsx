import { ReactNode } from "react";
import { Link, useLocation } from "wouter";
import { useLogout, useGetSession } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Building, LayoutDashboard, History, LogOut, Loader2 } from "lucide-react";

export function AppLayout({ children }: { children: ReactNode }) {
  const [location, setLocation] = useLocation();
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

  const navItems = [
    { href: "/dashboard", label: "Workspace", icon: LayoutDashboard },
    { href: "/quotes", label: "History", icon: History },
  ];

  return (
    <div className="min-h-screen flex bg-background">
      <aside className="hidden md:flex flex-col w-64 border-r border-white/5 bg-background/50 backdrop-blur-xl fixed inset-y-0 left-0 z-40 print:hidden">
        <div className="p-5 border-b border-white/5">
          <Link href="/dashboard" className="flex items-center gap-2 group">
            <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-primary to-accent flex items-center justify-center shadow-lg shadow-primary/20 group-hover:shadow-primary/40 transition-all">
              <Building className="w-4 h-4 text-white" />
            </div>
            <span className="font-display font-bold text-lg tracking-tight">Virtual<span className="text-primary">GC</span></span>
          </Link>
        </div>

        <nav className="flex-1 p-4 space-y-1">
          {navItems.map(({ href, label, icon: Icon }) => {
            const active = location === href || (href === "/quotes" && location.startsWith("/quotes"));
            return (
              <Link
                key={href}
                href={href}
                className={`flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all ${
                  active
                    ? "bg-primary/10 text-primary border border-primary/20"
                    : "text-muted-foreground hover:text-foreground hover:bg-white/5"
                }`}
              >
                <Icon className="w-5 h-5" />
                {label}
              </Link>
            );
          })}
        </nav>

        <div className="p-4 border-t border-white/5">
          <div className="flex items-center gap-3 px-3 mb-3">
            <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center text-primary text-sm font-bold">
              {user?.name?.charAt(0) || "U"}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold truncate">{user?.name}</p>
              <p className="text-xs text-muted-foreground truncate">{user?.coBrandName || user?.orgName || "Agent"}</p>
            </div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => logout.mutate()}
            disabled={logout.isPending}
            className="w-full justify-start text-muted-foreground hover:text-destructive hover:bg-destructive/10"
          >
            {logout.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <LogOut className="w-4 h-4 mr-2" />}
            Log Out
          </Button>
        </div>
      </aside>

      <div className="flex-1 md:ml-64 pb-16 md:pb-0">
        <main className="container mx-auto px-4 py-8 max-w-6xl">
          {children}
        </main>
      </div>

      <nav className="fixed bottom-0 left-0 right-0 z-50 md:hidden bg-background/95 backdrop-blur-xl border-t border-white/5 print:hidden">
        <div className="flex items-center justify-around h-16">
          {navItems.map(({ href, label, icon: Icon }) => {
            const active = location === href;
            return (
              <Link key={href} href={href} className={`flex flex-col items-center gap-1 px-4 py-2 transition-colors ${active ? "text-primary" : "text-muted-foreground"}`}>
                <Icon className="w-5 h-5" />
                <span className="text-[10px] font-medium">{label}</span>
              </Link>
            );
          })}
          <button
            onClick={() => logout.mutate()}
            disabled={logout.isPending}
            className="flex flex-col items-center gap-1 px-4 py-2 text-muted-foreground"
          >
            {logout.isPending ? <Loader2 className="w-5 h-5 animate-spin" /> : <LogOut className="w-5 h-5" />}
            <span className="text-[10px] font-medium">Log Out</span>
          </button>
        </div>
      </nav>
    </div>
  );
}
