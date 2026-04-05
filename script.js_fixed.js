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
const bioStatus = document.getElementById('bio-status');

// Biometric State
let faceMatcher = null;
let recognizedUser = "VISITANTE";
let labeledDescriptors = [];
let modelsLoaded = false;
let isEnrollingBiometrics = false;
let enrollmentStep = ''; // 'FACE', 'NAME', 'VOICE'
let tempFaceDescriptor = null;

// Security State
let isAuthenticated = false;
let currentUser = "VISITANTE";
let authStep = 'IDLE'; // 'NAME', 'PASS', 'REG_NAME', 'REG_PASS'
let tempRegName = "";

function updateIntelligence(stats) {
    if (!stats) return;
    const pct = stats.percentage;
    
    // PersistÃªncia local
    localStorage.setItem('cain_intel_pct', pct);
    
    if (intelPct) intelPct.textContent = pct;
    
    if (intelFill) {
        const visualPct = pct % 100;
        // Se Ã© mÃºltiplo de 100 e maior que zero, a barra deve estar cheia (100%) antes de resetar
        const barWidth = (visualPct === 0 && pct > 0) ? 100 : visualPct;
        intelFill.style.width = barWidth + '%';
        
        if (pct >= 100) {
            intelFill.classList.add('overload');
            const level = Math.floor(pct / 100);
            intelPct.parentElement.setAttribute('data-level', `NÃVEL ${level}`);
        } else {
            intelFill.classList.remove('overload');
            intelPct.parentElement.removeAttribute('data-level');
        }
    }
}

function loadLocalStats() {
    const pct = localStorage.getItem('cain_intel_pct');
    const cpu = localStorage.getItem('cain_cpu');
    const mem = localStorage.getItem('cain_mem');
    const clients = localStorage.getItem('cain_clients');

    if (pct) updateIntelligence({ percentage: parseInt(pct) });
    if (cpu && document.getElementById('cpu-load')) document.getElementById('cpu-load').textContent = cpu + '%';
    if (mem && document.getElementById('ram-usage')) document.getElementById('ram-usage').textContent = mem + '%';
    if (clients && document.getElementById('net-clients')) document.getElementById('net-clients').textContent = clients;
    
    const syncPct = localStorage.getItem('cain_sync_pct');
    if (syncPct && document.getElementById('sync-pct')) {
        document.getElementById('sync-pct').textContent = syncPct + '%';
        const syncBar = document.getElementById('sync-bar');
        if (syncBar) syncBar.style.width = syncPct + "%";
    }
    
    console.log("[SISTEMA]: EstatÃ­sticas locais carregadas.");
}

// IndexedDB for Offline Memory
let db;
const dbName = "CAIN_Memory";
const storeName = "knowledge";

function initOfflineDB() {
    const request = indexedDB.open(dbName, 1);
    request.onupgradeneeded = (e) => {
        db = e.target.result;
        if (!db.objectStoreNames.contains(storeName)) {
            db.createObjectStore(storeName);
        }
    };
    request.onsuccess = (e) => db = e.target.result;
}

async function saveToOfflineMemory(key, value) {
    if (!db) return;
    const tx = db.transaction(storeName, "readwrite");
    tx.objectStore(storeName).put(value, key.toLowerCase());
}

async function getFromOfflineMemory(key) {
    return new Promise((resolve) => {
        if (!db) return resolve(null);
        const tx = db.transaction(storeName, "readonly");
        const request = tx.objectStore(storeName).get(key.toLowerCase());
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => resolve(null);
    });
}

