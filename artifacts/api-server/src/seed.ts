import { db, materialCostsTable, laborRatesTable, regionalMultipliersTable } from "@workspace/db";
import { logger } from "./lib/logger";

const MATERIALS = [
  { category: "kitchen", item: "Cabinets (stock)", qualityTier: "economy", baseUnitCost: 75, unit: "linear_ft" },
  { category: "kitchen", item: "Cabinets (semi-custom)", qualityTier: "mid_range", baseUnitCost: 200, unit: "linear_ft" },
  { category: "kitchen", item: "Cabinets (custom)", qualityTier: "premium", baseUnitCost: 500, unit: "linear_ft" },
  { category: "kitchen", item: "Countertop (laminate)", qualityTier: "economy", baseUnitCost: 15, unit: "sqft" },
  { category: "kitchen", item: "Countertop (granite)", qualityTier: "mid_range", baseUnitCost: 55, unit: "sqft" },
  { category: "kitchen", item: "Countertop (quartz)", qualityTier: "premium", baseUnitCost: 85, unit: "sqft" },
  { category: "kitchen", item: "Backsplash (ceramic)", qualityTier: "economy", baseUnitCost: 3, unit: "sqft" },
  { category: "kitchen", item: "Backsplash (glass tile)", qualityTier: "mid_range", baseUnitCost: 12, unit: "sqft" },
  { category: "kitchen", item: "Backsplash (natural stone)", qualityTier: "premium", baseUnitCost: 25, unit: "sqft" },

  { category: "bathroom", item: "Vanity (stock)", qualityTier: "economy", baseUnitCost: 200, unit: "each" },
  { category: "bathroom", item: "Vanity (semi-custom)", qualityTier: "mid_range", baseUnitCost: 600, unit: "each" },
  { category: "bathroom", item: "Vanity (custom)", qualityTier: "premium", baseUnitCost: 1500, unit: "each" },
  { category: "bathroom", item: "Toilet (standard)", qualityTier: "economy", baseUnitCost: 150, unit: "each" },
  { category: "bathroom", item: "Toilet (mid-range)", qualityTier: "mid_range", baseUnitCost: 350, unit: "each" },
  { category: "bathroom", item: "Toilet (high-end)", qualityTier: "premium", baseUnitCost: 800, unit: "each" },
  { category: "bathroom", item: "Tub/Shower (fiberglass)", qualityTier: "economy", baseUnitCost: 400, unit: "each" },
  { category: "bathroom", item: "Tub/Shower (acrylic)", qualityTier: "mid_range", baseUnitCost: 900, unit: "each" },
  { category: "bathroom", item: "Tub/Shower (cast iron/freestanding)", qualityTier: "premium", baseUnitCost: 2500, unit: "each" },
  { category: "bathroom", item: "Tile (ceramic)", qualityTier: "economy", baseUnitCost: 2, unit: "sqft" },
  { category: "bathroom", item: "Tile (porcelain)", qualityTier: "mid_range", baseUnitCost: 6, unit: "sqft" },
  { category: "bathroom", item: "Tile (marble)", qualityTier: "premium", baseUnitCost: 18, unit: "sqft" },

  { category: "flooring", item: "Laminate", qualityTier: "economy", baseUnitCost: 2, unit: "sqft" },
  { category: "flooring", item: "Engineered hardwood", qualityTier: "mid_range", baseUnitCost: 6, unit: "sqft" },
  { category: "flooring", item: "Solid hardwood", qualityTier: "premium", baseUnitCost: 12, unit: "sqft" },
  { category: "flooring", item: "Vinyl plank (LVP)", qualityTier: "economy", baseUnitCost: 2, unit: "sqft" },
  { category: "flooring", item: "Carpet (builder grade)", qualityTier: "economy", baseUnitCost: 1.5, unit: "sqft" },
  { category: "flooring", item: "Carpet (premium)", qualityTier: "mid_range", baseUnitCost: 4, unit: "sqft" },

  { category: "painting", item: "Interior paint (builder grade)", qualityTier: "economy", baseUnitCost: 0.5, unit: "sqft" },
  { category: "painting", item: "Interior paint (premium)", qualityTier: "mid_range", baseUnitCost: 1.0, unit: "sqft" },
  { category: "painting", item: "Interior paint (designer)", qualityTier: "premium", baseUnitCost: 2.0, unit: "sqft" },
  { category: "painting", item: "Exterior paint", qualityTier: "mid_range", baseUnitCost: 1.5, unit: "sqft" },

  { category: "roofing", item: "3-tab shingles", qualityTier: "economy", baseUnitCost: 1.5, unit: "sqft" },
  { category: "roofing", item: "Architectural shingles", qualityTier: "mid_range", baseUnitCost: 3.0, unit: "sqft" },
  { category: "roofing", item: "Metal roofing", qualityTier: "premium", baseUnitCost: 7.0, unit: "sqft" },

  { category: "electrical", item: "Outlet/switch replacement", qualityTier: "mid_range", baseUnitCost: 5, unit: "each" },
  { category: "electrical", item: "Panel upgrade (200A)", qualityTier: "mid_range", baseUnitCost: 1500, unit: "each" },
  { category: "electrical", item: "Recessed lighting", qualityTier: "mid_range", baseUnitCost: 30, unit: "each" },

  { category: "plumbing", item: "Pipe replacement (PEX)", qualityTier: "mid_range", baseUnitCost: 2, unit: "linear_ft" },
  { category: "plumbing", item: "Water heater (tank)", qualityTier: "economy", baseUnitCost: 600, unit: "each" },
  { category: "plumbing", item: "Water heater (tankless)", qualityTier: "premium", baseUnitCost: 2000, unit: "each" },

  { category: "hvac", item: "Central AC unit", qualityTier: "mid_range", baseUnitCost: 3500, unit: "each" },
  { category: "hvac", item: "Furnace replacement", qualityTier: "mid_range", baseUnitCost: 2500, unit: "each" },
  { category: "hvac", item: "Ductwork", qualityTier: "mid_range", baseUnitCost: 8, unit: "linear_ft" },

  { category: "windows", item: "Vinyl window (standard)", qualityTier: "economy", baseUnitCost: 250, unit: "each" },
  { category: "windows", item: "Double-pane vinyl", qualityTier: "mid_range", baseUnitCost: 450, unit: "each" },
  { category: "windows", item: "Wood/fiberglass window", qualityTier: "premium", baseUnitCost: 850, unit: "each" },

  { category: "drywall", item: "Drywall (standard)", qualityTier: "mid_range", baseUnitCost: 1.5, unit: "sqft" },
  { category: "insulation", item: "Batt insulation (R-13)", qualityTier: "economy", baseUnitCost: 0.5, unit: "sqft" },
  { category: "insulation", item: "Spray foam insulation", qualityTier: "premium", baseUnitCost: 2.5, unit: "sqft" },
];

