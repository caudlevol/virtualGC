import { logger } from "./logger";

export interface ZillowPropertyData {
  address: string;
  zipCode: string;
  sqft: number;
  bedrooms: number;
  bathrooms: number;
  yearBuilt: number | null;
  lotSize: number | null;
  listingPhotos: string[];
  priceHistory: Record<string, unknown> | null;
  rawData: Record<string, unknown>;
}

export interface LookupResult {
  data: ZillowPropertyData;
  source: string;
}

export interface LookupFailure {
  reason: "invalid_url" | "all_providers_failed" | "no_providers_configured";
  details: string[];
}

interface PropertyDataProvider {
  name: string;
  fetchProperty(url: string): Promise<ZillowPropertyData | null>;
}

function parseAddressFromZillowUrl(url: string): string | null {
  const addressMatch = url.match(/\/homedetails\/([^/]+)\//);
  if (!addressMatch) return null;

  const slug = decodeURIComponent(addressMatch[1]);
  return slug.replace(/-/g, " ");
}

class RentCastProvider implements PropertyDataProvider {
  name = "rentcast";

  async fetchProperty(url: string): Promise<ZillowPropertyData | null> {
    const apiKey = process.env.RentCast_API_Key;
    if (!apiKey) {
      logger.warn("RentCast API key not configured");
      return null;
    }

    try {
      const fullAddress = parseAddressFromZillowUrl(url);
      if (!fullAddress) {
        logger.warn("Could not parse address from Zillow URL for RentCast");
        return null;
      }

      logger.info({ address: fullAddress }, "RentCast looking up address");

      const response = await fetch(
        `https://api.rentcast.io/v1/properties?address=${encodeURIComponent(fullAddress)}`,
        {
          headers: {
            "X-Api-Key": apiKey,
            Accept: "application/json",
          },
          signal: AbortSignal.timeout(15000),
        }
      );

      if (!response.ok) {
        const body = await response.text().catch(() => "");
        logger.error({ status: response.status, body }, "RentCast API returned non-OK status");
        return null;
      }

      const data = await response.json() as Array<Record<string, unknown>>;
      if (!Array.isArray(data) || data.length === 0) {
        logger.warn("RentCast returned empty results");
        return null;
      }

      const property = data[0];
      return {
        address: [property.addressLine1, property.city, property.state, property.zipCode].filter(Boolean).join(", ") as string,
        zipCode: String(property.zipCode || ""),
        sqft: Number(property.squareFootage || 0),
        bedrooms: Number(property.bedrooms || 0),
        bathrooms: Number(property.bathrooms || 0),
        yearBuilt: property.yearBuilt ? Number(property.yearBuilt) : null,
        lotSize: property.lotSize ? Number(property.lotSize) : null,
        listingPhotos: [],
        priceHistory: null,
        rawData: property,
      };
    } catch (err) {
      logger.error({ err }, "RentCast fetch failed");
      return null;
    }
  }
}

class ApifyProvider implements PropertyDataProvider {
  name = "apify";

  async fetchProperty(url: string): Promise<ZillowPropertyData | null> {
    const apiKey = process.env.Apify_API;
    if (!apiKey) {
      logger.warn("Apify API key not configured");
      return null;
    }

    try {
      const runResponse = await fetch(
        "https://api.apify.com/v2/acts/maxcopell~zillow-detail-scraper/runs?waitForFinish=60",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            startUrls: [{ url }],
          }),
          signal: AbortSignal.timeout(90000),
        }
      );

      if (!runResponse.ok) {
        logger.error({ status: runResponse.status }, "Apify run creation failed (status " + runResponse.status + ")");
        return null;
      }

      const runData = await runResponse.json() as { data?: { id?: string; status?: string; defaultDatasetId?: string } };
      const runId = runData.data?.id;
      const status = runData.data?.status;
      const datasetId = runData.data?.defaultDatasetId;

      if (!runId) return null;

      if (status !== "SUCCEEDED") {
        logger.error({ runId, status }, "Apify run did not succeed (status: " + status + ")");
        return null;
      }

      if (!datasetId) return null;

      const itemsResponse = await fetch(`https://api.apify.com/v2/datasets/${datasetId}/items`, {
        headers: { Authorization: `Bearer ${apiKey}` },
      });

      const items = await itemsResponse.json() as Array<Record<string, unknown>>;
      if (items.length > 0) {
        return this.parseApifyResult(items[0]);
      }
      return null;
    } catch (err) {
      logger.error({ err }, "Apify fetch failed");
      return null;
    }
  }

  private parseApifyResult(item: Record<string, unknown>): ZillowPropertyData {
    const addressObj = item.address as { streetAddress?: string; city?: string; state?: string; zipcode?: string } | undefined;

    let address: string;
    let zipCode: string;
    if (addressObj && typeof addressObj === "object") {
      address = [addressObj.streetAddress, addressObj.city, addressObj.state, addressObj.zipcode].filter(Boolean).join(", ");
      zipCode = String(addressObj.zipcode || item.zipcode || "");
    } else {
      address = [item.streetAddress, item.city, item.state, item.zipcode || item.zipCode].filter(Boolean).join(", ") as string;
      zipCode = String(item.zipcode || item.zipCode || "");
    }

    const photos: string[] = [];
    if (Array.isArray(item.originalPhotos)) {
      for (const photo of item.originalPhotos as Array<{ mixedSources?: { jpeg?: Array<{ url: string; width: number }> } }>) {
        const jpegs = photo.mixedSources?.jpeg;
        if (jpegs && jpegs.length > 0) {
          const best = jpegs.reduce((a, b) => (b.width > a.width ? b : a));
          if (best.url) photos.push(best.url);
        }
      }
    } else if (Array.isArray(item.responsivePhotos)) {
      for (const photo of item.responsivePhotos as Array<{ mixedSources?: { jpeg?: Array<{ url: string; width: number }> } }>) {
        const jpegs = photo.mixedSources?.jpeg;
        if (jpegs && jpegs.length > 0) {
          const best = jpegs.reduce((a, b) => (b.width > a.width ? b : a));
          if (best.url) photos.push(best.url);
        }
      }
    }

    return {
      address: address || "Unknown Address",
      zipCode,
      sqft: Number(item.livingArea || item.livingAreaValue || 0),
      bedrooms: Number(item.bedrooms || item.beds || 0),
      bathrooms: Number(item.bathrooms || item.baths || 0),
      yearBuilt: item.yearBuilt ? Number(item.yearBuilt) : null,
      lotSize: item.lotSize ? Number(item.lotSize) : (item.lotAreaValue ? Number(item.lotAreaValue) : null),
      listingPhotos: photos,
      priceHistory: (item.priceHistory as Record<string, unknown>) || null,
      rawData: item,
    };
  }
}

