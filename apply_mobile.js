const fs = require('fs');

const cssMobile = `
/* --- MOBILE RESPONSIVENESS (SMARTPHONES) --- */
@media (max-width: 768px) {
    body {
        align-items: stretch;
    }
    
    #app {
        width: 100%;
        height: 100vh;
        max-width: none;
        border-radius: 0;
        padding: 10px;
        display: flex;
        flex-direction: column;
        border: none;
        box-shadow: none;
    }

    header h1 {
        font-size: 2rem;
        letter-spacing: 5px;
    }
    
    #intelligence-bar {
        width: 100%;
        max-width: 250px;
    }

    main {
        display: flex;
        flex-direction: column;
        flex: 1;
        gap: 10px;
        height: 0; /* Let flex handle height */
    }

    .face-container {
        flex: 0 0 120px; /* Small fixed height for the face */
        min-height: 120px;
    }

    .head-wrapper {
        width: auto;
        height: 100%;
        aspect-ratio: 4/5;
        margin: 0 auto;
    }

    .chat-container {
        flex: 1;
        height: auto;
        overflow: hidden;
    }

    #chat-box {
        flex: 1;
        padding: 10px;
        font-size: 0.9rem;
    }

    .input-area {
        flex-wrap: wrap;
        gap: 5px;
    }

    #user-input {
        flex: 1 1 100%;
        width: 100%;
        font-size: 1rem; /* Prevents iOS auto-zoom */
        padding: 12px;
    }

    .input-area button {
        flex: 1;
        font-size: 0.8rem;
        padding: 10px;
    }
    
    #wipe-wa-btn {
        flex: 2; /* Make the wipe button slightly wider */
    }

    .security-modal {
        width: 95%;
        padding: 20px;
    }

    #security-title {
        font-size: 1.2rem;
    }
}
`;

fs.appendFileSync('index.css', cssMobile, 'utf8');
console.log('MOBILE_APPLIED');