const LABOR_RATES = [
  { tradeType: "general", hourlyRate: 50, productivityFactor: 1.0, baseRegion: "national", naicsCode: "23899" },
  { tradeType: "plumbing", hourlyRate: 55, productivityFactor: 0.85, baseRegion: "national", naicsCode: "23822" },
  { tradeType: "electrical", hourlyRate: 60, productivityFactor: 0.8, baseRegion: "national", naicsCode: "23821" },
  { tradeType: "carpentry", hourlyRate: 45, productivityFactor: 1.0, baseRegion: "national", naicsCode: "23816" },
  { tradeType: "hvac", hourlyRate: 58, productivityFactor: 0.85, baseRegion: "national", naicsCode: "23822" },
  { tradeType: "roofing", hourlyRate: 42, productivityFactor: 1.1, baseRegion: "national", naicsCode: "23816" },
  { tradeType: "painting", hourlyRate: 38, productivityFactor: 1.2, baseRegion: "national", naicsCode: "23832" },
  { tradeType: "demolition", hourlyRate: 35, productivityFactor: 1.3, baseRegion: "national" },
  { tradeType: "tiling", hourlyRate: 48, productivityFactor: 0.9, baseRegion: "national" },
  { tradeType: "drywall", hourlyRate: 42, productivityFactor: 1.1, baseRegion: "national" },
  { tradeType: "insulation", hourlyRate: 35, productivityFactor: 1.2, baseRegion: "national" },
  { tradeType: "landscaping", hourlyRate: 35, productivityFactor: 1.2, baseRegion: "national" },
];

