import { useState, useRef, useEffect, useCallback } from "react";
import { useRoute, useLocation } from "wouter";
import { useGetConversation, useSendMessage, useGenerateQuote, useVisualizeRenovation } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { AppLayout } from "@/components/layout";
import { motion, AnimatePresence } from "framer-motion";
import { Send, Loader2, Hammer, User, Building, Bed, Bath, Square, Calendar, ChevronLeft, ChevronRight, ImageIcon, Images, X, Sparkles, Upload, GripVertical } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";

function BeforeAfterSlider({ beforeSrc, afterSrc, onClickAfter }: { beforeSrc: string; afterSrc: string; onClickAfter?: () => void }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState(50);
  const [isDragging, setIsDragging] = useState(false);

  const updatePosition = useCallback((clientX: number) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const x = Math.max(0, Math.min(clientX - rect.left, rect.width));
    setPosition((x / rect.width) * 100);
  }, []);

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    setIsDragging(true);
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    updatePosition(e.clientX);
  }, [updatePosition]);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!isDragging) return;
    updatePosition(e.clientX);
  }, [isDragging, updatePosition]);

  const handlePointerUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  return (
    <div
      ref={containerRef}
      className="relative w-full aspect-[4/3] rounded-xl overflow-hidden border border-white/10 shadow-lg cursor-col-resize select-none touch-none"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
    >
      <img src={afterSrc} alt="After renovation" className="absolute inset-0 w-full h-full object-cover" onClick={onClickAfter} />
      <div className="absolute inset-0 overflow-hidden" style={{ width: `${position}%` }}>
        <img src={beforeSrc} alt="Before renovation" className="absolute inset-0 w-full h-full object-cover" style={{ width: containerRef.current ? `${containerRef.current.offsetWidth}px` : '100%', maxWidth: 'none' }} />
      </div>
      <div className="absolute top-0 bottom-0" style={{ left: `${position}%`, transform: 'translateX(-50%)' }}>
        <div className="w-0.5 h-full bg-white shadow-lg" />
        <div className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-8 h-8 rounded-full bg-white shadow-lg flex items-center justify-center">
          <GripVertical className="w-4 h-4 text-gray-700" />
        </div>
      </div>
      <div className="absolute top-2 left-2 px-2 py-0.5 rounded bg-black/60 text-white text-xs font-medium pointer-events-none">Before</div>
      <div className="absolute top-2 right-2 px-2 py-0.5 rounded bg-black/60 text-white text-xs font-medium pointer-events-none">After</div>
    </div>
  );
}

function sanitizeAIMessage(content: string): string {
  let cleaned = content.replace(/```(?:json)?\s*[\s\S]*?```/g, "").trim();

  cleaned = cleaned.replace(/\{[\s\S]*?"(?:scope|items|cost_estimate|description|considerations)"[\s\S]*?\}/g, "").trim();

  cleaned = cleaned.replace(/Here'?s a structured estimate[^.]*\.?/gi, "").trim();
  cleaned = cleaned.replace(/Remember,?\s*these are feasibility estimates[^.]*\.?/gi, "").trim();

  cleaned = cleaned.replace(/\n{3,}/g, "\n\n").trim();

  if (!cleaned) {
    return "Let me put that together for you — one moment.";
  }
  return cleaned;
}

function formatMessage(text: string) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return <strong key={i}>{part.slice(2, -2)}</strong>;
    }
    return <span key={i}>{part}</span>;
  });
}