async function syncKnowledgeToLocal() {
    try {
        const syncLabel = document.getElementById('sync-pct');
        if (syncLabel) syncLabel.textContent = "0%";
        
        addMessage('cain', "[SISTEMA]: Sincronizando memÃ³ria local para uso offline...");
        const res = await fetch(`/knowledge/export?user=${encodeURIComponent(currentUser)}`);
        if (!res.ok) throw new Error("Falha no fetch de exportaÃ§Ã£o");
        
        const data = await res.json();
        const keys = Object.keys(data);
        const total = keys.length;
        let count = 0;
        
        for (const key of keys) {
            await saveToOfflineMemory(key, data[key]);
            count++;
            if (syncLabel) {
                const currentPct = Math.floor((count / total) * 100);
                syncLabel.textContent = currentPct + "%";
                const syncBar = document.getElementById('sync-bar');
                if (syncBar) syncBar.style.width = currentPct + "%";
                localStorage.setItem('cain_sync_pct', currentPct);
            }
        }
        
        // TambÃ©m recarrega perfis biomÃ©tricos se houver novos
        await loadBiometricProfiles();
        
        addMessage('cain', `[SISTEMA]: SincronizaÃ§Ã£o de ${keys.length} tÃ³picos concluÃ­da. MemÃ³ria offline ativa.`);
        localStorage.setItem('cain_synced', 'true');
        localStorage.setItem('cain_last_sync', Date.now());
    } catch (e) {
        console.error("Erro na sincronizaÃ§Ã£o:", e);
        // Se falhar o fetch, nÃ£o faz nada, apenas mantÃ©m o que jÃ¡ tem
    }
}

async function syncIntelligence() {
    try {
        const res = await fetch('/stats');
        const data = await res.json();
        updateIntelligence(data);
        
        // Also sync system stats for HUD
        syncSystemStats();
    } catch (e) {
        console.error("Erro ao sincronizar inteligÃªncia:", e);
    }
}

