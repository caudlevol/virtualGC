import { useState, useRef, useEffect } from "react";
import { useRoute, useLocation } from "wouter";
import { useGetConversation, useSendMessage, useGenerateQuote } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { AppLayout } from "@/components/layout";
import { motion, AnimatePresence } from "framer-motion";
import { Send, Loader2, Hammer, User, ArrowRight, Building, Bed, Bath, Square, Calendar } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";

export default function ChatPage() {
  const { isAuthenticated, isLoading: authLoading } = useAuth(true);
  const [, params] = useRoute("/chat/:id");
  const [, setLocation] = useLocation();
  const id = parseInt(params?.id || "0");
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const scrollRef = useRef<HTMLDivElement>(null);

  const [input, setInput] = useState("");

  const { data: conv, isLoading } = useGetConversation(id);

  const sendMutation = useSendMessage({
    mutation: {
      onSuccess: () => {
        setInput("");
        queryClient.invalidateQueries({ queryKey: [`/api/conversations/${id}`] });
      },
      onError: (err: { data?: { error?: string }; message?: string }) => toast({ title: "Failed to send", description: err?.data?.error || err?.message || "Unknown error", variant: "destructive" })
    }
  });

  const quoteMutation = useGenerateQuote({
    mutation: {
      onSuccess: (data: { id: number }) => setLocation(`/quotes/${data.id}`),
      onError: (err: { data?: { error?: string }; message?: string }) => toast({ title: "Failed to generate quote", description: err?.data?.error || err?.message || "Unknown error", variant: "destructive" })
    }
  });

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [conv?.messages, sendMutation.isPending]);

  const handleSend = (e: React.FormEvent, requestQuote = false) => {
    e.preventDefault();
    if (!input.trim() && !requestQuote) return;
    sendMutation.mutate({
      conversationId: id,
      data: { content: input, requestQuote }
    });
  };

  const handleQuickAction = (text: string) => {
    sendMutation.mutate({ conversationId: id, data: { content: text } });
  };

  if (authLoading || !isAuthenticated) return null;
  if (isLoading) return <AppLayout><div className="flex justify-center p-20"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div></AppLayout>;
  if (!conv) return <AppLayout><div className="text-center p-20">Conversation not found.</div></AppLayout>;

  const property = conv.property;

  return (
    <AppLayout>
      <div className="flex flex-col h-[calc(100vh-140px)] max-w-5xl mx-auto gap-6">
        
        {/* Property Context Banner */}
        {property && (
          <Card className="bg-card border-border shadow-lg shrink-0">
            <CardContent className="p-4 flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-primary/20 flex items-center justify-center text-primary">
                  <Building className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="font-bold text-base md:text-lg leading-tight">{property.address}</h2>
                  <p className="text-xs text-muted-foreground">ID: {property.id} • {property.dataSource}</p>
                </div>
              </div>
              <div className="flex flex-wrap gap-2 text-sm text-muted-foreground">
                <Badge variant="secondary" className="font-medium bg-black/40"><Square className="w-3 h-3 mr-1"/> {property.sqft} sqft</Badge>
                <Badge variant="secondary" className="font-medium bg-black/40"><Bed className="w-3 h-3 mr-1"/> {property.bedrooms} beds</Badge>
                <Badge variant="secondary" className="font-medium bg-black/40"><Bath className="w-3 h-3 mr-1"/> {property.bathrooms} baths</Badge>
                {property.yearBuilt && <Badge variant="secondary" className="font-medium bg-black/40"><Calendar className="w-3 h-3 mr-1"/> Built {property.yearBuilt}</Badge>}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Chat Area */}
        <div className="flex-1 glass-panel rounded-2xl flex flex-col overflow-hidden shadow-2xl relative">
          <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 md:p-6 space-y-6">
            {conv.messages.map((msg, i: number) => {
              const isAi = msg.role === "assistant";
              return (
                <motion.div 
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  key={i} 
                  className={`flex gap-4 ${isAi ? "flex-row" : "flex-row-reverse"}`}
                >
                  <div className={`shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${isAi ? "bg-primary/20 text-primary" : "bg-accent/20 text-accent"}`}>
                    {isAi ? <Hammer className="w-4 h-4" /> : <User className="w-4 h-4" />}
                  </div>
                  <div className={`flex flex-col max-w-[85%] ${isAi ? "items-start" : "items-end"}`}>
                    <div className={`px-5 py-3.5 rounded-2xl text-sm md:text-base leading-relaxed ${isAi ? "bg-secondary border border-white/5 text-foreground rounded-tl-none" : "bg-gradient-to-br from-primary to-indigo-600 text-white shadow-lg shadow-primary/20 rounded-tr-none"}`}>
                      {msg.content}
                    </div>
                    
                    {msg.quoteSuggestion && (
                      <Card className="mt-3 bg-card border-primary/30 shadow-lg shadow-primary/10 overflow-hidden w-full max-w-sm">
                        <div className="bg-primary/10 px-4 py-2 border-b border-primary/20 flex items-center justify-between">
                          <span className="text-xs font-bold text-primary uppercase tracking-wider">Scope Identified</span>
                        </div>
                        <CardContent className="p-4 space-y-4">
                          <p className="text-sm text-muted-foreground line-clamp-3">
                            {(msg.quoteSuggestion && typeof msg.quoteSuggestion === 'object' && 'reasoning' in msg.quoteSuggestion ? (msg.quoteSuggestion as Record<string, string>).reasoning : null) || "Ready to generate formal estimate based on our discussion."}
                          </p>
                          <Button 
                            className="w-full bg-white text-black hover:bg-gray-200" 
                            size="sm"
                            disabled={quoteMutation.isPending}
                            onClick={() => quoteMutation.mutate({ data: { conversationId: id, qualityTier: "mid_range" }})}
                          >
                            {quoteMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Hammer className="w-4 h-4 mr-2" />}
                            Generate Official Quote
                          </Button>
                        </CardContent>
                      </Card>
                    )}
                  </div>
                </motion.div>
              );
            })}
            
            {sendMutation.isPending && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex gap-4">
                <div className="shrink-0 w-8 h-8 rounded-full bg-primary/20 text-primary flex items-center justify-center">
                  <Hammer className="w-4 h-4" />
                </div>
                <div className="px-5 py-4 rounded-2xl rounded-tl-none bg-secondary border border-white/5 flex items-center gap-1.5">
                  <div className="w-2 h-2 rounded-full bg-muted-foreground/50 animate-bounce" style={{ animationDelay: '0ms' }} />
                  <div className="w-2 h-2 rounded-full bg-muted-foreground/50 animate-bounce" style={{ animationDelay: '150ms' }} />
                  <div className="w-2 h-2 rounded-full bg-muted-foreground/50 animate-bounce" style={{ animationDelay: '300ms' }} />
                </div>
              </motion.div>
            )}
          </div>

          <div className="p-4 bg-background/50 backdrop-blur-md border-t border-white/5">
            <div className="flex gap-2 mb-3 overflow-x-auto pb-2 scrollbar-hide">
               <Button variant="outline" size="sm" className="shrink-0 rounded-full text-xs" onClick={() => handleQuickAction("What would it cost to remodel the kitchen?")}>Remodel Kitchen</Button>
               <Button variant="outline" size="sm" className="shrink-0 rounded-full text-xs" onClick={() => handleQuickAction("Let's update the master bathroom.")}>Update Bathroom</Button>
               <Button variant="outline" size="sm" className="shrink-0 rounded-full text-xs" onClick={() => handleQuickAction("Give me a full flip estimate including floors and paint.")}>Full Flip</Button>
            </div>
            <form onSubmit={(e) => handleSend(e)} className="relative flex items-center">
              <Input 
                value={input}
                onChange={e => setInput(e.target.value)}
                placeholder="Describe the renovation scope..." 
                className="pr-24 bg-black/40 border-white/10 h-14 rounded-xl text-base"
                disabled={sendMutation.isPending || quoteMutation.isPending}
              />
              <div className="absolute right-2 flex gap-1">
                <Button 
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="text-primary hover:text-primary hover:bg-primary/20"
                  onClick={(e) => handleSend(e as React.FormEvent, true)}
                  disabled={!input.trim() || sendMutation.isPending}
                  title="Generate Quote from this message"
                >
                  <Hammer className="w-5 h-5" />
                </Button>
                <Button 
                  type="submit" 
                  size="icon" 
                  className="bg-primary hover:bg-primary/90 text-white"
                  disabled={!input.trim() || sendMutation.isPending}
                >
                  <Send className="w-5 h-5" />
                </Button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
