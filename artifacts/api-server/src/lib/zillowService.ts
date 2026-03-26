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

interface PropertyDataProvider {
  name: string;
  fetchProperty(url: string): Promise<ZillowPropertyData | null>;
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
      const runResponse = await fetch("https://api.apify.com/v2/acts/petr_cermak~zillow-api-scraper/runs", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          startUrls: [{ url }],
          maxItems: 1,
        }),
        signal: AbortSignal.timeout(60000),
      });

      if (!runResponse.ok) {
        logger.error({ status: runResponse.status }, "Apify run creation failed");
        return null;
      }

      const runData = await runResponse.json() as { data?: { id?: string; defaultDatasetId?: string } };
      const runId = runData.data?.id;
      if (!runId) return null;

      let attempts = 0;
      const maxAttempts = 30;
      while (attempts < maxAttempts) {
        await new Promise(resolve => setTimeout(resolve, 2000));
        attempts++;

        const statusResponse = await fetch(`https://api.apify.com/v2/actor-runs/${runId}`, {
          headers: { Authorization: `Bearer ${apiKey}` },
        });

        const statusData = await statusResponse.json() as { data?: { status?: string; defaultDatasetId?: string } };
        if (statusData.data?.status === "SUCCEEDED") {
          const datasetId = statusData.data.defaultDatasetId;
          const itemsResponse = await fetch(`https://api.apify.com/v2/datasets/${datasetId}/items`, {
            headers: { Authorization: `Bearer ${apiKey}` },
          });

          const items = await itemsResponse.json() as Array<Record<string, unknown>>;
          if (items.length > 0) {
            return this.parseApifyResult(items[0]);
          }
          return null;
        }

        if (statusData.data?.status === "FAILED" || statusData.data?.status === "ABORTED") {
          logger.error({ runId, status: statusData.data.status }, "Apify run failed");
          return null;
        }
      }

      logger.error({ runId }, "Apify run timed out");
      return null;
    } catch (err) {
      logger.error({ err }, "Apify fetch failed");
      return null;
    }
  }

  private parseApifyResult(item: Record<string, unknown>): ZillowPropertyData {
    const address = [
      item.streetAddress || item.address,
      item.city,
      item.state,
      item.zipcode || item.zipCode,
    ].filter(Boolean).join(", ") as string;

    return {
      address: address || "Unknown Address",
      zipCode: String(item.zipcode || item.zipCode || ""),
      sqft: Number(item.livingArea || item.sqft || item.livingAreaValue || 0),
      bedrooms: Number(item.bedrooms || item.beds || 0),
      bathrooms: Number(item.bathrooms || item.baths || 0),
      yearBuilt: item.yearBuilt ? Number(item.yearBuilt) : null,
      lotSize: item.lotSize ? Number(item.lotSize) : null,
      listingPhotos: Array.isArray(item.photos)
        ? (item.photos as Array<Record<string, unknown>>).map(p => String(p.url || "")).filter(Boolean)
        : Array.isArray(item.bigPhotos)
          ? (item.bigPhotos as string[])
          : [],
      priceHistory: (item.priceHistory as Record<string, unknown>) || null,
      rawData: item,
    };
  }
}

class ManualProvider implements PropertyDataProvider {
  name = "manual";

  async fetchProperty(_url: string): Promise<ZillowPropertyData | null> {
    return null;
  }
}

const providers: PropertyDataProvider[] = [
  new ApifyProvider(),
  new ManualProvider(),
];

export async function lookupProperty(zillowUrl: string): Promise<{ data: ZillowPropertyData; source: string } | null> {
  for (const provider of providers) {
    if (provider.name === "manual") continue;

    try {
      logger.info({ provider: provider.name, url: zillowUrl }, "Attempting property lookup");
      const result = await provider.fetchProperty(zillowUrl);
      if (result) {
        return { data: result, source: provider.name };
      }
    } catch (err) {
      logger.warn({ err, provider: provider.name }, "Provider failed, trying next");
    }
  }

  return null;
}

export function isValidZillowUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.hostname.includes("zillow.com") || parsed.hostname.includes("redfin.com");
  } catch {
    return false;
  }
}
