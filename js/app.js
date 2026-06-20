// ================================================================
// APP.JS — Modular Core Logic (Merged & Refactored)
// ================================================================

// ---- STATE ----
let activeMode = '';
let isRecording = false;
let transcript = [];
let recognition = null;
let commandRecognition = null;
let isDemoPlaying = false;
let vaaniMenuRecognition = null;
let lastTranscriptText = '';
let autoSaveInterval = null;
let demoInterval = null;
let detectedJargon = [];
let lastAnnouncement = 'Welcome to SARAL. How do you want to learn today?';
let isSpeakingTTS = false;
let activeUtterance = null;
let voiceNavigationRecognition = null;

// ---- DOM REFS ----

// ================================================================
// 1. NAVIGATION & ROUTING
// ================================================================
function switchScreen(id) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    const target = document.getElementById(id);
    if (target) target.classList.add('active');
}

function goHome() {
    stopRecording();
    stopDemo();
    stopVoiceCommands();
    stopVaaniMenuListener();
    stopAutoSave();
    localStorage.removeItem('saral_backup');
    
    switchScreen('screenHome');
    document.getElementById('header').style.display = 'none';
    activeMode = '';
}

function startMode(mode, autoStartClass = false) {
    activeMode = mode;
    document.getElementById('header').style.display = 'flex';
    
    const badge = document.getElementById('statusBadge');
    if (badge) {
        badge.textContent = 'Ready';
        badge.classList.remove('recording');
    }
    
    const logo = document.getElementById('logoText');
    if (logo) {
        logo.innerHTML = `SARAL / ${mode.toUpperCase()}`;
    }
    
    clearTranscript();

    if (mode === 'drishti') {
        switchScreen('screenDrishti');
        showToast('Drishti visual mode active');
        stopVoiceCommands();
        if (window.speechSynthesis) window.speechSynthesis.cancel();
        speakText('Drishti Mode loaded.');
    } else if (mode === 'dhyan') {
        switchScreen('screenDhyan');
        document.getElementById('dhyanTranscript').classList.remove('ruler-active');
        showToast('Dhyan focus mode active');
        stopVoiceCommands();
        if (window.speechSynthesis) window.speechSynthesis.cancel();
        speakText('Dhyan Mode loaded.');
    } else if (mode === 'shravan') {
        switchScreen('screenShravan');
        showToast('Shravan audio mode active');

        // Show the "Start Class?" prompt, hide the session area
        const prompt = document.getElementById('shravanStartPrompt');
        const session = document.getElementById('shravanSession');

        if (autoStartClass) {
            if (prompt) prompt.style.display = 'none';
            if (session) session.style.display = 'flex';
            const dot = document.getElementById('shravanLiveDot');
            if (dot) dot.classList.add('active');
            
            speakText('Class started. Recording live audio now.', () => {
                startRecording();
                startVoiceCommands();
            });
        } else {
            if (prompt) prompt.style.display = 'flex';
            if (session) session.style.display = 'none';

            // Speak the prompt first and start commands only after TTS completes
            setTimeout(() => {
                speakText('Welcome to Shravan Mode. Shall we start class? Say Yes to start live recording, or say Demo to hear a sample lecture.', () => {
                    startVoiceCommands();
                });
            }, 600);
        }
        
        // Fallback for browsers that block auto-start of speech
        document.getElementById('screenShravan').addEventListener('click', () => {
            if (commandRecognition) {
                try { commandRecognition.stop(); } catch(e) {}
            }
            isVoiceCommandListening = false;
            speakText('Starting voice listener. Say start class to begin.', () => {
                startVoiceCommands();
            });
        });
    } else if (mode === 'vaani') {
        switchScreen('screenVaani');
        speakText('Vaani Voice selection mode active. Please speak Drishti, Shravan, or Dhyan to choose your mode.');
        startVaaniMenuListener();
    }
    
    startAutoSave();
}

// ================================================================
// 2. SETTINGS MODAL
// ================================================================
function openSettings() {
    const key = localStorage.getItem('saral_gemini_key') || CONFIG.DEFAULT_API_KEY;
    document.getElementById('geminiKeyInput').value = key;
    document.getElementById('settingsModal').classList.add('active');
}

function closeSettings() {
    document.getElementById('settingsModal').classList.remove('active');
}

function closeSettingsOnOverlay(e) {
    if (e.target === document.getElementById('settingsModal')) closeSettings();
}

function saveSettings() {
    const key = document.getElementById('geminiKeyInput').value.trim();
    if (key) {
        localStorage.setItem('saral_gemini_key', key);
    } else {
        localStorage.removeItem('saral_gemini_key');
    }
    closeSettings();
    showToast('Settings saved');
}

// ================================================================
// 3. TRANSCRIPT RENDER SYSTEM
// ================================================================
function clearTranscript() {
    transcript = [];
    detectedJargon = [];
    
    // Drishti reset
    document.getElementById('drishtiTranscriptList').innerHTML = '';
    document.getElementById('drishtiEmptyState').style.display = 'flex';
    document.getElementById('drishtiJargonPanel').innerHTML = '<span class="placeholder-text">Technical terms will appear here</span>';
    document.getElementById('drishtiSummaryPanel').innerHTML = '<span class="placeholder-text">Click Summarize to generate key points</span>';
    document.getElementById('btnSummarizeDrishti').disabled = true;

    // Dhyan reset
    document.getElementById('dhyanTranscriptList').innerHTML = '';
    document.getElementById('dhyanEmptyState').style.display = 'flex';
    document.getElementById('dhyanSummaryPanel').style.display = 'none';
    document.getElementById('dhyanSummaryBullets').innerHTML = '';
    document.getElementById('btnSummarizeDhyan').disabled = true;
    
    // Shravan reset
    const shravanBody = document.getElementById('shravanTranscriptBody');
    if (shravanBody) {
        shravanBody.innerHTML = '<p class="shravan-transcript-empty">Transcript will appear here once the class begins...</p>';
    }
    const wordCountEl = document.getElementById('shravanWordCount');
    if (wordCountEl) {
        wordCountEl.textContent = '0 words';
    }
    
    lastTranscriptText = '';
}

