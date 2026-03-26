import { AppLayout } from "@/components/layout";
import { useGetAdminStats } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Users, FileText, Building2, Loader2 } from "lucide-react";

export default function AdminOverview() {
  const { data: stats, isLoading } = useGetAdminStats();

  if (isLoading) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center min-h-[400px]">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      </AppLayout>
    );
  }

  const tierColors: Record<string, string> = {
    free: "bg-zinc-500/10 text-zinc-400 border-zinc-500/20",
    pro: "bg-blue-500/10 text-blue-400 border-blue-500/20",
    enterprise: "bg-amber-500/10 text-amber-400 border-amber-500/20",
  };

  const roleColors: Record<string, string> = {
    agent: "bg-zinc-500/10 text-zinc-400 border-zinc-500/20",
    org_admin: "bg-violet-500/10 text-violet-400 border-violet-500/20",
    super_admin: "bg-red-500/10 text-red-400 border-red-500/20",
  };

  return (
    <AppLayout>
      <div className="space-y-8">
        <div>
          <h1 className="text-3xl font-display font-bold tracking-tight">Admin Dashboard</h1>
          <p className="text-muted-foreground mt-1">Platform overview and management</p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Card className="bg-card/50 border-white/5">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Total Users</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{stats?.totalUsers ?? 0}</div>
            </CardContent>
          </Card>

          <Card className="bg-card/50 border-white/5">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Total Quotes</CardTitle>
              <FileText className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{stats?.totalQuotes ?? 0}</div>
            </CardContent>
          </Card>

          <Card className="bg-card/50 border-white/5">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Organizations</CardTitle>
              <Building2 className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{stats?.totalOrganizations ?? 0}</div>
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Card className="bg-card/50 border-white/5">
            <CardHeader>
              <CardTitle className="text-lg">Users by Subscription Tier</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {Object.entries(stats?.usersByTier ?? {} as Record<string, number>).map(([tier, tierCount]) => (
                  <div key={tier} className="flex items-center justify-between">
                    <Badge variant="outline" className={tierColors[tier] || ""}>
                      {tier}
                    </Badge>
                    <span className="text-lg font-semibold">{tierCount as number}</span>
                  </div>
                ))}
                {Object.keys(stats?.usersByTier ?? {}).length === 0 && (
                  <p className="text-sm text-muted-foreground">No users yet</p>
                )}
              </div>
            </CardContent>
          </Card>

          <Card className="bg-card/50 border-white/5">
            <CardHeader>
              <CardTitle className="text-lg">Users by Role</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {Object.entries(stats?.usersByRole ?? {} as Record<string, number>).map(([role, roleCount]) => (
                  <div key={role} className="flex items-center justify-between">
                    <Badge variant="outline" className={roleColors[role] || ""}>
                      {role}
                    </Badge>
                    <span className="text-lg font-semibold">{roleCount as number}</span>
                  </div>
                ))}
                {Object.keys(stats?.usersByRole ?? {}).length === 0 && (
                  <p className="text-sm text-muted-foreground">No users yet</p>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </AppLayout>
  );
}
