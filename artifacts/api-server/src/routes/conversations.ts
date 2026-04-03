import { Router, type IRouter } from "express";
import { db, conversationsTable, propertiesTable } from "@workspace/db";
import { eq, and, or } from "drizzle-orm";
import { CreateConversationBody, SendMessageBody, SendMessageParams, GetConversationParams, VisualizeRenovationBody, GenerateConfiguratorQuoteBody } from "@workspace/api-zod";
import { requireAuth, requireTier } from "../middlewares/auth";
import { chatWithVGC } from "../lib/aiPipeline";
import { detectRenovationIntentFromBoth, generateConfiguratorQuote, getConfiguratorOptions } from "../lib/configuratorMap";
import OpenAI from "openai";

import { editImage } from "@workspace/integrations-gemini-ai";

const openaiForViz = new OpenAI({ apiKey: process.env.OpenAI_API_Key });

interface VisualExtractionResult {
  changeDescription: string;
  anchorElements: string;
}

async function extractVisualDescription(
  messages: Array<{ role: string; content: string }>
): Promise<VisualExtractionResult> {
  const recentMessages = messages.slice(-10);
  const conversationText = recentMessages
    .map(m => `${m.role}: ${m.content}`)
    .join("\n");

  const response = await openaiForViz.chat.completions.create({
    model: "gpt-4o",
    temperature: 0,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content: `You extract renovation edits for an AI image editor. The image editor will perform a SURGICAL edit on exactly one area of a photo — everything else must stay pixel-perfect.

Output a JSON object with exactly two fields:

{
  "target": "A concise description of ONLY the specific items/area to change and what they should look like. Be visually specific: materials, colors, textures, finishes, styles. Example: 'Replace the red brick fireplace surround with stacked gray stone veneer and a reclaimed wood mantel.' Keep this to 1-3 sentences focused on the change.",
  "anchors": "A comma-separated list of SPECIFIC visible objects in the room that must NOT be touched. Describe each item concretely so the image editor can identify it. Example: 'brushed nickel ceiling fan with 5 dark wood blades, glossy cherry hardwood flooring, white crown molding, dark wood kitchen cabinets visible through doorway, white painted baseboards, recessed wall sconces on either side of fireplace, electrical outlet plates on right wall'. List at least 8-12 items. Name every light fixture, fan, furniture piece, floor type, trim, and background element you can infer from the conversation."
}

Rules:
- The "target" must be narrow and specific — only what is being changed
- The "anchors" must list every OTHER visible element — especially ceiling fans, light fixtures, furniture, flooring, trim, and background rooms
- If the conversation mentions the room has a ceiling fan, it MUST appear in anchors
- If multiple rooms are discussed, focus on the most recently discussed room
- Never include items from the target in the anchors list`,
      },
      {
        role: "user",
        content: `Extract the surgical edit target and anchor elements from this conversation:\n\n${conversationText}`,
      },
    ],
  });

  const raw = response.choices[0]?.message?.content || "{}";
  try {
    const parsed = JSON.parse(raw) as { target?: string; anchors?: string };
    return {
      changeDescription: parsed.target || "General modern renovation update with contemporary finishes",
      anchorElements: parsed.anchors || "",
    };
  } catch {
    return {
      changeDescription: raw,
      anchorElements: "",
    };
  }
}

const router: IRouter = Router();

