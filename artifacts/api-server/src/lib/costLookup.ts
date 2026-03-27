import { db, materialCostsTable, laborRatesTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { logger } from "./logger";
import { getLaborRate } from "./costEngine";

interface AIScopeItem {
  category: string;
  description: string;
  quantity: number;
  unit: string;
  tradeType?: string;
  qualityTierOverride?: string;
}

interface PricedLineItem {
  category: string;
  description: string;
  materialCost: number;
  laborCost: number;
  quantity: number;
  unit: string;
  qualityTier: string;
}

const CATEGORY_TO_TRADE: Record<string, string> = {
  kitchen: "carpentry",
  bathroom: "plumbing",
  flooring: "carpentry",
  painting: "painting",
  roofing: "roofing",
  electrical: "electrical",
  plumbing: "plumbing",
  hvac: "hvac",
  windows: "carpentry",
  drywall: "drywall",
  insulation: "insulation",
  demolition: "demolition",
  tiling: "tiling",
  landscaping: "landscaping",
  general: "general",
};

const DESCRIPTION_KEYWORDS: Array<{ keywords: string[]; itemSubstring: string }> = [
  { keywords: ["cabinet", "cabinets", "cabinetry"], itemSubstring: "cabinet" },
  { keywords: ["countertop", "counter top", "counter", "granite", "quartz", "laminate countertop", "marble countertop"], itemSubstring: "countertop" },
  { keywords: ["backsplash", "back splash", "splashback"], itemSubstring: "backsplash" },
  { keywords: ["vanity", "vanities", "bathroom vanity"], itemSubstring: "vanity" },
  { keywords: ["toilet", "commode", "water closet"], itemSubstring: "toilet" },
  { keywords: ["tub", "shower", "bathtub", "bath tub", "shower enclosure"], itemSubstring: "tub/shower" },
  { keywords: ["tile", "tiling", "ceramic tile", "porcelain", "marble tile"], itemSubstring: "tile" },
  { keywords: ["hardwood", "wood floor", "engineered wood"], itemSubstring: "hardwood" },
  { keywords: ["laminate floor", "laminate plank"], itemSubstring: "laminate" },
  { keywords: ["vinyl", "lvp", "luxury vinyl"], itemSubstring: "vinyl" },
  { keywords: ["carpet", "carpeting"], itemSubstring: "carpet" },
  { keywords: ["shingle", "asphalt shingle", "3-tab", "architectural shingle"], itemSubstring: "shingle" },
  { keywords: ["metal roof", "standing seam"], itemSubstring: "metal" },
  { keywords: ["outlet", "switch", "receptacle"], itemSubstring: "outlet" },
  { keywords: ["panel", "breaker", "electrical panel", "200a", "200 amp"], itemSubstring: "panel" },
  { keywords: ["recessed light", "can light", "recessed"], itemSubstring: "recessed" },
  { keywords: ["pipe", "pex", "repipe", "re-pipe", "piping"], itemSubstring: "pipe" },
  { keywords: ["water heater", "hot water", "tankless"], itemSubstring: "water heater" },
  { keywords: ["furnace", "heating"], itemSubstring: "furnace" },
  { keywords: ["ac unit", "air condition", "central air", "a/c"], itemSubstring: "ac" },
  { keywords: ["ductwork", "ducts", "duct"], itemSubstring: "duct" },
  { keywords: ["window", "windows"], itemSubstring: "window" },
  { keywords: ["drywall", "sheetrock", "gypsum"], itemSubstring: "drywall" },
  { keywords: ["insulation", "batt", "spray foam", "blown-in"], itemSubstring: "insulation" },
  { keywords: ["interior paint", "wall paint", "painting interior"], itemSubstring: "interior paint" },
  { keywords: ["exterior paint", "outside paint", "painting exterior"], itemSubstring: "exterior paint" },
];

const LABOR_HOURS_PER_UNIT: Record<string, Record<string, number>> = {
  carpentry:    { sqft: 0.15, linear_ft: 0.5, each: 4.0, hour: 1.0, room: 16.0 },
  plumbing:     { sqft: 0.1,  linear_ft: 0.25, each: 2.5, hour: 1.0, room: 12.0 },
  electrical:   { sqft: 0.08, linear_ft: 0.2,  each: 1.5, hour: 1.0, room: 8.0  },
  hvac:         { sqft: 0.1,  linear_ft: 0.15, each: 6.0, hour: 1.0, room: 16.0 },
  roofing:      { sqft: 0.04, linear_ft: 0.1,  each: 2.0, hour: 1.0, room: 24.0 },
  painting:     { sqft: 0.02, linear_ft: 0.05, each: 0.5, hour: 1.0, room: 6.0  },
  demolition:   { sqft: 0.05, linear_ft: 0.1,  each: 1.0, hour: 1.0, room: 8.0  },
  tiling:       { sqft: 0.12, linear_ft: 0.3,  each: 2.0, hour: 1.0, room: 20.0 },
  drywall:      { sqft: 0.04, linear_ft: 0.08, each: 1.0, hour: 1.0, room: 10.0 },
  insulation:   { sqft: 0.03, linear_ft: 0.06, each: 0.5, hour: 1.0, room: 8.0  },
  landscaping:  { sqft: 0.03, linear_ft: 0.08, each: 1.5, hour: 1.0, room: 8.0  },
  general:      { sqft: 0.1,  linear_ft: 0.2,  each: 2.0, hour: 1.0, room: 8.0  },
};

function getAgeMultiplier(yearBuilt: number | null | undefined): number {
  if (!yearBuilt) return 1.0;
  if (yearBuilt < 1970) return 1.25;
  if (yearBuilt < 1990) return 1.10;
  return 1.0;
}

function findBestMaterialMatch(
  allMaterials: Array<{ item: string; baseUnitCost: number; qualityTier: string }>,
  description: string,
  qualityTier: string
): { baseUnitCost: number } | null {
  const descLower = description.toLowerCase();

  let matchedSubstring: string | null = null;
  for (const entry of DESCRIPTION_KEYWORDS) {
    if (entry.keywords.some(kw => descLower.includes(kw))) {
      matchedSubstring = entry.itemSubstring;
      break;
    }
  }

  if (matchedSubstring) {
    const tierMatch = allMaterials.find(
      m => m.item.toLowerCase().includes(matchedSubstring!) && m.qualityTier === qualityTier
    );
    if (tierMatch) return { baseUnitCost: tierMatch.baseUnitCost };

    const anyMatch = allMaterials.find(
      m => m.item.toLowerCase().includes(matchedSubstring!)
    );
    if (anyMatch) return { baseUnitCost: anyMatch.baseUnitCost };
  }

  const tierFallback = allMaterials.find(m => m.qualityTier === qualityTier);
  if (tierFallback) return { baseUnitCost: tierFallback.baseUnitCost };

  return allMaterials.length > 0 ? { baseUnitCost: allMaterials[0].baseUnitCost } : null;
}

export async function priceLineItemsFromCostEngine(
  aiItems: AIScopeItem[],
  qualityTier: string,
  regionalMultiplier: number,
  yearBuilt?: number | null
): Promise<PricedLineItem[]> {
  const pricedItems: PricedLineItem[] = [];
  const ageFactor = getAgeMultiplier(yearBuilt);

  for (const item of aiItems) {
    const category = item.category.toLowerCase();
    const tradeType = item.tradeType || CATEGORY_TO_TRADE[category] || "general";

    const allMaterials = await db.select().from(materialCostsTable)
      .where(eq(materialCostsTable.category, category));

    const effectiveTier = item.qualityTierOverride || qualityTier;
    const bestMatch = findBestMaterialMatch(allMaterials, item.description, effectiveTier);
    const baseMaterialCost = bestMatch ? bestMatch.baseUnitCost : 25;

    const blsLaborRate = await getLaborRate(tradeType);

    const unit = item.unit.toLowerCase();
    const tradeHours = LABOR_HOURS_PER_UNIT[tradeType] || LABOR_HOURS_PER_UNIT.general;
    const hoursPerUnit = tradeHours[unit] || tradeHours.each || 2.0;
    const laborCostPerUnit = blsLaborRate * hoursPerUnit;

    pricedItems.push({
      category: item.category,
      description: item.description,
      materialCost: Math.round(baseMaterialCost * regionalMultiplier * 100) / 100,
      laborCost: Math.round(laborCostPerUnit * regionalMultiplier * ageFactor * 100) / 100,
      quantity: item.quantity,
      unit: item.unit,
      qualityTier: effectiveTier,
    });
  }

  return pricedItems;
}
