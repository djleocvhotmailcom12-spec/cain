const fs = require('fs');

let css = fs.readFileSync('index.css', 'utf8');

const marker = '/* --- MOBILE RESPONSIVENESS (SMARTPHONES) --- */';
if (css.includes(marker)) {
    css = css.split(marker)[0];
}

const cssMobile = `
/* --- MOBILE RESPONSIVENESS (SMARTPHONES) --- */
@media (max-width: 768px) {
    html, body {
        height: 100%;
        overflow: hidden;
        margin: 0;
        padding: 0;
    }
    
    #app {
        width: 100vw;
        height: 100dvh; /* Dynamic viewport para não esconder sob a barra de navegação */
        max-height: 100dvh;
        max-width: none;
        border-radius: 0;
        padding: 5px;
        display: flex;
        flex-direction: column;
        border: none;
        box-shadow: none;
        margin: 0;
    }

    header {
        flex: 0 0 auto;
        margin-bottom: 2px;
    }

    header h1 {
        font-size: 1.5rem;
        letter-spacing: 2px;
    }
    
    #intelligence-bar {
        width: 100%;
        max-width: 250px;
        margin: 2px auto;
    }

    main {
        display: flex;
        flex-direction: column;
        flex: 1;
        min-height: 0; /* SECREDO DO FLEX: impede que o filho expulse outros elementos */
        gap: 5px;
    }

    .face-container {
        flex: 0 0 80px; /* Rosto muito menor para poupar espaço vertical */
        min-height: 80px;
    }

    .head-wrapper {
        width: auto;
        height: 100%;
        aspect-ratio: 4/5;
        margin: 0 auto;
    }

    .chat-container {
        flex: 1;
        min-height: 0; /* SECREDO DO FLEX */
        display: flex;
        flex-direction: column;
        background: transparent;
        padding: 0;
        border: none;
    }

    #chat-box {
        flex: 1;
        padding: 5px;
        font-size: 0.9rem;
        min-height: 0;
        overflow-y: auto;
    }

    .input-area {
        flex: 0 0 auto;
        display: flex;
        flex-wrap: wrap;
        gap: 5px;
        padding: 5px 0 0 0;
        background: var(--bg-color); /* Fundo sólido para não misturar caso passe */
    }

    #user-input {
        flex: 1 1 100%;
        width: 100%;
        font-size: 16px; /* Evita zoom automático no input em celulares iOS */
        padding: 10px;
        border-radius: 5px;
    }

    .input-area button {
        flex: 1;
        font-size: 0.8rem;
        padding: 10px 5px;
        margin: 0;
    }
    
    #wipe-wa-btn {
        flex: 1.5; /* Ligeiramente maior se for necessário */
    }

    .security-modal {
        width: 95%;
        padding: 15px;
        max-height: 90vh;
        overflow-y: auto;
    }

    #security-title {
        font-size: 1.1rem;
    }
}
`;

fs.writeFileSync('index.css', css + cssMobile, 'utf8');
console.log('MOBILE_FIX_APPLIED');