router.post("/conversations", requireAuth, async (req, res): Promise<void> => {
  const parsed = CreateConversationBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const ownershipConditions = [eq(propertiesTable.userId, req.session.userId!)];
  if (req.session.orgId) {
    ownershipConditions.push(eq(propertiesTable.orgId, req.session.orgId));
  }

  const properties = await db.select().from(propertiesTable).where(
    and(eq(propertiesTable.id, parsed.data.propertyId), or(...ownershipConditions))
  ).limit(1);
  if (properties.length === 0) {
    res.status(404).json({ error: "Property not found" });
    return;
  }

  const property = properties[0];
  const initialMessages: Array<{ role: string; content: string; timestamp: string; configuratorType?: string | null }> = [];

  if (parsed.data.initialMessage) {
    initialMessages.push({
      role: "user",
      content: parsed.data.initialMessage,
      timestamp: new Date().toISOString(),
    });

    const aiResponse = await chatWithVGC(
      [{ role: "user", content: parsed.data.initialMessage }],
      {
        address: property.address,
        zipCode: property.zipCode,
        sqft: property.sqft,
        bedrooms: property.bedrooms,
        bathrooms: property.bathrooms,
        yearBuilt: property.yearBuilt,
      }
    );

    const initConfigType = detectRenovationIntentFromBoth(parsed.data.initialMessage, aiResponse.content);
    initialMessages.push({
      role: "assistant",
      content: aiResponse.content,
      configuratorType: initConfigType || null,
      timestamp: new Date().toISOString(),
    });
  } else {
    const greeting = await chatWithVGC(
      [{ role: "user", content: "I'd like to discuss renovation options for this property." }],
      {
        address: property.address,
        zipCode: property.zipCode,
        sqft: property.sqft,
        bedrooms: property.bedrooms,
        bathrooms: property.bathrooms,
        yearBuilt: property.yearBuilt,
      }
    );

    const greetingConfigType = detectRenovationIntentFromBoth("", greeting.content);
    initialMessages.push({
      role: "assistant",
      content: greeting.content,
      configuratorType: greetingConfigType || null,
      timestamp: new Date().toISOString(),
    });
  }

  const [conversation] = await db.insert(conversationsTable).values({
    userId: req.session.userId,
    propertyId: parsed.data.propertyId,
    messages: initialMessages,
  }).returning();

  res.status(201).json({
    id: conversation.id,
    propertyId: conversation.propertyId,
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
    messages: initialMessages,
    createdAt: conversation.createdAt.toISOString(),
    updatedAt: conversation.updatedAt.toISOString(),
  });
});

router.post("/conversations/:conversationId/messages", requireAuth, async (req, res): Promise<void> => {
  const paramsParsed = SendMessageParams.safeParse({ conversationId: Number(req.params.conversationId) });
  if (!paramsParsed.success) {
    res.status(400).json({ error: "Invalid conversation ID" });
    return;
  }

  const parsed = SendMessageBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const conversationId = paramsParsed.data.conversationId;

  const msgOwnership = [eq(conversationsTable.userId, req.session.userId!)];
  if (req.session.orgId) {
    const orgProps = await db.select({ id: propertiesTable.id }).from(propertiesTable)
      .where(eq(propertiesTable.orgId, req.session.orgId));
    if (orgProps.length > 0) {
      msgOwnership.push(...orgProps.map(p => eq(conversationsTable.propertyId, p.id)));
    }
  }
  const conversations = await db.select().from(conversationsTable).where(
    and(eq(conversationsTable.id, conversationId), or(...msgOwnership))
  ).limit(1);
  if (conversations.length === 0) {
    res.status(404).json({ error: "Conversation not found" });
    return;
  }

  const conversation = conversations[0];
  const properties = await db.select().from(propertiesTable).where(eq(propertiesTable.id, conversation.propertyId)).limit(1);
  if (properties.length === 0) {
    res.status(404).json({ error: "Property not found" });
    return;
  }
  const property = properties[0];

  const existingMessages = (conversation.messages as Array<{ role: string; content: string }>) || [];

  const userMessage = {
    role: "user" as const,
    content: parsed.data.content,
    timestamp: new Date().toISOString(),
  };

  const aiResponse = await chatWithVGC(
    [...existingMessages, { role: "user", content: parsed.data.content }],
    {
      address: property.address,
      zipCode: property.zipCode,
      sqft: property.sqft,
      bedrooms: property.bedrooms,
      bathrooms: property.bathrooms,
      yearBuilt: property.yearBuilt,
    },
    parsed.data.requestQuote || false
  );

  const configuratorType = detectRenovationIntentFromBoth(parsed.data.content, aiResponse.content);

  const assistantMessage = {
    role: "assistant" as const,
    content: aiResponse.content,
    quoteSuggestion: aiResponse.quoteSuggestion || null,
    configuratorType: configuratorType || null,
    timestamp: new Date().toISOString(),
  };

  const updatedMessages = [...existingMessages, userMessage, assistantMessage];

  await db.update(conversationsTable)
    .set({ messages: updatedMessages })
    .where(eq(conversationsTable.id, conversationId));

  res.json(assistantMessage);
});

