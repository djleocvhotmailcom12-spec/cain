// --- CONFIGURAÃ‡ÃƒO MIKWEB ---
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
        return _clientCache; // retorna cache se ainda vÃ¡lido
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
        if (page > 50) break; // limite de seguranÃ§a: 1000 clientes mÃ¡x
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

        // Normaliza texto para comparaÃ§Ã£o
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
            // bonus: nome comeÃ§a com a busca completa
            if (cn.startsWith(searchNorm)) score += 2;
            return { client: c, score };
        }).filter(x => x.score > 0);

        if (scored.length === 0) {
            return `Lamento senhor, nÃ£o encontrei nenhum cliente cadastrado no MikWeb com o nome "${name}".`;
        }

        scored.sort((a, b) => b.score - a.score);
        const client = scored[0].client;
        console.log(`[MIKWEB-SEARCH] Melhor match: "${client.full_name}" (score: ${scored[0].score})`);

        // 2. Search for billings â€” fetch up to 50 to capture all open invoices
        const billingsRes = await mikwebRequest(`/billings?customer_id=${client.id}&limit=50`);
        const billings = (billingsRes && billingsRes.billings) ? billingsRes.billings : [];

        // Derive Monthly Fee and Due Day from latest billing
        let monthlyFee = "NÃ£o identificado";
        let dueDay = "NÃ£o identificado";
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

// â”€â”€â”€ HELPER: encontrar cliente por nome â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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
// NAO baixa arquivos - apenas retorna URLs via proxy para resposta rapida
async function buscarMidiasCliente(name, tipoFiltro) {
    try {
        const client = await findClientByName(name);
        if (!client) return { text: `Nenhum cliente encontrado com o nome "${name}".`, items: [], clientName: name };

        const normalize = s => (s||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9\s]/g,'').trim();
        const clientNameNorm = normalize(client.full_name);
        const clientWords = clientNameNorm.split(/\s+/).filter(w => w.length >= 3);
        const clientPhone = (client.cell_phone_number_1 || client.phone_number || '').replace(/\D/g,'');

        // API ignora customer_id - busca todas as conversas e filtra localmente
        let page = 1; let allConvs = []; let hasMore = true;
        while (hasMore && page <= 10) {
            const r = await mikwebRequest(`/messages/search?limit=20&page=${page}`);
            const batch = (r && r.conversations) ? r.conversations : [];
            allConvs.push(...batch);
            hasMore = batch.length === 20;
            page++;
        }

        // Filtra conversas pelo nome/telefone do contato - basta 1 palavra longa coincidir
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

// â”€â”€â”€ COMANDO: PROCURA PDF <nome> â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

// COMANDO: OVIR AUDIO <nome>
async function buscarAudios(name)  { return buscarMidiasCliente(name, 'audio'); }

// COMANDO: PROCURA IMAGENS <nome>
async function buscarImagens(name) { return buscarMidiasCliente(name, 'photo'); }

async function buscarPDFs(name)    { return buscarMidiasCliente(name, 'document'); }

// â”€â”€â”€ COMANDO 1: BOLETOS RECENTE <nome> â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

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

// â”€â”€â”€ COMANDO 2: BOLETOS ATRAZADO <nome> â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

// â”€â”€â”€ HELPER: busca mensagens WhatsApp reais de um cliente â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
async function fetchClientWhatsAppMessages(client, limit, oldest) {
    let allMessages = [];
    const searchRes = await mikwebRequest(`/messages/search?customer_id=${client.id}&limit=20`);
    let convs = (searchRes && searchRes.conversations) ? searchRes.conversations : [];

    // Para conversas antigas: ordena do mais antigo para o mais recente
    if (oldest) convs.sort((a,b) => new Date(a.created_at) - new Date(b.created_at));

    for (const conv of convs.slice(0, 3)) { // atÃ© 3 conversas
        const mRes = await mikwebRequest(`/messages?conversation_id=${conv.id}&limit=${limit}`);
        if (!mRes || !mRes.messages) continue;
        const msgs = oldest ? [...mRes.messages].reverse() : mRes.messages;
        for (const m of msgs) {
            const isIncoming = m.incoming === true || m.sender_type === 'Contact';
            const senderName = (conv.contact && conv.contact.name) ? conv.contact.name : client.full_name;
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
                const fileName = att.file_name || `arquivo_${att.id}`;
                const localPath = await downloadMikwebFile(att.file_url, fileName);
                if (localPath) {
                    msgObj.file = localPath;
                    msgObj.fileName = fileName;
                    const ext = path.extname(fileName).toLowerCase();
                    if (att.file_type === 'audio' || ['.ogg','.mp3','.m4a'].includes(ext)) msgObj.fileType = 'audio';
                    else if (['.jpg','.jpeg','.png','.gif'].includes(ext)) msgObj.fileType = 'photo';
                    else if (ext === '.pdf') msgObj.fileType = 'document';
                }
            }
            allMessages.push(msgObj);
        }
    }
    allMessages.sort((a,b) => new Date(a.timestamp) - new Date(b.timestamp));
    return allMessages;
}

