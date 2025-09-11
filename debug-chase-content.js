const fetch = require('node-fetch');

async function checkChaseContent() {
  try {
    console.log('🔍 Fetching Chase website content...');
    const response = await fetch('https://creditcards.chase.com/', {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; FinancifyBot/1.0)",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
    });
    
    const html = await response.text();
    console.log(`📄 Content length: ${html.length} characters`);
    
    // Check for HDFC mentions
    const hdfcMatches = html.match(/hdfc/gi);
    console.log(`🔍 HDFC mentions found: ${hdfcMatches ? hdfcMatches.length : 0}`);
    
    // Check for Regalia mentions
    const regaliaMatches = html.match(/regalia/gi);
    console.log(`🔍 Regalia mentions found: ${regaliaMatches ? regaliaMatches.length : 0}`);
    
    // Check for India mentions
    const indiaMatches = html.match(/india/gi);
    console.log(`🔍 India mentions found: ${indiaMatches ? indiaMatches.length : 0}`);
    
    // Check for international/global mentions
    const internationalMatches = html.match(/international|global|worldwide/gi);
    console.log(`🔍 International/Global mentions found: ${internationalMatches ? internationalMatches.length : 0}`);
    
    // Show a sample of the content
    console.log('\n📝 Sample content (first 500 chars):');
    console.log(html.substring(0, 500));
    
    // Look for any credit card partnerships or international content
    const partnershipMatches = html.match(/partnership|partner|alliance/gi);
    console.log(`\n🤝 Partnership mentions found: ${partnershipMatches ? partnershipMatches.length : 0}`);
    
  } catch (error) {
    console.error('❌ Error:', error);
  }
}

checkChaseContent();
