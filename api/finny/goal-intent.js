export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { message } = req.body;
  console.log("Received goal intent message:", message);

  // Helper function to parse relative dates
  const parseRelativeDate = (text) => {
    const lower = text.toLowerCase();
    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();

    // Handle "next spring/summer/fall/winter"
    if (lower.includes("next spring"))
      return { month: "March", year: currentYear + 1 };
    if (lower.includes("next summer"))
      return { month: "June", year: currentYear + 1 };
    if (lower.includes("next fall") || lower.includes("next autumn"))
      return { month: "September", year: currentYear + 1 };
    if (lower.includes("next winter"))
      return { month: "December", year: currentYear + 1 };

    // Handle "in X months"
    const monthsMatch = lower.match(/in (\d+) months?/);
    if (monthsMatch) {
      const months = parseInt(monthsMatch[1]);
      const futureDate = new Date(now.setMonth(now.getMonth() + months));
      return {
        month: futureDate.toLocaleString("default", { month: "long" }),
        year: futureDate.getFullYear(),
      };
    }

    // Handle "next month"
    if (lower.includes("next month")) {
      const nextMonth = new Date(now.setMonth(now.getMonth() + 1));
      return {
        month: nextMonth.toLocaleString("default", { month: "long" }),
        year: nextMonth.getFullYear(),
      };
    }

    // Handle "next year"
    if (lower.includes("next year")) {
      return { month: "January", year: currentYear + 1 };
    }

    // Handle specific month and year
    const monthYearMatch = lower.match(
      /(january|february|march|april|may|june|july|august|september|october|november|december)\s+(\d{4})/i
    );
    if (monthYearMatch) {
      return {
        month:
          monthYearMatch[1].charAt(0).toUpperCase() +
          monthYearMatch[1].slice(1),
        year: parseInt(monthYearMatch[2]),
      };
    }

    // Handle just month
    const monthMatch = lower.match(
      /(january|february|march|april|may|june|july|august|september|october|november|december)/i
    );
    if (monthMatch) {
      const month =
        monthMatch[1].charAt(0).toUpperCase() + monthMatch[1].slice(1);
      const monthIndex = new Date(`${month} 1`).getMonth();
      return {
        month,
        year: monthIndex <= currentMonth ? currentYear + 1 : currentYear,
      };
    }

    return null;
  };

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
   - For "next spring": { "month": "March", "year": 2025 }
   - For "in 6 months": calculate future date (e.g., if today is May 2024, return { "month": "November", "year": 2024 })
   - For "December 2025": { "month": "December", "year": 2025 }
   - For "next month": add 1 month to current date
   - For "next year": { "month": "January", "year": 2025 }

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

IMPORTANT: Always return a valid timeline object with month and year if any date information is provided in the message.
For example:
- If user says "next spring", return { "month": "March", "year": 2025 }
- If user says "in 6 months", calculate the exact future date
- If user says "December 2025", return { "month": "December", "year": 2025 }
`;

  try {
    // First try to parse the date directly
    const parsedDate = parseRelativeDate(message);
    if (parsedDate) {
      console.log("Parsed date directly:", parsedDate);
      return res.status(200).json({
        label: null,
        target: null,
        timeline: parsedDate,
        confidence: 0.8,
        context: {
          isDecisionMaking: false,
          isFeasibilityQuestion: false,
          motivation: null,
          concerns: null,
        },
      });
    }

    // If direct parsing fails, use GPT
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
      // Ensure month is a valid month name
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

      if (
        parsed.timeline.month &&
        !validMonths.includes(parsed.timeline.month)
      ) {
        parsed.timeline.month = "January";
      }

      // Ensure year is a valid number
      if (parsed.timeline.year) {
        const year = parseInt(parsed.timeline.year);
        if (isNaN(year) || year < 2024) {
          parsed.timeline.year = new Date().getFullYear();
        } else {
          parsed.timeline.year = year;
        }
      }

      // If we have a year but no month, default to January
      if (parsed.timeline.year && !parsed.timeline.month) {
        parsed.timeline.month = "January";
      }

      // If we have a month but no year, use next occurrence of that month
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