function addTranscriptItem(speaker, text, isAlert = false) {
    const item = {
        speaker: speaker,
        text: text,
        timestamp: new Date().toLocaleTimeString('en-IN', { hour12: false }),
        isAlert: isAlert
    };
    transcript.push(item);
    
    // Drishti View
    const drishtiList = document.getElementById('drishtiTranscriptList');
    if (drishtiList) {
        const emptyState = document.getElementById('drishtiEmptyState');
        if (emptyState) emptyState.style.display = 'none';
        const div = document.createElement('div');
        div.className = `transcript-item ${speaker.toLowerCase()} ${isAlert ? 'alert-item' : ''}`;
        div.innerHTML = `
            <div class="transcript-meta">
                <span class="speaker-tag">${isAlert ? 'ALERT' : speaker}</span>
                <span class="timestamp">${item.timestamp}</span>
            </div>
            <div class="transcript-text">${highlightJargon(text)}</div>
        `;
        drishtiList.appendChild(div);
        const scrollBox = document.getElementById('drishtiFeedScroll');
        if (scrollBox) scrollBox.scrollTop = scrollBox.scrollHeight;
    }

    // Dhyan View (Bionic spacing)
    const dhyanList = document.getElementById('dhyanTranscriptList');
    if (dhyanList) {
        const emptyState = document.getElementById('dhyanEmptyState');
        if (emptyState) emptyState.style.display = 'none';
        const div = document.createElement('div');
        div.className = `transcript-item ${speaker.toLowerCase()} ${isAlert ? 'alert-item' : ''}`;
        div.innerHTML = `
            <div class="transcript-meta" style="font-size: 14px;">
                <span class="speaker-tag">${isAlert ? 'ALERT' : speaker}</span>
                <span class="timestamp">${item.timestamp}</span>
            </div>
            <div class="transcript-text">${applyBionicReading(text)}</div>
        `;
        dhyanList.appendChild(div);
        const scrollBox = document.getElementById('dhyanTranscript');
        if (scrollBox) scrollBox.scrollTop = scrollBox.scrollHeight;
    }

    // Shravan View Update
    const shravanBody = document.getElementById('shravanTranscriptBody');
    if (shravanBody) {
        const emptyState = shravanBody.querySelector('.shravan-transcript-empty');
        if (emptyState) emptyState.remove();
        
        const div = document.createElement('div');
        div.className = `transcript-item ${speaker.toLowerCase()} ${isAlert ? 'alert-item' : ''}`;
        div.innerHTML = `
            <div class="transcript-meta" style="font-size: 14px;">
                <span class="speaker-tag">${isAlert ? 'ALERT' : speaker}</span>
                <span class="timestamp">${item.timestamp}</span>
            </div>
            <div class="transcript-text">${escapeHtml(text)}</div>
        `;
        shravanBody.appendChild(div);
        shravanBody.scrollTop = shravanBody.scrollHeight;

        // Word count update
        const wordCount = transcript.reduce((acc, curr) => acc + curr.text.split(/\s+/).filter(Boolean).length, 0);
        const wordCountEl = document.getElementById('shravanWordCount');
        if (wordCountEl) {
            wordCountEl.textContent = `${wordCount} words`;
        }
    }

    // Shravan text update
    const hiddenLog = document.getElementById('shravanHiddenTranscript');
    if (hiddenLog) {
        hiddenLog.innerHTML = transcript.map(t => `[${t.timestamp}] ${t.speaker}: ${t.text}`).join('\n');
    }
    
    if (!isAlert) {
        checkJargon(text);
        document.getElementById('btnSummarizeDrishti').disabled = false;
        document.getElementById('btnSummarizeDhyan').disabled = false;
    }
    
    if (activeMode === 'shravan') {
        speakText(`${speaker} said: ${text}`);
    }
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function highlightJargon(text) {
    let result = escapeHtml(text);
    Object.keys(jargonDB).forEach(word => {
        const regex = new RegExp(`\\b(${word})\\b`, 'gi');
        result = result.replace(regex, `<span class="jargon-highlight" onclick="speakJargonWord('$1')">$1</span>`);
    });
    return result;
}

function applyBionicReading(text) {
    return text.split(' ').map(word => {
        if (word.length <= 1) return `<span class="bionic-word">${escapeHtml(word)}</span>`;
        
        const match = word.match(/^([a-zA-Z0-9']+)([^a-zA-Z0-9']*)$/);
        if (!match) return `<span class="bionic-word">${escapeHtml(word)}</span>`;
        
        const core = match[1];
        const punc = match[2];
        const mid = Math.ceil(core.length / 2);
        return `<span class="bionic-word">${escapeHtml(core.slice(0, mid))}</span>${escapeHtml(core.slice(mid))}${escapeHtml(punc)}`;
    }).join(' ');
}

// ================================================================
// 4. SPEAKER DIARIZATION (Smart Heuristics)
// ================================================================
function classifySpeaker(text) {
    const wordCount = text.split(/\s+/).length;
    const isQuestion = text.trim().endsWith('?');
    // Heuristic: >10 words + no "?" = Professor, else Student
    if (wordCount > 10 && !isQuestion) {
        return 'PROFESSOR';
    }
    return 'STUDENT';
}

// ================================================================
// 5. JARGON DETECTION & READING
// ================================================================
function checkJargon(text) {
    const words = text.toLowerCase().replace(/[.,\/#!$%\^&\*;:{}=\-_`~()?]/g, "").split(/\s+/) || [];
    let updated = false;
    
    for (const word of words) {
        if (jargonDB[word] && !detectedJargon.some(f => f.term === word)) {
            detectedJargon.push({ term: word, definition: jargonDB[word] });
            updated = true;
        }
    }
    
    const lowerText = text.toLowerCase();
    for (const [term, def] of Object.entries(jargonDB)) {
        if (term.includes(' ') && lowerText.includes(term) && !detectedJargon.some(f => f.term === term)) {
            detectedJargon.push({ term: term, definition: def });
            updated = true;
        }
    }
    
    if (updated || detectedJargon.length > 0) {
        const drishtiJargon = document.getElementById('drishtiJargonPanel');
        if (drishtiJargon) {
            drishtiJargon.innerHTML = detectedJargon.map(f => `
                <div style="margin-bottom:10px; border-bottom: 1px dashed var(--border); padding-bottom: 6px;">
                    <span class="jargon-term" onclick="speakJargonWord('${f.term}')" style="cursor:pointer; font-weight:700; text-decoration:underline; color:var(--accent);">${escapeHtml(f.term.toUpperCase())}</span>: ${escapeHtml(f.definition)}
                </div>
            `).join('');
        }
        
        if (activeMode === 'shravan' && updated) {
            const latest = detectedJargon[detectedJargon.length - 1];
            speakText(`New jargon matched: ${latest.term}. Definition is: ${latest.definition}`);
        }
    }
}

function speakJargonWord(term) {
    const clean = term.toLowerCase();
    if (jargonDB[clean]) {
        speakText(`${term} means: ${jargonDB[clean]}`);
    }
}

// ================================================================
// 6. SPEECH RECOGNITION (Web Speech API)
// ================================================================
function initRecognition() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
        showToast('Speech recognition not supported. Use demo mode (Ctrl+Shift+D)');
        return null;
    }
    
    const rec = new SpeechRecognition();
    rec.continuous = true;
    rec.interimResults = false;
    rec.lang = 'en-IN';
    
    rec.onresult = (event) => {
        const text = event.results[event.results.length - 1][0].transcript;
        if (event.results[event.results.length - 1].isFinal) {
            const speaker = classifySpeaker(text);
            addTranscriptItem(speaker, text);
        }
    };
    
    rec.onerror = (event) => {
        if (event.error !== 'no-speech') {
            console.error('Speech error:', event.error);
            showToast('Speech error: ' + event.error);
        }
    };
    
    rec.onend = () => {
        if (isRecording && !isSpeakingTTS) {
            try { recognition.start(); } catch(e) {}
        }
    };
    
    return rec;
}

function toggleRecording() {
    if (isRecording) {
        stopRecording();
    } else {
        startRecording();
    }
}

function startRecording() {
    recognition = initRecognition();
    if (!recognition) return;
    
    try {
        recognition.start();
        isRecording = true;
        
        // Update Drishti Controls
        const btnD = document.getElementById('btnRecordDrishti');
        if (btnD) {
            btnD.innerHTML = 'Stop Listening';
            btnD.className = 'btn btn-danger focus-outline';
        }

        // Update Dhyan Controls
        const btnDy = document.getElementById('btnRecordDhyan');
        if (btnDy) {
            btnDy.innerHTML = 'Stop Listening';
            btnDy.className = 'btn btn-danger focus-outline';
        }

        // Update Shravan Controls
        const btnS = document.getElementById('btnShravanMic');
        if (btnS) {
            btnS.innerHTML = '<span>🛑 Stop Session</span><span class="shravan-btn-sub">Stop capturing lecture speech</span>';
            btnS.className = 'btn btn-danger shravan-btn';
        }
        
        const badge = document.getElementById('statusBadge');
        if (badge) {
            badge.textContent = '● Recording';
            badge.classList.add('recording');
        }
        
        showToast('Listening active');
        speakText('Microphone active');
    } catch (e) {
        showToast('Could not start recording: ' + e.message);
    }
}

function stopRecording() {
    isRecording = false;
    if (recognition) {
        try { recognition.stop(); } catch(e) {}
        recognition = null;
    }
    
    const btnD = document.getElementById('btnRecordDrishti');
    if (btnD) {
        btnD.innerHTML = 'Start Listening';
        btnD.className = 'btn btn-primary focus-outline';
    }

    const btnDy = document.getElementById('btnRecordDhyan');
    if (btnDy) {
        btnDy.innerHTML = 'Start Listening';
        btnDy.className = 'btn btn-primary focus-outline';
    }

    const btnS = document.getElementById('btnShravanMic');
    if (btnS) {
        btnS.innerHTML = '<span>🎤 Start Session</span><span class="shravan-btn-sub">Starts recording student/professor audio</span>';
        btnS.className = 'btn btn-primary shravan-btn';
    }
    
    const badge = document.getElementById('statusBadge');
    if (badge) {
        badge.textContent = 'Ready';
        badge.classList.remove('recording');
    }
    speakText('Microphone off');
}

// Removed duplicate simulateLecture// ================================================================
// 7. SHRAVAN VOICE COMMAND LISTENERS
// Hide the start prompt and show the session area
function hideStartPrompt() {
    const prompt = document.getElementById('shravanStartPrompt');
    const session = document.getElementById('shravanSession');
    if (prompt) prompt.style.display = 'none';
    if (session) session.style.display = 'flex';
    // Activate live dot
    const dot = document.getElementById('shravanLiveDot');
    if (dot) dot.classList.add('active');
}

// Start real class session (live mic recording)
function startClassSession() {
    hideStartPrompt();
    speakText('Class started. Recording live audio now.');
    setTimeout(() => startRecording(), 500);
}

// ================================================================
// 7. SHRAVAN VOICE COMMAND LISTENERS
let isVoiceCommandListening = false;

function startVoiceNavigation() {
    if (voiceDefectRecognition) {
        try { voiceDefectRecognition.stop(); } catch(e) {}
    }
    
    speakText("Welcome to SARAL. I will describe each mode. Say the mode name to select it. Say repeat to hear again.");
    
    const descriptions = [
        "Drishti mode. For deaf and hard of hearing students. Visual interface with real-time captions and speaker identification.",
        "Shravan mode. For blind and visually impaired students. Zero-click voice interface. Just speak commands.",
        "Dhyan mode. For dyslexia and ADHD. Focus-enhanced reading with bionic text and reduced clutter.",
        "Vaani mode. For motor disabilities. Voice-controlled interface with command recognition."
    ];
    
    let current = 0;
    
    function speakCurrent() {
        speakText(descriptions[current] + " Say next, previous, or select this mode.");
    }
    
    setTimeout(speakCurrent, 6000);
    
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) return;
    voiceNavigationRecognition = new SR();
    voiceNavigationRecognition.continuous = true;
    voiceNavigationRecognition.interimResults = false;
    voiceNavigationRecognition.lang = 'en-IN';
    
    voiceNavigationRecognition.onresult = (e) => {
        const cmd = e.results[e.results.length - 1][0].transcript.toLowerCase().trim();
        
        if (cmd.includes('next')) {
            current = (current + 1) % 4;
            speakCurrent();
        } else if (cmd.includes('previous') || cmd.includes('back')) {
            current = (current - 1 + 4) % 4;
            speakCurrent();
        } else if (cmd.includes('select') || cmd.includes('this') || cmd.includes('choose')) {
            const modes = ['drishti', 'shravan', 'dhyan', 'vaani'];
            speakText("Starting " + ['Drishti', 'Shravan', 'Dhyan', 'Vaani'][current] + " mode.");
            setTimeout(() => startMode(modes[current]), 1500);
            try { voiceNavigationRecognition.stop(); } catch(err) {}
        } else if (cmd.includes('repeat')) {
            speakCurrent();
        }
    };
    
    voiceNavigationRecognition.onend = () => {
        if (activeMode === null || document.getElementById('screenHome').classList.contains('active-screen')) {
             try { voiceNavigationRecognition.start(); } catch(err) {}
        }
    };
    
    try { voiceNavigationRecognition.start(); } catch(err) {
        speakText("Voice navigation requires microphone access.");
    }
}