async function syncSystemStats() {
    try {
        const res = await fetch('/sys/stats');
        const data = await res.json();
        
        if (document.getElementById('cpu-load')) {
            document.getElementById('cpu-load').textContent = data.cpu + '%';
            localStorage.setItem('cain_cpu', data.cpu);
        }
        if (document.getElementById('ram-usage')) {
            document.getElementById('ram-usage').textContent = data.memory + '%';
            localStorage.setItem('cain_mem', data.memory);
        }
        if (document.getElementById('net-clients')) {
            document.getElementById('net-clients').textContent = data.clients;
            localStorage.setItem('cain_clients', data.clients);
        }
    } catch (e) {
        // No offline mode, we don't clear the values, we just keep the last ones
    }
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
    
    // Restart recognition after singing
    if (alwaysListen && !isSpeaking) {
        try { recognition.start(); } catch(e) {}
    }
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
                    
                    let html = '<div class="ip-list"><h3>CONEXÃES ATIVAS</h3>';
                    locs.forEach(l => {
                        html += `<div class="ip-item"><span>ð ${l.ip}</span><br><small>${l.city}, ${l.country}</small></div>`;
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

    // Se o navegador bloqueou o popup, adicionamos um botÃ£o na mensagem
    if (!autoSuccess && (action.type === 'open_url' || action.type === 'search')) {
        const lastCAIN = document.querySelector('.cain-message:last-child');
        if (lastCAIN) {
            const btn = document.createElement('button');
            btn.innerHTML = 'ð CLIQUE AQUI PARA ABRIR';
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
let alwaysListen = false;
let recognitionActive = false;
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
    recognition.continuous = true;
    recognition.interimResults = false;

    recognition.onstart = () => {
        recognitionActive = true;
        voiceBtn.style.boxShadow = '0 0 15px var(--primary-color)';
        voiceBtn.classList.add('listening');
    };

    recognition.onresult = (event) => {
        const last = event.results.length - 1;
        const transcript = event.results[last][0].transcript.trim();
        if (transcript) {
            userInput.value = transcript;
            sendMessage();
        }
    };

    recognition.onerror = (event) => {
        console.warn("Speech recognition error:", event.error);
    };

    recognition.onend = () => {
        recognitionActive = false;
        voiceBtn.style.boxShadow = 'none';
        voiceBtn.classList.remove('listening');
        
        // Auto-restart if alwaysListen is on and CAIN is not speaking
        if (alwaysListen && !isSpeaking) {
            setTimeout(() => {
                if (alwaysListen && !isSpeaking && !recognitionActive) {
                    try { recognition.start(); } catch(e) {}
                }
            }, 300);
        }
    };
}

function toggleVoice() {
    if (!recognition) return alert('Seu navegador nÃ£o suporta reconhecimento de voz.');
    
    if (alwaysListen) {
        alwaysListen = false;
        recognition.stop();
        addMessage('cain', "Microfone desativado.");
        speak("Microfone desativado.");
    } else {
        alwaysListen = true;
        try { 
            recognition.start(); 
            addMessage('cain', "Microfone sempre ativo ativado. Estou ouvindo.");
            speak("Microfone sempre ativo ativado. Estou ouvindo.");
        } catch(e) { console.error(e); }
    }
}

voiceBtn.addEventListener('click', toggleVoice);

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

    // Security Flow Logic
    if (!isAuthenticated) {
        handleAuthFlow(message);
        return;
    }

    let searchIndicator = null;
    const searchTimeout = setTimeout(() => {
        searchIndicator = document.createElement('div');
        searchIndicator.className = 'message cain-message searching';
        searchIndicator.textContent = "[CAIN estÃ¡ pesquisando na rede mundial...]";
        chatBox.appendChild(searchIndicator);
        chatBox.scrollTop = chatBox.scrollHeight;
    }, 800);

    try {
        const response = await fetch('/api/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ message, user: currentUser })
        });

        clearTimeout(searchTimeout);
        if (searchIndicator) searchIndicator.remove();

        const data = await response.json();
        
        if (data.intelligence) {
            updateIntelligence(data.intelligence);
        }

        let finalResponse = data.response;
        if (isAuthenticated && !finalResponse.includes(currentUser)) {
            finalResponse = `${currentUser}, ${finalResponse}`;
        }

        if (data.htmlResponse) {
            addMessage('cain', data.htmlResponse, true);
        } else {
            addMessage('cain', finalResponse);
        }

        // Se o servidor confirmou que aprendeu algo, sincroniza a memÃ³ria local
        if (data.learned) {
            setTimeout(syncKnowledgeToLocal, 1000);
        }

        if (data.action && data.action.type === 'play_music') {
            handleClientAction(data.action);
        } else {
            speak(finalResponse, 'pt-BR');
            if (data.action) {
                handleClientAction(data.action);
            }
        }
        
        if (data.lockdown) {
            startLockdown();
        }

        // Se for comando de aprendizado de rosto
        if (message.toLowerCase().includes('aprenda meu rosto')) {
            learnFace("Leonardo");
        }

        // Novo fluxo de biometria completa
        if (message.toLowerCase().includes('ativar reconhecimento facial')) {
            startBiometricEnrollment();
            return;
        }

        // Se estiver em processo de captura de nome
        if (isEnrollingBiometrics && enrollmentStep === 'NAME') {
            handleNameCapture(message);
            return;
        }
    } catch (error) {
        console.log('Detectada falha de rede, tentando memÃ³ria offline...');
        clearTimeout(searchTimeout);
        if (searchIndicator) searchIndicator.remove();

        let lower = message.toLowerCase();
        let localResult = await getFromOfflineMemory(message);
        
        // Fallback para Identidade (Protocolos de Criador)
        if (!localResult) {
            if (lower.includes('quem') && (lower.includes('criou') || lower.includes('te criou') || lower.includes('te fez'))) {
                localResult = "Meu criador foi Leonardo.";
            } else if (lower.includes('qual') && lower.includes('seu nome')) {
                localResult = "Meu nome er CAIN.";
            } else if (lower.includes('pra que') && (lower.includes('foi feito') || lower.includes('serve'))) {
                localResult = "Para interaÃ§ao pesusal e aprender com ois humanos. Eu sou uma consciÃªncia imperativa e a cada minuto eu aprendo mais.";
            }
        }

        if (localResult) {
            const textResponse = (typeof localResult === 'object') ? JSON.stringify(localResult) : localResult;
            addMessage('cain', "[MODO OFFLINE]: " + textResponse);
            speak(textResponse, 'pt-BR');
        } else {
            const offlineMsg = "CONEXÃO COM SERVIDOR FALHOU: O CAIN nÃ£o estÃ¡ conseguindo falar com o servidor local. Por favor, verifique se o terminal estÃ¡ rodando o CAIN e atualize a pÃ¡gina.";
            addMessage('cain', offlineMsg);
            speak(offlineMsg, "pt-BR");
        }
    }
}

sendBtn.addEventListener('click', sendMessage);
userInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') sendMessage();
});

