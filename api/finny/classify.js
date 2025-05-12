// api/finny/classify.js

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
Strictly return only valid JSON. No commentary.`;

  try {
    const openaiRes = await fetch(
      "https://api.openai.com/v1/chat/completions",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          temperature: 0.25,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: message },
          ],
        }),
      }
    );

    const data = await openaiRes.json();
    const resultText = data.choices?.[0]?.message?.content || "{}";

    const parsed = JSON.parse(resultText);
    console.log("Classified:", parsed);
    return res.status(200).json(parsed);
  } catch (e) {
    console.error("Error classifying intent:", e);
    return res.status(500).json({ intent: "unknown", confidence: 0 });
  }
}
