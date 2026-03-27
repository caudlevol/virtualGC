import { priceLineItemsFromCostEngine } from "./costLookup";
import { getRegionalMultiplier } from "./costEngine";
import { createHash } from "crypto";

const configuratorQuoteCache = new Map<string, ConfiguratorQuoteResult>();
const CACHE_TTL_MS = 10 * 60 * 1000;
setInterval(() => configuratorQuoteCache.clear(), CACHE_TTL_MS);

interface ConfiguratorOption {
  label: string;
  price: string;
  item: string;
  qualityTier: string;
}

interface ConfiguratorGroup {
  label: string;
  key: string;
  options: ConfiguratorOption[];
}

interface ConfiguratorRenovationType {
  label: string;
  groups: ConfiguratorGroup[];
  category: string;
  defaultQuantities: (property: PropertyInfo) => Record<string, { quantity: number; unit: string }>;
}

interface PropertyInfo {
  sqft: number;
  bedrooms: number;
  bathrooms: number;
  yearBuilt: number | null;
  zipCode: string;
}

export const CONFIGURATOR_MAP: Record<string, ConfiguratorRenovationType> = {
  kitchen: {
    label: "Kitchen Remodel",
    category: "kitchen",
    groups: [
      {
        label: "Countertops",
        key: "countertops",
        options: [
          { label: "Laminate", price: "$", item: "Countertop (laminate)", qualityTier: "economy" },
          { label: "Granite", price: "$$", item: "Countertop (granite)", qualityTier: "mid_range" },
          { label: "Quartz", price: "$$$", item: "Countertop (quartz)", qualityTier: "premium" },
        ],
      },
      {
        label: "Cabinets",
        key: "cabinets",
        options: [
          { label: "Stock", price: "$", item: "Cabinets (stock)", qualityTier: "economy" },
          { label: "Semi-Custom", price: "$$", item: "Cabinets (semi-custom)", qualityTier: "mid_range" },
          { label: "Custom", price: "$$$", item: "Cabinets (custom)", qualityTier: "premium" },
        ],
      },
      {
        label: "Backsplash",
        key: "backsplash",
        options: [
          { label: "Ceramic", price: "$", item: "Backsplash (ceramic)", qualityTier: "economy" },
          { label: "Glass Tile", price: "$$", item: "Backsplash (glass tile)", qualityTier: "mid_range" },
          { label: "Natural Stone", price: "$$$", item: "Backsplash (natural stone)", qualityTier: "premium" },
        ],
      },
    ],
    defaultQuantities: (p) => ({
      countertops: { quantity: Math.max(25, Math.round(p.sqft * 0.02)), unit: "sqft" },
      cabinets: { quantity: Math.max(15, Math.round(p.sqft * 0.015)), unit: "linear_ft" },
      backsplash: { quantity: Math.max(20, Math.round(p.sqft * 0.015)), unit: "sqft" },
    }),
  },
  bathroom: {
    label: "Bathroom Remodel",
    category: "bathroom",
    groups: [
      {
        label: "Vanity",
        key: "vanity",
        options: [
          { label: "Stock", price: "$", item: "Vanity (stock)", qualityTier: "economy" },
          { label: "Semi-Custom", price: "$$", item: "Vanity (semi-custom)", qualityTier: "mid_range" },
          { label: "Custom", price: "$$$", item: "Vanity (custom)", qualityTier: "premium" },
        ],
      },
      {
        label: "Toilet",
        key: "toilet",
        options: [
          { label: "Standard", price: "$", item: "Toilet (standard)", qualityTier: "economy" },
          { label: "Mid-Range", price: "$$", item: "Toilet (mid-range)", qualityTier: "mid_range" },
          { label: "High-End", price: "$$$", item: "Toilet (high-end)", qualityTier: "premium" },
        ],
      },
      {
        label: "Tub / Shower",
        key: "tubShower",
        options: [
          { label: "Fiberglass", price: "$", item: "Tub/Shower (fiberglass)", qualityTier: "economy" },
          { label: "Acrylic", price: "$$", item: "Tub/Shower (acrylic)", qualityTier: "mid_range" },
          { label: "Cast Iron", price: "$$$", item: "Tub/Shower (cast iron/freestanding)", qualityTier: "premium" },
        ],
      },
      {
        label: "Tile",
        key: "tile",
        options: [
          { label: "Ceramic", price: "$", item: "Tile (ceramic)", qualityTier: "economy" },
          { label: "Porcelain", price: "$$", item: "Tile (porcelain)", qualityTier: "mid_range" },
          { label: "Marble", price: "$$$", item: "Tile (marble)", qualityTier: "premium" },
        ],
      },
    ],
    defaultQuantities: (p) => ({
      vanity: { quantity: Math.max(1, p.bathrooms), unit: "each" },
      toilet: { quantity: Math.max(1, p.bathrooms), unit: "each" },
      tubShower: { quantity: Math.max(1, p.bathrooms), unit: "each" },
      tile: { quantity: Math.max(50, Math.round(p.bathrooms * 80)), unit: "sqft" },
    }),
  },
  flooring: {
    label: "Flooring",
    category: "flooring",
    groups: [
      {
        label: "Flooring Type",
        key: "flooringType",
        options: [
          { label: "Laminate", price: "$", item: "Laminate", qualityTier: "economy" },
          { label: "Vinyl Plank (LVP)", price: "$", item: "Vinyl plank (LVP)", qualityTier: "economy" },
          { label: "Engineered Hardwood", price: "$$", item: "Engineered hardwood", qualityTier: "mid_range" },
          { label: "Solid Hardwood", price: "$$$", item: "Solid hardwood", qualityTier: "premium" },
          { label: "Carpet (Builder)", price: "$", item: "Carpet (builder grade)", qualityTier: "economy" },
          { label: "Carpet (Premium)", price: "$$", item: "Carpet (premium)", qualityTier: "mid_range" },
        ],
      },
    ],
    defaultQuantities: (p) => ({
      flooringType: { quantity: Math.max(200, Math.round(p.sqft * 0.7)), unit: "sqft" },
    }),
  },
  painting: {
    label: "Interior Painting",
    category: "painting",
    groups: [
      {
        label: "Paint Grade",
        key: "paintGrade",
        options: [
          { label: "Builder Grade", price: "$", item: "Interior paint (builder grade)", qualityTier: "economy" },
          { label: "Premium", price: "$$", item: "Interior paint (premium)", qualityTier: "mid_range" },
          { label: "Designer", price: "$$$", item: "Interior paint (designer)", qualityTier: "premium" },
        ],
      },
    ],
    defaultQuantities: (p) => ({
      paintGrade: { quantity: Math.max(500, Math.round(p.sqft * 3)), unit: "sqft" },
    }),
  },
  windows: {
    label: "Window Replacement",
    category: "windows",
    groups: [
      {
        label: "Window Type",
        key: "windowType",
        options: [
          { label: "Vinyl Standard", price: "$", item: "Vinyl window (standard)", qualityTier: "economy" },
          { label: "Double-Pane Vinyl", price: "$$", item: "Double-pane vinyl", qualityTier: "mid_range" },
          { label: "Wood / Fiberglass", price: "$$$", item: "Wood/fiberglass window", qualityTier: "premium" },
        ],
      },
    ],
    defaultQuantities: (p) => ({
      windowType: { quantity: Math.max(5, Math.round(p.sqft / 200)), unit: "each" },
    }),
  },
  staircase: {
    label: "Staircase Renovation",
    category: "staircase",
    groups: [
      {
        label: "Treads",
        key: "treads",
        options: [
          { label: "Carpet Runner", price: "$", item: "Stair treads (carpet runner)", qualityTier: "economy" },
          { label: "Oak Treads", price: "$$", item: "Stair treads (oak)", qualityTier: "mid_range" },
          { label: "Custom Hardwood", price: "$$$", item: "Stair treads (custom hardwood)", qualityTier: "premium" },
        ],
      },
      {
        label: "Railing",
        key: "railing",
        options: [
          { label: "Wood Painted", price: "$", item: "Railing (wood painted)", qualityTier: "economy" },
          { label: "Wood Stained", price: "$$", item: "Railing (wood stained)", qualityTier: "mid_range" },
          { label: "Iron / Cable", price: "$$$", item: "Railing (iron/cable)", qualityTier: "premium" },
        ],
      },
    ],
    defaultQuantities: () => ({
      treads: { quantity: 14, unit: "each" },
      railing: { quantity: 20, unit: "linear_ft" },
    }),
  },
  roof: {
    label: "Roof Replacement",
    category: "roofing",
    groups: [
      {
        label: "Roofing Material",
        key: "roofingMaterial",
        options: [
          { label: "3-Tab Shingles", price: "$", item: "3-tab shingles", qualityTier: "economy" },
          { label: "Architectural Shingles", price: "$$", item: "Architectural shingles", qualityTier: "mid_range" },
          { label: "Metal Roofing", price: "$$$", item: "Metal roofing", qualityTier: "premium" },
        ],
      },
    ],
    defaultQuantities: (p) => ({
      roofingMaterial: { quantity: Math.max(1000, Math.round(p.sqft * 1.15)), unit: "sqft" },
    }),
  },
  hvac: {
    label: "HVAC System",
    category: "hvac",
    groups: [
      {
        label: "System Type",
        key: "systemType",
        options: [
          { label: "Standard Split", price: "$", item: "HVAC system (standard split)", qualityTier: "economy" },
          { label: "High-Efficiency", price: "$$", item: "HVAC system (high-efficiency)", qualityTier: "mid_range" },
          { label: "Heat Pump / Dual", price: "$$$", item: "HVAC system (heat pump)", qualityTier: "premium" },
        ],
      },
      {
        label: "Ductwork",
        key: "ductwork",
        options: [
          { label: "Patch / Repair", price: "$", item: "Ductwork (patch/repair)", qualityTier: "economy" },
          { label: "Partial Replace", price: "$$", item: "Ductwork (partial replace)", qualityTier: "mid_range" },
          { label: "Full Replace", price: "$$$", item: "Ductwork (full replace)", qualityTier: "premium" },
        ],
      },
    ],
    defaultQuantities: (p) => ({
      systemType: { quantity: 1, unit: "each" },
      ductwork: { quantity: Math.max(50, Math.round(p.sqft * 0.05)), unit: "linear_ft" },
    }),
  },
  deck: {
    label: "Deck / Patio",
    category: "deck",
    groups: [
      {
        label: "Decking Material",
        key: "deckingMaterial",
        options: [
          { label: "Pressure-Treated", price: "$", item: "Deck (pressure-treated lumber)", qualityTier: "economy" },
          { label: "Composite", price: "$$", item: "Deck (composite)", qualityTier: "mid_range" },
          { label: "Hardwood / PVC", price: "$$$", item: "Deck (hardwood/PVC)", qualityTier: "premium" },
        ],
      },
      {
        label: "Railing",
        key: "deckRailing",
        options: [
          { label: "Wood", price: "$", item: "Deck railing (wood)", qualityTier: "economy" },
          { label: "Composite", price: "$$", item: "Deck railing (composite)", qualityTier: "mid_range" },
          { label: "Cable / Glass", price: "$$$", item: "Deck railing (cable/glass)", qualityTier: "premium" },
        ],
      },
    ],
    defaultQuantities: (p) => ({
      deckingMaterial: { quantity: Math.max(150, Math.round(p.sqft * 0.15)), unit: "sqft" },
      deckRailing: { quantity: Math.max(30, Math.round(p.sqft * 0.02)), unit: "linear_ft" },
    }),
  },
  garage: {
    label: "Garage Renovation",
    category: "garage",
    groups: [
      {
        label: "Garage Door",
        key: "garageDoor",
        options: [
          { label: "Steel (Non-Insulated)", price: "$", item: "Garage door (steel non-insulated)", qualityTier: "economy" },
          { label: "Steel (Insulated)", price: "$$", item: "Garage door (steel insulated)", qualityTier: "mid_range" },
          { label: "Wood / Custom", price: "$$$", item: "Garage door (wood/custom)", qualityTier: "premium" },
        ],
      },
      {
        label: "Floor Coating",
        key: "garageFloor",
        options: [
          { label: "Epoxy Paint", price: "$", item: "Garage floor (epoxy paint)", qualityTier: "economy" },
          { label: "Epoxy Flake", price: "$$", item: "Garage floor (epoxy flake)", qualityTier: "mid_range" },
          { label: "Polyaspartic", price: "$$$", item: "Garage floor (polyaspartic)", qualityTier: "premium" },
        ],
      },
    ],
    defaultQuantities: () => ({
      garageDoor: { quantity: 1, unit: "each" },
      garageFloor: { quantity: 400, unit: "sqft" },
    }),
  },
  basement: {
    label: "Basement Finishing",
    category: "basement",
    groups: [
      {
        label: "Finishing Level",
        key: "finishLevel",
        options: [
          { label: "Basic (Drywall + Paint)", price: "$", item: "Basement finish (basic)", qualityTier: "economy" },
          { label: "Standard (+ Flooring + Lighting)", price: "$$", item: "Basement finish (standard)", qualityTier: "mid_range" },
          { label: "Full (+ Bathroom + Wet Bar)", price: "$$$", item: "Basement finish (full)", qualityTier: "premium" },
        ],
      },
    ],
    defaultQuantities: (p) => ({
      finishLevel: { quantity: Math.max(400, Math.round(p.sqft * 0.4)), unit: "sqft" },
    }),
  },
  exteriorPaint: {
    label: "Exterior Paint / Siding",
    category: "exteriorPaint",
    groups: [
      {
        label: "Exterior Type",
        key: "exteriorType",
        options: [
          { label: "Paint Only", price: "$", item: "Exterior paint (standard)", qualityTier: "economy" },
          { label: "Paint + Repair", price: "$$", item: "Exterior paint (with repair)", qualityTier: "mid_range" },
          { label: "New Siding", price: "$$$", item: "Siding (vinyl/fiber cement)", qualityTier: "premium" },
        ],
      },
    ],
    defaultQuantities: (p) => ({
      exteriorType: { quantity: Math.max(1000, Math.round(p.sqft * 1.2)), unit: "sqft" },
    }),
  },
  landscaping: {
    label: "Landscaping",
    category: "landscaping",
    groups: [
      {
        label: "Lawn & Plants",
        key: "lawnPlants",
        options: [
          { label: "Seed + Mulch", price: "$", item: "Landscaping (seed/mulch)", qualityTier: "economy" },
          { label: "Sod + Shrubs", price: "$$", item: "Landscaping (sod/shrubs)", qualityTier: "mid_range" },
          { label: "Full Design", price: "$$$", item: "Landscaping (full design)", qualityTier: "premium" },
        ],
      },
      {
        label: "Hardscape",
        key: "hardscape",
        options: [
          { label: "Gravel Paths", price: "$", item: "Hardscape (gravel)", qualityTier: "economy" },
          { label: "Pavers", price: "$$", item: "Hardscape (pavers)", qualityTier: "mid_range" },
          { label: "Natural Stone", price: "$$$", item: "Hardscape (natural stone)", qualityTier: "premium" },
        ],
      },
    ],
    defaultQuantities: (p) => ({
      lawnPlants: { quantity: Math.max(500, Math.round(p.sqft * 0.3)), unit: "sqft" },
      hardscape: { quantity: Math.max(100, Math.round(p.sqft * 0.05)), unit: "sqft" },
    }),
  },
};

