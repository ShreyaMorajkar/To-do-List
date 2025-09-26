// Basic storage keys
const STORAGE_KEY_USERS = 'todo_studio_users_v1';
const STORAGE_KEY_SESSION = 'todo_studio_session_v1';

function loadUsers() { try { return JSON.parse(localStorage.getItem(STORAGE_KEY_USERS) || '[]'); } catch { return []; } }
function saveUsers(u) { localStorage.setItem(STORAGE_KEY_USERS, JSON.stringify(u)); }
function getSession() { try { return JSON.parse(localStorage.getItem(STORAGE_KEY_SESSION) || 'null'); } catch { return null; } }
function setSession(username) { localStorage.setItem(STORAGE_KEY_SESSION, JSON.stringify({ username })); }
function clearSession() { localStorage.removeItem(STORAGE_KEY_SESSION); }

// helpers
function idNow() { return 't_' + Math.random().toString(36).slice(2, 9); }
function findUser(name) { return loadUsers().find(u => u.username === name); }
function sampleTasks() {
    return [
        { id: idNow(), text: 'Read lecture notes', done: false },
        { id: idNow(), text: 'Practice CSS layouts', done: false },
        { id: idNow(), text: 'Group project sync (Fri)', done: true }
    ];
}

// DOM refs
const registerForm = document.getElementById('registerForm');
const loginForm = document.getElementById('loginForm');
const loginCard = document.getElementById('loginCard');
const regUsername = document.getElementById('regUsername');
const regPassword = document.getElementById('regPassword');
const loginUsername = document.getElementById('loginUsername');
const loginPassword = document.getElementById('loginPassword');

const authArea = document.getElementById('authArea');
const mainView = document.getElementById('mainView');
const currentUserBadge = document.getElementById('currentUserBadge');

// TASK refs
const taskForm = document.getElementById('taskForm');
const taskInput = document.getElementById('taskInput');
const tasksList = document.getElementById('tasksList');
const tasksCount = document.getElementById('tasksCount');
const activeCount = document.getElementById('activeCount');
const clearCompletedBtn = document.getElementById('clearCompleted');
const exportBtn = document.getElementById('exportBtn');
const progressRingNow = document.getElementById('progressRingNow');

// Mood refs
const moodButtons = document.querySelectorAll('.mood-pill');
const moodControlsDiv = document.getElementById('moodControls');
const globalMute = document.getElementById('globalMute');
const playToggle = document.getElementById('playToggle');
const playIcon = document.getElementById('playIcon');
const playerState = document.getElementById('playerState');

// app state
let currentUser = null;
let currentFilter = 'all';
let audioCtx = null;
let moodEngine = null;
let enginePlaying = false;

// ---- Registration: show login after register (as requested) ----
registerForm.addEventListener('submit', e => {
    e.preventDefault();
    const u = regUsername.value.trim();
    const p = regPassword.value;
    if (!u || !p) return alert('Please fill both fields.');
    const users = loadUsers();
    if (users.some(x => x.username === u)) return alert('Username exists.');
    // For demo only: plain storage (NOT for production)
    const newUser = { username: u, password: p, tasks: sampleTasks(), mood: { name: 'rain', tracks: { base: 0.25 } } };
    users.push(newUser);
    saveUsers(users);
    // After register show login card only (user must explicitly login)
    loginCard.classList.remove('d-none');
    loginUsername.value = u;
    loginPassword.value = '';
    loginPassword.focus();
    // friendly microinteraction
    regUsername.value = '';
    regPassword.value = '';
    // subtle success toast-like message (simple)
    const note = document.getElementById('registerNote');
    note.textContent = 'Registered! Please sign in on the right to continue.';
    note.style.color = 'green';
});

// ---- Login ----
loginForm.addEventListener('submit', e => {
    e.preventDefault();
    const u = loginUsername.value.trim();
    const p = loginPassword.value;
    if (!u || !p) return alert('Please fill both fields.');
    const user = findUser(u);
    if (!user) return alert('No such user. Register first.');
    if (user.password !== p) return alert('Incorrect password.');
    setSession(u);
    initForUser(u);
});

// Logout
document.getElementById('logoutBtn').addEventListener('click', () => {
    stopAllAudio();
    clearSession();
    currentUser = null;
    mainView.classList.add('d-none');
    authArea.classList.remove('d-none');
    // reset login card visibility so register only shows first again
    loginCard.classList.add('d-none');
    document.getElementById('registerNote').textContent = 'Your data is stored locally (localStorage). Not for production.';
    document.getElementById('registerNote').style.color = '';
});

