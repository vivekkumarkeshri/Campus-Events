// ============================================
// CAMPUSCONNECT - SMART EVENT PLATFORM
// ============================================

// ---------- CONSTANTS ----------
const STORAGE_KEYS = {
    PROFILE: 'cc_profile',
    REGISTRATIONS: 'cc_registrations'
};

const INTERESTS = [
    'Coding', 'AI/ML', 'Web Dev', 'Robotics',
    'Music', 'Dance', 'Drama', 'Photography',
    'Cricket', 'Football', 'Chess', 'Debating',
    'Startup', 'Design', 'Gaming', 'Writing'
];

// Interest → Category mapping (used by recommendation engine)
const INTEREST_TO_CATEGORY = {
    'Coding': 'Technical', 'AI/ML': 'Technical', 'Web Dev': 'Technical',
    'Robotics': 'Technical', 'Gaming': 'Technical',
    'Music': 'Cultural', 'Dance': 'Cultural', 'Drama': 'Cultural',
    'Photography': 'Cultural', 'Writing': 'Cultural',
    'Cricket': 'Sports', 'Football': 'Sports', 'Chess': 'Sports',
    'Debating': 'Workshop', 'Startup': 'Workshop', 'Design': 'Workshop'
};

// ---------- SAMPLE EVENT DATA ----------
const EVENTS = [
    { id: 'E01', name: 'Hackathon 24H', category: 'Technical', date: '2026-11-15', venue: 'Auditorium', seats: 200, tags: ['Coding', 'Web Dev'] },
    { id: 'E02', name: 'AI & ML Bootcamp', category: 'Workshop', date: '2026-11-20', venue: 'Lab 3', seats: 60, tags: ['AI/ML', 'Coding'] },
    { id: 'E03', name: 'Rock Night', category: 'Cultural', date: '2026-11-18', venue: 'Main Ground', seats: 500, tags: ['Music', 'Dance'] },
    { id: 'E04', name: 'Inter-College Cricket', category: 'Sports', date: '2026-12-01', venue: 'Sports Complex', seats: 100, tags: ['Cricket'] },
    { id: 'E05', name: 'Robotics Workshop', category: 'Workshop', date: '2026-11-25', venue: 'Lab 1', seats: 40, tags: ['Robotics', 'Design'] },
    { id: 'E06', name: 'Stand-up Comedy', category: 'Cultural', date: '2026-11-22', venue: 'Auditorium', seats: 300, tags: ['Drama', 'Writing'] },
    { id: 'E07', name: 'Football Tournament', category: 'Sports', date: '2026-12-05', venue: 'Football Ground', seats: 80, tags: ['Football'] },
    { id: 'E08', name: 'Startup Pitch Day', category: 'Workshop', date: '2026-11-28', venue: 'Seminar Hall', seats: 120, tags: ['Startup', 'Debating'] },
    { id: 'E09', name: 'Photography Walk', category: 'Cultural', date: '2026-11-30', venue: 'Campus Gate', seats: 50, tags: ['Photography'] },
    { id: 'E10', name: 'UI/UX Design Sprint', category: 'Workshop', date: '2026-12-03', venue: 'Design Lab', seats: 45, tags: ['Design', 'Web Dev'] }
];

// ---------- STATE ----------
let profile = JSON.parse(localStorage.getItem(STORAGE_KEYS.PROFILE)) || null;
let registrations = JSON.parse(localStorage.getItem(STORAGE_KEYS.REGISTRATIONS)) || [];
let selectedInterests = new Set();
let activeCategory = 'All';
let searchQuery = '';
let qrInstance = null;

// ---------- DOM REFERENCES ----------
const $ = (id) => document.getElementById(id);

const views = {
    onboarding: $('view-onboarding'),
    discover: $('view-discover'),
    myevents: $('view-myevents'),
    profile: $('view-profile')
};

// ============================================
// NAVIGATION / VIEW SWITCHING
// ============================================

function showView(name) {
    Object.values(views).forEach(v => v.classList.add('hidden'));
    if (!views[name]) return;
    views[name].classList.remove('hidden');

    // Update nav button active state
    document.querySelectorAll('.nav-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.view === name);
    });

    // Refresh data when entering a view
    if (name === 'discover') renderEvents();
    if (name === 'myevents') renderPasses();
    if (name === 'profile') renderProfile();
}

document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        // Guard: don't let user skip onboarding
        if (!profile && btn.dataset.view !== 'profile') {
            alert('Please complete your profile first!');
            showView('onboarding');
            return;
        }
        showView(btn.dataset.view);
    });
});

// ============================================
// ONBOARDING - INTEREST SELECTION
// ============================================

