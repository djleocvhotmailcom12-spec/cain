// --- CONFIGURAÇÃO MIKWEB ---
const MIKWEB_TOKEN = '18GNZ2Z333:JGBVZDFFRMN2WOTCEKQPXWQKFGYYTZMT';
const MIKWEB_BASE = 'https://api.mikweb.com.br/v1/admin';

let pendingVoiceAlerts = []; 
let mikwebChatMessages = [];

const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const fs = require('fs'); 
const path = require('path');
const axios = require('axios');
const os = require('os');
const { exec } = require('child_process');

const CHAT_FILE = path.join(__dirname, 'chat_messages.json');
const CHAT_UPLOAD_DIR = path.join(__dirname, 'uploads');

// --- MIKWEB HELPERS ---
async function mikwebRequest(endpoint, method = 'GET', data = null) {
    try {
        const response = await axios({
            url: `${MIKWEB_BASE}${endpoint}`,
            method,
            headers: {
                'Authorization': `Bearer ${MIKWEB_TOKEN}`,
                'Accept': 'application/json',
                'Content-Type': 'application/json'
            },
            data
        });
        return response.data;
    } catch (error) {
        console.error(`[MIKWEB-API-ERROR] ${method} ${endpoint}:`, error.response ? error.response.status : error.message);
        return null;
    }
}

async function searchMikwebClientDetailed(name) {
    try {
        console.log(`[MIKWEB-SEARCH] Buscando: ${name}`);
        // 1. Search for customer
        const clientRes = await mikwebRequest(`/customers?full_name=${encodeURIComponent(name)}`);
        const client = (clientRes && clientRes.customers && clientRes.customers.length > 0) ? clientRes.customers[0] : null;

        if (!client) return `Lamento senhor, não encontrei nenhum cliente cadastrado no MikWeb com o nome "${name}".`;

        // 2. Search for billings
        const billingsRes = await mikwebRequest(`/billings?customer_id=${client.id}&limit=10`);
        const billings = (billingsRes && billingsRes.billings) ? billingsRes.billings : [];

        let openInvoices = billings.filter(b => b.situation && b.situation.name === 'Aberto');
        let overdueInvoices = openInvoices.filter(b => {
             const dueDate = new Date(b.due_day);
             return dueDate < new Date();
        });

        let response = `Sim senhor, localizei o cadastro de **${client.full_name}**.\n\n`;
        response += `Status do Cliente: ${client.status && client.status.name ? client.status.name : 'Ativo'}\n`;
        
        if (openInvoices.length > 0) {
            response += `Identifiquei **${openInvoices.length} fatura(s) em aberto**.\n`;
            if (overdueInvoices.length > 0) {
                response += `⚠️ Atenção: **${overdueInvoices.length} fatura(s) estão VENCIDAS**.\n`;
            }
            
            // List some details
            response += `\nDetalhamento:\n`;
            openInvoices.slice(0, 3).forEach(b => {
                const date = b.due_day.split('-').reverse().join('/');
                const value = parseFloat(b.value).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
                const isOverdue = new Date(b.due_day) < new Date();
                response += `- Vencimento: ${date} | Valor: ${value}${isOverdue ? ' [VENCIDA]' : ''}\n`;
            });
        } else {
            response += `Não constam faturas em aberto para este cliente no momento. Ele está em dia.`;
        }

        return response;
    } catch (e) {
        console.error('[MIKWEB-DETAILED-SEARCH] Error:', e);
        return "Erro ao processar consulta no MikWeb: " + e.message;
    }
}