export function computeSelectionHash(renovationType: string, selections: Record<string, string>): string {
  const sorted = Object.entries(selections).sort(([a], [b]) => a.localeCompare(b));
  const str = `${renovationType}:${sorted.map(([k, v]) => `${k}=${v}`).join(",")}`;
  return createHash("sha256").update(str).digest("hex").slice(0, 16);
}

export interface ConfiguratorQuoteResult {
  lineItems: Array<{
    category: string;
    description: string;
    materialCost: number;
    laborCost: number;
    quantity: number;
    unit: string;
    qualityTier: string;
  }>;
  totalMaterialCost: number;
  totalLaborCost: number;
  grandTotal: number;
  selectionHash: string;
  renovationType: string;
  selections: Record<string, string>;
  regionalMultiplier: number;
  metroArea: string;
}

export async function generateConfiguratorQuote(
  renovationType: string,
  selections: Record<string, string>,
  property: PropertyInfo,
  conversationId?: number
): Promise<ConfiguratorQuoteResult> {
  const config = CONFIGURATOR_MAP[renovationType];
  if (!config) {
    throw new Error(`Unknown renovation type: ${renovationType}`);
  }

  const quantities = config.defaultQuantities(property);
  const regional = await getRegionalMultiplier(property.zipCode);

  const missingGroups: string[] = [];
  const invalidSelections: string[] = [];
  for (const group of config.groups) {
    const selectedLabel = selections[group.key];
    if (!selectedLabel) {
      missingGroups.push(group.label);
      continue;
    }
    const option = group.options.find(o => o.label === selectedLabel);
    if (!option) {
      invalidSelections.push(`${group.label}: "${selectedLabel}" is not a valid option`);
    }
  }
  if (missingGroups.length > 0) {
    throw new Error(`Missing selections for: ${missingGroups.join(", ")}`);
  }
  if (invalidSelections.length > 0) {
    throw new Error(`Invalid selections: ${invalidSelections.join("; ")}`);
  }

  const unknownKeys = Object.keys(selections).filter(k => !config.groups.some(g => g.key === k));
  if (unknownKeys.length > 0) {
    throw new Error(`Unknown selection keys: ${unknownKeys.join(", ")}`);
  }

  const selectionHash = computeSelectionHash(renovationType, selections);
  const cacheKey = `${conversationId ?? "no-conv"}:${selectionHash}`;
  const cached = configuratorQuoteCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  const aiItems: Array<{ category: string; description: string; quantity: number; unit: string; qualityTierOverride: string }> = [];

  for (const group of config.groups) {
    const selectedLabel = selections[group.key];
    const option = group.options.find(o => o.label === selectedLabel)!;
    const qty = quantities[group.key] || { quantity: 1, unit: "each" };

    aiItems.push({
      category: config.category,
      description: option.item,
      quantity: qty.quantity,
      unit: qty.unit,
      qualityTierOverride: option.qualityTier,
    });
  }

  const lineItems = await priceLineItemsFromCostEngine(
    aiItems,
    "mid_range",
    regional.factor,
    property.yearBuilt
  );

  const totalMaterialCost = lineItems.reduce((sum, li) => sum + li.materialCost * li.quantity, 0);
  const totalLaborCost = lineItems.reduce((sum, li) => sum + li.laborCost * li.quantity, 0);

  const result: ConfiguratorQuoteResult = {
    lineItems,
    totalMaterialCost: Math.round(totalMaterialCost),
    totalLaborCost: Math.round(totalLaborCost),
    grandTotal: Math.round(totalMaterialCost + totalLaborCost),
    selectionHash,
    renovationType,
    selections,
    regionalMultiplier: regional.factor,
    metroArea: regional.metroArea,
  };

  configuratorQuoteCache.set(cacheKey, result);
  return result;
}

