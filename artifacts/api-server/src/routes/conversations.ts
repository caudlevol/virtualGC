import { Router, type IRouter } from "express";
import { db, conversationsTable, propertiesTable } from "@workspace/db";
import { eq, and, or } from "drizzle-orm";
import { CreateConversationBody, SendMessageBody, SendMessageParams, GetConversationParams, VisualizeRenovationBody } from "@workspace/api-zod";
import { requireAuth, requireTier } from "../middlewares/auth";
import { chatWithVGC } from "../lib/aiPipeline";
import OpenAI, { toFile } from "openai";

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

    let imgBuffer: Buffer;
    let mimeType = "image/png";

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
      const rawContentType = imgResponse.headers.get("content-type") || "image/png";
      mimeType = rawContentType.split(";")[0].trim();
    }

    const ext = mimeType === "image/jpeg" ? "jpg" : mimeType === "image/webp" ? "webp" : "png";
    const imageFile = await toFile(imgBuffer, `source.${ext}`, { type: mimeType });

    function pickOutputSize(buf: Buffer): "1024x1024" | "1536x1024" | "1024x1536" {
      try {
        let w = 0, h = 0;
        if (buf[0] === 0xFF && buf[1] === 0xD8) {
          let offset = 2;
          while (offset < buf.length - 1) {
            if (buf[offset] !== 0xFF) break;
            const marker = buf[offset + 1];
            if (marker === 0xC0 || marker === 0xC2) {
              h = buf.readUInt16BE(offset + 5);
              w = buf.readUInt16BE(offset + 7);
              break;
            }
            const segLen = buf.readUInt16BE(offset + 2);
            offset += 2 + segLen;
          }
        } else if (buf[1] === 0x50 && buf[2] === 0x4E && buf[3] === 0x47) {
          w = buf.readUInt32BE(16);
          h = buf.readUInt32BE(20);
        }
        if (w > 0 && h > 0) {
          const ratio = w / h;
          if (ratio > 1.2) return "1536x1024";
          if (ratio < 0.8) return "1024x1536";
        }
      } catch {}
      return "1024x1024";
    }

    const outputSize = pickOutputSize(imgBuffer);
    const openaiResult = await openaiForViz.images.edit({
      model: "gpt-image-1",
      image: imageFile,
      prompt: editPrompt,
      size: outputSize,
      response_format: "b64_json",
    });

    const b64Data = openaiResult.data?.[0]?.b64_json;
    if (!b64Data) {
      throw new Error("No image data returned from OpenAI");
    }

    const dataUri = `data:image/png;base64,${b64Data}`;

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
