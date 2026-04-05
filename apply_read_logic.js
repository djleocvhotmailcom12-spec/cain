const fs = require('fs');

let s = fs.readFileSync('script.js', 'utf8');

// 1. Apagar os speek() automáticos do pollSACEvents e fetchHistorySAC
s = s.replace(/if \(alert\.text\) speak\(alert\.text, 'pt-BR'\);/g, "/* auto-speak desligado */");
s = s.replace(/speak\('O histórico de mídias e recibos foi.*?'pt-BR'\);/, "/* historico silencioso */");

// 2. Injetar o interceptador "ler mensagem" no sendMessage
const newTrigger = `
    const lowerMsgCommand = message.toLowerCase().replace(/[^a-z \\n]/g, '').trim();

    if (lowerMsgCommand.startsWith('ler mensagem') || lowerMsgCommand.startsWith('ler mensagens')) {
        const targetName = lowerMsgCommand.replace('ler mensagens', '').replace('ler mensagem', '').replace('de', '').trim();
        if (targetName) {
            if (typeof window.readMessagesFor === 'function') window.readMessagesFor(targetName);
        } else {
            speak('Por favor, diga o nome do cliente. Exemplo: Ler mensagem de João.', 'pt-BR');
        }
        return;
    }

    if (lowerMsgCommand === 'ver mensagem antigas' || lowerMsgCommand === 'ver mensagens antigas') {
`;
s = s.replace("    const lowerMsgCommand = message.toLowerCase().replace(/[^a-z \\n]/g, '').trim();\n    if (lowerMsgCommand === 'ver mensagem antigas' || lowerMsgCommand === 'ver mensagens antigas') {", newTrigger);
s = s.replace("    const lowerMsgCommand = message.toLowerCase().replace(/[^a-z \\r\\n]/g, '').trim();\r\n    if (lowerMsgCommand === 'ver mensagem antigas' || lowerMsgCommand === 'ver mensagens antigas') {", newTrigger);

// 3. Adicionar a função readMessagesFor no final
const readFunc = `
window.readMessagesFor = function(name) {
    const bubbles = document.querySelectorAll('.sac-message-bubble');
    let messagesFound = [];
    bubbles.forEach(b => {
        const header = b.querySelector('.sac-header');
        if (header && header.textContent.toLowerCase().includes(name.toLowerCase())) {
            const body = b.querySelector('.sac-text-body');
            if (body) {
                // Ignore empty or weird lines, just text
                if(body.textContent.trim().length > 0) messagesFound.push(body.textContent.trim());
            }
        }
    });

    if (messagesFound.length > 0) {
        speak(\`Mensagens localizadas na tela para \${name}: \` + messagesFound.join('. Próxima mensagem: '), 'pt-BR');
    } else {
        speak(\`Senhor, não encontrei nenhuma mensagem de texto de \${name} no painel atual.\`, 'pt-BR');
    }
};
`;

if (!s.includes('window.readMessagesFor = function')) {
    s += "\n" + readFunc;
}

fs.writeFileSync('script.js', s, 'utf8');
console.log("PATCH COMPLETE");
