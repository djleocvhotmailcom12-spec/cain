const fs = require('fs');
let s = fs.readFileSync('server.js', 'utf8');

// Definição da global se não existir
if (!s.includes('let pendingVoiceAlerts = [];')) {
    s = s.replace('let mikwebChatMessages = [];', 'let mikwebChatMessages = [];\nlet pendingVoiceAlerts = [];');
}

// Injeção de Segurança no history
if (s.includes("app.get('/api/chat/history', async (req, res) => {")) {
    s = s.replace(
        "app.get('/api/chat/history', async (req, res) => {", 
        "app.get('/api/chat/history', async (req, res) => {\n    const user = req.query.user ? req.query.user.toUpperCase() : null;\n    if (user !== 'MIDNET') return res.json({ alerts: [] });"
    );
}

// Injeção de Segurança no recent
if (s.includes("app.get('/api/chat/recent', async (req, res) => {")) {
    s = s.replace(
        "app.get('/api/chat/recent', async (req, res) => {", 
        "app.get('/api/chat/recent', async (req, res) => {\n    const user = req.query.user ? req.query.user.toUpperCase() : null;\n    if (user !== 'MIDNET') return res.json({ alerts: [] });"
    );
}

// Restaurar endpoint poll caso não exista (foi perdido no checkout), e clear_chat
const appendAuthLogic = `
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
`;

if (!s.includes("app.get('/api/events/poll'")) {
    s = s.replace("app.listen(PORT, '0.0.0.0', () => {", appendAuthLogic + "\napp.listen(PORT, '0.0.0.0', () => {");
}

fs.writeFileSync('server.js', s);
console.log("SECURED SUCCESSFULLY");
