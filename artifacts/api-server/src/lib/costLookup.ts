import { db, materialCostsTable, laborRatesTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { logger } from "./logger";

interface AIScopeItem {
  category: string;
  description: string;
  quantity: number;
  unit: string;
  tradeType?: string;
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

export async function priceLineItemsFromCostEngine(
  aiItems: AIScopeItem[],
  qualityTier: string,
  regionalMultiplier: number
): Promise<PricedLineItem[]> {
  const pricedItems: PricedLineItem[] = [];

  for (const item of aiItems) {
    const category = item.category.toLowerCase();
    const tradeType = item.tradeType || CATEGORY_TO_TRADE[category] || "general";

    const materials = await db.select().from(materialCostsTable)
      .where(and(
        eq(materialCostsTable.category, category),
        eq(materialCostsTable.qualityTier, qualityTier)
      ))
      .limit(1);

    let baseMaterialCost = 0;
    if (materials.length > 0) {
      baseMaterialCost = materials[0].baseUnitCost;
    } else {
      const anyMaterial = await db.select().from(materialCostsTable)
        .where(eq(materialCostsTable.category, category))
        .limit(1);
      baseMaterialCost = anyMaterial.length > 0 ? anyMaterial[0].baseUnitCost : 25;
    }

    const laborRates = await db.select().from(laborRatesTable)
      .where(eq(laborRatesTable.tradeType, tradeType))
      .limit(1);

    let baseLaborRate = 50;
    let productivityFactor = 1.0;
    if (laborRates.length > 0) {
      baseLaborRate = laborRates[0].hourlyRate;
      productivityFactor = laborRates[0].productivityFactor;
    }

    const laborCostPerUnit = (baseLaborRate * productivityFactor) / 4;

    pricedItems.push({
      category: item.category,
      description: item.description,
      materialCost: Math.round(baseMaterialCost * regionalMultiplier * 100) / 100,
      laborCost: Math.round(laborCostPerUnit * regionalMultiplier * 100) / 100,
      quantity: item.quantity,
      unit: item.unit,
      qualityTier,
    });
  }

  return pricedItems;
}
