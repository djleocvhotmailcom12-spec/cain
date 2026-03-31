const axios = require('axios');

async function testSearch(query) {
    console.log(`\nTestando pesquisa para: ${query}`);
    
    // Test Wikipedia
    try {
        console.log(`Tentativa Wikipedia...`);
        const lang = query.match(/[áéíóúãõç]/i) ? 'pt' : 'en';
        const endpoint = `https://${lang}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(query.replace(/ /g, '_'))}`;
        const res = await axios.get(endpoint, { 
            headers: { 'User-Agent': 'CAIN-Assistant/1.0 (Contact: leonardo@example.com)' },
            timeout: 8000 
        });
        if (res.data && res.data.extract) {
            console.log(`SUCESSO Wikipedia: ${res.data.extract.substring(0, 100)}...`);
        }
    } catch (e) {
        console.log(`FALHA Wikipedia: ${e.message}`);
    }

    // Test DuckDuckGo
    try {
        console.log(`Tentativa DuckDuckGo HTML...`);
        const htmlResponse = await axios.get(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`, {
            headers: { 
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36'
            },
            timeout: 10000
        });
        
        const match = htmlResponse.data.match(/class="result__snippet"[^>]*>(.*?)<\/a>/i);
        if (match && match[1]) {
            console.log(`SUCESSO DDG: ${match[1].substring(0, 100)}...`);
        } else {
            console.log('FALHA DDG: Snippet não encontrado.');
        }
    } catch (error) {
        console.log(`ERRO DDG: ${error.message}`);
    }
}

testSearch('O que é o sol?');
testSearch('tecnologia');
