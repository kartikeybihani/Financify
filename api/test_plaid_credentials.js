// Test script to verify Plaid credentials in deployed environment
import { Configuration, PlaidApi, PlaidEnvironments } from "plaid";

// Test with direct credentials first
const PLAID_CLIENT_ID = "6726f1c5869739001904fb8b";
const PLAID_SECRET_PROD = "582075c2f0c4f90c20df9a1a584cd5";

console.log("🧪 Testing Plaid credentials...\n");

// Test 1: Direct credentials
console.log("Test 1: Direct credentials");
const directConfig = new Configuration({
  basePath: PlaidEnvironments.production,
  baseOptions: {
    headers: {
      "PLAID-CLIENT-ID": PLAID_CLIENT_ID,
      "PLAID-SECRET": PLAID_SECRET_PROD,
    },
  },
});

const directClient = new PlaidApi(directConfig);

try {
  const response = await directClient.institutionsGet({
    count: 10,
    offset: 0,
    country_codes: ["US"],
  });
  console.log("✅ Direct credentials work!");
  console.log(`Found ${response.data.institutions.length} institutions`);

  // Test specific institution ID
  const capitalOneId = "ins_128026";
  const testResponse = await directClient.institutionsGetById({
    institution_id: capitalOneId,
    country_codes: ["US"],
  });
  console.log(`✅ Capital One ID ${capitalOneId} is VALID`);
  console.log(`   Institution: ${testResponse.data.institution.name}`);
} catch (error) {
  console.log(
    "❌ Direct credentials failed:",
    error.response?.data?.error_message || error.message
  );
}

console.log("\n" + "=".repeat(50) + "\n");

// Test 2: Environment variables
console.log("Test 2: Environment variables");
console.log("Environment Variables:");
console.log(`PLAID_CLIENT_ID: ${PLAID_CLIENT_ID ? "✅ Set" : "❌ Missing"}`);
console.log(`PLAID_SECRET: ${PLAID_SECRET_PROD ? "✅ Set" : "❌ Missing"}`);
console.log(`PLAID_ENV: "production"`);

if (PLAID_CLIENT_ID && PLAID_SECRET_PROD) {
  const envConfig = new Configuration({
    basePath: PlaidEnvironments.production,
    baseOptions: {
      headers: {
        "PLAID-CLIENT-ID": process.env.PLAID_CLIENT_ID,
        "PLAID-SECRET": process.env.PLAID_SECRET_PROD,
      },
    },
  });

  const envClient = new PlaidApi(envConfig);

  try {
    const response = await envClient.institutionsGet({
      count: 10,
      offset: 0,
      country_codes: ["US"],
    });
    console.log("✅ Environment variables work!");
    console.log(`Found ${response.data.institutions.length} institutions`);
  } catch (error) {
    console.log(
      "❌ Environment variables failed:",
      error.response?.data?.error_message || error.message
    );
  }
} else {
  console.log("❌ Environment variables not set properly");
}