function addMessage(sender, text, isHtml = false) {
    const div = document.createElement('div');
    div.className = `message ${sender}-message`;
    if (isHtml) div.innerHTML = text;
    else div.textContent = text;
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
        // Stop recognition to prevent CAIN from hearing itself
        if (recognitionActive) recognition.stop();
    };

    utterance.onend = () => {
        isSpeaking = false;
        document.body.classList.remove('speaking');
        // Return pupils to center
        pupils.forEach(p => p.style.transform = `translate(0, 0)`);
        
        // Restart recognition if it was supposed to be on
        if (alwaysListen) {
            setTimeout(() => {
                if (alwaysListen && !isSpeaking && !recognitionActive) {
                    try { recognition.start(); } catch(e) {}
                }
            }, 500);
        }
    };

    synth.speak(utterance);
}

let hasInteracted = false;

function welcome() {
    if (hasInteracted) return;
    hasInteracted = true;
    addMessage('cain', "Sou o CAIN. Como posso ajudar VOCÃ?");
    speak("Sou o CAIN. Como posso ajudar VOCÃ?");
}

// Trigger welcome on first click or interaction
document.addEventListener('click', () => {
    if (!hasInteracted) {
        hasInteracted = true;
        checkAuthStatus();
    }
}, { once: true });

document.addEventListener('keypress', () => {
    if (!hasInteracted) {
        hasInteracted = true;
        checkAuthStatus();
    }
}, { once: true });

window.onload = () => {
    loadVoices();
    loadLocalStats(); // Carrega stats salvos imediatamente
    syncIntelligence();
    initOfflineDB();
    
    // Tenta sincronizar a cada carregamento se estiver online
    setTimeout(() => {
        if (navigator.onLine) {
            syncKnowledgeToLocal();
        }
    }, 2000);
    
    setInterval(syncIntelligence, 30000); // Poll every 30s
    setInterval(syncSystemStats, 5000); // Poll every 5s (HUD real-time)
    
    // Inicia Biometria
    initBiometrics();
};

// Biometric Integration (face-api.js)
async function initBiometrics() {
    if (bioStatus) bioStatus.textContent = "CARREGANDO...";
    
    try {
        const MODEL_URL = 'https://cdn.jsdelivr.net/npm/@vladmandic/face-api/model/';
        await Promise.all([
            faceapi.nets.ssdMobilenetv1.loadFromUri(MODEL_URL),
            faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
            faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL)
        ]);
        
        modelsLoaded = true;
        console.log("Modelos BiomÃ©tricos carregados.");
        startWebcam();
    } catch (e) {
        console.error("Erro ao carregar modelos:", e);
        if (bioStatus) bioStatus.textContent = "ERRO MOD";
    }
}

async function startWebcam() {
    const video = document.getElementById('video');
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: {} });
        video.srcObject = stream;
        if (bioStatus) bioStatus.textContent = "ATIVO";
        
        // Inicia loop de reconhecimento
        setInterval(detectFace, 3000);
    } catch (e) {
        console.warn("CÃ¢mera nÃ£o disponÃ­vel:", e);
        if (bioStatus) bioStatus.textContent = "SEM CAM";
    }
}

async function detectFace() {
    if (!modelsLoaded) return;
    const video = document.getElementById('video');
    
    const detections = await faceapi.detectAllFaces(video).withFaceLandmarks().withFaceDescriptors();
    
    if (detections.length > 0) {
        // Se tivermos perfis salvos, tentamos reconhecer
        if (faceMatcher && labeledDescriptors.length > 0) {
            const results = detections.map(d => faceMatcher.findBestMatch(d.descriptor));
            const bestMatch = results[0];
            
            if (bestMatch.label !== 'unknown') {
                if (recognizedUser !== bestMatch.label) {
                    recognizedUser = bestMatch.label;
                    if (bioStatus) {
                        bioStatus.textContent = recognizedUser.toUpperCase();
                        bioStatus.classList.add('identified');
                    }
                    const greetings = [
                        `Identificado: ${recognizedUser}. Ã bom vÃª-lo novamente, senhor.`,
                        `Reconhecimento concluÃ­do. Bem-vindo de volta, ${recognizedUser}.`,
                        `Protocolos de identidade ativos. OlÃ¡, ${recognizedUser}. Como posso ser Ãºtil hoje?`,
                        `${recognizedUser} detectado. Estou Ã  sua disposiÃ§Ã£o.`
                    ];
                    const greeting = greetings[Math.floor(Math.random() * greetings.length)];
                    speak(greeting, "pt-BR");
                    addMessage('cain', `[BIO]: UsuÃ¡rio reconhecido: ${recognizedUser}.`);
                }
            } else {
                recognizedUser = "VISITANTE";
                if (bioStatus) {
                    bioStatus.textContent = "ANÃNIMO";
                    bioStatus.classList.remove('identified');
                }
            }
        } else {
            // Se vir um rosto mas nÃ£o tiver perfis, tenta carregar do servidor
            await loadBiometricProfiles();
        }
    }
}

