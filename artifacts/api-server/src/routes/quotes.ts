import { Router, type IRouter } from "express";
import { db, quotesTable, quoteLineItemsTable, propertiesTable, conversationsTable, usersTable, organizationsTable } from "@workspace/db";
import { eq, desc, sql, and } from "drizzle-orm";
import {
  GenerateQuoteBody,
  ToggleShareQuoteBody,
  ListQuotesQueryParams,
  GetQuoteParams,
  DeleteQuoteParams,
  GetSharedQuoteParams,
  ToggleShareQuoteParams,
} from "@workspace/api-zod";
import { requireAuth, requireTier } from "../middlewares/auth";
import { chatWithVGC, claudeReviewQuote } from "../lib/aiPipeline";
import { getRegionalMultiplier } from "../lib/costEngine";

const router: IRouter = Router();

router.get("/quotes", requireAuth, async (req, res): Promise<void> => {
  const queryParsed = ListQuotesQueryParams.safeParse(req.query);
  const limit = queryParsed.success ? (queryParsed.data.limit ?? 20) : 20;
  const offset = queryParsed.success ? (queryParsed.data.offset ?? 0) : 0;

  const userId = req.session.userId!;

  const quotes = await db
    .select({
      id: quotesTable.id,
      shareUuid: quotesTable.shareUuid,
      title: quotesTable.title,
      status: quotesTable.status,
      totalEstimate: quotesTable.totalEstimate,
      qualityTier: quotesTable.qualityTier,
      sharedUrlEnabled: quotesTable.sharedUrlEnabled,
      createdAt: quotesTable.createdAt,
      propertyAddress: propertiesTable.address,
    })
    .from(quotesTable)
    .leftJoin(propertiesTable, eq(quotesTable.propertyId, propertiesTable.id))
    .where(eq(quotesTable.userId, userId))
    .orderBy(desc(quotesTable.createdAt))
    .limit(limit)
    .offset(offset);

  const countResult = await db
    .select({ count: sql<number>`count(*)` })
    .from(quotesTable)
    .where(eq(quotesTable.userId, userId));

  res.json({
    quotes: quotes.map(q => ({
      ...q,
      propertyAddress: q.propertyAddress || "Unknown",
      createdAt: q.createdAt.toISOString(),
    })),
    total: Number(countResult[0].count),
  });
});

