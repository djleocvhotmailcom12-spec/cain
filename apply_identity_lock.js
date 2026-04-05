const fs = require('fs');

// ==== 1. SCRIPT.JS ====
let script = fs.readFileSync('script.js', 'utf8');

const historyStart = 'window.fetchHistorySAC = async function() {';
const recentStart = 'window.fetchRecentSAC = async function() {';
const pollStart = 'async function pollSACEvents() {';

const authBlock = `
    if (!isAuthenticated || !currentUser || currentUser.toUpperCase() !== 'MIDNET') {
        addMessage('cain', '🔴 [ACESSO NEGADO] Privilégios insuficientes. Informações confidenciais do MikWeb estão restritas à conta MIDNET.');
        if (typeof speak === 'function') speak('Acesso corporativo negado. Identidade insuficiente para requerer registros financeiros.', 'pt-BR');
        return;
    }
`;

const pollAuthBlock = `
    if (!isAuthenticated || !currentUser || currentUser.toUpperCase() !== 'MIDNET') return;
`;

if (script.includes(historyStart)) {
    script = script.replace(historyStart, historyStart + authBlock);
}
if (script.includes(recentStart)) {
    script = script.replace(recentStart, recentStart + authBlock);
}
if (script.includes(pollStart)) {
    script = script.replace(pollStart, pollStart + pollAuthBlock);
}
fs.writeFileSync('script.js', script, 'utf8');

// ==== 2. SERVER.JS (OOM Protection) ====
let server = fs.readFileSync('server.js', 'utf8');
const oomPatchStr = `
                        if (alertObj.textContent || alertObj.fileUrl) {
                            pendingVoiceAlerts.push(alertObj);
                            if (pendingVoiceAlerts.length > 30) pendingVoiceAlerts.shift(); // Previne Memory Leak
                        }
`;

// It might be hard to safely inject this into server.js stringwise without breaking, but we can patch the /api/events/poll endpoint instead to take user param!
const pollEndpointRegex = /app\.get\('\\/api\\/events\\/poll', \\(req, res\\) => \\{[^}]+}\\);/g;
const newPollEndpoint = `
app.get('/api/events/poll', (req, res) => {
    // Evita estourar a RAM de fundo se ninguem tiver logado
    if (pendingVoiceAlerts.length > 50) pendingVoiceAlerts = pendingVoiceAlerts.slice(-50);
    
    const user = req.query.user;
    if (!user || user.toUpperCase() !== 'MIDNET') {
        return res.json({ alerts: [] });
    }
    
    let alerts = [...pendingVoiceAlerts];
    pendingVoiceAlerts = [];
    res.json({ alerts });
});
`;

if (server.includes("app.get('/api/events/poll'")) {
    // Manual brutal replace wrapper
    let startIdx = server.indexOf("app.get('/api/events/poll'");
    let endIdx = server.indexOf("});", startIdx) + 3;
    let oldEndpoint = server.slice(startIdx, endIdx);
    server = server.replace(oldEndpoint, newPollEndpoint);
    fs.writeFileSync('server.js', server, 'utf8');
}

console.log("IDENTITY_LOCK_APPLIED");