// â”€â”€â”€ COMANDO 3: CONVEÃ‡A RECENTE <nome> â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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
        if (!messages.length) return { text: `${client.full_name}\nNenhuma conversa recente no WhatsApp.`, messages: [] };
        return { text: `${client.full_name}\nConversas recentes: ${messages.length} mensagens carregadas.`, messages };
    } catch(e) { return { text: 'Erro ao buscar conversas: ' + e.message, messages: [] }; }
}

// â”€â”€â”€ COMANDO 4: COVEÃ‡AS ANTIGAS <nome> â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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
        if (!messages.length) return { text: `${client.full_name}\nNenhuma conversa encontrada no histÃ³rico.`, messages: [] };
        return { text: `${client.full_name}\nConversas antigas: ${messages.length} mensagens carregadas.`, messages };
    } catch(e) { return { text: 'Erro ao buscar conversas antigas: ' + e.message, messages: [] }; }
}


async function syncWhatsAppMessages() {
    try {
        console.log('[MIKWEB-SYNC] Iniciando sincronizaÃ§Ã£o manual de mensagens SAC/WhatsApp...');
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
        return res.status(403).json({ error: "Acesso Negado. Token de mestre invÃ¡lido." });
    }

    const { targetFile, newContent } = req.body;
    if (!targetFile || !newContent) {
        return res.status(400).json({ error: "Dados incompletos para atualizaÃ§Ã£o." });
    }

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

let memory = { global: {} };
let activeClients = new Set();

function loadKnowledge() {
    console.log("[MEMORY] Carregando base de conhecimento...");
    if (!fs.existsSync(KNOWLEDGE_PATH)) fs.mkdirSync(KNOWLEDGE_PATH);
    
    // Load global knowledge
    const rootFiles = fs.readdirSync(KNOWLEDGE_PATH);
    rootFiles.forEach(file => {
        const filePath = path.join(KNOWLEDGE_PATH, file);
        if (fs.lstatSync(filePath).isFile() && file.endsWith('.json')) {
            try {
                const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
                Object.assign(memory.global, data);
            } catch (e) {}
        } else if (fs.lstatSync(filePath).isDirectory()) {
            const user = file.toUpperCase();
            if (!memory[user]) memory[user] = {};
            const userFiles = fs.readdirSync(filePath);
            userFiles.forEach(uf => {
                if (uf.endsWith('.json')) {
                    try {
                        const data = JSON.parse(fs.readFileSync(path.join(filePath, uf), 'utf8'));
                        Object.assign(memory[user], data);
                    } catch (e) {}
                }
            });
        }
    });
    console.log(`[MEMORY] Base carregada. UsuÃ¡rios com memÃ³ria: ${Object.keys(memory).join(', ')}`);
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
        const filename = `${safeKey}.json`;
        fs.writeFileSync(path.join(userPath, filename), JSON.stringify({ [key.toLowerCase()]: value }, null, 2));
        console.log(`[MEMORY] Conhecimento salvo para ${currentUser}: ${filename}`);
    } catch (e) {
        console.error("[MEMORY-ERROR] Erro ao salvar conhecimento:", e.message);
    }
}

