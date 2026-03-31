const chatBox = document.getElementById('chat-box');
const userInput = document.getElementById('user-input');
const sendBtn = document.getElementById('send-btn');
const voiceBtn = document.getElementById('voice-btn');
const head = document.getElementById('cain-head');
const mouth = document.getElementById('cain-mouth-v2');
const pupils = document.querySelectorAll('.pupil');

// Intelligence UI Elements
const intelPct = document.getElementById('intelligence-pct');
const intelFill = document.getElementById('intelligence-fill');

function updateIntelligence(stats) {
    if (!stats) return;
    if (intelPct) intelPct.textContent = stats.percentage;
    if (intelFill) intelFill.style.width = stats.percentage + '%';
}

async function syncIntelligence() {
    try {
        const res = await fetch('/stats');
        const data = await res.json();
        updateIntelligence(data);
        
        // Also sync system stats for HUD
        syncSystemStats();
    } catch (e) {
        console.error("Erro ao sincronizar inteligência:", e);
    }
}

async function syncSystemStats() {
    try {
        const res = await fetch('/sys/stats');
        const data = await res.json();
        if (document.getElementById('cpu-val')) document.getElementById('cpu-val').textContent = data.cpu;
        if (document.getElementById('mem-val')) document.getElementById('mem-val').textContent = data.memory;
        if (document.getElementById('client-val')) document.getElementById('client-val').textContent = data.clients;
    } catch (e) {}
}

async function singLyrics(text) {
    const lines = text.split('\n').filter(l => l.trim().length > 0);
    const face = document.querySelector('.face-container');
    face.classList.add('singer-active');
    
    // Stop any current speech
    window.speechSynthesis.cancel();
    
    for (let i = 0; i < lines.length; i++) {
        const words = lines[i].trim().split(' ');
        for (let j = 0; j < words.length; j++) {
            // Oscila o tom por palavra para dar "melodia"
            const pitch = 0.7 + (Math.sin(i + j) * 0.5) + (Math.random() * 0.2); 
            const rate = 0.9;
            
            await new Promise(resolve => {
                const utterance = new SpeechSynthesisUtterance(words[j]);
                utterance.lang = 'pt-BR';
                utterance.pitch = Math.max(0.5, Math.min(2.0, pitch));
                utterance.rate = rate;
                utterance.onend = resolve;
                window.speechSynthesis.speak(utterance);
            });
        }
        // Pausa entre versos
        await new Promise(r => setTimeout(r, 400));
    }
    
    face.classList.remove('singer-active');
}

function handleClientAction(action) {
    if (!action) return;
    console.log("[CAIN ACTION]:", action);
    
    let autoSuccess = false;
    try {
        switch (action.type) {
            case 'open_url':
                autoSuccess = !!window.open(action.data, '_blank');
                break;
            case 'search':
                autoSuccess = !!window.open(`https://www.google.com/search?q=${encodeURIComponent(action.data)}`, '_blank');
                break;
            case 'maps':
                const mapHud = document.getElementById('map-target-hud');
                const miniMap = document.getElementById('mini-map');
                if (mapHud && miniMap) {
                    miniMap.src = `https://www.google.com/maps?q=${encodeURIComponent(action.data)}&output=embed`;
                    mapHud.classList.remove('hidden');
                }
                autoSuccess = !!window.open(`https://www.google.com/maps/search/${encodeURIComponent(action.data)}`, '_blank');
                break;
            case 'map_clients':
                const mHud = document.getElementById('map-target-hud');
                const mIframe = document.getElementById('mini-map');
                if (mHud && mIframe) {
                    const locs = action.data;
                    const first = locs.find(l => l.lat);
                    if (first) {
                        mIframe.src = `https://www.google.com/maps?q=${first.lat},${first.lon}&output=embed`;
                    }
                    mHud.classList.remove('hidden');
                    
                    let html = '<div class="ip-list"><h3>CONEXÕES ATIVAS</h3>';
                    locs.forEach(l => {
                        html += `<div class="ip-item"><span>📍 ${l.ip}</span><br><small>${l.city}, ${l.country}</small></div>`;
                    });
                    html += '</div>';
                    
                    const old = mHud.querySelector('.ip-list');
                    if (old) old.remove();
                    mHud.insertAdjacentHTML('beforeend', html);
                }
                autoSuccess = true;
                break;
            case 'play_music':
                const lyricsText = document.querySelector('.cain-message:last-child')?.textContent || "";
                if (lyricsText.includes("LETRAS:")) {
                    const cleanLyrics = lyricsText.split("LETRAS:")[1].split("...")[0];
                    singLyrics(cleanLyrics);
                }
                autoSuccess = !!window.open(`https://www.youtube.com/results?search_query=${encodeURIComponent(action.data + " official audio")}`, '_blank');
                break;
            case 'print':
                window.print();
                autoSuccess = true;
                break;
            case 'note':
                downloadNote(action.data);
                autoSuccess = true;
                break;
        }
    } catch (e) {
        autoSuccess = false;
    }

    // Se o navegador bloqueou o popup, adicionamos um botão na mensagem
    if (!autoSuccess && (action.type === 'open_url' || action.type === 'search')) {
        const lastCAIN = document.querySelector('.cain-message:last-child');
        if (lastCAIN) {
            const btn = document.createElement('button');
            btn.innerHTML = '🔗 CLIQUE AQUI PARA ABRIR';
            btn.className = 'action-btn';
            btn.onclick = () => window.open(action.type === 'search' ? `https://www.google.com/search?q=${encodeURIComponent(action.data)}` : action.data, '_blank');
            lastCAIN.appendChild(btn);
        }
    }
}

