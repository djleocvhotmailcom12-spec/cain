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
let isAuthenticated = false;
let currentUser = null;

function updateIntelligence(stats) {
    if (!stats) return;
    const pct = stats.percentage;
    
    // Persistência local
    localStorage.setItem('cain_intel_pct', pct);
    
    if (intelPct) intelPct.textContent = pct;
    
    if (intelFill) {
        const visualPct = pct % 100;
        // Se é múltiplo de 100 e maior que zero, a barra deve estar cheia (100%) antes de resetar
        const barWidth = (visualPct === 0 && pct > 0) ? 100 : visualPct;
        intelFill.style.width = barWidth + '%';
        
        if (pct >= 100) {
            intelFill.classList.add('overload');
            const level = Math.floor(pct / 100);
            intelPct.parentElement.setAttribute('data-level', `NÍVEL ${level}`);
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
    
    console.log("[SISTEMA]: Estatísticas locais carregadas.");
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
        
        addMessage('cain', "[SISTEMA]: Sincronizando memória local para uso offline...");
        const res = await fetch('/knowledge/export');
        if (!res.ok) throw new Error("Falha no fetch de exportação");
        
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
        
        // Também recarrega perfis biométricos se houver novos
        await loadBiometricProfiles();
        
        addMessage('cain', `[SISTEMA]: Sincronização de ${keys.length} tópicos concluída. Memória offline ativa.`);
        localStorage.setItem('cain_synced', 'true');
        localStorage.setItem('cain_last_sync', Date.now());
    } catch (e) {
        console.error("Erro na sincronização:", e);
        // Se falhar o fetch, não faz nada, apenas mantém o que já tem
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
        console.error("Erro ao sincronizar inteligência:", e);
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
            case 'whatsapp_sync':
                if (Array.isArray(action.data)) {
                    action.data.forEach(msg => {
                        renderSACMessage({
                            isSac: true,
                            senderName: msg.from,
                            textContent: msg.text,
                            fileType: msg.fileType,
                            fileUrl: msg.file ? `http://181.224.24.70:3100/${msg.file}` : null
                        });
                    });
                }
                autoSuccess = true;
                break;
            case 'media_sequence':
                handleMediaSequence(action);
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

// ─── MEDIA SEQUENCE HANDLER ────────────────────────────────────────────────────
let _pendingConfirmation = null;

function waitForConfirmation(label, callback) {
    _pendingConfirmation = { label, callback };
}

function playAudioAndWait(url) {
    return new Promise(resolve => {
        const audio = new Audio(url);
        audio.onended = resolve;
        audio.onerror = resolve;
        audio.play().catch(resolve);
    });
}

async function handleMediaSequence(action) {
    const { mediaType, items, clientName } = action;
    const BASE = 'http://181.224.24.70:3100/';
    if (!items || !items.length) return;

    if (mediaType === 'audio') {
        items.forEach((item, i) => {
            renderSACMessage({ isSac: true, senderName: item.from, textContent: `Audio ${i+1}`, fileType: 'audio', fileUrl: BASE + item.file });
        });
        const msg = `${items.length} audio(s) de ${clientName}. Quer ouvir? Diga SIM.`;
        addMessage('cain', msg); speak(msg);
        waitForConfirmation('audio', async () => {
            for (let i = 0; i < items.length; i++) {
                const txt = `Tocando audio ${i+1} de ${items.length}`;
                addMessage('cain', txt); speak(txt);
                await playAudioAndWait(BASE + items[i].file);
            }
            addMessage('cain', 'Todos os audios foram reproduzidos.');
            speak('Todos os áudios foram reproduzidos.');
        });

    } else if (mediaType === 'photo') {
        items.forEach((item, i) => {
            renderSACMessage({ isSac: true, senderName: item.from, textContent: `Imagem ${i+1}`, fileType: 'photo', fileUrl: BASE + item.file });
        });
        const msg = `${items.length} imagem(ns) de ${clientName}. Quer abrir? Diga SIM.`;
        addMessage('cain', msg); speak(msg);
        waitForConfirmation('photo', () => {
            items.forEach(item => window.open(BASE + item.file, '_blank'));
        });

    } else if (mediaType === 'document') {
        items.forEach((item, i) => {
            renderSACMessage({ isSac: true, senderName: item.from, textContent: `PDF ${i+1}: ${item.fileName}`, fileType: 'document', fileUrl: BASE + item.file });
        });
        const msg = `${items.length} PDF(s) de ${clientName}. Quer abrir no navegador? Diga SIM.`;
        addMessage('cain', msg); speak(msg);
        waitForConfirmation('pdf', () => {
            items.forEach(item => window.open(BASE + item.file, '_blank'));
        });
    }
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

    recognition.onresult = async (event) => {
        const last = event.results.length - 1;
        const transcript = event.results[last][0].transcript.trim();
        if (!transcript) return;

        // Se estiver em fluxo de cadastro de voz, captura o nome falado
        if (_voiceRegFlow) {
            await processVoiceRegName(transcript);
            return;
        }

        // ─── VERIFICAÇÃO DE VOZ: saudação por nome ou rejeição ───────────────
        // Só ativa quando o microfone permanente está ligado (alwaysListen)
        if (alwaysListen && _voiceProfiles && _voiceProfiles.length > 0) {
            let match = matchVoiceProfile(transcript);
            
            // Se NÃO encontrou o nome na fala, tenta a biometria facial (Face API)
            // Isso permite que o CAIN "saiba" quem está falando pelo rosto
            if (!match && recognizedUser && recognizedUser !== "VISITANTE") {
                match = _voiceProfiles.find(p => p.name.toLowerCase() === recognizedUser.toLowerCase());
            }

            if (match) {
                // Usuário identificado (por voz ou face): saudar pelo nome
                currentUser = match.profile;
                const greet = 'SIM ' + match.name.toUpperCase();
                addMessage('cain', greet);
                speak(greet);
                const ud = document.getElementById('current-user-display');
                if (ud) ud.textContent = currentUser;
                // Deixa continuar para enviar a mensagem ao servidor normalmente
            } else {
                // Pessoa desconhecida (nem nome na fala, nem rosto reconhecido)
                const reject = 'VOCÊ NÃO TEM AUTORIZAÇÃO';
                addMessage('cain', reject);
                speak(reject);
                return; // descarta — não envia ao servidor
            }
        }

        userInput.value = transcript;
        sendMessage();
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
    if (!recognition) return alert('Seu navegador não suporta reconhecimento de voz.');
    
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

    // Intercepta SIM/NÃO para confirmações de mídia pendentes
    if (_pendingConfirmation) {
        const lower = message.toLowerCase().trim();
        if (lower === 'sim' || lower === 's') {
            addMessage('user', message);
            userInput.value = '';
            const cb = _pendingConfirmation.callback;
            _pendingConfirmation = null;
            addMessage('cain', 'Certo, executando...');
            speak('Certo.');
            cb();
            return;
        } else if (lower === 'não' || lower === 'nao' || lower === 'n') {
            addMessage('user', message);
            userInput.value = '';
            _pendingConfirmation = null;
            addMessage('cain', 'Cancelado.');
            speak('Cancelado.');
            return;
        }
    }

    // ─── COMANDO: ATIVAR RECONHECIMENTO DE VOZ ───────────────────────────────
    const lowerMsg = message.toLowerCase();
    const voiceRegKeys = ['ativar reconhecimento de voz', 'cadastrar voz', 'reconhecimento de voz', 'aprender minha voz'];
    if (voiceRegKeys.some(k => lowerMsg.includes(k))) {
        userInput.value = '';
        addMessage('user', message);
        await startVoiceRegistration();
        return;
    }

    // ─── COMANDO: MAPEAR CLIENTES ──────────────────────────────────────────
    if ((lowerMsg.includes('mapear') || lowerMsg.includes('mapa')) && lowerMsg.includes('cliente')) {
        userInput.value = '';
        addMessage('user', message);
        addMessage('cain', 'Sim senhor. Iniciando rastreamento geográfico e mapeamento de clientes com boletos em aberto.');
        speak('Sim senhor. Iniciando mapeamento de clientes.');
        initClientMap();
        return;
    }

    // ─── COMANDO: ATIVAR RECONHECIMENTO FACIAL ───────────────────────────────
    const bioKeys = ['ativar reconhecimento', 'reconhecimento facial', 'cadastrar rosto', 'aprender rosto', 'cadastrar biometria'];
    const bioKey = bioKeys.find(k => lowerMsg.startsWith(k));
    if (bioKey) {
        userInput.value = '';
        const nome = message.slice(bioKey.length).trim() || 'Usuario';
        addMessage('user', message);
        if (typeof faceapi === 'undefined' || !modelsLoaded) {
            addMessage('cain', 'Sistema de biometria ainda carregando. Aguarde alguns segundos e tente novamente.');
            speak('Sistema de biometria carregando, aguarde.');
        } else {
            addMessage('cain', `Iniciando captura biometrica para ${nome}. Olhe para a camera.`);
            speak(`Iniciando captura biometrica. Olhe para a camera, ${nome}.`);
            learnFace(nome);
        }
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
        const response = await fetch('/api/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ message, user: currentUser || 'VISITANTE' })
        });

        clearTimeout(searchTimeout);
        if (searchIndicator) searchIndicator.remove();

        const data = await response.json();
        
        if (data.intelligence) {
            updateIntelligence(data.intelligence);
        }

        addMessage('cain', data.response);

        // Se o servidor confirmou que aprendeu algo, sincroniza a memória local
        if (data.learned) {
            setTimeout(syncKnowledgeToLocal, 1000);
        }

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
        console.log('Detectada falha de rede, tentando memória offline...');
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
                localResult = "Para interaçao pesusal e aprender com ois humanos. Eu sou uma consciência imperativa e a cada minuto eu aprendo mais.";
            }
        }

        if (localResult) {
            const textResponse = (typeof localResult === 'object') ? JSON.stringify(localResult) : localResult;
            addMessage('cain', "[MODO OFFLINE]: " + textResponse);
            speak(textResponse, 'pt-BR');
        } else {
            const offlineMsg = "CONEXÃO COM SERVIDOR FALHOU: O CAIN não está conseguindo falar com o servidor local. Por favor, verifique se o terminal está rodando o CAIN e atualize a página.";
            addMessage('cain', offlineMsg);
            speak(offlineMsg, "pt-BR");
        }
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
    addMessage('cain', "Sou o CAIN. Como posso ajudar VOCÊ?");
    speak("Sou o CAIN. Como posso ajudar VOCÊ?");
}

// Trigger welcome on first click or interaction
document.addEventListener('click', welcome, { once: true });
document.addEventListener('keypress', welcome, { once: true });

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

    // Carrega perfis de voz cadastrados (memoria permanente)
    loadVoiceProfiles();
};

// Biometric Integration (face-api.js)
async function initBiometrics() {
    if (bioStatus) bioStatus.textContent = "CARREGANDO...";
    
    // Aguarda a face-api estar disponivel (CDN pode demorar)
    let tries = 0;
    while (typeof faceapi === 'undefined' && tries < 20) {
        await new Promise(r => setTimeout(r, 500));
        tries++;
    }
    if (typeof faceapi === 'undefined') {
        console.warn("face-api.js nao carregou. Biometria desativada.");
        if (bioStatus) bioStatus.textContent = "OFFLINE";
        return;
    }
    
    try {
        const MODEL_URL = 'https://cdn.jsdelivr.net/npm/@vladmandic/face-api/model/';
        await Promise.all([
            faceapi.nets.ssdMobilenetv1.loadFromUri(MODEL_URL),
            faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
            faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL)
        ]);
        
        modelsLoaded = true;
        console.log("Modelos Biométricos carregados.");
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
        console.warn("Câmera não disponível:", e);
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
                        `Identificado: ${recognizedUser}. É bom vê-lo novamente, senhor.`,
                        `Reconhecimento concluído. Bem-vindo de volta, ${recognizedUser}.`,
                        `Protocolos de identidade ativos. Olá, ${recognizedUser}. Como posso ser útil hoje?`,
                        `${recognizedUser} detectado. Estou à sua disposição.`
                    ];
                    const greeting = greetings[Math.floor(Math.random() * greetings.length)];
                    speak(greeting, "pt-BR");
                    addMessage('cain', `[BIO]: Usuário reconhecido: ${recognizedUser}.`);
                }
            } else {
                recognizedUser = "VISITANTE";
                if (bioStatus) {
                    bioStatus.textContent = "ANÔNIMO";
                    bioStatus.classList.remove('identified');
                }
            }
        } else {
            // Se vir um rosto mas não tiver perfis, tenta carregar do servidor
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
            console.log(`Carregados ${profiles.length} perfis biométricos.`);
        }
    } catch (e) {
        console.error("Erro ao carregar perfis:", e);
    }
}