async function syncWhatsAppMessages() {
    try {
        console.log('[MIKWEB-SYNC] Iniciando sincronização manual de mensagens SAC/WhatsApp...');
        let allMessages = [];
        const searchRes = await mikwebRequest('/messages/search?limit=10');
        const conversations = (searchRes && searchRes.conversations) ? searchRes.conversations : [];

        for (const conv of conversations) {
            const mRes = await mikwebRequest(`/messages?conversation_id=${conv.id}&limit=5`);
            if (mRes && mRes.messages) {
                for (let m of mRes.messages) {
                    const isIncoming = m.incoming === true || m.sender_type === 'Contact';
                    const senderName = (conv.contact && conv.contact.name) ? conv.contact.name : 'Cliente';
                    
                    let msgObj = {
                        id: 'mik_' + m.id,
                        from: isIncoming ? senderName : 'Suporte MIDNET',
                        text: m.content || '',
                        timestamp: m.created_at,
                        isMikweb: true,
                        mikweb_conv_id: conv.id
                    };

                    if (m.attachments && m.attachments.length > 0) {
                        const att = m.attachments[0];
                        let fileName = att.file_name || `file_${att.id}`;
                        const localPath = await downloadMikwebFile(att.file_url, fileName);
                        if (localPath) {
                            msgObj.file = localPath;
                            msgObj.fileName = fileName;
                            const ext = path.extname(fileName).toLowerCase();
                            if (att.file_type === 'audio' || ['.ogg', '.mp3'].includes(ext)) msgObj.fileType = 'audio';
                            else if (['image','photo','png','jpg','jpeg'].includes(att.file_type) || ['.jpg','.jpeg','.png','.gif'].includes(ext)) msgObj.fileType = 'photo';
                            else if (ext === '.pdf') msgObj.fileType = 'document';
                        }
                    }
                    allMessages.push(msgObj);
                }
            }
        }

        // Sort by date
        allMessages.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
        
        return allMessages;
    } catch (e) {
        console.error('[MIKWEB-SYNC-ERROR]', e);
        return [];
    }
}



async function downloadMikwebFile(url, fileName) {
    if (!url) return null;
    try {
        if (!fs.existsSync(CHAT_UPLOAD_DIR)) fs.mkdirSync(CHAT_UPLOAD_DIR, { recursive: true });
        
        const cleanName = fileName.replace(/[^a-zA-Z0-9.-]/g, '_');
        const localFileName = `${Date.now()}_${cleanName}`;
        const localPath = path.join(CHAT_UPLOAD_DIR, localFileName);
        
        const response = await axios({
            url,
            method: 'GET',
            responseType: 'stream',
            headers: url.includes('mikweb.com.br') ? { 'Authorization': `Bearer ${MIKWEB_TOKEN}` } : {}
        });

        return new Promise((resolve, reject) => {
            const writer = fs.createWriteStream(localPath);
            response.data.pipe(writer);
            writer.on('finish', () => resolve(`uploads/${localFileName}`));
            writer.on('error', (err) => {
                console.error(`[DOWNLOAD-ERROR] ${err.message}`);
                reject(null);
            });
        });
    } catch (e) {
        console.error(`[DOWNLOAD-CRITICAL] ${e.message}`);
        return null;
    }
}

const app = express();
const PORT = 3100;
const KNOWLEDGE_PATH = path.join(__dirname, 'knowledge');

app.use((req, res, next) => {
    console.log(`[REQUEST]: ${req.method} ${req.url}`);
    if (req.method === 'OPTIONS') {
        res.header('Access-Control-Allow-Origin', '*');
        res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, PUT, PATCH, DELETE');
        res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
        return res.sendStatus(200);
    }
    next();
});

app.use(cors());
app.use(bodyParser.json({ limit: '50mb' }));
app.use(bodyParser.urlencoded({ limit: '50mb', extended: true }));
app.use(express.static(__dirname));

const ADMIN_TOKEN = "CAIN_MASTER_TOKEN_2026";

if (!fs.existsSync(KNOWLEDGE_PATH)) {
    fs.mkdirSync(KNOWLEDGE_PATH);
}

