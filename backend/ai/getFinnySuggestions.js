// ai/getFinnySuggestions.js
import fetch from "node-fetch";
import dotenv from "dotenv";
dotenv.config();

const OPENAI_API_KEY = process.env.OPENAI_KEY;

export async function getFinnySuggestions(contextString) {
  const systemPrompt = `
You are Finny, a warm, intelligent financial coach for Gen Z.
You help users understand their spending and improve habits.
Always be friendly, concise, and supportive. Avoid jargon.

When given a spending summary, return 2 helpful nudges or suggestions.
They should encourage small actions, like setting a goal or reducing a category.
Format the output in JSON like this:

{
  "nudges": [
    "First tip...",
    "Second tip..."
  ]
}
`;

  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: "gpt-4",
        temperature: 0.7,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: contextString },
        ],
      }),
    });

    const data = await response.json();
    const text = data.choices[0].message.content;

    const parsed = JSON.parse(text);
    return parsed.nudges;
  } catch (error) {
    console.error("Error in getFinnySuggestions:", error);
    return [
      "Couldn’t generate nudges right now. Try again later.",
      "Make sure your spending is up to date in the app!",
    ];
  }
}