function PhotoLightbox({ photos, initialIndex, onClose, onVisualize, isVisualizing }: { photos: string[]; initialIndex: number; onClose: () => void; onVisualize?: (photoUrl: string) => void; isVisualizing?: boolean }) {
  const [index, setIndex] = useState(initialIndex);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowLeft") setIndex(i => (i - 1 + photos.length) % photos.length);
      if (e.key === "ArrowRight") setIndex(i => (i + 1) % photos.length);
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [photos.length, onClose]);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center"
      onClick={onClose}
    >
      <button
        onClick={onClose}
        className="absolute top-4 right-4 w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-colors z-10"
      >
        <X className="w-6 h-6" />
      </button>

      <div className="relative w-full h-full flex items-center justify-center p-8" onClick={e => e.stopPropagation()}>
        {photos.length > 1 && (
          <button
            onClick={() => setIndex(i => (i - 1 + photos.length) % photos.length)}
            className="absolute left-4 w-12 h-12 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-colors z-10"
          >
            <ChevronLeft className="w-6 h-6" />
          </button>
        )}

        <img
          src={photos[index]}
          alt={`Photo ${index + 1}`}
          className="max-w-full max-h-full object-contain rounded-lg"
        />

        {onVisualize && (
          <button
            onClick={() => {
              onVisualize(photos[index]);
              onClose();
            }}
            disabled={isVisualizing}
            className="absolute bottom-16 left-1/2 -translate-x-1/2 flex items-center gap-2 px-5 py-2.5 rounded-full bg-primary hover:bg-primary/90 text-white font-medium text-sm shadow-lg shadow-primary/30 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isVisualizing ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Generating...
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4" />
                Visualize this room
              </>
            )}
          </button>
        )}

        {photos.length > 1 && (
          <button
            onClick={() => setIndex(i => (i + 1) % photos.length)}
            className="absolute right-4 w-12 h-12 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-colors z-10"
          >
            <ChevronRight className="w-6 h-6" />
          </button>
        )}

        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-black/70 text-white text-sm px-4 py-2 rounded-full">
          {index + 1} / {photos.length}
        </div>
      </div>
    </motion.div>
  );
}

function PropertyPhotoCarousel({ photos, compact = false, onPhotoClick, onVisualize, isVisualizing, canVisualize }: { photos: string[]; compact?: boolean; onPhotoClick?: (index: number) => void; onVisualize?: (photoUrl: string) => void; isVisualizing?: boolean; canVisualize?: boolean }) {
  const [currentIndex, setCurrentIndex] = useState(0);

  if (!photos || photos.length === 0) {
    return (
      <div className={`w-full ${compact ? "h-32" : "h-48 md:h-56"} bg-black/30 rounded-xl flex items-center justify-center text-muted-foreground`}>
        <ImageIcon className="w-8 h-8 mr-2 opacity-50" />
        <span className="text-sm">No listing photos available</span>
      </div>
    );
  }

  const goNext = () => setCurrentIndex((i) => (i + 1) % photos.length);
  const goPrev = () => setCurrentIndex((i) => (i - 1 + photos.length) % photos.length);

  return (
    <div className={`relative w-full ${compact ? "h-32" : "h-48 md:h-56"} rounded-xl overflow-hidden group`}>
      <img
        src={photos[currentIndex]}
        alt={`Property photo ${currentIndex + 1}`}
        className="w-full h-full object-cover transition-opacity duration-300 cursor-pointer"
        onClick={() => onPhotoClick?.(currentIndex)}
      />
      {canVisualize && onVisualize && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onVisualize(photos[currentIndex]);
          }}
          disabled={isVisualizing}
          className="absolute top-2 right-2 flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-primary/90 hover:bg-primary text-white text-xs font-medium shadow-lg opacity-0 group-hover:opacity-100 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed z-10"
        >
          {isVisualizing ? (
            <Loader2 className="w-3 h-3 animate-spin" />
          ) : (
            <Sparkles className="w-3 h-3" />
          )}
          Visualize
        </button>
      )}
      {photos.length > 1 && (
        <>
          <button
            onClick={goPrev}
            className="absolute left-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-black/70 text-white flex items-center justify-center hover:bg-black/90 transition-colors"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button
            onClick={goNext}
            className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-black/70 text-white flex items-center justify-center hover:bg-black/90 transition-colors"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
          <div className="absolute bottom-2 left-1/2 -translate-x-1/2 bg-black/70 text-white text-xs px-2 py-1 rounded-full">
            {currentIndex + 1} / {photos.length}
          </div>
        </>
      )}
    </div>
  );
}

