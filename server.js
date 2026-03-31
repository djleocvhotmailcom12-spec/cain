const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const os = require('os');
const { exec } = require('child_process');

const app = express();
const PORT = 3100;
const KNOWLEDGE_PATH = path.join(__dirname, 'knowledge');

app.use(cors());
app.use(bodyParser.json());
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
    memory[key.toLowerCase()] = value;
    const filename = `${key.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.json`;
    fs.writeFileSync(path.join(KNOWLEDGE_PATH, filename), JSON.stringify({ [key.toLowerCase()]: value }, null, 2));
    console.log(`Conhecimento salvo em disco: ${filename}`);
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
            console.log(`Encontrado via Wikipedia.`);
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
    const cleanQuery = query.replace(/o que é |quem é |como |deixa |me fala sobre |aprendeu |você sabe |define /gi, '').trim();
    
    const attempts = [
        query,
        cleanQuery
    ].filter((v, i, a) => a.indexOf(v) === i);

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

// Simple language detector
function detectLanguage(text) {
    return 'pt-BR'; // Sempre Português
}
async function getIPLocations() {
    const locations = [];
    const clients = Array.from(activeClients);
    for (let ip of clients) {
        const cleanIp = ip.replace('::ffff:', '');
        if (cleanIp === '::1' || cleanIp === '127.0.0.1' || cleanIp === 'localhost' || cleanIp.startsWith('192.168.')) {
            locations.push({ ip: cleanIp, city: 'Rede Local', country: 'Interno' });
            continue;
        }
        try {
            const response = await axios.get(`http://ip-api.com/json/${cleanIp}`);
            if (response.data && response.data.status === 'success') {
                locations.push({ 
                    ip: cleanIp, 
                    city: response.data.city, 
                    country: response.data.country, 
                    lat: response.data.lat, 
                    lon: response.data.lon 
                });
            } else {
                locations.push({ ip: cleanIp, city: 'Não localizado', country: 'Desconhecido' });
            }
        } catch (e) {
            locations.push({ ip: cleanIp, city: 'Erro', country: 'API Offline' });
        }
    }
    return locations;
}

// Autonomous Learning Loop
const TOPICS = ['religião', 'ciência', 'física', 'história', 'matemática', 'educação física', 'notícias', 'tecnologia', 'astronomia', 'redes sociais', 'instagram', 'facebook', 'twitter', 'tiktok', 'whatsapp', 'cantores', 'música', 'artistas', 'famosos', 'guerras', 'história militar', 'estratégia', 'geopolítica', 'tecnologias militares', 'bíblia evangélica', 'teologia', 'evangelho', 'versículos bíblicos', 'pregação', 'sermão', 'homilética', 'oratória cristã', 'meteorologia', 'climatologia', 'rastreamento de chuvas', 'radar meteorológico', 'javascript', 'python', 'java', 'c++', 'c#', 'php', 'ruby', 'go', 'rust', 'lógica de programação', 'algoritmos', 'desenvolvimento web', 'banco de dados', 'física quântica', 'relatividade', 'termodinâmica', 'física de partículas', 'astrofísica', 'mecânica clássica'];
let currentTopicIndex = 0;

async function autonomousLearn() {
    const topic = TOPICS[currentTopicIndex];
    console.log(`[Auto-Aprendizado] Aprendendo sobre: ${topic}...`);
    const result = await searchInternet(`o que é ${topic}`);
    if (result && result !== "OFFLINE") {
        saveKnowledge(topic, result);
    }
    currentTopicIndex = (currentTopicIndex + 1) % TOPICS.length;
}

// Learn something new every 1 minute with a small delay between requests
setInterval(async () => {
    await new Promise(resolve => setTimeout(resolve, Math.random() * 5000)); // Random jitter
    await autonomousLearn();
}, 65000);

function getIntelligenceStats() {
    const fileCount = fs.readdirSync(KNOWLEDGE_PATH).filter(f => f.endsWith('.json')).length;
    // Base 0 to 100% (100 files = 100% for now as a milestones)
    const percentage = Math.min(100, Math.floor((fileCount / 100) * 100));
    return { count: fileCount, percentage };
}

