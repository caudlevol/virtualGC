import { Router, type IRouter } from "express";
import { db, conversationsTable, propertiesTable } from "@workspace/db";
import { eq, and, or } from "drizzle-orm";
import { CreateConversationBody, SendMessageBody, SendMessageParams, GetConversationParams, VisualizeRenovationBody, GenerateConfiguratorQuoteBody } from "@workspace/api-zod";
import { requireAuth, requireTier } from "../middlewares/auth";
import { chatWithVGC } from "../lib/aiPipeline";
import { detectRenovationIntentFromBoth, generateConfiguratorQuote, getConfiguratorOptions } from "../lib/configuratorMap";
import OpenAI from "openai";
import FormData from "form-data";
import { editImage } from "@workspace/integrations-gemini-ai";

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
    console.log(`[visualize] conversationId=${conversationId} promptSource=${promptSource} descriptionLength=${visualDescription.length} imageSource=${sourceImageUrl ? "listing" : "upload"}`);

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

    function detectRoomType(description: string): string {
      const d = description.toLowerCase();
      if (d.includes("kitchen")) return "kitchen";
      if (d.includes("bathroom") || d.includes("bath ") || d.includes("shower") || d.includes("vanity")) return "bathroom";
      if (d.includes("bedroom") || d.includes("bed room") || d.includes("master")) return "bedroom";
      if (d.includes("dining")) return "diningRoom";
      if (d.includes("office") || d.includes("study")) return "homeOffice";
      if (d.includes("basement")) return "basement";
      if (d.includes("laundry")) return "laundryRoom";
      if (d.includes("exterior") || d.includes("outside") || d.includes("facade") || d.includes("front of")) return "exterior";
      return "livingRoom";
    }

    const roomType = detectRoomType(visualDescription);
    const isExterior = roomType === "exterior";

    let dataUri: string | null = null;

    const reimageApiKey = process.env.ReImage_API_Key;
    if (reimageApiKey) {
      try {
        const reimageBase = "https://api.reimage.io/api/v1";
        const endpoint = isExterior ? "exterior-remodel" : "interior-remodel";

        const form = new FormData();
        form.append("image", imgBuffer, { filename: "room.jpg", contentType: "image/jpeg" });
        form.append("prompt", visualDescription);
        if (!isExterior) {
          form.append("room_type", roomType);
        }

        const submitResponse = await fetch(`${reimageBase}/${endpoint}`, {
          method: "POST",
          headers: { "Authorization": reimageApiKey, ...form.getHeaders() },
          body: form.getBuffer(),
        });

        if (submitResponse.status === 429) {
          console.warn("[visualize] ReImage rate limited (429), falling back to Gemini");
          throw new Error("RATE_LIMITED");
        }

        if (!submitResponse.ok) {
          const errText = await submitResponse.text();
          console.error("[visualize] ReImage submit failed:", submitResponse.status, errText);
          throw new Error(`ReImage submit failed: ${submitResponse.status}`);
        }

        const submitResult = await submitResponse.json() as { jobID: number };
        const jobId = submitResult.jobID;
        console.log(`[visualize] ReImage job submitted: ${jobId} endpoint=${endpoint} roomType=${roomType}`);

        let jobStatus = "rendering";
        const maxWait = 120_000;
        const pollInterval = 3_000;
        const startTime = Date.now();

        while (jobStatus !== "complete" && jobStatus !== "error" && (Date.now() - startTime) < maxWait) {
          await new Promise(r => setTimeout(r, pollInterval));
          const statusRes = await fetch(`${reimageBase}/job/${jobId}/status`, {
            headers: { "Authorization": reimageApiKey },
          });
          if (!statusRes.ok) continue;
          const statusData = await statusRes.json() as { status: string; output_values?: Record<string, string> };
          jobStatus = statusData.status;
          if (jobStatus === "error") {
            const errMsg = statusData.output_values?.error || "Unknown error";
            console.error(`[visualize] ReImage job ${jobId} failed: ${errMsg}`);
            throw new Error(`ReImage job error: ${errMsg}`);
          }
        }

        if (jobStatus !== "complete") {
          throw new Error("ReImage timed out");
        }

        const resultRes = await fetch(`${reimageBase}/job/${jobId}/results/image-0`, {
          headers: { "Authorization": reimageApiKey },
        });
        if (!resultRes.ok) throw new Error("Failed to download result");

        const resultBuffer = Buffer.from(await resultRes.arrayBuffer());
        dataUri = `data:image/png;base64,${resultBuffer.toString("base64")}`;
        console.log(`[visualize] ReImage success for job ${jobId}`);
      } catch (reimageErr: any) {
        console.warn(`[visualize] ReImage failed (${reimageErr.message}), falling back to Gemini`);
      }
    }

    if (!dataUri) {
      console.log("[visualize] Using Gemini fallback");
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

      const geminiResult = await editImage(imgBuffer.toString("base64"), mimeType, editPrompt);
      dataUri = `data:${geminiResult.mimeType};base64,${geminiResult.b64_json}`;
      console.log("[visualize] Gemini fallback success");
    }

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
