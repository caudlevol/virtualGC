import { Router, type IRouter } from "express";
import { getMaterialCosts, getLaborRates, getRegionalMultiplier } from "../lib/costEngine";

const router: IRouter = Router();

router.get("/cost-engine/materials", async (req, res): Promise<void> => {
  const category = req.query.category as string | undefined;
  const qualityTier = req.query.qualityTier as string | undefined;

  const materials = await getMaterialCosts(category, qualityTier);
  res.json(materials);
});

router.get("/cost-engine/labor-rates", async (req, res): Promise<void> => {
  const tradeType = req.query.tradeType as string | undefined;

  const rates = await getLaborRates(tradeType);
  res.json(rates);
});

router.get("/cost-engine/regional-multiplier", async (req, res): Promise<void> => {
  const zipCode = req.query.zipCode as string;
  if (!zipCode) {
    res.status(400).json({ error: "zipCode is required" });
    return;
  }

  const result = await getRegionalMultiplier(zipCode);
  res.json({
    zipPrefix: zipCode.substring(0, 3),
    metroArea: result.metroArea,
    adjustmentFactor: result.factor,
    source: "database",
    lastUpdated: new Date().toISOString(),
  });
});

export default router;
