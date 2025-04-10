import { getFinnySuggestions } from "./getFinnySuggestions.js";
import { buildContextFromPlaid } from "./buildContextFromPlaid.js";

export async function runFinnyAdvisor(transactions) {
  const context = buildContextFromPlaid(transactions);
  const nudges = await getFinnySuggestions(context);
  return { context, nudges }; // return both for debugging/display
}
