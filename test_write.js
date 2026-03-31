const fs = require('fs');
const path = require('path');

const KNOWLEDGE_PATH = path.join(__dirname, 'knowledge');
if (!fs.existsSync(KNOWLEDGE_PATH)) {
    console.log('Criando diretório knowledge...');
    fs.mkdirSync(KNOWLEDGE_PATH);
}

function saveKnowledge(key, value) {
    try {
        const filename = `${key.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.json`;
        const filePath = path.join(KNOWLEDGE_PATH, filename);
        fs.writeFileSync(filePath, JSON.stringify({ [key.toLowerCase()]: value }, null, 2));
        console.log(`TESTE SUCESSO: Gravado em ${filePath}`);
    } catch (e) {
        console.log(`TESTE FALHA: ${e.message}`);
    }
}

saveKnowledge('teste', 'funciona');