router.post("/conversations/:conversationId/configurator-quote", requireAuth, async (req, res): Promise<void> => {
  const conversationId = Number(req.params.conversationId);
  if (isNaN(conversationId)) {
    res.status(400).json({ error: "Invalid conversation ID" });
    return;
  }

  const parsed = GenerateConfiguratorQuoteBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const cfgOwnership = [eq(conversationsTable.userId, req.session.userId!)];
  if (req.session.orgId) {
    const orgProps = await db.select({ id: propertiesTable.id }).from(propertiesTable)
      .where(eq(propertiesTable.orgId, req.session.orgId));
    if (orgProps.length > 0) {
      cfgOwnership.push(...orgProps.map(p => eq(conversationsTable.propertyId, p.id)));
    }
  }
  const conversations = await db.select().from(conversationsTable).where(
    and(eq(conversationsTable.id, conversationId), or(...cfgOwnership))
  ).limit(1);
  if (conversations.length === 0) {
    res.status(404).json({ error: "Conversation not found" });
    return;
  }

  const conversation = conversations[0];
  const properties = await db.select().from(propertiesTable).where(eq(propertiesTable.id, conversation.propertyId)).limit(1);
  if (properties.length === 0) {
    res.status(404).json({ error: "Property not found" });
    return;
  }
  const property = properties[0];

  try {
    const quote = await generateConfiguratorQuote(
      parsed.data.renovationType,
      parsed.data.selections as Record<string, string>,
      {
        sqft: property.sqft,
        bedrooms: property.bedrooms,
        bathrooms: property.bathrooms,
        yearBuilt: property.yearBuilt,
        zipCode: property.zipCode,
      },
      conversationId
    );
    res.json(quote);
  } catch (err: any) {
    const msg = err.message || "";
    if (msg.startsWith("Missing selections") || msg.startsWith("Invalid selections") || msg.startsWith("Unknown selection") || msg.startsWith("Unknown renovation")) {
      res.status(400).json({ error: msg });
    } else {
      console.error("[configurator-quote] Internal error:", err);
      res.status(500).json({ error: "Failed to generate configurator quote. Please try again." });
    }
  }
});

router.get("/conversations/:conversationId/configurator-options", requireAuth, async (req, res): Promise<void> => {
  const conversationId = Number(req.params.conversationId);
  if (isNaN(conversationId)) {
    res.status(400).json({ error: "Invalid conversation ID" });
    return;
  }

  const optOwnership = [eq(conversationsTable.userId, req.session.userId!)];
  if (req.session.orgId) {
    const orgProps = await db.select({ id: propertiesTable.id }).from(propertiesTable)
      .where(eq(propertiesTable.orgId, req.session.orgId));
    if (orgProps.length > 0) {
      optOwnership.push(...orgProps.map(p => eq(conversationsTable.propertyId, p.id)));
    }
  }
  const conversations = await db.select({ id: conversationsTable.id }).from(conversationsTable).where(
    and(eq(conversationsTable.id, conversationId), or(...optOwnership))
  ).limit(1);
  if (conversations.length === 0) {
    res.status(404).json({ error: "Conversation not found" });
    return;
  }

  const renovationType = req.query.renovationType as string;
  if (!renovationType) {
    res.status(400).json({ error: "renovationType query parameter required" });
    return;
  }

  const options = getConfiguratorOptions(renovationType);
  if (!options) {
    res.status(404).json({ error: `Unknown renovation type: ${renovationType}` });
    return;
  }

  res.json(options);
});

router.get("/conversations/:conversationId", requireAuth, async (req, res): Promise<void> => {
  const paramsParsed = GetConversationParams.safeParse({ conversationId: Number(req.params.conversationId) });
  if (!paramsParsed.success) {
    res.status(400).json({ error: "Invalid conversation ID" });
    return;
  }

  const conversationId = paramsParsed.data.conversationId;

  const getOwnership = [eq(conversationsTable.userId, req.session.userId!)];
  if (req.session.orgId) {
    const orgProps = await db.select({ id: propertiesTable.id }).from(propertiesTable)
      .where(eq(propertiesTable.orgId, req.session.orgId));
    if (orgProps.length > 0) {
      getOwnership.push(...orgProps.map(p => eq(conversationsTable.propertyId, p.id)));
    }
  }
  const conversations = await db.select().from(conversationsTable).where(
    and(eq(conversationsTable.id, conversationId), or(...getOwnership))
  ).limit(1);
  if (conversations.length === 0) {
    res.status(404).json({ error: "Conversation not found" });
    return;
  }

  const conversation = conversations[0];
  const properties = await db.select().from(propertiesTable).where(eq(propertiesTable.id, conversation.propertyId)).limit(1);
  const property = properties[0];

  res.json({
    id: conversation.id,
    propertyId: conversation.propertyId,
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
    messages: conversation.messages || [],
    createdAt: conversation.createdAt.toISOString(),
    updatedAt: conversation.updatedAt.toISOString(),
  });
});

