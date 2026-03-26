import { Link } from "wouter";
import { motion } from "framer-motion";
import { ArrowRight, Hammer, CheckCircle2, Shield, Zap, TrendingUp } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-background relative overflow-hidden">
      {/* Background decorations */}
      <div className="absolute top-0 inset-x-0 h-[500px] bg-gradient-to-b from-primary/10 to-transparent pointer-events-none" />
      <div className="absolute -top-[30%] -right-[10%] w-[70%] h-[70%] rounded-full bg-primary/5 blur-[120px] pointer-events-none" />
      <div className="absolute bottom-[10%] -left-[10%] w-[50%] h-[50%] rounded-full bg-accent/5 blur-[100px] pointer-events-none" />

      <header className="container mx-auto px-6 h-20 flex items-center justify-between relative z-10">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary to-accent flex items-center justify-center">
            <Hammer className="w-4 h-4 text-white" />
          </div>
          <span className="font-display font-bold text-xl tracking-tight">Virtual<span className="text-primary">GC</span></span>
        </div>
        <div className="flex items-center gap-4">
          <Link href="/demo" className="text-sm font-medium text-muted-foreground hover:text-foreground hidden sm:block">Try Demo</Link>
          <Link href="/login" className="text-sm font-medium text-muted-foreground hover:text-foreground">Log In</Link>
          <Link href="/register">
            <Button className="rounded-full px-6 bg-white text-black hover:bg-gray-200">Get Started</Button>
          </Link>
        </div>
      </header>

      <main className="container mx-auto px-6 pt-24 pb-32 relative z-10">
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
            
            <h1 className="text-5xl md:text-7xl font-display font-bold tracking-tight leading-tight mb-6">
              Turn Zillow links into <br className="hidden md:block" />
              <span className="text-gradient">renovation quotes</span> in seconds.
            </h1>
            
            <p className="text-lg md:text-xl text-muted-foreground mb-10 max-w-2xl mx-auto leading-relaxed">
              The AI-powered general contractor that helps real estate agents close deals faster by providing instant, accurate, region-adjusted renovation costs during property viewings.
            </p>
            
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <Link href="/register">
                <Button size="lg" className="w-full sm:w-auto rounded-full px-8 h-14 text-base bg-primary hover:bg-primary/90 shadow-lg shadow-primary/25">
                  Start Free Trial <ArrowRight className="ml-2 w-5 h-5" />
                </Button>
              </Link>
              <Link href="/demo">
                <Button variant="outline" size="lg" className="w-full sm:w-auto rounded-full px-8 h-14 text-base border-white/10 hover:bg-white/5">
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
          className="mt-24 grid grid-cols-1 md:grid-cols-3 gap-8 max-w-5xl mx-auto"
        >
          <div className="glass-panel p-8 rounded-2xl relative overflow-hidden group hover:-translate-y-1 transition-all duration-300">
            <div className="w-12 h-12 rounded-xl bg-primary/20 flex items-center justify-center mb-6 text-primary">
              <Zap className="w-6 h-6" />
            </div>
            <h3 className="text-xl font-bold mb-3">Instant Analysis</h3>
            <p className="text-muted-foreground text-sm leading-relaxed">Paste any Zillow or Redfin URL. Our AI extracts property details instantly and initiates a chat scope.</p>
          </div>

          <div className="glass-panel p-8 rounded-2xl relative overflow-hidden group hover:-translate-y-1 transition-all duration-300">
            <div className="w-12 h-12 rounded-xl bg-accent/20 flex items-center justify-center mb-6 text-accent">
              <Shield className="w-6 h-6" />
            </div>
            <h3 className="text-xl font-bold mb-3">Localized Pricing</h3>
            <p className="text-muted-foreground text-sm leading-relaxed">Costs are automatically adjusted using live BLS labor rates and regional multipliers for your exact zip code.</p>
          </div>

          <div className="glass-panel p-8 rounded-2xl relative overflow-hidden group hover:-translate-y-1 transition-all duration-300">
            <div className="w-12 h-12 rounded-xl bg-emerald-500/20 flex items-center justify-center mb-6 text-emerald-400">
              <TrendingUp className="w-6 h-6" />
            </div>
            <h3 className="text-xl font-bold mb-3">Shareable Quotes</h3>
            <p className="text-muted-foreground text-sm leading-relaxed">Generate beautiful, co-branded itemized estimates to share instantly with your buyers.</p>
          </div>
        </motion.div>
      </main>
    </div>
  );
}