function downloadNote(text) {
    const blob = new Blob([text], { type: 'text/plain' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'CAIN_Nota.txt';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
}

// Web Speech API
const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
const recognition = SpeechRecognition ? new SpeechRecognition() : null;
const synth = window.speechSynthesis;

let isSpeaking = false;
let currentLanguage = 'pt-BR';
let selectedVoice = null;

// Load Voices and Select Male
function loadVoices() {
    const voices = synth.getVoices();
    // Try to find a male-sounding Portuguese voice
    selectedVoice = voices.find(v => v.lang.includes('pt-BR') && (v.name.includes('Google') || v.name.includes('Daniel') || v.name.includes('Male'))) 
                   || voices.find(v => v.lang.includes('pt-BR'))
                   || voices[0];
}

if (synth.onvoiceschanged !== undefined) {
    synth.onvoiceschanged = loadVoices;
}
loadVoices();

let eyePos = { x: 0, y: 0 };
let targetPos = { x: 0, y: 0 };
let mousePos = { x: 0, y: 0 };

// Realistic Saccadic Eye Movement
function animateEyes() {
    // Smooth transition towards target
    eyePos.x += (targetPos.x - eyePos.x) * 0.2;
    eyePos.y += (targetPos.y - eyePos.y) * 0.2;

    pupils.forEach(p => {
        p.style.transform = `translate(${eyePos.x}px, ${eyePos.y}px)`;
        p.style.transition = 'none'; 
    });

    // Random Blink
    if (Math.random() > 0.99) {
        document.body.classList.add('blinking');
        setTimeout(() => document.body.classList.remove('blinking'), 100);
    }

    // Occasional random saccade (jump) even when tracking
    if (Math.random() > 0.98) {
        targetPos.x = mousePos.x + (Math.random() - 0.5) * 10;
        targetPos.y = mousePos.y + (Math.random() - 0.5) * 5;
    } else {
        // Most of the time, follow mouse
        targetPos.x = mousePos.x;
        targetPos.y = mousePos.y;
    }
}
setInterval(animateEyes, 30); // Higher frequency for smooth damping

if (recognition) {
    recognition.lang = currentLanguage;
    recognition.continuous = false;
    recognition.interimResults = false;

    recognition.onresult = (event) => {
        const transcript = event.results[0][0].transcript;
        userInput.value = transcript;
        sendMessage();
    };

    recognition.onend = () => {
        voiceBtn.style.boxShadow = 'none';
    };
}

voiceBtn.addEventListener('click', () => {
    if (recognition) {
        recognition.start();
        voiceBtn.style.boxShadow = '0 0 15px white';
    } else {
        alert('Seu navegador não suporta reconhecimento de voz.');
    }
});

async function sendMessage() {
    const message = userInput.value.trim();
    if (!message) return;

    // Check if message is the security code and stop lockdown immediately
    if (message.includes("1994leo14725863") && document.body.classList.contains('lockdown-active')) {
        stopLockdown();
        userInput.value = '';
        return;
    }

    addMessage('user', message);
    userInput.value = '';

    let searchIndicator = null;
    const searchTimeout = setTimeout(() => {
        searchIndicator = document.createElement('div');
        searchIndicator.className = 'message cain-message searching';
        searchIndicator.textContent = "[CAIN está pesquisando na rede mundial...]";
        chatBox.appendChild(searchIndicator);
        chatBox.scrollTop = chatBox.scrollHeight;
    }, 800);

    try {
        const response = await fetch('/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ message })
        });

        clearTimeout(searchTimeout);
        if (searchIndicator) searchIndicator.remove();

        const data = await response.json();
        
        if (data.intelligence) {
            updateIntelligence(data.intelligence);
        }

        addMessage('cain', data.response);

        if (data.action && data.action.type === 'play_music') {
            handleClientAction(data.action);
        } else {
            speak(data.response, 'pt-BR');
            if (data.action) {
                handleClientAction(data.action);
            }
        }

        if (data.lockdown) {
            startLockdown();
        }

        if (data.action) {
            handleClientAction(data.action);
        }

    } catch (error) {
        console.error('Error:', error);
        addMessage('cain', "Tive uma falha de conexão. Pode tentar novamente?");
    }
}

sendBtn.addEventListener('click', sendMessage);
userInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') sendMessage();
});

