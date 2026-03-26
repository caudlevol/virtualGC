import { Router, type IRouter } from "express";
import { db, conversationsTable, propertiesTable } from "@workspace/db";
import { eq, and, or } from "drizzle-orm";
import { CreateConversationBody, SendMessageBody, SendMessageParams, GetConversationParams, VisualizeRenovationBody } from "@workspace/api-zod";
import { requireAuth, requireTier } from "../middlewares/auth";
import { chatWithVGC } from "../lib/aiPipeline";
import { generateImage, editImage } from "@workspace/integrations-gemini-ai/image";
import OpenAI from "openai";

const openaiForViz = new OpenAI({ apiKey: process.env.OpenAI_API_Key });

async function extractVisualDescription(
  messages: Array<{ role: string; content: string }>
): Promise<string> {
  const recentMessages = messages.slice(-10);
  const conversationText = recentMessages
    .map(m => `${m.role}: ${m.content}`)
    .join("\n");

  const response = await openaiForViz.chat.completions.create({
    model: "gpt-4o",
    temperature: 0,
    messages: [
      {
        role: "system",
        content: `You are a renovation visual description extractor. Given a conversation between a user and a renovation advisor, extract ONLY the specific visual changes discussed. Output a concise list of visual renovation instructions.

Rules:
- Focus on VISUAL details only: materials, colors, textures, fixtures, finishes, styles
- Be extremely specific: "polished Absolute Black granite countertops" not "new countertops"
- Include spatial details: "extend upper cabinets to ceiling height" not "update cabinets"
- Mention hardware, lighting, and accent details when discussed
- If multiple rooms are discussed, focus on the most recently discussed room
- Output as a numbered list of specific changes, no preamble
- If no specific renovations are discussed, output "General modern renovation update with contemporary finishes"`,
      },
      {
        role: "user",
        content: `Extract the specific visual renovation changes from this conversation:\n\n${conversationText}`,
      },
    ],
  });

  return response.choices[0]?.message?.content || "General modern renovation update with contemporary finishes";
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
  const initialMessages: Array<{ role: string; content: string; timestamp: string }> = [];

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

    initialMessages.push({
      role: "assistant",
      content: aiResponse.content,
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

    initialMessages.push({
      role: "assistant",
      content: greeting.content,
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

  const assistantMessage = {
    role: "assistant" as const,
    content: aiResponse.content,
    quoteSuggestion: aiResponse.quoteSuggestion || null,
    timestamp: new Date().toISOString(),
  };

  const updatedMessages = [...existingMessages, userMessage, assistantMessage];

  await db.update(conversationsTable)
    .set({ messages: updatedMessages })
    .where(eq(conversationsTable.id, conversationId));

  res.json(assistantMessage);
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

  if (sourceImageUrl) {
    const listingPhotos = (property?.listingPhotos as string[] | null) || [];
    if (!listingPhotos.includes(sourceImageUrl)) {
      res.status(400).json({ error: "Source image must be one of the property's listing photos." });
      return;
    }
  }

  try {
    let result: { b64_json: string; mimeType: string };

    if (sourceImageUrl) {
      let visualDescription = parsed.data.prompt;
      let promptSource: string;
      if (visualDescription) {
        promptSource = "user-provided";
      } else {
        try {
          visualDescription = await extractVisualDescription(existingMessages);
          promptSource = "gpt4o-extracted";
        } catch (extractErr) {
          console.error("Visual description extraction failed, using fallback:", extractErr);
          const recentContext = existingMessages.slice(-6).map(m => `${m.role}: ${m.content}`).join("\n");
          visualDescription = `Apply the renovations discussed in this conversation:\n${recentContext}`;
          promptSource = "raw-context-fallback";
        }
      }
      console.log(`[visualize] conversationId=${conversationId} promptSource=${promptSource} descriptionLength=${visualDescription.length}`);

      const editPrompt = `You are a professional interior renovation visualization tool. Edit this photo to show the following specific renovations applied to the room.

KEEP UNCHANGED:
- The exact room layout, dimensions, walls, ceiling, and floor plan
- The camera angle, perspective, and field of view
- The natural lighting direction and window positions
- Any structural elements (doors, windows, archways) not mentioned in changes

APPLY THESE SPECIFIC CHANGES:
${visualDescription}

QUALITY REQUIREMENTS:
- Photorealistic rendering — the result must look like an actual photograph, not a digital rendering
- New materials must have correct reflections, shadows, and textures matching the room's lighting
- Maintain consistent color temperature across existing and new elements
- Edges where new materials meet existing surfaces must blend seamlessly
- Preserve the original image resolution and color depth`;

      const imgResponse = await fetch(sourceImageUrl, { signal: AbortSignal.timeout(15000) });
      if (!imgResponse.ok) {
        res.status(400).json({ error: "Could not fetch the source photo." });
        return;
      }
      const imgBuffer = await imgResponse.arrayBuffer();
      if (imgBuffer.byteLength > 10 * 1024 * 1024) {
        res.status(400).json({ error: "Source image too large (max 10MB)." });
        return;
      }
      const imgBase64 = Buffer.from(imgBuffer).toString("base64");
      const rawContentType = imgResponse.headers.get("content-type") || "image/jpeg";
      const contentType = rawContentType.split(";")[0].trim();
      result = await editImage(imgBase64, contentType, editPrompt);
    } else {
      const recentContext = existingMessages.slice(-6).map(m => `${m.role}: ${m.content}`).join("\n");
      const generatePrompt = `Professional renovation concept rendering for a ${property?.sqft || ""}sqft home at ${property?.address || "residential property"}. Based on this conversation:\n${recentContext}\n\nShow a photorealistic, well-lit interior rendering of the proposed renovations. Modern, high-quality finishes.`;
      result = await generateImage(generatePrompt);
    }

    const dataUri = `data:${result.mimeType};base64,${result.b64_json}`;

    const assistantMessage = {
      role: "assistant" as const,
      content: sourceImageUrl
        ? "Here's how this room could look with the proposed renovations:"
        : "Here's a concept rendering based on our discussion:",
      imageUrl: dataUri,
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
