import { useState } from "react";
import { useRoute, useLocation } from "wouter";
import { useGetQuote, useToggleShareQuote, useDeleteQuote, useGenerateQuote } from "@workspace/api-client-react";
import { AppLayout } from "@/components/layout";
import { formatCurrency } from "@/lib/utils";
import { format } from "date-fns";
import { Loader2, Share2, CheckCircle, AlertTriangle, Building, MapPin, Printer, Trash2, Info, Download } from "lucide-react";
import { generateQuotePdf } from "@/lib/pdfGenerator";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";

type QualityTier = "economy" | "mid_range" | "premium";

const tierLabels: Record<QualityTier, string> = {
  economy: "Economy",
  mid_range: "Mid Range",
  premium: "Premium",
};

export default function QuoteView() {
  const { isAuthenticated, isLoading: authLoading } = useAuth(true);
  const [, params] = useRoute("/quotes/:id");
  const [, setLocation] = useLocation();
  const id = parseInt(params?.id || "0");
  const { toast } = useToast();

  const { data: quote, isLoading, refetch } = useGetQuote(id);

  const shareMutation = useToggleShareQuote({
    mutation: {
      onSuccess: (data: { sharedUrlEnabled: boolean }) => {
        toast({ title: data.sharedUrlEnabled ? "Sharing enabled" : "Sharing disabled" });
        refetch();
      },
      onError: (err: { status?: number; data?: { error?: string }; message?: string }) => {
        if (err.status === 403) {
          toast({ title: "Upgrade Required", description: "Sharing requires a Pro subscription", variant: "destructive" });
        }
      }
    }
  });

  const regenerateMutation = useGenerateQuote({
    mutation: {
      onSuccess: (data: { id: number }) => {
        setLocation(`/quotes/${data.id}`);
        toast({ title: "Quote regenerated with new quality tier" });
      },
      onError: (err: { data?: { error?: string }; message?: string }) => {
        toast({ title: "Regeneration failed", description: err?.data?.error || err?.message || "Unknown error", variant: "destructive" });
      }
    }
  });

  const deleteMutation = useDeleteQuote({
    mutation: {
      onSuccess: () => {
        toast({ title: "Quote deleted" });
        setLocation("/quotes");
      },
      onError: (err: { data?: { error?: string }; message?: string }) => {
        toast({ title: "Delete failed", description: err?.data?.error || err?.message || "Unknown error", variant: "destructive" });
      }
    }
  });

  if (authLoading || !isAuthenticated) return null;
  if (isLoading) return <AppLayout><div className="flex justify-center p-20"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div></AppLayout>;
  if (!quote) return <AppLayout><div className="text-center p-20 text-muted-foreground">Quote not found.</div></AppLayout>;

  interface LineItem {
    id: number;
    category: string;
    description: string;
    quantity: number;
    unit: string;
    materialCost: number;
    laborCost: number;
    subtotal: number;
  }

  const groupedItems = (quote.lineItems as LineItem[]).reduce<Record<string, LineItem[]>>((acc, item) => {
    if (!acc[item.category]) acc[item.category] = [];
    acc[item.category].push(item);
    return acc;
  }, {});

  const handleShare = () => {
    if (quote.sharedUrlEnabled) {
      navigator.clipboard.writeText(`${window.location.origin}/quote/${quote.shareUuid}`);
      toast({ title: "Copied to clipboard!" });
    } else {
      shareMutation.mutate({ quoteId: id, data: { enabled: true } });
    }
  };

  const handleDisableShare = () => {
    shareMutation.mutate({ quoteId: id, data: { enabled: false } });
  };

  const handleTierChange = (tier: QualityTier) => {
    if (tier === quote.qualityTier || !quote.conversationId) return;
    regenerateMutation.mutate({ data: { conversationId: quote.conversationId, qualityTier: tier, title: quote.title } });
  };

  const currentTier = quote.qualityTier as QualityTier;

  const claudeFlags = (() => {
    if (!quote.claudeReview || typeof quote.claudeReview !== "object") return [];
    const review = quote.claudeReview as { flags?: Array<{ item: string; issue: string }> };
    return review.flags || [];
  })();

  return (
    <AppLayout>
      <div className="max-w-5xl mx-auto space-y-6 sm:space-y-8 pb-20">
        
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 sm:gap-6 pb-4 sm:pb-6 border-b border-white/10">
          <div>
            <Badge variant="outline" className="mb-2 sm:mb-3 border-primary/30 text-primary bg-primary/5">{quote.status.toUpperCase()}</Badge>
            <h1 className="text-2xl sm:text-3xl md:text-4xl font-display font-bold tracking-tight mb-1 sm:mb-2">{quote.title}</h1>
            {quote.property && (
              <p className="text-sm sm:text-base text-muted-foreground flex items-center gap-2">
                <MapPin className="w-4 h-4 shrink-0" /> <span className="truncate">{quote.property.address}</span>
              </p>
            )}
          </div>
          <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
            <Button variant="outline" size="sm" onClick={() => generateQuotePdf(quote as Parameters<typeof generateQuotePdf>[0])} className="bg-transparent touch-target">
              <Download className="w-4 h-4 mr-1.5" /> PDF
            </Button>
            <Button variant="outline" size="sm" onClick={() => window.print()} className="bg-transparent touch-target">
              <Printer className="w-4 h-4 mr-1.5" /> Print
            </Button>
            <Button size="sm" onClick={handleShare} className={`touch-target ${quote.sharedUrlEnabled ? "bg-emerald-600 hover:bg-emerald-700" : ""}`}>
              <Share2 className="w-4 h-4 mr-1.5" /> 
              {quote.sharedUrlEnabled ? "Copy Link" : "Share"}
            </Button>
            {quote.sharedUrlEnabled && (
              <Button variant="ghost" size="sm" onClick={handleDisableShare} className="text-muted-foreground hover:text-destructive touch-target">
                Disable
              </Button>
            )}
            <Button variant="ghost" size="sm" onClick={() => deleteMutation.mutate({ quoteId: id })} disabled={deleteMutation.isPending} className="text-muted-foreground hover:text-destructive hover:bg-destructive/10 touch-target">
              <Trash2 className="w-4 h-4" />
            </Button>
          </div>
        </div>

        <div className="flex items-center gap-1 sm:gap-2 p-1 bg-secondary/50 rounded-lg w-full sm:w-fit overflow-x-auto scrollbar-hide">
          {(Object.keys(tierLabels) as QualityTier[]).map((tier) => (
            <button
              key={tier}
              onClick={() => handleTierChange(tier)}
              disabled={regenerateMutation.isPending || currentTier === tier}
              className={`flex-1 sm:flex-none px-3 sm:px-4 py-2.5 sm:py-2 rounded-md text-sm font-medium transition-all touch-target ${
                currentTier === tier
                  ? "bg-primary text-primary-foreground shadow-lg"
                  : "text-muted-foreground hover:text-foreground hover:bg-white/5"
              }`}
            >
              {tierLabels[tier]}
            </button>
          ))}
          {regenerateMutation.isPending && <Loader2 className="w-4 h-4 animate-spin text-primary ml-2 shrink-0" />}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-6">
          <Card className="md:col-span-2 bg-card border-border shadow-xl">
            <CardHeader className="bg-secondary/50 border-b border-border pb-3 sm:pb-4">
              <CardTitle className="text-base sm:text-lg flex items-center gap-2">
                <Building className="w-5 h-5 text-primary" />
                Scope of Work
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {Object.entries(groupedItems).map(([category, items], idx) => (
                <div key={category} className={`p-3 sm:p-6 ${idx !== 0 ? 'border-t border-border' : ''}`}>
                  <h3 className="text-base sm:text-lg font-bold capitalize mb-3 sm:mb-4 text-primary flex items-center">
                    <div className="w-2 h-2 rounded-full bg-primary mr-2 sm:mr-3" />
                    {category}
                  </h3>
                  <div className="space-y-3 sm:space-y-4">
                    {items.map(item => (
                      <div key={item.id} className="p-3 sm:p-4 rounded-xl bg-black/20 border border-white/5">
                        <div className="flex justify-between items-start gap-2 sm:gap-4 mb-2">
                          <div className="flex-1 min-w-0">
                            <p className="font-semibold text-sm sm:text-base text-foreground">{item.description}</p>
                            <p className="text-xs text-muted-foreground mt-0.5">
                              {item.quantity} {item.unit}
                            </p>
                          </div>
                          <div className="text-right shrink-0">
                            <p className="font-bold text-base sm:text-lg">{formatCurrency(item.subtotal)}</p>
                          </div>
                        </div>
                        <div className="flex gap-3 sm:gap-4 text-xs text-muted-foreground pt-2 border-t border-white/5">
                          <span>Materials: <span className="text-foreground font-medium">{formatCurrency(item.materialCost * item.quantity)}</span></span>
                          <span>Labor: <span className="text-foreground font-medium">{formatCurrency(item.laborCost * item.quantity)}</span></span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          <div className="space-y-6">
            <Card className="bg-gradient-to-b from-card to-card border-border shadow-xl overflow-hidden relative">
              <div className="absolute top-0 inset-x-0 h-1 bg-gradient-to-r from-primary to-accent" />
              <CardContent className="p-6 pt-8">
                <p className="text-sm font-medium text-muted-foreground mb-1 uppercase tracking-wider">Total Estimate</p>
                <p className="text-4xl md:text-5xl font-display font-bold text-foreground mb-6">
                  {formatCurrency(quote.totalEstimate)}
                </p>

                <div className="space-y-3 pt-6 border-t border-white/10">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Quality Tier</span>
                    <Badge variant="secondary" className="capitalize">{tierLabels[currentTier]}</Badge>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Regional Multiplier</span>
                    <span className="font-medium">{quote.regionalMultiplier}x</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Date Generated</span>
                    <span className="font-medium">{format(new Date(quote.createdAt), 'MMM d, yyyy')}</span>
                  </div>
                </div>
              </CardContent>
            </Card>

            {quote.aiReasoning && (
              <Card className="bg-primary/5 border-primary/20">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm text-primary flex items-center gap-2">
                    <CheckCircle className="w-4 h-4" /> Professional Recommendation
                  </CardTitle>
                </CardHeader>
                <CardContent className="text-sm text-muted-foreground leading-relaxed">
                  {quote.aiReasoning}
                </CardContent>
              </Card>
            )}

            {claudeFlags.length > 0 && (
              <Card className="bg-destructive/10 border-destructive/20">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm text-destructive flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4" /> Cost Auditor Flags
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {claudeFlags.map((flag, i) => (
                    <div key={i} className="text-sm">
                      <p className="font-medium text-foreground">{flag.item}</p>
                      <p className="text-destructive/80 mt-0.5">{flag.issue}</p>
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}

            <Card className="bg-amber-500/5 border-amber-500/20">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm text-amber-400 flex items-center gap-2">
                  <Info className="w-4 h-4" /> Confidence Notes
                </CardTitle>
              </CardHeader>
              <CardContent className="text-xs text-muted-foreground space-y-2 leading-relaxed">
                <p>Estimates are generated using local material pricing data and regional labor multipliers adjusted for your property's ZIP code.</p>
                <p>Accuracy depends on: property condition assessment from listing data, current material market prices, and local contractor availability.</p>
                <p>Actual costs may vary <strong className="text-foreground">10-25%</strong> depending on site conditions, permitting requirements, and contractor selection.</p>
              </CardContent>
            </Card>
          </div>
        </div>

        <div className="mt-10 pt-6 border-t border-white/10 print:mt-6 print:border-t print:border-gray-300">
          <p className="text-[11px] text-muted-foreground leading-relaxed max-w-3xl print:text-gray-600">
            <strong>Disclaimer:</strong> This estimate is generated by AI for informational purposes only and does not constitute a bid, contract, or guarantee of pricing. 
            Actual renovation costs will vary based on site-specific conditions, contractor selection, material availability, permitting requirements, and other factors. 
            Showstimate recommends obtaining at least three licensed contractor bids before making renovation decisions. 
            Showstimate, its agents, and affiliates are not liable for differences between estimated and actual project costs.
          </p>
          <p className="text-[10px] text-muted-foreground/60 mt-2 print:text-gray-400">
            Generated by Showstimate on {format(new Date(quote.createdAt), 'MMMM d, yyyy')} &bull; Quote ID: {quote.id}
          </p>
        </div>
      </div>
    </AppLayout>
  );
}
