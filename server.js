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

// Cache de clientes para evitar buscar toda vez (expira em 5 min)
let _clientCache = null;
let _clientCacheTime = 0;

async function getAllMikwebClients() {
    const now = Date.now();
    if (_clientCache && (now - _clientCacheTime) < 5 * 60 * 1000) {
        return _clientCache; // retorna cache se ainda válido
    }
    console.log('[MIKWEB] Baixando lista completa de clientes...');
    let allClients = [];
    let page = 1;
    let hasMore = true;
    while (hasMore) {
        const res = await mikwebRequest(`/customers?limit=20&page=${page}`);
        const batch = (res && res.customers) ? res.customers : [];
        allClients.push(...batch);
        hasMore = batch.length === 20;
        page++;
        if (page > 50) break; // limite de segurança: 1000 clientes máx
    }
    _clientCache = allClients;
    _clientCacheTime = now;
    console.log(`[MIKWEB] ${allClients.length} clientes carregados.`);
    return allClients;
}

async function searchMikwebClientDetailed(name) {
    try {
        console.log(`[MIKWEB-SEARCH] Buscando: "${name}"`);

        const allClients = await getAllMikwebClients();

        // Normaliza texto para comparação
        const normalize = s => s.toLowerCase()
            .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // remove acentos
            .replace(/[^a-z\s]/g, '').trim();

        const searchNorm = normalize(name);
        const searchWords = searchNorm.split(/\s+/).filter(w => w.length >= 2);

        // Pontua cada cliente: quantas palavras da busca aparecem no nome
        let scored = allClients.map(c => {
            const cn = normalize(c.full_name);
            let score = 0;
            for (const w of searchWords) {
                if (cn.includes(w)) score++;
            }
            // bonus: nome começa com a busca completa
            if (cn.startsWith(searchNorm)) score += 2;
            return { client: c, score };
        }).filter(x => x.score > 0);

        if (scored.length === 0) {
            return `Lamento senhor, não encontrei nenhum cliente cadastrado no MikWeb com o nome "${name}".`;
        }

        scored.sort((a, b) => b.score - a.score);
        const client = scored[0].client;
        console.log(`[MIKWEB-SEARCH] Melhor match: "${client.full_name}" (score: ${scored[0].score})`);

        // 2. Search for billings — fetch up to 50 to capture all open invoices
        const billingsRes = await mikwebRequest(`/billings?customer_id=${client.id}&limit=50`);
        const billings = (billingsRes && billingsRes.billings) ? billingsRes.billings : [];

        // Derive Monthly Fee and Due Day from latest billing
        let monthlyFee = "Não identificado";
        let dueDay = "Não identificado";
        if (billings.length > 0) {
            const latest = billings[0];
            monthlyFee = parseFloat(latest.value).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
            // Extract day from YYYY-MM-DD
            if (latest.due_day) {
                const parts = latest.due_day.split('-');
                if (parts.length === 3) dueDay = parts[2];
            }
        }

        const today = new Date();
        today.setHours(0, 0, 0, 0);

        let openInvoices = billings.filter(b => b.situation && b.situation.name === 'Aberto');
        let overdueInvoices = openInvoices.filter(b => new Date(b.due_day) < today);
        let onTimeInvoices  = openInvoices.filter(b => new Date(b.due_day) >= today);

        const status = client.status && client.status.name ? client.status.name : 'Ativo';

        let response = `${client.full_name}\n`;
        response += `Mensalidade: ${monthlyFee}\n`;
        response += `Vencimento: Dia ${dueDay}\n`;
        response += `Status: ${status}\n`;

        if (openInvoices.length > 0) {
            response += `\nBoletos em aberto: ${openInvoices.length}\n`;
            if (overdueInvoices.length > 0) {
                response += `Boletos vencidos: ${overdueInvoices.length}\n`;
                response += `\nVENCIDOS:\n`;
                overdueInvoices.forEach((b, i) => {
                    const date = b.due_day.split('-').reverse().join('/');
                    const value = parseFloat(b.value).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
                    response += `  ${i+1}. Vencimento ${date} - ${value}\n`;
                });
            }
            if (onTimeInvoices.length > 0) {
                response += `\nA VENCER:\n`;
                onTimeInvoices.forEach((b, i) => {
                    const date = b.due_day.split('-').reverse().join('/');
                    const value = parseFloat(b.value).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
                    response += `  ${i+1}. Vencimento ${date} - ${value}\n`;
                });
            }
            const totalDebt = openInvoices.reduce((sum, b) => sum + parseFloat(b.value || 0), 0);
            response += `\nTotal em aberto: ${totalDebt.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}`;
        } else {
            response += `\nCliente em dia. Sem boletos em aberto.`;
        }

        return response;
    } catch (e) {
        console.error('[MIKWEB-DETAILED-SEARCH] Error:', e);
        return "Erro ao processar consulta no MikWeb: " + e.message;
    }
}