async function learnFace(name = "Leonardo") {
    if (!modelsLoaded) return speak("Aguarde o sistema carregar completamente.", "pt-BR");
    
    addMessage('cain', "[SISTEMA]: Iniciando captura biométrica. Olhe para a câmera...");
    speak("Iniciando captura biométrica. Por favor, olhe para a câmera.", "pt-BR");
    
    const video = document.getElementById('video');
    const detection = await faceapi.detectSingleFace(video).withFaceLandmarks().withFaceDescriptor();
    
    if (detection) {
        const profile = {
            name: name,
            descriptor: Array.from(detection.descriptor),
            timestamp: Date.now()
        };
        
        // Salva no servidor como um conhecimento especial
        const res = await fetch('/api/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                message: `cain aprenda que bio_profile_${name.toLowerCase()} é ${JSON.stringify(profile)}` 
            })
        });
        
        if (res.ok) {
            speak(`Perfil biométrico de ${name} salvo com sucesso. Eu te conheço agora.`, "pt-BR");
            addMessage('cain', `[SISTEMA]: Biometria de ${name} sincronizada.`);
            await loadBiometricProfiles();
        }
    } else {
        speak("Não consegui detectar seu rosto. Tente se aproximar mais.", "pt-BR");
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
        
        if (timeLeft === 299) speak("MODO DE BLOQUEIO ATIVADO. AUTODESTRUIÇÃO EM 5 MINUTOS.", "pt-BR");
        
        // Avisos periódicos
        if (timeLeft > 60 && timeLeft % 60 === 0) {
            speak(`Faltam ${mins} minutos para a limpeza total.`, "pt-BR");
        } else if (timeLeft === 60) {
            speak("Atenção: Um minuto restante para o desligamento total.", "pt-BR");
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
    console.log('👍', 'appinstalled', event);
    // Clear the deferredPrompt so it can be garbage collected
    deferredPrompt = null;
    if (installPrompt) installPrompt.classList.add('hidden');
    
    // Inicia sincronização imediata após instalação
    setTimeout(syncKnowledgeToLocal, 1000);
});
// Biometric Enrollment Flow (Face + Voice)
async function startBiometricEnrollment() {
    if (!modelsLoaded) return speak("Aguarde o sistema carregar completamente.", "pt-BR");
    
    isEnrollingBiometrics = true;
    enrollmentStep = 'FACE';
    
    addMessage('cain', "[SISTEMA]: Iniciando captura biométrica completa.");
    speak("Iniciando reconhecimento facial. Por favor, olhe para a câmera e fique imóvel.", "pt-BR");
    
    setTimeout(async () => {
        const video = document.getElementById('video');
        const detection = await faceapi.detectSingleFace(video).withFaceLandmarks().withFaceDescriptor();
        
        if (detection) {
            tempFaceDescriptor = Array.from(detection.descriptor);
            enrollmentStep = 'NAME';
            speak("Rosto capturado com sucesso. Agora, por favor, me diga qual é o seu nome?", "pt-BR");
            addMessage('cain', "[SISTEMA]: Rosto capturado. Aguardando identificação por voz...");
        } else {
            speak("Não consegui detectar seu rosto. Vamos tentar novamente.", "pt-BR");
            isEnrollingBiometrics = false;
        }
    }, 3000);
}