const RENOVATION_PATTERNS: Array<{ type: string; keywords: string[]; strictKeywords: string[] }> = [
  {
    type: "kitchen",
    keywords: ["kitchen remodel", "remodel kitchen", "kitchen renovation", "renovate kitchen", "update kitchen", "redo kitchen", "new kitchen", "kitchen upgrade", "kitchen makeover", "kitchen cost", "cost kitchen", "kitchen counter", "kitchen cabinet", "upgrade countertop", "new countertop", "new cabinet"],
    strictKeywords: ["kitchen remodel", "remodel kitchen", "kitchen renovation", "renovate kitchen", "update kitchen", "redo kitchen", "kitchen upgrade", "kitchen makeover"],
  },
  {
    type: "bathroom",
    keywords: ["bathroom remodel", "remodel bathroom", "bathroom renovation", "renovate bathroom", "update bathroom", "redo bathroom", "new bathroom", "bathroom upgrade", "bath remodel", "bathroom makeover", "bathroom cost", "cost bathroom", "new vanity", "shower remodel", "tub replacement", "new toilet"],
    strictKeywords: ["bathroom remodel", "remodel bathroom", "bathroom renovation", "renovate bathroom", "update bathroom", "redo bathroom", "bathroom upgrade", "bath remodel", "bathroom makeover"],
  },
  {
    type: "flooring",
    keywords: ["new floor", "replace floor", "flooring", "hardwood floor", "new carpet", "replace carpet", "vinyl floor", "laminate floor", "redo floor", "lvp", "vinyl plank", "engineered hardwood"],
    strictKeywords: ["new floor", "replace floor", "flooring", "hardwood floor", "new carpet", "replace carpet", "redo floor"],
  },
  {
    type: "painting",
    keywords: ["paint ", "repaint", "new paint", "painting", "interior paint", "paint job", "fresh paint", "paint throughout", "fresh coat"],
    strictKeywords: ["interior paint", "paint job", "paint throughout", "repaint entire", "repaint all", "full repaint", "whole house paint"],
  },
  {
    type: "windows",
    keywords: ["replace window", "new window", "window replacement", "upgrade window", "window upgrade", "double pane", "energy efficient window"],
    strictKeywords: ["replace window", "new window", "window replacement", "upgrade window", "window upgrade"],
  },
  {
    type: "staircase",
    keywords: ["stair", "staircase", "stairway", "banister", "railing", "baluster", "newel", "tread", "stair reno", "stair remodel", "update stair", "modernize stair"],
    strictKeywords: ["staircase remodel", "staircase renovation", "update staircase", "redo staircase", "new staircase", "stair renovation", "stair remodel", "modernize stair"],
  },
  {
    type: "roof",
    keywords: ["roof", "roofing", "re-roof", "reroof", "new roof", "shingle", "roof replacement", "roof repair", "roof leak"],
    strictKeywords: ["new roof", "roof replacement", "replace roof", "re-roof", "reroof", "roofing project"],
  },
  {
    type: "hvac",
    keywords: ["hvac", "heating", "air conditioning", "furnace", "heat pump", "central air", "ac unit", "ductwork", "new ac", "replace furnace", "replace hvac"],
    strictKeywords: ["new hvac", "replace hvac", "hvac system", "new furnace", "replace furnace", "new ac unit", "replace ac", "hvac upgrade"],
  },
  {
    type: "deck",
    keywords: ["deck", "patio", "new deck", "replace deck", "build deck", "deck remodel", "outdoor deck", "composite deck", "porch"],
    strictKeywords: ["new deck", "build deck", "replace deck", "deck remodel", "deck renovation", "new patio", "patio renovation"],
  },
  {
    type: "garage",
    keywords: ["garage", "garage door", "garage floor", "garage renovation", "garage remodel", "new garage door", "epoxy floor", "garage conversion"],
    strictKeywords: ["garage renovation", "garage remodel", "new garage door", "garage door replacement", "garage floor"],
  },
  {
    type: "basement",
    keywords: ["basement", "finish basement", "basement remodel", "basement renovation", "unfinished basement", "basement conversion", "basement finishing"],
    strictKeywords: ["finish basement", "basement remodel", "basement renovation", "basement finishing", "basement conversion"],
  },
  {
    type: "exteriorPaint",
    keywords: ["exterior paint", "paint outside", "outside paint", "paint exterior", "siding", "new siding", "vinyl siding", "replace siding", "house paint", "exterior stain"],
    strictKeywords: ["exterior paint", "paint exterior", "new siding", "replace siding", "siding replacement", "exterior painting"],
  },
  {
    type: "landscaping",
    keywords: ["landscaping", "landscape", "lawn", "yard", "garden", "hardscape", "paver", "sod", "new lawn", "curb appeal", "outdoor space", "planting"],
    strictKeywords: ["landscaping project", "landscape renovation", "new landscaping", "landscape design", "hardscape project", "redo landscaping", "landscape remodel"],
  },
];

