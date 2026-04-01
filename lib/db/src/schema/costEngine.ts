import { pgTable, serial, text, real, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const materialCostsTable = pgTable("material_costs", {
  id: serial("id").primaryKey(),
  category: text("category").notNull(),
  item: text("item").notNull(),
  qualityTier: text("quality_tier").notNull().default("mid_range"),
  baseUnitCost: real("base_unit_cost").notNull(),
  unit: text("unit").notNull().default("each"),
  laborHoursPerUnit: real("labor_hours_per_unit").default(1.0),
});

export const insertMaterialCostSchema = createInsertSchema(materialCostsTable).omit({ id: true });
export type InsertMaterialCost = z.infer<typeof insertMaterialCostSchema>;
export type MaterialCost = typeof materialCostsTable.$inferSelect;

export const laborRatesTable = pgTable("labor_rates", {
  id: serial("id").primaryKey(),
  tradeType: text("trade_type").notNull(),
  hourlyRate: real("hourly_rate").notNull(),
  productivityFactor: real("productivity_factor").notNull().default(1.0),
  baseRegion: text("base_region").notNull().default("national"),
  naicsCode: text("naics_code"),
});

export const insertLaborRateSchema = createInsertSchema(laborRatesTable).omit({ id: true });
export type InsertLaborRate = z.infer<typeof insertLaborRateSchema>;
export type LaborRate = typeof laborRatesTable.$inferSelect;

export const regionalMultipliersTable = pgTable("regional_multipliers", {
  id: serial("id").primaryKey(),
  zipPrefix: text("zip_prefix").notNull(),
  metroArea: text("metro_area").notNull(),
  adjustmentFactor: real("adjustment_factor").notNull().default(1.0),
  source: text("source").notNull().default("manual"),
  lastUpdated: timestamp("last_updated", { withTimezone: true }).notNull().defaultNow(),
});

export const insertRegionalMultiplierSchema = createInsertSchema(regionalMultipliersTable).omit({ id: true });
export type InsertRegionalMultiplier = z.infer<typeof insertRegionalMultiplierSchema>;
export type RegionalMultiplier = typeof regionalMultipliersTable.$inferSelect;

export const blsCacheTable = pgTable("bls_cache", {
  id: serial("id").primaryKey(),
  naicsCode: text("naics_code").notNull(),
  year: text("year").notNull(),
  data: text("data").notNull(),
  fetchedAt: timestamp("fetched_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertBlsCacheSchema = createInsertSchema(blsCacheTable).omit({ id: true });
export type InsertBlsCache = z.infer<typeof insertBlsCacheSchema>;
export type BlsCache = typeof blsCacheTable.$inferSelect;