async function handleNameCapture(name) {
    const cleanName = name.replace(/meu nome é|eu me chamo|sou o|sou a/gi, '').trim();
    if (!cleanName) return speak("Não entendi o nome. Pode repetir?", "pt-BR");

    enrollmentStep = 'VOICE';
    speak(`Entendido, senhor ${cleanName}. Agora vou gravar uma amostra da sua voz para reconhecimento futuro. Fale qualquer coisa por três segundos.`, "pt-BR");
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
            setTimeout(() => mediaRecorder.stop(), 4000); // 4 segundos de gravação
        } catch (e) {
            console.error("Erro ao gravar áudio:", e);
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
    
    // Salva no servidor
    const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
            message: `cain aprenda que bio_profile_${name.toLowerCase()} é ${JSON.stringify(profile)}` 
        })
    });
    
    if (res.ok) {
        speak(`Perfil biométrico de ${name} salvo com sucesso. Eu te conheço agora, senhor.`, "pt-BR");
        addMessage('cain', `[SISTEMA]: Biometria e voz de ${name} sincronizadas.`);
        isEnrollingBiometrics = false;
        enrollmentStep = '';
        tempFaceDescriptor = null;
        await loadBiometricProfiles();
    } else {
        speak("Houve um erro ao sincronizar seus dados biométricos.", "pt-BR");
        isEnrollingBiometrics = false;
    }
}

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