function processVoiceCommand(cmd) {
    console.log('Command:', cmd);
    
    if (cmd.includes('start') && (cmd.includes('class') || cmd.includes('record') || cmd.includes('session'))) {
        const prompt = document.getElementById('shravanStartPrompt');
        if (prompt && prompt.style.display !== 'none') {
            startClassSession();
        } else if (!isRecording) {
            startRecording();
            speakText('Recording started.');
        } else {
            speakText('Class is already recording.');
        }
    } else if (cmd.includes('yes') || cmd.includes('okay') || cmd.includes('sure')) {
        const prompt = document.getElementById('shravanStartPrompt');
        if (prompt && prompt.style.display !== 'none') {
            startClassSession();
        } else {
            speakText('Class is already in progress.');
        }
    } else if (cmd.includes('demo') || cmd.includes('sample')) {
        if (!isDemoPlaying) {
            const prompt = document.getElementById('shravanStartPrompt');
            const session = document.getElementById('shravanSession');
            if (prompt) prompt.style.display = 'none';
            if (session) session.style.display = 'block';
            simulateLecture();
        } else {
            speakText('Demo already playing.');
        }
    } else if (cmd.includes('stop') && (cmd.includes('class') || cmd.includes('record') || cmd.includes('session'))) {
        if (!isRecording) {
            speakText('No class is recording. Say start class first.');
        } else {
            stopRecording();
            speakText('Recording stopped.');
        }
    } else if (cmd.includes('summarize') || cmd.includes('summary')) {
        if (transcript.length === 0) {
            speakText('No transcript yet. Say start class first.');
        } else {
            speakText('Generating summary...');
            generateSummary();
        }
    } else if (cmd.includes('save') || cmd.includes('download')) {
        if (transcript.length === 0) {
            speakText('Nothing to save. Say start class first.');
        } else {
            saveTranscript();
            speakText('Notes saved successfully.');
        }
    } else if (cmd.includes('emergency') || cmd.includes('help me') || cmd.includes('alert') || cmd.includes('professor')) {
        triggerEmergency();
        speakText('Alert sent to professor.');
    } else if (cmd.includes('home') || cmd.includes('exit') || cmd.includes('back') || cmd.includes('quit')) {
        speakText('Going back to home screen.');
        setTimeout(goHome, 1500);
    } else if (cmd.includes('what') || cmd.includes('command') || cmd.includes('help')) {
        speakText('Available commands: start class, stop class, summarize, save, emergency, go home. Say repeat to hear again.');
    } else {
        console.log('🔇 Ignored (not a command):', cmd);
    }
}

function startVoiceCommands() {
    if (isVoiceCommandListening) return;

    if (!commandRecognition) {
        const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!SR) {
            showToast('Voice recognition not supported. Please use Chrome browser.');
            speakText('Voice recognition not supported. Please use Chrome browser.');
            return;
        }
        
        commandRecognition = new SR();
        commandRecognition.continuous = true;
        commandRecognition.interimResults = true;
        commandRecognition.lang = 'en-IN';
        
        commandRecognition.onstart = () => {
            isVoiceCommandListening = true;
        };
        
        commandRecognition.onend = () => {
            isVoiceCommandListening = false;
            // Auto-restart after short delay
            if (activeMode === 'shravan') {
                setTimeout(() => {
                    if (activeMode === 'shravan' && !isSpeakingTTS && !isVoiceCommandListening) {
                        try { commandRecognition.start(); } catch(e) {}
                    }
                }, 300);
            }
        };
        
        commandRecognition.onresult = (e) => {
            let finalTranscript = '';
            for (let i = e.resultIndex; i < e.results.length; i++) {
                if (e.results[i].isFinal) {
                    finalTranscript += e.results[i][0].transcript;
                }
            }
            if (finalTranscript.trim()) {
                processVoiceCommand(finalTranscript.toLowerCase().trim());
            }
        };
        
        commandRecognition.onerror = (e) => {
            console.log('Speech error:', e.error);
            if (e.error === 'not-allowed') {
                showToast("Microphone access blocked.");
            }
            if (e.error === 'no-speech' || e.error === 'aborted') return;
        };
    }
    
    try { 
        commandRecognition.start();
    } catch(e) {
        console.warn('Could not start command recognition:', e);
    }
}

function stopVoiceCommands() {
    if (commandRecognition) {
        try { commandRecognition.stop(); } catch(e) {}
        commandRecognition = null;
        isVoiceCommandListening = false;
    }
}

