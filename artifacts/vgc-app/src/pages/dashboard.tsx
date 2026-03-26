import { useState } from "react";
import { useLocation } from "wouter";
import { useLookupProperty, useCreateConversation } from "@workspace/api-client-react";
import { motion } from "framer-motion";
import { Search, MapPin, Loader2, ArrowRight, Building } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { AppLayout } from "@/components/layout";
import { useAuth } from "@/hooks/use-auth";

export default function Dashboard() {
  const { isAuthenticated, isLoading: authLoading } = useAuth(true);
  const [url, setUrl] = useState("");
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const createConvMutation = useCreateConversation({
    mutation: {
      onSuccess: (data) => {
        setLocation(`/chat/${data.id}`);
      },
      onError: () => {
        toast({ title: "Error", description: "Failed to initialize AI workspace", variant: "destructive" });
      }
    }
  });

  const lookupMutation = useLookupProperty({
    mutation: {
      onSuccess: (data) => {
        createConvMutation.mutate({ data: { propertyId: data.id } });
      },
      onError: (err: any) => {
        toast({ title: "Lookup Failed", description: err?.data?.error || err?.message || "Could not find property", variant: "destructive" });
      }
    }
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!url) return;
    lookupMutation.mutate({ data: { zillowUrl: url } });
  };

  const isPending = lookupMutation.isPending || createConvMutation.isPending;

  if (authLoading || !isAuthenticated) return null;

  return (
    <AppLayout>
      <div className="flex flex-col items-center justify-center min-h-[70vh] max-w-3xl mx-auto text-center">
        <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-primary/20 to-accent/20 flex items-center justify-center mb-8 shadow-xl shadow-primary/10">
          <Building className="w-8 h-8 text-primary" />
        </div>
        
        <h1 className="text-4xl md:text-5xl font-display font-bold tracking-tight mb-4">
          Start a New Estimate
        </h1>
        <p className="text-lg text-muted-foreground mb-12 max-w-xl">
          Paste any Zillow or Redfin URL below. Virtual GC will extract the property details and prepare an interactive renovation workspace.
        </p>

        <form onSubmit={handleSubmit} className="w-full relative group">
          <div className="absolute -inset-1 bg-gradient-to-r from-primary to-accent rounded-2xl blur opacity-25 group-hover:opacity-40 transition duration-1000 group-hover:duration-200"></div>
          <div className="relative flex items-center glass-panel rounded-xl p-2 pl-6">
            <Search className="w-6 h-6 text-muted-foreground mr-4" />
            <Input 
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://www.zillow.com/homedetails/..." 
              className="flex-1 border-0 bg-transparent text-lg focus-visible:ring-0 focus-visible:ring-offset-0 px-0 placeholder:text-muted-foreground/50 h-14"
              disabled={isPending}
            />
            <Button size="lg" type="submit" disabled={!url || isPending} className="rounded-lg px-8 h-12 ml-2">
              {isPending ? <Loader2 className="w-5 h-5 animate-spin" /> : "Analyze"}
              {!isPending && <ArrowRight className="w-5 h-5 ml-2" />}
            </Button>
          </div>
        </form>

        <div className="mt-16 w-full text-left">
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-6">Recent Activity</h3>
          {/* Quick placeholder for dashboard feeling, actual history is on /quotes */}
          <Card className="bg-card/50 border-white/5 border-dashed">
            <CardContent className="p-6 flex flex-col sm:flex-row items-center justify-between gap-4">
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-full bg-secondary flex items-center justify-center">
                  <MapPin className="w-5 h-5 text-muted-foreground" />
                </div>
                <div>
                  <p className="font-medium text-sm text-muted-foreground">Looking for past quotes?</p>
                  <p className="text-xs text-muted-foreground/70">Access your complete history from the top navigation.</p>
                </div>
              </div>
              <Button variant="outline" size="sm" onClick={() => setLocation('/quotes')}>View History</Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </AppLayout>
  );
}