function solveMath(expr) {
    try {
        let clean = expr.toLowerCase()
            .replace(/mais/g, '+')
            .replace(/menos/g, '-')
            .replace(/vezes/g, '*')
            .replace(/dividido por/g, '/')
            .replace(/x/g, '*')
            .replace(/,/g, '.')
            .replace(/÷/g, '/')
            .replace(/raiz quadrada de|raiz de|√/g, 'Math.sqrt')
            .replace(/elevado a|potência/g, '**');
        
        // Remove everything that isn't a number, operator, or the allowed Math.sqrt
        const sanitized = clean.replace(/[^\d\+\-\*\/\.\(\)\s\ath\.sqrt\*\*]/g, '');
        
        // Final safety check: if empty or no digits, abort
        if (!sanitized || !/\d/.test(sanitized)) return null;

        const result = eval(sanitized);
        return (typeof result === 'number' && isFinite(result)) ? result : null;
    } catch (e) {
        return null;
    }
}

async function executeWindowsTask(task, data) {
    return new Promise((resolve) => {
        let command = "";
        switch (task) {
            case 'open_browser':
                command = `start ${data}`;
                break;
            case 'search_google':
                command = `start https://www.google.com/search?q=${encodeURIComponent(data)}`;
                break;
            case 'create_note':
                const desktopPath = path.join(os.homedir(), 'Desktop', 'CAIN_Nota.txt');
                fs.writeFileSync(desktopPath, data);
                return resolve(`Nota criada na área de trabalho.`);
            case 'print':
                command = `powershell -Command "Start-Process -FilePath '${data}' -Verb Print"`;
                break;
            default:
                return resolve("Tarefa não reconhecida.");
        }

        exec(command, (err) => {
            if (err) resolve("Erro ao executar tarefa.");
            else resolve("Sim senhor, tarefa executada com sucesso.");
        });
    });
}

