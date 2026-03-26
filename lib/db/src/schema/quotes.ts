import { pgTable, serial, text, integer, real, boolean, timestamp, jsonb, uuid } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";
import { propertiesTable } from "./properties";
import { conversationsTable } from "./conversations";

export const quotesTable = pgTable("quotes", {
  id: serial("id").primaryKey(),
  shareUuid: uuid("share_uuid").notNull().defaultRandom().unique(),
  userId: integer("user_id").references(() => usersTable.id),
  orgId: integer("org_id"),
  propertyId: integer("property_id").notNull().references(() => propertiesTable.id),
  conversationId: integer("conversation_id").references(() => conversationsTable.id),
  title: text("title").notNull(),
  status: text("status").notNull().default("draft"),
  totalEstimate: real("total_estimate").notNull().default(0),
  qualityTier: text("quality_tier").notNull().default("mid_range"),
  aiModelUsed: text("ai_model_used").notNull().default("gpt-4o"),
  aiReasoning: text("ai_reasoning"),
  regionalMultiplier: real("regional_multiplier").notNull().default(1.0),
  claudeReview: jsonb("claude_review"),
  sharedUrlEnabled: boolean("shared_url_enabled").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertQuoteSchema = createInsertSchema(quotesTable).omit({ id: true, shareUuid: true, createdAt: true, updatedAt: true });
export type InsertQuote = z.infer<typeof insertQuoteSchema>;
export type Quote = typeof quotesTable.$inferSelect;

export const quoteLineItemsTable = pgTable("quote_line_items", {
  id: serial("id").primaryKey(),
  quoteId: integer("quote_id").notNull().references(() => quotesTable.id, { onDelete: "cascade" }),
  category: text("category").notNull(),
  description: text("description").notNull(),
  materialCost: real("material_cost").notNull().default(0),
  laborCost: real("labor_cost").notNull().default(0),
  quantity: real("quantity").notNull().default(1),
  unit: text("unit").notNull().default("each"),
  qualityTier: text("quality_tier").notNull().default("mid_range"),
});

export const insertQuoteLineItemSchema = createInsertSchema(quoteLineItemsTable).omit({ id: true });
export type InsertQuoteLineItem = z.infer<typeof insertQuoteLineItemSchema>;
export type QuoteLineItem = typeof quoteLineItemsTable.$inferSelect;