function addMessage(sender, text) {
    const div = document.createElement('div');
    div.className = `message ${sender}-message`;
    div.textContent = text;
    chatBox.appendChild(div);
    chatBox.scrollTop = chatBox.scrollHeight;
}

function speak(text, lang = 'pt-BR') {
    if (!synth) return;

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = lang;
    if (selectedVoice) utterance.voice = selectedVoice;
    
    // Pitch and Rate for a more robotic but clearly male tone
    utterance.pitch = 0.85; 
    utterance.rate = 0.85; // Um pouco mais lento, conforme solicitado

    utterance.onstart = () => {
        isSpeaking = true;
        document.body.classList.add('speaking');
    };

    utterance.onend = () => {
        isSpeaking = false;
        document.body.classList.remove('speaking');
        // Return pupils to center
        pupils.forEach(p => p.style.transform = `translate(0, 0)`);
    };

    synth.speak(utterance);
}

let hasInteracted = false;

function welcome() {
    if (hasInteracted) return;
    hasInteracted = true;
    addMessage('cain', "Sou o CAIN. Como posso ajudar VOCÊ?");
    speak("Sou o CAIN. Como posso ajudar VOCÊ?");
}

// Trigger welcome on first click or interaction
document.addEventListener('click', welcome, { once: true });
document.addEventListener('keypress', welcome, { once: true });

window.onload = () => {
    loadVoices();
    syncIntelligence();
    setInterval(syncIntelligence, 30000); // Poll every 30s
    setInterval(syncSystemStats, 5000); // Poll every 5s (HUD real-time)
};

// Mouse tracking for head and eyes
document.addEventListener('mousemove', (e) => {
    // Relative coordinates to the center of the screen
    mousePos.x = (e.clientX / window.innerWidth - 0.5) * 35; // Reduced range
    mousePos.y = (e.clientY / window.innerHeight - 0.5) * 25; // Reduced range
    
    // Smooth head movement follows mouse
    head.style.transform = `rotateY(${mousePos.x/4}deg) rotateX(${-mousePos.y/4}deg)`;
});

// Lockdown Mode Logic
let lockTimer = null;
let timeLeft = 600;