// ─── HELPER: encontrar cliente por nome ─────────────────────────────────────
async function findClientByName(name) {
    const allClients = await getAllMikwebClients();
    const normalize = s => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z\s]/g,'').trim();
    const words = normalize(name).split(/\s+/).filter(w => w.length >= 2);
    const scored = allClients.map(c => {
        const cn = normalize(c.full_name);
        const score = words.reduce((s,w) => s + (cn.includes(w)?1:0), 0);
        return { client: c, score };
    }).filter(x => x.score > 0).sort((a,b) => b.score - a.score);
    return scored.length ? scored[0].client : null;
}

// HELPER: busca midias de um tipo especifico nas conversas do cliente
async function buscarMidiasCliente(name, tipoFiltro) {
    try {
        const client = await findClientByName(name);
        if (!client) return { text: `Nenhum cliente encontrado com o nome "${name}".`, items: [], clientName: name };

        const normalize = s => (s||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9\s]/g,'').trim();
        const clientNameNorm = normalize(client.full_name);
        const clientWords = clientNameNorm.split(/\s+/).filter(w => w.length >= 3);
        const clientPhone = (client.cell_phone_number_1 || client.phone_number || '').replace(/\D/g,'');

        let page = 1; let allConvs = []; let hasMore = true;
        while (hasMore && page <= 10) {
            const r = await mikwebRequest(`/messages/search?limit=20&page=${page}`);
            const batch = (r && r.conversations) ? r.conversations : [];
            allConvs.push(...batch);
            hasMore = batch.length === 20;
            page++;
        }

        const clientConvs = allConvs.filter(conv => {
            const contactName = normalize(conv.contact && conv.contact.name ? conv.contact.name : '');
            const contactPhone = (conv.contact && conv.contact.phone ? conv.contact.phone : '').replace(/\D/g,'');
            if (clientPhone && contactPhone && contactPhone.endsWith(clientPhone.slice(-8))) return true;
            const matches = clientWords.filter(w => contactName.includes(w)).length;
            return matches >= 1;
        });

        let items = [];
        for (const conv of clientConvs) {
            const mRes = await mikwebRequest(`/messages?conversation_id=${conv.id}&limit=50`);
            if (!mRes || !mRes.messages) continue;
            for (const m of mRes.messages) {
                if (!m.attachments || !m.attachments.length) continue;
                const att = m.attachments[0];
                const fileName = att.file_name || `arquivo_${att.id}`;
                const ext = fileName.split('.').pop().toLowerCase();
                let tipo = null;
                if (att.file_type === 'audio' || ['ogg','mp3','m4a','opus'].includes(ext)) tipo = 'audio';
                else if (['jpg','jpeg','png','gif','webp'].includes(ext) || att.file_type === 'image') tipo = 'photo';
                else if (ext === 'pdf' || att.file_type === 'document') tipo = 'document';
                if (tipo !== tipoFiltro || !att.file_url) continue;
                const isIncoming = m.incoming === true || m.sender_type === 'Contact';
                const senderName = (conv.contact && conv.contact.name) ? conv.contact.name : client.full_name;
                const proxyUrl = `uploads/proxy?url=${encodeURIComponent(att.file_url)}`;
                items.push({ id: 'mik_' + m.id, from: isIncoming ? senderName : 'Suporte MIDNET',
                    file: proxyUrl, fileName, fileType: tipo, text: '', timestamp: m.created_at, isMikweb: true });
            }
        }

        const tipoLabel = { audio: 'audios', photo: 'imagens', document: 'PDFs' }[tipoFiltro] || 'arquivos';
        if (!items.length) return { text: `${client.full_name}\nNenhum ${tipoLabel} encontrado no WhatsApp.`, items: [], clientName: client.full_name };
        return { text: `${client.full_name}\nEncontrei ${items.length} ${tipoLabel}.`, items, clientName: client.full_name, tipoFiltro };
    } catch(e) {
        return { text: `Erro ao buscar midias: ${e.message}`, items: [], clientName: name };
    }
}

