import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodFormResolver } from "@/lib/form-resolver";
import { useDemoEstimate, useCaptureLead } from "@workspace/api-client-react";
import { formatCurrency } from "@/lib/utils";
import { motion } from "framer-motion";
import { Hammer, Loader2, Zap, CheckCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Link } from "wouter";

const leadSchema = z.object({
  name: z.string().min(2, "Name required"),
  email: z.string().email("Invalid email"),
  brokerage: z.string().optional(),
});

type LeadFormData = z.infer<typeof leadSchema>;

export default function DemoPage() {
  const [url, setUrl] = useState("");
  const [rateLimited, setRateLimited] = useState(false);
  const { toast } = useToast();
  
  const demoMutation = useDemoEstimate({
    mutation: {
      onError: (err: { status?: number; data?: { error?: string }; message?: string }) => {
        if (err.status === 429) {
          setRateLimited(true);
          toast({ title: "Rate Limited", description: "Demo is limited to a few requests. Sign up for unlimited access!", variant: "destructive" });
        } else {
          toast({ title: "Demo Failed", description: err?.data?.error || err?.message || "Could not generate estimate", variant: "destructive" });
        }
      }
    }
  });

  const leadMutation = useCaptureLead({
    mutation: {
      onSuccess: () => toast({ title: "Success!", description: "We'll be in touch shortly." }),
      onError: () => toast({ title: "Error", description: "Failed to submit. Please try again.", variant: "destructive" })
    }
  });

  const leadForm = useForm<LeadFormData>({
    resolver: zodFormResolver(leadSchema),
    defaultValues: { name: "", email: "", brokerage: "" }
  });

  const handleEstimate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!url) return;
    demoMutation.mutate({ data: { zillowUrl: url, renovationType: "general" } });
  };

  const est = demoMutation.data;

  return (
    <div className="min-h-screen bg-background">
      <header className="container mx-auto px-6 h-20 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2">
          <Hammer className="w-5 h-5 text-primary" />
          <span className="font-display font-bold text-xl">Virtual<span className="text-primary">GC</span></span>
        </Link>
        <Link href="/register">
          <Button variant="outline" className="border-white/10">Sign Up</Button>
        </Link>
      </header>

      <main className="container mx-auto px-4 py-12 max-w-4xl">
        <div className="text-center mb-12">
          <Badge className="mb-4 bg-primary/20 text-primary border-0 hover:bg-primary/20">Free Live Demo</Badge>
          <h1 className="text-4xl md:text-5xl font-display font-bold mb-4">See Virtual GC in Action</h1>
          <p className="text-muted-foreground text-lg max-w-xl mx-auto">Paste a Zillow URL to instantly see localized cost data for a standard renovation.</p>
        </div>

        {rateLimited && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="max-w-2xl mx-auto mb-8 p-4 rounded-xl bg-destructive/10 border border-destructive/20 text-center text-sm text-destructive">
            You've reached the demo limit. Sign up for unlimited estimates!
          </motion.div>
        )}

        {!est ? (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="glass-panel p-8 rounded-2xl max-w-2xl mx-auto">
            <form onSubmit={handleEstimate} className="flex flex-col gap-4">
              <div className="space-y-2">
                <Label>Zillow or Redfin URL</Label>
                <Input 
                  value={url} 
                  onChange={e => setUrl(e.target.value)} 
                  placeholder="https://www.zillow.com/homedetails/..." 
                  className="h-14 text-lg bg-black/40 border-white/10"
                />
              </div>
              <Button type="submit" size="lg" className="h-14 text-lg" disabled={demoMutation.isPending || !url || rateLimited}>
                {demoMutation.isPending ? <Loader2 className="w-5 h-5 animate-spin mr-2" /> : <Zap className="w-5 h-5 mr-2" />}
                Generate Sample Estimate
              </Button>
            </form>
          </motion.div>
        ) : (
          <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="space-y-12">
            
            <Card className="bg-card border-primary/20 shadow-2xl overflow-hidden relative">
              <div className="absolute top-0 inset-x-0 h-2 bg-gradient-to-r from-primary to-accent" />
              <CardContent className="p-8">
                <div className="text-center mb-8">
                  <h2 className="text-2xl font-bold mb-2">Sample Estimate for {est.property.address}</h2>
                  <p className="text-4xl font-display font-bold text-primary">{formatCurrency(est.totalEstimate)}</p>
                  <p className="text-sm text-muted-foreground mt-2">Adjusted for {est.property.zipCode} (Multiplier: {est.regionalMultiplier}x)</p>
                </div>
                
                <div className="space-y-3 mb-8">
                  {est.lineItems.slice(0, 3).map((item: { description: string; materialCost: number; laborCost: number; quantity: number }, i: number) => (
                    <div key={i} className="flex justify-between items-center p-3 rounded-lg bg-secondary/50">
                      <span className="font-medium">{item.description}</span>
                      <span className="font-bold">{formatCurrency((item.materialCost + item.laborCost) * item.quantity)}</span>
                    </div>
                  ))}
                  <div className="p-3 text-center text-sm text-muted-foreground italic border border-dashed border-white/10 rounded-lg">
                    + {Math.max(est.lineItems.length - 3, 5)} more items in full report
                  </div>
                </div>

                <div className="bg-primary/10 p-4 rounded-xl text-sm text-primary/90 flex gap-3 items-start">
                  <CheckCircle className="w-5 h-5 shrink-0 mt-0.5" />
                  <p>{est.estimateSummary}</p>
                </div>
              </CardContent>
            </Card>

            <div className="glass-panel p-8 rounded-2xl max-w-xl mx-auto text-center">
              <h3 className="text-2xl font-bold mb-2">Want full access?</h3>
              <p className="text-muted-foreground mb-6">Create infinite custom estimates, chat with the AI contractor, and share branded links with your clients.</p>
              
              {!leadMutation.isSuccess ? (
                <form onSubmit={leadForm.handleSubmit((d) => leadMutation.mutate({ data: d }))} className="space-y-4 text-left">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Name</Label>
                      <Input {...leadForm.register("name")} className="bg-black/40" />
                    </div>
                    <div className="space-y-2">
                      <Label>Email</Label>
                      <Input {...leadForm.register("email")} className="bg-black/40" />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>Brokerage (Optional)</Label>
                    <Input {...leadForm.register("brokerage")} placeholder="Keller Williams, RE/MAX..." className="bg-black/40" />
                  </div>
                  <Button type="submit" className="w-full" disabled={leadMutation.isPending}>
                    {leadMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                    Book a Call & Get Beta Access
                  </Button>
                </form>
              ) : (
                <div className="p-4 bg-emerald-500/10 text-emerald-400 rounded-lg border border-emerald-500/20 font-medium">
                  Thanks! We'll be in touch to set up your account.
                </div>
              )}
            </div>

          </motion.div>
        )}
      </main>
    </div>
  );
}
