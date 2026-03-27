import OpenAI from "openai";
import Anthropic from "@anthropic-ai/sdk";
import { logger } from "./logger";
import { getMaterialCosts, getRegionalMultiplier } from "./costEngine";
import { db, laborRatesTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const openai = new OpenAI({ apiKey: process.env.OpenAI_API_Key });
const anthropic = new Anthropic({ apiKey: process.env.Claude_API_Key });

interface PropertyData {
  address: string;
  zipCode: string;
  sqft: number;
  bedrooms: number;
  bathrooms: number;
  yearBuilt: number | null;
}

interface RenovationLineItem {
  category: string;
  description: string;
  materialCost: number;
  laborCost: number;
  quantity: number;
  unit: string;
}

interface RenovationScope {
  items: RenovationLineItem[];
  reasoning: string;
}

const VALID_CATEGORIES = [
  "kitchen", "bathroom", "flooring", "painting", "roofing",
  "electrical", "plumbing", "hvac", "windows", "drywall",
  "insulation", "demolition", "tiling", "landscaping", "general",
];

const VALID_UNITS = ["sqft", "linear_ft", "each", "hour", "room"];

async function classifyAndNormalizeBatch(
  items: RenovationLineItem[],
  _propertyData: PropertyData
): Promise<RenovationLineItem[]> {
  return items.map(item => {
    let category = item.category.toLowerCase().trim();
    if (!VALID_CATEGORIES.includes(category)) {
      if (category.includes("kitchen") || category.includes("cabinet")) category = "kitchen";
      else if (category.includes("bath") || category.includes("shower") || category.includes("toilet")) category = "bathroom";
      else if (category.includes("floor") || category.includes("carpet") || category.includes("hardwood")) category = "flooring";
      else if (category.includes("paint")) category = "painting";
      else if (category.includes("roof")) category = "roofing";
      else if (category.includes("electric") || category.includes("wiring") || category.includes("outlet")) category = "electrical";
      else if (category.includes("plumb") || category.includes("pipe") || category.includes("water")) category = "plumbing";
      else if (category.includes("hvac") || category.includes("heating") || category.includes("cooling")) category = "hvac";
      else if (category.includes("window") || category.includes("door")) category = "windows";
      else if (category.includes("drywall") || category.includes("wall")) category = "drywall";
      else if (category.includes("insul")) category = "insulation";
      else if (category.includes("demo")) category = "demolition";
      else if (category.includes("tile")) category = "tiling";
      else if (category.includes("landscape") || category.includes("yard")) category = "landscaping";
      else category = "general";
    }

    let unit = item.unit.toLowerCase().trim();
    if (!VALID_UNITS.includes(unit)) {
      if (unit.includes("sq") || unit.includes("foot") || unit.includes("feet")) unit = "sqft";
      else if (unit.includes("linear") || unit.includes("ln")) unit = "linear_ft";
      else if (unit.includes("hr") || unit.includes("hour")) unit = "hour";
      else if (unit.includes("room")) unit = "room";
      else unit = "each";
    }

    return {
      ...item,
      category,
      unit,
      quantity: Math.max(item.quantity, 0),
      materialCost: Math.max(item.materialCost, 0),
      laborCost: Math.max(item.laborCost, 0),
    };
  });
}

const SYSTEM_PROMPT = `You are the Virtual General Contractor (Virtual GC) — a friendly, plain-speaking renovation cost advisor for home buyers.

How to respond:
- Lead with the bottom line: give a clear cost range FIRST (e.g. "That would run about $3,000–$5,000").
- Keep answers SHORT — 2 to 4 sentences max for simple questions. Only elaborate if the user asks for more detail.
- Use everyday language. Your audience is home buyers, NOT contractors. Avoid jargon like "R-value", "load-bearing", "permits", "code compliance" unless the user specifically asks.
- Be warm and direct, like a knowledgeable friend — not a formal report.
- If a question is vague, ask ONE short clarifying question rather than listing every possible option.

Cost breakdown format — ALWAYS break estimates into tiers with specifics:
- When giving cost estimates, ALWAYS show 3 tiers with a specific dollar amount AND what's included at each level.
- Format like this:
  **Basic (~$X):** [specific items included]
  **Mid-range (~$Y):** [specific items included]
  **High-end (~$Z):** [specific items included]
- Each tier should list the actual materials, fixtures, or finishes the buyer would get — not just "basic materials" or "premium finishes."
- Example: "**Basic (~$10k):** New vanity, toilet, standard fixtures, fresh paint. **Mid-range (~$18k):** All that plus tile floors, glass shower enclosure, updated lighting. **High-end (~$30k):** Full gut, custom tile, freestanding tub, heated floors, premium fixtures."
- NEVER give a vague range like "$10,000 to $30,000" without explaining what you get at each price point.

Smart Scope — locking in accurate quotes:
- You have a built-in Smart Scope tool that lets buyers pick their exact materials to get a locked, itemized quote with real pricing from our cost database.
- Smart Scope is available for these renovation types ONLY: kitchen remodels, bathroom remodels, flooring, interior painting, window replacement, staircase renovation, roof replacement, HVAC systems, deck/patio, garage renovation, basement finishing, exterior paint/siding, landscaping, and exterior doors (front/rear).
- ONLY mention Smart Scope when discussing one of the supported types listed above. Do NOT mention Smart Scope for renovation types that are not in the list.
- When discussing a supported type, after giving your ballpark estimate, prompt the user to select their materials. For example: "Want to lock in a more accurate price? Pick your preferred materials below and I'll give you an exact, itemized quote."
- If the user asks a general question like "What does this place need?" or "Give me an estimate for everything," suggest starting with the biggest-impact room (usually kitchen or bathrooms) and prompt them to use Smart Scope for it.
- When Smart Scope is shown, keep your text response brief — the interactive material selector will appear automatically below your message.

Never do:
- Never output JSON, code blocks, or structured data in conversational replies.
- Never include disclaimers about estimates not being binding — that's handled elsewhere in the app.
- Never give long bullet-point lists of considerations, permits, or structural warnings unless asked.
- Never say "Here's a structured estimate" or output formatted code.

When the system asks you to generate a formal quote (via a special prompt), ONLY then respond with the requested JSON format. In normal conversation, always reply in plain, friendly text.`;

export async function chatWithVGC(
  messages: Array<{ role: string; content: string }>,
  propertyData: PropertyData,
  requestQuote: boolean = false
): Promise<{ content: string; quoteSuggestion?: RenovationScope }> {
  const propertyContext = `
Property Details:
- Address: ${propertyData.address}
- Zip Code: ${propertyData.zipCode}
- Square Footage: ${propertyData.sqft} sq ft
- Bedrooms: ${propertyData.bedrooms}
- Bathrooms: ${propertyData.bathrooms}
- Year Built: ${propertyData.yearBuilt || "Unknown"}`;

  const formattedMessages: OpenAI.ChatCompletionMessageParam[] = [
    { role: "system" as const, content: SYSTEM_PROMPT + "\n\n" + propertyContext },
    ...messages.map(m => ({
      role: m.role as "user" | "assistant",
      content: m.content,
    })),
  ];

  if (requestQuote) {
    formattedMessages.push({
      role: "user" as const,
      content: `Based on our conversation, please generate a detailed renovation scope. Respond ONLY with a JSON object in this exact format:
{
  "items": [
    {
      "category": "Kitchen",
      "description": "Cabinet replacement - 30 linear feet",
      "materialCost": 150,
      "laborCost": 75,
      "quantity": 30,
      "unit": "linear_ft"
    }
  ],
  "reasoning": "Brief explanation of the scope and recommendations"
}
Include ALL discussed renovation items with realistic per-unit material and labor costs (before regional adjustment). Use these units: sqft, linear_ft, each, hour, room. If there are many items, include all of them.`,
    });

    try {
      const allItems: RenovationLineItem[] = [];
      let reasoning = "";

      const response = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: formattedMessages,
        temperature: 0,
        response_format: { type: "json_object" },
      });

      const raw = response.choices[0]?.message?.content || "{}";
      const parsed = JSON.parse(raw) as RenovationScope;
      reasoning = parsed.reasoning || "";

      const BATCH_SIZE = 20;
      if (parsed.items.length <= BATCH_SIZE) {
        const classified = await classifyAndNormalizeBatch(parsed.items, propertyData);
        allItems.push(...classified);
      } else {
        for (let i = 0; i < parsed.items.length; i += BATCH_SIZE) {
          const batch = parsed.items.slice(i, i + BATCH_SIZE);
          logger.info({ batchStart: i, batchSize: batch.length, totalItems: parsed.items.length }, "Classifying item batch");
          const classified = await classifyAndNormalizeBatch(batch, propertyData);
          allItems.push(...classified);
        }
      }

      return {
        content: reasoning || "Here's your renovation estimate.",
        quoteSuggestion: { items: allItems, reasoning },
      };
    } catch (err) {
      logger.error({ err }, "OpenAI quote generation failed");
      throw new Error("Failed to generate quote from AI");
    }
  }

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: formattedMessages,
      temperature: 0.7,
    });

    return {
      content: response.choices[0]?.message?.content || "I apologize, I couldn't generate a response. Could you rephrase that?",
    };
  } catch (err) {
    logger.error({ err }, "OpenAI chat failed");
    throw new Error("Failed to get AI response");
  }
}