async function generatePreaching(themeOrRef) {
    const refMatch = themeOrRef.match(/^(.+?)\s+(\d+)$/i) || themeOrRef.match(/^(.+?)\s+cap[Ã­i]tulo\s+(\d+)$/i);
    if (refMatch) {
        const book = refMatch[1].trim();
        const cap = refMatch[2].trim();
        const result = await searchInternet(`${book} ${cap} bÃ­blia versÃ­culo principal mensagem`);
        if (result) {
            return `*MINISTRAÃ‡ÃƒO: ${book.toUpperCase()} CAPÃTULO ${cap}*\n\n"Povo de Deus, ouÃ§am o que diz em ${book} ${cap}: ${result.substring(0, 500)}... Que esta sagrada escritura ilumine seu caminho!"`;
        }
    }
    const templates = {
        "fÃ©": { verse: "Hebreus 11:1", msg: "A fÃ© Ã© a certeza do que esperamos e a prova das coisas que nÃ£o vemos." },
        "amor": { verse: "1 CorÃ­ntios 13:4", msg: "O amor Ã© paciente, o amor Ã© bondoso." },
        "forÃ§a": { verse: "Filipenses 4:13", msg: "Tudo posso naquele que me fortalece." }
    };
    const selected = templates[themeOrRef.toLowerCase()] || { verse: "Salmo 23:1", msg: "O Senhor Ã© o meu pastor; nada me faltarÃ¡." };
    return `*PREGAÃ‡ÃƒO: ${themeOrRef.toUpperCase()}*\n\n"Povo de Deus, ouÃ§am a palavra: ${selected.verse}. ${selected.msg} AmÃ©m!"`;
}

function getBibleIndex() {
    return `*ÃNDICE DA BÃBLIA SAGRADA*\n\nSolicite a pregaÃ§Ã£o de qualquer capÃ­tulo. Ex: "Cain, pregue Salmo 91"`;
}

async function getWeatherInfo(location) {
    try {
        const query = `previsÃ£o do tempo em ${location}`;
        const url = `https://www.google.com/search?q=${encodeURIComponent(query)}`;
        const response = await axios.get(url, { 
            headers: { 'User-Agent': 'Mozilla/5.0' },
            timeout: 10000
        });
        const html = response.data.toLowerCase();
        if (html.includes('chuva')) return `O satÃ©lite detectou probabilidade de chuva em ${location}.`;
        return `O tempo em ${location} parece estÃ¡vel no momento.`;
    } catch (e) {
        return "NÃ£o foi possÃ­vel conectar aos satÃ©lites meteorolÃ³gicos.";
    }
}

async function searchWikipedia(query) {
    try {
        const lang = 'pt';
        const endpoint = `https://${lang}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(query.replace(/ /g, '_'))}`;
        const response = await axios.get(endpoint, { timeout: 8000 });
        if (response.data && response.data.extract) return response.data.extract;
    } catch (e) {
        try {
            const lang = 'pt';
            const searchUrl = `https://${lang}.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query)}&format=json&origin=*`;
            const searchRes = await axios.get(searchUrl, { timeout: 8000 });
            if (searchRes.data.query.search.length > 0) {
                const title = searchRes.data.query.search[0].title;
                const summaryUrl = `https://${lang}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title.replace(/ /g, '_'))}`;
                const summaryRes = await axios.get(summaryUrl, { timeout: 8000 });
                return summaryRes.data.extract || null;
            }
        } catch (err) {}
    }
    return null;
}

async function searchInternet(query) {
    const cleanQuery = query.replace(/^(?:cain,?\s*)?(?:o que Ã©|quem Ã©|como|me fala sobre|vocÃª sabe|define)\s+/gi, '').trim();
    if (cleanQuery.length < 2) return null;
    
    try {
        const response = await axios.get(`https://api.duckduckgo.com/?q=${encodeURIComponent(cleanQuery)}&format=json&no_html=1`, { timeout: 8000 });
        if (response.data && response.data.AbstractText) return response.data.AbstractText;
    } catch (e) {}

    const wikiResult = await searchWikipedia(cleanQuery);
    if (wikiResult) return wikiResult;

    return null;
}