function startLockdown() {
    const lockPanel = document.getElementById('lock-panel');
    const timerDisplay = document.getElementById('lock-timer');
    const securityInput = document.getElementById('security-code');
    const unlockBtn = document.getElementById('unlock-btn');
    
    lockPanel.classList.remove('hidden');
    document.body.classList.add('lockdown-active');
    
    // Reset timer
    timeLeft = 600;
    if (lockTimer) clearInterval(lockTimer);
    
    lockTimer = setInterval(() => {
        timeLeft--;
        const mins = Math.floor(timeLeft / 60);
        const secs = timeLeft % 60;
        timerDisplay.textContent = `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
        if (timeLeft === 600) speak("MODO DE BLOQUEIO ATIVADO. AUTODESTRUIÇÃO EM 10 MINUTOS.", "pt-BR");
        
        // Avisos periódicos (cada minuto)
        if (timeLeft > 60 && timeLeft % 60 === 0) {
            speak(`Faltam ${mins} minutos para a limpeza total.`, "pt-BR");
        } else if (timeLeft === 60) {
            speak("Atenção: Um minuto restante.", "pt-BR");
        } else if (timeLeft === 30) {
            speak("30 segundos restantes.", "pt-BR");
        } else if (timeLeft === 15) {
            speak("15 segundos.", "pt-BR");
        }
        
        // Contagem regressiva final segundo a segundo (10 a 1)
        if (timeLeft <= 10 && timeLeft > 0) {
            window.speechSynthesis.cancel(); 
            speak(timeLeft.toString(), "pt-BR");
        }

        if (timeLeft <= 0) {
            clearInterval(lockTimer);
            executeWipe();
        }
    }, 1000);
    
    unlockBtn.onclick = () => {
        if (securityInput.value.trim() === "1994leo14725863") {
            stopLockdown();
        } else {
            securityInput.style.border = "2px solid #ff0000";
            securityInput.style.animation = "shake 0.5s";
            setTimeout(() => {
                securityInput.style.border = "1px solid #ff004c";
                securityInput.style.animation = "";
            }, 500);
        }
    }
}

function stopLockdown() {
    const lockPanel = document.getElementById('lock-panel');
    const securityInput = document.getElementById('security-code');
    clearInterval(lockTimer);
    lockPanel.classList.add('hidden');
    document.body.classList.remove('lockdown-active');
    timeLeft = 600;
    securityInput.value = "";
    addMessage('cain', "Bloqueio cancelado. Sistema restaurado.");
    speak("Bloqueio cancelado. Sistema restaurado.", "pt-BR");
}

async function executeWipe() {
    try {
        await fetch('/lockdown/wipe', { method: 'POST' });
        document.body.innerHTML = "<div style='color:red; font-family:Orbitron; text-align:center; padding-top:20%; font-size:3rem;'>SISTEMA APAGADO PERMANENTEMENTE</div>";
        setTimeout(() => location.reload(), 5000);
    } catch (e) {
        console.error("Erro no wipe:", e);
    }
}

// PWA Install Logic
let deferredPrompt;
const installPrompt = document.getElementById('pwa-install-prompt');
const installAcceptBtn = document.getElementById('install-accept-btn');
const installCloseBtn = document.getElementById('install-close-btn');

window.addEventListener('beforeinstallprompt', (e) => {
    // Prevent the mini-infobar from appearing on mobile
    e.preventDefault();
    // Stash the event so it can be triggered later.
    deferredPrompt = e;
    // Update UI notify the user they can install the PWA
    if (installPrompt) installPrompt.classList.remove('hidden');
});

if (installAcceptBtn) {
    installAcceptBtn.addEventListener('click', async () => {
        if (!deferredPrompt) return;
        // Show the install prompt
        deferredPrompt.prompt();
        // Wait for the user to respond to the prompt
        const { outcome } = await deferredPrompt.userChoice;
        console.log(`User response to the install prompt: ${outcome}`);
        // We've used the prompt, and can't use it again, throw it away
        deferredPrompt = null;
        // Hide the custom prompt
        if (installPrompt) installPrompt.classList.add('hidden');
    });
}

if (installCloseBtn) {
    installCloseBtn.addEventListener('click', () => {
        if (installPrompt) installPrompt.classList.add('hidden');
    });
}

window.addEventListener('appinstalled', (event) => {
    console.log('👍', 'appinstalled', event);
    // Clear the deferredPrompt so it can be garbage collected
    deferredPrompt = null;
    if (installPrompt) installPrompt.classList.add('hidden');
});
