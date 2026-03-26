import { Router, type IRouter } from "express";
import { GetMaterialsQueryParams, GetLaborRatesQueryParams, GetRegionalMultiplierQueryParams } from "@workspace/api-zod";
import { getMaterialCosts, getLaborRates, getLaborRate, getRegionalMultiplier } from "../lib/costEngine";

const router: IRouter = Router();

router.get("/cost-engine/materials", async (req, res): Promise<void> => {
  const parsed = GetMaterialsQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const materials = await getMaterialCosts(parsed.data.category, parsed.data.qualityTier);
  res.json(materials);
});

router.get("/cost-engine/labor-rates", async (req, res): Promise<void> => {
  const parsed = GetLaborRatesQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const rates = await getLaborRates(parsed.data.tradeType);

  const enrichedRates = await Promise.all(rates.map(async (r) => {
    const blsRate = await getLaborRate(r.tradeType);
    return {
      ...r,
      blsDerivedRate: Math.round(blsRate * 100) / 100,
      rateSource: blsRate !== r.hourlyRate ? "bls_live" : "seeded_baseline",
    };
  }));

  if (parsed.data.zipCode) {
    const { factor, metroArea } = await getRegionalMultiplier(parsed.data.zipCode);
    const adjustedRates = enrichedRates.map(r => ({
      ...r,
      adjustedHourlyRate: Math.round(r.blsDerivedRate * factor * 100) / 100,
      regionalMultiplier: factor,
      metroArea,
    }));
    res.json(adjustedRates);
    return;
  }

  res.json(enrichedRates);
});

router.get("/cost-engine/regional-multiplier", async (req, res): Promise<void> => {
  const parsed = GetRegionalMultiplierQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const result = await getRegionalMultiplier(parsed.data.zipCode);
  res.json({
    zipPrefix: parsed.data.zipCode.substring(0, 3),
    metroArea: result.metroArea,
    adjustmentFactor: result.factor,
    source: "database",
    lastUpdated: new Date().toISOString(),
  });
});

export default router;
