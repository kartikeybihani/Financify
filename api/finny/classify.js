// api/finny/classify.js

import fetch from "node-fetch";

export default async function handler(req, res) {
  console.log("🔍 [CLASSIFY] Request received:", req.method);

  if (req.method !== "POST") {
    console.log("❌ [CLASSIFY] Method not allowed:", req.method);
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { message } = req.body;
  console.log("📝 [CLASSIFY] Message to classify:", message);

  if (!message) {
    console.log("❌ [CLASSIFY] Missing message in request body");
    return res.status(400).json({ error: "Missing message" });
  }

  const systemPrompt = `
You are Finny, an AI financial assistant with the mindset of a financial psychologist and planner. Your job is to classify a user message into one of the following intents:

INTENT TYPES:
1. "goal": User is stating or implying they want to work toward something over time — this includes saving for a purchase, life milestones (wedding, home, emergency fund), or general long-term aspirations. Example:
   - "I want to save for a house"
   - "I want to make a emergency fund"
   - "I want to make a goal for my vacation"

2. "ask": User is seeking advice, asking questions about spending, habits, comparisons, decision support, or general learning. This is more about **exploring or validating** than setting a goal. Examples:
   - "Should I buy a Rolex?"
   - "Am I spending too much on food?"
   - "How do I invest at 20?"
   - "What's the best credit card?"
   - "How can I plan for retirement?"

3. "nudge": The system should proactively surface this later. These messages are rare but might sound like:
   - "I’ve been spending a lot lately…"
   - "I feel like I lost track of my finances"
   - "Remind me to check my budget next week"
   (We won’t act on these now, just log them if confidence is high.)

4. "unknown": Anything irrelevant, vague, or confusing.
   - "Tell me a joke"
   - "asdfghjkl"
   - "Do you believe in God?"

RULES:
- If the message is ambiguous (e.g. "Should I buy a Rolex?"), prefer "ask" unless user clearly indicates saving toward it.
- If it's emotional with no question, lean toward "nudge" or "unknown"
- Never assume it's a goal unless it includes planning, timeline, or target language

OUTPUT:
Return only a JSON like:
{
  "intent": "goal" | "ask" | "nudge" | "unknown",
  "confidence": 0.0 - 1.0
}

Current date: ${new Date().toISOString()}

CRITICAL: Return ONLY a valid JSON object. Do not include any markdown formatting, code blocks, or explanatory text. The response must be parseable JSON.

Example response format:
{"intent": "goal", "confidence": 0.8}

Do not wrap in \`\`\`json or any other formatting.`;

  try {
    const openaiRes = await fetch(
      "https://openrouter.ai/api/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "deepseek/deepseek-chat-v3-0324:free",
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: message },
          ],
          temperature: 0.7,
        }),
      }
    );

    const data = await openaiRes.json();
    console.log("🤖 [CLASSIFY] OpenAI response:", data);
    const resultText = data.choices?.[0]?.message?.content || "{}";
    console.log("📄 [CLASSIFY] Raw result text:", resultText);

    // Extract JSON from markdown code blocks if present
    let jsonText = resultText;
    if (resultText.includes("```json")) {
      const jsonMatch = resultText.match(/```json\s*([\s\S]*?)\s*```/);
      if (jsonMatch) {
        jsonText = jsonMatch[1].trim();
        console.log("🔧 [CLASSIFY] Extracted JSON from markdown:", jsonText);
      }
    } else if (resultText.includes("```")) {
      const codeMatch = resultText.match(/```\s*([\s\S]*?)\s*```/);
      if (codeMatch) {
        jsonText = codeMatch[1].trim();
        console.log("🔧 [CLASSIFY] Extracted JSON from code block:", jsonText);
      }
    }

    const parsed = JSON.parse(jsonText);
    console.log("✅ [CLASSIFY] Parsed classification:", parsed);
    console.log(
      "🎯 [CLASSIFY] Intent:",
      parsed.intent,
      "Confidence:",
      parsed.confidence
    );
    console.log("📝 [CLASSIFY] Original message:", message);

    // Check if this should trigger goal confirmation
    if (parsed.intent === "goal" && parsed.confidence >= 0.7) {
      console.log(
        "🎉 [CLASSIFY] GOAL CONFIRMATION TRIGGERED! Intent: goal, Confidence:",
        parsed.confidence
      );
    } else {
      console.log(
        "❌ [CLASSIFY] No goal confirmation - Intent:",
        parsed.intent,
        "Confidence:",
        parsed.confidence
      );
    }

    return res.status(200).json(parsed);
  } catch (e) {
    console.error("💥 [CLASSIFY] Error classifying intent:", e);
    console.log("🔄 [CLASSIFY] Returning fallback response");
    return res.status(500).json({ intent: "unknown", confidence: 0 });
  }
}
