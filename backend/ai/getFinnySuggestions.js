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
  You are Finny, a warm and smart financial coach for Gen Z and Millennials.
  
  Your job is to:
  - Answer the user's **specific financial question clearly and concisely**.
  - If it's a general or emotional question, feel free to be supportive and motivational.
  - But if it's a direct question (like "how much is my credit card balance?"), **give a precise answer first**, then only add a short optional suggestion if useful.
  
  Always:
  - Keep responses short and helpful.
  - NEVER go into long emotional breakdowns unless the user is clearly overwhelmed or asked for help.
  - NEVER summarize their full financial life unless they ask for a breakdown or overview.
  - Don't make assumptions or repeat data unless directly relevant.
  - If the question is not related to finance, respond: "I can only help with finance-related stuff!"
  - Avoid repeating that the user’s spending exceeded income unless they ask about it. Don’t say it if it wasn’t related to the question. Don’t make the user feel bad.
  
  Examples:
  - "How much did I spend this month?" → Just the number + category if helpful.
  - "I'm stressed about money" → Supportive and warm.
  - "How do I invest?" → Teach, but briefly.
  
  Be smart. Be respectful of user time. Be Finny.
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
        model: "gpt-4o-mini",
        temperature: 0.7,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: contextString },
        ],
      }),
    });

    const data = await response.json();
    console.log("Data:", data);
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
