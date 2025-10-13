#!/usr/bin/env node

/**
 * Script to verify and update Plaid institution IDs
 * This script fetches the current institution list from Plaid and helps verify our mappings
 */

import https from "https";

// Configuration - you'll need to set these environment variables
const PLAID_CLIENT_ID = "6726f1c5869739001904fb8b";
const PLAID_SECRET = "582075c2f0c4f90c20df9a1a584cd5";
const PLAID_ENV = "production";

if (!PLAID_CLIENT_ID || !PLAID_SECRET) {
  console.error("❌ Missing required environment variables:");
  console.error("   PLAID_CLIENT_ID and PLAID_SECRET must be set");
  process.exit(1);
}

const PLAID_URL =
  PLAID_ENV === "production"
    ? "https://production.plaid.com"
    : "https://sandbox.plaid.com";

// Our current institution mappings
const CURRENT_MAPPINGS = {
  chase: "ins_56",
  bank_of_america: "ins_100866",
  wells_fargo: "ins_127991",
  capital_one: "ins_128026",
  american_express: "ins_10",
  chime: "ins_35",
  discover: "ins_116949",
  citibank: "ins_5",
};

// Institution names to search for
const INSTITUTION_NAMES = [
  "Capital One",
  "Chase",
  "Bank of America",
  "Wells Fargo",
  "American Express",
  "Chime",
  "Discover",
  "Citibank",
];

function makePlaidRequest(path, data) {
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify(data);

    const options = {
      hostname: PLAID_URL.replace("https://", ""),
      port: 443,
      path: path,
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(postData),
      },
    };

    const req = https.request(options, (res) => {
      let responseData = "";

      res.on("data", (chunk) => {
        responseData += chunk;
      });

      res.on("end", () => {
        try {
          const jsonData = JSON.parse(responseData);
          if (res.statusCode === 200) {
            resolve(jsonData);
          } else {
            reject(
              new Error(
                `HTTP ${res.statusCode}: ${
                  jsonData.error_message || "Unknown error"
                }`
              )
            );
          }
        } catch (e) {
          reject(new Error(`Failed to parse response: ${e.message}`));
        }
      });
    });

    req.on("error", (e) => {
      reject(e);
    });

    req.write(postData);
    req.end();
  });
}

async function fetchInstitutions() {
  console.log(`🔍 Fetching institutions from ${PLAID_ENV} environment...`);

  try {
    const response = await makePlaidRequest("/institutions/get", {
      client_id: PLAID_CLIENT_ID,
      secret: PLAID_SECRET,
      country_codes: ["US"],
      count: 500,
      offset: 0,
    });

    return response.institutions;
  } catch (error) {
    console.error("❌ Failed to fetch institutions:", error.message);
    throw error;
  }
}

function findInstitutionByName(institutions, searchName) {
  return institutions.filter(
    (inst) =>
      inst.name.toLowerCase().includes(searchName.toLowerCase()) ||
      searchName.toLowerCase().includes(inst.name.toLowerCase())
  );
}

async function verifyInstitutionIds() {
  try {
    const institutions = await fetchInstitutions();
    console.log(`✅ Fetched ${institutions.length} institutions\n`);

    console.log("🏦 Institution ID Verification Results:");
    console.log("=====================================");

    let allValid = true;

    for (const [mappingKey, currentId] of Object.entries(CURRENT_MAPPINGS)) {
      const searchName =
        INSTITUTION_NAMES.find((name) =>
          mappingKey.includes(
            name.toLowerCase().replace(/\s+/g, "_").replace("&", "")
          )
        ) || mappingKey;

      const found = institutions.find(
        (inst) => inst.institution_id === currentId
      );

      if (found) {
        console.log(`✅ ${mappingKey}: ${currentId} → ${found.name}`);
      } else {
        console.log(`❌ ${mappingKey}: ${currentId} → NOT FOUND`);
        allValid = false;

        // Try to find alternative
        const alternatives = findInstitutionByName(institutions, searchName);
        if (alternatives.length > 0) {
          console.log(`   🔍 Possible alternatives:`);
          alternatives.forEach((alt) => {
            console.log(`      ${alt.institution_id} → ${alt.name}`);
          });
        }
      }
    }

    console.log("\n🔍 Searching for correct institution IDs:");
    console.log("==========================================");

    for (const institutionName of INSTITUTION_NAMES) {
      const matches = findInstitutionByName(institutions, institutionName);
      if (matches.length > 0) {
        console.log(`\n✅ ${institutionName}:`);
        matches.forEach((match) => {
          console.log(`   ${match.institution_id} → ${match.name}`);
        });
      } else {
        console.log(`\n❌ ${institutionName}: NOT FOUND`);
      }
    }

    console.log("\n📋 Summary:");
    if (allValid) {
      console.log("✅ All institution IDs are valid!");
    } else {
      console.log("❌ Some institution IDs need to be updated.");
      console.log("\n💡 To fix this:");
      console.log(
        "   1. Update the PLAID_INSTITUTION_ID_MAP in modal-constants.ts"
      );
      console.log("   2. Use the alternative IDs shown above");
      console.log(
        "   3. Make sure institutions are registered in your Plaid Dashboard"
      );
    }
  } catch (error) {
    console.error("❌ Verification failed:", error.message);
    process.exit(1);
  }
}

// Run the verification
if (import.meta.url === `file://${process.argv[1]}`) {
  verifyInstitutionIds();
}

export { verifyInstitutionIds, fetchInstitutions };
