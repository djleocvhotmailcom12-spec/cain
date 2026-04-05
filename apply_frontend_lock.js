const fs = require('fs');

let script = fs.readFileSync('script.js', 'utf8');

const authBlock = `
    if (!isAuthenticated || !currentUser || currentUser.toUpperCase() !== 'MIDNET') {
        addMessage('cain', '🔴 [ACESSO NEGADO] Privilégios insuficientes. Informações confidenciais do MikWeb estão restritas à conta MIDNET.');
        if (typeof speak === 'function') speak('Acesso corporativo negado. Identidade insuficiente para requerer registros financeiros.', 'pt-BR');
        return;
    }
`;

const historyStart = 'window.fetchHistorySAC = async function() {';
if (script.includes(historyStart) && !script.includes('Privilégios insuficientes. Informações confidenciais do MikWeb')) {
    script = script.replace(historyStart, historyStart + "\\n" + authBlock);
}

const recentStart = 'window.fetchRecentSAC = async function() {';
if (script.includes(recentStart) && !script.includes('window.fetchRecentSAC = async function() {' + "\\n" + authBlock)) {
    script = script.replace(recentStart, recentStart + "\\n" + authBlock);
}

const fetchStr = "const response = await fetch('/api/events/poll');";
if (script.includes(fetchStr)) {
    script = script.replace(fetchStr, "const response = await fetch(`/api/events/poll?user=\${encodeURIComponent(currentUser)}`);");
}

fs.writeFileSync('script.js', script, 'utf8');
console.log('CLIENT_LOCKED');