// Master Remote Update API
app.post('/admin/update', (req, res) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || authHeader !== `Bearer ${ADMIN_TOKEN}`) {
        return res.status(403).json({ error: "Acesso Negado. Token de mestre inválido." });
    }

    const { targetFile, newContent } = req.body;
    if (!targetFile || !newContent) {
        return res.status(400).json({ error: "Dados incompletos para atualização." });
    }

    // Safety: Only allow files in the root project directory
    const safeName = path.basename(targetFile);
    const filePath = path.join(__dirname, safeName);

    try {
        fs.writeFileSync(filePath, newContent);
        console.log(`[MASTER UPDATE]: ${safeName} atualizado remotamente.`);
        return res.json({ success: true, message: `Arquivo ${safeName} atualizado com sucesso.` });
    } catch (e) {
        console.error("Erro no update remoto:", e);
        return res.status(500).json({ error: "Erro interno ao salvar arquivo." });
    }
});

// Memory-based cache for performance
let memory = {};
let activeClients = new Set();

// Load knowledge from disk
function loadKnowledge() {
    const files = fs.readdirSync(KNOWLEDGE_PATH);
    files.forEach(file => {
        if (file.endsWith('.json')) {
            const content = fs.readFileSync(path.join(KNOWLEDGE_PATH, file), 'utf8');
            const data = JSON.parse(content);
            Object.assign(memory, data);
        }
    });
}
loadKnowledge();

// Save knowledge to disk
function saveKnowledge(key, value) {
    try {

    memory[key.toLowerCase()] = value;
        const safeKey = key.substring(0, 100).replace(/[^a-z0-9]/gi, '_').toLowerCase();
        const filename = `${safeKey}.json`;
    fs.writeFileSync(path.join(KNOWLEDGE_PATH, filename), JSON.stringify({ [key.toLowerCase()]: value }, null, 2));
    console.log(`Conhecimento salvo em disco: ${filename}`);
    } catch (e) {
        console.error("Erro ao salvar conhecimento:", e.message);
    }
}

async function generatePreaching(themeOrRef) {
    // Tenta identificar se é uma referência (ex: Gênesis 1)
    const refMatch = themeOrRef.match(/^(.+?)\s+(\d+)$/i) || themeOrRef.match(/^(.+?)\s+cap[íi]tulo\s+(\d+)$/i);
    
    if (refMatch) {
        const book = refMatch[1].trim();
        const cap = refMatch[2].trim();
        console.log(`Buscando capítulo: ${book} ${cap}`);
        const result = await searchInternet(`${book} ${cap} bíblia versículo principal mensagem`);
        if (result) {
            return `*MINISTRAÇÃO: ${book.toUpperCase()} CAPÍTULO ${cap}*\n\n"Povo de Deus, ouçam o que diz em ${book} ${cap}: ${result.substring(0, 500)}... Que esta sagrada escritura ilumine seu caminho!"`;
        }
    }

    const templates = {
        "fé": { verse: "Hebreus 11:1", msg: "A fé é a certeza do que esperamos e a prova das coisas que não vemos. Mesmo nos momentos de escuridão, sua fé deve ser a luz que guia seus passos. Deus está no controle." },
        "amor": { verse: "1 Coríntios 13:4", msg: "O amor é paciente, o amor é bondoso. Não inveja, não se vangloria, não se orgulha. Que o amor de Cristo transborde em suas ações hoje." },
        "força": { verse: "Filipenses 4:13", msg: "Tudo posso naquele que me fortalece. Quando você se sentir fraco, lembre-se que a força do Senhor se aperfeiçoa na sua fraqueza. Levante a cabeça!" },
        "esperança": { verse: "Jeremias 29:11", msg: "Porque sou eu que conheço os planos que tenho para vocês, diz o Senhor, planos de fazê-los prosperar e não de causar dano, planos de dar a vocês esperança e um futuro." }
    };

    const selected = templates[themeOrRef.toLowerCase()] || { verse: "Salmo 23:1", msg: "O Senhor é o meu pastor; nada me faltará. Em todos os seus caminhos, confie no cuidado divino. Ele te guia para águas tranquilas." };

    return `*PREGAÇÃO: ${themeOrRef.toUpperCase()}*\n\n"Povo de Deus, ouçam a palavra: ${selected.verse}. ${selected.msg} Que esta palavra penetre em seu coração e mude sua vida!"`;
}