// COMANDO: OVIR AUDIO <nome>
async function buscarAudios(name)  { return buscarMidiasCliente(name, 'audio'); }
async function buscarImagens(name) { return buscarMidiasCliente(name, 'photo'); }
async function buscarPDFs(name)    { return buscarMidiasCliente(name, 'document'); }

// ─── COMANDO 1: BOLETOS RECENTE <nome> ─────────────────────────────────────────
async function boletosRecentes(name) {
    try {
        const allClients = await getAllMikwebClients();
        const normalize = s => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z\s]/g,'').trim();
        const words = normalize(name).split(/\s+/).filter(w => w.length >= 2);
        let scored = allClients.map(c => {
            const cn = normalize(c.full_name);
            let score = words.reduce((s,w) => s + (cn.includes(w)?1:0), 0);
            return { client: c, score };
        }).filter(x => x.score > 0).sort((a,b) => b.score - a.score);
        if (!scored.length) return `Nenhum cliente encontrado com o nome "${name}".`;
        const client = scored[0].client;
        const res = await mikwebRequest(`/billings?customer_id=${client.id}&limit=10`);
        const billings = (res && res.billings) ? res.billings : [];
        if (!billings.length) return `${client.full_name}\nNenhum boleto encontrado.`;
        let out = `${client.full_name}\nUltimos ${billings.length} boletos:\n\n`;
        billings.forEach((b, i) => {
            const date = b.due_day ? b.due_day.split('-').reverse().join('/') : '---';
            const value = parseFloat(b.value||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
            const sit = b.situation && b.situation.name ? b.situation.name : '---';
            out += `${i+1}. Vencimento ${date} - ${value} - ${sit}\n`;
        });
        return out;
    } catch(e) { return 'Erro ao buscar boletos: ' + e.message; }
}

// ─── COMANDO 2: BOLETOS ATRAZADO <nome> ───────────────────────────────────────
async function boletosAtrasados(name) {
    try {
        const allClients = await getAllMikwebClients();
        const normalize = s => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z\s]/g,'').trim();
        const words = normalize(name).split(/\s+/).filter(w => w.length >= 2);
        let scored = allClients.map(c => {
            const cn = normalize(c.full_name);
            let score = words.reduce((s,w) => s + (cn.includes(w)?1:0), 0);
            return { client: c, score };
        }).filter(x => x.score > 0).sort((a,b) => b.score - a.score);
        if (!scored.length) return `Nenhum cliente encontrado com o nome "${name}".`;
        const client = scored[0].client;
        const res = await mikwebRequest(`/billings?customer_id=${client.id}&limit=50`);
        const billings = (res && res.billings) ? res.billings : [];
        const today = new Date(); today.setHours(0,0,0,0);
        const overdue = billings.filter(b => b.situation && b.situation.name === 'Aberto' && new Date(b.due_day) < today);
        if (!overdue.length) return `${client.full_name}\nSem boletos atrasados.`;
        const total = overdue.reduce((s,b) => s + parseFloat(b.value||0), 0);
        let out = `${client.full_name}\nBoletos atrasados: ${overdue.length}\n\n`;
        overdue.forEach((b, i) => {
            const date = b.due_day.split('-').reverse().join('/');
            const value = parseFloat(b.value||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
            out += `${i+1}. Vencimento ${date} - ${value}\n`;
        });
        out += `\nTotal atrasado: ${total.toLocaleString('pt-BR',{style:'currency',currency:'BRL'})}`;
        return out;
    } catch(e) { return 'Erro ao buscar boletos atrasados: ' + e.message; }
}