// If there's an active session already, auto-login
(function tryAutoLogin() {
    const s = getSession();
    if (s && s.username && findUser(s.username)) {
        initForUser(s.username);
    } else {
        // Show register first; login hidden
        authArea.classList.remove('d-none');
    }
})();

// ---- Initialize user environment ----
function initForUser(username) {
    const user = findUser(username);
    if (!user) return alert('User not found.');
    currentUser = user;
    currentUserBadge.textContent = username;
    // switch views
    authArea.classList.add('d-none');
    mainView.classList.remove('d-none');
    // ensure default mood and tasks exist
    user.tasks = user.tasks || sampleTasks();
    user.mood = user.mood || { name: 'rain', tracks: { base: 0.25 } };
    renderTasks();
    applyMood(user.mood.name || 'rain');
    buildMoodControls(user.mood);
}

// ---- Tasks: add, edit, delete, filter ----
taskForm.addEventListener('submit', e => {
    e.preventDefault();
    const text = taskInput.value.trim();
    if (!text) return;
    const t = { id: idNow(), text, done: false };
    currentUser.tasks = currentUser.tasks || [];
    currentUser.tasks.unshift(t);
    persistCurrentUser();
    taskInput.value = '';
    renderTasks(true);
    // small microinteraction
    playTinyPop();
});

function renderTasks(justAdded = false) {
    tasksList.innerHTML = '';
    currentUser.tasks = currentUser.tasks || [];
    const filtered = currentUser.tasks.filter(t => {
        if (currentFilter === 'active') return !t.done;
        if (currentFilter === 'completed') return t.done;
        return true;
    });
    for (const t of filtered) {
        const li = document.createElement('li');
        li.className = 'task-item list-group-item d-flex align-items-center justify-content-between mb-2 rounded';
        if (justAdded && filtered.indexOf(t) === 0) {
            li.style.animation = 'popIn .36s ease';
        }
        const left = document.createElement('div');
        left.className = 'd-flex align-items-center gap-3';

        const cbWrap = document.createElement('div');
        const cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.checked = !!t.done;
        cb.className = 'form-check-input';
        cb.addEventListener('change', () => {
            t.done = cb.checked;
            persistCurrentUser();
            renderTasks();
            subtleRingUpdate();
        });
        cbWrap.appendChild(cb);

        const label = document.createElement('span');
        label.className = 'task-label';
        label.textContent = t.text;
        if (t.done) label.classList.add('task-completed');
        label.addEventListener('dblclick', () => startEditTask(t, label));
        left.appendChild(cbWrap);
        left.appendChild(label);

        const right = document.createElement('div');
        const editBtn = document.createElement('button');
        editBtn.className = 'btn btn-sm btn-outline-secondary me-1';
        editBtn.innerHTML = '<i class="bi bi-pencil"></i>';
        editBtn.addEventListener('click', () => startEditTask(t, label));
        const delBtn = document.createElement('button');
        delBtn.className = 'btn btn-sm btn-outline-danger';
        delBtn.innerHTML = '<i class="bi bi-trash"></i>';
        delBtn.addEventListener('click', () => {
            if (!confirm('Delete this task?')) return;
            currentUser.tasks = currentUser.tasks.filter(x => x.id !== t.id);
            persistCurrentUser();
            renderTasks();
            subtleRingUpdate();
        });

        right.appendChild(editBtn);
        right.appendChild(delBtn);

        li.appendChild(left);
        li.appendChild(right);
        tasksList.appendChild(li);
    }

    tasksCount.textContent = (currentUser.tasks || []).length + ' total';
    activeCount.textContent = (currentUser.tasks || []).filter(tt => !tt.done).length;
    // filter buttons active class
    document.querySelectorAll('#filterAll,#filterActive,#filterCompleted').forEach(b => b.classList.remove('active'));
    if (currentFilter === 'all') document.getElementById('filterAll').classList.add('active');
    if (currentFilter === 'active') document.getElementById('filterActive').classList.add('active');
    if (currentFilter === 'completed') document.getElementById('filterCompleted').classList.add('active');

    // update progress ring
    subtleRingUpdate();
}

