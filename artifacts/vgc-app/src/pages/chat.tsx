import { useState, useRef, useEffect, useCallback } from "react";
import { useRoute, useLocation } from "wouter";
import { useGetConversation, useSendMessage, useGenerateQuote, useVisualizeRenovation, useGenerateConfiguratorQuote } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { AppLayout } from "@/components/layout";
import { motion, AnimatePresence } from "framer-motion";
import { Send, Loader2, Hammer, User, Building, Bed, Bath, Square, Calendar, ChevronLeft, ChevronRight, ImageIcon, Images, X, Sparkles, Upload, GripVertical, Lock, Zap, Check, Trash2, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";

function BeforeAfterSlider({ beforeSrc, afterSrc, onClickAfter, fullscreen }: { beforeSrc: string; afterSrc: string; onClickAfter?: () => void; fullscreen?: boolean }) {
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

  const containerClass = fullscreen
    ? "relative w-full aspect-[16/10] max-h-[80vh] rounded-xl overflow-hidden cursor-col-resize select-none touch-none"
    : "relative w-full aspect-[4/3] rounded-xl overflow-hidden border border-white/10 shadow-lg cursor-col-resize select-none touch-none";

  const labelSize = fullscreen ? "px-3 py-1 text-sm" : "px-2 py-0.5 text-xs";

  return (
    <div
      ref={containerRef}
      className={containerClass}
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
      <div className={`absolute top-2 left-2 rounded bg-black/60 text-white font-medium pointer-events-none ${labelSize}`}>Before</div>
      <div className={`absolute top-2 right-2 rounded bg-black/60 text-white font-medium pointer-events-none ${labelSize}`}>After</div>
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

function PhotoLightbox({ photos, initialIndex, onClose, beforeSrc }: { photos: string[]; initialIndex: number; onClose: () => void; beforeSrc?: string }) {
  const [index, setIndex] = useState(initialIndex);
  const isBeforeAfter = !!beforeSrc;

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (!isBeforeAfter) {
        if (e.key === "ArrowLeft") setIndex(i => (i - 1 + photos.length) % photos.length);
        if (e.key === "ArrowRight") setIndex(i => (i + 1) % photos.length);
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [photos.length, onClose, isBeforeAfter]);

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
        {isBeforeAfter ? (
          <div className="w-full max-w-4xl">
            <BeforeAfterSlider
              beforeSrc={beforeSrc!}
              afterSrc={photos[0]}
              fullscreen
            />
            <div className="mt-2 text-center">
              <span className="bg-black/70 text-white text-sm px-4 py-2 rounded-full inline-flex items-center gap-2">
                <GripVertical className="w-4 h-4" />
                Drag to compare before &amp; after
              </span>
            </div>
          </div>
        ) : (
          <>
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
          </>
        )}
      </div>
    </motion.div>
  );
}

function PropertyPhotoCarousel({ photos, compact = false, onPhotoClick }: { photos: string[]; compact?: boolean; onPhotoClick?: (index: number) => void }) {
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
      className="fixed inset-0 z-50 bg-black/80 flex items-end sm:items-center justify-center sm:p-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, y: 100 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 100 }}
        transition={{ type: "spring", damping: 25, stiffness: 300 }}
        className="bg-card rounded-t-2xl sm:rounded-2xl border border-white/10 shadow-2xl max-w-2xl w-full max-h-[85vh] sm:max-h-[80vh] overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex justify-center sm:hidden pt-2 pb-1">
          <div className="w-10 h-1 rounded-full bg-white/20" />
        </div>
        <div className="px-4 py-3 sm:p-5 border-b border-white/10 flex items-center justify-between">
          <div>
            <h3 className="font-bold text-base sm:text-lg">Choose a room to visualize</h3>
            <p className="text-xs sm:text-sm text-muted-foreground mt-0.5">Select a listing photo or upload your own</p>
          </div>
          <button
            onClick={onClose}
            className="w-9 h-9 sm:w-8 sm:h-8 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-colors touch-target"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="p-3 sm:p-4 overflow-y-auto max-h-[65vh] sm:max-h-[60vh]" style={{ WebkitOverflowScrolling: 'touch' }}>
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

function PhotoStrip({ photos, onPhotoClick }: { photos: string[]; onPhotoClick?: (index: number) => void }) {
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

const CONFIGURATOR_MAP: Record<string, { label: string; groups: Array<{ label: string; key: string; options: Array<{ label: string; price: string }> }> }> = {
  kitchen: {
    label: "Kitchen Remodel",
    groups: [
      { label: "Countertops", key: "countertops", options: [{ label: "Laminate", price: "$" }, { label: "Granite", price: "$$" }, { label: "Quartz", price: "$$$" }] },
      { label: "Cabinets", key: "cabinets", options: [{ label: "Stock", price: "$" }, { label: "Semi-Custom", price: "$$" }, { label: "Custom", price: "$$$" }] },
      { label: "Backsplash", key: "backsplash", options: [{ label: "Ceramic", price: "$" }, { label: "Glass Tile", price: "$$" }, { label: "Natural Stone", price: "$$$" }] },
    ],
  },
  bathroom: {
    label: "Bathroom Remodel",
    groups: [
      { label: "Vanity", key: "vanity", options: [{ label: "Stock", price: "$" }, { label: "Semi-Custom", price: "$$" }, { label: "Custom", price: "$$$" }] },
      { label: "Toilet", key: "toilet", options: [{ label: "Standard", price: "$" }, { label: "Mid-Range", price: "$$" }, { label: "High-End", price: "$$$" }] },
      { label: "Tub / Shower", key: "tubShower", options: [{ label: "Fiberglass", price: "$" }, { label: "Acrylic", price: "$$" }, { label: "Cast Iron", price: "$$$" }] },
      { label: "Tile", key: "tile", options: [{ label: "Ceramic", price: "$" }, { label: "Porcelain", price: "$$" }, { label: "Marble", price: "$$$" }] },
    ],
  },
  flooring: {
    label: "Flooring",
    groups: [
      { label: "Flooring Type", key: "flooringType", options: [{ label: "Laminate", price: "$" }, { label: "Vinyl Plank (LVP)", price: "$" }, { label: "Engineered Hardwood", price: "$$" }, { label: "Solid Hardwood", price: "$$$" }, { label: "Carpet (Builder)", price: "$" }, { label: "Carpet (Premium)", price: "$$" }] },
    ],
  },
  painting: {
    label: "Interior Painting",
    groups: [
      { label: "Paint Grade", key: "paintGrade", options: [{ label: "Builder Grade", price: "$" }, { label: "Premium", price: "$$" }, { label: "Designer", price: "$$$" }] },
    ],
  },
  windows: {
    label: "Window Replacement",
    groups: [
      { label: "Window Type", key: "windowType", options: [{ label: "Vinyl Standard", price: "$" }, { label: "Double-Pane Vinyl", price: "$$" }, { label: "Wood / Fiberglass", price: "$$$" }] },
    ],
  },
  staircase: {
    label: "Staircase Renovation",
    groups: [
      { label: "Treads", key: "treads", options: [{ label: "Carpet Runner", price: "$" }, { label: "Oak Treads", price: "$$" }, { label: "Custom Hardwood", price: "$$$" }] },
      { label: "Railing", key: "railing", options: [{ label: "Wood Painted", price: "$" }, { label: "Wood Stained", price: "$$" }, { label: "Iron / Cable", price: "$$$" }] },
    ],
  },
  roof: {
    label: "Roof Replacement",
    groups: [
      { label: "Roofing Material", key: "roofingMaterial", options: [{ label: "3-Tab Shingles", price: "$" }, { label: "Architectural Shingles", price: "$$" }, { label: "Metal Roofing", price: "$$$" }] },
    ],
  },
  hvac: {
    label: "HVAC System",
    groups: [
      { label: "System Type", key: "systemType", options: [{ label: "Standard Split", price: "$" }, { label: "High-Efficiency", price: "$$" }, { label: "Heat Pump / Dual", price: "$$$" }] },
      { label: "Ductwork", key: "ductwork", options: [{ label: "Patch / Repair", price: "$" }, { label: "Partial Replace", price: "$$" }, { label: "Full Replace", price: "$$$" }] },
    ],
  },
  deck: {
    label: "Deck / Patio",
    groups: [
      { label: "Decking Material", key: "deckingMaterial", options: [{ label: "Pressure-Treated", price: "$" }, { label: "Composite", price: "$$" }, { label: "Hardwood / PVC", price: "$$$" }] },
      { label: "Railing", key: "deckRailing", options: [{ label: "Wood", price: "$" }, { label: "Composite", price: "$$" }, { label: "Cable / Glass", price: "$$$" }] },
    ],
  },
  garage: {
    label: "Garage Renovation",
    groups: [
      { label: "Garage Door", key: "garageDoor", options: [{ label: "Steel (Non-Insulated)", price: "$" }, { label: "Steel (Insulated)", price: "$$" }, { label: "Wood / Custom", price: "$$$" }] },
      { label: "Floor Coating", key: "garageFloor", options: [{ label: "Epoxy Paint", price: "$" }, { label: "Epoxy Flake", price: "$$" }, { label: "Polyaspartic", price: "$$$" }] },
    ],
  },
  basement: {
    label: "Basement Finishing",
    groups: [
      { label: "Finishing Level", key: "finishLevel", options: [{ label: "Basic (Drywall + Paint)", price: "$" }, { label: "Standard (+ Flooring + Lighting)", price: "$$" }, { label: "Full (+ Bathroom + Wet Bar)", price: "$$$" }] },
    ],
  },
  exteriorPaint: {
    label: "Exterior Paint / Siding",
    groups: [
      { label: "Exterior Type", key: "exteriorType", options: [{ label: "Paint Only", price: "$" }, { label: "Paint + Repair", price: "$$" }, { label: "New Siding", price: "$$$" }] },
    ],
  },
  exteriorDoors: {
    label: "Exterior Doors",
    groups: [
      { label: "Front Door", key: "frontDoor", options: [{ label: "Steel Entry", price: "$" }, { label: "Fiberglass", price: "$$" }, { label: "Solid Wood", price: "$$$" }] },
      { label: "Rear / Patio Door", key: "rearDoor", options: [{ label: "Sliding Vinyl", price: "$" }, { label: "Sliding Fiberglass", price: "$$" }, { label: "French Door (Wood)", price: "$$$" }] },
      { label: "Hardware", key: "doorHardware", options: [{ label: "Standard", price: "$" }, { label: "Smart Lock", price: "$$" }, { label: "Premium Smart", price: "$$$" }] },
    ],
  },
  landscaping: {
    label: "Landscaping",
    groups: [
      { label: "Lawn & Plants", key: "lawnPlants", options: [{ label: "Seed + Mulch", price: "$" }, { label: "Sod + Shrubs", price: "$$" }, { label: "Full Design", price: "$$$" }] },
      { label: "Hardscape", key: "hardscape", options: [{ label: "Gravel Paths", price: "$" }, { label: "Pavers", price: "$$" }, { label: "Natural Stone", price: "$$$" }] },
    ],
  },
  windowShutters: {
    label: "Window Shutters",
    groups: [
      { label: "Shutter Material", key: "shutterMaterial", options: [{ label: "Vinyl (Basic)", price: "$" }, { label: "Composite", price: "$$" }, { label: "Real Wood", price: "$$$" }] },
      { label: "Shutter Style", key: "shutterStyle", options: [{ label: "Louvered", price: "$" }, { label: "Board & Batten", price: "$$" }, { label: "Raised Panel", price: "$$$" }] },
    ],
  },
  interiorTrim: { label: "Interior Trim & Molding", groups: [{ label: "Trim Type", key: "trimType", options: [{ label: "Baseboards Only", price: "$" }, { label: "Crown & Baseboards", price: "$$" }, { label: "Full Millwork/Wainscoting", price: "$$$" }] }] },
  interiorDoors: { label: "Interior Doors", groups: [{ label: "Door Style", key: "interiorDoorStyle", options: [{ label: "Hollow Core (Basic)", price: "$" }, { label: "Solid Core", price: "$$" }, { label: "Custom/Barn Doors", price: "$$$" }] }] },
  siding: { label: "Siding & Gutters", groups: [{ label: "Siding Material", key: "sidingMaterial", options: [{ label: "Vinyl Siding", price: "$" }, { label: "Engineered Wood", price: "$$" }, { label: "Fiber Cement", price: "$$$" }] }, { label: "Gutters", key: "gutters", options: [{ label: "Aluminum Seamless", price: "$" }, { label: "Copper/Custom", price: "$$$" }] }] },
  deckPorch: { label: "Decks, Porches & Sunrooms", groups: [{ label: "Structure Type", key: "outdoorStructure", options: [{ label: "Wood Deck", price: "$" }, { label: "Composite Deck", price: "$$" }, { label: "Sunroom/Screened Porch", price: "$$$" }] }] },
  plumbingSystems: { label: "Plumbing & Water Systems", groups: [{ label: "Water Heater", key: "waterHeater", options: [{ label: "Standard Tank", price: "$" }, { label: "Tankless", price: "$$" }] }, { label: "Water Treatment", key: "waterTreatment", options: [{ label: "Basic Softener", price: "$" }, { label: "Whole Home Filtration", price: "$$$" }] }] },
  electricalSolar: { label: "Electrical, Solar & EV", groups: [{ label: "Electrical Upgrades", key: "electricalUpgrade", options: [{ label: "EV Charger Install", price: "$" }, { label: "Panel Upgrade (200A)", price: "$$" }, { label: "Whole Home Rewire", price: "$$$" }] }, { label: "Solar/Power", key: "solarPower", options: [{ label: "Portable Generator Hookup", price: "$" }, { label: "Solar Panel System", price: "$$$" }] }] },
  lighting: { label: "Lighting & Smart Home", groups: [{ label: "Fixture Type", key: "fixtureType", options: [{ label: "Standard Fixtures", price: "$" }, { label: "Recessed Cans", price: "$$" }, { label: "Designer/Chandeliers", price: "$$$" }] }, { label: "Smart Home", key: "smartHome", options: [{ label: "Security System", price: "$" }, { label: "Full Automation System", price: "$$" }] }] },
  specialtyRooms: { label: "Specialty Rooms (Office/Gym/Laundry)", groups: [{ label: "Room Type", key: "specialtyRoomType", options: [{ label: "Laundry/Mudroom", price: "$" }, { label: "Home Office/Gym", price: "$$" }, { label: "Theater/Wine Cellar", price: "$$$" }] }, { label: "Finish Level", key: "specialtyFinish", options: [{ label: "Basic Update", price: "$" }, { label: "Custom Built-ins", price: "$$" }] }] },
  basementAttic: { label: "Basement & Attic Finishing", groups: [{ label: "Space Type", key: "bonusSpaceType", options: [{ label: "Attic Conversion", price: "$$" }, { label: "Basement Finishing", price: "$$$" }] }, { label: "Inclusions", key: "bonusSpaceExtras", options: [{ label: "Open Concept Only", price: "$" }, { label: "Add Bathroom/Wet Bar", price: "$$$" }] }] },
  closets: { label: "Custom Closets & Storage", groups: [{ label: "System Type", key: "closetSystem", options: [{ label: "Wire Shelving", price: "$" }, { label: "Laminate Built-ins", price: "$$" }, { label: "Custom Wood", price: "$$$" }] }, { label: "Scope", key: "closetScope", options: [{ label: "Single Reach-in", price: "$" }, { label: "Primary Walk-in", price: "$$" }] }] },
  fencing: { label: "Fencing & Gates", groups: [{ label: "Fence Material", key: "fenceMaterial", options: [{ label: "Chain Link", price: "$" }, { label: "Treated Wood", price: "$$" }, { label: "Vinyl/Composite", price: "$$$" }] }, { label: "Fence Style", key: "fenceStyle", options: [{ label: "4-Foot Picket", price: "$" }, { label: "6-Foot Privacy", price: "$$" }] }] },
  outdoorLiving: { label: "Outdoor Living & Pools", groups: [{ label: "Feature Type", key: "outdoorFeature", options: [{ label: "Fire Pit or Pergola", price: "$" }, { label: "Outdoor Kitchen/BBQ", price: "$$" }, { label: "In-Ground Pool", price: "$$$" }] }] },
  driveway: { label: "Driveway & Walkways", groups: [{ label: "Material", key: "drivewayMaterial", options: [{ label: "Gravel/Crushed Stone", price: "$" }, { label: "Asphalt", price: "$$" }, { label: "Concrete or Pavers", price: "$$$" }] }, { label: "Scope", key: "drivewayScope", options: [{ label: "Walkway Only", price: "$" }, { label: "Single Car Driveway", price: "$$" }, { label: "Double Car or Extension", price: "$$$" }] }] },
  accessibility: { label: "Accessibility & Aging-in-Place", groups: [{ label: "Modification Type", key: "accessibilityType", options: [{ label: "Grab Bars & Handrails", price: "$" }, { label: "Wheelchair Ramp", price: "$$" }, { label: "Stair Lift/Elevator", price: "$$$" }] }, { label: "Bathroom Updates", key: "accessibleBath", options: [{ label: "Walk-in Tub/Roll-in Shower", price: "$$$" }] }] },
};

interface ConfiguratorQuoteResult {
  lineItems: Array<{ category: string; description: string; materialCost: number; laborCost: number; quantity: number; unit: string; qualityTier: string }>;
  totalMaterialCost: number;
  totalLaborCost: number;
  grandTotal: number;
  selectionHash: string;
  renovationType: string;
  selections: Record<string, string>;
  regionalMultiplier: number;
  metroArea: string;
}

function ConfiguratorChips({ 
  renovationType, 
  conversationId, 
  onBallpark 
}: { 
  renovationType: string; 
  conversationId: number; 
  onBallpark: () => void;
}) {
  const config = CONFIGURATOR_MAP[renovationType];
  const [selections, setSelections] = useState<Record<string, string>>({});
  const [dismissedGroups, setDismissedGroups] = useState<Set<string>>(new Set());
  const [quoteResult, setQuoteResult] = useState<ConfiguratorQuoteResult | null>(null);
  const [submitted, setSubmitted] = useState(false);

  const [error, setError] = useState<string | null>(null);

  const configuratorMutation = useGenerateConfiguratorQuote({
    mutation: {
      onSuccess: (data: ConfiguratorQuoteResult) => {
        setQuoteResult(data);
        setSubmitted(true);
        setError(null);
      },
      onError: (err: { data?: { error?: string }; message?: string }) => {
        setError(err?.data?.error || err?.message || "Failed to generate quote");
      },
    },
  });

  if (!config) return null;

  const activeGroups = config.groups.filter(g => !dismissedGroups.has(g.key));
  const allSelected = activeGroups.length > 0 && activeGroups.every(g => selections[g.key]);

  const handleSubmit = () => {
    if (!allSelected) return;
    const activeSelections = Object.fromEntries(
      Object.entries(selections).filter(([key]) => !dismissedGroups.has(key))
    );
    configuratorMutation.mutate({
      conversationId,
      data: { renovationType, selections: activeSelections },
    });
  };

  if (submitted && quoteResult) {
    return (
      <Card className="mt-3 bg-card border-emerald-500/30 shadow-lg shadow-emerald-500/10 overflow-hidden w-full max-w-[calc(100vw-4rem)] sm:max-w-md">
        <div className="bg-emerald-500/10 px-4 py-2 border-b border-emerald-500/20 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Lock className="w-3.5 h-3.5 text-emerald-400" />
            <span className="text-xs font-bold text-emerald-400 uppercase tracking-wider">Locked Quote</span>
          </div>
          <Badge variant="outline" className="text-[10px] border-emerald-500/30 text-emerald-400">{config.label}</Badge>
        </div>
        <CardContent className="p-4 space-y-3">
          <div className="space-y-1.5">
            {quoteResult.lineItems.map((item, i) => (
              <div key={i} className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground truncate mr-2">{item.description}</span>
                <span className="font-medium text-foreground shrink-0">
                  ${Math.round((item.materialCost + item.laborCost) * item.quantity).toLocaleString()}
                </span>
              </div>
            ))}
          </div>
          <div className="border-t border-white/10 pt-3 flex items-center justify-between">
            <div className="text-sm text-muted-foreground">
              <span className="text-xs">Region: {quoteResult.metroArea} ({quoteResult.regionalMultiplier}x)</span>
            </div>
            <div className="text-right">
              <div className="text-lg font-bold text-foreground">${quoteResult.grandTotal.toLocaleString()}</div>
              <div className="text-xs text-muted-foreground">Materials + Labor</div>
            </div>
          </div>
          <div className="flex items-center gap-1.5 text-xs text-emerald-400/70">
            <Check className="w-3 h-3" />
            <span>Deterministic quote — same selections always produce the same price</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="mt-3 bg-card border-primary/30 shadow-lg shadow-primary/10 overflow-hidden w-full max-w-[calc(100vw-4rem)] sm:max-w-md">
      <div className="bg-primary/10 px-4 py-2 border-b border-primary/20 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Zap className="w-3.5 h-3.5 text-primary" />
          <span className="text-xs font-bold text-primary uppercase tracking-wider">Smart Scope</span>
        </div>
        <Badge variant="outline" className="text-[10px] border-primary/30 text-primary">{config.label}</Badge>
      </div>
      <CardContent className="p-4 space-y-4">
        <p className="text-sm text-muted-foreground">Choose your materials to get a locked, itemized quote:</p>
        {config.groups.map(group => {
          if (dismissedGroups.has(group.key)) return null;
          return (
            <div key={group.key} className="space-y-2 relative group/dismiss">
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold text-foreground uppercase tracking-wide">{group.label}</label>
                <button
                  onClick={() => {
                    setDismissedGroups(prev => {
                      const next = new Set(prev);
                      next.add(group.key);
                      return next;
                    });
                    setSelections(prev => {
                      const next = { ...prev };
                      delete next[group.key];
                      return next;
                    });
                  }}
                  className="text-muted-foreground opacity-40 hover:opacity-100 hover:text-red-400 transition-all p-1 rounded"
                  title="Remove this option"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
                {group.options.map(opt => {
                  const isSelected = selections[group.key] === opt.label;
                  return (
                    <button
                      key={opt.label}
                      onClick={() => setSelections(prev => ({ ...prev, [group.key]: opt.label }))}
                      className={`px-3 py-2.5 sm:py-1.5 rounded-full text-xs font-medium transition-all border ${
                        isSelected
                          ? "bg-primary text-white border-primary shadow-md shadow-primary/20"
                          : "bg-white/5 text-muted-foreground border-white/10 hover:border-primary/50 hover:text-foreground"
                      }`}
                    >
                      {opt.label} <span className="opacity-60 ml-1">{opt.price}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
        {error && (
          <div className="px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-xs">
            {error}
          </div>
        )}
        {dismissedGroups.size > 0 && (
          <div className="flex justify-end pt-1">
            <button
              onClick={() => setDismissedGroups(new Set())}
              className="text-[10px] text-muted-foreground hover:text-primary transition-colors flex items-center gap-1"
            >
              <RotateCcw className="w-3 h-3" /> Restore removed options
            </button>
          </div>
        )}
        <div className="flex gap-2 pt-1">
          <Button
            className="flex-1 bg-white text-black hover:bg-gray-200"
            size="sm"
            disabled={!allSelected || configuratorMutation.isPending}
            onClick={handleSubmit}
          >
            {configuratorMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Lock className="w-4 h-4 mr-2" />}
            Get Locked Quote
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="shrink-0 text-xs"
            onClick={onBallpark}
          >
            <Zap className="w-3 h-3 mr-1" />
            Ballpark
          </Button>
        </div>
      </CardContent>
    </Card>
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
  const [photosExpanded, setPhotosExpanded] = useState(() => typeof window !== 'undefined' ? window.innerWidth >= 640 : false);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState(0);
  const [lightboxPhotos, setLightboxPhotos] = useState<string[]>([]);
  const [lightboxBeforeSrc, setLightboxBeforeSrc] = useState<string | undefined>(undefined);
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

  const openLightbox = (photos: string[], index: number, beforeSrc?: string) => {
    setLightboxPhotos(photos);
    setLightboxIndex(index);
    setLightboxBeforeSrc(beforeSrc);
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
      <div className="flex flex-col h-[calc(100vh-120px)] sm:h-[calc(100vh-140px)] max-w-5xl mx-auto gap-2 sm:gap-3 overflow-hidden">

        {isFirstMessage && property && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="glass-panel rounded-xl sm:rounded-2xl p-3 sm:p-5 shadow-xl shrink-0"
          >
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-5">
              <div className="hidden sm:block">
                <PropertyPhotoCarousel
                  photos={property.listingPhotos || []}
                  onPhotoClick={(i) => openLightbox(property.listingPhotos || [], i)}
                />
              </div>
              <div className="flex flex-col justify-between">
                <div>
                  <div className="flex items-center gap-2 mb-1 sm:mb-2">
                    <Building className="w-4 h-4 sm:w-5 sm:h-5 text-primary shrink-0" />
                    <h2 className="font-bold text-sm sm:text-lg leading-tight truncate">{property.address}</h2>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 sm:gap-3 mt-2">
                    <span className="inline-flex items-center gap-1 text-xs sm:text-sm text-muted-foreground">
                      <Square className="w-3 h-3 sm:w-4 sm:h-4 text-primary/70" />
                      {property.sqft?.toLocaleString()} sqft
                    </span>
                    <span className="inline-flex items-center gap-1 text-xs sm:text-sm text-muted-foreground">
                      <Bed className="w-3 h-3 sm:w-4 sm:h-4 text-primary/70" />
                      {property.bedrooms} beds
                    </span>
                    <span className="inline-flex items-center gap-1 text-xs sm:text-sm text-muted-foreground">
                      <Bath className="w-3 h-3 sm:w-4 sm:h-4 text-primary/70" />
                      {property.bathrooms} baths
                    </span>
                    {property.yearBuilt && (
                      <span className="inline-flex items-center gap-1 text-xs sm:text-sm text-muted-foreground">
                        <Calendar className="w-3 h-3 sm:w-4 sm:h-4 text-primary/70" />
                        {property.yearBuilt}
                      </span>
                    )}
                  </div>
                  {hasPhotos && (
                    <div className="sm:hidden mt-2">
                      <PhotoStrip
                        photos={property.listingPhotos!}
                        onPhotoClick={(i) => openLightbox(property.listingPhotos || [], i)}
                      />
                    </div>
                  )}
                </div>
                <p className="text-xs text-muted-foreground/70 mt-2 sm:mt-4">Describe the renovation scope below to get started.</p>
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
                      onClick={() => openLightbox(property.listingPhotos || [], 0)}
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
                  onPhotoClick={(i) => openLightbox(property.listingPhotos || [], i)}
                />
              </motion.div>
            )}
          </div>
        )}

        <div className="flex-1 glass-panel rounded-xl sm:rounded-2xl flex flex-col overflow-hidden shadow-2xl relative min-h-0">
          <div ref={scrollRef} className="flex-1 overflow-y-auto p-3 sm:p-4 md:p-6 space-y-4 sm:space-y-6" style={{ WebkitOverflowScrolling: 'touch' }}>
            {conv.messages.map((msg, i: number) => {
              const isAi = msg.role === "assistant";
              const displayContent = isAi ? sanitizeAIMessage(msg.content) : msg.content;
              return (
                <motion.div 
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  key={i} 
                  className={`flex gap-2 sm:gap-4 ${isAi ? "flex-row" : "flex-row-reverse"}`}
                >
                  <div className={`shrink-0 w-7 h-7 sm:w-8 sm:h-8 rounded-full flex items-center justify-center ${isAi ? "bg-primary/20 text-primary" : "bg-accent/20 text-accent"}`}>
                    {isAi ? <Hammer className="w-3.5 h-3.5 sm:w-4 sm:h-4" /> : <User className="w-3.5 h-3.5 sm:w-4 sm:h-4" />}
                  </div>
                  <div className={`flex flex-col max-w-[90%] sm:max-w-[85%] ${isAi ? "items-start" : "items-end"}`}>
                    <div className={`px-3.5 py-2.5 sm:px-5 sm:py-3.5 rounded-2xl text-sm leading-relaxed whitespace-pre-line ${isAi ? "bg-secondary border border-white/5 text-foreground rounded-tl-none" : "bg-gradient-to-br from-primary to-indigo-600 text-white shadow-lg shadow-primary/20 rounded-tr-none"}`}>
                      {formatMessage(displayContent)}
                    </div>

                    {msg.imageUrl && (
                      <div className="mt-3 max-w-sm">
                        {msg.sourceImageUrl ? (
                          <div>
                            <BeforeAfterSlider
                              beforeSrc={msg.sourceImageUrl}
                              afterSrc={msg.imageUrl}
                              onClickAfter={() => openLightbox([msg.imageUrl!], 0, msg.sourceImageUrl)}
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
                    
                    {(() => {
                      const activeType = msg.configuratorType;
                      if (activeType && typeof activeType === 'string' && activeType.length > 0) {
                        return (
                          <ConfiguratorChips
                            renovationType={activeType}
                            conversationId={id}
                            onBallpark={() => quoteMutation.mutate({ data: { conversationId: id, qualityTier: "mid_range" }})}
                          />
                        );
                      }
                      return null;
                    })()}

                    {msg.quoteSuggestion && !msg.configuratorType && (
                      <Card className="mt-3 bg-card border-amber-500/30 shadow-lg shadow-amber-500/10 overflow-hidden w-full max-w-sm">
                        <div className="bg-amber-500/10 px-4 py-2 border-b border-amber-500/20 flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <Zap className="w-3.5 h-3.5 text-amber-400" />
                            <span className="text-xs font-bold text-amber-400 uppercase tracking-wider">Estimated Quote</span>
                          </div>
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

          <div className="p-2.5 sm:p-4 bg-background/50 backdrop-blur-md border-t border-white/5">
            <div className="flex gap-1.5 sm:gap-2 mb-2 sm:mb-3 overflow-x-auto pb-1 scrollbar-hide scroll-snap-x -mx-1 px-1">
               <Button variant="outline" size="sm" className="shrink-0 rounded-full text-xs h-8 touch-target" onClick={() => handleQuickAction("What would it cost to remodel the kitchen?")}>Remodel Kitchen</Button>
               <Button variant="outline" size="sm" className="shrink-0 rounded-full text-xs h-8 touch-target" onClick={() => handleQuickAction("Let's update the master bathroom.")}>Update Bathroom</Button>
               <Button variant="outline" size="sm" className="shrink-0 rounded-full text-xs h-8 touch-target" onClick={() => handleQuickAction("Give me a full flip estimate including floors and paint.")}>Full Flip</Button>
               <Button
                 variant="outline"
                 size="sm"
                 className="shrink-0 rounded-full text-xs h-8 touch-target border-primary/30 text-primary hover:bg-primary/10"
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
                className="pr-[7.5rem] sm:pr-36 bg-black/40 border-white/10 h-12 sm:h-14 rounded-xl text-sm sm:text-base"
                disabled={sendMutation.isPending || quoteMutation.isPending || visualizeMutation.isPending}
              />
              <div className="absolute right-1.5 sm:right-2 flex gap-0.5 sm:gap-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="text-amber-400 hover:text-amber-300 hover:bg-amber-400/20 w-9 h-9 sm:w-10 sm:h-10"
                  onClick={handleVisualize}
                  disabled={visualizeMutation.isPending || conv.messages.length < 2}
                  title="Generate renovation concept image"
                >
                  <Sparkles className="w-4 h-4 sm:w-5 sm:h-5" />
                </Button>
                <Button 
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="text-primary hover:text-primary hover:bg-primary/20 w-9 h-9 sm:w-10 sm:h-10"
                  onClick={(e) => handleSend(e as React.FormEvent, true)}
                  disabled={!input.trim() || sendMutation.isPending}
                  title="Generate Quote from this message"
                >
                  <Hammer className="w-4 h-4 sm:w-5 sm:h-5" />
                </Button>
                <Button 
                  type="submit" 
                  size="icon" 
                  className="bg-primary hover:bg-primary/90 text-white w-9 h-9 sm:w-10 sm:h-10"
                  disabled={!input.trim() || sendMutation.isPending}
                >
                  <Send className="w-4 h-4 sm:w-5 sm:h-5" />
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
            onClose={() => { setLightboxOpen(false); setLightboxBeforeSrc(undefined); }}
            beforeSrc={lightboxBeforeSrc}
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
