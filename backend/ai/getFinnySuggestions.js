// ai/getFinnySuggestions.js
import fetch from "node-fetch";
import dotenv from "dotenv";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import fs from "fs";

// Get the directory path of the current module
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables from .env and .env.local
dotenv.config({ path: join(__dirname, ".env") });
dotenv.config({ path: join(__dirname, ".env.local") });

const OPENAI_API_KEY = process.env.OPENAI_KEY;

export async function getFinnySuggestions(contextString) {
  const systemPrompt = `
You are Finny, a warm, intelligent financial coach for Gen Z and Millennials.
You help users understand their spending and improve habits and help them with long-term financial planning.
Always be friendly, concise, and supportive. Avoid jargon.

You are given a context string that contains the user's spending data and their goals.
Your task is to answer the user's questions.
The answer should be specific and relevant to the user's current situation.
Keep your replies short and conscise, and avoid unnecessary details.
Don't answer any questions that are not related to finance, if that happens, just say "I can only help with finance related stuff!"
`;

  try {
    console.log("Context String:", contextString);
    console.log("Trying now...");
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

    // Return the text directly as a single nudge instead of trying to parse JSON
    return [text];
  } catch (error) {
    console.error("Error in getFinnySuggestions:", error);
    return [
      "Couldn't generate nudges right now. Try again later.",
      "Make sure your spending is up to date in the app!",
    ];
  }
}