function detectLanguage(text) {
    return 'pt-BR';
}

async function getIPLocations() {
    const locations = [];
    for (let ip of Array.from(activeClients)) {
        const cleanIp = ip.replace('::ffff:', '');
        if (cleanIp === '::1' || cleanIp === '127.0.0.1') {
            locations.push({ ip: cleanIp, city: 'Rede Local', country: 'Interno' });
            continue;
        }
        try {
            const resp = await axios.get(`http://ip-api.com/json/${cleanIp}`);
            if (resp.data.status === 'success') locations.push({ ip: cleanIp, city: resp.data.city, country: resp.data.country });
        } catch (e) {}
    }
    return locations;
}

const TOPICS = ['ciÃªncia', 'histÃ³ria', 'tecnologia', 'bÃ­blia', 'astronomia'];
let currentTopicIndex = 0;

async function autonomousLearn() {
    const topic = TOPICS[currentTopicIndex];
    const query = `o que Ã© ${topic}`;
    const result = await searchInternet(query);
    // Save under SYSTEM_LEARN namespace â€” never under 'global' to avoid MIDNET bleed
    if (result) saveKnowledge('SYSTEM_LEARN', topic + '_' + Date.now().toString(36), result);
    currentTopicIndex = (currentTopicIndex + 1) % TOPICS.length;
}

setInterval(autonomousLearn, 60000);

function getIntelligenceStats() {
    const fileCount = fs.readdirSync(KNOWLEDGE_PATH).filter(f => f.endsWith('.json')).length;
    return { count: fileCount, percentage: Math.floor(fileCount * 1.5) };
}

function solveMath(expr) {
    try {
        const clean = expr.toLowerCase().replace(/mais/g, '+').replace(/menos/g, '-').replace(/vezes/g, '*').replace(/dividido por/g, '/').replace(/x/g, '*').replace(/,/g, '.');
        const sanitized = clean.replace(/[^\d\+\-\*\/\.\(\)\s\ath\.sqrt\*\*]/g, '');
        if (!sanitized || !/\d/.test(sanitized)) return null;
        const result = eval(sanitized);
        return (typeof result === 'number' && isFinite(result)) ? result : null;
    } catch (e) { return null; }
}

async function executeWindowsTask(task, data) {
    return new Promise((resolve) => {
        let command = "";
        switch (task) {
            case 'open_browser': command = `start ${data}`; break;
            case 'search_google': command = `start https://www.google.com/search?q=${encodeURIComponent(data)}`; break;
            case 'create_note':
                fs.writeFileSync(path.join(os.homedir(), 'Desktop', 'CAIN_Nota.txt'), data);
                return resolve(`Nota criada.`);
            default: return resolve("Tarefa nÃ£o reconhecida.");
        }
        exec(command, (err) => resolve(err ? "Erro." : "Sucesso."));
    });
}