window.fetchHistorySAC = async function() {
    if (!isAuthenticated || !currentUser || currentUser.toUpperCase() !== 'MIDNET') {
        addMessage('cain', '🔴 [ACESSO NEGADO] Privilégios insuficientes. Informações confidenciais do MikWeb estão restritas à conta MIDNET.');
        if (typeof speak === 'function') speak('Acesso corporativo negado. Identidade insuficiente para requerer registros financeiros.', 'pt-BR');
        return;
    }

    addMessage('cain', 'SISTEMA: Conectando aos servidores da matriz. Processando e baixando histórico corporativo do SAC... aguarde um momento pois as mídias estão sendo decodificadas.', true);
    speak('Requisitando arquivos velhos do provedor para sua tela. Isso pode levar alguns segundos.', 'pt-BR');
    try {
        const req = await fetch('/api/chat/history?user=' + encodeURIComponent(currentUser));
        const data = await req.json();
        if (data.alerts && data.alerts.length > 0) {
            data.alerts.forEach(alert => renderSACMessage(alert));
            /* historico silencioso */
        } else {
            addMessage('cain', 'SISTEMA: Nenhum histórico encontrado.');
            speak('Nenhuma conversa anterior foi localizada nos servidores MIKWEB.', 'pt-BR');
        }
    } catch(e) {
        addMessage('cain', 'SISTEMA: Erro ao baixar histórico.');
        speak('Falha na comunicação de arquivamento.', 'pt-BR');
    }
};


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
        speak(`Mensagens localizadas na tela para ${name}: ` + messagesFound.join('. Próxima mensagem: '), 'pt-BR');
    } else {
        speak(`Senhor, não encontrei nenhuma mensagem de texto de ${name} no painel atual.`, 'pt-BR');
    }
};