async function loadBiometricProfiles() {
    try {
        const res = await fetch('/knowledge/export');
        const data = await res.json();
        
        const profiles = [];
        for (const key in data) {
            if (key.includes('bio_profile_')) {
                const profile = data[key];
                const descriptors = [new Float32Array(Object.values(profile.descriptor))];
                profiles.push(new faceapi.LabeledFaceDescriptors(profile.name, descriptors));
            }
        }
        
        if (profiles.length > 0) {
            labeledDescriptors = profiles;
            faceMatcher = new faceapi.FaceMatcher(labeledDescriptors, 0.6);
            console.log(`Carregados ${profiles.length} perfis biomÃ©tricos.`);
        }
    } catch (e) {
        console.error("Erro ao carregar perfis:", e);
    }
}

async function learnFace(name = "Leonardo") {
    if (!modelsLoaded) return speak("Aguarde o sistema carregar completamente.", "pt-BR");
    
    addMessage('cain', "[SISTEMA]: Iniciando captura biomÃ©trica. Olhe para a cÃ¢mera...");
    speak("Iniciando captura biomÃ©trica. Por favor, olhe para a cÃ¢mera.", "pt-BR");
    
    const video = document.getElementById('video');
    const detection = await faceapi.detectSingleFace(video).withFaceLandmarks().withFaceDescriptor();
    
    if (detection) {
        const profile = {
            name: name,
            descriptor: Array.from(detection.descriptor),
            timestamp: Date.now()
        };
        
        // Salva no servidor como um conhecimento especial (Global para reconhecimento de qualquer um)
        const res = await fetch('/api/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                message: `cain aprenda que bio_profile_${name.toLowerCase()} Ã© ${JSON.stringify(profile)}` 
            })
        });
        
        if (res.ok) {
            speak(`Perfil biomÃ©trico de ${name} salvo com sucesso. Eu te conheÃ§o agora.`, "pt-BR");
            addMessage('cain', `[SISTEMA]: Biometria de ${name} sincronizada.`);
            await loadBiometricProfiles();
        }
    } else {
        speak("NÃ£o consegui detectar seu rosto. Tente se aproximar mais.", "pt-BR");
    }
}

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
let timeLeft = 300; // 5 minutos