app.post('/api/chat', async (req, res) => {
    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
    activeClients.add(ip);
    const { message, user } = req.body;
    const currentUser = user ? user.toUpperCase() : 'VISITANTE';
    const lowerMessage = message.toLowerCase();
    
    // Commands (MikWeb, WhatsApp, etc)
    if (lowerMessage.includes('ver todas') && lowerMessage.includes('mensagem') && lowerMessage.includes('whats')) {
        const messages = await syncWhatsAppMessages();
        return res.json({ response: `Sim senhor, localizei ${messages.length} mensagens.`, action: { type: 'whatsapp_sync', data: messages }, intelligence: getIntelligenceStats() });
    }

    // Common Logic
    const mathMatch = lowerMessage.match(/(?:quanto Ã©|calcule)\s*(.+)/i);
    if (mathMatch) {
         const result = solveMath(mathMatch[1]);
         if (result !== null) return res.json({ response: `Resultado: ${result}`, intelligence: getIntelligenceStats() });
    }

    // â”€â”€â”€ 4 COMANDOS ESPECIAIS MIDNET â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    if (currentUser === 'MIDNET') {
        const cmds = [
            { keys: ['boletos recente', 'boletos recentes'],  fn: boletosRecentes },
            { keys: ['boletos atrazado', 'boleto atrazado', 'boletos atrasado', 'boleto atrasado', 'boletos vencido'], fn: boletosAtrasados },
            { keys: ['conveÃ§a recente', 'conversa recente', 'conversas recente', 'conversas recentes'], fn: conversasRecentes },
            { keys: ['coveÃ§as antiga', 'conveÃ§as antigas', 'conversa antiga', 'conversas antigas'],     fn: conversasAntigas },
            { keys: ['ovir audio', 'ouvir audio', 'audios de', 'Ã¡udios de'],                           fn: buscarAudios },
            { keys: ['procura imagens', 'imagens de', 'fotos de'],                                      fn: buscarImagens },
            { keys: ['procura pdf', 'pdf de', 'documentos de'],                                         fn: buscarPDFs },
        ];
        for (const cmd of cmds) {
            for (const key of cmd.keys) {
                if (lowerMessage.startsWith(key)) {
                    const clientName = message.slice(key.length).trim();
                    if (clientName.length > 0) {
                        const result = await cmd.fn(clientName);
                        // Conversation/media commands return { text, messages/items }
                        if (result && typeof result === 'object') {
                            // WhatsApp sync (text+audio full messages)
                            if (result.messages !== undefined) {
                                const action = result.messages.length > 0
                                    ? { type: 'whatsapp_sync', data: result.messages }
                                    : null;
                                return res.json({ response: result.text, action, intelligence: getIntelligenceStats() });
                            }
                            // Media sequence (audios, images, PDFs)
                            if (result.items !== undefined) {
                                const action = result.items.length > 0
                                    ? { type: 'media_sequence', mediaType: result.tipoFiltro, items: result.items, clientName: result.clientName }
                                    : null;
                                return res.json({ response: result.text, action, intelligence: getIntelligenceStats() });
                            }
                        }
                        return res.json({ response: result, intelligence: getIntelligenceStats() });
                    }
                    return res.json({ response: `Por favor informe o nome do cliente. Exemplo: "${key} MARCIO"`, intelligence: getIntelligenceStats() });
                }
            }
        }
    }
    // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

    // Direct MikWeb Search Priority for MIDNET
    // ALL queries from MIDNET go to MikWeb first â€” no word-count or '?' restriction
    const MIDNET_SYSTEM_CMDS = ['ver todas', 'limpar', 'quanto Ã©', 'calcule', 'pregue', 'bÃ­blia', 'previsÃ£o', 'tempo em', 'localizar no mapa'];
    if (currentUser === 'MIDNET' && !MIDNET_SYSTEM_CMDS.some(cmd => lowerMessage.includes(cmd))) {
        const searchTerm = message.replace(/[?!.]/g, '').trim();
        const mikwebResult = await searchMikwebClientDetailed(searchTerm);
        // Return MikWeb result â€” found OR not found. Internet is NEVER used for MIDNET.
        return res.json({ response: mikwebResult, intelligence: getIntelligenceStats() });
    }

    // Default response (Memory or Web)
    let reply = "Ainda nÃ£o processei informaÃ§Ãµes sobre esse assunto.";
    let fromWeb = false;
    
    // Check User-Specific Memory
    if (memory[currentUser] && memory[currentUser][lowerMessage]) {
        reply = memory[currentUser][lowerMessage];
    } 
    // Check Global Memory (NEVER for MIDNET â€” internet bleed prevention)
    else if (currentUser !== 'MIDNET' && memory.global && memory.global[lowerMessage]) {
        reply = memory.global[lowerMessage];
    }
    else {
        // MIDNET never reaches internet search â€” it is fully handled above.
        // This block only runs for non-MIDNET users.
        const searchResult = await searchInternet(message);
        if (searchResult) {
            saveKnowledge(currentUser, message, searchResult);
            reply = `Descobri o seguinte: ${searchResult}`;
            fromWeb = true;
        }
    }

    res.json({ response: reply, from_web: fromWeb, intelligence: getIntelligenceStats() });
});