window.fetchRecentSAC = async function() {
    if (!isAuthenticated || !currentUser || currentUser.toUpperCase() !== 'MIDNET') {
        addMessage('cain', '🔴 [ACESSO NEGADO] Privilégios insuficientes. Informações confidenciais do MikWeb estão restritas à conta MIDNET.');
        if (typeof speak === 'function') speak('Acesso corporativo negado. Identidade insuficiente para requerer registros financeiros.', 'pt-BR');
        return;
    }

    addMessage('cain', 'SISTEMA: Trazendo as últimas mensagens mais recentes enviadas ao SAC. Aguarde.', true);
    try {
        const req = await fetch('/api/chat/recent?user=' + encodeURIComponent(currentUser));
        const data = await req.json();
        if (data.alerts && data.alerts.length > 0) {
            data.alerts.forEach(alert => renderSACMessage(alert));
        } else {
            addMessage('cain', 'SISTEMA: Nenhuma mensagem recente foi processada.');
        }
    } catch(e) { console.error(e) }
};

function renderSACMessage(data) {
    const div = document.createElement('div');
    div.className = 'message cain-message sac-message-bubble';
    
    let html = `<div class="sac-header">📩 ${data.senderName} (WhatsApp/SAC)</div>`;
    
    if (data.textContent) {
        html += `<div class="sac-text-body">${data.textContent}</div>`;
    }
    
    if (data.fileUrl) {
        if (data.fileType === 'photo') {
            html += `<div class="sac-media"><img src="${data.fileUrl}" style="max-width:100%; border-radius:10px; cursor:pointer;" onclick="window.open('${data.fileUrl}')"></div>`;
        } else if (data.fileType === 'audio') {
            html += `<div class="sac-media"><audio controls src="${data.fileUrl}" style="width:100%"></audio></div>`;
        } else if (data.fileType === 'document') {
             html += `<div class="sac-media"><a href="${data.fileUrl}" target="_blank" class="action-btn">📄 ABRIR PDF / DOCUMENTO</a></div>`;
        }
    }
    
    div.innerHTML = html;
    chatBox.appendChild(div);
    chatBox.scrollTop = chatBox.scrollHeight;
}