function renderInterestChips() {
    const grid = $('interestGrid');
    grid.innerHTML = '';

    INTERESTS.forEach(interest => {
        const chip = document.createElement('button');
        chip.type = 'button';
        chip.className = 'interest-chip';
        chip.textContent = interest;

        if (selectedInterests.has(interest)) chip.classList.add('selected');

        chip.addEventListener('click', () => {
            if (selectedInterests.has(interest)) {
                selectedInterests.delete(interest);
                chip.classList.remove('selected');
            } else {
                selectedInterests.add(interest);
                chip.classList.add('selected');
            }
        });

        grid.appendChild(chip);
    });
}

$('saveProfileBtn').addEventListener('click', () => {
    const name = $('studentName').value.trim();
    const branch = $('studentBranch').value;

    if (!name) { alert('Please enter your name.'); return; }
    if (selectedInterests.size === 0) { alert('Pick at least one interest.'); return; }

    profile = {
        name,
        branch,
        interests: [...selectedInterests],
        createdAt: new Date().toISOString()
    };

    localStorage.setItem(STORAGE_KEYS.PROFILE, JSON.stringify(profile));
    showView('discover');
});

$('editInterestsBtn').addEventListener('click', () => {
    if (!profile) return;
    $('studentName').value = profile.name;
    $('studentBranch').value = profile.branch;
    selectedInterests = new Set(profile.interests);
    renderInterestChips();
    showView('onboarding');
});

$('resetBtn').addEventListener('click', () => {
    if (!confirm('This will delete your profile and all registrations. Continue?')) return;
    localStorage.removeItem(STORAGE_KEYS.PROFILE);
    localStorage.removeItem(STORAGE_KEYS.REGISTRATIONS);
    location.reload();
});

// ============================================
// RECOMMENDATION ENGINE ⭐ (Key Feature)
// ============================================

/**
 * Scores each event based on how well it matches the student's interests.
 * Rules:
 *   +3 points → each matching interest tag
 *   +2 points → event category matches an interest's mapped category
 * Returns events sorted by score (highest first).
 */
function getRecommendedEvents() {
    if (!profile) return EVENTS;

    const scored = EVENTS.map(event => {
        let score = 0;

        // Rule 1: direct tag match
        event.tags.forEach(tag => {
            if (profile.interests.includes(tag)) score += 3;
        });

        // Rule 2: category affinity
        const preferredCategories = profile.interests.map(i => INTEREST_TO_CATEGORY[i]);
        if (preferredCategories.includes(event.category)) score += 2;

        return { ...event, score };
    });

    return scored.sort((a, b) => b.score - a.score);
}

// ============================================
// RENDER EVENTS (Discover View)
// ============================================

