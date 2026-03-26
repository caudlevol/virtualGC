import { Router, type IRouter } from "express";
import rateLimit from "express-rate-limit";
import { db, propertiesTable, leadCapturesTable } from "@workspace/db";
import { DemoEstimateBody, CaptureLeadBody } from "@workspace/api-zod";
import { lookupProperty, isValidZillowUrl, getSamplePropertyForUrl, classifyProviderErrors } from "../lib/zillowService";
import { generateDemoEstimate } from "../lib/aiPipeline";
import { getRegionalMultiplier } from "../lib/costEngine";
import { logger } from "../lib/logger";

const router: IRouter = Router();

const demoLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 10,
  message: { error: "Too many demo requests. Please try again later or sign up for full access." },
  standardHeaders: true,
  legacyHeaders: false,
});

router.post("/demo/estimate", demoLimiter, async (req, res): Promise<void> => {
  const parsed = DemoEstimateBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { zillowUrl, renovationType } = parsed.data;

  if (!isValidZillowUrl(zillowUrl)) {
    res.status(400).json({ error: "Please provide a valid Zillow or Redfin URL" });
    return;
  }

  let propertyData;
  let dataSource: string;
  let usedFallback = false;
  let fallbackReason: string | null = null;
  let providerErrors: string[] = [];

  const result = await lookupProperty(zillowUrl);

  if ("data" in result) {
    propertyData = result.data;
    dataSource = result.source;
  } else {
    logger.warn(
      { reason: result.failure.reason, details: result.failure.details },
      "All property providers failed, using sample fallback"
    );
    propertyData = getSamplePropertyForUrl(zillowUrl);
    dataSource = "sample_fallback";
    usedFallback = true;
    providerErrors = result.failure.details;

    const errorClass = classifyProviderErrors(providerErrors);
    const fallbackMessages: Record<string, string> = {
      auth_error: "Our property data services are experiencing authentication issues. This estimate uses a comparable sample property to demonstrate the experience.",
      scraper_unavailable: "The property scraper is temporarily unavailable. This estimate uses a comparable sample property. Try again shortly or sign up for more reliable access.",
      timeout: "The property lookup timed out. This estimate uses a comparable sample property. The listing may be temporarily unavailable — try again in a few minutes.",
      no_data: "We couldn't fetch the exact property details for this listing. This estimate uses a comparable sample property in a similar region. Sign up to get precise estimates from real listing data.",
    };
    fallbackReason = fallbackMessages[errorClass];
  }

  const [property] = await db.insert(propertiesTable).values({
    zillowUrl,
    address: propertyData.address,
    zipCode: propertyData.zipCode,
    sqft: propertyData.sqft,
    bedrooms: propertyData.bedrooms,
    bathrooms: propertyData.bathrooms,
    yearBuilt: propertyData.yearBuilt,
    lotSize: propertyData.lotSize,
    listingPhotos: propertyData.listingPhotos,
    priceHistory: propertyData.priceHistory,
    dataSource,
    rawData: propertyData.rawData,
  }).returning();

  const scope = await generateDemoEstimate(
    {
      address: property.address,
      zipCode: property.zipCode,
      sqft: property.sqft,
      bedrooms: property.bedrooms,
      bathrooms: property.bathrooms,
      yearBuilt: property.yearBuilt,
    },
    renovationType || "general"
  );

  const { factor } = await getRegionalMultiplier(property.zipCode);

  const lineItems = scope.items.map((item, idx) => ({
    id: idx + 1,
    category: item.category,
    description: item.description,
    materialCost: Math.round(item.materialCost * factor * 100) / 100,
    laborCost: Math.round(item.laborCost * factor * 100) / 100,
    quantity: item.quantity,
    unit: item.unit,
    qualityTier: "mid_range" as const,
    subtotal: Math.round((item.materialCost * factor + item.laborCost * factor) * item.quantity * 100) / 100,
  }));

  const midRangeTotal = lineItems.reduce((sum, li) => sum + li.subtotal, 0);

  res.json({
    property: {
      id: property.id,
      zillowUrl: property.zillowUrl,
      address: property.address,
      zipCode: property.zipCode,
      sqft: property.sqft,
      bedrooms: property.bedrooms,
      bathrooms: property.bathrooms,
      yearBuilt: property.yearBuilt,
      lotSize: property.lotSize,
      listingPhotos: property.listingPhotos || [],
      priceHistory: property.priceHistory,
      dataSource: property.dataSource,
      createdAt: property.createdAt.toISOString(),
    },
    estimateSummary: scope.reasoning,
    lineItems,
    totalEstimate: Math.round(midRangeTotal * 100) / 100,
    qualityTiers: {
      economy: Math.round(midRangeTotal * 0.7 * 100) / 100,
      midRange: Math.round(midRangeTotal * 100) / 100,
      premium: Math.round(midRangeTotal * 1.5 * 100) / 100,
    },
    regionalMultiplier: factor,
    usedFallback,
    fallbackNotice: fallbackReason,
    disclaimer: "This is a feasibility estimate generated by AI and is not a binding bid. Actual costs may vary based on site conditions, contractor availability, permit requirements, and material selections. Always obtain multiple contractor quotes before proceeding with any renovation work.",
  });
});

router.post("/demo/lead", async (req, res): Promise<void> => {
  const parsed = CaptureLeadBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  await db.insert(leadCapturesTable).values({
    name: parsed.data.name,
    email: parsed.data.email,
    brokerage: parsed.data.brokerage || null,
    sourcePage: "demo",
  });

  res.status(201).json({ message: "Thank you! We'll be in touch." });
});

export default router;
