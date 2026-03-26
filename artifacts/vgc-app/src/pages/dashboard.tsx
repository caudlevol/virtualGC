import { useState } from "react";
import { useLocation } from "wouter";
import { useLookupProperty, useCreateConversation, useListQuotes } from "@workspace/api-client-react";
import { motion } from "framer-motion";
import { Search, MapPin, Loader2, ArrowRight, Building, DollarSign, FileText, TrendingUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { AppLayout } from "@/components/layout";
import { useAuth } from "@/hooks/use-auth";
import { formatCurrency } from "@/lib/utils";
import { format } from "date-fns";

export default function Dashboard() {
  const { isAuthenticated, isLoading: authLoading } = useAuth(true);
  const [url, setUrl] = useState("");
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const { data: quotesData } = useListQuotes({ limit: 5, offset: 0 });

  const createConvMutation = useCreateConversation({
    mutation: {
      onSuccess: (data: { id: number }) => {
        setLocation(`/chat/${data.id}`);
      },
      onError: () => {
        toast({ title: "Error", description: "Failed to initialize AI workspace", variant: "destructive" });
      }
    }
  });

  const lookupMutation = useLookupProperty({
    mutation: {
      onSuccess: (data: { id: number }) => {
        createConvMutation.mutate({ data: { propertyId: data.id } });
      },
      onError: (err: { data?: { error?: string }; message?: string }) => {
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

  interface RecentQuote {
    id: number;
    title: string;
    totalEstimate: number;
    propertyAddress: string;
    createdAt: string;
    qualityTier: string;
  }

  const recentQuotes = (quotesData?.quotes || []) as RecentQuote[];
  const totalEstimated = recentQuotes.reduce((sum, q) => sum + (q.totalEstimate || 0), 0);

  return (
    <AppLayout>
      <div className="max-w-4xl mx-auto space-y-10">
        <div className="flex flex-col items-center text-center">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-primary/20 to-accent/20 flex items-center justify-center mb-8 shadow-xl shadow-primary/10">
            <Building className="w-8 h-8 text-primary" />
          </div>
          
          <h1 className="text-4xl md:text-5xl font-display font-bold tracking-tight mb-4">
            Start a New Estimate
          </h1>
          <p className="text-lg text-muted-foreground mb-12 max-w-xl">
            Paste any Zillow or Redfin URL below. Virtual GC will extract the property details and prepare an interactive renovation workspace.
          </p>

          <form onSubmit={handleSubmit} className="w-full relative group max-w-3xl">
            <div className="absolute -inset-1 bg-gradient-to-r from-primary to-accent rounded-2xl blur opacity-25 group-hover:opacity-40 transition duration-1000 group-hover:duration-200" />
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
        </div>

        {recentQuotes.length > 0 && (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <Card className="bg-card/50 border-white/5">
                <CardContent className="p-5 flex items-center gap-4">
                  <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                    <FileText className="w-5 h-5 text-primary" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold">{recentQuotes.length}</p>
                    <p className="text-xs text-muted-foreground">Recent Quotes</p>
                  </div>
                </CardContent>
              </Card>
              <Card className="bg-card/50 border-white/5">
                <CardContent className="p-5 flex items-center gap-4">
                  <div className="w-10 h-10 rounded-lg bg-emerald-500/10 flex items-center justify-center">
                    <DollarSign className="w-5 h-5 text-emerald-400" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold">{formatCurrency(totalEstimated)}</p>
                    <p className="text-xs text-muted-foreground">Total Estimated</p>
                  </div>
                </CardContent>
              </Card>
              <Card className="bg-card/50 border-white/5">
                <CardContent className="p-5 flex items-center gap-4">
                  <div className="w-10 h-10 rounded-lg bg-accent/10 flex items-center justify-center">
                    <TrendingUp className="w-5 h-5 text-accent" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold">{recentQuotes.length > 0 ? formatCurrency(totalEstimated / recentQuotes.length) : "$0"}</p>
                    <p className="text-xs text-muted-foreground">Avg Estimate</p>
                  </div>
                </CardContent>
              </Card>
            </div>

            <div>
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Recent Quotes</h3>
                <Button variant="ghost" size="sm" onClick={() => setLocation('/quotes')} className="text-primary">View All</Button>
              </div>
              <div className="space-y-3">
                {recentQuotes.map((quote) => (
                  <motion.div 
                    key={quote.id}
                    whileHover={{ x: 4 }}
                    className="group cursor-pointer"
                    onClick={() => setLocation(`/quotes/${quote.id}`)}
                  >
                    <Card className="bg-card/50 border-white/5 hover:border-primary/20 transition-colors">
                      <CardContent className="p-4 flex items-center justify-between gap-4">
                        <div className="flex items-center gap-4 flex-1 min-w-0">
                          <div className="w-10 h-10 rounded-full bg-secondary flex items-center justify-center shrink-0">
                            <MapPin className="w-5 h-5 text-muted-foreground" />
                          </div>
                          <div className="min-w-0">
                            <p className="font-medium text-sm truncate">{quote.title}</p>
                            <p className="text-xs text-muted-foreground truncate">{quote.propertyAddress} • {format(new Date(quote.createdAt), 'MMM d')}</p>
                          </div>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="font-bold">{formatCurrency(quote.totalEstimate)}</p>
                          <p className="text-[10px] text-muted-foreground capitalize">{quote.qualityTier.replace('_', ' ')}</p>
                        </div>
                      </CardContent>
                    </Card>
                  </motion.div>
                ))}
              </div>
            </div>
          </>
        )}

        {recentQuotes.length === 0 && (
          <Card className="bg-card/50 border-white/5 border-dashed">
            <CardContent className="p-6 flex flex-col sm:flex-row items-center justify-between gap-4">
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-full bg-secondary flex items-center justify-center">
                  <MapPin className="w-5 h-5 text-muted-foreground" />
                </div>
                <div>
                  <p className="font-medium text-sm text-muted-foreground">No quotes yet</p>
                  <p className="text-xs text-muted-foreground/70">Paste a Zillow URL above to get your first estimate.</p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </AppLayout>
  );
}