export function detectRenovationIntent(message: string): string | null {
  const msg = message.toLowerCase().replace(/\b(the|a|an|my|our|this|that|master|guest|main|half)\b/g, " ").replace(/\s+/g, " ").trim();

  for (const pattern of RENOVATION_PATTERNS) {
    if (pattern.keywords.some(kw => msg.includes(kw))) {
      return pattern.type;
    }
  }

  return null;
}

const RECOMMENDATION_VERBS = ["recommend", "suggest", "start with", "focus on", "consider", "let's start", "begin with", "tackle", "prioritize", "biggest impact"];

function detectRenovationIntentStrict(message: string): string | null {
  const msg = message.toLowerCase().replace(/\b(the|a|an|my|our|this|that|master|guest|main|half)\b/g, " ").replace(/\s+/g, " ").trim();

  const hasRecommendationContext = RECOMMENDATION_VERBS.some(v => msg.includes(v));

  for (const pattern of RENOVATION_PATTERNS) {
    const strictMatch = pattern.strictKeywords.some(kw => msg.includes(kw));
    if (!strictMatch) continue;

    if (hasRecommendationContext) return pattern.type;

    const keywordHits = pattern.keywords.filter(kw => msg.includes(kw)).length;
    if (keywordHits >= 2) return pattern.type;
  }

  return null;
}

export function detectRenovationIntentFromBoth(userMessage: string, aiResponse: string): string | null {
  const userIntent = detectRenovationIntent(userMessage);
  if (userIntent) return userIntent;

  return detectRenovationIntentStrict(aiResponse);
}

export function getConfiguratorOptions(renovationType: string) {
  const config = CONFIGURATOR_MAP[renovationType];
  if (!config) return null;

  return {
    renovationType,
    label: config.label,
    groups: config.groups.map(g => ({
      label: g.label,
      key: g.key,
      options: g.options.map(o => ({
        label: o.label,
        price: o.price,
      })),
    })),
  };
}