const REGIONAL_MULTIPLIERS = [
  { zipPrefix: "100", metroArea: "New York City, NY", adjustmentFactor: 1.45, source: "bls_derived" },
  { zipPrefix: "101", metroArea: "New York City, NY", adjustmentFactor: 1.45, source: "bls_derived" },
  { zipPrefix: "104", metroArea: "New York City, NY", adjustmentFactor: 1.45, source: "bls_derived" },
  { zipPrefix: "112", metroArea: "Brooklyn, NY", adjustmentFactor: 1.40, source: "bls_derived" },
  { zipPrefix: "900", metroArea: "Los Angeles, CA", adjustmentFactor: 1.35, source: "bls_derived" },
  { zipPrefix: "901", metroArea: "Los Angeles, CA", adjustmentFactor: 1.35, source: "bls_derived" },
  { zipPrefix: "902", metroArea: "Los Angeles, CA", adjustmentFactor: 1.35, source: "bls_derived" },
  { zipPrefix: "606", metroArea: "Chicago, IL", adjustmentFactor: 1.20, source: "bls_derived" },
  { zipPrefix: "770", metroArea: "Houston, TX", adjustmentFactor: 0.95, source: "bls_derived" },
  { zipPrefix: "773", metroArea: "Houston, TX", adjustmentFactor: 0.95, source: "bls_derived" },
  { zipPrefix: "850", metroArea: "Phoenix, AZ", adjustmentFactor: 0.90, source: "bls_derived" },
  { zipPrefix: "852", metroArea: "Phoenix, AZ", adjustmentFactor: 0.90, source: "bls_derived" },
  { zipPrefix: "191", metroArea: "Philadelphia, PA", adjustmentFactor: 1.15, source: "bls_derived" },
  { zipPrefix: "782", metroArea: "San Antonio, TX", adjustmentFactor: 0.88, source: "bls_derived" },
  { zipPrefix: "922", metroArea: "San Diego, CA", adjustmentFactor: 1.25, source: "bls_derived" },
  { zipPrefix: "752", metroArea: "Dallas, TX", adjustmentFactor: 0.95, source: "bls_derived" },
  { zipPrefix: "951", metroArea: "Riverside, CA", adjustmentFactor: 1.15, source: "bls_derived" },
  { zipPrefix: "787", metroArea: "Austin, TX", adjustmentFactor: 1.00, source: "bls_derived" },
  { zipPrefix: "322", metroArea: "Jacksonville, FL", adjustmentFactor: 0.90, source: "bls_derived" },
  { zipPrefix: "940", metroArea: "San Francisco, CA", adjustmentFactor: 1.55, source: "bls_derived" },
  { zipPrefix: "941", metroArea: "San Francisco, CA", adjustmentFactor: 1.55, source: "bls_derived" },
  { zipPrefix: "431", metroArea: "Columbus, OH", adjustmentFactor: 0.90, source: "bls_derived" },
  { zipPrefix: "462", metroArea: "Indianapolis, IN", adjustmentFactor: 0.88, source: "bls_derived" },
  { zipPrefix: "282", metroArea: "Charlotte, NC", adjustmentFactor: 0.92, source: "bls_derived" },
  { zipPrefix: "950", metroArea: "San Jose, CA", adjustmentFactor: 1.50, source: "bls_derived" },
  { zipPrefix: "980", metroArea: "Seattle, WA", adjustmentFactor: 1.30, source: "bls_derived" },
  { zipPrefix: "981", metroArea: "Seattle, WA", adjustmentFactor: 1.30, source: "bls_derived" },
  { zipPrefix: "802", metroArea: "Denver, CO", adjustmentFactor: 1.10, source: "bls_derived" },
  { zipPrefix: "200", metroArea: "Washington, DC", adjustmentFactor: 1.25, source: "bls_derived" },
  { zipPrefix: "201", metroArea: "Washington, DC", adjustmentFactor: 1.25, source: "bls_derived" },
  { zipPrefix: "372", metroArea: "Nashville, TN", adjustmentFactor: 0.95, source: "bls_derived" },
  { zipPrefix: "731", metroArea: "Oklahoma City, OK", adjustmentFactor: 0.82, source: "bls_derived" },
  { zipPrefix: "333", metroArea: "Fort Lauderdale, FL", adjustmentFactor: 1.05, source: "bls_derived" },
  { zipPrefix: "971", metroArea: "Portland, OR", adjustmentFactor: 1.15, source: "bls_derived" },
  { zipPrefix: "891", metroArea: "Las Vegas, NV", adjustmentFactor: 1.05, source: "bls_derived" },
  { zipPrefix: "381", metroArea: "Memphis, TN", adjustmentFactor: 0.82, source: "bls_derived" },
  { zipPrefix: "404", metroArea: "Atlanta, GA", adjustmentFactor: 0.98, source: "bls_derived" },
  { zipPrefix: "303", metroArea: "Atlanta, GA", adjustmentFactor: 0.98, source: "bls_derived" },
  { zipPrefix: "021", metroArea: "Boston, MA", adjustmentFactor: 1.35, source: "bls_derived" },
  { zipPrefix: "022", metroArea: "Boston, MA", adjustmentFactor: 1.35, source: "bls_derived" },
  { zipPrefix: "330", metroArea: "Miami, FL", adjustmentFactor: 1.10, source: "bls_derived" },
  { zipPrefix: "331", metroArea: "Miami, FL", adjustmentFactor: 1.10, source: "bls_derived" },
  { zipPrefix: "554", metroArea: "Minneapolis, MN", adjustmentFactor: 1.05, source: "bls_derived" },
  { zipPrefix: "481", metroArea: "Detroit, MI", adjustmentFactor: 0.95, source: "bls_derived" },
  { zipPrefix: "336", metroArea: "Tampa, FL", adjustmentFactor: 0.95, source: "bls_derived" },
  { zipPrefix: "631", metroArea: "St. Louis, MO", adjustmentFactor: 0.92, source: "bls_derived" },
  { zipPrefix: "212", metroArea: "Baltimore, MD", adjustmentFactor: 1.10, source: "bls_derived" },
  { zipPrefix: "841", metroArea: "Salt Lake City, UT", adjustmentFactor: 0.95, source: "bls_derived" },
  { zipPrefix: "273", metroArea: "Raleigh, NC", adjustmentFactor: 0.95, source: "bls_derived" },
  { zipPrefix: "641", metroArea: "Kansas City, MO", adjustmentFactor: 0.90, source: "bls_derived" },
];

export async function seedCostEngine() {
  try {
    logger.info("Seeding material costs...");
    for (const mat of MATERIALS) {
      await db.insert(materialCostsTable).values(mat).onConflictDoNothing();
    }

    logger.info("Seeding labor rates...");
    for (const rate of LABOR_RATES) {
      await db.insert(laborRatesTable).values(rate).onConflictDoNothing();
    }

    logger.info("Seeding regional multipliers...");
    for (const mult of REGIONAL_MULTIPLIERS) {
      await db.insert(regionalMultipliersTable).values(mult).onConflictDoNothing();
    }

    logger.info("Cost engine seed complete");
  } catch (err) {
    logger.error({ err }, "Seed failed");
    throw err;
  }
}
