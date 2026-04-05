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
    localStorage.setItem('cain_intel_pct', pct);
    if (intelPct) intelPct.textContent = pct;
    if (intelFill) {
        const visualPct = pct % 100;
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
}

// IndexedDB for Offline Memory
let db;
const dbName = "CAIN_Memory";
const storeName = "knowledge";

function initOfflineDB() {
    const request = indexedDB.open(dbName, 1);
    request.onupgradeneeded = (e) => {
        db = e.target.result;
        if (!db.objectStoreNames.contains(storeName)) db.createObjectStore(storeName);
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
        const res = await fetch('/knowledge/export');
        const data = await res.json();
        const keys = Object.keys(data);
        let count = 0;
        for (const key of keys) {
            await saveToOfflineMemory(key, data[key]);
            count++;
            if (syncLabel) {
                const currentPct = Math.floor((count / keys.length) * 100);
                syncLabel.textContent = currentPct + "%";
                if (document.getElementById('sync-bar')) document.getElementById('sync-bar').style.width = currentPct + "%";
            }
        }
        await loadBiometricProfiles();
    } catch (e) {}
}

async function syncIntelligence() {
    try {
        const res = await fetch('/stats');
        const data = await res.json();
        updateIntelligence(data);
        syncSystemStats();
    } catch (e) {}
}

async function syncSystemStats() {
    try {
        const res = await fetch('/sys/stats');
        const data = await res.json();
        if (document.getElementById('cpu-load')) document.getElementById('cpu-load').textContent = data.cpu + '%';
        if (document.getElementById('ram-usage')) document.getElementById('ram-usage').textContent = data.memory + '%';
        if (document.getElementById('net-clients')) document.getElementById('net-clients').textContent = data.clients;
    } catch (e) {}
}

async function singLyrics(text) {
    const lines = text.split('\n').filter(l => l.trim().length > 0);
    const face = document.querySelector('.face-container');
    face.classList.add('singer-active');
    window.speechSynthesis.cancel();
    for (let i = 0; i < lines.length; i++) {
        const words = lines[i].trim().split(' ');
        for (let j = 0; j < words.length; j++) {
            const pitch = 0.7 + (Math.sin(i + j) * 0.5) + (Math.random() * 0.2); 
            await new Promise(resolve => {
                const utterance = new SpeechSynthesisUtterance(words[j]);
                utterance.lang = 'pt-BR';
                utterance.pitch = Math.max(0.5, Math.min(2.0, pitch));
                utterance.rate = 0.9;
                utterance.onend = resolve;
                window.speechSynthesis.speak(utterance);
            });
        }
        await new Promise(r => setTimeout(r, 400));
    }
    face.classList.remove('singer-active');
    if (alwaysListen && !isSpeaking) { try { recognition.start(); } catch(e) {} }
}

