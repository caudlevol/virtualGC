import { Router, type IRouter } from "express";
import { db, propertiesTable } from "@workspace/db";
import { LookupPropertyBody, ManualPropertyEntryBody } from "@workspace/api-zod";
import { requireAuth } from "../middlewares/auth";
import { lookupProperty, isValidZillowUrl } from "../lib/zillowService";

const router: IRouter = Router();

router.post("/properties/lookup", requireAuth, async (req, res): Promise<void> => {
  const parsed = LookupPropertyBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { zillowUrl } = parsed.data;

  if (!isValidZillowUrl(zillowUrl)) {
    res.status(400).json({ error: "Please provide a valid Zillow or Redfin URL" });
    return;
  }

  const result = await lookupProperty(zillowUrl);
  if (!result) {
    res.status(404).json({ error: "Could not find property data. Try entering the details manually." });
    return;
  }

  const [property] = await db.insert(propertiesTable).values({
    zillowUrl,
    address: result.data.address,
    zipCode: result.data.zipCode,
    sqft: result.data.sqft,
    bedrooms: result.data.bedrooms,
    bathrooms: result.data.bathrooms,
    yearBuilt: result.data.yearBuilt,
    lotSize: result.data.lotSize,
    listingPhotos: result.data.listingPhotos,
    priceHistory: result.data.priceHistory,
    dataSource: result.source,
    rawData: result.data.rawData,
  }).returning();

  res.json({
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
  });
});

router.post("/properties/manual", requireAuth, async (req, res): Promise<void> => {
  const parsed = ManualPropertyEntryBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [property] = await db.insert(propertiesTable).values({
    ...parsed.data,
    dataSource: "manual",
  }).returning();

  res.status(201).json({
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
  });
});

export default router;
