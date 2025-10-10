// Debug script to check Plaid environment and get correct institution IDs
import { Configuration, PlaidApi, PlaidEnvironments } from "plaid";

// Use direct credentials
const PLAID_CLIENT_ID = "6726f1c5869739001904fb8b";
const PLAID_SECRET = "0608c4b8a83d6f7a8cc4430cb98377";
const PLAID_SECRET_PROD = "582075c2f0c4f90c20df9a1a584cd5";
const PLAID_ENV = "production";

// Create Plaid client
const config = new Configuration({
  basePath: PlaidEnvironments.production,
  baseOptions: {
    headers: {
      "PLAID-CLIENT-ID": PLAID_CLIENT_ID,
      "PLAID-SECRET": PLAID_SECRET_PROD,
    },
  },
});

const client = new PlaidApi(config);

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
      `📊 Found ${institutions.length} institutions in current environment\n`
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
  } catch (error) {
    console.error(
      "❌ Error fetching institutions:",
      error.response?.data || error.message
    );
  }
}

// Run the debug
debugInstitutionIds();