function startEditTask(task, labelEl) {
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'form-control form-control-sm';
    input.value = task.text;
    labelEl.replaceWith(input);
    input.focus(); input.select();
    function finish() { task.text = input.value.trim() || task.text; persistCurrentUser(); renderTasks(); }
    input.addEventListener('blur', finish);
    input.addEventListener('keydown', e => {
        if (e.key === 'Enter') input.blur();
        if (e.key === 'Escape') renderTasks();
    });
}

function persistCurrentUser() {
    const users = loadUsers();
    const idx = users.findIndex(u => u.username === currentUser.username);
    if (idx >= 0) {
        users[idx] = currentUser;
        saveUsers(users);
    }
}

// Filters
document.getElementById('filterAll').addEventListener('click', () => { currentFilter = 'all'; renderTasks(); });
document.getElementById('filterActive').addEventListener('click', () => { currentFilter = 'active'; renderTasks(); });
document.getElementById('filterCompleted').addEventListener('click', () => { currentFilter = 'completed'; renderTasks(); });

clearCompletedBtn.addEventListener('click', () => {
    currentUser.tasks = currentUser.tasks.filter(t => !t.done);
    persistCurrentUser();
    renderTasks();
});

exportBtn.addEventListener('click', () => {
    const data = { username: currentUser.username, tasks: currentUser.tasks || [], mood: currentUser.mood || {} };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = (currentUser.username || 'export') + '_tasks.json';
    a.click(); URL.revokeObjectURL(url);
});

// ----- small microinteraction sound for adding a task (soft click) -----
function ensureAudioCtx() {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (!moodEngine) moodEngine = new AmbientEngine(audioCtx);
}
function playTinyPop() {
    try {
        ensureAudioCtx();
        const now = audioCtx.currentTime;
        const o = audioCtx.createOscillator();
        o.type = 'sine';
        o.frequency.value = 560;
        const g = audioCtx.createGain();
        g.gain.setValueAtTime(0.0001, now);
        g.gain.exponentialRampToValueAtTime(0.03, now + 0.01);
        g.gain.exponentialRampToValueAtTime(0.0001, now + 0.28);
        o.connect(g); g.connect(moodEngine ? moodEngine.masterGain : audioCtx.destination);
        o.start();
        o.stop(now + 0.35);
    } catch (e) { }
}

// ----- AmbientEngine: calmer defaults, smooth envelopes -----
function AmbientEngine(ctx) {
    this.ctx = ctx;
    this.masterGain = ctx.createGain();
    this.masterGain.gain.value = 0.25; // low by default
    this.masterGain.connect(ctx.destination);
    this.tracks = {};
    this.muted = false;
}
AmbientEngine.prototype.setMaster = function (v) {
    this.masterGain.gain.setTargetAtTime(v, this.ctx.currentTime, 0.2);
};
AmbientEngine.prototype.mute = function (val) {
    this.muted = val;
    this.masterGain.gain.setTargetAtTime(val ? 0 : 0.25, this.ctx.currentTime, 0.08);
};
AmbientEngine.prototype.stopAll = function () {
    Object.values(this.tracks).forEach(tr => { try { tr.stop(); } catch { } });
    this.tracks = {};
};

// rain: gentle filtered noise with soft slow panning
AmbientEngine.prototype.startRain = function (intensity = 0.25) {
    const ctx = this.ctx;
    const bufferSize = 2 * ctx.sampleRate;
    const noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const out = noiseBuffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) out[i] = (Math.random() * 2 - 1) * 0.45;
    const src = ctx.createBufferSource(); src.buffer = noiseBuffer; src.loop = true;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 6000;
    const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 420;
    const gain = ctx.createGain(); gain.gain.value = 0.06 * intensity;
    const panner = ctx.createStereoPanner();
    src.connect(lp); lp.connect(hp); hp.connect(gain); gain.connect(panner); panner.connect(this.masterGain);
    src.start();

    // gentle slow pan schedule
    let dir = -0.6;
    const doPan = () => {
        panner.pan.setTargetAtTime(dir, ctx.currentTime, 2.2);
        dir = -dir * (0.8 + Math.random() * 0.4);
        this._rainPanTO = setTimeout(doPan, 4000 + Math.random() * 3000);
    };
    doPan();

    this.tracks.rain = {
        stop: () => {
            try { src.stop(); } catch { } clearTimeout(this._rainPanTO);
        }
    };
};