function handleClientAction(action) {
    if (!action) return;
    console.log("[CAIN ACTION]:", action);
    let autoSuccess = false;
    try {
        switch (action.type) {
            case 'focus_map':
                initClientMap(action.data);
                autoSuccess = true;
                break;
            case 'open_map':
                initClientMap();
                autoSuccess = true;
                break;
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
                if (mHud) {
                    const locs = action.data;
                    const first = locs.find(l => l.lat);
                    const mIframe = document.getElementById('mini-map');
                    if (first && mIframe) mIframe.src = `https://www.google.com/maps?q=${first.lat},${first.lon}&output=embed`;
                    mHud.classList.remove('hidden');
                    let html = '<div class="ip-list"><h3>CONEXÕES ATIVAS</h3>';
                    locs.forEach(l => { html += `<div class="ip-item"><span>📍 ${l.ip}</span><br><small>${l.city}, ${l.country}</small></div>`; });
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
            case 'print': window.print(); autoSuccess = true; break;
            case 'note': downloadNote(action.data); autoSuccess = true; break;
            case 'whatsapp_sync':
                if (Array.isArray(action.data)) {
                    action.data.forEach(msg => {
                        renderSACMessage({ isSac: true, senderName: msg.from, textContent: msg.text, fileType: msg.fileType, fileUrl: msg.file ? `http://181.224.24.70:3100/${msg.file}` : null });
                    });
                }
                autoSuccess = true;
                break;
            case 'media_sequence': handleMediaSequence(action); autoSuccess = true; break;
        }
    } catch (e) { autoSuccess = false; }
}

function downloadNote(text) {
    const blob = new Blob([text], { type: 'text/plain' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'CAIN_Nota.txt';
    document.body.appendChild(a); a.click();
    document.body.removeChild(a); window.URL.revokeObjectURL(url);
}

// MEDIA SEQUENCE HANDLER
let _pendingConfirmation = null;
function waitForConfirmation(label, callback) { _pendingConfirmation = { label, callback }; }
function playAudioAndWait(url) {
    return new Promise(resolve => {
        const audio = new Audio(url);
        audio.onended = resolve; audio.onerror = resolve;
        audio.play().catch(resolve);
    });
}
async function handleMediaSequence(action) {
    const { mediaType, items, clientName } = action;
    const BASE = 'http://181.224.24.70:3100/';
    if (!items || !items.length) return;
    if (mediaType === 'audio') {
        items.forEach((item, i) => renderSACMessage({ isSac: true, senderName: item.from, textContent: `Audio ${i+1}`, fileType: 'audio', fileUrl: BASE + item.file }));
        addMessage('cain', `${items.length} audios de ${clientName}. Quer ouvir? Diga SIM.`);
        speak(`${items.length} áudios. Quer ouvir?`);
        waitForConfirmation('audio', async () => {
            for (let i = 0; i < items.length; i++) {
                addMessage('cain', `Tocando audio ${i+1}`);
                await playAudioAndWait(BASE + items[i].file);
            }
        });
    } else if (mediaType === 'photo' || mediaType === 'document') {
        items.forEach((item, i) => renderSACMessage({ isSac: true, senderName: item.from, textContent: `${mediaType} ${i+1}`, fileType: mediaType, fileUrl: BASE + item.file }));
        addMessage('cain', `${items.length} arquivos de ${clientName}. Abrir?`);
        waitForConfirmation(mediaType, () => items.forEach(item => window.open(BASE + item.file, '_blank')));
    }
}

// Web Speech API Setup
const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
const recognition = SpeechRecognition ? new SpeechRecognition() : null;
const synth = window.speechSynthesis;
let isSpeaking = false, alwaysListen = false, recognitionActive = false, selectedVoice = null;

function loadVoices() {
    const voices = synth.getVoices();
    selectedVoice = voices.find(v => v.lang.includes('pt-BR') && (v.name.includes('Google') || v.name.includes('Daniel') || v.name.includes('Male'))) 
                   || voices.find(v => v.lang.includes('pt-BR')) || voices[0];
}
if (synth.onvoiceschanged !== undefined) synth.onvoiceschanged = loadVoices;
loadVoices();

if (recognition) {
    recognition.continuous = true;
    recognition.interimResults = false;
    recognition.lang = 'pt-BR';
    recognition.onstart = () => recognitionActive = true;
    recognition.onresult = (event) => {
        const transcript = event.results[event.results.length - 1][0].transcript.trim();
        userInput.value = transcript;
        sendMessage();
    };
    recognition.onend = () => {
        recognitionActive = false;
        if (alwaysListen && !isSpeaking) setTimeout(() => { try { recognition.start(); } catch(e) {} }, 300);
    };
}

function toggleVoice() {
    if (alwaysListen) { alwaysListen = false; recognition.stop(); addMessage('cain', "Mudo."); }
    else { alwaysListen = true; try { recognition.start(); addMessage('cain', "Ouvindo..."); } catch(e){} }
}
voiceBtn.addEventListener('click', toggleVoice);

async function sendMessage() {
    const message = userInput.value.trim();
    if (!message) return;
    if (message.includes("1994leo14725863")) { stopLockdown(); userInput.value = ''; return; }
    if (_pendingConfirmation) {
        const lower = message.toLowerCase();
        if (lower === 'sim' || lower === 's') { const cb = _pendingConfirmation.callback; _pendingConfirmation = null; cb(); return; }
        else if (lower === 'não' || lower === 'nao' || lower === 'n') { _pendingConfirmation = null; return; }
    }
    const lowerMsg = message.toLowerCase();
    if ((lowerMsg.includes('mapear') || lowerMsg.includes('mapa')) && lowerMsg.includes('cliente')) {
        userInput.value = ''; addMessage('user', message); initClientMap(); return;
    }
    addMessage('user', message); userInput.value = '';
    try {
        const res = await fetch('/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message, user: currentUser || 'VISITANTE' }) });
        const data = await res.json();
        if (data.intelligence) updateIntelligence(data.intelligence);
        addMessage('cain', data.response);
        if (data.action) handleClientAction(data.action);
        speak(data.response);
    } catch (e) {
        const local = await getFromOfflineMemory(message);
        if (local) addMessage('cain', "[OFFLINE]: " + local);
    }
}
sendBtn.addEventListener('click', sendMessage);
userInput.addEventListener('keypress', (e) => { if (e.key === 'Enter') sendMessage(); });

function addMessage(sender, text) {
    const div = document.createElement('div');
    div.className = `message ${sender}-message`;
    div.textContent = text;
    chatBox.appendChild(div);
    chatBox.scrollTop = chatBox.scrollHeight;
}

function speak(text) {
    if (!synth || isSpeaking) return;
    const ut = new SpeechSynthesisUtterance(text);
    ut.lang = 'pt-BR'; if (selectedVoice) ut.voice = selectedVoice;
    ut.pitch = 0.85; ut.rate = 0.85;
    ut.onstart = () => { isSpeaking = true; document.body.classList.add('speaking'); if (recognitionActive) recognition.stop(); };
    ut.onend = () => { isSpeaking = false; document.body.classList.remove('speaking'); if (alwaysListen) setTimeout(() => { try { recognition.start(); } catch(e){} }, 500); };
    synth.speak(ut);
}

// Biometric & Face Logic
async function initBiometrics() {
    try {
        const MODEL_URL = 'https://cdn.jsdelivr.net/npm/@vladmandic/face-api/model/';
        await Promise.all([faceapi.nets.ssdMobilenetv1.loadFromUri(MODEL_URL), faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL), faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL)]);
        modelsLoaded = true; startWebcam();
    } catch (e) {}
}
async function startWebcam() {
    const video = document.getElementById('video');
    try { const stream = await navigator.mediaDevices.getUserMedia({ video: {} }); video.srcObject = stream; setInterval(detectFace, 3000); } catch (e) {}
}
async function detectFace() {
    if (!modelsLoaded) return;
    const video = document.getElementById('video');
    const detections = await faceapi.detectAllFaces(video).withFaceLandmarks().withFaceDescriptors();
    if (detections.length > 0 && faceMatcher) {
        const best = faceMatcher.findBestMatch(detections[0].descriptor);
        if (best.label !== 'unknown' && recognizedUser !== best.label) {
            recognizedUser = best.label;
            addMessage('cain', `[BIO]: Bem-vindo senhor ${recognizedUser}`);
            speak(`Bem-vindo de volta, senhor ${recognizedUser}`);
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
                const p = data[key];
                profiles.push(new faceapi.LabeledFaceDescriptors(p.name, [new Float32Array(Object.values(p.descriptor))]));
            }
        }
        if (profiles.length) faceMatcher = new faceapi.FaceMatcher(profiles, 0.6);
    } catch (e) {}
}

const headCenter = { x: 0, y: 0 };
document.addEventListener('mousemove', (e) => {
    const x = (e.clientX / window.innerWidth - 0.5) * 30;
    const y = (e.clientY / window.innerHeight - 0.5) * 20;
    head.style.transform = `rotateY(${x}deg) rotateX(${-y}deg)`;
});

window.onload = () => {
    loadVoices(); loadLocalStats(); syncIntelligence(); initOfflineDB();
    setTimeout(() => { if (navigator.onLine) syncKnowledgeToLocal(); }, 2000);
    setInterval(syncIntelligence, 30000); setInterval(syncSystemStats, 5000);
    initBiometrics();
    
    // Verifica autenticação após carregamento parcial
    setTimeout(checkAuthStatus, 1500);
};

// Lockdown Logic
let lockTimer = null;
function startLockdown() {
    document.getElementById('lock-panel').classList.remove('hidden');
    document.body.classList.add('lockdown-active');
    let time = 300;
    lockTimer = setInterval(() => {
        time--;
        const m = Math.floor(time/60), s = time%60;
        document.getElementById('lock-timer').textContent = `${m.toString().padStart(2,'0')}:${s.toString().padStart(2,'0')}`;
        if (time <= 0) { clearInterval(lockTimer); executeWipe(); }
    }, 1000);
}
function stopLockdown() {
    clearInterval(lockTimer); document.getElementById('lock-panel').classList.add('hidden');
    document.body.classList.remove('lockdown-active');
}
async function executeWipe() { await fetch('/lockdown/wipe', { method: 'POST' }); location.reload(); }

// --- SISTEMA DE AUTENTICAÇÃO RESTAURADO ---
function checkAuthStatus() {
    if (!isAuthenticated) {
        const overlay = document.getElementById('security-overlay');
        if (overlay) {
            overlay.classList.remove('hidden');
            speak('Modo restrito ativado. Insira suas credenciais para destravar a memória.', 'pt-BR');
        }
    }
}

document.getElementById('sec-login-btn')?.addEventListener('click', () => {
    let name = document.getElementById('sec-name').value.trim();
    let pass = document.getElementById('sec-pass').value.trim();
    if (name && pass) {
        currentUser = name.toUpperCase();
        isAuthenticated = true;
        document.getElementById('security-overlay').classList.add('hidden');
        addMessage('cain', '[CAIN]: Acesso Autorizado. Banco de memória configurado para: ' + currentUser + '.');
        speak('Acesso liberado. Bem-vindo de volta, ' + currentUser + '.', 'pt-BR');
    } else {
        alert('Preencha os campos Nome e Senha.');
    }
});

// MAP INTEGRATION
let _clientMap = null;
async function initClientMap(focusTarget = null) {
    const hud = document.getElementById('map-full-hud'); if(!hud) return;
    hud.classList.remove('hidden');
    if (!_clientMap) _clientMap = L.map('client-map-container', { maxZoom: 22 }).setView([-6.09, -46.14], 14);
    if (!window._satLayer) {
        window._satLayer = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
            maxZoom: 22,
            maxNativeZoom: 17
        }).addTo(_clientMap);
        window._labelLayer = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}', {
            maxZoom: 22,
            maxNativeZoom: 17
        }).addTo(_clientMap);
    }
    if (window._mapMarkers) window._mapMarkers.forEach(m => _clientMap.removeLayer(m));
    window._mapMarkers = [];
    try {
        const res = await fetch('/api/map/clients');
        const data = await res.json();
        data.markers.forEach(m => {
            const pinColor = m.hasDebt ? "#ff004c" : "#00f2ff";
            
            // SVG do Alfinete Premium do CAIN
            const pinSvg = `
                <svg width="30" height="40" viewBox="0 0 30 40" class="pin-svg" style="color: ${pinColor};">
                    <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
                        <feGaussianBlur stdDeviation="2" result="coloredBlur"/>
                        <feMerge><feMergeNode in="coloredBlur"/><feMergeNode in="SourceGraphic"/></feMerge>
                    </filter>
                    <path d="M15 0C6.7 0 0 6.7 0 15c0 10.5 15 25 15 25s15-14.5 15-25c0-8.3-6.7-15-15-15z" fill="${pinColor}" filter="url(#glow)"/>
                    <circle cx="15" cy="15" r="5" fill="white" opacity="0.8"/>
                </svg>
            `;

            const icon = L.divIcon({ 
                className: "custom-pin", 
                html: pinSvg, 
                iconSize: [30, 40], 
                iconAnchor: [15, 40] 
            });
            
            const marker = L.marker([m.lat, m.lng], { icon }).addTo(_clientMap);
            
            // Tooltip com classe condicional para dívida
            marker.bindTooltip(m.name, { 
                permanent: true, 
                direction: 'right',
                offset: [15, -20],
                className: `client-label ${m.hasDebt ? 'label-debt' : ''}` 
            });

            marker.bindPopup(`
                <div style="font-family: Orbitron, sans-serif; min-width: 180px;">
                    <b style="color: ${pinColor}; font-size: 14px; border-bottom: 1px solid ${pinColor}; display: block; margin-bottom: 5px;">${m.name}</b>
                    <div style="font-size: 11px; margin-bottom: 5px;">📍 ${m.address}</div>
                    <div style="color: ${pinColor}; font-weight: bold;">Débito: ${m.debt}</div>
                </div>
            `);
            window._mapMarkers.push(marker);
        });
        if (focusTarget) {
            _clientMap.setView([focusTarget.lat, focusTarget.lng], 19);
            const m = window._mapMarkers.find(x => x.getLatLng().lat === focusTarget.lat);
            if (m) setTimeout(() => m.openPopup(), 500);
        } else if (window._mapMarkers.length) {
            _clientMap.fitBounds(new L.featureGroup(window._mapMarkers).getBounds());
        }
    } catch (e) {}
}