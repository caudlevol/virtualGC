import { useRoute, Link } from "wouter";
import { useGetQuote, useToggleShareQuote } from "@workspace/api-client-react";
import { AppLayout } from "@/components/layout";
import { formatCurrency } from "@/lib/utils";
import { format } from "date-fns";
import { Loader2, Share2, CheckCircle, AlertTriangle, Building, MapPin, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";

export default function QuoteView() {
  const { isAuthenticated, isLoading: authLoading } = useAuth(true);
  const [, params] = useRoute("/quotes/:id");
  const id = parseInt(params?.id || "0");
  const { toast } = useToast();

  const { data: quote, isLoading, refetch } = useGetQuote(id);

  const shareMutation = useToggleShareQuote({
    mutation: {
      onSuccess: (data) => {
        toast({ title: data.sharedUrlEnabled ? "Link enabled" : "Link disabled" });
        refetch();
      }
    }
  });

  if (authLoading || !isAuthenticated) return null;
  if (isLoading) return <AppLayout><div className="flex justify-center p-20"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div></AppLayout>;
  if (!quote) return <AppLayout><div className="text-center p-20 text-muted-foreground">Quote not found.</div></AppLayout>;

  const groupedItems = quote.lineItems.reduce((acc, item) => {
    if (!acc[item.category]) acc[item.category] = [];
    acc[item.category].push(item);
    return acc;
  }, {} as Record<string, typeof quote.lineItems>);

  const handleShare = () => {
    if (quote.sharedUrlEnabled) {
      navigator.clipboard.writeText(`${window.location.origin}/quote/${quote.shareUuid}`);
      toast({ title: "Copied to clipboard!" });
    } else {
      shareMutation.mutate({ quoteId: id, data: { enabled: true } });
    }
  };

  return (
    <AppLayout>
      <div className="max-w-5xl mx-auto space-y-8 pb-20">
        
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 pb-6 border-b border-white/10">
          <div>
            <Badge variant="outline" className="mb-3 border-primary/30 text-primary bg-primary/5">{quote.status.toUpperCase()}</Badge>
            <h1 className="text-3xl md:text-4xl font-display font-bold tracking-tight mb-2">{quote.title}</h1>
            {quote.property && (
              <p className="text-muted-foreground flex items-center gap-2">
                <MapPin className="w-4 h-4" /> {quote.property.address}
              </p>
            )}
          </div>
          <div className="flex items-center gap-3">
            <Button variant="outline" onClick={() => window.print()} className="bg-transparent">
              <Printer className="w-4 h-4 mr-2" /> Print
            </Button>
            <Button onClick={handleShare} className={quote.sharedUrlEnabled ? "bg-emerald-600 hover:bg-emerald-700" : ""}>
              <Share2 className="w-4 h-4 mr-2" /> 
              {quote.sharedUrlEnabled ? "Copy Client Link" : "Enable Sharing"}
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Card className="md:col-span-2 bg-card border-border shadow-xl">
            <CardHeader className="bg-secondary/50 border-b border-border pb-4">
              <CardTitle className="text-lg flex items-center gap-2">
                <Building className="w-5 h-5 text-primary" />
                Itemized Scope of Work
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {Object.entries(groupedItems).map(([category, items], idx) => (
                <div key={category} className={`p-6 ${idx !== 0 ? 'border-t border-border' : ''}`}>
                  <h3 className="text-lg font-bold capitalize mb-4 text-primary flex items-center">
                    <div className="w-2 h-2 rounded-full bg-primary mr-3" />
                    {category}
                  </h3>
                  <div className="space-y-4">
                    {items.map(item => (
                      <div key={item.id} className="flex justify-between items-start gap-4 p-4 rounded-xl bg-black/20 border border-white/5">
                        <div className="flex-1">
                          <p className="font-semibold text-foreground">{item.description}</p>
                          <p className="text-sm text-muted-foreground mt-1">
                            {item.quantity} {item.unit} @ {formatCurrency(item.materialCost + item.laborCost)}/unit
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="font-bold text-lg">{formatCurrency(item.subtotal)}</p>
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
                    <Badge variant="secondary" className="capitalize">{quote.qualityTier.replace('_', ' ')}</Badge>
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

            {quote.claudeReview && (quote.claudeReview as any).flags?.length > 0 && (
              <Card className="bg-destructive/10 border-destructive/20">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm text-destructive flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4" /> Cost Auditor Flags
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {((quote.claudeReview as any).flags || []).map((flag: any, i: number) => (
                    <div key={i} className="text-sm">
                      <p className="font-medium text-foreground">{flag.item}</p>
                      <p className="text-destructive/80 mt-0.5">{flag.issue}</p>
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