const providers: PropertyDataProvider[] = [
  new ApifyProvider(),
  new RentCastProvider(),
];

export async function lookupProperty(zillowUrl: string): Promise<{ data: ZillowPropertyData; source: string } | { failure: LookupFailure }> {
  const errors: string[] = [];

  for (const provider of providers) {
    try {
      logger.info({ provider: provider.name, url: zillowUrl }, "Attempting property lookup");
      const result = await provider.fetchProperty(zillowUrl);
      if (result) {
        return { data: result, source: provider.name };
      }
      errors.push(`${provider.name}: no results returned`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push(`${provider.name}: ${msg}`);
      logger.warn({ err, provider: provider.name }, "Provider failed, trying next");
    }
  }

  return {
    failure: {
      reason: "all_providers_failed",
      details: errors,
    }
  };
}

export function classifyProviderErrors(details: string[]): "auth_error" | "scraper_unavailable" | "timeout" | "no_data" {
  const joined = details.join(" ").toLowerCase();
  if (joined.includes("401") || joined.includes("invalid") || joined.includes("unauthorized")) return "auth_error";
  if (joined.includes("failed") || joined.includes("aborted") || joined.includes("did not succeed")) return "scraper_unavailable";
  if (joined.includes("timed out") || joined.includes("timeout") || joined.includes("aborted")) return "timeout";
  return "no_data";
}

const SAMPLE_PROPERTIES: ZillowPropertyData[] = [
  {
    address: "742 Evergreen Terrace, Springfield, IL 62704",
    zipCode: "62704",
    sqft: 2200,
    bedrooms: 4,
    bathrooms: 2,
    yearBuilt: 1985,
    lotSize: 8712,
    listingPhotos: [],
    priceHistory: null,
    rawData: { sample: true },
  },
  {
    address: "1925 Maple Drive, Austin, TX 78701",
    zipCode: "78701",
    sqft: 1850,
    bedrooms: 3,
    bathrooms: 2,
    yearBuilt: 1972,
    lotSize: 6500,
    listingPhotos: [],
    priceHistory: null,
    rawData: { sample: true },
  },
  {
    address: "438 Oakwood Lane, Nashville, TN 37209",
    zipCode: "37209",
    sqft: 2650,
    bedrooms: 4,
    bathrooms: 3,
    yearBuilt: 1998,
    lotSize: 10450,
    listingPhotos: [],
    priceHistory: null,
    rawData: { sample: true },
  },
  {
    address: "215 Harbor View Road, San Diego, CA 92101",
    zipCode: "92101",
    sqft: 1600,
    bedrooms: 3,
    bathrooms: 2,
    yearBuilt: 1965,
    lotSize: 5200,
    listingPhotos: [],
    priceHistory: null,
    rawData: { sample: true },
  },
  {
    address: "1102 Peachtree Circle, Atlanta, GA 30309",
    zipCode: "30309",
    sqft: 3100,
    bedrooms: 5,
    bathrooms: 3,
    yearBuilt: 2005,
    lotSize: 12000,
    listingPhotos: [],
    priceHistory: null,
    rawData: { sample: true },
  },
];

export function getSamplePropertyForUrl(url: string): ZillowPropertyData {
  let hash = 0;
  for (let i = 0; i < url.length; i++) {
    hash = ((hash << 5) - hash) + url.charCodeAt(i);
    hash |= 0;
  }
  const idx = Math.abs(hash) % SAMPLE_PROPERTIES.length;
  return SAMPLE_PROPERTIES[idx];
}

export function isValidZillowUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase();
    return host === "zillow.com" || host.endsWith(".zillow.com") ||
           host === "redfin.com" || host.endsWith(".redfin.com");
  } catch {
    return false;
  }
}