function getBibleIndex() {
    return `*ÍNDICE COMPLETO DA BÍBLIA SAGRADA*

--- ANTIGO TESTAMENTO ---
• PENTATEUCO: Gênesis, Êxodo, Levítico, Números, Deuteronômio
• HISTÓRICOS: Josué, Juízes, Rute, 1 e 2 Samuel, 1 e 2 Reis, 1 e 2 Crônicas, Esdras, Neemias, Ester
• POÉTICOS: Jó, Salmos, Provérbios, Eclesiastes, Cânticos
• PROFETAS MAIORES: Isaías, Jeremias, Lamentações, Ezequiel, Daniel
• PROFETAS MENORES: Oseias, Joel, Amós, Obadias, Jonas, Miqueias, Naum, Habacuque, Sofonias, Ageu, Zacarias, Malaquias

--- NOVO TESTAMENTO ---
• EVANGELHOS: Mateus, Marcos, Lucas, João
• HISTÓRIA: Atos dos Apóstolos
• EPÍSTOLAS DE PAULO: Romanos, 1 e 2 Coríntios, Gálatas, Efésios, Filipenses, Colossenses, 1 e 2 Tessalonicenses, 1 e 2 Timóteo, Tito, Filemon
• EPÍSTOLAS GERAIS: Hebreus, Tiago, 1 e 2 Pedro, 1, 2 e 3 João, Judas
• PROFECIA: Apocalipse

*Solicite a pregação de qualquer capítulo. Ex: "Cain, pregue Salmo 91" ou "Ministre sobre João 3"*`;
}

async function getWeatherInfo(location) {
    try {
        console.log(`Buscando clima para: ${location}`);
        const query = `previsão do tempo em ${location} hoje agora`;
        const url = `https://www.google.com/search?q=${encodeURIComponent(query)}`;
        const response = await axios.get(url, { 
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36' },
            timeout: 10000
        });
        
        const html = response.data.toLowerCase();
        
        // Simples detecção de padrões de chuva/tempo
        if (html.includes('chuva') || html.includes('pedra') || html.includes('trovão') || html.includes('tempestade')) {
            return `O satélite detectou alta probabilidade de chuva em ${location}. Mantenha-se protegido.`;
        } else if (html.includes('sol') || html.includes('claro') || html.includes('limpo')) {
            return `O céu em ${location} está limpo e ensolarado segundo os dados atuais.`;
        } else if (html.includes('nublado') || html.includes('coberto')) {
            return `O tempo em ${location} está nublado, com chances moderadas de mudanças climáticas.`;
        }
        
        return `Estou monitorando as condições em ${location}. O clima parece estável no momento.`;
    } catch (e) {
        console.error("Erro clima:", e);
        return "Não foi possível conectar aos satélites meteorológicos no momento.";
    }
}