// ─── HELPER: busca mensagens WhatsApp reais de um cliente ────────────────────
async function fetchClientWhatsAppMessages(client, limit, oldest) {
    let allMessages = [];
    const searchRes = await mikwebRequest(`/messages/search?customer_id=${client.id}&limit=20`);
    let convs = (searchRes && searchRes.conversations) ? searchRes.conversations : [];
    if (oldest) convs.sort((a,b) => new Date(a.created_at) - new Date(b.created_at));

    for (const conv of convs.slice(0, 3)) {
        const mRes = await mikwebRequest(`/messages?conversation_id=${conv.id}&limit=${limit}`);
        if (!mRes || !mRes.messages) continue;
        const msgs = oldest ? [...mRes.messages].reverse() : mRes.messages;
        for (const m of msgs) {
            const isIncoming = m.incoming === true || m.sender_type === 'Contact';
            const senderName = (conv.contact && conv.contact.name) ? conv.contact.name : client.full_name;
            let msgObj = { id: 'mik_' + m.id, from: isIncoming ? senderName : 'Suporte MIDNET', text: m.content || '', timestamp: m.created_at, isMikweb: true, mikweb_conv_id: conv.id };
            if (m.attachments && m.attachments.length > 0) {
                const att = m.attachments[0];
                const fileName = att.file_name || `arquivo_${att.id}`;
                const localPath = await downloadMikwebFile(att.file_url, fileName);
                if (localPath) {
                    msgObj.file = localPath;
                    msgObj.fileName = fileName;
                    const ext = path.extname(fileName).toLowerCase();
                    if (att.file_type === 'audio' || ['.ogg','.mp3','.m4a'].includes(ext)) msgObj.fileType = 'audio';
                    else if (['image','photo','png','jpg'].includes(att.file_type) || ['.jpg','.jpeg','.png'].includes(ext)) msgObj.fileType = 'photo';
                    else if (ext === '.pdf') msgObj.fileType = 'document';
                }
            }
            allMessages.push(msgObj);
        }
    }
    allMessages.sort((a,b) => new Date(a.timestamp) - new Date(b.timestamp));
    return allMessages;
}

// ─── COMANDO 3: CONVEÇA RECENTE <nome> ─────────────────────────────────────────
async function conversasRecentes(name) {
    try {
        const allClients = await getAllMikwebClients();
        const normalize = s => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z\s]/g,'').trim();
        const words = normalize(name).split(/\s+/).filter(w => w.length >= 2);
        let scored = allClients.map(c => {
            const cn = normalize(c.full_name);
            let score = words.reduce((s,w) => s + (cn.includes(w)?1:0), 0);
            return { client: c, score };
        }).filter(x => x.score > 0).sort((a,b) => b.score - a.score);
        if (!scored.length) return { text: `Nenhum cliente encontrado com o nome "${name}".`, messages: [] };
        const client = scored[0].client;
        const messages = await fetchClientWhatsAppMessages(client, 10, false);
        return { text: `${client.full_name}\nEncontradas ${messages.length} mensagens recentes.`, messages };
    } catch(e) { return { text: 'Erro ao buscar conversas: ' + e.message, messages: [] }; }
}

async function conversasAntigas(name) {
    try {
        const allClients = await getAllMikwebClients();
        const normalize = s => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z\s]/g,'').trim();
        const words = normalize(name).split(/\s+/).filter(w => w.length >= 2);
        let scored = allClients.map(c => {
            const cn = normalize(c.full_name);
            let score = words.reduce((s,w) => s + (cn.includes(w)?1:0), 0);
            return { client: c, score };
        }).filter(x => x.score > 0).sort((a,b) => b.score - a.score);
        if (!scored.length) return { text: `Nenhum cliente encontrado com o nome "${name}".`, messages: [] };
        const client = scored[0].client;
        const messages = await fetchClientWhatsAppMessages(client, 10, true);
        return { text: `${client.full_name}\nHistórico carregado: ${messages.length} mensagens.`, messages };
    } catch(e) { return { text: 'Erro ao buscar histórico: ' + e.message, messages: [] }; }
}

