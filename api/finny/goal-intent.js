export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { message } = req.body;
  console.log("Received goal intent message:", message);

  const systemPrompt = `
You are a financial psychologist and planning expert. Analyze the user's message to extract their financial goal and underlying motivations.
Return a JSON object like this: 
{ 
  "label": string, 
  "target": number|null, 
  "timeline": { 
    "month": string|null,
    "year": number|null 
  }|null,
  "confidence": number,
  "context": {
    "isDecisionMaking": boolean,
    "isFeasibilityQuestion": boolean,
    "motivation": string|null,
    "concerns": string[]|null
  }
}

Guidelines:
1. Goal Extraction:
   - "label": What they want to achieve (e.g., "Vacation", "Laptop")
   - "target": Amount in USD, or null if not specified
   - "timeline": Object with month and year, or null if not stated

2. Context Analysis:
   - "isDecisionMaking": true if user is asking for advice/validation
   - "isFeasibilityQuestion": true if user is questioning affordability
   - "motivation": Primary reason for the goal (if evident)
   - "concerns": Array of potential worries/obstacles mentioned

3. Timeline Handling:
   - For "next fall": { "month": "September", "year": 2024 }
   - For "in 6 months": calculate future date
   - For "2025": { "month": "January", "year": 2025 }
   - For "December": { "month": "December", "year": 2024 }

4. Seasonal References:
   - Spring = March
   - Summer = June
   - Fall/Autumn = September
   - Winter = December

5. Relative Dates:
   - "next month" = add 1 month
   - "in X months" = add X months
   - "next year" = add 1 year
   - "in a couple months" = add 2 months
   - "in a few months" = add 3 months

Current date: ${new Date().toISOString()}

6. Confidence Scoring:
   - 0.9-1.0: Clear goal with specific details
   - 0.7-0.8: Clear goal but missing some details
   - 0.5-0.6: Ambiguous goal or decision-making
   - 0.3-0.4: Unclear intent
   - 0.0-0.2: Not a goal

If uncertain about any value, return null.
`;

  try {
    const openaiResponse = await fetch(
      "https://api.openai.com/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: message },
          ],
          temperature: 0.3,
        }),
      }
    );

    const data = await openaiResponse.json();
    const text = data.choices?.[0]?.message?.content || "{}";
    console.log("GPT response:", text);

    const parsed = JSON.parse(text);

    // Validate and normalize timeline
    if (parsed.timeline) {
      if (parsed.timeline.year && !parsed.timeline.month) {
        parsed.timeline.month = "January";
      }

      if (parsed.timeline.month && !parsed.timeline.year) {
        const currentYear = new Date().getFullYear();
        const currentMonth = new Date().getMonth();
        const targetMonth = new Date(`${parsed.timeline.month} 1`).getMonth();
        parsed.timeline.year =
          currentMonth >= targetMonth ? currentYear + 1 : currentYear;
      }
    }

    // Ensure we return a properly structured response
    const goalResponse = {
      label: parsed.label,
      target: parsed.target,
      timeline: parsed.timeline
        ? {
            month: parsed.timeline.month || "January",
            year: parsed.timeline.year || new Date().getFullYear(),
          }
        : null,
      confidence: parsed.confidence || 0,
      context: {
        isDecisionMaking: parsed.context?.isDecisionMaking || false,
        isFeasibilityQuestion: parsed.context?.isFeasibilityQuestion || false,
        motivation: parsed.context?.motivation || null,
        concerns: parsed.context?.concerns || null,
      },
    };

    console.log("Final response:", goalResponse);
    return res.status(200).json(goalResponse);
  } catch (e) {
    console.error("Error parsing goal intent:", e);
    return res.status(200).json({
      label: null,
      target: null,
      timeline: null,
      confidence: 0,
      context: {
        isDecisionMaking: false,
        isFeasibilityQuestion: false,
        motivation: null,
        concerns: null,
      },
    });
  }
}