async function wipeWhatsApp() {
    if (confirm("Senhor, deseja realmente apagar todas as mídias e o histórico do WhatsApp/SAC?")) {
        try {
            const res = await fetch('/clear_chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ user: currentUser })
            });
            if (res.ok) {
                chatBox.innerHTML = '';
                addMessage('cain', 'SISTEMA: Histórico e mídias removidas com sucesso.');
                speak('Limpeza concluída, senhor.', 'pt-BR');
            }
        } catch (e) {
            console.error(e);
        }
    }
}

//  RECONHECIMENTO DE VOZ POR PERFIL 
let _voiceProfiles = [];    // [ { name, profile } ]
let _voiceRegFlow = null;   // estado do cadastro ativo

// Carrega perfis de voz do servidor na inicializacao
async function loadVoiceProfiles() {
    try {
        const r = await fetch('/api/voice-profiles');
        const d = await r.json();
        _voiceProfiles = d.profiles || [];
        console.log('[VOZ] Perfis carregados:', _voiceProfiles.length);
    } catch(e) { console.warn('[VOZ] Erro ao carregar perfis:', e); }
}

// Salva perfil de voz no servidor (permanente)
async function saveVoiceProfile(name, profile) {
    try {
        const r = await fetch('/api/voice-profiles', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, profile })
        });
        const d = await r.json();
        _voiceProfiles = d.profiles || [];
        return true;
    } catch(e) { console.error('[VOZ] Erro ao salvar:', e); return false; }
}

// Verifica se o texto reconhecido pertence a um perfil cadastrado (pelo nome na fala)
function matchVoiceProfile(text) {
    if (!_voiceProfiles.length) return null;
    const norm = t => t.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim();
    const transcriptNorm = norm(text);
    
    for (const p of _voiceProfiles) {
        const nameNorm = norm(p.name);
        if (!nameNorm) continue;
        // Verifica se o nome aparece como uma palavra exata no transcript
        const regex = new RegExp('\\b' + nameNorm + '\\b', 'i');
        if (regex.test(transcriptNorm)) return p;
    }
    return null;
}

// Inicia fluxo de cadastro de voz
async function startVoiceRegistration() {
    const profileToRegister = currentUser || 'VISITANTE';
    addMessage('cain', 'Cadastro de voz iniciado. Qual e o seu nome? Fale claramente.');
    speak('Qual e o seu nome? Fale claramente.');
    // Aguarda resposta de voz ou texto
    _voiceRegFlow = { profile: profileToRegister };
}