// ================================================================
// 8. VAANI INTERACTION MENU (Hands-Free Selector)
// ================================================================
function startVaaniMenuListener() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) return;

    vaaniMenuRecognition = new SpeechRecognition();
    vaaniMenuRecognition.continuous = true;
    vaaniMenuRecognition.interimResults = false;
    vaaniMenuRecognition.lang = 'en-IN';

    const indicator = document.getElementById('vaaniMicIcon');
    const statusLabel = document.getElementById('vaaniStatusText');

    vaaniMenuRecognition.onstart = () => {
        indicator.classList.add('listening');
        statusLabel.textContent = 'Listening for menu commands...';
    };

    vaaniMenuRecognition.onresult = (e) => {
        const text = e.results[e.results.length - 1][0].transcript.trim().toLowerCase();
        console.log("Vaani Choice Heard:", text);

        if (text.includes('drishti')) {
            startMode('drishti');
        } else if (text.includes('shravan') || text.includes('audio')) {
            startMode('shravan');
        } else if (text.includes('dhyan') || text.includes('focus')) {
            startMode('dhyan');
        } else if (text.includes('home') || text.includes('exit')) {
            speakText('Going back to home screen. Say Drishti, Shravan, or Dhyan to choose a mode.');
            setTimeout(goHome, 1500);
        } else {
            console.log('🔇 Ignored in Vaani menu:', text);
        }
    };

    vaaniMenuRecognition.onerror = (e) => {
        if (e.error !== 'no-speech') {
            console.log('Vaani error:', e.error);
        }
    };

    vaaniMenuRecognition.onend = () => {
        if (activeMode === 'vaani') {
            try { vaaniMenuRecognition.start(); } catch(e) {}
        } else {
            indicator.classList.remove('listening');
        }
    };

    try { vaaniMenuRecognition.start(); } catch(e) {}
}

function stopVaaniMenuListener() {
    if (vaaniMenuRecognition) {
        try { vaaniMenuRecognition.stop(); } catch(e) {}
        vaaniMenuRecognition = null;
    }
}

function toggleVaaniMic() {
    const indicator = document.getElementById('vaaniMicIcon');
    const statusLabel = document.getElementById('vaaniStatusText');
    if (vaaniMenuRecognition) {
        stopVaaniMenuListener();
        indicator.classList.remove('listening');
        statusLabel.textContent = 'Voice menu paused. Click icon to activate.';
    } else {
        startVaaniMenuListener();
    }
}

// ================================================================
// 9. DHYAN SPECIAL INTERFACE CONTROLS
// ================================================================
function toggleFocusRuler() {
    const box = document.getElementById('dhyanTranscript');
    const btn = document.getElementById('btnRulerToggle');
    if (box.classList.contains('ruler-active')) {
        box.classList.remove('ruler-active');
        btn.textContent = "Focus Guide";
        announceText("Dyslexia focus guide ruler disabled.");
    } else {
        box.classList.add('ruler-active');
        btn.textContent = "Hide Guide";
        announceText("Dyslexia focus guide ruler enabled.");
    }
}

// ================================================================
// 10. SUMMARIZATION & AI API CALLS
// ================================================================
async function generateSummary() {
    if (transcript.length === 0) {
        showToast('No transcript contents to summarize');
        return;
    }
    
    const text = transcript.filter(t => !t.isAlert).map(t => t.text).join(' ');
    const dPanel = document.getElementById('drishtiSummaryPanel');
    const dyBullets = document.getElementById('dhyanSummaryBullets');
    const dyPanel = document.getElementById('dhyanSummaryPanel');
    
    if (dPanel) dPanel.innerHTML = '<span class="placeholder-text">Summarizing...</span>';
    if (dyBullets) dyBullets.innerHTML = '<span class="placeholder-text">Summarizing...</span>';
    
    let bullets = [];
    let isFallback = false;

    const apiKey = CONFIG.getApiKey();

    if (apiKey && navigator.onLine) {
        try {
            const rawSummary = await callSummaryAPI(apiKey, text);
            bullets = parseSummaryBullets(rawSummary);
            lastTranscriptText = rawSummary;
        } catch (e) {
            console.error('Summary API query error:', e);
            isFallback = true;
            bullets = getFallbackSummaryText(transcript);
        }
    } else {
        isFallback = true;
        bullets = getFallbackSummaryText(transcript);
    }

    // Drishti summary
    if (dPanel) {
        dPanel.innerHTML = '';
        if (isFallback) {
            dPanel.innerHTML = `<div style="color:var(--alert); font-size:12px; margin-bottom:8px; font-weight:bold;">Offline Concepts Heuristic Summary Active</div>`;
        }
        dPanel.innerHTML += '<ul style="padding-left: 18px;">' + bullets.map(b => `<li style="margin-bottom:6px;">${escapeHtml(b)}</li>`).join('') + '</ul>';
    }

    // Dhyan summary
    if (dyPanel && dyBullets) {
        dyBullets.innerHTML = '';
        dyPanel.style.display = 'block';
        if (isFallback) {
            dyBullets.innerHTML = `<div style="color:var(--alert); font-size:14px; margin-bottom:8px; font-weight:bold;">Offline Concepts Heuristic Summary Active</div>`;
        }
        const ul = document.createElement('ul');
        ul.style.paddingLeft = '18px';
        bullets.forEach(b => {
            const li = document.createElement('li');
            li.style.marginBottom = '6px';
            li.innerHTML = applyBionicReading(b);
            ul.appendChild(li);
        });
        dyBullets.appendChild(ul);
        
        const dhyanContainer = document.getElementById('dhyanTranscript');
        dhyanContainer.scrollTop = dhyanContainer.scrollHeight;
    }
    
    lastTranscriptText = bullets.join('. ');
    const isGroq = apiKey.trim().startsWith('gsk_');
    showToast(isFallback ? 'Concept highlights ready' : (isGroq ? 'Groq Summary ready' : 'Gemini Summary ready'));
    speakText(isFallback ? 'Concept summary highlights ready' : (isGroq ? 'Groq summary highlights ready' : 'Gemini summary highlights ready'));
}

async function callSummaryAPI(key, text) {
    if (key.startsWith('gsk_')) {
        const response = await fetch(
            'https://api.groq.com/openai/v1/chat/completions',
            {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${key}`
                },
                body: JSON.stringify({
                    model: 'llama-3.3-70b-versatile',
                    messages: [{
                        role: 'user',
                        content: `Summarize this classroom transcript into exactly 5 study bullet points. Focus on key terms and formulas:\n\n${text}`
                    }],
                    temperature: 0.2
                })
            }
        );
        if (!response.ok) throw new Error('Groq API error');
        const data = await response.json();
        return data.choices[0].message.content;
    } else {
        const response = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${key}`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents: [{
                        parts: [{
                            text: `Summarize this classroom transcript into exactly 5 study bullet points. Focus on key terms and formulas:\n\n${text}`
                        }]
                    }]
                })
            }
        );
        if (!response.ok) throw new Error('Gemini API error');
        const data = await response.json();
        return data.candidates[0].content.parts[0].text;
    }
}

function parseSummaryBullets(text) {
    return text.split('\n')
        .map(line => line.replace(/^[\s*-•\d.]*/, '').trim())
        .filter(l => l.length > 0)
        .slice(0, 5);
}

function getFallbackSummaryText(items) {
    const sentences = items
        .filter(t => !t.isAlert)
        .map(t => t.text)
        .join(' ')
        .split(/[.!?]+/)
        .map(s => s.trim())
        .filter(s => s.length > 20)
        .sort((a, b) => b.length - a.length)
        .slice(0, 3);
    
    if (sentences.length === 0) return ['No key points identified in short transcript.'];
    return sentences.map((s, idx) => `Key Point ${idx+1}: ${s}.`);
}

// ================================================================
// 11. TEXT-TO-SPEECH
// ================================================================
function speakSummary() {
    const text = lastTranscriptText;
    if (!text) {
        showToast('Generate summary highlights first');
        return;
    }
    speakText(text);
}