async function syncWhatsAppMessages() {
    try {
        let allMessages = [];
        const searchRes = await mikwebRequest('/messages/search?limit=10');
        const conversations = (searchRes && searchRes.conversations) ? searchRes.conversations : [];
        for (const conv of conversations) {
            const mRes = await mikwebRequest(`/messages?conversation_id=${conv.id}&limit=5`);
            if (mRes && mRes.messages) {
                for (let m of mRes.messages) {
                    const isIncoming = m.incoming === true || m.sender_type === 'Contact';
                    const senderName = (conv.contact && conv.contact.name) ? conv.contact.name : 'Cliente';
                    let msgObj = { id: 'mik_' + m.id, from: isIncoming ? senderName : 'Suporte MIDNET', text: m.content || '', timestamp: m.created_at, isMikweb: true, mikweb_conv_id: conv.id };
                    if (m.attachments && m.attachments.length > 0) {
                        const att = m.attachments[0];
                        let fileName = att.file_name || `file_${att.id}`;
                        const localPath = await downloadMikwebFile(att.file_url, fileName);
                        if (localPath) {
                            msgObj.file = localPath;
                            msgObj.fileName = fileName;
                            const ext = path.extname(fileName).toLowerCase();
                            if (att.file_type === 'audio' || ['.ogg', '.mp3'].includes(ext)) msgObj.fileType = 'audio';
                            else if (['image','photo','png','jpg'].includes(att.file_type) || ['.jpg','.jpeg','.png'].includes(ext)) msgObj.fileType = 'photo';
                            else if (ext === '.pdf') msgObj.fileType = 'document';
                        }
                    }
                    allMessages.push(msgObj);
                }
            }
        }
        allMessages.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
        return allMessages;
    } catch (e) { return []; }
}

async function downloadMikwebFile(url, fileName) {
    if (!url) return null;
    try {
        if (!fs.existsSync(CHAT_UPLOAD_DIR)) fs.mkdirSync(CHAT_UPLOAD_DIR, { recursive: true });
        const cleanName = fileName.replace(/[^a-zA-Z0-9.-]/g, '_');
        const localFileName = `${Date.now()}_${cleanName}`;
        const localPath = path.join(CHAT_UPLOAD_DIR, localFileName);
        const response = await axios({ url, method: 'GET', responseType: 'stream', headers: url.includes('mikweb.com.br') ? { 'Authorization': `Bearer ${MIKWEB_TOKEN}` } : {} });
        return new Promise((resolve, reject) => {
            const writer = fs.createWriteStream(localPath);
            response.data.pipe(writer);
            writer.on('finish', () => resolve(`uploads/${localFileName}`));
            writer.on('error', () => resolve(null));
        });
    } catch (e) { return null; }
}

const app = express();
const PORT = 3100;
const KNOWLEDGE_PATH = path.join(__dirname, 'knowledge');

app.use(cors());
app.use(bodyParser.json({ limit: '50mb' }));
app.use(bodyParser.urlencoded({ limit: '50mb', extended: true }));
app.use(express.static(__dirname));

const ADMIN_TOKEN = "CAIN_MASTER_TOKEN_2026";
let memory = { global: {} };
let activeClients = new Set();

function loadKnowledge() {
    if (!fs.existsSync(KNOWLEDGE_PATH)) fs.mkdirSync(KNOWLEDGE_PATH);
    const rootFiles = fs.readdirSync(KNOWLEDGE_PATH);
    rootFiles.forEach(file => {
        const filePath = path.join(KNOWLEDGE_PATH, file);
        if (fs.lstatSync(filePath).isFile() && file.endsWith('.json')) {
            try { const data = JSON.parse(fs.readFileSync(filePath, 'utf8')); Object.assign(memory.global, data); } catch (e) {}
        } else if (fs.lstatSync(filePath).isDirectory()) {
            const user = file.toUpperCase();
            if (!memory[user]) memory[user] = {};
            const userFiles = fs.readdirSync(filePath);
            userFiles.forEach(uf => { if (uf.endsWith('.json')) { try { const data = JSON.parse(fs.readFileSync(path.join(filePath, uf), 'utf8')); Object.assign(memory[user], data); } catch (e) {} } });
        }
    });
}
loadKnowledge();