async function searchWikipedia(query) {
    try {
        console.log(`Tentativa Wikipedia: ${query}`);
        // Use Wikipedia REST API for summaries
        const lang = 'pt';
        const endpoint = `https://${lang}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(query.replace(/ /g, '_'))}`;
        
        const response = await axios.get(endpoint, { 
            headers: { 'User-Agent': 'CAIN-Assistant/1.0 (Contact: leonardo@example.com)' },
            timeout: 10000 
        });
        
        if (response.data && response.data.extract) {
            // Check if it's a disambiguation page (comunmente começam com certas frases em PT)
            if (response.data.type === 'disambiguation' || 
                response.data.extract.includes('pode referir-se a') || 
                response.data.extract.includes('pode referir-se a:') ||
                response.data.extract.length < 50) {
                console.log(`Disambiguation ou resultado curto ignorado: ${query}`);
                return null;
            }
            console.log(`Encontrado via Wikipedia: ${response.data.title}`);
            return response.data.extract;
        }
    } catch (e) {
        // If not found as exact title, try search API
        try {
            const lang = 'pt';
            const searchUrl = `https://${lang}.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query)}&format=json&origin=*`;
            const searchRes = await axios.get(searchUrl, { 
                headers: { 'User-Agent': 'CAIN-Assistant/1.0 (Contact: leonardo@example.com)' },
                timeout: 10000 
            });
            
            if (searchRes.data.query.search.length > 0) {
                const title = searchRes.data.query.search[0].title;
                const summaryUrl = `https://${lang}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title.replace(/ /g, '_'))}`;
                const summaryRes = await axios.get(summaryUrl, { 
                    headers: { 'User-Agent': 'CAIN-Assistant/1.0 (Contact: leonardo@example.com)' },
                    timeout: 10000 
                });
                if (summaryRes.data.extract) {
                    console.log(`Encontrado via Wikipedia Search.`);
                    return summaryRes.data.extract;
                }
            }
        } catch (err) {}
    }
    return null;
}