function speakText(text, callback = null) {
    if (activeMode && activeMode !== 'shravan') {
        console.log('🔇 Voice disabled (Deaf/Visual mode). Skipping:', text);
        return;
    }

    if (!window.speechSynthesis) {
        showToast('Text-to-speech not supported');
        return;
    }
    
    window.speechSynthesis.cancel();
    isSpeakingTTS = false;

    let wasRecording = isRecording;
    let wasCommandListening = (activeMode === 'shravan' && commandRecognition);
    let wasDefectListening = isVoiceDefectListening;

    if (recognition) {
        try { recognition.stop(); } catch(e) {}
    }
    if (commandRecognition) {
        try { commandRecognition.stop(); } catch(e) {}
    }
    if (voiceDefectRecognition) {
        try { voiceDefectRecognition.stop(); } catch(e) {}
    }
    if (voiceNavigationRecognition) {
        try { voiceNavigationRecognition.stop(); } catch(e) {}
    }

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'en-IN';
    
    const voices = window.speechSynthesis.getVoices();
    const indianVoice = voices.find(v => v.lang === 'en-IN' || v.name.toLowerCase().includes('india'));
    if (indianVoice) {
        utterance.voice = indianVoice;
    }
    
    utterance.rate = 0.95;
    utterance.pitch = 1;
    activeUtterance = utterance;
    isSpeakingTTS = true;

    const handleSpeechFinished = () => {
        if (!isSpeakingTTS) return;
        isSpeakingTTS = false;
        activeUtterance = null;
        
        if (wasRecording && activeMode) {
            if (!recognition) {
                recognition = initRecognition();
            }
            try { recognition.start(); } catch(e) {}
        }
        if (wasCommandListening && activeMode === 'shravan') {
            startVoiceCommands();
        }
        if (wasDefectListening && !activeMode) {
            startVoiceDefectDetection(true);
        }

        if (callback) {
            callback();
        }
    };

    utterance.onend = handleSpeechFinished;
    utterance.onerror = handleSpeechFinished;
    
    window.speechSynthesis.speak(utterance);
    lastAnnouncement = text;
}

// ================================================================
// 12. EMERGENCY FLASH TRIGGER
// ================================================================
function triggerEmergency() {
    const flash = document.getElementById('emergencyFlash');
    if (flash) {
        flash.classList.add('active');
        setTimeout(() => flash.classList.remove('active'), 600);
    }
    
    addTranscriptItem('SYSTEM ALERT', 'Student requested repeat of last statement', true);
    showToast('Repeat request triggered');
    speakText('Professor, please repeat');
}

