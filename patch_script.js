const fs = require('fs');
let code = fs.readFileSync('server.js', 'utf8');

const target = `
    res.json({ 
        response: responseText, 
        from_web: fromWeb, 
        intelligence: getIntelligenceStats(), 
        language: detectedLang,
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});
`;

const replacement = `    res.json({ 
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
            const match = stdout.match(/\\d+/);
            if (match) cpuLoad = parseInt(match[0]);
        }
        
        res.json({
            cpu: cpuLoad,
            memory: memUsage,
            clients: activeClients.size,
            uptime: Math.round(os.uptime() / 60), // em minutos
            os: \`\${os.type()} \${os.arch()}\`,
            platform: os.platform()
        });
    });
});

app.post('/clear_chat', (req, res) => {
    const user = req.body.user ? req.body.user.toUpperCase() : null;
    if (user !== 'MIDNET') {
        return res.status(403).json({ error: "Acesso Negado: Apenas a conta MIDNET pode apagar o WhatsApp." });
    }
    try {
        mikwebChatMessages = [];
        pendingVoiceAlerts = [];
        if (fs.existsSync(CHAT_FILE)) fs.writeFileSync(CHAT_FILE, JSON.stringify([]));
        
        if (fs.existsSync(CHAT_UPLOAD_DIR)) {
            const files = fs.readdirSync(CHAT_UPLOAD_DIR);
            files.forEach(f => {
                try { fs.unlinkSync(path.join(CHAT_UPLOAD_DIR, f)); } catch(e){}
            });
        }
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});
`;

code = code.replace(target.trim(), replacement.trim());
fs.writeFileSync('server.js', code);
