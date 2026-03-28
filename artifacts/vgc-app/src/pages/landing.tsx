import { useState } from "react";
import { Link, useLocation } from "wouter";
import { motion } from "framer-motion";
import { ArrowRight, Hammer, CheckCircle2, Shield, Zap, TrendingUp, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export default function LandingPage() {
  const [zillowUrl, setZillowUrl] = useState("");
  const [, setLocation] = useLocation();

  const handlePasteAndGo = (e: React.FormEvent) => {
    e.preventDefault();
    if (zillowUrl.trim()) {
      setLocation(`/demo?url=${encodeURIComponent(zillowUrl.trim())}`);
    } else {
      setLocation("/demo");
    }
  };

  return (
    <div className="min-h-screen bg-background relative overflow-hidden">
      {/* Background decorations */}
      <div className="absolute top-0 inset-x-0 h-[500px] bg-gradient-to-b from-primary/10 to-transparent pointer-events-none" />
      <div className="absolute -top-[30%] -right-[10%] w-[70%] h-[70%] rounded-full bg-primary/5 blur-[120px] pointer-events-none" />
      <div className="absolute bottom-[10%] -left-[10%] w-[50%] h-[50%] rounded-full bg-accent/5 blur-[100px] pointer-events-none" />

      <header className="container mx-auto px-4 sm:px-6 h-16 sm:h-20 flex items-center justify-between relative z-10">
        <div className="flex items-center gap-2">
          <img src="/logo.png" alt="Showstimate" className="h-[40px] w-auto object-contain" />
          <span className="font-display font-bold text-lg sm:text-xl tracking-tight">Showstimate</span>
        </div>
        <div className="flex items-center gap-2 sm:gap-4">
          <Link href="/demo" className="text-sm font-medium text-muted-foreground hover:text-foreground hidden sm:block">Try Demo</Link>
          <Link href="/login" className="text-sm font-medium text-muted-foreground hover:text-foreground">Log In</Link>
          <Link href="/register">
            <Button className="rounded-full px-4 sm:px-6 text-sm bg-white text-black hover:bg-gray-200 touch-target">Get Started</Button>
          </Link>
        </div>
      </header>

      <main className="container mx-auto px-4 sm:px-6 pt-12 sm:pt-24 pb-20 sm:pb-32 relative z-10">
        <div className="max-w-4xl mx-auto text-center">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
          >
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary/10 border border-primary/20 text-primary text-sm font-medium mb-8">
              <Zap className="w-4 h-4" />
              <span>Instant localized estimates</span>
            </div>
            
            <h1 className="text-3xl sm:text-5xl md:text-7xl font-display font-bold tracking-tight leading-tight mb-4 sm:mb-6">
              Turn Zillow links into <br className="hidden md:block" />
              <span className="text-gradient">renovation quotes</span> in seconds.
            </h1>
            
            <p className="text-sm sm:text-lg md:text-xl text-muted-foreground mb-6 sm:mb-10 max-w-2xl mx-auto leading-relaxed px-2">
              The AI-powered general contractor that helps real estate agents close deals faster by providing instant, accurate, region-adjusted renovation costs during property viewings.
            </p>
            
            <form onSubmit={handlePasteAndGo} className="max-w-2xl mx-auto mb-6 sm:mb-8">
              <div className="relative flex items-center glass-panel rounded-xl sm:rounded-2xl p-1.5 sm:p-2 shadow-2xl border border-white/10">
                <Search className="absolute left-3 sm:left-5 w-4 h-4 sm:w-5 sm:h-5 text-muted-foreground" />
                <Input
                  value={zillowUrl}
                  onChange={(e) => setZillowUrl(e.target.value)}
                  placeholder="Paste a Zillow link..."
                  className="flex-1 bg-transparent border-0 pl-9 sm:pl-12 h-11 sm:h-14 text-sm sm:text-base focus-visible:ring-0 focus-visible:ring-offset-0"
                />
                <Button type="submit" size="lg" className="rounded-lg sm:rounded-xl px-3 sm:px-6 h-10 sm:h-12 text-sm sm:text-base bg-primary hover:bg-primary/90 shadow-lg shadow-primary/25 shrink-0 touch-target">
                  Get Estimate <ArrowRight className="ml-1 sm:ml-2 w-4 h-4 sm:w-5 sm:h-5" />
                </Button>
              </div>
            </form>

            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <Link href="/register">
                <Button variant="outline" size="lg" className="w-full sm:w-auto rounded-full px-8 h-12 text-sm border-white/10 hover:bg-white/5">
                  Start Free Trial <ArrowRight className="ml-2 w-4 h-4" />
                </Button>
              </Link>
              <Link href="/demo">
                <Button variant="ghost" size="lg" className="w-full sm:w-auto rounded-full px-8 h-12 text-sm text-muted-foreground hover:text-foreground">
                  Try the Demo
                </Button>
              </Link>
            </div>
          </motion.div>
        </div>

        <motion.div 
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.2 }}
          className="mt-12 sm:mt-24 grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-8 max-w-5xl mx-auto"
        >
          <div className="glass-panel p-5 sm:p-8 rounded-xl sm:rounded-2xl relative overflow-hidden group hover:-translate-y-1 transition-all duration-300">
            <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl bg-primary/20 flex items-center justify-center mb-4 sm:mb-6 text-primary">
              <Zap className="w-5 h-5 sm:w-6 sm:h-6" />
            </div>
            <h3 className="text-lg sm:text-xl font-bold mb-2 sm:mb-3">Instant Analysis</h3>
            <p className="text-muted-foreground text-sm leading-relaxed">Paste any Zillow or Redfin URL. Our AI extracts property details instantly and initiates a chat scope.</p>
          </div>

          <div className="glass-panel p-5 sm:p-8 rounded-xl sm:rounded-2xl relative overflow-hidden group hover:-translate-y-1 transition-all duration-300">
            <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl bg-accent/20 flex items-center justify-center mb-4 sm:mb-6 text-accent">
              <Shield className="w-5 h-5 sm:w-6 sm:h-6" />
            </div>
            <h3 className="text-lg sm:text-xl font-bold mb-2 sm:mb-3">Localized Pricing</h3>
            <p className="text-muted-foreground text-sm leading-relaxed">Costs adjusted using live BLS labor rates and regional multipliers for your exact zip code.</p>
          </div>

          <div className="glass-panel p-5 sm:p-8 rounded-xl sm:rounded-2xl relative overflow-hidden group hover:-translate-y-1 transition-all duration-300">
            <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl bg-emerald-500/20 flex items-center justify-center mb-4 sm:mb-6 text-emerald-400">
              <TrendingUp className="w-5 h-5 sm:w-6 sm:h-6" />
            </div>
            <h3 className="text-lg sm:text-xl font-bold mb-2 sm:mb-3">Shareable Quotes</h3>
            <p className="text-muted-foreground text-sm leading-relaxed">Generate beautiful, co-branded estimates to share instantly with your buyers.</p>
          </div>
        </motion.div>
      </main>
    </div>
  );
}