// ================================================================
// 13. FILE SAVE
// ================================================================
function saveTranscript() {
    if (transcript.length === 0) {
        showToast('Nothing to save');
        return;
    }
    
    const content = [
        'SARAL — Lecture Transcript & Report',
        '=============================================',
        `Mode Layout: ${activeMode.toUpperCase()}`,
        `Date: ${new Date().toLocaleString('en-IN')}`,
        `Total statements: ${transcript.length}`,
        '',
        ...transcript.map(t => `[${t.timestamp}] ${t.speaker}: ${t.text}`),
        '',
        '=============================================',
        'DETECTED JARGON TERMS',
        ...detectedJargon.map(j => `- ${j.term.toUpperCase()}: ${j.definition}`),
        '',
        '---',
        'Generated by SARAL — PS-12 Assistant'
    ].join('\n');
    
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `lecture-transcript-${Date.now()}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    showToast('Transcript downloaded');
}

// ================================================================
// 14. AUTO-BACKUP & RECOVERY
// ================================================================
function startAutoSave() {
    autoSaveInterval = setInterval(() => {
        if (transcript.length > 0) {
            localStorage.setItem('saral_backup', JSON.stringify({
                mode: activeMode,
                transcript: transcript,
                time: Date.now()
            }));
        }
    }, 30000);
}

function stopAutoSave() {
    if (autoSaveInterval) {
        clearInterval(autoSaveInterval);
        autoSaveInterval = null;
    }
}

function loadBackup() {
    const backup = localStorage.getItem('saral_backup');
    if (backup) {
        try {
            const data = JSON.parse(backup);
            // Must have a valid mode, and be less than 1 hour old
            if (data && data.mode && data.mode !== '' && Date.now() - data.time < 3600000) { 
                return data;
            }
        } catch(e) {}
    }
    return null;
}

// ================================================================
// 15. DEMO SEQUENCER & KEYBOARD SHORTCUTS
// ================================================================
const DEMO_SCRIPT = [
    { speaker: 'PROFESSOR', text: 'Good morning everyone. Today we will discuss capacitors in AC circuits.', delay: 500 },
    { speaker: 'PROFESSOR', text: 'A capacitor stores electrical energy and releases it when the circuit needs it.', delay: 800 },
    { speaker: 'PROFESSOR', text: 'Impedance is the total opposition to current flow. It combines resistance and reactance.', delay: 800 },
    { speaker: 'PROFESSOR', text: 'The formula is Z equals square root of R squared plus X C squared.', delay: 700 },
    { speaker: 'PROFESSOR', text: 'Resistance opposes current in all circuits. Reactance depends on frequency and capacitor or inductor values.', delay: 1000 },
    { speaker: 'SYSTEM_SOUND_ALERT', text: 'LOUD NOISE ALERT: Heavy sound or door slam detected in the classroom.', delay: 300 },
    { speaker: 'PROFESSOR', text: 'In a pure capacitor, current leads voltage by ninety degrees. This phase shift is crucial for filter design.', delay: 900 },
    { speaker: 'PROFESSOR', text: 'Backpropagation is an algorithm that trains neural networks. It calculates gradients of the loss function with respect to weights.', delay: 1000 }
];

function simulateLecture() {
    if (isDemoPlaying) return;
    isDemoPlaying = true;
    
    clearTranscript();
    showToast('Demo mode: Simulating lecture...');
    if (activeMode === 'shravan') {
        speakText('Starting demo class. Listening to professor.');
    }
    
    let index = 0;
    
    function playNext() {
        if (!isDemoPlaying) return;
        
        if (index >= DEMO_SCRIPT.length) {
            isDemoPlaying = false;
            showToast('Demo sequence complete.');
            if (activeMode === 'shravan') {
                speakText('Demo complete. Say Summarize to generate notes.');
            }
            return;
        }
        
        const item = DEMO_SCRIPT[index];
        if (item.speaker === 'SYSTEM_SOUND_ALERT') {
            const flash = document.getElementById('emergencyFlash');
            if (flash) {
                flash.classList.add('active');
                setTimeout(() => flash.classList.remove('active'), 600);
            }
            addTranscriptItem('SYSTEM ALERT', item.text, true);
        } else {
            addTranscriptItem(item.speaker, item.text);
        }
        
        index++;
        
        // Calculate dynamic delay based on length of text to ensure it finishes speaking
        const dynamicDelay = Math.max(5000, item.text.length * 90);
        demoInterval = setTimeout(playNext, dynamicDelay);
    }
    
    // Start after a short delay to let the initial "Starting demo class" finish
    demoInterval = setTimeout(playNext, 4000);
}

function stopDemo() {
    isDemoPlaying = false;
    if (demoInterval) {
        clearTimeout(demoInterval);
        demoInterval = null;
    }
}

// Keyboard shortcuts binding
let spacePressed = false;

document.addEventListener('keydown', (e) => {
    // Ignore key triggers if typing inside dialog input field
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

    // Ctrl + Plus/Minus for font size
    if (e.ctrlKey && e.key === '=') {
        e.preventDefault();
        changeFontSize(1);
    }
    if (e.ctrlKey && e.key === '-') {
        e.preventDefault();
        changeFontSize(-1);
    }
    // Ctrl + Shift + C for contrast
    if (e.ctrlKey && e.shiftKey && e.key === 'C') {
        e.preventDefault();
        toggleHighContrast();
    }

    // Ctrl + Shift + S = Start Demo Lecture
    if (e.ctrlKey && e.shiftKey && e.key === 'S') {
        e.preventDefault();
        simulateLecture();
        return;
    }

    // Alt + 1 = Drishti
    if (e.altKey && e.key === '1') {
        e.preventDefault();
        startMode('drishti');
        speakText('Drishti Mode activated. Visual layout with live transcript.');
    }
    // Alt + 2 = Shravan
    if (e.altKey && e.key === '2') {
        e.preventDefault();
        startMode('shravan');
        speakText('Shravan Mode activated. Audio loop enabled.');
    }
    // Alt + 3 = Dhyan
    if (e.altKey && e.key === '3') {
        e.preventDefault();
        startMode('dhyan');
        speakText('Dhyan Mode activated. Dyslexia focus helper.');
    }
    // Alt + 4 = Vaani
    if (e.altKey && e.key === '4') {
        e.preventDefault();
        startMode('vaani');
        speakText('Vaani Mode activated. Voice menu loaded.');
    }
    // Alt + H = Go Home
    if (e.altKey && e.key.toLowerCase() === 'h') {
        e.preventDefault();
        goHome();
        speakText('Returned to Home screen selector.');
    }

    // Ctrl+Shift+D triggers Demo Lecture
    if (e.ctrlKey && e.shiftKey && e.key === 'D') {
        e.preventDefault();
        if (activeMode) simulateLecture();
        else showToast('Select a learning mode first');
    }
    
    // Ctrl+E or Ctrl+A triggers Emergency Flash Repeat Alert
    if (e.ctrlKey && (e.key === 'e' || e.key === 'a') && activeMode) {
        e.preventDefault();
        triggerEmergency();
        speakText('Alert sent to professor.');
    }
    
    // Ctrl+S triggers Smart Summary
    if (e.ctrlKey && e.key === 's' && activeMode) {
        e.preventDefault();
        generateSummary();
        speakText('Summarizing lecture now.');
    }

    // Ctrl+D downloads/saves Transcript File
    if (e.ctrlKey && e.key === 'd' && activeMode) {
        e.preventDefault();
        saveTranscript();
        speakText('Transcript saved.');
    }

    // Spacebar hold for Push-to-Talk (PTT)
    if (e.key === ' ' && pushToTalkMode && activeMode && activeMode !== 'vaani') {
        e.preventDefault();
        if (!spacePressed && !isRecording) {
            spacePressed = true;
            startRecording();
        }
    }

    // Spacebar to toggle Mic globally (in Drishti/Dhyan when not typing and PTT is off)
    if (e.key === ' ' && activeMode && activeMode !== 'vaani' && activeMode !== 'shravan' && !pushToTalkMode) {
        if (e.target.tagName !== 'BUTTON' && e.target.tagName !== 'INPUT' && e.target.tagName !== 'TEXTAREA') {
            e.preventDefault();
            toggleRecording();
        }
    }

    // Shravan Spacebar repeat (only if PTT is not active)
    if (e.key === ' ' && activeMode === 'shravan' && !pushToTalkMode) {
        if (e.target.tagName !== 'BUTTON') {
            e.preventDefault();
            speakText(lastAnnouncement);
        }
    }
});

document.addEventListener('keyup', (e) => {
    if (e.key === ' ' && pushToTalkMode && spacePressed) {
        e.preventDefault();
        spacePressed = false;
        if (isRecording) {
            stopRecording();
        }
    }
});

// ================================================================
// 16. TOAST MESSAGES
// ================================================================
function showToast(message) {
    const toast = document.getElementById('toast');
    if (toast) {
        toast.textContent = message;
        toast.classList.add('show');
        setTimeout(() => toast.classList.remove('show'), 3000);
    }
}

// ================================================================
// 17. PUSH TO TALK INTERACTIVITY
// ================================================================
let pushToTalkMode = false;

function togglePushToTalk() {
    pushToTalkMode = !pushToTalkMode;
    
    const btnDrishti = document.getElementById('btnPushToTalkDrishti');
    const btnDhyan = document.getElementById('btnPushToTalkDhyan');
    const btnShravan = document.getElementById('btnPushToTalkShravan');

    if (pushToTalkMode) {
        if (btnDrishti) {
            btnDrishti.textContent = '🔒 PTT: On';
            btnDrishti.style.background = 'var(--success-light)';
            btnDrishti.style.color = 'var(--success-dark)';
            btnDrishti.style.borderColor = 'var(--success)';
        }
        if (btnDhyan) {
            btnDhyan.textContent = '🔒 PTT: On';
            btnDhyan.style.background = 'var(--success-light)';
            btnDhyan.style.color = 'var(--success-dark)';
            btnDhyan.style.borderColor = 'var(--success)';
        }
        if (btnShravan) {
            btnShravan.innerHTML = '<span>🔒 Push-to-Talk ON</span><span class="shravan-btn-sub">Hold Spacebar or mic button to record</span>';
            btnShravan.className = 'btn btn-success shravan-btn focus-outline';
        }
        showToast('Push-to-Talk Active: Hold spacebar/mic button to speak');
        speakText('Push to talk active. Hold spacebar or mic button to speak.');
    } else {
        if (btnDrishti) {
            btnDrishti.textContent = '🔓 PTT: Off';
            btnDrishti.style.background = '';
            btnDrishti.style.color = '';
            btnDrishti.style.borderColor = '';
        }
        if (btnDhyan) {
            btnDhyan.textContent = '🔓 PTT: Off';
            btnDhyan.style.background = '';
            btnDhyan.style.color = '';
            btnDhyan.style.borderColor = '';
        }
        if (btnShravan) {
            btnShravan.innerHTML = '<span>🔓 Push-to-Talk OFF</span><span class="shravan-btn-sub">Filter background noise; hold spacebar/mic to speak</span>';
            btnShravan.className = 'btn shravan-btn focus-outline';
        }
        showToast('Push-to-Talk Disabled');
        speakText('Push to talk disabled.');
    }
}

function setupPTTListeners() {
    const buttons = ['btnRecordDrishti', 'btnRecordDhyan', 'btnShravanMic'];
    buttons.forEach(id => {
        const btn = document.getElementById(id);
        if (!btn) return;

        btn.addEventListener('mousedown', (e) => {
            if (pushToTalkMode) {
                e.preventDefault();
                startRecording();
            }
        });
        
        btn.addEventListener('mouseup', (e) => {
            if (pushToTalkMode && isRecording) {
                e.preventDefault();
                stopRecording();
            }
        });

        btn.addEventListener('touchstart', (e) => {
            if (pushToTalkMode) {
                e.preventDefault();
                startRecording();
            }
        }, { passive: false });

        btn.addEventListener('touchend', (e) => {
            if (pushToTalkMode && isRecording) {
                e.preventDefault();
                stopRecording();
            }
        }, { passive: false });
    });
}

// ================================================================
// 18. AUTO ANNOUNCE SUMMARY (Mutation Observer)
// ================================================================
const summaryObserver = new MutationObserver(() => {
    const drishtiText = document.getElementById('drishtiSummaryPanel')?.innerText;
    const dhyanText = document.getElementById('dhyanSummaryBullets')?.innerText;
    const targetText = activeMode === 'dhyan' ? dhyanText : drishtiText;

    if (targetText && !targetText.includes('bullet points') && !targetText.includes('Summarizing')) {
        if (targetText.includes('Key Point') || targetText.length > 20) {
            if (activeMode === 'shravan') {
                const clean = targetText.replace(/\s+/g, ' ');
                speakText('Summary highlights: ' + clean);
            }
        }
    }
});

// ================================================================
// 19. INITS & LISTENERS
// ================================================================
function announceText(text) {
    lastAnnouncement = text;
    speakText(text);
}

window.addEventListener('DOMContentLoaded', () => {
    // Announce buttons on Shravan mode focus
    const focusables = document.querySelectorAll('button, input, [role="button"], .mode-card');
    focusables.forEach(el => {
        el.addEventListener('focus', () => {
            if (activeMode === 'shravan') {
                const msg = el.getAttribute('aria-label') || el.innerText || el.placeholder || el.value;
                if (msg) speakText(msg);
            }
        });
    });

    const summaryPanelDrishti = document.getElementById('drishtiSummaryPanel');
    const summaryPanelDhyan = document.getElementById('dhyanSummaryBullets');
    if (summaryPanelDrishti) {
        summaryObserver.observe(summaryPanelDrishti, { childList: true, subtree: true, characterData: true });
    }
    if (summaryPanelDhyan) {
        summaryObserver.observe(summaryPanelDhyan, { childList: true, subtree: true, characterData: true });
    }
});

// ================================================================
// 20. SMART ONBOARDING — Voice Gateway and Onboarding Screen
// ================================================================
let defectTimer = null;
let defectCountdown = 10;
let voiceDefectRecognition = null;
let isVoiceDefectListening = false;

// ================================================================
// SPEAKS FIRST — IMMEDIATE VOICE INSTRUCTIONS
// ================================================================
function speakDefectQuestion(callback = null) {
    // This speaks immediately when the page loads
    const msg = "Welcome to SARAL. Shall we start class? Please say Yes to start, or say Deaf or None.";

    // Use the global speakText function
    if (typeof speakText === 'function') {
        speakText(msg, callback);
    } else {
        // Fallback if speakText isn't defined yet
        const utterance = new SpeechSynthesisUtterance(msg);
        utterance.rate = 0.9;
        utterance.pitch = 1;
        if (callback) {
            utterance.onend = callback;
            utterance.onerror = callback;
        }
        window.speechSynthesis.speak(utterance);
    }
}

function initDefectOnboarding() {
    defectCountdown = 10;
    
    // --- SPEAK FIRST ---
    // Start speaking within 0.5 seconds so blind users hear it instantly
    setTimeout(() => {
        speakDefectQuestion(() => {
            // Start voice recognition ONLY after welcoming prompt finishes!
            startVoiceDefectDetection(true);
        });
    }, 500);

    // Update countdown element initially
    const countdownEl = document.getElementById('defectTimerCountdown');
    if (countdownEl) countdownEl.textContent = defectCountdown;
    
    const statusEl = document.getElementById('defectTimerStatus');
    if (statusEl) {
        statusEl.innerHTML = `⏳ Auto-defaulting to Blind (Audio) Mode in <strong id="defectTimerCountdown">10</strong> seconds if no interaction is detected.`;
    }

    // Set up user interaction listeners to cancel timer
    setTimeout(() => {
        const interactionEvents = ['click', 'mousemove', 'keydown', 'touchstart', 'scroll', 'input'];
        const handleUserInteraction = () => {
            cancelDefectTimer();
            interactionEvents.forEach(evt => {
                document.removeEventListener(evt, handleUserInteraction);
            });
        };
        interactionEvents.forEach(evt => {
            document.addEventListener(evt, handleUserInteraction, { passive: true });
        });
    }, 500);

    // Start timer interval
    if (defectTimer) {
        clearInterval(defectTimer);
    }
    defectTimer = setInterval(() => {
        defectCountdown--;
        const cdEl = document.getElementById('defectTimerCountdown');
        if (cdEl) cdEl.textContent = defectCountdown;
        
        if (defectCountdown <= 0) {
            clearInterval(defectTimer);
            defectTimer = null;
            console.log('⏳ Onboarding timer expired. Auto-defaulting to blind mode.');
            handleDefect('blind');
        }
    }, 1000);
}

function cancelDefectTimer() {
    if (defectTimer) {
        clearInterval(defectTimer);
        defectTimer = null;
        const statusEl = document.getElementById('defectTimerStatus');
        if (statusEl) {
            statusEl.innerHTML = `ℹ️ Auto-detection paused. Choose your mode below.`;
        }
    }
}

function handleDefect(mode, autoStartClass = false) {
    // Stop the timer immediately
    if (defectTimer) {
        clearInterval(defectTimer);
        defectTimer = null;
    }

    // Stop voice defect recognition if active
    if (isVoiceDefectListening && voiceDefectRecognition) {
        try { voiceDefectRecognition.stop(); } catch (_) {}
        isVoiceDefectListening = false;
        
        const btn = document.getElementById('voiceDefectBtn');
        if (btn) {
            btn.textContent = '🎤 Speak Your Need';
            btn.classList.remove('listening');
        }
    }

    if (mode === 'blind') {
        // Force Shravan Mode
        startMode('shravan', autoStartClass);

        if (autoStartClass) {
            showToast('Smart Onboarding: Shravan mode active (Class Started).');
        } else {
            // Describe the entire app layout to the blind user via TTS
            const fullDescription = `
                Welcome to SARAL. 
                You are in Shravan Mode, designed for blind and visually impaired users.
                This application helps you follow classroom lectures.
                You can use the following keyboard shortcuts to control the app:
                Press Alt plus 1 to switch to Drishti Mode for visual learning.
                Press Alt plus 2 for Shravan Mode.
                Press Alt plus 3 for Dhyan Mode for dyslexia support.
                Press Alt plus 4 for Vaani Mode for voice selection.
                Press Alt plus H to return to the Home screen.
                When in Shravan Mode:
                Your microphone session will capture classroom speech and transcribe it.
                Press the Tab key to navigate buttons, and press Enter to select them.
                Press the Space bar to repeat screen reader announcements.
                Keyboard shortcut triggers: Ctrl plus Shift plus D starts a demo lecture, Ctrl plus E or Ctrl plus A sends a repeat request alert, Ctrl plus S generates a summary, and Ctrl plus D downloads the transcript file.
                The transcript text and summaries will be announced to you automatically.
            `;

            speakText(fullDescription);
            showToast('Smart Onboarding: Shravan mode activated.');
        }
    } else if (mode === 'deaf') {
        startMode('drishti');
        showToast('Smart Onboarding: Drishti mode activated.');
    } else if (mode === 'none') {
        // Go to Home screen selector (manual choice)
        switchScreen('screenHome');
        document.getElementById('header').style.display = 'none';
        activeMode = '';
        speakText('Returned to Home screen selector.');
        showToast('Smart Onboarding: Manual selection.');
    }
}

function submitDefectText() {
    const inputEl = document.getElementById('defectTextInput');
    if (!inputEl) return;
    const text = inputEl.value.trim();
    if (!text) return;
    
    // Stop the timer
    cancelDefectTimer();
    
    // Process text
    processTextDefectCommand(text);
}

function processTextDefectCommand(text) {
    const lower = text.toLowerCase().trim();
    let detectedMode = null;
    let autoStartClass = false;

    if (lower.includes('yes') || lower.includes('okay') || lower.includes('sure') || lower.includes('start class') || lower.includes('begin class') || lower.includes('start session') || lower.includes('start lecture')) {
        detectedMode = 'blind';
        autoStartClass = true;
    }
    else if (lower.includes('blind') || 
        lower.includes('visually') || 
        lower.includes('can\'t see') || 
        lower.includes('cannot see') ||
        lower.includes('eyes') ||
        lower.includes('visual')) {
        detectedMode = 'blind';
    }
    else if (lower.includes('deaf') || 
             lower.includes('hearing') || 
             lower.includes('can\'t hear') || 
             lower.includes('cannot hear') ||
             lower.includes('ears') ||
             lower.includes('audio') ||
             lower.includes('subtitles')) {
        detectedMode = 'deaf';
    }
    else if (lower.includes('none') || 
             lower.includes('no help') || 
             lower.includes('no need') || 
             lower.includes('normal') || 
             lower.includes('sighted') || 
             lower.includes('regular')) {
        detectedMode = 'none';
    }

    if (detectedMode) {
        handleDefect(detectedMode, autoStartClass);
    } else {
        showToast('Need not recognized. Try "blind", "deaf", or "none".');
        speakText('Need not recognized. Please type or say blind, deaf, or none.');
    }
}

function startVoiceDefectDetection(isAutoStart = false) {
    if (voiceNavigationRecognition) {
        try { voiceNavigationRecognition.stop(); } catch(e) {}
    }

    if (isVoiceDefectListening) return;
    const statusEl = document.getElementById('voiceDefectStatus');
    const btn = document.getElementById('voiceDefectBtn');

    // Check browser support
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
        if (!isAutoStart) {
            statusEl.textContent = '❌ Speech not supported in this browser. Please use Chrome.';
            statusEl.className = 'voice-status error';
        }
        return;
    }

    // If already listening, stop it
    if (isVoiceDefectListening) {
        try { voiceDefectRecognition.stop(); } catch (_) {}
        isVoiceDefectListening = false;
        btn.innerHTML = '<span>Speak Your Need</span>';
        btn.classList.remove('listening');
        statusEl.textContent = 'Stopped listening. Click to try again.';
        statusEl.className = 'voice-status';
        return;
    }

    // Initialize recognition
    if (!voiceDefectRecognition) {
        voiceDefectRecognition = new SpeechRecognition();
        voiceDefectRecognition.lang = 'en-IN';
        voiceDefectRecognition.continuous = true; // Keep listening continuously
        voiceDefectRecognition.interimResults = true;
        voiceDefectRecognition.maxAlternatives = 1;

        voiceDefectRecognition.onresult = (event) => {
            let transcript = '';
            let isFinal = false;

            for (let i = event.resultIndex; i < event.results.length; i++) {
                if (event.results[i].isFinal) {
                    transcript = event.results[i][0].transcript;
                    isFinal = true;
                } else {
                    // Show live interim text
                    const interim = event.results[i][0].transcript;
                    document.getElementById('voiceDefectStatus').textContent = `Listening... "${interim}"`;
                }
            }

            if (isFinal && transcript) {
                // Process the spoken command
                processVoiceDefectCommand(transcript, statusEl, btn);
            }
        };

        voiceDefectRecognition.onerror = (event) => {
            console.warn('Voice error:', event.error);
            if (event.error === 'not-allowed') {
                if (!isAutoStart) {
                    statusEl.textContent = 'Please allow microphone access.';
                    statusEl.className = 'voice-status error';
                }
                isVoiceDefectListening = false;
                btn.innerHTML = '<span>Speak Your Need</span>';
                btn.classList.remove('listening');
            } else if (event.error === 'no-speech') {
                // Ignore no-speech, it will auto-restart via onend
            } else {
                isVoiceDefectListening = false;
                btn.innerHTML = '<span>Speak Your Need</span>';
                btn.classList.remove('listening');
            }
        };

        voiceDefectRecognition.onend = () => {
            // Auto restart if still supposed to be listening
            if (isVoiceDefectListening && !isSpeakingTTS) {
                try { voiceDefectRecognition.start(); } catch(e) {}
            }
        };
    }

    // Start listening
    try {
        voiceDefectRecognition.start();
        isVoiceDefectListening = true;
        btn.innerHTML = '<span>Stop Listening</span>';
        btn.classList.add('listening');
        statusEl.textContent = 'Speak "Blind", "Deaf", or "None"';
        statusEl.className = 'voice-status';
    } catch (e) {
        if (!isAutoStart) {
            statusEl.textContent = 'Error starting mic. Please refresh and try again.';
            statusEl.className = 'voice-status error';
        }
    }
}

// --- Process the voice command ---
function processVoiceDefectCommand(transcript, statusEl, btn) {
    const lower = transcript.toLowerCase().trim();

    // Map keywords to modes
    let detectedMode = null;
    let autoStartClass = false;

    // Check for start class or yes
    if (lower.includes('yes') || lower.includes('okay') || lower.includes('sure') || lower.includes('start class') || lower.includes('begin class') || lower.includes('start session') || lower.includes('start lecture')) {
        detectedMode = 'blind';
        autoStartClass = true;
    }
    // Check for Blind keywords
    else if (lower.includes('blind') || 
        lower.includes('visually impaired') || 
        lower.includes('can\'t see') || 
        lower.includes('cannot see') ||
        lower.includes('eyes') ||
        lower.includes('visual')) {
        detectedMode = 'blind';
    }
    // Check for Deaf keywords
    else if (lower.includes('deaf') || 
             lower.includes('hard of hearing') || 
             lower.includes('hearing impaired') ||
             lower.includes('can\'t hear') ||
             lower.includes('cannot hear') ||
             lower.includes('ears') ||
             lower.includes('audio') ||
             lower.includes('subtitles')) {
        detectedMode = 'deaf';
    }
    // Check for None (sighted, no help needed)
    else if (lower.includes('none') || 
             lower.includes('no help') || 
             lower.includes('no need') || 
             lower.includes('not needed') ||
             lower.includes('normal') ||
             lower.includes('sighted') ||
             lower.includes('regular')) {
        detectedMode = 'none';
    }
    // If they said something else, ask them to repeat
    else {
        statusEl.textContent = `I heard "${transcript}". Please say "Blind", "Deaf", or "None".`;
        statusEl.className = 'voice-status error';
        speakText(`I heard ${transcript}. Please say Blind, Deaf, or None.`);
        btn.innerHTML = '<span>Speak Your Need</span>';
        btn.classList.remove('listening');
        isVoiceDefectListening = false;
        return;
    }

    // If we detected a mode, process it!
    if (detectedMode) {
        // Stop the timer immediately
        if (defectTimer) {
            clearInterval(defectTimer);
            defectTimer = null;
        }

        // Update status
        statusEl.textContent = `Detected: ${detectedMode.toUpperCase()}! Redirecting...`;
        statusEl.className = 'voice-status success';

        // Speak confirmation for blind users
        if (autoStartClass) {
            speakText(`Okay, activating Shravan mode and starting class.`);
        } else {
            speakText(`Okay, ${detectedMode} mode activated.`);
        }

        // Give a tiny delay so the user hears the confirmation
        setTimeout(() => {
            handleDefect(detectedMode, autoStartClass);
        }, 800);

        // Reset the button state
        btn.innerHTML = '<span>Speak Your Need</span>';
        btn.classList.remove('listening');
        isVoiceDefectListening = false;
    }
}

window.addEventListener('load', () => {
    setupPTTListeners();

    // Keypress listener for entering search
    const defectTextInput = document.getElementById('defectTextInput');
    if (defectTextInput) {
        defectTextInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                submitDefectText();
            }
        });
    }

    function startGame() {
        const backup = loadBackup();
        if (backup) {
            console.log('Recoverable backup session found');
            if (confirm("Restore your last active lecture session?")) {
                startMode(backup.mode);
                backup.transcript.forEach(t => {
                    addTranscriptItem(t.speaker, t.text, t.isAlert);
                });
            } else {
                initDefectOnboarding();
            }
        } else {
            initDefectOnboarding();
        }
    }

    startGame();
});

console.log('🚀 SARAL core logic loaded.');

// ================================================================
// VISION ASSIST CONTROLS
// ================================================================
let fontSizeLevel = 2; // 0=small, 1=medium, 2=large, 3=xlarge, 4=xxlarge
let highContrastOn = false;
let invertOn = false;

const fontSizeClasses = ['font-small', 'font-medium', 'font-large', 'font-xlarge', 'font-xxlarge'];
const fontSizeLabels = ['Small', 'Medium', 'Large', 'XL', 'XXL'];

function changeFontSize(delta) {
    // Add to document.body to apply globally, since the user might not have appLayout wrapper
    const app = document.body;
    
    // Remove current size class
    fontSizeClasses.forEach(c => app.classList.remove(c));
    
    // Update level
    fontSizeLevel = Math.max(0, Math.min(4, fontSizeLevel + delta));
    
    // Add new size class
    app.classList.add(fontSizeClasses[fontSizeLevel]);
    
    // Update labels in all screens
    document.querySelectorAll('.vision-size').forEach(label => {
        label.textContent = fontSizeLabels[fontSizeLevel];
    });
    
    // Announce change
    if (activeMode === 'shravan') {
        speakText('Font size changed to ' + fontSizeLabels[fontSizeLevel]);
    } else {
        showToast('Font size: ' + fontSizeLabels[fontSizeLevel]);
    }
}

function toggleHighContrast() {
    const app = document.body;
    
    highContrastOn = !highContrastOn;
    app.classList.toggle('high-contrast', highContrastOn);
    
    // Update all contrast buttons
    document.querySelectorAll('.vision-btn').forEach(btn => {
        if (btn.id && btn.id.includes('Contrast')) {
            btn.classList.toggle('active', highContrastOn);
        }
    });
    
    if (activeMode === 'shravan') {
        speakText(highContrastOn ? 'High contrast enabled' : 'High contrast disabled');
    } else {
        showToast(highContrastOn ? 'High contrast ON' : 'High contrast OFF');
    }
}

function toggleInvert() {
    const app = document.body;
    
    invertOn = !invertOn;
    app.classList.toggle('invert-mode', invertOn);
    
    // Update all invert buttons
    document.querySelectorAll('.vision-btn').forEach(btn => {
        if (btn.id && btn.id.includes('Invert')) {
            btn.classList.toggle('active', invertOn);
        }
    });
    
    if (activeMode === 'shravan') {
        speakText(invertOn ? 'Color inversion enabled' : 'Color inversion disabled');
    } else {
        showToast(invertOn ? 'Color invert ON' : 'Color invert OFF');
    }
}