// Enhanced search with multiple fallbacks
async function searchInternet(query) {
    // Regex melhorada para limpar perguntas comuns em português sem remover o núcleo da pergunta
    const cleanQuery = query
        .replace(/^(?:cain,?\s*)?(?:o que é|quem é|como|me fala sobre|você sabe|define|o que significa|significado de|explica|descrição de)\s+/gi, '')
        .replace(/[?!.*]/g, '')
        .trim();
    
    // Evita queries vazias ou muito curtas (preposições isoladas)
    if (cleanQuery.length < 2) return null;

    const attempts = [
        query,
        cleanQuery
    ].filter((v, i, a) => v && a.indexOf(v) === i);

    for (let currentQuery of attempts) {
        // 1. DuckDuckGo API (Fastest if works)
        try {
            console.log(`Tentativa API DDG: ${currentQuery}`);
            const response = await axios.get(`https://api.duckduckgo.com/?q=${encodeURIComponent(currentQuery)}&format=json&no_html=1&skip_disambig=1`, {
                headers: { 'User-Agent': 'Mozilla/5.0' },
                timeout: 8000
            });
            if (response.data && response.data.AbstractText) return response.data.AbstractText;
        } catch (e) {}

        // 2. Wikipedia (Most reliable for "What is X")
        const wikiResult = await searchWikipedia(currentQuery);
        if (wikiResult) return wikiResult;

        // 3. DuckDuckGo HTML Scraper (Fallback for other queries)
        try {
            console.log(`Tentativa HTML Scraper: ${currentQuery}`);
            const htmlResponse = await axios.get(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(currentQuery)}`, {
                headers: { 
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36'
                },
                timeout: 12000
            });
            const match = htmlResponse.data.match(/class="result__snippet"[^>]*>(.*?)<\/a>/i) || 
                          htmlResponse.data.match(/class="snippet"[^>]*>(.*?)<\/div>/i);
            
            if (match && match[1]) {
                return match[1].replace(/<[^>]*>/g, '').replace(/&amp;/g, '&');
            }
        } catch (error) {}
    }
    return null;
}

            }
        });
        memory = {}; // Reset memory cache
        console.log("SISTEMA WIPED: Conhecimento apagado.");
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.get('/stats', (req, res) => {
    try {
        if (typeof getIntelligenceStats === 'function') {
            res.json(getIntelligenceStats());
        } else {
            const keysCount = Object.keys(memory || {}).length;
            const pct = Math.min(100, Math.floor((keysCount / 500) * 100));
            res.json({ count: keysCount, percentage: pct });
        }
    } catch (e) {
        res.json({ percentage: 0, error: e.message });
    }
});

// Export all knowledge for offline PWA sync
app.get('/knowledge/export', (req, res) => {
    try {
        const exportData = {};
        const files = fs.readdirSync(KNOWLEDGE_PATH);
        files.forEach(file => {
            if (file.endsWith('.json')) {
                const content = fs.readFileSync(path.join(KNOWLEDGE_PATH, file), 'utf8');
                try {
                    const data = JSON.parse(content);
                    Object.assign(exportData, data);
                } catch (e) {}
            }
        });
        console.log(`[SYNC]: Exportando ${Object.keys(exportData).length} tópicos para o PWA.`);
        res.json(exportData);
    } catch (e) {
        res.status(500).json({ error: "Falha ao exportar memória." });
    }
});


app.get('/api/chat/history', async (req, res) => {
    const user = req.query.user ? req.query.user.toUpperCase() : null;
    if (user !== 'MIDNET') return res.json({ alerts: [] });
    try {
        let historyAlerts = [];
        const searchRes = await axios.get(`${MIKWEB_BASE}/messages/search?limit=15`, { headers: { 'Authorization': `Bearer ${MIKWEB_TOKEN}`, 'Accept': 'application/json' }});
        let convs = (searchRes.data && searchRes.data.conversations) ? searchRes.data.conversations : [];
        const uniqueConvs = Array.from(new Map(convs.map(c => [c.id, c])).values());
        
        for (const conv of uniqueConvs) {
            const mRes = await axios.get(`${MIKWEB_BASE}/messages?conversation_id=${conv.id}`, { headers: { 'Authorization': `Bearer ${MIKWEB_TOKEN}`, 'Accept': 'application/json' }});
            if (mRes.data && mRes.data.messages) {
                for (let m of mRes.data.messages) {
                    const isIncoming = m.incoming === true || m.sender_type === 'Contact';
                    if (isIncoming && !m.automatic) {
                        const senderName = (conv.contact && conv.contact.name) ? conv.contact.name : 'Cliente';
                        let alertObj = { isSac: true, senderName: senderName, fileType: 'text', fileUrl: null, textContent: m.content || '' };
                        
                        if (m.attachments && m.attachments.length > 0) {
                            const att = m.attachments[0];
                            let fileName = att.file_name || `history_file_${att.id}`;
                            const ext = path.extname(fileName).toLowerCase();
                            if (att.file_type === 'audio' || ['.ogg', '.mp3'].includes(ext)) alertObj.fileType = 'audio';
                            else if (['image','photo','png','jpg','jpeg'].includes(att.file_type) || ['.jpg','.jpeg','.png','.gif'].includes(ext)) alertObj.fileType = 'photo';
                            else if (ext === '.pdf') alertObj.fileType = 'document';
                            
                            const localPath = await downloadMikwebFile(att.file_url, fileName);
                            if (localPath) alertObj.fileUrl = `http://181.224.24.70:3100/${localPath}`;
                        }
                        historyAlerts.push(alertObj);
                    }
                }
            }
        }
        res.json({ alerts: historyAlerts.slice(-30) }); 
    } catch(e) { res.status(500).json({ error: e.message }); }
});