router.post("/quotes/generate", requireAuth, requireTier("free"), async (req, res): Promise<void> => {
  const parsed = GenerateQuoteBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { conversationId, qualityTier, title } = parsed.data;

  const conversations = await db.select().from(conversationsTable).where(
    and(eq(conversationsTable.id, conversationId), eq(conversationsTable.userId, req.session.userId!))
  ).limit(1);
  if (conversations.length === 0) {
    res.status(400).json({ error: "Conversation not found" });
    return;
  }

  const conversation = conversations[0];
  const properties = await db.select().from(propertiesTable).where(eq(propertiesTable.id, conversation.propertyId)).limit(1);
  if (properties.length === 0) {
    res.status(400).json({ error: "Property not found" });
    return;
  }

  const property = properties[0];
  const messages = (conversation.messages as Array<{ role: string; content: string }>) || [];

  const aiResponse = await chatWithVGC(
    messages,
    {
      address: property.address,
      zipCode: property.zipCode,
      sqft: property.sqft,
      bedrooms: property.bedrooms,
      bathrooms: property.bathrooms,
      yearBuilt: property.yearBuilt,
    },
    true
  );

  if (!aiResponse.quoteSuggestion) {
    res.status(400).json({ error: "AI could not generate a renovation scope from this conversation" });
    return;
  }

  const scope = aiResponse.quoteSuggestion;
  const { factor, metroArea } = await getRegionalMultiplier(property.zipCode);

  const tierMultipliers: Record<string, number> = {
    economy: 0.7,
    mid_range: 1.0,
    premium: 1.5,
  };
  const tierMult = tierMultipliers[qualityTier || "mid_range"] || 1.0;

  const lineItems = scope.items.map(item => ({
    category: item.category,
    description: item.description,
    materialCost: Math.round(item.materialCost * factor * tierMult * 100) / 100,
    laborCost: Math.round(item.laborCost * factor * 100) / 100,
    quantity: item.quantity,
    unit: item.unit,
    qualityTier: qualityTier || "mid_range",
  }));

  const totalEstimate = lineItems.reduce((sum, item) => {
    return sum + (item.materialCost + item.laborCost) * item.quantity;
  }, 0);

  let claudeReview = null;
  try {
    claudeReview = await claudeReviewQuote(
      lineItems,
      property.zipCode,
      {
        address: property.address,
        zipCode: property.zipCode,
        sqft: property.sqft,
        bedrooms: property.bedrooms,
        bathrooms: property.bathrooms,
        yearBuilt: property.yearBuilt,
      }
    );
  } catch {
    req.log.warn("Claude review skipped");
  }

  const [quote] = await db.insert(quotesTable).values({
    userId: req.session.userId,
    propertyId: property.id,
    conversationId,
    title: title || `Renovation Quote - ${property.address}`,
    status: "final",
    totalEstimate: Math.round(totalEstimate * 100) / 100,
    qualityTier: qualityTier || "mid_range",
    aiModelUsed: "gpt-4o",
    aiReasoning: scope.reasoning,
    regionalMultiplier: factor,
    claudeReview,
  }).returning();

  const insertedLineItems = await db.insert(quoteLineItemsTable).values(
    lineItems.map(li => ({ ...li, quoteId: quote.id }))
  ).returning();

  res.status(201).json({
    id: quote.id,
    shareUuid: quote.shareUuid,
    title: quote.title,
    status: quote.status,
    totalEstimate: quote.totalEstimate,
    qualityTier: quote.qualityTier,
    aiModelUsed: quote.aiModelUsed,
    aiReasoning: quote.aiReasoning,
    regionalMultiplier: quote.regionalMultiplier,
    sharedUrlEnabled: quote.sharedUrlEnabled,
    property: {
      id: property.id,
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
    lineItems: insertedLineItems.map((li: typeof insertedLineItems[number]) => ({
      ...li,
      subtotal: (li.materialCost + li.laborCost) * li.quantity,
    })),
    claudeReview,
    createdAt: quote.createdAt.toISOString(),
    updatedAt: quote.updatedAt.toISOString(),
  });
});

router.get("/quotes/:quoteId", requireAuth, async (req, res): Promise<void> => {
  const paramsParsed = GetQuoteParams.safeParse({ quoteId: Number(req.params.quoteId) });
  if (!paramsParsed.success) {
    res.status(400).json({ error: "Invalid quote ID" });
    return;
  }

  const quoteId = paramsParsed.data.quoteId;

  const quotes = await db.select().from(quotesTable).where(
    and(eq(quotesTable.id, quoteId), eq(quotesTable.userId, req.session.userId!))
  ).limit(1);
  if (quotes.length === 0) {
    res.status(404).json({ error: "Quote not found" });
    return;
  }

  const quote = quotes[0];
  const lineItems = await db.select().from(quoteLineItemsTable).where(eq(quoteLineItemsTable.quoteId, quoteId));
  const properties = await db.select().from(propertiesTable).where(eq(propertiesTable.id, quote.propertyId)).limit(1);
  const property = properties[0];

  res.json({
    id: quote.id,
    shareUuid: quote.shareUuid,
    title: quote.title,
    status: quote.status,
    totalEstimate: quote.totalEstimate,
    qualityTier: quote.qualityTier,
    aiModelUsed: quote.aiModelUsed,
    aiReasoning: quote.aiReasoning,
    regionalMultiplier: quote.regionalMultiplier,
    sharedUrlEnabled: quote.sharedUrlEnabled,
    property: property ? {
      id: property.id,
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
    } : undefined,
    lineItems: lineItems.map((li: typeof lineItems[number]) => ({
      ...li,
      subtotal: (li.materialCost + li.laborCost) * li.quantity,
    })),
    claudeReview: quote.claudeReview,
    createdAt: quote.createdAt.toISOString(),
    updatedAt: quote.updatedAt.toISOString(),
  });
});

router.delete("/quotes/:quoteId", requireAuth, async (req, res): Promise<void> => {
  const paramsParsed = DeleteQuoteParams.safeParse({ quoteId: Number(req.params.quoteId) });
  if (!paramsParsed.success) {
    res.status(400).json({ error: "Invalid quote ID" });
    return;
  }

  const result = await db.delete(quotesTable).where(
    and(eq(quotesTable.id, paramsParsed.data.quoteId), eq(quotesTable.userId, req.session.userId!))
  ).returning();
  if (result.length === 0) {
    res.status(404).json({ error: "Quote not found" });
    return;
  }

  res.sendStatus(204);
});

router.get("/quotes/shared/:shareUuid", async (req, res): Promise<void> => {
  const paramsParsed = GetSharedQuoteParams.safeParse({ shareUuid: req.params.shareUuid });
  if (!paramsParsed.success) {
    res.status(400).json({ error: "Invalid share UUID" });
    return;
  }

  const shareUuid = paramsParsed.data.shareUuid;

  const quotes = await db.select().from(quotesTable).where(eq(quotesTable.shareUuid, shareUuid)).limit(1);
  if (quotes.length === 0 || !quotes[0].sharedUrlEnabled) {
    res.status(404).json({ error: "Shared quote not found" });
    return;
  }

  const quote = quotes[0];
  const lineItems = await db.select().from(quoteLineItemsTable).where(eq(quoteLineItemsTable.quoteId, quote.id));
  const properties = await db.select().from(propertiesTable).where(eq(propertiesTable.id, quote.propertyId)).limit(1);
  const property = properties[0];

  let agentName: string | null = null;
  let agentBrokerage: string | null = null;
  let coBrandName: string | null = null;

  if (quote.userId) {
    const users = await db.select().from(usersTable).where(eq(usersTable.id, quote.userId)).limit(1);
    if (users.length > 0) {
      agentName = users[0].name;
      agentBrokerage = users[0].brokerage;
      if (users[0].orgId) {
        const orgs = await db.select().from(organizationsTable).where(eq(organizationsTable.id, users[0].orgId)).limit(1);
        if (orgs.length > 0) coBrandName = orgs[0].coBrandName;
      }
    }
  }

  res.json({
    quote: {
      id: quote.id,
      shareUuid: quote.shareUuid,
      title: quote.title,
      status: quote.status,
      totalEstimate: quote.totalEstimate,
      qualityTier: quote.qualityTier,
      aiModelUsed: quote.aiModelUsed,
      aiReasoning: quote.aiReasoning,
      regionalMultiplier: quote.regionalMultiplier,
      sharedUrlEnabled: quote.sharedUrlEnabled,
      property: property ? {
        id: property.id,
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
      } : undefined,
      lineItems: lineItems.map((li: typeof lineItems[number]) => ({
        ...li,
        subtotal: (li.materialCost + li.laborCost) * li.quantity,
      })),
      claudeReview: quote.claudeReview,
      createdAt: quote.createdAt.toISOString(),
      updatedAt: quote.updatedAt.toISOString(),
    },
    agentName,
    agentBrokerage,
    coBrandName,
  });
});

router.post("/quotes/:quoteId/share", requireAuth, requireTier("pro"), async (req, res): Promise<void> => {
  const paramsParsed = ToggleShareQuoteParams.safeParse({ quoteId: Number(req.params.quoteId) });
  if (!paramsParsed.success) {
    res.status(400).json({ error: "Invalid quote ID" });
    return;
  }

  const parsed = ToggleShareQuoteBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [updated] = await db
    .update(quotesTable)
    .set({ sharedUrlEnabled: parsed.data.enabled })
    .where(and(eq(quotesTable.id, paramsParsed.data.quoteId), eq(quotesTable.userId, req.session.userId!)))
    .returning();

  if (!updated) {
    res.status(404).json({ error: "Quote not found" });
    return;
  }

  res.json({
    sharedUrlEnabled: updated.sharedUrlEnabled,
    shareUrl: updated.sharedUrlEnabled ? `/quote/${updated.shareUuid}` : null,
  });
});

export default router;
