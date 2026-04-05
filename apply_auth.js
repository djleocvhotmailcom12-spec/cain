const fs = require('fs');

const sysAppend = `
// --- SISTEMA DE AUTENTICAÇÃO RESTAURADO ---
function checkAuthStatus() {
    if (!isAuthenticated) {
        document.getElementById('security-overlay').classList.remove('hidden');
        speak('Modo restrito ativado. Insira suas credenciais para destravar a memória.', 'pt-BR');
    }
}

document.getElementById('sec-login-btn').addEventListener('click', () => {
    let name = document.getElementById('sec-name').value.trim();
    let pass = document.getElementById('sec-pass').value.trim();
    if (name && pass) {
        currentUser = name;
        isAuthenticated = true;
        document.getElementById('security-overlay').classList.add('hidden');
        addMessage('cain', '[CAIN]: Acesso Autorizado. Banco de memória configurado para: ' + currentUser + '.');
        speak('Acesso liberado. Bem-vindo de volta, ' + currentUser + '.', 'pt-BR');
    } else {
        alert('Preencha os campos Nome e Senha.');
    }
});

// Add trigger logic to run after start
setTimeout(checkAuthStatus, 500);
`;

fs.appendFileSync('script.js', sysAppend, 'utf8');