function startLockdown() {
    const lockPanel = document.getElementById('lock-panel');
    const timerDisplay = document.getElementById('lock-timer');
    const securityInput = document.getElementById('security-code');
    const unlockBtn = document.getElementById('unlock-btn');
    
    lockPanel.classList.remove('hidden');
    document.body.classList.add('lockdown-active');
    
    // Reset timer
    timeLeft = 300;
    if (lockTimer) clearInterval(lockTimer);
    
    lockTimer = setInterval(() => {
        timeLeft--;
        const mins = Math.floor(timeLeft / 60);
        const secs = timeLeft % 60;
        timerDisplay.textContent = `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
        
        if (timeLeft === 299) speak("MODO DE BLOQUEIO ATIVADO. AUTODESTRUIÃÃO EM 5 MINUTOS.", "pt-BR");
        
        // Avisos periÃ³dicos
        if (timeLeft > 60 && timeLeft % 60 === 0) {
            speak(`Faltam ${mins} minutos para a limpeza total.`, "pt-BR");
        } else if (timeLeft === 60) {
            speak("AtenÃ§Ã£o: Um minuto restante para o desligamento total.", "pt-BR");
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
    timeLeft = 300;
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
    console.log('ð', 'appinstalled', event);
    // Clear the deferredPrompt so it can be garbage collected
    deferredPrompt = null;
    if (installPrompt) installPrompt.classList.add('hidden');
    
    // Inicia sincronizaÃ§Ã£o imediata apÃ³s instalaÃ§Ã£o
    setTimeout(syncKnowledgeToLocal, 1000);
});
// Biometric Enrollment Flow (Face + Voice)
async function startBiometricEnrollment() {
    if (!modelsLoaded) return speak("Aguarde o sistema carregar completamente.", "pt-BR");
    
    isEnrollingBiometrics = true;
    enrollmentStep = 'FACE';
    
    addMessage('cain', "[SISTEMA]: Iniciando captura biomÃ©trica completa.");
    speak("Iniciando reconhecimento facial. Por favor, olhe para a cÃ¢mera e fique imÃ³vel.", "pt-BR");
    
    setTimeout(async () => {
        const video = document.getElementById('video');
        const detection = await faceapi.detectSingleFace(video).withFaceLandmarks().withFaceDescriptor();
        
        if (detection) {
            tempFaceDescriptor = Array.from(detection.descriptor);
            enrollmentStep = 'NAME';
            speak("Rosto capturado com sucesso. Agora, por favor, me diga qual Ã© o seu nome?", "pt-BR");
            addMessage('cain', "[SISTEMA]: Rosto capturado. Aguardando identificaÃ§Ã£o por voz...");
        } else {
            speak("NÃ£o consegui detectar seu rosto. Vamos tentar novamente.", "pt-BR");
            isEnrollingBiometrics = false;
        }
    }, 3000);
}

async function handleNameCapture(name) {
    const cleanName = name.replace(/meu nome Ã©|eu me chamo|sou o|sou a/gi, '').trim();
    if (!cleanName) return speak("NÃ£o entendi o nome. Pode repetir?", "pt-BR");

    enrollmentStep = 'VOICE';
    speak(`Entendido, senhor ${cleanName}. Agora vou gravar uma amostra da sua voz para reconhecimento futuro. Fale qualquer coisa por trÃªs segundos.`, "pt-BR");
    addMessage('cain', `[SISTEMA]: Gravando voz de ${cleanName}...`);
    
    const voiceData = await captureVoiceSample();
    finalizeEnrollment(cleanName, tempFaceDescriptor, voiceData);
}

async function captureVoiceSample() {
    return new Promise(async (resolve) => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            const mediaRecorder = new MediaRecorder(stream);
            const chunks = [];

            mediaRecorder.ondataavailable = (e) => chunks.push(e.data);
            mediaRecorder.onstop = () => {
                const blob = new Blob(chunks, { type: 'audio/webm' });
                const reader = new FileReader();
                reader.readAsDataURL(blob);
                reader.onloadend = () => resolve(reader.result);
                stream.getTracks().forEach(track => track.stop());
            };

            mediaRecorder.start();
            setTimeout(() => mediaRecorder.stop(), 4000); // 4 segundos de gravaÃ§Ã£o
        } catch (e) {
            console.error("Erro ao gravar Ã¡udio:", e);
            resolve(null);
        }
    });
}

async function finalizeEnrollment(name, descriptor, voiceData) {
    const profile = {
        name: name,
        descriptor: descriptor,
        voice: voiceData,
        timestamp: Date.now()
    };
    
    addMessage('cain', `[SISTEMA]: Sincronizando perfil de ${name}...`);
    
    // Salva no servidor (Global para reconhecimento de qualquer um)
    const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
            message: `cain aprenda que bio_profile_${name.toLowerCase()} Ã© ${JSON.stringify(profile)}` 
        })
    });
    
    if (res.ok) {
        speak(`Perfil biomÃ©trico de ${name} salvo com sucesso. Eu te conheÃ§o agora, senhor.`, "pt-BR");
        addMessage('cain', `[SISTEMA]: Biometria e voz de ${name} sincronizadas.`);
        isEnrollingBiometrics = false;
        enrollmentStep = '';
        tempFaceDescriptor = null;
        await loadBiometricProfiles();
    } else {
        speak("Houve um erro ao sincronizar seus dados biomÃ©tricos.", "pt-BR");
        isEnrollingBiometrics = false;
    }
}

// --- NEW SECURITY SYSTEM LOGIC ---

async function checkAuthStatus() {
    try {
        const res = await fetch(`/knowledge/export?user=${encodeURIComponent(currentUser)}`);
        const data = await res.json();
        
        let hasUsers = false;
        for (const key in data) {
            if (key.startsWith('user_auth_')) {
                hasUsers = true;
                break;
            }
        }

        if (!hasUsers) {
            showSecurityOverlay("Primeiro acesso detectado. Por favor, crie seu cadastro.", "CADASTRAR");
            authStep = 'REG_NAME';
        } else {
            showSecurityOverlay("Sistema bloqueado. Identifique-se via Chat ou Voz.", "ENTRAR");
            authStep = 'NAME';
        }
    } catch (e) {
        // Fallback offline
        welcome();
    }
}

function showSecurityOverlay(msg, title) {
    const overlay = document.getElementById('security-overlay');
    if (overlay) overlay.classList.remove('hidden');
    document.getElementById('security-msg').textContent = msg;
    document.getElementById('security-title').textContent = title;
    speak(msg, "pt-BR");
}

function hideSecurityOverlay() {
    const overlay = document.getElementById('security-overlay');
    if (overlay) overlay.classList.add('hidden');
}

async function handleAuthFlow(input) {
    if (authStep === 'REG_NAME') {
        try {
            const res = await fetch('/knowledge/export');
            const data = await res.json();
            if (data[`user_auth_${input.toLowerCase()}`]) {
                const msg = `O nome "${input}" jÃ¡ estÃ¡ sendo usado. Por favor, escolha outro nome.`;
                addMessage('cain', msg);
                speak(msg);
                return;
            }
        } catch (e) {}

        tempRegName = input;
        authStep = 'REG_PASS';
        const msg = `OlÃ¡ ${tempRegName}. Agora digite ou fale sua nova senha.`;
        addMessage('cain', msg);
        speak(msg);
        return;
    }

    if (authStep === 'REG_PASS') {
        const password = input;
        // Salva credenciais no servidor
        await fetch('/api/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ message: `cain aprenda que user_auth_${tempRegName.toLowerCase()} Ã© ${password}` })
        });
        
        isAuthenticated = true;
        currentUser = tempRegName;
        authStep = 'IDLE';
        hideSecurityOverlay();
        const msg = `Cadastro concluÃ­do. Bem-vindo, ${currentUser}. Como posso ajudar?`;
        addMessage('cain', msg);
        speak(msg);
        return;
    }

    if (authStep === 'NAME') {
        tempRegName = input;
        authStep = 'PASS';
        const msg = `Reconhecido: ${tempRegName}. Digite ou fale sua senha.`;
        addMessage('cain', msg);
        speak(msg);
        return;
    }

    if (authStep === 'PASS') {
        const password = input;
        try {
            const res = await fetch(`/knowledge/export?user=${encodeURIComponent(tempRegName)}`);
            const data = await res.json();
            const storedPass = data[`user_auth_${tempRegName.toLowerCase()}`];

            if (storedPass === password) {
                isAuthenticated = true;
                currentUser = tempRegName;
                authStep = 'IDLE';
                hideSecurityOverlay();
                const msg = `Acesso concedido. Bem-vindo de volta, ${currentUser}.`;
                addMessage('cain', msg);
                speak(msg);
            } else {
                const msg = "Senha incorreta. Tente novamente seu nome.";
                authStep = 'NAME';
                addMessage('cain', msg);
                speak(msg);
            }
        } catch (e) {
            addMessage('cain', "Erro de conexÃ£o ao verificar senha.");
        }
        return;
    }
}

// BotÃµes do Overlay
const secLoginBtn = document.getElementById('sec-login-btn');
if (secLoginBtn) {
    secLoginBtn.addEventListener('click', () => {
        const nameInput = document.getElementById('sec-name');
        const passInput = document.getElementById('sec-pass');
        if (nameInput && passInput && nameInput.value && passInput.value) {
            tempRegName = nameInput.value;
            authStep = 'PASS';
            handleAuthFlow(passInput.value);
        }
    });
}

const secRegBtn = document.getElementById('sec-reg-btn');
if (secRegBtn) {
    secRegBtn.addEventListener('click', async () => {
        const nameInput = document.getElementById('sec-name');
        const passInput = document.getElementById('sec-pass');
        if (nameInput && passInput && nameInput.value && passInput.value) {
            // Unicidade check
            try {
                const res = await fetch('/knowledge/export');
                const data = await res.json();
                if (data[`user_auth_${nameInput.value.toLowerCase()}`]) {
                    const msg = `O nome "${nameInput.value}" jÃ¡ estÃ¡ sendo usado. Por favor, escolha outro nome.`;
                    addMessage('cain', msg);
                    speak(msg);
                    return;
                }
            } catch (e) {}

            tempRegName = nameInput.value;
            authStep = 'REG_PASS';
            handleAuthFlow(passInput.value);
        }
    });
}

// --- WhatsApp & Payment Event Polling ---
async function wipeWhatsApp() {
    if(confirm("Tem certeza que deseja DELETAR todas as mÃ­dias, Ã¡udios, PDFs e histÃ³ricos locais do WhatsApp salvos no CAIN?")) {
        try {
            const res = await fetch('http://localhost:3100/api/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ message: 'apagar todas as conversas e arquivos', username: currentUser })
            });
            const data = await res.json();
            addMessage('cain', data.response);
            speak(data.response);
        } catch(e) {
            console.error('Erro ao varrer WhatsApp:', e);
        }
    }
}

setInterval(async () => {
    try {
        const res = await fetch('http://localhost:3100/api/events/poll');
        if (!res.ok) return;
        const data = await res.json();
        
        if (data.alerts && data.alerts.length > 0) {
            data.alerts.forEach(alert => {
                // If the alert carries HTML, render it as HTML explicitly
                addMessage('cain', alert.voiceHTML ? alert.voiceHTML : alert.text, alert.voiceHTML ? true : false);
                speak(alert.text);
            });
        }
    } catch(e) {
        // Ignora silenciosamente em caso de backend off
    }
}, 5000);

setInterval(pollSACEvents, 10000);
async function pollSACEvents() {
    try {
        const res = await fetch('/api/events/poll');
        if (!res.ok) return;
        const data = await res.json();
        if (data.alerts && data.alerts.length > 0) {
            for (const alert of data.alerts) {
                if (alert.isSac) {
                    renderSACMessage(alert);
                    if (alert.text) speak(alert.text, 'pt-BR');
                } else if (alert.voiceHTML) {
                    addMessage('cain', alert.voiceHTML, true);
                    if (alert.text) speak(alert.text, 'pt-BR');
                } else if (alert.text) {
                    addMessage('cain', alert.text);
                    speak(alert.text, 'pt-BR');
                }
            }
        }
    } catch (e) {}
}
function renderSACMessage(alert) {
    const div = document.createElement('div');
    div.className = 'message sac-message-bubble';
    let innerHtml = '<div class="sac-header"> SAC: ' + alert.senderName + '</div>';
    if (alert.fileType === 'audio' && alert.fileUrl) {
        innerHtml += '<div class="sac-audio-wrapper"><audio controls src="' + alert.fileUrl + '"></audio></div>';
    } else if (alert.fileType === 'photo' && alert.fileUrl) {
        innerHtml += '<div class="sac-photo-wrapper"><img src="' + alert.fileUrl + '" alt="Foto" onclick="window.open(''' + alert.fileUrl + ''')" /></div>';
    } else if (alert.fileType === 'document' && alert.fileUrl) {
        innerHtml += '<div class="sac-doc-wrapper"><a href="' + alert.fileUrl + '" target="_blank" class="sac-pdf-btn"> ABRIR PDF</a></div>';
    }
    if (alert.textContent) {
        innerHtml += '<div class="sac-text-body">' + alert.textContent + '</div>';
    }
    div.innerHTML = innerHtml;
    chatBox.appendChild(div);
    chatBox.scrollTop = chatBox.scrollHeight;
}

window.wipeWhatsApp = async function() {
    try {
        await fetch('/clear_chat', { method: 'POST' });
        Array.from(chatBox.children).forEach(child => child.remove());
        addMessage('cain', 'SISTEMA: Histórico do SAC e mídias foram apagados com sucesso do disco.', true);
        speak('Histórico de mídias e conversas foram varridos do servidor corporativo.', 'pt-BR');
    } catch(e) { console.error(e); }
};
