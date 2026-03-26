import { AppLayout } from "@/components/layout";
import { useGetAdminOrganizations, useUpdateAdminOrganization } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, Building2, Users, Save } from "lucide-react";
import { useState } from "react";

export default function AdminOrganizations() {
  const { data, isLoading } = useGetAdminOrganizations();
  const queryClient = useQueryClient();

  const updateOrg = useUpdateAdminOrganization({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ["/api/admin/organizations"] });
      },
    },
  });

  if (isLoading) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center min-h-[400px]">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      </AppLayout>
    );
  }

  const orgs = data?.organizations ?? [];

  return (
    <AppLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-display font-bold tracking-tight">Organizations</h1>
          <p className="text-muted-foreground mt-1">
            {data?.total ?? 0} total organizations
          </p>
        </div>

        {orgs.length === 0 ? (
          <Card className="bg-card/50 border-white/5">
            <CardContent className="flex flex-col items-center justify-center py-12">
              <Building2 className="w-12 h-12 text-muted-foreground mb-4" />
              <p className="text-muted-foreground">No organizations created yet</p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4">
            {orgs.map((org) => (
              <OrgCard
                key={org.id}
                org={org}
                onUpdate={(updates) =>
                  updateOrg.mutate({ orgId: org.id, data: updates })
                }
                isPending={updateOrg.isPending}
              />
            ))}
          </div>
        )}
      </div>
    </AppLayout>
  );
}

function OrgCard({
  org,
  onUpdate,
  isPending,
}: {
  org: { id: number; name: string; coBrandName?: string | null; seatCount: number; memberCount?: number; createdAt: string };
  onUpdate: (updates: { name?: string; coBrandName?: string | null; seatCount?: number }) => void;
  isPending: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(org.name);
  const [coBrandName, setCoBrandName] = useState(org.coBrandName || "");
  const [seatCount, setSeatCount] = useState(org.seatCount);

  const handleSave = () => {
    onUpdate({
      name: name !== org.name ? name : undefined,
      coBrandName: coBrandName !== (org.coBrandName || "") ? (coBrandName || null) : undefined,
      seatCount: seatCount !== org.seatCount ? seatCount : undefined,
    });
    setEditing(false);
  };

  return (
    <Card className="bg-card/50 border-white/5">
      <CardHeader className="flex flex-row items-start justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
            <Building2 className="w-5 h-5 text-primary" />
          </div>
          <div>
            {editing ? (
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="h-8 text-base font-semibold bg-transparent border-white/10"
              />
            ) : (
              <CardTitle className="text-base">{org.name}</CardTitle>
            )}
            <p className="text-xs text-muted-foreground mt-0.5">
              Created {new Date(org.createdAt).toLocaleDateString()}
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          {editing ? (
            <Button size="sm" onClick={handleSave} disabled={isPending}>
              {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4 mr-1" />}
              Save
            </Button>
          ) : (
            <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
              Edit
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent>
        <div className="flex flex-wrap gap-4">
          <div className="flex items-center gap-2">
            <Users className="w-4 h-4 text-muted-foreground" />
            <span className="text-sm">
              <Badge variant="outline" className="mr-1">{org.memberCount ?? 0}</Badge>
              members
            </span>
          </div>
          <div className="text-sm text-muted-foreground">
            Seat limit: {editing ? (
              <Input
                type="number"
                min={1}
                value={seatCount}
                onChange={(e) => setSeatCount(Number(e.target.value))}
                className="inline-block w-20 h-7 text-xs bg-transparent border-white/10 ml-1"
              />
            ) : (
              <Badge variant="outline">{org.seatCount}</Badge>
            )}
          </div>
          {(org.coBrandName || editing) && (
            <div className="text-sm text-muted-foreground">
              Co-brand: {editing ? (
                <Input
                  value={coBrandName}
                  onChange={(e) => setCoBrandName(e.target.value)}
                  placeholder="Co-brand name"
                  className="inline-block w-40 h-7 text-xs bg-transparent border-white/10 ml-1"
                />
              ) : (
                <Badge variant="outline">{org.coBrandName}</Badge>
              )}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
