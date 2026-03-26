import { useState } from "react";
import { useLocation } from "wouter";
import { useListQuotes, useDeleteQuote } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { AppLayout } from "@/components/layout";
import { formatCurrency } from "@/lib/utils";
import { format } from "date-fns";
import { Loader2, ArrowRight, MapPin, Plus, Search, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";

type QualityTier = "economy" | "mid_range" | "premium";

export default function HistoryPage() {
  const { isAuthenticated, isLoading: authLoading } = useAuth(true);
  const [, setLocation] = useLocation();
  const [search, setSearch] = useState("");
  const [tierFilter, setTierFilter] = useState<QualityTier | "all">("all");
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data, isLoading } = useListQuotes({ limit: 50, offset: 0 });

  const deleteMutation = useDeleteQuote({
    mutation: {
      onSuccess: () => {
        toast({ title: "Quote deleted" });
        queryClient.invalidateQueries({ queryKey: ["/api/quotes"] });
      },
      onError: (err: { data?: { error?: string }; message?: string }) => {
        toast({ title: "Delete failed", description: err?.data?.error || err?.message || "Unknown error", variant: "destructive" });
      }
    }
  });

  if (authLoading || !isAuthenticated) return null;

  interface QuoteItem {
    id: number;
    title: string;
    status: string;
    qualityTier: string;
    totalEstimate: number;
    propertyAddress: string;
    sharedUrlEnabled: boolean;
    createdAt: string;
  }

  const quotes = (data?.quotes || []) as QuoteItem[];
  const filteredQuotes = quotes.filter((q) => {
    const matchesSearch = !search || 
      q.title.toLowerCase().includes(search.toLowerCase()) ||
      q.propertyAddress?.toLowerCase().includes(search.toLowerCase());
    const matchesTier = tierFilter === "all" || q.qualityTier === tierFilter;
    return matchesSearch && matchesTier;
  });

  return (
    <AppLayout>
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-8 gap-4">
        <div>
          <h1 className="text-3xl font-display font-bold tracking-tight">Quote History</h1>
          <p className="text-muted-foreground mt-1">{quotes.length} total estimates</p>
        </div>
        <Button onClick={() => setLocation("/dashboard")}>
          <Plus className="w-4 h-4 mr-2" /> New Quote
        </Button>
      </div>

      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by title or address..."
            className="pl-10 bg-black/20 border-white/10"
          />
        </div>
        <div className="flex items-center gap-1 p-1 bg-secondary/50 rounded-lg">
          {(["all", "economy", "mid_range", "premium"] as const).map((tier) => (
            <button
              key={tier}
              onClick={() => setTierFilter(tier)}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                tierFilter === tier
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {tier === "all" ? "All" : tier === "mid_range" ? "Mid Range" : tier.charAt(0).toUpperCase() + tier.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-muted-foreground" /></div>
      ) : filteredQuotes.length === 0 ? (
        <Card className="bg-card/50 border-dashed p-12 text-center flex flex-col items-center">
          <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mb-4">
            <MapPin className="w-8 h-8 text-primary" />
          </div>
          <h3 className="text-xl font-bold mb-2">{search || tierFilter !== "all" ? "No matching quotes" : "No quotes yet"}</h3>
          <p className="text-muted-foreground mb-6 max-w-sm">
            {search || tierFilter !== "all" ? "Try adjusting your search or filter." : "You haven't generated any estimates yet. Paste a Zillow URL to get started."}
          </p>
          {!search && tierFilter === "all" && (
            <Button onClick={() => setLocation("/dashboard")}>Create your first quote</Button>
          )}
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4">
          {filteredQuotes.map(quote => (
            <Card 
              key={quote.id} 
              className="group bg-card hover:bg-secondary/40 border-border transition-all cursor-pointer overflow-hidden relative"
              onClick={() => setLocation(`/quotes/${quote.id}`)}
            >
              <div className="absolute inset-y-0 left-0 w-1 bg-gradient-to-b from-primary to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
              <div className="p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <h3 className="font-bold text-lg">{quote.title}</h3>
                    <Badge variant="outline" className="text-[10px] uppercase bg-black/20">{quote.status}</Badge>
                    {quote.sharedUrlEnabled && <Badge className="bg-emerald-500/20 text-emerald-400 border-0 text-[10px]">Shared</Badge>}
                  </div>
                  <p className="text-sm text-muted-foreground flex items-center gap-2">
                    <MapPin className="w-3 h-3" /> {quote.propertyAddress} • {format(new Date(quote.createdAt), 'MMM d, yyyy')}
                  </p>
                </div>
                <div className="flex items-center gap-4">
                  <div className="text-right">
                    <p className="font-bold text-xl">{formatCurrency(quote.totalEstimate)}</p>
                    <p className="text-xs text-muted-foreground capitalize">{quote.qualityTier.replace('_', ' ')} Tier</p>
                  </div>
                  <Button 
                    variant="ghost" 
                    size="icon" 
                    className="text-muted-foreground hover:text-destructive hover:bg-destructive/10 opacity-0 group-hover:opacity-100 transition-opacity"
                    onClick={(e) => {
                      e.stopPropagation();
                      deleteMutation.mutate({ quoteId: quote.id });
                    }}
                    disabled={deleteMutation.isPending}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                  <Button variant="ghost" size="icon" className="group-hover:translate-x-1 transition-transform">
                    <ArrowRight className="w-5 h-5 text-primary" />
                  </Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </AppLayout>
  );
}