app.get('/api/chat/recent', async (req, res) => {
    const user = req.query.user ? req.query.user.toUpperCase() : null;
    if (user !== 'MIDNET') return res.json({ alerts: [] });
    try {
        let historyAlerts = [];
        const searchRes = await axios.get(`${MIKWEB_BASE}/messages/search?limit=25`, { headers: { 'Authorization': `Bearer ${MIKWEB_TOKEN}`, 'Accept': 'application/json' }});
        let convs = (searchRes.data && searchRes.data.conversations) ? searchRes.data.conversations : [];
        const uniqueConvs = Array.from(new Map(convs.map(c => [c.id, c])).values());
        
        for (const conv of uniqueConvs) {
            const mRes = await axios.get(`${MIKWEB_BASE}/messages?conversation_id=${conv.id}`, { headers: { 'Authorization': `Bearer ${MIKWEB_TOKEN}`, 'Accept': 'application/json' }});
            if (mRes.data && mRes.data.messages) {
                for (let m of mRes.data.messages) {
                    const isIncoming = m.incoming === true || m.sender_type === 'Contact';
                    if (isIncoming && !m.automatic) {
                        const senderName = (conv.contact && conv.contact.name ? conv.contact.name : 'Cliente');
                        let alertObj = { isSac: true, senderName: senderName, fileType: 'text', fileUrl: null, textContent: m.content || '' };
                        
                        if (m.attachments && m.attachments.length > 0) {
                            const att = m.attachments[0];
                            let fileName = att.file_name || `history_file_${att.id}`;
                            const ext = path.extname(fileName).toLowerCase();
                            if (att.file_type === 'audio' || ['.ogg', '.mp3'].includes(ext)) alertObj.fileType = 'audio';
                            else if (['image','photo','png','jpg','jpeg'].includes(att.file_type) || ['.jpg','.jpeg','.png','.gif'].includes(ext)) alertObj.fileType = 'photo';
                            else if (ext === '.pdf') alertObj.fileType = 'document';
                            
                            const localPath = await downloadMikwebFile(att.file_url, fileName);
                            if (localPath) alertObj.fileUrl = `http://181.224.24.70:3100/${localPath}`;
                        }
                        if (alertObj.textContent || alertObj.fileUrl) {
                            historyAlerts.push(alertObj);
                        }
                    }
                }
            }
        }
        res.json({ alerts: historyAlerts.slice(-15) }); 
    } catch(e) { res.status(500).json({ error: e.message }); }
});


app.get('/api/events/poll', (req, res) => {
    const user = req.query.user ? req.query.user.toUpperCase() : null;
    if (user !== 'MIDNET') return res.json({ alerts: [] });
    if (typeof pendingVoiceAlerts === 'undefined') return res.json({ alerts: [] });
    if (pendingVoiceAlerts.length > 50) pendingVoiceAlerts = pendingVoiceAlerts.slice(-50);
    let alerts = [...pendingVoiceAlerts];
    pendingVoiceAlerts = [];
    res.json({ alerts });
});

app.post('/clear_chat', (req, res) => {
    const user = req.body.user ? req.body.user.toUpperCase() : null;
    if (user !== 'MIDNET') return res.status(403).json({ error: 'Acesso Negado: Apenas a conta MIDNET pode apagar.' });
    try { 
        mikwebChatMessages = []; 
        if(typeof pendingVoiceAlerts !== 'undefined') pendingVoiceAlerts = []; 
        if (fs.existsSync(CHAT_FILE)) fs.writeFileSync(CHAT_FILE, JSON.stringify([])); 
        if (fs.existsSync(CHAT_UPLOAD_DIR)) { 
            const files = fs.readdirSync(CHAT_UPLOAD_DIR); 
            files.forEach(f => { try { fs.unlinkSync(path.join(CHAT_UPLOAD_DIR, f)); } catch(e){} }); 
        } 
        res.json({ success: true }); 
    } catch (e) { 
        res.status(500).json({ error: e.message }); 
    }
});

app.listen(PORT, '0.0.0.0', () => {
    const os = require('os');
    const networkInterfaces = os.networkInterfaces();
    let localIP = 'localhost';
    
    for (const name of Object.keys(networkInterfaces)) {
        for (const net of networkInterfaces[name]) {
            if (net.family === 'IPv4' && !net.internal) {
                localIP = net.address;
                break;
            }
        }
    }

    console.log(`=========================================`);
    console.log(`SERVIDOR CAIN v2.5 ATIVADO`);
    console.log(`Acesse local: http://localhost:${PORT}`);
    console.log(`Acesse na rede: http://${localIP}:${PORT}`);
    console.log(`MODO: Auto-Aprendizado Ativo`);
    console.log(`=========================================`);
});
