const fs = require('fs');

const cssString = `
/* --- RESTORED SECURITY OVERLAY --- */
#security-overlay {
    position: fixed;
    top: 0; left: 0;
    width: 100vw; height: 100vh;
    background: rgba(0, 0, 0, 0.85);
    backdrop-filter: blur(20px);
    display: flex;
    justify-content: center;
    align-items: center;
    z-index: 99999;
}

.security-modal {
    background: rgba(10, 15, 25, 0.95);
    border: 2px solid #ff004c;
    border-radius: 15px;
    width: 90%;
    max-width: 400px;
    padding: 30px;
    text-align: center;
    box-shadow: 0 0 50px rgba(255, 0, 76, 0.3);
    color: #fff;
    font-family: 'Orbitron', sans-serif;
}

.security-header {
    margin-bottom: 20px;
}

.security-logo {
    font-size: 3rem;
    margin-bottom: 10px;
    text-shadow: 0 0 20px #ff004c;
}

#security-title {
    color: #ff004c;
    font-size: 1.5rem;
    margin: 0;
    letter-spacing: 2px;
}

#security-msg {
    font-family: 'Roboto', sans-serif;
    color: #ffaaaa;
    font-size: 0.9rem;
    margin-bottom: 25px;
}

.security-inputs {
    display: flex;
    flex-direction: column;
    gap: 15px;
    margin-bottom: 25px;
}

.security-inputs input {
    background: rgba(0, 0, 0, 0.7);
    border: 1px solid rgba(255, 0, 76, 0.5);
    padding: 15px;
    border-radius: 8px;
    color: #fff;
    font-size: 1rem;
    outline: none;
    text-align: center;
    font-family: 'Orbitron', sans-serif;
    transition: 0.3s;
}

.security-inputs input:focus {
    box-shadow: 0 0 15px rgba(255, 0, 76, 0.5);
    border-color: #ff004c;
}

.security-actions {
    display: flex;
    flex-direction: column;
    gap: 10px;
}

.security-actions button {
    padding: 15px;
    border: none;
    border-radius: 8px;
    font-family: 'Orbitron', sans-serif;
    font-weight: bold;
    font-size: 1rem;
    cursor: pointer;
    transition: 0.3s;
    text-transform: uppercase;
}

#sec-login-btn {
    background: #ff004c;
    color: #fff;
    box-shadow: 0 0 20px rgba(255, 0, 76, 0.4);
}

#sec-login-btn:hover {
    background: #ff3366;
    box-shadow: 0 0 30px rgba(255, 0, 76, 0.8);
    transform: scale(1.02);
}

#sec-reg-btn {
    background: transparent;
    border: 1px solid #ff004c;
    color: #ff004c;
}

#sec-reg-btn:hover {
    background: rgba(255, 0, 76, 0.1);
}
`;

fs.appendFileSync('index.css', cssString, 'utf8');
console.log('CSS overlay applied');