function isRegistered(eventId) {
    return registrations.some(r => r.eventId === eventId);
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function formatDate(dateStr) {
    return new Date(dateStr).toLocaleDateString('en-IN', {
        day: 'numeric', month: 'short', year: 'numeric'
    });
}

function renderEvents() {
    const grid = $('eventGrid');
    grid.innerHTML = '';

    $('greetText').textContent = profile
        ? `Hi ${profile.name.split(' ')[0]} 👋 Recommended For You`
        : 'All Events';

    let list = getRecommendedEvents();

    // Apply category filter
    if (activeCategory !== 'All') {
        list = list.filter(e => e.category === activeCategory);
    }

    // Apply search filter
    if (searchQuery) {
        list = list.filter(e =>
            e.name.toLowerCase().includes(searchQuery.toLowerCase())
        );
    }

    $('noEventsMsg').classList.toggle('hidden', list.length > 0);

    list.forEach(event => {
        const registered = isRegistered(event.id);
        const card = document.createElement('article');
        card.className = 'event-card';

        card.innerHTML = `
      <div class="event-banner banner-${event.category}">${getEmoji(event.category)}</div>
      <div class="event-body">
        ${event.score >= 3 ? `<span class="match-badge">⭐ ${Math.min(event.score * 10, 98)}% Match</span>` : ''}
        <h3>${escapeHtml(event.name)}</h3>
        <p class="event-meta">📅 ${formatDate(event.date)} • 📍 ${event.venue}</p>
        <div class="event-footer">
          <span class="seats">💺 ${event.seats} seats</span>
          <button class="btn-register ${registered ? 'registered' : ''}"
                  data-id="${event.id}" ${registered ? 'disabled' : ''}>
            ${registered ? '✓ Registered' : 'Register'}
          </button>
        </div>
      </div>
    `;

        grid.appendChild(card);
    });

    // Attach register handlers
    grid.querySelectorAll('.btn-register:not(.registered)').forEach(btn => {
        btn.addEventListener('click', () => registerEvent(btn.dataset.id));
    });
}

function getEmoji(cat) {
    return { Technical: '💻', Cultural: '🎭', Sports: '🏆', Workshop: '🛠️' }[cat] || '📌';
}

// ---------- FILTERS & SEARCH ----------
document.querySelectorAll('.chip').forEach(chip => {
    chip.addEventListener('click', () => {
        document.querySelectorAll('.chip').forEach(c => c.classList.remove('active'));
        chip.classList.add('active');
        activeCategory = chip.dataset.cat;
        renderEvents();
    });
});

$('searchInput').addEventListener('input', (e) => {
    searchQuery = e.target.value;
    renderEvents();
});

// ============================================
// REGISTRATION + DIGITAL PASS
// ============================================

function registerEvent(eventId) {
    const event = EVENTS.find(e => e.id === eventId);
    if (!event || isRegistered(eventId)) return;

    const pass = {
        passId: 'CC-' + Date.now().toString(36).toUpperCase(),
        eventId: event.id,
        eventName: event.name,
        date: event.date,
        venue: event.venue,
        studentName: profile.name,
        registeredAt: new Date().toISOString(),
        attended: false
    };

    registrations.push(pass);
    localStorage.setItem(STORAGE_KEYS.REGISTRATIONS, JSON.stringify(registrations));

    renderEvents();
    openPassModal(pass);
}

// ---------- QR MODAL ----------
function openPassModal(pass) {
    $('passEventName').textContent = pass.eventName;
    $('passEventMeta').textContent = `${formatDate(pass.date)} • ${pass.venue}`;
    $('passStudentName').textContent = pass.studentName;
    $('passId').textContent = pass.passId;

    // Clear old QR before generating new one
    const container = $('qrContainer');
    container.innerHTML = '';

    // Generate QR offline using qrcode.js
    qrInstance = new QRCode(container, {
        text: JSON.stringify({
            passId: pass.passId,
            eventId: pass.eventId,
            name: pass.studentName
        }),
        width: 160,
        height: 160,
        colorDark: '#1e293b',
        correctLevel: QRCode.CorrectLevel.M
    });

    $('passModal').classList.remove('hidden');
}

$('closePass').addEventListener('click', () => $('passModal').classList.add('hidden'));

$('passModal').addEventListener('click', (e) => {
    if (e.target === $('passModal')) $('passModal').classList.add('hidden');
});

// ============================================
// MY EVENTS / PASSES
// ============================================

function renderPasses() {
    const list = $('passList');
    list.innerHTML = '';

    $('noPassMsg').style.display = registrations.length === 0 ? 'block' : 'none';

    registrations.forEach(pass => {
        const card = document.createElement('div');
        card.className = 'pass-card';

        card.innerHTML = `
      <div>
        <strong>${escapeHtml(pass.eventName)}</strong>
        <p class="event-meta">📅 ${formatDate(pass.date)} • 📍 ${escapeHtml(pass.venue)}</p>
        <p class="event-meta">Pass ID: ${pass.passId}</p>
      </div>
      <div style="display:flex; gap:0.5rem; align-items:center;">
        ${pass.attended
                ? '<span class="attended-tag">✓ Attended</span>'
                : `<button data-mark="${pass.passId}">Mark Attended</button>`}
        <button data-view-pass="${pass.passId}" style="background:var(--accent)">View Pass</button>
      </div>
    `;

        list.appendChild(card);
    });

    // Mark attended handler
    list.querySelectorAll('[data-mark]').forEach(btn => {
        btn.addEventListener('click', () => {
            const p = registrations.find(r => r.passId === btn.dataset.mark);
            if (p) {
                p.attended = true;
                localStorage.setItem(STORAGE_KEYS.REGISTRATIONS, JSON.stringify(registrations));
                renderPasses();
            }
        });
    });

    // View pass handler
    list.querySelectorAll('[data-view-pass]').forEach(btn => {
        btn.addEventListener('click', () => {
            const p = registrations.find(r => r.passId === btn.dataset.viewPass);
            if (p) openPassModal(p);
        });
    });
}

// ============================================
// PROFILE & STATS
// ============================================

function renderProfile() {
    const box = $('profileDetails');

    if (!profile) {
        box.innerHTML = '<p>No profile yet. Complete onboarding to get started.</p>';
        return;
    }

    const attendedCount = registrations.filter(r => r.attended).length;

    box.innerHTML = `
    <p><strong>Name:</strong> ${escapeHtml(profile.name)}</p>
    <p><strong>Branch:</strong> ${escapeHtml(profile.branch)}</p>
    <p><strong>Interests:</strong> ${profile.interests.map(escapeHtml).join(', ')}</p>
  `;

    $('statRegistered').textContent = registrations.length;
    $('statAttended').textContent = attendedCount;
    $('statPoints').textContent = registrations.length * 10 + attendedCount * 25;
}

// ============================================
// APP INIT
// ============================================

function init() {
    renderInterestChips();

    if (profile) {
        showView('discover');   // Returning user → straight to recommendations
    } else {
        showView('onboarding'); // New user → interests first
    }
}

init();