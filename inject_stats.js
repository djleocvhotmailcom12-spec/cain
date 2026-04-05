const fs = require('fs');
let s = fs.readFileSync('server.js', 'utf8');

const missingEndpoints = `
app.get('/stats', (req, res) => {
    res.json(getIntelligenceStats());
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

app.post('/lockdown/wipe', (req, res) => {
    const { user } = req.body;
    const username = user ? user.toLowerCase() : null;
    let targetDir = KNOWLEDGE_PATH;

    if (username) {
        targetDir = path.join(KNOWLEDGE_PATH, username);
    }

    try {
        if (fs.existsSync(targetDir)) {
            const files = fs.readdirSync(targetDir);
            files.forEach(file => {
                if (file.endsWith('.json')) {
                    fs.unlinkSync(path.join(targetDir, file));
                }
            });
            if (username) {
                memory[username] = {};
            } else {
                memory = {};
            }
            console.log(\`SISTEMA WIPED: Conhecimento de \${username || 'global'} apagado.\`);
        }
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Export all knowledge for offline PWA sync
app.get('/knowledge/export', (req, res) => {
    const { user } = req.query;
    const username = user ? user.toLowerCase() : null;
    
    try {
        const exportData = {};
        const loadFromDir = (dir) => {
            if (!fs.existsSync(dir)) return;
            const files = fs.readdirSync(dir);
            files.forEach(file => {
                if (file.endsWith('.json') && !fs.statSync(path.join(dir, file)).isDirectory()) {
                    const content = fs.readFileSync(path.join(dir, file), 'utf8');
                    try { Object.assign(exportData, JSON.parse(content)); } catch (e) {}
                }
            });
        };

        loadFromDir(KNOWLEDGE_PATH);
        if (username) loadFromDir(path.join(KNOWLEDGE_PATH, username));

        console.log(\`[SYNC]: Exportando \${Object.keys(exportData).length} tópicos para o PWA (Contexto: \${username || 'global'}).\`);
        res.json(exportData);
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: "Falha ao exportar memória." });
    }
});

`;

if (!s.includes("app.get('/sys/stats'")) {
    s = s.replace("app.listen(PORT, '0.0.0.0', () => {", missingEndpoints + "\napp.listen(PORT, '0.0.0.0', () => {");
    fs.writeFileSync('server.js', s);
    console.log("INJECTED MISSING ENDPOINTS");
} else {
    console.log("ALREADY EXISTS");
}