router.post("/conversations/:conversationId/visualize", requireAuth, async (req, res): Promise<void> => {
  const conversationId = Number(req.params.conversationId);
  if (isNaN(conversationId)) {
    res.status(400).json({ error: "Invalid conversation ID" });
    return;
  }

  const parsed = VisualizeRenovationBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const vizOwnership = [eq(conversationsTable.userId, req.session.userId!)];
  if (req.session.orgId) {
    const orgProps = await db.select({ id: propertiesTable.id }).from(propertiesTable)
      .where(eq(propertiesTable.orgId, req.session.orgId));
    if (orgProps.length > 0) {
      vizOwnership.push(...orgProps.map(p => eq(conversationsTable.propertyId, p.id)));
    }
  }
  const conversations = await db.select().from(conversationsTable).where(
    and(eq(conversationsTable.id, conversationId), or(...vizOwnership))
  ).limit(1);
  if (conversations.length === 0) {
    res.status(404).json({ error: "Conversation not found" });
    return;
  }

  const conversation = conversations[0];
  const properties = await db.select().from(propertiesTable).where(eq(propertiesTable.id, conversation.propertyId)).limit(1);
  const property = properties[0];

  const existingMessages = (conversation.messages as Array<{ role: string; content: string }>) || [];

  const sourceImageUrl = parsed.data.sourceImageUrl;
  const uploadedImageBase64 = parsed.data.uploadedImageBase64;
  const uploadedImageMimeType = parsed.data.uploadedImageMimeType;
  const hasSourceImage = !!(sourceImageUrl || uploadedImageBase64);

  if (sourceImageUrl) {
    const listingPhotos = (property?.listingPhotos as string[] | null) || [];
    if (!listingPhotos.includes(sourceImageUrl)) {
      res.status(400).json({ error: "Source image must be one of the property's listing photos." });
      return;
    }
  }

  if (uploadedImageBase64) {
    const estimatedSize = (uploadedImageBase64.length * 3) / 4;
    if (estimatedSize > 10 * 1024 * 1024) {
      res.status(400).json({ error: "Uploaded image too large (max 10MB)." });
      return;
    }
    if (!uploadedImageMimeType || !["image/jpeg", "image/png", "image/webp"].includes(uploadedImageMimeType)) {
      res.status(400).json({ error: "Invalid image type. Supported: JPEG, PNG, WebP." });
      return;
    }
  }

  if (!hasSourceImage) {
    res.status(400).json({ error: "Please select a listing photo or upload your own photo to visualize the renovation." });
    return;
  }

  try {
    let changeDescription: string;
    let anchorElements = "";
    let promptSource: string;
    if (parsed.data.prompt) {
      changeDescription = parsed.data.prompt;
      promptSource = "user-provided";
    } else {
      try {
        const extraction = await extractVisualDescription(existingMessages);
        changeDescription = extraction.changeDescription;
        anchorElements = extraction.anchorElements;
        promptSource = "gpt4o-extracted";
      } catch (extractErr) {
        console.error("Visual description extraction failed, using fallback:", extractErr);
        const recentContext = existingMessages.slice(-6).map(m => `${m.role}: ${m.content}`).join("\n");
        changeDescription = `Apply the renovations discussed in this conversation:\n${recentContext}`;
        promptSource = "raw-context-fallback";
      }
    }
    console.log(`[visualize] conversationId=${conversationId} promptSource=${promptSource} descriptionLength=${changeDescription.length} anchors=${anchorElements.length > 0 ? "yes" : "none"} imageSource=${sourceImageUrl ? "listing" : "upload"}`);

    let imgBuffer: Buffer;
    let mimeType = "image/jpeg";

    if (uploadedImageBase64) {
      imgBuffer = Buffer.from(uploadedImageBase64, "base64");
      mimeType = uploadedImageMimeType || "image/png";
    } else {
      const imgResponse = await fetch(sourceImageUrl!, { signal: AbortSignal.timeout(15000) });
      if (!imgResponse.ok) {
        res.status(400).json({ error: "Could not fetch the source photo." });
        return;
      }
      const arrayBuf = await imgResponse.arrayBuffer();
      if (arrayBuf.byteLength > 10 * 1024 * 1024) {
        res.status(400).json({ error: "Source image too large (max 10MB)." });
        return;
      }
      imgBuffer = Buffer.from(arrayBuf);
      const rawCt = imgResponse.headers.get("content-type") || "image/jpeg";
      mimeType = rawCt.split(";")[0].trim();
    }

    console.log("[visualize] Using Gemini for visualization");
    const editPrompt = `You are a photorealistic image editor performing a PIXEL-LOCK PRESERVATION EDIT. This is NOT a room redesign. You are making a single, localized change to exactly one element. Every other pixel in the photo must remain a 1:1 identical copy of the original image.

══════════════════════════════════════
PIXEL-LOCK — DO NOT TOUCH THESE ITEMS
══════════════════════════════════════
${anchorElements
  ? anchorElements
  : "All ceiling fans, light fixtures, pendant lights, recessed lights, chandeliers, furniture, sofas, chairs, tables, rugs, flooring, hardwood floors, tile, carpet, walls, ceilings, crown molding, baseboards, trim, windows, doors, window frames, curtains, blinds, appliances, cabinetry not being renovated, background rooms visible through doorways, wall art, mirrors, shelving, decorative objects, and any other element not explicitly listed as the TARGET below."
}

══════════════════════════════════════
TARGET — MODIFY ONLY THIS ONE ITEM
══════════════════════════════════════
${changeDescription}

══════════════════════════════════════
ABSOLUTE RULES — VIOLATION = FAILURE
══════════════════════════════════════
RULE 1 — PRESERVATION IS THE PRIORITY: Every item in the PIXEL-LOCK list above must be 1:1 identical to the original photo. This rule overrides everything else.
RULE 2 — NO NEW OBJECTS: Do not add any object that does not exist in the original photo. No new ceiling fans, no new windows, no new doors, no new furniture, no new light fixtures, no new rugs, no new decor — nothing.
RULE 3 — NO REMOVALS: Do not remove any existing object from the photo. If a ceiling fan exists in the original, it must exist in the output in the exact same position, color, and style.
RULE 4 — LOCALIZED PIXELS ONLY: Your pixel edits must be confined exclusively to the TARGET item and its immediate bordering pixels. Do not touch any pixel that is more than a few pixels away from the target element's boundary.
RULE 5 — NO STYLE DRIFT: Do not modernize, upgrade, restyle, or improve anything that is not the TARGET. The rest of the room must look exactly like the original photo, not a better version of it.
RULE 6 — WHEN IN DOUBT, DO NOT CHANGE IT: If you are uncertain whether a pixel belongs to the TARGET or to the surrounding room, leave it unchanged.
RULE 7 — PHOTOREALISM: The TARGET change must look like a real photograph. Apply correct shadows, reflections, and textures that match the room's existing lighting direction and color temperature. Edges where new materials meet existing surfaces must blend seamlessly.`;

    const geminiResult = await editImage(imgBuffer.toString("base64"), mimeType, editPrompt);
    const dataUri = `data:${geminiResult.mimeType};base64,${geminiResult.b64_json}`;
    console.log("[visualize] Gemini visualization success");

    const uploadedPreviewUri = uploadedImageBase64 ? `data:${uploadedImageMimeType};base64,${uploadedImageBase64}` : undefined;

    const assistantMessage = {
      role: "assistant" as const,
      content: "Here's how this room could look with the proposed renovations:",
      imageUrl: dataUri,
      sourceImageUrl: sourceImageUrl || uploadedPreviewUri || undefined,
      timestamp: new Date().toISOString(),
    };

    const updatedMessages = [...existingMessages, assistantMessage];
    await db.update(conversationsTable)
      .set({ messages: updatedMessages })
      .where(eq(conversationsTable.id, conversationId));

    res.json(assistantMessage);
  } catch (error) {
    console.error("Visualization generation failed:", error);
    res.status(500).json({ error: "Failed to generate visualization. Please try again." });
  }
});

export default router;
