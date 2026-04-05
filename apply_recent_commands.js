const fs = require('fs');

// ==== 1. SERVER.JS ====
let server = fs.readFileSync('server.js', 'utf8');

const recentEndpoint = `
app.get('/api/chat/recent', async (req, res) => {
    try {
        let historyAlerts = [];
        const searchRes = await axios.get(\`\${MIKWEB_BASE}/messages/search?limit=25\`, { headers: { 'Authorization': \`Bearer \${MIKWEB_TOKEN}\`, 'Accept': 'application/json' }});
        let convs = (searchRes.data && searchRes.data.conversations) ? searchRes.data.conversations : [];
        const uniqueConvs = Array.from(new Map(convs.map(c => [c.id, c])).values());
        
        for (const conv of uniqueConvs) {
            const mRes = await axios.get(\`\${MIKWEB_BASE}/messages?conversation_id=\${conv.id}\`, { headers: { 'Authorization': \`Bearer \${MIKWEB_TOKEN}\`, 'Accept': 'application/json' }});
            if (mRes.data && mRes.data.messages) {
                for (let m of mRes.data.messages) {
                    const isIncoming = m.incoming === true || m.sender_type === 'Contact';
                    if (isIncoming && !m.automatic) {
                        const senderName = (conv.contact && conv.contact.name ? conv.contact.name : 'Cliente');
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
`;

if (!server.includes("app.get('/api/chat/recent'")) {
    server = server.replace("app.listen(", recentEndpoint + "\napp.listen(");
    fs.writeFileSync('server.js', server, 'utf8');
}


// ==== 2. SCRIPT.JS ====
let script = fs.readFileSync('script.js', 'utf8');

const oldTrigger = `    if (lowerMsgCommand === 'ver mensagem antigas' || lowerMsgCommand === 'ver mensagens antigas') {
        if (typeof window.fetchHistorySAC === 'function') window.fetchHistorySAC();
        return;
    }`;

const newTrigger = `    if (lowerMsgCommand.includes('antigas') || lowerMsgCommand === 'ver mensagem antigas' || lowerMsgCommand === 'ver mensagens antigas') {
        if (typeof window.fetchHistorySAC === 'function') window.fetchHistorySAC();
        return;
    }

    if (lowerMsgCommand.includes('recentes') || lowerMsgCommand === 'ver mensagem recentes') {
        if (typeof window.fetchRecentSAC === 'function') window.fetchRecentSAC();
        return;
    }`;

script = script.replace(oldTrigger, newTrigger);

const recentFrontend = `
window.fetchRecentSAC = async function() {
    addMessage('cain', 'SISTEMA: Trazendo as últimas mensagens mais recentes enviadas ao SAC. Aguarde.', true);
    try {
        const req = await fetch('/api/chat/recent');
        const data = await req.json();
        if (data.alerts && data.alerts.length > 0) {
            data.alerts.forEach(alert => renderSACMessage(alert));
        } else {
            addMessage('cain', 'SISTEMA: Nenhuma mensagem recente foi processada.');
        }
    } catch(e) { console.error(e) }
};
`;

if (!script.includes('window.fetchRecentSAC')) {
    script += "\n" + recentFrontend;
}

fs.writeFileSync('script.js', script, 'utf8');
console.log('PATCH_COMMANDS_APPLIED');