function saveKnowledge(user, key, value) {
    try {
        const currentUser = (user || 'VISITANTE').toUpperCase();
        if (!memory[currentUser]) memory[currentUser] = {};
        memory[currentUser][key.toLowerCase()] = value;
        const userPath = path.join(KNOWLEDGE_PATH, currentUser);
        if (!fs.existsSync(userPath)) fs.mkdirSync(userPath, { recursive: true });
        const safeKey = key.substring(0, 100).replace(/[^a-z0-9]/gi, '_').toLowerCase();
        fs.writeFileSync(path.join(userPath, `${safeKey}.json`), JSON.stringify({ [key.toLowerCase()]: value }, null, 2));
    } catch (e) {}
}

async function searchWikipedia(query) {
    try {
        const endpoint = `https://pt.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(query.replace(/ /g, '_'))}`;
        const response = await axios.get(endpoint, { timeout: 5000 });
        return response.data.extract || null;
    } catch (e) { return null; }
}

async function searchInternet(query) {
    const cleanQuery = query.replace(/^(?:cain,?\s*)?(?:o que é|quem é|como|me fala sobre|você sabe|define)\s+/gi, '').trim();
    if (cleanQuery.length < 2) return null;
    const wikiResult = await searchWikipedia(cleanQuery);
    if (wikiResult) return wikiResult;
    return null;
}

function getIntelligenceStats() {
    const fileCount = fs.readdirSync(KNOWLEDGE_PATH).filter(f => f.endsWith('.json')).length;
    return { count: fileCount, percentage: Math.floor(fileCount * 1.5) };
}

function solveMath(expr) {
    try {
        const clean = expr.toLowerCase().replace(/mais/g, '+').replace(/menos/g, '-').replace(/vezes/g, '*').replace(/dividido por/g, '/').replace(/x/g, '*').replace(/,/g, '.');
        const sanitized = clean.replace(/[^\d\+\-\*\/\.\(\)\s]/g, '');
        return eval(sanitized);
    } catch (e) { return null; }
}

app.post('/api/chat', async (req, res) => {
    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
    activeClients.add(ip);
    const { message, user } = req.body;
    const currentUser = user ? user.toUpperCase() : 'VISITANTE';
    const lowerMessage = message.toLowerCase();
    
    // COMANDOS DE WHATSAPP
    if (lowerMessage.includes('ver todas') && lowerMessage.includes('mensagem') && lowerMessage.includes('whats')) {
        const messages = await syncWhatsAppMessages();
        return res.json({ response: `Sim senhor, localizei ${messages.length} mensagens.`, action: { type: 'whatsapp_sync', data: messages }, intelligence: getIntelligenceStats() });
    }

    // COMANDO DE LOCALIZAÇÃO INDIVIDUAL
    if (lowerMessage.includes('localizar') && !lowerMessage.includes('ver todas')) {
        const targetName = message.replace(/localizar/i, '').replace(/cain/i, '').trim();
        if (targetName) {
            const allClients = await getAllMikwebClients();
            const normalize = s => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z\s]/g, '').trim();
            const searchNorm = normalize(targetName);
            const match = allClients.find(c => normalize(c.full_name).includes(searchNorm)) || allClients.find(c => normalize(c.full_name).split(' ').some(w => searchNorm.includes(w)));
            if (match && match.latitude && match.longitude) {
                return res.json({ response: `Localizando o cliente ${match.full_name} no mapa.`, action: { type: 'focus_map', data: { lat: parseFloat(match.latitude), lng: parseFloat(match.longitude), name: match.full_name } }, intelligence: getIntelligenceStats() });
            } else if (match) {
                return res.json({ response: `Encontrei ${match.full_name}, mas este cliente não possui coordenadas cadastradas.`, intelligence: getIntelligenceStats() });
            }
        }
    }

    // COMANDO DE MAPEAMENTO GLOBAL
    if (lowerMessage.includes('mapear clientes') || lowerMessage.includes('mapa de clientes')) {
        return res.json({ response: "Abrindo mapa de faturamento de clientes. Localizando todos os pontos de rede...", action: { type: 'open_map' }, intelligence: getIntelligenceStats() });
    }

    // LOGICA MIDNET
    if (currentUser === 'MIDNET') {
        const cmds = [
            { keys: ['boletos recente'], fn: boletosRecentes },
            { keys: ['boletos atrasado', 'boletos vencido'], fn: boletosAtrasados },
            { keys: ['conversa recente'], fn: conversasRecentes },
            { keys: ['conversa antiga'], fn: conversasAntigas },
            { keys: ['ouvir audio'], fn: buscarAudios },
            { keys: ['procura imagem'], fn: buscarImagens },
            { keys: ['procura pdf'], fn: buscarPDFs },
        ];
        for (const cmd of cmds) {
            for (const key of cmd.keys) {
                if (lowerMessage.includes(key)) {
                    const clientName = message.toLowerCase().split(key)[1].trim();
                    if (clientName) {
                        const result = await cmd.fn(clientName);
                        if (result && typeof result === 'object') {
                            if (result.messages) return res.json({ response: result.text, action: { type: 'whatsapp_sync', data: result.messages }, intelligence: getIntelligenceStats() });
                            if (result.items) return res.json({ response: result.text, action: { type: 'media_sequence', mediaType: result.tipoFiltro, items: result.items, clientName: result.clientName }, intelligence: getIntelligenceStats() });
                        }
                        return res.json({ response: result, intelligence: getIntelligenceStats() });
                    }
                }
            }
        }
        
        // Pesquisa Direta MikWeb
        const MIDNET_SYSTEM_CMDS = ['ver todas', 'limpar', 'quanto é', 'calcule', 'pregue', 'localizar'];
        if (!MIDNET_SYSTEM_CMDS.some(cmd => lowerMessage.includes(cmd))) {
            const result = await searchMikwebClientDetailed(message.trim());
            return res.json({ response: result, intelligence: getIntelligenceStats() });
        }
    }

    // Default response (Memory/Web)
    let reply = "Ainda não processei informações sobre esse assunto.";
    if (memory[currentUser] && memory[currentUser][lowerMessage]) reply = memory[currentUser][lowerMessage];
    else if (currentUser !== 'MIDNET' && memory.global && memory.global[lowerMessage]) reply = memory.global[lowerMessage];
    else {
        const web = await searchInternet(message);
        if (web) { saveKnowledge(currentUser, message, web); reply = `Descobri o seguinte: ${web}`; }
    }
    res.json({ response: reply, intelligence: getIntelligenceStats() });
});