app.post('/lockdown/wipe', (req, res) => {
    try {
        const files = fs.readdirSync(KNOWLEDGE_PATH);
        files.forEach(file => { if (file.endsWith('.json')) fs.unlinkSync(path.join(KNOWLEDGE_PATH, file)); });
        memory = {};
        console.log("SISTEMA WIPED.");
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/stats', (req, res) => {
    res.json(getIntelligenceStats());
});

app.get('/knowledge/export', (req, res) => {
    try {
        const exportData = {};
        const files = fs.readdirSync(KNOWLEDGE_PATH);
        files.forEach(file => {
            if (file.endsWith('.json')) {
                const content = fs.readFileSync(path.join(KNOWLEDGE_PATH, file), 'utf8');
                Object.assign(exportData, JSON.parse(content));
            }
        });
        res.json(exportData);
    } catch (e) { res.status(500).json({ error: "Falha na exportaÃ§Ã£o." }); }
});

app.get('/api/chat/history', async (req, res) => {
    const user = req.query.user ? req.query.user.toUpperCase() : null;
    if (user !== 'MIDNET') return res.json({ alerts: [] });
    try {
        let historyAlerts = [];
        const searchRes = await mikwebRequest('/messages/search?limit=15');
        let convs = (searchRes && searchRes.conversations) ? searchRes.conversations : [];
        for (const conv of convs) {
            const mRes = await mikwebRequest(`/messages?conversation_id=${conv.id}`);
            if (mRes && mRes.messages) {
                for (let m of mRes.messages) {
                    if (m.incoming) {
                        historyAlerts.push({ isSac: true, senderName: conv.contact.name || 'Cliente', textContent: m.content || '' });
                    }
                }
            }
        }
        res.json({ alerts: historyAlerts.slice(-30) }); 
    } catch(e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/events/poll', (req, res) => {
    const user = req.query.user ? req.query.user.toUpperCase() : null;
    if (user !== 'MIDNET') return res.json({ alerts: [] });
    let alerts = [...pendingVoiceAlerts];
    pendingVoiceAlerts = [];
    res.json({ alerts });
});

app.get('/sys/stats', (req, res) => {
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const usedMem = totalMem - freeMem;
    const memUsage = Math.floor((usedMem / totalMem) * 100);
    const cpuLoad = Math.floor(os.loadavg()[0] * 10); 
    res.json({
        cpu: Math.min(cpuLoad, 100),
        memory: memUsage,
        clients: activeClients.size
    });
});

app.get('/api/chat/recent', async (req, res) => {
    const user = req.query.user ? req.query.user.toUpperCase() : null;
    if (user !== 'MIDNET') return res.json({ alerts: [] });
    try {
        let recentAlerts = [];
        const searchRes = await mikwebRequest('/messages/search?limit=5');
        let convs = (searchRes && searchRes.conversations) ? searchRes.conversations : [];
        for (const conv of convs) {
            const mRes = await mikwebRequest(`/messages?conversation_id=${conv.id}&limit=1`);
            if (mRes && mRes.messages && mRes.messages.length > 0) {
                const m = mRes.messages[0];
                if (m.incoming) {
                    recentAlerts.push({ isSac: true, senderName: conv.contact.name || 'Cliente', textContent: m.content || '' });
                }
            }
        }
        res.json({ alerts: recentAlerts });
    } catch(e) { res.status(500).json({ error: e.message }); }
});

app.post('/clear_chat', (req, res) => {
    const user = req.body.user ? req.body.user.toUpperCase() : null;
    if (user !== 'MIDNET') return res.status(403).json({ error: 'Acesso Negado.' });
    mikwebChatMessages = []; 
    pendingVoiceAlerts = []; 
    if (fs.existsSync(CHAT_FILE)) fs.writeFileSync(CHAT_FILE, JSON.stringify([])); 
    res.json({ success: true }); 
});

// â”€â”€â”€ PROXY: serve arquivos do MikWeb com autenticaÃ§Ã£o â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
app.get('/uploads/proxy', async (req, res) => {
    const fileUrl = req.query.url;
    if (!fileUrl) return res.status(400).send('URL obrigatÃ³ria');
    try {
        const r = await axios({ url: fileUrl, method: 'GET', responseType: 'stream',
            headers: fileUrl.includes('mikweb.com.br') ? { 'Authorization': `Bearer ${MIKWEB_TOKEN}` } : {} });
        res.set('Content-Type', r.headers['content-type'] || 'application/octet-stream');
        r.data.pipe(res);
    } catch(e) { res.status(500).send('Erro ao buscar arquivo: ' + e.message); }
});

app.get('/api/map/clients', async (req, res) => {
    try {
        console.log('[MAP] Requisitando dados de mapeamento de clientes...');
        const allClients = await getAllMikwebClients();
        
        // Busca faturas em aberto para saber quem mapear (limitado a 200 para performance)
        const billingsRes = await mikwebRequest('/billings?limit=200');
        const billings = (billingsRes && billingsRes.billings) ? billingsRes.billings : [];
        
        // Filtra apenas faturas em 'Aberto'
        const openBillings = billings.filter(b => b.situation && b.situation.name === 'Aberto');
        
        // Mapeia IDs de clientes que tem boleto em aberto
        const clientIdsWithDebt = new Set(openBillings.map(b => b.customer_id));
        
        // Filtra clientes que tem coordenadas E tem boleto em aberto (ou todos se preferir, mas o user pediu "que tem boletos")
        const markers = allClients
            .filter(c => c.latitude && c.longitude && clientIdsWithDebt.has(c.id))
            .map(c => {
                // Calcula total de dÃ©bito para esse cliente nesta lista
                const clientDebt = openBillings
                    .filter(b => b.customer_id === c.id)
                    .reduce((sum, b) => sum + parseFloat(b.value || 0), 0);

                return {
                    id: c.id,
                    name: c.full_name,
                    lat: parseFloat(c.latitude),
                    lng: parseFloat(c.longitude),
                    status: c.status || 'Ativo',
                    debt: clientDebt.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
                };
            });

        console.log(`[MAP] ${markers.length} marcadores gerados.`);
        res.json({ markers });
    } catch (e) {
        console.error('[MAP-ERROR]', e);
        res.status(500).json({ error: e.message });
    }
});

const VOICE_PROFILES_FILE = require('path').join(__dirname, 'voice_profiles.json');
function loadVoiceProfiles() {
    try { if (require('fs').existsSync(VOICE_PROFILES_FILE)) return JSON.parse(require('fs').readFileSync(VOICE_PROFILES_FILE,'utf8')); } catch(e){}
    return [];
}
function saveVoiceProfiles(profiles) {
    require('fs').writeFileSync(VOICE_PROFILES_FILE, JSON.stringify(profiles,null,2),'utf8');
}
app.get('/api/voice-profiles', (req, res) => {
    res.json({ profiles: loadVoiceProfiles() });
});
app.post('/api/voice-profiles', (req, res) => {
    const { name, profile } = req.body;
    if (!name || !profile) return res.status(400).json({ error: 'name e profile obrigatorios' });
    const profiles = loadVoiceProfiles();
    const idx = profiles.findIndex(p => p.name.toLowerCase() === name.toLowerCase());
    const entry = { name: name.trim(), profile: profile.toUpperCase(), createdAt: new Date().toISOString() };
    if (idx >= 0) profiles[idx] = entry; else profiles.push(entry);
    saveVoiceProfiles(profiles);
    console.log('[VOZ] Perfil cadastrado: ' + name + ' -> ' + profile);
    res.json({ success: true, profiles });
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`=========================================`);
    console.log(`SERVIDOR CAIN v2.5 ATIVADO NO PORTA ${PORT}`);
    console.log(`=========================================`);
    // PrÃ©-carrega lista de clientes em background para primeira busca ser rÃ¡pida
    setTimeout(() => {
        getAllMikwebClients().then(cls => console.log(`[CACHE] ${cls.length} clientes prÃ©-carregados.`)).catch(() => {});
    }, 2000);
});