// beach: soft carrier + filtered swell + light noise bursts
AmbientEngine.prototype.startBeach = function (intensity = 0.25) {
    const ctx = this.ctx;
    // slow LFO controlling gain
    const lfo = ctx.createOscillator(); lfo.type = 'sine'; lfo.frequency.value = 0.08;
    const lfoGain = ctx.createGain(); lfoGain.gain.value = 0.07 * intensity;
    lfo.connect(lfoGain);

    // carrier oscillator (low freq thump)
    const carrier = ctx.createOscillator(); carrier.type = 'sine'; carrier.frequency.value = 80;
    const carrierGain = ctx.createGain(); carrierGain.gain.value = 0.02 * intensity;
    lfoGain.connect(carrierGain.gain);

    carrier.connect(carrierGain);
    carrierGain.connect(this.masterGain);

    // soft filtered noise texture
    const bufferSize = 1 * ctx.sampleRate;
    const nb = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = nb.getChannelData(0); for (let i = 0; i < bufferSize; i++) data[i] = (Math.random() * 2 - 1) * 0.6;
    const noise = ctx.createBufferSource(); noise.buffer = nb; noise.loop = true;
    const nf = ctx.createBiquadFilter(); nf.type = 'lowpass'; nf.frequency.value = 1200;
    const ng = ctx.createGain(); ng.gain.value = 0.02 * intensity;
    noise.connect(nf); nf.connect(ng); ng.connect(this.masterGain);

    lfo.start();
    carrier.start();
    noise.start();

    this.tracks.beach = {
        stop: () => { try { lfo.stop(); carrier.stop(); noise.stop(); } catch { } }
    };
};

// forest: soft rustle + sparse chirps with gentle envelopes
AmbientEngine.prototype.startForest = function (intensity = 0.25) {
    const ctx = this.ctx;
    // rustle noise
    const bufferSize = 1 * ctx.sampleRate;
    const nb = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = nb.getChannelData(0); for (let i = 0; i < bufferSize; i++) data[i] = (Math.random() * 2 - 1) * 0.6;
    const noise = ctx.createBufferSource(); noise.buffer = nb; noise.loop = true;
    const nf = ctx.createBiquadFilter(); nf.type = 'bandpass'; nf.frequency.value = 1600;
    const ng = ctx.createGain(); ng.gain.value = 0.018 * intensity;
    noise.connect(nf); nf.connect(ng); ng.connect(this.masterGain);
    noise.start();

    // birds: schedule soft chirps
    let running = true;
    const schedule = () => {
        if (!running) return;
        const now = ctx.currentTime;
        const n = 1 + Math.floor(Math.random() * 3);
        for (let i = 0; i < n; i++) {
            const t = now + Math.random() * 6;
            const f = 900 + Math.random() * 1200;
            const o = ctx.createOscillator(); o.type = 'triangle'; o.frequency.value = f;
            const g = ctx.createGain(); g.gain.value = 0.0006 * intensity;
            o.connect(g); g.connect(this.masterGain);
            o.start(t);
            g.gain.exponentialRampToValueAtTime(0.00005, t + 0.12);
            o.stop(t + 0.14);
        }
        setTimeout(schedule, 3800 + Math.random() * 3200);
    };
    schedule();

    this.tracks.forest = {
        stop: () => { running = false; try { noise.stop(); } catch { } }
    };
};

function stopAllAudio() {
    if (moodEngine) { moodEngine.stopAll(); }
    // keep context open to allow quick resume
    enginePlaying = false; playIcon.className = 'bi bi-play-fill'; playerState.textContent = 'Stopped';
}

// ---- UI for mood controls ----
moodButtons.forEach(b => b.addEventListener('click', () => {
    const mood = b.dataset.mood;
    applyMood(mood);
    currentUser.mood = currentUser.mood || {};
    currentUser.mood.name = mood;
    persistCurrentUser();
    buildMoodControls(currentUser.mood);
}));

globalMute.addEventListener('change', (e) => {
    ensureAudioCtx();
    moodEngine.mute(e.target.checked);
});

