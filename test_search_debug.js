const axios = require('axios');
const fs = require('fs');
const TOKEN = '18GNZ2Z333:JGBVZDFFRMN2WOTCEKQPXWQKFGYYTZMT';
const BASE  = 'https://api.mikweb.com.br/v1/admin';
const h     = { Authorization: 'Bearer ' + TOKEN, Accept: 'application/json' };

async function run() {
    let out = '';

    // 1. Busca por MARCIO
    const r1 = await axios.get(BASE+'/customers?full_name=MARCIO', {headers:h});
    const cs = r1.data.customers || [];
    out += `BUSCA "MARCIO"  → ${cs.length} resultados:\n`;
    cs.forEach(c => out += `  ${c.id} | ${c.full_name}\n`);

    // 2. Busca por GUIDA
    const r2 = await axios.get(BASE+'/customers?full_name=GUIDA', {headers:h});
    const cs2 = r2.data.customers || [];
    out += `\nBUSCA "GUIDA"  → ${cs2.length} resultados:\n`;
    cs2.forEach(c => out += `  ${c.id} | ${c.full_name}\n`);

    // 3. Busca por SOARES
    const r3 = await axios.get(BASE+'/customers?full_name=SOARES', {headers:h});
    const cs3 = r3.data.customers || [];
    out += `\nBUSCA "SOARES" → ${cs3.length} resultados:\n`;
    cs3.forEach(c => out += `  ${c.id} | ${c.full_name}\n`);

    // 4. Campos disponíveis
    out += `\nCAMPOS do cliente: ${Object.keys(cs[0]||{}).join(', ')}\n`;

    fs.writeFileSync('debug_result.txt', out);
    console.log('Salvo em debug_result.txt');
}
run().catch(e => console.error(e.message));