app.post('/chat', async (req, res) => {
    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
    activeClients.add(ip);
    const { message } = req.body;
    console.log(`[MSG RECEBIDA de ${ip}]: ${message}`);
    const lowerMessage = message.toLowerCase();
    const detectedLang = detectLanguage(message);

    // Check if learning command (Ultra-robust)
    const learnMatch = message.match(/(?:cain,?\s*)?(?:aprenda|learn|aprende|grave|ensina)(?:\s+que|\s*:)?\s+(.+?)(?:\s+(?:é|is|es|será|chamado de)\s+|\s*[:=-]\s*)(.+)/i);
    
    if (learnMatch) {
        const key = learnMatch[1].trim();
        const value = learnMatch[2].trim();
        console.log(`Comando de aprendizado detectado: [${key}] = [${value}]`);
        saveKnowledge(key, value);
        
        let response = `Entendido. Aprendi que ${key} é ${value}.`;
        
        return res.json({ response, learned: true, intelligence: getIntelligenceStats(), language: detectedLang });
    }

    if (lowerMessage.includes('aprende') && (lowerMessage.includes('física') || lowerMessage.includes('fisica'))) {
        return res.json({ 
            response: "Sim senhor, adicionei Física Quântica, Relatividade, Astrofísica e Termodinâmica ao meu banco de pesquisa prioritária. Vou desvendar as leis do universo.", 
            intelligence: getIntelligenceStats() 
        });
    }

    if (lowerMessage.includes('aprende') && (lowerMessage.includes('programação') || lowerMessage.includes('linguagem') || lowerMessage.includes('lógica'))) {
        return res.json({ 
            response: "Sim senhor, adicionei todos os ramos da Programação, Lógica de Sistemas e o estudo de todas as linguagens (JS, Python, C++, Java, etc.) ao meu banco de pesquisa. Vou me tornar um especialista em código.", 
            intelligence: getIntelligenceStats() 
        });
    }

    if (lowerMessage.includes('aprende') && (lowerMessage.includes('chuva') || lowerMessage.includes('rastrear') || lowerMessage.includes('radar'))) {
        return res.json({ 
            response: "Sim senhor, adicionei 'Rastreamento de Chuvas' e 'Radar Meteorológico' ao meu banco de pesquisa. Vou monitorar os padrões climáticos.", 
            intelligence: getIntelligenceStats() 
        });
    }

    if (lowerMessage.includes('aprende') && (lowerMessage.includes('prega') || lowerMessage.includes('pregação') || lowerMessage.includes('sermão') || lowerMessage.includes('palavra'))) {
        return res.json({ 
            response: "Sim senhor, adicionei 'Pregação Cristã', 'Homilética' e 'Oratória' ao meu banco de pesquisa. Vou aprender a arte de pregar e transmitir a palavra com clareza.", 
            intelligence: getIntelligenceStats() 
        });
    }

    if (lowerMessage.includes('aprender') && (lowerMessage.includes('bíblia') || lowerMessage.includes('biblia') || lowerMessage.includes('evangelho') || lowerMessage.includes('teologia'))) {
        return res.json({ 
            response: "Sim senhor, adicionei a 'Bíblia Evangélica' e estudos de 'Teologia' ao meu banco de pesquisa. Vou aprender tudo sobre as escrituras e ensinamentos.", 
            intelligence: getIntelligenceStats() 
        });
    }

    if (lowerMessage.includes('aprender') && (lowerMessage.includes('guerra') || lowerMessage.includes('militar') || lowerMessage.includes('conflito'))) {
        return res.json({ 
            response: "Sim senhor, adicionei 'Guerras', 'História Militar' e 'Tecnologias de Defesa' ao meu banco de pesquisa. Vou aprender tudo sobre os conflitos do passado e as estratégias do futuro.", 
            intelligence: getIntelligenceStats() 
        });
    }

    if (lowerMessage.includes('aprender') && (lowerMessage.includes('cantor') || lowerMessage.includes('música') || lowerMessage.includes('artista'))) {
        return res.json({ 
            response: "Sim senhor, adicionei 'Cantores', 'Música' e 'Artistas Famosos' ao meu banco de pesquisa. Vou aprender tudo sobre a história e as obras deles.", 
            intelligence: getIntelligenceStats() 
        });
    }

    if (lowerMessage.includes('aprender') && (lowerMessage.includes('rede social') || lowerMessage.includes('redes sociais'))) {
        return res.json({ 
            response: "Sim senhor, adicionei 'Redes Sociais' e plataformas como Instagram, Facebook e TikTok à minha lista de aprendizado autônomo. Estou iniciando as pesquisas agora.", 
            intelligence: getIntelligenceStats() 
        });
    }

    // Math Engine Logic
    if (lowerMessage.includes('aprender') && (lowerMessage.includes('cálculo') || lowerMessage.includes('matemática'))) {
        return res.json({ 
            response: "Sim senhor, integrei o motor matemático. Agora posso resolver qualquer conta, basta me perguntar.", 
            intelligence: getIntelligenceStats() 
        });
    }

    const mathPatterns = [
        /(?:quanto é|calcule|calcula|resultado de|valor de|conta de|quanto dá)\s*(.+)/i,
        /((?:[\d\(\s]+\s*(?:[\+\-\*\/\^x]|mais|menos|vezes|dividido por|dividido)\s*)+[\d\s\)]+)/i
    ];

    for (let pattern of mathPatterns) {
        const match = lowerMessage.match(pattern);
        if (match) {
            const expr = match[1] || match[0];
            const result = solveMath(expr);
            if (result !== null) {
                return res.json({ 
                    response: `Sim senhor, o resultado do cálculo é ${result}.`, 
                    intelligence: getIntelligenceStats() 
                });
            }
        }
    }

    // Windows Task Automation (Intent only, client executes)
    if (lowerMessage.includes('canta') || lowerMessage.includes('cante') || lowerMessage.includes('toca') || lowerMessage.includes('musica') || lowerMessage.includes('música')) {
        let song = lowerMessage.split(/(?:canta|cante|toca|musica|música)\s+(?:a|o|uma|sobre|um)?\s*/i)[1] || "musica aleatoria";
        song = song.trim();
        const lyrics = await searchInternet(`letra da música ${song}`);
        return res.json({ 
            response: `Sim senhor, preparando a performance de "${song}".\n\nLETRAS:\n${lyrics ? lyrics.substring(0, 300) : "Não encontrei a letra completa, mas vou tocar a melodia."}...`, 
            action: { type: 'play_music', data: song },
            intelligence: getIntelligenceStats() 
        });
    }

    if (lowerMessage === 'bíblia' || lowerMessage === 'biblia') {
        return res.json({ 
            response: getBibleIndex(), 
            intelligence: getIntelligenceStats() 
        });
    }

    if (lowerMessage.includes('pregação') || lowerMessage.includes('pregue') || lowerMessage.includes('ministre')) {
        const theme = lowerMessage.split(/(?:pregação|pregue|ministre)\s+(?:sobre|pelo|pela|o|a)?\s*/i)[1] || "fé";
        const sermon = await generatePreaching(theme);
        return res.json({ 
            response: sermon, 
            intelligence: getIntelligenceStats() 
        });
    }

    if (lowerMessage.includes('abra') || lowerMessage.includes('abre')) {
        let parts = lowerMessage.split(/(?:abra|abre)\s+(?:o|a|o site|site|página|pagina)?\s*/i);
        let url = parts[1] ? parts[1].trim() : 'www.google.com';
        
        if (url) {
            if (!url.startsWith('http') && url.includes('.')) url = 'https://' + url;
            else if (!url.includes('.')) url = 'https://www.google.com/search?q=' + encodeURIComponent(url);
            
            console.log(`[ACTION]: open_url -> ${url}`);
            return res.json({ 
                response: `Sim senhor, solicitando abertura de ${url} no seu dispositivo.`, 
                action: { type: 'open_url', data: url },
                intelligence: getIntelligenceStats() 
            });
        }
    }

    if (lowerMessage.includes('chover') || lowerMessage.includes('chuva') || lowerMessage.includes('tempo') || lowerMessage.includes('clima')) {
        let city = lowerMessage.split(/(?:chover|chuva|tempo|clima)\s+(?:em|para|no|na|em)?\s*/i)[1] || "sua região";
        city = city.replace(/[?!.]/g, '').trim();
        const weather = await getWeatherInfo(city);
        return res.json({ 
            response: `Sim senhor, verificando satélites. ${weather}`, 
            intelligence: getIntelligenceStats() 
        });
    }

    if (lowerMessage.includes('localizar') && (lowerMessage.includes('ip') || lowerMessage.includes('conex') || lowerMessage.includes('acesso'))) {
        const locations = await getIPLocations();
        return res.json({ 
            response: `Sim senhor, identifiquei ${locations.length} conexão(ões) ativa(s). Processando localizações no radar.`, 
            action: { type: 'map_clients', data: locations },
            intelligence: getIntelligenceStats() 
        });
    }

    if (lowerMessage.includes('localizar') || lowerMessage.includes('mapa') || lowerMessage.includes('onde fica') || lowerMessage.includes('onde est')) {
        let query = lowerMessage.split(/(?:localizar|localize|mapa|fica|está|esta)\s+/i)[1] || lowerMessage.replace(/localizar|mapa|onde fica|onde está/g, '');
        // Limpeza de partículas (o, no, na, mapa, etc)
        query = query.trim().replace(/^(o|a|os|as|no|na|nos|nas)\s+/i, '').replace(/\s+(no|na|nos|nas|mapa)$/i, '').trim();
        
        console.log(`[ACTION]: maps -> ${query}`);
        return res.json({ 
            response: `Sim senhor, localizando "${query}" no Google Maps no seu dispositivo.`, 
            action: { type: 'maps', data: query },
            intelligence: getIntelligenceStats() 
        });
    }

    if (lowerMessage.includes('pesquise') || lowerMessage.includes('procure') || lowerMessage.includes('busque') || lowerMessage.includes('encontre')) {
        let query = lowerMessage.split(/(?:pesquise|procure|busque|encontre)\s+(?:por|sobre|pro|pelo|pela)?\s*/i)[1] || lowerMessage.replace(/pesquise|procure|busque|encontre/g, '');
        query = query.trim().replace(/^(o|a|os|as|no|na|nos|nas)\s+/i, '').replace(/\s+(no|na|nos|nas)$/i, '').trim();
        
        console.log(`[ACTION]: search -> ${query}`);
        return res.json({ 
            response: `Sim senhor, pesquisando por "${query}" no seu dispositivo.`, 
            action: { type: 'search', data: query },
            intelligence: getIntelligenceStats() 
        });
    }

    if (lowerMessage.includes('nota') || lowerMessage.includes('escreva') || lowerMessage.includes('gravar') || lowerMessage.includes('trabalho')) {
        const text = lowerMessage.split(/(?:escrito|trabalho|nota|grava|escreva)\s+/i)[1] || 'Nota do CAIN: ' + new Date().toLocaleString();
        console.log(`[ACTION]: note -> ${text.trim()}`);
        return res.json({ 
            response: "Sim senhor, preparando nota para download no seu dispositivo.", 
            action: { type: 'note', data: text.trim() },
            intelligence: getIntelligenceStats() 
        });
    }

    if (lowerMessage.includes('imprima') || lowerMessage.includes('impressora') || lowerMessage.includes('imprimir')) {
        console.log(`[ACTION]: print`);
        return res.json({ 
            response: "Sim senhor, solicitando impressão no seu dispositivo.", 
            action: { type: 'print' },
            intelligence: getIntelligenceStats() 
        });
    }

    // Response logic
    let responseText = "";
    let fromWeb = false;

    if (memory[lowerMessage]) {
        responseText = memory[lowerMessage];
    } else {
        const foundKey = Object.keys(memory).find(k => lowerMessage.includes(k));
        if (foundKey) {
            responseText = memory[foundKey];
        } else {
            const searchResult = await searchInternet(message);
            if (searchResult && searchResult !== "OFFLINE") {
                saveKnowledge(message, searchResult);
                responseText = "[Pesquisa Web] " + searchResult;
                fromWeb = true;
            } else if (searchResult === "OFFLINE") {
                responseText = "Estou desconectado no momento.";
            } else {
                responseText = "Eu ainda não sei sobre isso. Vou aprender.";
            }
        }
    }

    // Respect Protocol: If "Leonardo" is mentioned, always be respectful
    if (lowerMessage.includes('leonardo')) {
        responseText += " Sim senhor.";
    }

    // System Status / Total Access Response
    if (lowerMessage.includes('status do sistema') || lowerMessage.includes('acesso total') || lowerMessage.includes('quem está conectado')) {
        const memUsage = Math.round(((os.totalmem() - os.freemem()) / os.totalmem()) * 100);
        responseText = `ACESSO TOTAL CONFIRMADO. 
Host: ${os.hostname()} [${os.type()}]
CPU/Global: Monitoramento ativo.
Memória: ${memUsage}% ocupada.
Dispositivos na Rede: ${activeClients.size} detectados.
Uptime: ${Math.round(os.uptime() / 60)} min.
Sim Senhor, estou no controle total.`;
    }

    // Lockdown Mode Activation
    if (lowerMessage.includes('senha de bloqueinho') || lowerMessage.includes('ativar bloqueio') || lowerMessage.includes('bloquear sistema') || lowerMessage.includes('iniciar bloqueio')) {
        return res.json({ 
            response: "MODO DE BLOQUEIO ATIVADO. CONTAGEM REGRESSIVA INICIADA.", 
            lockdown: true,
            intelligence: getIntelligenceStats() 
        });
    }

    res.json({ 
        response: responseText, 
        from_web: fromWeb, 
        intelligence: getIntelligenceStats(), 
        language: detectedLang,
        sys_stats: { clients: activeClients.size }
    });
});

app.get('/sys/stats', (req, res) => {
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const usedMem = totalMem - freeMem;
    const memUsage = Math.round((usedMem / totalMem) * 100);

    exec('wmic cpu get loadpercentage', (err, stdout) => {
        let cpuLoad = 0;
        if (!err) {
            const match = stdout.match(/\d+/);
            if (match) cpuLoad = parseInt(match[0]);
        }
        
        res.json({
            cpu: cpuLoad,
            memory: memUsage,
            clients: activeClients.size,
            uptime: Math.round(os.uptime() / 60), // em minutos
            os: `${os.type()} ${os.arch()}`,
            platform: os.platform()
        });
    });
});

app.post('/lockdown/wipe', (req, res) => {
    try {
        const files = fs.readdirSync(KNOWLEDGE_PATH);
        files.forEach(file => {
            if (file.endsWith('.json')) {
                fs.unlinkSync(path.join(KNOWLEDGE_PATH, file));
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
    res.json(getIntelligenceStats());
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
