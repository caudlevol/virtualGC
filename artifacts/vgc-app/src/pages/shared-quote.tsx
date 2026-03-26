import { useRoute, Link } from "wouter";
import { useGetSharedQuote } from "@workspace/api-client-react";
import { formatCurrency } from "@/lib/utils";
import { format } from "date-fns";
import { Loader2, Building, MapPin, Briefcase } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function SharedQuote() {
  const [, params] = useRoute("/quote/:uuid");
  const uuid = params?.uuid || "";

  const { data: shared, isLoading, error } = useGetSharedQuote(uuid, { query: { retry: false }});

  if (isLoading) return <div className="min-h-screen bg-background flex items-center justify-center"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;
  if (error || !shared) return <div className="min-h-screen bg-background flex flex-col items-center justify-center p-20 text-center">
    <h1 className="text-2xl font-bold mb-2">Quote Unavailable</h1>
    <p className="text-muted-foreground mb-6">This link is invalid or has been disabled by the agent.</p>
    <Link href="/" className="text-primary hover:underline">Return Home</Link>
  </div>;

  const quote = shared.quote;
  const agentName = shared.agentName || "Real Estate Professional";
  const agentBrokerage = shared.agentBrokerage || shared.coBrandName || "";

  const groupedItems = quote.lineItems.reduce((acc, item) => {
    if (!acc[item.category]) acc[item.category] = [];
    acc[item.category].push(item);
    return acc;
  }, {} as Record<string, typeof quote.lineItems>);

  return (
    <div className="min-h-screen bg-background text-foreground pb-20">
      {/* Co-branding Header */}
      <header className="bg-card border-b border-border py-4 sticky top-0 z-50">
        <div className="container mx-auto px-4 max-w-5xl flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center">
              <Briefcase className="w-5 h-5 text-primary" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground leading-tight">Prepared for you by</p>
              <p className="font-bold text-sm md:text-base leading-tight">{agentName}</p>
            </div>
          </div>
          {agentBrokerage && <Badge variant="secondary" className="hidden sm:inline-flex">{agentBrokerage}</Badge>}
        </div>
      </header>

      <main className="container mx-auto px-4 pt-12 max-w-5xl space-y-8">
        <div className="text-center mb-12">
          <h1 className="text-3xl md:text-5xl font-display font-bold tracking-tight mb-4">{quote.title}</h1>
          {quote.property && (
            <p className="text-lg text-muted-foreground flex items-center justify-center gap-2">
              <MapPin className="w-5 h-5" /> {quote.property.address}
            </p>
          )}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Summary Column */}
          <div className="lg:col-span-1 space-y-6">
            <Card className="bg-gradient-to-b from-primary/10 to-transparent border-primary/20 shadow-xl overflow-hidden relative text-center">
              <CardContent className="p-8">
                <p className="text-sm font-semibold text-primary mb-2 uppercase tracking-wider">Estimated Cost</p>
                <p className="text-5xl font-display font-bold text-foreground mb-4">
                  {formatCurrency(quote.totalEstimate)}
                </p>
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-black/40 text-xs text-muted-foreground">
                  <span>Based on local {quote.property?.zipCode} rates</span>
                </div>
              </CardContent>
            </Card>

            {quote.aiReasoning && (
              <Card className="bg-card border-border">
                <CardHeader>
                  <CardTitle className="text-base">Project Summary</CardTitle>
                </CardHeader>
                <CardContent className="text-sm text-muted-foreground leading-relaxed">
                  {quote.aiReasoning}
                </CardContent>
              </Card>
            )}
          </div>

          {/* Details Column */}
          <div className="lg:col-span-2">
            <Card className="bg-card border-border shadow-xl">
              <CardHeader className="bg-secondary/30 border-b border-border">
                <CardTitle className="text-lg flex items-center gap-2">
                  <Building className="w-5 h-5 text-primary" />
                  Itemized Breakdown
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                {Object.entries(groupedItems).map(([category, items], idx) => (
                  <div key={category} className={`p-6 ${idx !== 0 ? 'border-t border-border' : ''}`}>
                    <h3 className="text-base font-bold capitalize mb-4 flex items-center">
                      <div className="w-2 h-2 rounded-full bg-primary mr-2" />
                      {category}
                    </h3>
                    <div className="space-y-3">
                      {items.map(item => (
                        <div key={item.id} className="flex justify-between items-start py-2 border-b border-white/5 last:border-0">
                          <div className="pr-4">
                            <p className="font-medium text-sm text-foreground/90">{item.description}</p>
                          </div>
                          <div className="text-right shrink-0">
                            <p className="font-bold text-sm">{formatCurrency(item.subtotal)}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>
        </div>

        <div className="text-center pt-12 pb-8 text-xs text-muted-foreground">
          <p>This estimate is generated by Virtual GC for planning purposes based on regional data.</p>
          <p className="mt-1">Final costs may vary based on exact material selections and contractor bids.</p>
        </div>
      </main>
    </div>
  );
}
