
const axios = require('axios');
const MIKWEB_TOKEN = '18GNZ2Z333:JGBVZDFFRMN2WOTCEKQPXWQKFGYYTZMT';
const MIKWEB_BASE = 'https://api.mikweb.com.br/v1/admin';

async function mikwebRequest(endpoint) {
    try {
        const response = await axios({
            url: `${MIKWEB_BASE}${endpoint}`,
            headers: { 'Authorization': `Bearer ${MIKWEB_TOKEN}` }
        });
        return response.data;
    } catch (e) { return null; }
}

async function debugMap() {
    console.log("Checking Billings...");
    const bRes = await mikwebRequest('/billings?limit=50');
    if (!bRes) return console.log("Failed to fetch billings");
    
    const situations = [...new Set(bRes.billings.map(b => b.situation ? b.situation.name : 'N/A'))];
    console.log("Available Situations:", situations);

    const open = bRes.billings.filter(b => b.situation.name !== 'Efetuado'); // Guessing anything not 'Efetuado' is open
    console.log("Count of non-Efetuado billings:", open.length);

    console.log("\nChecking Clients for coords...");
    const cRes = await mikwebRequest('/customers?limit=50');
    const hasCoords = cRes.customers.filter(c => c.latitude && c.longitude);
    console.log("Clients with coords in sample:", hasCoords.length);
    if (hasCoords.length > 0) {
        console.log("Sample coords:", hasCoords[0].full_name, hasCoords[0].latitude, hasCoords[0].longitude);
    }
}

debugMap();
