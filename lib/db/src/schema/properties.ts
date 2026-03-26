import { pgTable, serial, text, integer, real, timestamp, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";
import { organizationsTable } from "./organizations";

export const propertiesTable = pgTable("properties", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => usersTable.id),
  orgId: integer("org_id").references(() => organizationsTable.id),
  zillowUrl: text("zillow_url"),
  address: text("address").notNull(),
  zipCode: text("zip_code").notNull(),
  sqft: integer("sqft").notNull(),
  bedrooms: integer("bedrooms").notNull(),
  bathrooms: real("bathrooms").notNull(),
  yearBuilt: integer("year_built"),
  lotSize: real("lot_size"),
  listingPhotos: text("listing_photos").array().default([]),
  priceHistory: jsonb("price_history"),
  dataSource: text("data_source").notNull().default("manual"),
  rawData: jsonb("raw_data"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertPropertySchema = createInsertSchema(propertiesTable).omit({ id: true, createdAt: true });
export type InsertProperty = z.infer<typeof insertPropertySchema>;
export type Property = typeof propertiesTable.$inferSelect;
