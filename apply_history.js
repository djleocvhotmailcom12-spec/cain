const fs = require('fs');

const sysAppend = `
app.get('/api/chat/history', async (req, res) => {
    try {
        let historyAlerts = [];
        const searchRes = await axios.get(\`\${MIKWEB_BASE}/messages/search?limit=15\`, { headers: { 'Authorization': \`Bearer \${MIKWEB_TOKEN}\`, 'Accept': 'application/json' }});
        let convs = (searchRes.data && searchRes.data.conversations) ? searchRes.data.conversations : [];
        const uniqueConvs = Array.from(new Map(convs.map(c => [c.id, c])).values());
        
        for (const conv of uniqueConvs) {
            const mRes = await axios.get(\`\${MIKWEB_BASE}/messages?conversation_id=\${conv.id}\`, { headers: { 'Authorization': \`Bearer \${MIKWEB_TOKEN}\`, 'Accept': 'application/json' }});
            if (mRes.data && mRes.data.messages) {
                for (let m of mRes.data.messages) {
                    const isIncoming = m.incoming === true || m.sender_type === 'Contact';
                    if (isIncoming && !m.automatic) {
                        const senderName = (conv.contact && conv.contact.name) ? conv.contact.name : 'Cliente';
                        let alertObj = { isSac: true, senderName: senderName, fileType: 'text', fileUrl: null, textContent: m.content || '' };
                        
                        if (m.attachments && m.attachments.length > 0) {
                            const att = m.attachments[0];
                            let fileName = att.file_name || \`history_file_\${att.id}\`;
                            const ext = path.extname(fileName).toLowerCase();
                            if (att.file_type === 'audio' || ['.ogg', '.mp3'].includes(ext)) alertObj.fileType = 'audio';
                            else if (['image','photo','png','jpg','jpeg'].includes(att.file_type) || ['.jpg','.jpeg','.png','.gif'].includes(ext)) alertObj.fileType = 'photo';
                            else if (ext === '.pdf') alertObj.fileType = 'document';
                            
                            const localPath = await downloadMikwebFile(att.file_url, fileName);
                            if (localPath) alertObj.fileUrl = \`http://181.224.24.70:3100/\${localPath}\`;
                        }
                        historyAlerts.push(alertObj);
                    }
                }
            }
        }
        res.json({ alerts: historyAlerts.slice(-30) }); 
    } catch(e) { res.status(500).json({ error: e.message }); }
});
`;

// Injetar na server.js antes do app.listen
let serverCode = fs.readFileSync('server.js', 'utf8');
serverCode = serverCode.replace("app.listen(PORT, '0.0.0.0', () => {", sysAppend + "\napp.listen(PORT, '0.0.0.0', () => {");
fs.writeFileSync('server.js', serverCode, 'utf8');

// Injetar no script.js o gatilho ver mensagem antigas
let scriptCode = fs.readFileSync('script.js', 'utf8');

const triggerCode = `    userInput.value = '';

    const lowerMsgCommand = message.toLowerCase().replace(/[^a-z \\n]/g, '').trim();
    if (lowerMsgCommand === 'ver mensagem antigas' || lowerMsgCommand === 'ver mensagens antigas') {
        if (typeof window.fetchHistorySAC === 'function') window.fetchHistorySAC();
        return;
    }
`;

scriptCode = scriptCode.replace("    userInput.value = '';", triggerCode);

const frontendAppend = `
window.fetchHistorySAC = async function() {
    addMessage('cain', 'SISTEMA: Conectando aos servidores da matriz. Processando e baixando histórico corporativo do SAC... aguarde um momento pois as mídias estão sendo decodificadas.', true);
    speak('Requisitando arquivos velhos do provedor para sua tela. Isso pode levar alguns segundos.', 'pt-BR');
    try {
        const req = await fetch('/api/chat/history');
        const data = await req.json();
        if (data.alerts && data.alerts.length > 0) {
            data.alerts.forEach(alert => renderSACMessage(alert));
            speak('O histórico de mídias e recibos foi completamente recuperado.', 'pt-BR');
        } else {
            addMessage('cain', 'SISTEMA: Nenhum histórico encontrado.');
            speak('Nenhuma conversa anterior foi localizada nos servidores MIKWEB.', 'pt-BR');
        }
    } catch(e) {
        addMessage('cain', 'SISTEMA: Erro ao baixar histórico.');
        speak('Falha na comunicação de arquivamento.', 'pt-BR');
    }
};
`;

fs.appendFileSync('script.js', frontendAppend, 'utf8');

console.log("HISTORY_PATCH_APPLIED");
