const axios = require('axios');
const fs = require('fs');

const cfg = JSON.parse(fs.readFileSync('./knowledge/midnet/mikweb_config.json', 'utf8'));
const MIKWEB_TOKEN = cfg.MIKWEB_TOKEN;
const MIKWEB_BASE = 'https://api.mikweb.com.br/v1/admin';

(async () => {
    try {
        console.log("Testing /messages/search ...");
        let res1 = await axios.get(`${MIKWEB_BASE}/messages/search?limit=5`, {
            headers: { 'Authorization': `Bearer ${MIKWEB_TOKEN}`, 'Accept': 'application/json' }
        });
        if (res1.data && res1.data.conversations) {
            console.log("search convs:", res1.data.conversations.map(c => c.contact ? c.contact.name : 'Unknown').join(', '));
        }

        console.log("\nTesting /conversations ...");
        let res2 = await axios.get(`${MIKWEB_BASE}/conversations?limit=5`, {
            headers: { 'Authorization': `Bearer ${MIKWEB_TOKEN}`, 'Accept': 'application/json' }
        });
        if (res2.data) {
            // we don't know the format, let's print keys
            console.log("/conversations keys:", Object.keys(res2.data));
            let dataArr = res2.data.conversations || res2.data.data || res2.data;
            if (Array.isArray(dataArr)) {
                console.log("Found array of", dataArr.length);
                if (dataArr.length > 0) {
                    console.log("First item:", Object.keys(dataArr[0]));
                    console.log("Contacts:", dataArr.map(c => c.contact ? c.contact.name : (c.name || 'Unknown')).join(', '));
                }
            }
        }
    } catch(err) {
        console.error(err.response ? err.response.data : err.message);
    }
})();
