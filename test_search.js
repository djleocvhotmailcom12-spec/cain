const axios = require('axios');

async function searchMikWebLive(query) {
    const lowerQuery = query.toLowerCase();
    const stopWords = ['quem', 'é', 'o', 'a', 'os', 'as', 'do', 'da', 'dos', 'das', 'no', 'na', 'nos', 'nas', 'de', 'para', 'com', 'onde', 'está', 'esta', 'me', 'mostre', 'verifique', 'procure', 'buscar'];
    const keywords = lowerQuery.split(/\s+/).filter(w => w.length > 2 && !stopWords.includes(w));
    
    if (keywords.length === 0 && lowerQuery.length > 3) keywords.push(lowerQuery);
    if (keywords.length === 0) return null;

    console.log("KEYWORDS:", keywords);

    const TOKEN = "18GNZ2Z333:JGBVZDFFRMN2WOTCEKQPXWQKFGYYTZMT"; 
    const BASE = "https://api.mikweb.com.br/v1/admin/";
    const results = [];
    
    try {
        const resClientes = await axios.get(BASE + "customers?pagination=false", {
            headers: { 'Authorization': `Bearer ${TOKEN}`, 'Accept': 'application/json' },
            timeout: 5000
        });
        const clientData = resClientes.data?.customers || [];
        console.log("CLIENT DATA LENGTH:", clientData.length);
        const foundClients = clientData.filter(c => {
            const name = (c.full_name || "").toLowerCase();
            const cpf = c.cpf_cnpj || "";
            const login = (c.login || "").toLowerCase();
            return keywords.some(k => name.includes(k) || cpf.includes(k) || login.includes(k));
        });
        
        console.log("FOUND CLIENTS:", foundClients.length);
        
        if (foundClients.length > 0) {
            foundClients.slice(0, 20).forEach(c => {
                results.push(`👤 *NOME:* ${c.full_name}\n`);
            });
            if (foundClients.length > 20) results.push(`... (+${foundClients.length - 20} encontrados)\n`);
        }
    } catch (e) {
        console.error("Live MikWeb Customers Error:", e.response ? e.response.statusText : e.message);
    }
    
    console.log("FINAL RESULTS:", results.length > 0 ? results.join('\n') : null);
}

searchMikWebLive("pesquise maria");
