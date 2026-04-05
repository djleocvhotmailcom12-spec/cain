const fs = require('fs');
let s = fs.readFileSync('server.js', 'utf8');

if (s.includes("app.get('/stats', (req, res) => {\\n    res.json(getIntelligenceStats());\\n});")) {
    s = s.replace("app.get('/stats', (req, res) => {\\n    res.json(getIntelligenceStats());\\n});", "app.get('/stats', (req, res) => {\\n    try {\\n        if (typeof getIntelligenceStats === 'function') {\\n            res.json(getIntelligenceStats());\\n        } else {\\n            const keysCount = Object.keys(memory || {}).length;\\n            const pct = Math.min(100, Math.floor((keysCount / 500) * 100));\\n            res.json({ count: keysCount, percentage: pct });\\n        }\\n    } catch (e) {\\n        res.json({ percentage: 0, error: e.message });\\n    }\\n});");
    fs.writeFileSync('server.js', s);
    console.log('PATCHED');
} else {
    // maybe spacing is different
    const p1 = s.indexOf("app.get('/stats', (req, res) => {");
    if (p1 !== -1) {
        const p2 = s.indexOf("});", p1) + 3;
        const oldBlock = s.substring(p1, p2);
        const newBlock = "app.get('/stats', (req, res) => {\\n    try {\\n        if (typeof getIntelligenceStats === 'function') {\\n            res.json(getIntelligenceStats());\\n        } else {\\n            const keysCount = Object.keys(memory || {}).length;\\n            const pct = Math.min(100, Math.floor((keysCount / 500) * 100));\\n            res.json({ count: keysCount, percentage: pct });\\n        }\\n    } catch (e) {\\n        res.json({ percentage: 0, error: e.message });\\n    }\\n});";
        s = s.replace(oldBlock, newBlock);
        fs.writeFileSync('server.js', s);
        console.log('PATCHED ALTERNATIVE');
    } else {
        console.log('NOT FOUND');
    }
}
