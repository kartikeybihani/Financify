import { getFinnySuggestions } from "./getFinnySuggestions";

const testContext = `
User spent $920 this month.
Top categories: Food ($320), Shopping ($270), Entertainment ($150).
Saved $80 total. Subscriptions: Netflix, Hulu.
`;

getFinnySuggestions(testContext).then((nudges) => {
  console.log("Finny says:", nudges);
});