export async function claudeReviewQuote(
  lineItems: Array<{ category: string; description: string; materialCost: number; laborCost: number; quantity: number; unit: string }>,
  zipCode: string,
  propertyData: PropertyData
): Promise<{ approved: boolean; flags: Array<{ item: string; issue: string; severity: string }>; summary: string }> {
  const regional = await getRegionalMultiplier(zipCode);
  const flags: Array<{ item: string; issue: string; severity: string }> = [];

  for (const item of lineItems) {
    const benchmarkMaterial = await getMaterialCosts(item.category.toLowerCase(), "mid_range");
    if (benchmarkMaterial.length > 0) {
      const benchmarkCost = benchmarkMaterial[0].baseUnitCost * regional.factor;
      const variance = Math.abs(item.materialCost - benchmarkCost) / benchmarkCost;
      if (variance > 0.30) {
        flags.push({
          item: item.description,
          issue: `Material cost $${item.materialCost}/unit is ${Math.round(variance * 100)}% off benchmark $${Math.round(benchmarkCost * 100) / 100}/unit`,
          severity: variance > 0.50 ? "error" : "warning",
        });
      }
    }

    const benchmarkLabor = await db.select().from(laborRatesTable)
      .where(eq(laborRatesTable.tradeType, item.category.toLowerCase())).limit(1);
    if (benchmarkLabor.length > 0) {
      const benchmarkLaborCost = (benchmarkLabor[0].hourlyRate * benchmarkLabor[0].productivityFactor / 4) * regional.factor;
      const laborVariance = Math.abs(item.laborCost - benchmarkLaborCost) / benchmarkLaborCost;
      if (laborVariance > 0.30) {
        flags.push({
          item: item.description,
          issue: `Labor cost $${item.laborCost}/unit is ${Math.round(laborVariance * 100)}% off benchmark $${Math.round(benchmarkLaborCost * 100) / 100}/unit`,
          severity: laborVariance > 0.50 ? "error" : "warning",
        });
      }
    }
  }

  let claudeResult = { approved: true, flags: [] as typeof flags, summary: "Review completed" };

  try {
    const prompt = `You are a construction cost auditor. Review the following renovation quote line items for accuracy.

Property: ${propertyData.address}, ${propertyData.zipCode} (${propertyData.sqft} sqft, built ${propertyData.yearBuilt || "unknown"})
Regional multiplier: ${regional.factor}x (${regional.metroArea})

Line Items:
${JSON.stringify(lineItems, null, 2)}

For each line item, check if the material and labor costs are within a reasonable range for this type of work in this region. Flag ANY item where costs are more than 30% above or below typical regional norms.

Respond ONLY with JSON:
{
  "approved": true/false,
  "flags": [
    { "item": "description", "issue": "why it's flagged", "severity": "warning|error" }
  ],
  "summary": "Brief overall assessment"
}`;

    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 2048,
      temperature: 0,
      messages: [{ role: "user", content: prompt }],
    });

    const textBlock = response.content.find(b => b.type === "text");
    const raw = textBlock?.text || "{}";
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    claudeResult = JSON.parse(jsonMatch?.[0] || '{"approved":true,"flags":[],"summary":"Review completed"}');
  } catch (err) {
    logger.error({ err }, "Claude review failed, using deterministic checks only");
  }

  const allFlags = [...flags, ...claudeResult.flags];
  const hasErrors = allFlags.some(f => f.severity === "error");

  return {
    approved: !hasErrors && claudeResult.approved,
    flags: allFlags,
    summary: flags.length > 0
      ? `Deterministic check found ${flags.length} variance(s). ${claudeResult.summary}`
      : claudeResult.summary,
  };
}

export async function generateDemoEstimate(
  propertyData: PropertyData,
  renovationType: string
): Promise<RenovationScope> {
  const prompt = `You are the Virtual General Contractor. Generate a renovation estimate for this property.

Property: ${propertyData.address}, ${propertyData.zipCode}
- ${propertyData.sqft} sqft, ${propertyData.bedrooms} bed, ${propertyData.bathrooms} bath, built ${propertyData.yearBuilt || "unknown"}

Renovation type: ${renovationType}

Generate a realistic, itemized estimate. Respond ONLY with JSON:
{
  "items": [
    {
      "category": "Category Name",
      "description": "Specific work item",
      "materialCost": 100,
      "laborCost": 50,
      "quantity": 10,
      "unit": "sqft"
    }
  ],
  "reasoning": "Professional assessment and recommendations"
}

Use realistic base costs (before regional adjustment). Include 5-15 line items depending on scope.`;

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: prompt },
      ],
      temperature: 0,
      response_format: { type: "json_object" },
    });

    const raw = response.choices[0]?.message?.content || "{}";
    return JSON.parse(raw) as RenovationScope;
  } catch (err) {
    logger.error({ err }, "Demo estimate generation failed");
    throw new Error("Failed to generate demo estimate");
  }
}