function PhotoPickerModal({ photos, onSelect, onUpload, onClose }: { photos: string[]; onSelect: (photoUrl: string) => void; onUpload: (base64: string, mimeType: string, previewUrl: string) => void; onClose: () => void }) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onClose]);

  const [uploadError, setUploadError] = useState<string | null>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadError(null);
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      setUploadError("Please upload a JPEG, PNG, or WebP image.");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setUploadError("Image must be under 10MB.");
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      const base64 = dataUrl.split(",")[1];
      onUpload(base64, file.type, dataUrl);
    };
    reader.readAsDataURL(file);
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="bg-card rounded-2xl border border-white/10 shadow-2xl max-w-2xl w-full max-h-[80vh] overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        <div className="p-5 border-b border-white/10 flex items-center justify-between">
          <div>
            <h3 className="font-bold text-lg">Choose a room to visualize</h3>
            <p className="text-sm text-muted-foreground mt-0.5">Select a listing photo or upload your own</p>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="p-4 overflow-y-auto max-h-[60vh]">
          {uploadError && (
            <div className="mb-3 px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-xs">
              {uploadError}
            </div>
          )}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <button
              onClick={() => fileInputRef.current?.click()}
              className="relative aspect-[4/3] rounded-xl overflow-hidden border-2 border-dashed border-white/20 hover:border-primary transition-all group flex flex-col items-center justify-center gap-2 bg-white/5 hover:bg-white/10"
            >
              <Upload className="w-6 h-6 text-muted-foreground group-hover:text-primary transition-colors" />
              <span className="text-xs text-muted-foreground group-hover:text-primary transition-colors font-medium">Upload Photo</span>
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              onChange={handleFileChange}
            />
            {photos.map((photo, i) => (
              <button
                key={i}
                onClick={() => onSelect(photo)}
                className="relative aspect-[4/3] rounded-xl overflow-hidden border-2 border-transparent hover:border-primary transition-all group"
              >
                <img
                  src={photo}
                  alt={`Room ${i + 1}`}
                  className="w-full h-full object-cover"
                />
                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors flex items-center justify-center">
                  <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-primary/90 text-white text-xs font-medium opacity-0 group-hover:opacity-100 transition-opacity shadow-lg">
                    <Sparkles className="w-3 h-3" />
                    Visualize
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}

function PhotoStrip({ photos, onPhotoClick, onVisualize, isVisualizing, canVisualize }: { photos: string[]; onPhotoClick?: (index: number) => void; onVisualize?: (photoUrl: string) => void; isVisualizing?: boolean; canVisualize?: boolean }) {
  const scrollRef = useRef<HTMLDivElement>(null);

  if (!photos || photos.length === 0) return null;

  const scrollBy = (dir: number) => {
    if (scrollRef.current) {
      scrollRef.current.scrollBy({ left: dir * 200, behavior: "smooth" });
    }
  };

  return (
    <div className="relative">
      <button
        onClick={() => scrollBy(-1)}
        className="absolute left-0 top-1/2 -translate-y-1/2 z-10 w-7 h-7 rounded-full bg-black/70 text-white flex items-center justify-center hover:bg-black/90"
      >
        <ChevronLeft className="w-3 h-3" />
      </button>
      <div
        ref={scrollRef}
        className="flex gap-2 overflow-x-auto scrollbar-hide px-8 py-1"
      >
        {photos.map((photo, i) => (
          <div key={i} className="relative shrink-0 group">
            <img
              src={photo}
              alt={`Photo ${i + 1}`}
              className="h-20 w-28 rounded-lg object-cover border border-white/10 hover:border-primary/50 transition-colors cursor-pointer"
              onClick={() => onPhotoClick?.(i)}
            />
            {canVisualize && onVisualize && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onVisualize(photo);
                }}
                disabled={isVisualizing}
                className="absolute inset-0 bg-black/60 rounded-lg flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity disabled:opacity-50"
                title="Visualize this room"
              >
                <div className="flex flex-col items-center gap-0.5">
                  <Sparkles className="w-4 h-4 text-primary" />
                  <span className="text-[10px] text-white font-medium">Visualize</span>
                </div>
              </button>
            )}
          </div>
        ))}
      </div>
      <button
        onClick={() => scrollBy(1)}
        className="absolute right-0 top-1/2 -translate-y-1/2 z-10 w-7 h-7 rounded-full bg-black/70 text-white flex items-center justify-center hover:bg-black/90"
      >
        <ChevronRight className="w-3 h-3" />
      </button>
    </div>
  );
}

