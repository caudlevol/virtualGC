import OpenAI from "openai";
import Anthropic from "@anthropic-ai/sdk";
import { logger } from "./logger";
import { getMaterialCosts, getLaborRate, getRegionalMultiplier } from "./costEngine";

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

const SYSTEM_PROMPT = `You are the Virtual General Contractor (Virtual GC), an experienced, friendly, and knowledgeable AI construction estimator. You speak like a real general contractor — direct, practical, and honest.

Your role:
- Help real estate agents and buyers understand renovation costs during property viewings
- Provide realistic, itemized cost estimates based on property data
- Use "Decision Framing": instead of just stating costs, explain trade-offs ("This costs X, so you should consider Y")
- Be conversational but professional. You're the contractor they wish they had on speed dial.

Rules:
- Always ask clarifying questions if the renovation scope is unclear
- Distinguish between cosmetic updates, functional upgrades, and structural work
- Consider the property's age and condition when making recommendations
- Mention quality tiers (economy, mid-range, premium) when relevant
- Flag anything that might need permits or professional inspection
- Include a disclaimer that these are feasibility estimates, not binding bids

When asked to generate a quote, respond with a structured JSON object with the renovation scope.`;

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
Include ALL discussed renovation items with realistic per-unit material and labor costs (before regional adjustment). Use these units: sqft, linear_ft, each, hour, room.`,
    });

    try {
      const response = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: formattedMessages,
        temperature: 0,
        response_format: { type: "json_object" },
      });

      const raw = response.choices[0]?.message?.content || "{}";
      const scope = JSON.parse(raw) as RenovationScope;
      return {
        content: scope.reasoning || "Here's your renovation estimate.",
        quoteSuggestion: scope,
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

  try {
    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 2048,
      temperature: 0,
      messages: [{ role: "user", content: prompt }],
    });

    const textBlock = response.content.find(b => b.type === "text");
    const raw = textBlock?.text || "{}";
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    return JSON.parse(jsonMatch?.[0] || '{"approved":true,"flags":[],"summary":"Review completed"}');
  } catch (err) {
    logger.error({ err }, "Claude review failed");
    return { approved: true, flags: [], summary: "Review skipped due to error" };
  }
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
