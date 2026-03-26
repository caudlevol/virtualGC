import { db, materialCostsTable, laborRatesTable, regionalMultipliersTable, blsCacheTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { logger } from "./logger";

const BLS_BASE_URL = "https://data.bls.gov/cew/data/api";

const NAICS_CODES: Record<string, string> = {
  plumbing: "23822",
  electrical: "23821",
  carpentry: "23816",
  hvac: "23822",
  roofing: "23816",
  painting: "23832",
  general: "23899",
};

const BASELINE_LABOR_RATES: Record<string, number> = {
  plumbing: 55,
  electrical: 60,
  carpentry: 45,
  hvac: 58,
  roofing: 42,
  painting: 38,
  general: 50,
  demolition: 35,
  tiling: 48,
  drywall: 42,
};

const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export async function fetchBLSLaborData(naicsCode: string): Promise<number | null> {
  try {
    const cached = await db
      .select()
      .from(blsCacheTable)
      .where(eq(blsCacheTable.naicsCode, naicsCode))
      .limit(1);

    if (cached.length > 0) {
      const age = Date.now() - new Date(cached[0].fetchedAt).getTime();
      if (age < CACHE_TTL_MS) {
        return parseFloat(cached[0].data);
      }
    }

    const year = new Date().getFullYear() - 1;
    const url = `${BLS_BASE_URL}/${year}/a/industry/${naicsCode}.csv`;

    const response = await fetch(url, { signal: AbortSignal.timeout(10000) });
    if (!response.ok) {
      logger.warn({ naicsCode, status: response.status }, "BLS API returned non-OK status");
      return null;
    }

    const csvText = await response.text();
    const lines = csvText.split("\n");
    if (lines.length < 2) return null;

    const headers = lines[0].split(",").map(h => h.trim().replace(/"/g, ""));
    const annualPayIdx = headers.findIndex(h => h === "avg_annual_pay");
    const weeklyWageIdx = headers.findIndex(h => h === "avg_wkly_wage");
    const wageIdx = annualPayIdx !== -1 ? annualPayIdx : weeklyWageIdx;
    const isWeekly = wageIdx === weeklyWageIdx && annualPayIdx === -1;

    if (wageIdx === -1) return null;

    let totalWage = 0;
    let count = 0;
    for (let i = 1; i < lines.length; i++) {
      const cols = lines[i].split(",").map(c => c.trim().replace(/"/g, ""));
      const wage = parseFloat(cols[wageIdx]);
      if (!isNaN(wage) && wage > 0) {
        totalWage += wage;
        count++;
      }
    }

    if (count === 0) return null;

    const avgWage = totalWage / count;
    const hourlyRate = isWeekly ? avgWage / 40 : avgWage / 2080;

    await db.insert(blsCacheTable).values({
      naicsCode,
      year: year.toString(),
      data: hourlyRate.toFixed(2),
    });

    return hourlyRate;
  } catch (err) {
    logger.error({ err, naicsCode }, "Failed to fetch BLS data");
    return null;
  }
}

export async function getLaborRate(tradeType: string): Promise<number> {
  const naicsCode = NAICS_CODES[tradeType.toLowerCase()];
  if (naicsCode) {
    const blsRate = await fetchBLSLaborData(naicsCode);
    if (blsRate) return blsRate;
  }

  const dbRate = await db
    .select()
    .from(laborRatesTable)
    .where(eq(laborRatesTable.tradeType, tradeType.toLowerCase()))
    .limit(1);

  if (dbRate.length > 0) return dbRate[0].hourlyRate;

  return BASELINE_LABOR_RATES[tradeType.toLowerCase()] || BASELINE_LABOR_RATES.general;
}

export async function getRegionalMultiplier(zipCode: string): Promise<{ factor: number; metroArea: string }> {
  const prefix = zipCode.substring(0, 3);

  const result = await db
    .select()
    .from(regionalMultipliersTable)
    .where(eq(regionalMultipliersTable.zipPrefix, prefix))
    .limit(1);

  if (result.length > 0) {
    return { factor: result[0].adjustmentFactor, metroArea: result[0].metroArea };
  }

  return { factor: 1.0, metroArea: "National Average" };
}

export async function getMaterialCosts(category?: string, qualityTier?: string) {
  let query = db.select().from(materialCostsTable);

  const conditions = [];
  if (category) conditions.push(eq(materialCostsTable.category, category));
  if (qualityTier) conditions.push(eq(materialCostsTable.qualityTier, qualityTier));

  if (conditions.length > 0) {
    query = query.where(and(...conditions)) as typeof query;
  }

  return query;
}

export async function getLaborRates(tradeType?: string) {
  if (tradeType) {
    return db.select().from(laborRatesTable).where(eq(laborRatesTable.tradeType, tradeType));
  }
  return db.select().from(laborRatesTable);
}

export async function fetchCensusACSPropertyTax(zipCode: string): Promise<{ medianPropertyTax: number | null; source: string }> {
  try {
    const year = new Date().getFullYear() - 2;
    const url = `https://api.census.gov/data/${year}/acs/acs5?get=B25103_001E&for=zip%20code%20tabulation%20area:${zipCode}`;

    const response = await fetch(url, { signal: AbortSignal.timeout(10000) });
    if (!response.ok) {
      logger.warn({ zipCode, status: response.status }, "Census ACS API returned non-OK status");
      return { medianPropertyTax: null, source: "census_acs_unavailable" };
    }

    const data = await response.json() as string[][];
    if (data.length < 2) return { medianPropertyTax: null, source: "census_acs_no_data" };

    const taxValue = parseInt(data[1][0], 10);
    if (isNaN(taxValue) || taxValue <= 0) return { medianPropertyTax: null, source: "census_acs_invalid" };

    return { medianPropertyTax: taxValue, source: "census_acs" };
  } catch (err) {
    logger.warn({ err, zipCode }, "Census ACS property tax fetch failed");
    return { medianPropertyTax: null, source: "census_acs_error" };
  }
}

export async function computeLocalizedCost(
  baseMaterialCost: number,
  baseLaborCost: number,
  zipCode: string
): Promise<{ adjustedMaterial: number; adjustedLabor: number; multiplier: number; metroArea: string }> {
  const { factor, metroArea } = await getRegionalMultiplier(zipCode);
  return {
    adjustedMaterial: Math.round(baseMaterialCost * factor * 100) / 100,
    adjustedLabor: Math.round(baseLaborCost * factor * 100) / 100,
    multiplier: factor,
    metroArea,
  };
}