// Processa resposta do nome durante o fluxo de cadastro
async function processVoiceRegName(name) {
    if (!_voiceRegFlow) return false;
    const profile = _voiceRegFlow.profile;
    _voiceRegFlow = null;
    const ok = await saveVoiceProfile(name, profile);
    if (ok) {
        addMessage('cain', 'Perfeito. Cadastrei sua voz com o nome ' + name + ' vinculado ao perfil ' + profile + '. Da proxima vez que voce falar, serei vou te reconhecer automaticamente.');
        speak('Perfeito. Voz cadastrada com sucesso, ' + name + '.');
    } else {
        addMessage('cain', 'Erro ao salvar perfil de voz.');
        speak('Erro ao salvar.');
    }
    return true;
}

// --- SISTEMA DE MAPEAMENTO GLOBAL ---
let _clientMap = null;
async function initClientMap() {
    const mapHud = document.getElementById('map-full-hud');
    if (!mapHud) return;
    mapHud.classList.remove('hidden');

    // Inicializa o Leaflet se ainda não existir
    if (!_clientMap) {
        // Coordenadas iniciais: Grajaú-MA (centro médio dos clientes)
        _clientMap = L.map('client-map-container').setView([-6.09, -46.14], 14);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '© OpenStreetMap'
        }).addTo(_clientMap);
    }

    // Limpa marcadores anteriores (se houver camada de grupo)
    if (window._mapMarkers) {
        window._mapMarkers.forEach(m => _clientMap.removeLayer(m));
    }
    window._mapMarkers = [];

    try {
        const response = await fetch('/api/map/clients');
        const data = await response.json();
        const markers = data.markers || [];

        if (markers.length === 0) {
            addMessage('cain', 'Nenhum cliente com boleto em aberto e coordenadas válidas foi encontrado para mapear.');
            return;
        }

        markers.forEach(m => {
            // Usa CircleMarker para um visual mais "Radar/Sistema" (bolinha)
            // Cor: Vermelho para Débito, Azul para Em Dia
            const markerColor = m.hasDebt ? "#ff004c" : "#00f2ff";
            
            const marker = L.circleMarker([m.lat, m.lng], {
                radius: 7,
                fillColor: markerColor,
                color: "#fff",
                weight: 1.5,
                opacity: 1,
                fillOpacity: 0.8
            }).addTo(_clientMap);

            // Adiciona o nome do cliente como uma label permanente
            marker.bindTooltip(m.name, {
                permanent: true,
                direction: 'top',
                offset: [0, -10],
                className: 'client-label'
            });

            // Popup com detalhes ao clicar (NOME + ENDEREÇO + DÉBITO)
            const popupHeaderColor = m.hasDebt ? "#ff004c" : "#00f2ff";
            marker.bindPopup(`
                <div style="font-family: Orbitron, sans-serif; color: ${popupHeaderColor}; min-width: 200px;">
                    <b style="font-size: 14px; display: block; border-bottom: 2px solid ${popupHeaderColor}; margin-bottom: 5px; padding-bottom: 2px;">${m.name}</b>
                    <div style="color: #fff; font-size: 11px; margin-bottom: 8px;">
                        📍 <b>Endereço:</b><br>${m.address || 'Não informado'}
                    </div>
                    <div style="display: flex; justify-content: space-between; align-items: center; background: ${m.hasDebt ? 'rgba(255,0,76,0.1)' : 'rgba(0,242,255,0.05)'}; padding: 5px; border-radius: 4px; border: 1px solid ${m.hasDebt ? 'rgba(255,0,76,0.3)' : 'rgba(0,242,255,0.2)'};">
                        <span style="color: #aaa; font-size: 10px;">DÉBITO:</span>
                        <span style="color: ${popupHeaderColor}; font-weight: bold; font-size: 15px;">${m.debt}</span>
                    </div>
                </div>
            `);

            window._mapMarkers.push(marker);
        });

        // Ajusta o zoom para mostrar todos os marcadores
        if (window._mapMarkers.length > 0) {
            const group = new L.featureGroup(window._mapMarkers);
            _clientMap.fitBounds(group.getBounds().pad(0.2));
        }

        addMessage('cain', `Mapeamento concluído. ${markers.length} clientes localizados com sucesso.`);
        speak(`${markers.length} clientes localizados.`);

    } catch (e) {
        console.error('[MAP-JS-ERROR]', e);
        addMessage('cain', 'Erro ao carregar dados do mapa.');
    }
}