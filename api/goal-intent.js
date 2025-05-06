export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { message } = req.body;
  console.log("Received goal intent message:", message);

  const systemPrompt = `
You are a helpful financial assistant. Extract the financial goal from the following user message.
Return a JSON object like this: 
{ 
  "label": string, 
  "target": number|null, 
  "timeline": { 
    "month": string|null,
    "year": number|null 
  }|null 
}

- "label" is what the goal is for, like "Vacation", "Laptop", or "Emergency Fund"
- "target" is the amount of money to be saved (in USD), or null if not specified
- "timeline" is an object with month and year, or null if not stated. Examples:
  - For "next fall": { "month": "September", "year": 2024 }
  - For "in 6 months": calculate the future date
  - For "2025": { "month": "January", "year": 2025 }
  - For "December": { "month": "December", "year": 2024 }
  - For no timeline: null

Handle relative time expressions like:
- "next summer/fall/winter/spring"
- "in X months/years"
- "by end of year"
- "next year"
- "in a couple months"

For seasonal references, use these months:
- Spring = March
- Summer = June
- Fall/Autumn = September
- Winter = December

For relative dates:
- "next month" = add 1 month to current date
- "in X months" = add X months to current date
- "next year" = add 1 year to current date
- "in a couple months" = add 2 months to current date
- "in a few months" = add 3 months to current date

Current date: ${new Date().toISOString()}

If you're not sure about a value, return null.

IMPORTANT: Always return a valid timeline object with month and year if any date information is provided in the message. For example:
- If user says "this fall", return { "month": "September", "year": 2024 }
- If user says "next spring", return { "month": "March", "year": 2025 }
- If user says "jan 2026", return { "month": "January", "year": 2026 }
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
          model: "gpt-4",
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: message },
          ],
          temperature: 0.5,
        }),
      }
    );

    const data = await openaiResponse.json();
    const text = data.choices?.[0]?.message?.content || "{}";
    console.log("GPT response:", text);

    const parsed = JSON.parse(text);

    // If we have a year but no month, default to January
    if (parsed.timeline?.year && !parsed.timeline?.month) {
      parsed.timeline.month = "January";
    }

    // If we have a month but no year, use next occurrence of that month
    if (parsed.timeline?.month && !parsed.timeline?.year) {
      const currentYear = new Date().getFullYear();
      const currentMonth = new Date().getMonth(); // 0-11
      const targetMonth = new Date(`${parsed.timeline.month} 1`).getMonth();
      parsed.timeline.year =
        currentMonth >= targetMonth ? currentYear + 1 : currentYear;
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
    };

    console.log("Final response:", goalResponse);
    return res.status(200).json(goalResponse);
  } catch (e) {
    console.error("Error parsing goal intent:", e);
    return res.status(200).json({ label: null, target: null, timeline: null });
  }
}
