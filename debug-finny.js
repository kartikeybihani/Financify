// Debug script to test the finny API directly
const BASE_URL = "https://financify-rose.vercel.app";

async function testFinnyAPI() {
  console.log("🔍 Testing Finny API directly...");

  const testQueries = [
    "What are the Chase Ultimate card benefits?",
    "What is the 2025 estate tax exemption?",
  ];

  for (const query of testQueries) {
    console.log(`\n🔍 Testing: "${query}"`);

    try {
      const response = await fetch(`${BASE_URL}/api/finny`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "ask_fact_fresh",
          message: query,
          context: { entities: [] },
        }),
      });

      const data = await response.json();
      console.log("Status:", response.status);
      console.log("Response:", JSON.stringify(data, null, 2));
    } catch (error) {
      console.error("Error:", error.message);
    }
  }
}

testFinnyAPI();