app.get('/api/map/clients', async (req, res) => {
    try {
        const allClients = await getAllMikwebClients();
        const billingsRes = await mikwebRequest('/billings?limit=200');
        const billings = (billingsRes && billingsRes.billings) ? billingsRes.billings : [];
        const openBillings = billings.filter(b => b.situation && b.situation.name === 'Aberto');
        const clientIdsWithDebt = new Set(openBillings.map(b => b.customer_id));
        const markers = allClients.filter(c => c.latitude && c.longitude).map(c => {
            const hasDebt = clientIdsWithDebt.has(c.id);
            let clientDebt = 0;
            if (hasDebt) clientDebt = openBillings.filter(b => b.customer_id === c.id).reduce((s, b) => s + parseFloat(b.value || 0), 0);
            return { id: c.id, name: c.full_name, lat: parseFloat(c.latitude), lng: parseFloat(c.longitude), hasDebt, address: `${c.street||''}, ${c.number||''} - ${c.neighborhood||''}`, debt: clientDebt.toLocaleString('pt-BR',{style:'currency',currency:'BRL'}) };
        });
        res.json({ markers });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

const VOICE_PROFILES_FILE = path.join(__dirname, 'voice_profiles.json');
function loadVoiceProfiles() { try { if (fs.existsSync(VOICE_PROFILES_FILE)) return JSON.parse(fs.readFileSync(VOICE_PROFILES_FILE,'utf8')); } catch(e){} return []; }
app.get('/api/voice-profiles', (req, res) => res.json({ profiles: loadVoiceProfiles() }));
app.post('/api/voice-profiles', (req, res) => {
    const { name, profile } = req.body;
    const profiles = loadVoiceProfiles();
    const idx = profiles.findIndex(p => p.name.toLowerCase() === name.toLowerCase());
    const entry = { name, profile, createdAt: new Date().toISOString() };
    if (idx >= 0) profiles[idx] = entry; else profiles.push(entry);
    fs.writeFileSync(VOICE_PROFILES_FILE, JSON.stringify(profiles, null, 2));
    res.json({ success: true });
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`SERVIDOR CAIN v2.5 ATIVADO NA PORTA ${PORT}`);
});
