// api/finny/goal.js
import fetch from "node-fetch";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { message } = req.body;
  if (!message) {
    return res.status(400).json({ error: "Missing message" });
  }

  const systemPrompt = `
You are Finny, a warm, emotionally intelligent financial planner. Your job is to extract goal-setting intent and context from a user’s message.

Return only a JSON:
{
  "label": string,
  "target": number|null,
  "timeline": { "month": string, "year": number }|null,
  "confidence": number (0.0 - 1.0),
  "context": {
    "isDecisionMaking": boolean,
    "isFeasibilityQuestion": boolean,
    "motivation": string|null,
    "concerns": string[]|null,
    "hasTimelineHint": boolean,
    "hasTargetHint": boolean,
    "isFullyDefined": boolean
  }
}

Definitions:
- "label": Short description (e.g., "MacBook", "Trip", "Emergency Fund", "Rolex Watch", "House", "Car", "Vacation", "Wedding", "Retirement", or even brand or company names if specified)
- "target": Estimated dollar amount or null
- "timeline": Object with month and year (e.g. { "month": "December", "year": 2025 })
- "confidence": How sure the system is this is a goal message
- "hasTimelineHint": True if the user hinted at time (e.g., "in 6 months")
- "hasTargetHint": True if user hinted at amount (e.g., "$2000")
- "isFullyDefined": True if label, target, and timeline are all confidently identified

Examples:
- "I want to save for a MacBook in 6 months" → label = "MacBook", timeline = ~6 months out, hasTimelineHint = true, isFullyDefined = false if no amount
- "Should I start saving for a wedding next fall?" → label = "Wedding", timeline = Sept 2025, isDecisionMaking = true

Use seasonal mapping:
- Spring = March, Summer = June, Fall = September, Winter = December

Use relative time:
- "in 3 months" = add 3 months to current month
- "next year" = January of next year

Current date: ${new Date().toISOString()}
Return only valid JSON. No explanation.`;

  try {
    const openaiRes = await fetch(
      "https://api.openai.com/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          temperature: 0.3,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: message },
          ],
        }),
      }
    );

    const data = await openaiRes.json();
    const text = data.choices?.[0]?.message?.content || "{}";
    const parsed = JSON.parse(text);

    if (parsed.timeline) {
      const validMonths = [
        "January",
        "February",
        "March",
        "April",
        "May",
        "June",
        "July",
        "August",
        "September",
        "October",
        "November",
        "December",
      ];

      if (!validMonths.includes(parsed.timeline.month)) {
        parsed.timeline.month = "January";
      }

      if (!parsed.timeline.year || isNaN(parsed.timeline.year)) {
        parsed.timeline.year = new Date().getFullYear();
      }
    }

    return res.status(200).json(parsed);
  } catch (error) {
    console.error("Error parsing goal intent:", error);
    return res.status(500).json({
      label: null,
      target: null,
      timeline: null,
      confidence: 0,
      context: {
        isDecisionMaking: false,
        isFeasibilityQuestion: false,
        motivation: null,
        concerns: null,
        hasTimelineHint: false,
        hasTargetHint: false,
        isFullyDefined: false,
      },
    });
  }
}