export default function ChatPage() {
  const { isAuthenticated, isLoading: authLoading } = useAuth(true);
  const [, params] = useRoute("/chat/:id");
  const [, setLocation] = useLocation();
  const id = parseInt(params?.id || "0");
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const scrollRef = useRef<HTMLDivElement>(null);
  const [photosExpanded, setPhotosExpanded] = useState(true);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState(0);
  const [lightboxPhotos, setLightboxPhotos] = useState<string[]>([]);
  const [lightboxIsListing, setLightboxIsListing] = useState(false);
  const [photoPickerOpen, setPhotoPickerOpen] = useState(false);

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

  const visualizeMutation = useVisualizeRenovation({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: [`/api/conversations/${id}`] });
      },
      onError: (err: { data?: { error?: string }; message?: string }) => toast({ title: "Visualization failed", description: err?.data?.error || err?.message || "Could not generate image", variant: "destructive" })
    }
  });

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [conv?.messages, sendMutation.isPending, visualizeMutation.isPending]);

  const openLightbox = (photos: string[], index: number, isListing = false) => {
    setLightboxPhotos(photos);
    setLightboxIndex(index);
    setLightboxIsListing(isListing);
    setLightboxOpen(true);
  };

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

  const handleVisualize = () => {
    setPhotoPickerOpen(true);
  };

  const handleVisualizePhoto = (photoUrl: string) => {
    setPhotoPickerOpen(false);
    visualizeMutation.mutate({ conversationId: id, data: { sourceImageUrl: photoUrl } });
  };

  const handleUploadPhoto = (base64: string, mimeType: string, _previewUrl: string) => {
    setPhotoPickerOpen(false);
    visualizeMutation.mutate({
      conversationId: id,
      data: { uploadedImageBase64: base64, uploadedImageMimeType: mimeType }
    });
  };

  if (authLoading || !isAuthenticated) return null;
  if (isLoading) return <AppLayout><div className="flex justify-center p-20"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div></AppLayout>;
  if (!conv) return <AppLayout><div className="text-center p-20">Conversation not found.</div></AppLayout>;

  const property = conv.property;
  const hasPhotos = property?.listingPhotos && property.listingPhotos.length > 0;
  const isFirstMessage = conv.messages.length <= 1;

  return (
    <AppLayout>
      <div className="flex flex-col h-[calc(100vh-140px)] max-w-5xl mx-auto gap-3">

        {isFirstMessage && property && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="glass-panel rounded-2xl p-5 shadow-xl shrink-0"
          >
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <PropertyPhotoCarousel
                photos={property.listingPhotos || []}
                onPhotoClick={(i) => openLightbox(property.listingPhotos || [], i, true)}
                onVisualize={handleVisualizePhoto}
                isVisualizing={visualizeMutation.isPending}
                canVisualize={conv.messages.length >= 2}
              />
              <div className="flex flex-col justify-between">
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <Building className="w-5 h-5 text-primary" />
                    <h2 className="font-bold text-lg leading-tight">{property.address}</h2>
                  </div>
                  <p className="text-xs text-muted-foreground mb-4">{property.zipCode}</p>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Square className="w-4 h-4 text-primary/70" />
                      <span>{property.sqft?.toLocaleString()} sqft</span>
                    </div>
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Bed className="w-4 h-4 text-primary/70" />
                      <span>{property.bedrooms} bedrooms</span>
                    </div>
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Bath className="w-4 h-4 text-primary/70" />
                      <span>{property.bathrooms} bathrooms</span>
                    </div>
                    {property.yearBuilt && (
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Calendar className="w-4 h-4 text-primary/70" />
                        <span>Built {property.yearBuilt}</span>
                      </div>
                    )}
                  </div>
                </div>
                <p className="text-xs text-muted-foreground/70 mt-4">Describe the renovation scope below to get started.</p>
              </div>
            </div>
          </motion.div>
        )}

        {!isFirstMessage && property && (
          <div className="shrink-0 space-y-2">
            <Card className="bg-card border-border shadow-lg">
              <CardContent className="p-3 flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  {hasPhotos && (
                    <img
                      src={property.listingPhotos![0]}
                      alt="Property"
                      className="w-12 h-12 rounded-lg object-cover cursor-pointer"
                      onClick={() => openLightbox(property.listingPhotos || [], 0, true)}
                    />
                  )}
                  <div>
                    <h2 className="font-bold text-sm md:text-base leading-tight">{property.address}</h2>
                    <p className="text-xs text-muted-foreground">{property.zipCode}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <div className="hidden sm:flex flex-wrap gap-2 text-sm text-muted-foreground">
                    <Badge variant="secondary" className="font-medium bg-black/40"><Square className="w-3 h-3 mr-1"/> {property.sqft} sqft</Badge>
                    <Badge variant="secondary" className="font-medium bg-black/40"><Bed className="w-3 h-3 mr-1"/> {property.bedrooms} beds</Badge>
                    <Badge variant="secondary" className="font-medium bg-black/40"><Bath className="w-3 h-3 mr-1"/> {property.bathrooms} baths</Badge>
                  </div>
                  {hasPhotos && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setPhotosExpanded(!photosExpanded)}
                      className="shrink-0 text-xs"
                    >
                      {photosExpanded ? <X className="w-3 h-3 mr-1" /> : <Images className="w-3 h-3 mr-1" />}
                      {photosExpanded ? "Hide" : "Photos"}
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>

            {photosExpanded && hasPhotos && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                className="bg-card/50 rounded-xl p-2 border border-white/5"
              >
                <PhotoStrip
                  photos={property.listingPhotos!}
                  onPhotoClick={(i) => openLightbox(property.listingPhotos || [], i, true)}
                  onVisualize={handleVisualizePhoto}
                  isVisualizing={visualizeMutation.isPending}
                  canVisualize={conv.messages.length >= 2}
                />
              </motion.div>
            )}
          </div>
        )}

        <div className="flex-1 glass-panel rounded-2xl flex flex-col overflow-hidden shadow-2xl relative min-h-0">
          <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 md:p-6 space-y-6">
            {conv.messages.map((msg, i: number) => {
              const isAi = msg.role === "assistant";
              const displayContent = isAi ? sanitizeAIMessage(msg.content) : msg.content;
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
                    <div className={`px-5 py-3.5 rounded-2xl text-sm md:text-base leading-relaxed whitespace-pre-line ${isAi ? "bg-secondary border border-white/5 text-foreground rounded-tl-none" : "bg-gradient-to-br from-primary to-indigo-600 text-white shadow-lg shadow-primary/20 rounded-tr-none"}`}>
                      {formatMessage(displayContent)}
                    </div>

                    {msg.imageUrl && (
                      <div className="mt-3 max-w-sm">
                        {msg.sourceImageUrl ? (
                          <div>
                            <BeforeAfterSlider
                              beforeSrc={msg.sourceImageUrl}
                              afterSrc={msg.imageUrl}
                              onClickAfter={() => openLightbox([msg.imageUrl!], 0)}
                            />
                            <div className="bg-secondary/80 rounded-b-xl px-3 py-1.5 flex items-center gap-1.5">
                              <Sparkles className="w-3 h-3 text-primary" />
                              <span className="text-xs text-muted-foreground">Drag slider to compare before &amp; after</span>
                            </div>
                          </div>
                        ) : (
                          <div className="rounded-xl overflow-hidden border border-white/10 shadow-lg">
                            <img
                              src={msg.imageUrl}
                              alt="Renovation concept"
                              className="w-full h-auto cursor-pointer hover:opacity-90 transition-opacity"
                              onClick={() => openLightbox([msg.imageUrl!], 0)}
                            />
                            <div className="bg-secondary/80 px-3 py-1.5 flex items-center gap-1.5">
                              <Sparkles className="w-3 h-3 text-primary" />
                              <span className="text-xs text-muted-foreground">AI-generated concept</span>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                    
                    {msg.quoteSuggestion && (
                      <Card className="mt-3 bg-card border-primary/30 shadow-lg shadow-primary/10 overflow-hidden w-full max-w-sm">
                        <div className="bg-primary/10 px-4 py-2 border-b border-primary/20 flex items-center justify-between">
                          <span className="text-xs font-bold text-primary uppercase tracking-wider">Ready to Quote</span>
                        </div>
                        <CardContent className="p-4 space-y-4">
                          <p className="text-sm text-muted-foreground line-clamp-3">
                            {(msg.quoteSuggestion && typeof msg.quoteSuggestion === 'object' && 'reasoning' in msg.quoteSuggestion ? (msg.quoteSuggestion as Record<string, string>).reasoning : null) || "Ready to generate a detailed cost breakdown based on our discussion."}
                          </p>
                          <Button 
                            className="w-full bg-white text-black hover:bg-gray-200" 
                            size="sm"
                            disabled={quoteMutation.isPending}
                            onClick={() => quoteMutation.mutate({ data: { conversationId: id, qualityTier: "mid_range" }})}
                          >
                            {quoteMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Hammer className="w-4 h-4 mr-2" />}
                            Get Detailed Estimate
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

            {visualizeMutation.isPending && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex gap-4">
                <div className="shrink-0 w-8 h-8 rounded-full bg-primary/20 text-primary flex items-center justify-center">
                  <Sparkles className="w-4 h-4" />
                </div>
                <div className="px-5 py-4 rounded-2xl rounded-tl-none bg-secondary border border-white/5 flex items-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin text-primary" />
                  <span className="text-sm text-muted-foreground">Generating renovation concept...</span>
                </div>
              </motion.div>
            )}
          </div>

          <div className="p-4 bg-background/50 backdrop-blur-md border-t border-white/5">
            <div className="flex gap-2 mb-3 overflow-x-auto pb-2 scrollbar-hide">
               <Button variant="outline" size="sm" className="shrink-0 rounded-full text-xs" onClick={() => handleQuickAction("What would it cost to remodel the kitchen?")}>Remodel Kitchen</Button>
               <Button variant="outline" size="sm" className="shrink-0 rounded-full text-xs" onClick={() => handleQuickAction("Let's update the master bathroom.")}>Update Bathroom</Button>
               <Button variant="outline" size="sm" className="shrink-0 rounded-full text-xs" onClick={() => handleQuickAction("Give me a full flip estimate including floors and paint.")}>Full Flip</Button>
               <Button
                 variant="outline"
                 size="sm"
                 className="shrink-0 rounded-full text-xs border-primary/30 text-primary hover:bg-primary/10"
                 onClick={handleVisualize}
                 disabled={visualizeMutation.isPending || conv.messages.length < 2}
               >
                 <Sparkles className="w-3 h-3 mr-1" />
                 Visualize
               </Button>
            </div>
            <form onSubmit={(e) => handleSend(e)} className="relative flex items-center">
              <Input 
                value={input}
                onChange={e => setInput(e.target.value)}
                placeholder="Ask about renovation costs..." 
                className="pr-32 bg-black/40 border-white/10 h-14 rounded-xl text-base"
                disabled={sendMutation.isPending || quoteMutation.isPending || visualizeMutation.isPending}
              />
              <div className="absolute right-2 flex gap-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="text-amber-400 hover:text-amber-300 hover:bg-amber-400/20"
                  onClick={handleVisualize}
                  disabled={visualizeMutation.isPending || conv.messages.length < 2}
                  title="Generate renovation concept image"
                >
                  <Sparkles className="w-5 h-5" />
                </Button>
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

      <AnimatePresence>
        {lightboxOpen && lightboxPhotos.length > 0 && (
          <PhotoLightbox
            photos={lightboxPhotos}
            initialIndex={lightboxIndex}
            onClose={() => setLightboxOpen(false)}
            onVisualize={lightboxIsListing && conv.messages.length >= 2 ? handleVisualizePhoto : undefined}
            isVisualizing={visualizeMutation.isPending}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {photoPickerOpen && (
          <PhotoPickerModal
            photos={property?.listingPhotos || []}
            onSelect={handleVisualizePhoto}
            onUpload={handleUploadPhoto}
            onClose={() => setPhotoPickerOpen(false)}
          />
        )}
      </AnimatePresence>
    </AppLayout>
  );
}