function buildMoodControls(moodObj) {
    const mood = moodObj.name || 'rain';
    moodControlsDiv.innerHTML = '';
    const heading = document.createElement('div');
    heading.className = 'mb-2';
    heading.innerHTML = '<strong>' + mood.charAt(0).toUpperCase() + mood.slice(1) + '</strong> — intensity & variants';
    moodControlsDiv.appendChild(heading);

    // master intensity
    const container = document.createElement('div');
    container.className = 'mb-2';
    const label = document.createElement('label'); label.className = 'form-label small'; label.textContent = 'Master intensity';
    const input = document.createElement('input');
    input.type = 'range'; input.min = 0; input.max = 1; input.step = 0.01;
    input.value = (moodObj.tracks && moodObj.tracks.base) ? moodObj.tracks.base : 0.25;
    input.className = 'form-range';
    input.addEventListener('input', () => {
        ensureAudioCtx();
        moodEngine.setMaster(parseFloat(input.value));
        currentUser.mood = currentUser.mood || {}; currentUser.mood.tracks = currentUser.mood.tracks || {};
        currentUser.mood.tracks.base = parseFloat(input.value);
        persistCurrentUser();
    });
    container.appendChild(label); container.appendChild(input); moodControlsDiv.appendChild(container);

    // variants
    const variants = {
        rain: ['Light drizzle', 'Steady rain', 'Coastal storm'],
        beach: ['Gentle waves', 'Relaxed surf', 'Windy shore'],
        forest: ['Soft birds', 'Quiet rustle', 'Distant stream']
    };
    const varContainer = document.createElement('div');
    varContainer.className = 'd-flex gap-2 flex-wrap';
    variants[mood].forEach((v, i) => {
        const btn = document.createElement('button');
        btn.className = 'btn btn-outline-secondary btn-sm';
        btn.textContent = v;
        btn.addEventListener('click', () => {
            applyMood(mood, 0.12 + i * 0.08); // small variations
            currentUser.mood = currentUser.mood || {};
            currentUser.mood.name = mood;
            currentUser.mood.variant = v;
            persistCurrentUser();
            varContainer.querySelectorAll('button').forEach(x => x.classList.remove('active'));
            btn.classList.add('active');
        });
        varContainer.appendChild(btn);
    });
    moodControlsDiv.appendChild(varContainer);
}

// Play/pause ambient engine
playToggle.addEventListener('click', () => {
    ensureAudioCtx();
    if (!enginePlaying) {
        // start using current user's mood
        const moodName = (currentUser && currentUser.mood && currentUser.mood.name) || 'rain';
        applyMood(moodName);
        enginePlaying = true; playIcon.className = 'bi bi-pause-fill'; playerState.textContent = 'Playing';
    } else {
        stopAllAudio();
        enginePlaying = false; playIcon.className = 'bi bi-play-fill'; playerState.textContent = 'Paused';
    }
});

// applyMood: start appropriate tracks
function applyMood(moodName, intensity = null) {
    ensureAudioCtx();
    moodEngine.stopAll();
    const masterVal = (currentUser && currentUser.mood && currentUser.mood.tracks && currentUser.mood.tracks.base) || 0.25;
    moodEngine.setMaster(intensity !== null ? intensity : masterVal);
    document.body.className = ''; // Clear previous mood classes from body
    if (moodName === 'rain') { moodEngine.startRain(intensity !== null ? intensity : masterVal); document.body.classList.add('mood-rain'); }
    else if (moodName === 'beach') { moodEngine.startBeach(intensity !== null ? intensity : masterVal); document.body.classList.add('mood-beach'); }
    else if (moodName === 'forest') { moodEngine.startForest(intensity !== null ? intensity : masterVal); document.body.classList.add('mood-forest'); }
    // mark selected pill visually
    document.querySelectorAll('.mood-pill').forEach(b => b.classList.remove('active'));
    const b = document.querySelector('.mood-pill[data-mood="' + moodName + '"]'); if (b) b.classList.add('active');
    enginePlaying = true; playIcon.className = 'bi bi-pause-fill'; playerState.textContent = 'Playing';
}

// Envelope-safe resume on first user gesture if needed
function ensureAudioCtx() {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (!moodEngine) moodEngine = new AmbientEngine(audioCtx);
    if (audioCtx.state === 'suspended') {
        audioCtx.resume();
    }
}

// small visual update for progress ring
function subtleRingUpdate() {
    const total = (currentUser.tasks || []).length;
    const done = (currentUser.tasks || []).filter(t => t.done).length;
    const pct = total ? Math.round((done / total) * 100) : 0;
    progressRingNow.style.setProperty('--p', pct + '%');
    progressRingNow.textContent = pct + '%';
    // also small sample ring on intro card if present
    const sampleRing = document.getElementById('sampleRing');
    if (sampleRing) sampleRing.style.setProperty('--p', Math.max(20, pct * 0.6) + '%');
}

// stop audio on unload
window.addEventListener('beforeunload', () => { try { stopAllAudio(); } catch { } });