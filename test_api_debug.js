const axios = require('axios');

const MIKWEB_TOKEN = '18GNZ2Z333:JGBVZDFFRMN2WOTCEKQPXWQKFGYYTZMT';
const MIKWEB_BASE = 'https://api.mikweb.com.br/v1/admin';

(async () => {
    try {
        console.log("Fetching /messages/search ...");
        let res1 = await axios.get(`${MIKWEB_BASE}/messages/search?limit=10`, {
            headers: { 'Authorization': `Bearer ${MIKWEB_TOKEN}`, 'Accept': 'application/json' }
        });
        if (res1.data && res1.data.conversations) {
            console.log("search convs limit 10:");
            res1.data.conversations.forEach(c => {
                const isInc = c.messages?.[0]?.incoming;
                const mType = c.messages?.[0]?.sender_type;
                console.log(`- Conv ${c.id}: contact: ${c.contact?.name}, isInc: ${isInc}, type: ${mType}`);
            });
        }
        
        console.log("\nFetching /conversations ...");
        let res2 = await axios.get(`${MIKWEB_BASE}/conversations?limit=10`, {
            headers: { 'Authorization': `Bearer ${MIKWEB_TOKEN}`, 'Accept': 'application/json' }
        });
        if (res2.data && res2.data.data) {
            console.log("/conversations list:");
            res2.data.data.forEach(c => {
                console.log(`- Conv ${c.id}: contact: ${c.contact?.name}`);
            });
        }

    } catch(err) {
        console.error(err.response ? err.response.data : err.message);
    }
})();
