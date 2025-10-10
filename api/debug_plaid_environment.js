// Debug script to check Plaid environment and get correct institution IDs
import { client } from "../app/plaidClient.js";

// Check what environment variables are set
console.log("🔍 Checking Plaid Environment Configuration...\n");

const PLAID_CLIENT_ID = process.env.PLAID_CLIENT_ID;
const PLAID_SECRET = process.env.PLAID_SECRET;
const PLAID_SECRET_PROD = process.env.PLAID_SECRET_PROD;
const PLAID_ENV = process.env.PLAID_ENV || "sandbox";

console.log("📋 Environment Variables:");
console.log(`PLAID_CLIENT_ID: ${PLAID_CLIENT_ID ? "✅ Set" : "❌ Missing"}`);
console.log(`PLAID_SECRET: ${PLAID_SECRET ? "✅ Set" : "❌ Missing"}`);
console.log(
  `PLAID_SECRET_PROD: ${PLAID_SECRET_PROD ? "✅ Set" : "❌ Missing"}`
);
console.log(`PLAID_ENV: ${PLAID_ENV}`);
console.log("");

// Determine which environment we're using
const isProduction = PLAID_ENV === "production";
console.log(`🎯 Using Environment: ${isProduction ? "PRODUCTION" : "SANDBOX"}`);
console.log(
  `🔑 Using Secret: ${isProduction ? PLAID_SECRET_PROD : PLAID_SECRET} ${
    isProduction
      ? PLAID_SECRET_PROD
        ? "✅ Available"
        : "❌ Missing"
      : PLAID_SECRET
      ? "✅ Available"
      : "❌ Missing"
  }`
);
console.log("");

// List of institutions we want to verify
const institutionsToCheck = [
  "Chase",
  "Bank of America",
  "Wells Fargo",
  "Capital One",
  "American Express",
  "Chime",
  "Discover",
  "Citibank",
];

async function debugInstitutionIds() {
  console.log("🔍 Fetching institution IDs from current environment...\n");

  try {
    // Get all institutions from Plaid
    const response = await client.institutionsGet({
      count: 500,
      offset: 0,
      country_codes: ["US"],
    });

    const institutions = response.data.institutions;
    console.log(
      `📊 Found ${institutions.length} institutions in ${PLAID_ENV} environment\n`
    );

    // Create mapping
    const institutionMapping = {};

    // Function to find institution by name
    function findInstitution(name) {
      return institutions.find(
        (inst) =>
          inst.name.toLowerCase().includes(name.toLowerCase()) ||
          name.toLowerCase().includes(inst.name.toLowerCase())
      );
    }

    // Check each institution
    institutionsToCheck.forEach((institutionName) => {
      const found = findInstitution(institutionName);
      if (found) {
        institutionMapping[institutionName] = found.institution_id;
        console.log(`✅ ${institutionName}: ${found.institution_id}`);
      } else {
        console.log(`❌ ${institutionName}: NOT FOUND`);
      }
    });

    console.log("\n📋 Updated Institution Mapping:");
    console.log(
      "export const PLAID_INSTITUTION_ID_MAP: Record<string, string> = {"
    );

    const constantMapping = {
      chase: institutionMapping["Chase"],
      bank_of_america: institutionMapping["Bank of America"],
      wells_fargo: institutionMapping["Wells Fargo"],
      capital_one: institutionMapping["Capital One"],
      american_express: institutionMapping["American Express"],
      chime: institutionMapping["Chime"],
      discover: institutionMapping["Discover"],
      citibank: institutionMapping["Citibank"],
    };

    Object.entries(constantMapping).forEach(([key, value]) => {
      if (value) {
        console.log(`  ${key}: "${value}",`);
      }
    });

    console.log("};");

    // Test a specific institution ID
    console.log("\n🧪 Testing institution ID validation...");
    const testInstitutionId = institutionMapping["Capital One"];
    if (testInstitutionId) {
      console.log(`Testing with Capital One ID: ${testInstitutionId}`);

      try {
        const testResponse = await client.institutionsGetById({
          institution_id: testInstitutionId,
          country_codes: ["US"],
        });
        console.log(`✅ Institution ID ${testInstitutionId} is VALID`);
        console.log(`   Institution: ${testResponse.data.institution.name}`);
      } catch (error) {
        console.log(`❌ Institution ID ${testInstitutionId} is INVALID`);
        console.log(
          `   Error: ${error.response?.data?.error_message || error.message}`
        );
      }
    }

    console.log(
      "\n🎉 Debug completed! Copy the mapping above to your modal-constants.ts file"
    );
  } catch (error) {
    console.error(
      "❌ Error fetching institutions:",
      error.response?.data || error.message
    );
  }
}

// Run the debug
debugInstitutionIds();
