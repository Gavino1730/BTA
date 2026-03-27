// Players Page JavaScript
let allPlayers = [];
let playerModal = null;
let currentView = 'cards'; // 'cards' or 'rankings'
let syncIntervalId = null;
let lastSyncTime = null;
let teamCoachStyle = '';
const EMPTY_STATS_LABEL = 'No Stats';
const SYNC_INTERVAL_MS = 30000; // Sync every 30 seconds
const SYNC_API_TIMEOUT_MS = 5000; // 5 second timeout for API calls

const isFiniteNumber = (value) => Number.isFinite(Number(value));
const safeNumber = (value, fallback = 0) => (isFiniteNumber(value) ? Number(value) : fallback);
const safeFixed = (value, decimals = 1, fallback = '0.0') => {
    const num = Number(value);
    return Number.isFinite(num) ? num.toFixed(decimals) : fallback;
};

function escapeHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function renderCoachStyle() {
    const coachStyleEl = document.getElementById('players-coach-style');
    if (!coachStyleEl) return;

    const trimmed = (teamCoachStyle || '').trim();
    if (!trimmed) {
        coachStyleEl.classList.add('hidden');
        coachStyleEl.innerHTML = '';
        return;
    }

    coachStyleEl.classList.remove('hidden');
    coachStyleEl.innerHTML = `
        <div class="players-coach-style-label">Coaching Style</div>
        <div class="players-coach-style-text">${escapeHtml(trimmed)}</div>
    `;
}

function getRosterRole(player) {
    return player?.roster_info?.role || '';
}

function getRosterNotes(player) {
    return player?.roster_info?.notes || '';
}

function getNotesSnippet(notes) {
    const trimmed = (notes || '').trim();
    if (!trimmed) return '';
    return trimmed.length > 90 ? `${trimmed.slice(0, 87)}...` : trimmed;
}

async function fetchJson(url) {
    const response = await fetch(url);
    if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
    }
    return response.json();
}

async function readResponsePayload(response) {
    const raw = await response.text();
    if (!raw) return null;

    try {
        return JSON.parse(raw);
    } catch {
        return raw;
    }
}

function getResponseErrorMessage(payload, fallbackMessage) {
    if (payload && typeof payload === 'object' && typeof payload.error === 'string' && payload.error.trim()) {
        return payload.error;
    }
    if (typeof payload === 'string' && payload.trim()) {
        return payload.trim();
    }
    return fallbackMessage;
}

function sanitizeNumbers(obj) {
    if (!obj || typeof obj !== 'object') return;
    Object.keys(obj).forEach((key) => {
        const value = obj[key];
        if (value && typeof value === 'object') {
            sanitizeNumbers(value);
            return;
        }
        if (typeof value === 'number' && !Number.isFinite(value)) {
            obj[key] = 0;
        }
    });
}

document.addEventListener('DOMContentLoaded', async () => {
    showLoader('players-container', 'Loading players...');
    // Load and setup in parallel for faster interaction
    setupFilters();
    setupModal();
    setupViewToggle();
    setupSyncButton();
    
    // Initialize proper view state
    const rankingSelect = document.getElementById('ranking-stat');
    if (rankingSelect) {
        rankingSelect.classList.add('hidden');
    }
    
    // Start automatic sync (which loads players immediately then periodically)
    startAutoSync();
});

async function loadPlayers() {
    try {
        const response = await fetch('/api/players');
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        allPlayers = await response.json();
        teamCoachStyle = allPlayers.find((player) => (player.coach_style || '').trim())?.coach_style || '';
        renderCoachStyle();
        
        if (allPlayers.length === 0) {
            renderZeroPlayerState();
            return;
        }
        
        // Sort by number by default
        allPlayers.sort((a, b) => (a.number || 0) - (b.number || 0));
        displayPlayers(allPlayers);
    } catch (error) {
        console.error('Error loading players:', error);
        teamCoachStyle = '';
        renderCoachStyle();
        showError('players-container', 'Failed to load players. Please refresh the page.');
    }
}

function renderZeroPlayerState() {
    const container = document.getElementById('players-container');
    if (!container) return;
    container.innerHTML = '';
}

async function syncBackendData() {
    // Call the backend reload endpoint to refresh data from files
    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), SYNC_API_TIMEOUT_MS);
        
        const response = await fetch('/api/reload-data', {
            method: 'POST',
            signal: controller.signal
        });
        clearTimeout(timeoutId);
        
        if (!response.ok) {
            console.warn(`Data sync returned status ${response.status}`);
            return false;
        }
        
        const data = await response.json();
        lastSyncTime = new Date();
        console.log('Backend data synced successfully:', data);
        return true;
    } catch (error) {
        if (error.name === 'AbortError') {
            console.warn('Backend data sync timed out');
        } else {
            console.warn('Failed to sync backend data:', error);
        }
        return false;
    }
}

async function refreshPlayers(options = {}) {
    const { showSyncIndicator = false } = options;
    // Sync backend data and reload players display
    try {
        const syncBtn = document.getElementById('sync-btn');
        if (showSyncIndicator && syncBtn) {
            syncBtn.classList.add('syncing');
            syncBtn.innerHTML = '⟳ Syncing...';
        }
        
        // Sync backend first
        await syncBackendData();
        
        // Then reload players display
        await loadPlayers();
        
        // Update sync button
        if (showSyncIndicator && syncBtn) {
            syncBtn.classList.remove('syncing');
            syncBtn.innerHTML = '⟳ Sync';
        }
    } catch (error) {
        console.error('Error refreshing players:', error);
        const syncBtn = document.getElementById('sync-btn');
        if (showSyncIndicator && syncBtn) {
            syncBtn.classList.remove('syncing');
            syncBtn.innerHTML = '⟳ Sync';
        }
    }
}

function startAutoSync() {
    // Start automatic periodic data syncing
    // Clear any existing interval
    if (syncIntervalId) {
        clearInterval(syncIntervalId);
    }
    
    // Sync immediately on first load without animating the manual sync button
    refreshPlayers().catch(console.error);
    
    // Then sync every interval
    syncIntervalId = setInterval(() => {
        refreshPlayers().catch(console.error);
    }, SYNC_INTERVAL_MS);
    
    console.log(`Auto-sync started (interval: ${SYNC_INTERVAL_MS}ms)`);
}

async function deletePlayer(playerName) {
    const normalizedName = (playerName || '').trim();
    if (!normalizedName) return;

    const confirmed = window.confirm(`Delete player ${normalizedName} from stats and synced coach roster?`);
    if (!confirmed) return;

    try {
        const response = await fetch(`/api/player/${encodeURIComponent(normalizedName)}/delete`, {
            method: 'POST'
        });
        const payload = await readResponsePayload(response);
        if (!response.ok) {
            throw new Error(getResponseErrorMessage(payload, 'Failed to delete player'));
        }

        if (playerModal) {
            playerModal.classList.remove('show');
        }
        await refreshPlayers();
    } catch (error) {
        console.error('Error deleting player:', error);
        window.alert(`Failed to delete player: ${error.message}`);
    }
}

function parseOptionalInteger(value) {
    const trimmed = String(value ?? '').trim();
    if (!trimmed) return null;
    const parsed = Number.parseInt(trimmed, 10);
    return Number.isFinite(parsed) ? parsed : null;
}

async function savePlayerProfile(playerName, payload) {
    const response = await fetch(`/api/player/${encodeURIComponent(playerName)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    });

    const responsePayload = await readResponsePayload(response);
    if (!response.ok) {
        throw new Error(getResponseErrorMessage(responsePayload, 'Failed to save player profile'));
    }

    return responsePayload;
}

function displayPlayers(players) {
    const container = document.getElementById('players-container');
    
    if (players.length === 0) {
        showEmptyState('players-container', 'No players match your search', '🔍');
        return;
    }
    
    container.innerHTML = '';
    
    players.forEach(player => {
        const card = document.createElement('div');
        card.className = 'player-card';
        const targetName = escapeHtml(player.name || '');
        const rosterRole = getRosterRole(player);
        const rosterNotes = getRosterNotes(player);
        const notesSnippet = getNotesSnippet(rosterNotes);
        card.innerHTML = `
            <button class="player-delete-btn" type="button" aria-label="Delete ${targetName}" style="position:absolute;top:10px;right:10px;background:transparent;border:1px solid var(--border);color:var(--danger);border-radius:6px;padding:4px 8px;cursor:pointer;font-size:0.75rem;">Delete</button>
            <div class="player-number">#${player.number || '-'}</div>
            <div class="player-name">${escapeHtml(player.first_name || player.name)}</div>
            ${(rosterRole || notesSnippet) ? `
                <div class="player-card-meta">
                    ${rosterRole ? `<span class="player-meta-pill">${escapeHtml(rosterRole)}</span>` : ''}
                    ${notesSnippet ? `<div class="player-meta-note">${escapeHtml(notesSnippet)}</div>` : ''}
                </div>
            ` : ''}
        `;

        const deleteBtn = card.querySelector('.player-delete-btn');
        if (deleteBtn) {
            deleteBtn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                void deletePlayer(player.name);
            });
        }
        
        card.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            showPlayerDetail(player.name);
        });
        container.appendChild(card);
    });
}

function setupFilters() {
    const searchInput = document.getElementById('player-search');
    const sortSelect = document.getElementById('stat-sort');
    const rankingSelect = document.getElementById('ranking-stat');

    searchInput.addEventListener('input', filterPlayers);
    sortSelect.addEventListener('change', sortPlayers);
    rankingSelect.addEventListener('change', displayRankings);
}

function setupViewToggle() {
    const cardsBtn = document.getElementById('cards-view-btn');
    const rankingsBtn = document.getElementById('rankings-view-btn');
    const playersContainer = document.getElementById('players-container');
    const rankingsContainer = document.getElementById('rankings-container');
    const statSort = document.getElementById('stat-sort');
    const rankingSelect = document.getElementById('ranking-stat');
    
    cardsBtn.addEventListener('click', () => {
        currentView = 'cards';
        cardsBtn.classList.add('active');
        rankingsBtn.classList.remove('active');
        playersContainer.classList.remove('hidden');
        rankingsContainer.classList.add('hidden');
        statSort.classList.remove('hidden');
        rankingSelect.classList.add('hidden');
    });
    
    rankingsBtn.addEventListener('click', () => {
        currentView = 'rankings';
        rankingsBtn.classList.add('active');
        cardsBtn.classList.remove('active');
        playersContainer.classList.add('hidden');
        rankingsContainer.classList.remove('hidden');
        statSort.classList.add('hidden');
        rankingSelect.classList.remove('hidden');
        displayRankings();
    });
}

function setupSyncButton() {
    const syncBtn = document.getElementById('sync-btn');
    if (syncBtn) {
        syncBtn.addEventListener('click', () => {
            refreshPlayers({ showSyncIndicator: true }).catch(console.error);
        });
    }
}

function filterPlayers() {
    const searchValue = document.getElementById('player-search').value.toLowerCase();
    const filtered = allPlayers.filter(p => p.name.toLowerCase().includes(searchValue));
    displayPlayers(filtered);
}

function sortPlayers() {
    const sortValue = document.getElementById('stat-sort').value;
    const sorted = [...allPlayers].sort((a, b) => {
        if (sortValue === 'ppg') return b.ppg - a.ppg;
        if (sortValue === 'rpg') return b.rpg - a.rpg;
        if (sortValue === 'apg') return b.apg - a.apg;
        if (sortValue === 'fg_pct') return b.fg_pct - a.fg_pct;
        if (sortValue === 'fg3_pct') return b.fg3_pct - a.fg3_pct;
        if (sortValue === 'ft_pct') return b.ft_pct - a.ft_pct;
        if (sortValue === 'spg') return b.spg - a.spg;
        if (sortValue === 'bpg') return b.bpg - a.bpg;
        if (sortValue === 'tpg') return a.tpg - b.tpg; // Lower is better for turnovers
        if (sortValue === 'fpg') return a.fpg - b.fpg; // Lower is better for fouls
        return 0;
    });
    displayPlayers(sorted);
}

async function showPlayerDetail(playerName) {
    try {
        const encodedPlayerName = encodeURIComponent(playerName);
        const [playerResult, advancedResult] = await Promise.allSettled([
            fetchJson(`/api/player/${encodedPlayerName}`),
            fetchJson(`/api/advanced/player/${encodedPlayerName}`)
        ]);

        if (playerResult.status === 'rejected') {
            throw playerResult.reason;
        }

        const data = playerResult.value;
        
        // Check if the API returned an error
        if (data.error) {
            throw new Error(data.error);
        }

        const advancedData = advancedResult.status === 'fulfilled' ? advancedResult.value : null;
        if (advancedResult.status === 'rejected') {
            console.warn('Advanced stats unavailable:', advancedResult.reason);
        }

        if (advancedData) {
            sanitizeNumbers(advancedData);
        }
        
        // Build roster info section if available
        let rosterHtml = '';
        if (data.roster_info) {
            const roleHtml = data.roster_info.role ? `
                <div>
                    <div style="font-size: 0.75rem; text-transform: uppercase; color: var(--text-light); font-weight: 700; letter-spacing: 0.5px;">Team Role</div>
                    <div style="font-size: 1rem; font-weight: 700; color: var(--primary);">${escapeHtml(data.roster_info.role)}</div>
                </div>
            ` : '';
            const notesHtml = data.roster_info.notes ? `
                <div style="margin-top: 1rem; padding-top: 1rem; border-top: 1px solid var(--border);">
                    <div style="font-size: 0.75rem; text-transform: uppercase; color: var(--text-light); font-weight: 700; letter-spacing: 0.5px; margin-bottom: 0.35rem;">AI Context / Notes</div>
                    <div style="font-size: 0.95rem; line-height: 1.5; color: var(--text); white-space: pre-wrap;">${escapeHtml(data.roster_info.notes)}</div>
                </div>
            ` : '';

            rosterHtml = `
                <div class="roster-info" style="margin-bottom: 1.5rem; padding: 1rem; background: var(--light-bg); border-radius: 6px; border: 1px solid var(--border);">
                    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 1rem;">
                        <div>
                            <div style="font-size: 0.75rem; text-transform: uppercase; color: var(--text-light); font-weight: 700; letter-spacing: 0.5px;">Grade</div>
                            <div style="font-size: 1.2rem; font-weight: 700; color: var(--primary);">${data.roster_info.grade || '—'}</div>
                        </div>
                        <div>
                            <div style="font-size: 0.75rem; text-transform: uppercase; color: var(--text-light); font-weight: 700; letter-spacing: 0.5px;">Number</div>
                            <div style="font-size: 1.2rem; font-weight: 700; color: var(--primary);">${data.roster_info.number ? `#${escapeHtml(String(data.roster_info.number))}` : '—'}</div>
                        </div>
                        <div>
                            <div style="font-size: 0.75rem; text-transform: uppercase; color: var(--text-light); font-weight: 700; letter-spacing: 0.5px;">Position</div>
                            <div style="font-size: 1rem; font-weight: 700; color: var(--primary);">${escapeHtml(data.roster_info.position || '—')}</div>
                        </div>
                        ${roleHtml}
                    </div>
                    ${notesHtml}
                </div>
            `;
        }

        const coachStyleHtml = data.coach_style ? `
            <div class="player-detail-coach-style">
                <div class="player-detail-coach-style-label">Coaching Style</div>
                <div class="player-detail-coach-style-text">${escapeHtml(data.coach_style)}</div>
            </div>
        ` : '';
        
        // Build advanced stats section if available
        let advancedHtml = '';
        if (advancedData) {
            const scoringEff = advancedData.scoring_efficiency;
            const usage = advancedData.usage_role;
            const ballHandling = advancedData.ball_handling;
            const rebounding = advancedData.rebounding;
            const defense = advancedData.defense_activity;
            const discipline = advancedData.discipline;
            const consistency = advancedData.consistency;
            const clutch = advancedData.clutch_performance;
            const impact = advancedData.impact;
            
            advancedHtml = `
                <div style="margin: 1.5rem 0;">
                    <h3 style="margin: 0 0 1rem 0; font-size: 1.1rem; color: var(--primary);">Advanced Analytics</h3>
                    
                    <!-- Scoring Efficiency -->
                    <div style="margin-bottom: 1.5rem; padding: 1rem; background: var(--light-bg); border-radius: 6px; border-left: 3px solid var(--primary);">
                        <h4 style="margin: 0 0 0.75rem 0; font-size: 0.85rem; text-transform: uppercase; color: var(--text-light);">Scoring Efficiency</h4>
                        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(110px, 1fr)); gap: 0.75rem;">
                            <div>
                                <div style="font-size: 0.7rem; color: var(--text-light);">PER</div>
                                <div style="font-weight: 700; font-size: 1.1rem;">${scoringEff.per}</div>
                            </div>
                            <div>
                                <div style="font-size: 0.7rem; color: var(--text-light);">eFG%</div>
                                <div style="font-weight: 700; font-size: 1.1rem;">${scoringEff.efg_pct}%</div>
                            </div>
                            <div>
                                <div style="font-size: 0.7rem; color: var(--text-light);">TS%</div>
                                <div style="font-weight: 700; font-size: 1.1rem;">${scoringEff.ts_pct}%</div>
                            </div>
                            <div>
                                <div style="font-size: 0.7rem; color: var(--text-light);">Pts/Shot</div>
                                <div style="font-weight: 700; font-size: 1.1rem;">${scoringEff.pts_per_shot}</div>
                            </div>
                            <div>
                                <div style="font-size: 0.7rem; color: var(--text-light);">2PT%</div>
                                <div style="font-weight: 700; font-size: 1.1rem;">${scoringEff.fg2_pct}%</div>
                            </div>
                            <div>
                                <div style="font-size: 0.7rem; color: var(--text-light);">3PT%</div>
                                <div style="font-weight: 700; font-size: 1.1rem;">${scoringEff.fg3_pct}%</div>
                            </div>
                        </div>
                    </div>
                    
                    <!-- Usage & Role -->
                    <div style="margin-bottom: 1.5rem; padding: 1rem; background: var(--light-bg); border-radius: 6px; border-left: 3px solid #4169E1;">
                        <h4 style="margin: 0 0 0.75rem 0; font-size: 0.85rem; text-transform: uppercase; color: var(--text-light);">Usage & Role</h4>
                        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(110px, 1fr)); gap: 0.75rem;">
                            <div>
                                <div style="font-size: 0.7rem; color: var(--text-light);">Role</div>
                                <div style="font-weight: 700; font-size: 0.9rem;">${usage.role}</div>
                            </div>
                            <div>
                                <div style="font-size: 0.7rem; color: var(--text-light);">Usage %</div>
                                <div style="font-weight: 700; font-size: 1.1rem;">${usage.usage_proxy}%</div>
                            </div>
                            <div>
                                <div style="font-size: 0.7rem; color: var(--text-light);">Scoring %</div>
                                <div style="font-weight: 700; font-size: 1.1rem;">${usage.scoring_share}%</div>
                            </div>
                            <div>
                                <div style="font-size: 0.7rem; color: var(--text-light);">Shot Vol %</div>
                                <div style="font-weight: 700; font-size: 1.1rem;">${usage.shot_volume_share}%</div>
                            </div>
                            <div>
                                <div style="font-size: 0.7rem; color: var(--text-light);">TO Rate</div>
                                <div style="font-weight: 700; font-size: 1.1rem;">${usage.to_rate}%</div>
                            </div>
                        </div>
                    </div>
                    
                    <!-- Ball Handling & Turnovers -->
                    <div style="margin-bottom: 1.5rem; padding: 1rem; background: var(--light-bg); border-radius: 6px; border-left: 3px solid #32CD32;">
                        <h4 style="margin: 0 0 0.75rem 0; font-size: 0.85rem; text-transform: uppercase; color: var(--text-light);">Ball Handling & Turnovers</h4>
                        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(110px, 1fr)); gap: 0.75rem;">
                            <div>
                                <div style="font-size: 0.7rem; color: var(--text-light);">AST/G</div>
                                <div style="font-weight: 700; font-size: 1.1rem;">${ballHandling.apg}</div>
                            </div>
                            <div>
                                <div style="font-size: 0.7rem; color: var(--text-light);">TO/G</div>
                                <div style="font-weight: 700; font-size: 1.1rem;">${ballHandling.tpg}</div>
                            </div>
                            <div>
                                <div style="font-size: 0.7rem; color: var(--text-light);">AST/TO</div>
                                <div style="font-weight: 700; font-size: 1.1rem;">${ballHandling.ast_to_ratio}</div>
                            </div>
                            <div>
                                <div style="font-size: 0.7rem; color: var(--text-light);">Total AST</div>
                                <div style="font-weight: 700; font-size: 1.1rem;">${ballHandling.total_assists}</div>
                            </div>
                            <div>
                                <div style="font-size: 0.7rem; color: var(--text-light);">Total TO</div>
                                <div style="font-weight: 700; font-size: 1.1rem;">${ballHandling.total_turnovers}</div>
                            </div>
                        </div>
                    </div>
                    
                    <!-- Rebounding -->
                    <div style="margin-bottom: 1.5rem; padding: 1rem; background: var(--light-bg); border-radius: 6px; border-left: 3px solid #FF8C00;">
                        <h4 style="margin: 0 0 0.75rem 0; font-size: 0.85rem; text-transform: uppercase; color: var(--text-light);">Rebounding</h4>
                        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(110px, 1fr)); gap: 0.75rem;">
                            <div>
                                <div style="font-size: 0.7rem; color: var(--text-light);">REB/G</div>
                                <div style="font-weight: 700; font-size: 1.1rem;">${rebounding.rpg}</div>
                            </div>
                            <div>
                                <div style="font-size: 0.7rem; color: var(--text-light);">OREB</div>
                                <div style="font-weight: 700; font-size: 1.1rem;">${rebounding.oreb}</div>
                            </div>
                            <div>
                                <div style="font-size: 0.7rem; color: var(--text-light);">DREB</div>
                                <div style="font-weight: 700; font-size: 1.1rem;">${rebounding.dreb}</div>
                            </div>
                            <div>
                                <div style="font-size: 0.7rem; color: var(--text-light);">REB Share</div>
                                <div style="font-weight: 700; font-size: 1.1rem;">${rebounding.reb_share}%</div>
                            </div>
                        </div>
                    </div>
                    
                    <!-- Defense & Activity -->
                    <div style="margin-bottom: 1.5rem; padding: 1rem; background: var(--light-bg); border-radius: 6px; border-left: 3px solid #DC143C;">
                        <h4 style="margin: 0 0 0.75rem 0; font-size: 0.85rem; text-transform: uppercase; color: var(--text-light);">Defense & Activity</h4>
                        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(110px, 1fr)); gap: 0.75rem;">
                            <div>
                                <div style="font-size: 0.7rem; color: var(--text-light);">STL/G</div>
                                <div style="font-weight: 700; font-size: 1.1rem;">${defense.spg}</div>
                            </div>
                            <div>
                                <div style="font-size: 0.7rem; color: var(--text-light);">BLK/G</div>
                                <div style="font-weight: 700; font-size: 1.1rem;">${defense.bpg}</div>
                            </div>
                            <div>
                                <div style="font-size: 0.7rem; color: var(--text-light);">Def Rating</div>
                                <div style="font-weight: 700; font-size: 1.1rem;">${defense.defensive_rating}</div>
                            </div>
                            <div>
                                <div style="font-size: 0.7rem; color: var(--text-light);">Deflections/G</div>
                                <div style="font-weight: 700; font-size: 1.1rem;">${defense.deflections_per_game}</div>
                            </div>
                            <div>
                                <div style="font-size: 0.7rem; color: var(--text-light);">Fouls/G</div>
                                <div style="font-weight: 700; font-size: 1.1rem;">${discipline.fpg}</div>
                            </div>
                        </div>
                    </div>
                    
                    <!-- Consistency & Impact -->
                    <div style="margin-bottom: 1.5rem; padding: 1rem; background: var(--light-bg); border-radius: 6px; border-left: 3px solid #9932CC;">
                        <h4 style="margin: 0 0 0.75rem 0; font-size: 0.85rem; text-transform: uppercase; color: var(--text-light);">Consistency & Impact</h4>
                        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(110px, 1fr)); gap: 0.75rem;">
                            <div>
                                <div style="font-size: 0.7rem; color: var(--text-light);">Consistency</div>
                                <div style="font-weight: 700; font-size: 1.1rem;">${consistency.consistency_score}</div>
                            </div>
                            <div>
                                <div style="font-size: 0.7rem; color: var(--text-light);">+/- per Game</div>
                                <div style="font-weight: 700; font-size: 1.1rem;">${impact.pm_per_game}</div>
                            </div>
                        </div>
                    </div>
                </div>
            `;
        }
        
        const displayFirstName = data.season_stats.first_name
            || (data.season_stats.full_name || data.season_stats.name || '').split(' ')[0];

        const numberDisplay = data.season_stats.number ? `#${data.season_stats.number}` : '';

        const detailHtml = `
            <div class="player-detail-header">
                <div class="player-detail-info">
                    ${numberDisplay ? `<div class="player-detail-number">${numberDisplay}</div>` : ''}
                    <div class="player-detail-name">${escapeHtml(displayFirstName)}</div>
                </div>
                <div style="display:flex;gap:0.5rem;align-items:center;flex-wrap:wrap;">
                    <button id="edit-player-profile-btn" type="button" class="btn-primary" style="background:transparent;color:var(--primary);border:1px solid rgba(79,140,255,0.45);">
                        Edit Profile
                    </button>
                    <button id="delete-player-btn" type="button" class="btn-primary" style="background-color: var(--danger); color: #fff;">
                        Delete Player
                    </button>
                </div>
            </div>

            ${coachStyleHtml}
            ${rosterHtml}

            <div id="player-profile-editor" class="hidden" style="margin: 1rem 0 1.5rem; padding: 1rem; background: var(--light-bg); border-radius: 6px; border: 1px solid var(--border);">
                <div style="display:flex;justify-content:space-between;align-items:center;gap:0.75rem;flex-wrap:wrap;margin-bottom:0.8rem;">
                    <h3 style="margin:0;font-size:1rem;color:var(--primary);">Edit Player Profile</h3>
                    <div style="font-size:0.82rem;color:var(--text-light);">Update roster metadata used across the site.</div>
                </div>
                <form id="player-profile-form">
                    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:0.75rem;">
                        <label style="display:flex;flex-direction:column;gap:0.35rem;">
                            <span style="font-size:0.75rem;text-transform:uppercase;color:var(--text-light);">Number</span>
                            <input type="number" min="0" name="number" value="${escapeHtml(String(data.roster_info?.number ?? data.season_stats.number ?? ''))}" style="padding:0.6rem;border-radius:7px;">
                        </label>
                        <label style="display:flex;flex-direction:column;gap:0.35rem;">
                            <span style="font-size:0.75rem;text-transform:uppercase;color:var(--text-light);">Grade</span>
                            <input type="text" name="grade" value="${escapeHtml(String(data.roster_info?.grade ?? ''))}" style="padding:0.6rem;border-radius:7px;">
                        </label>
                        <label style="display:flex;flex-direction:column;gap:0.35rem;">
                            <span style="font-size:0.75rem;text-transform:uppercase;color:var(--text-light);">Position</span>
                            <input type="text" name="position" value="${escapeHtml(String(data.roster_info?.position ?? ''))}" style="padding:0.6rem;border-radius:7px;">
                        </label>
                        <label style="display:flex;flex-direction:column;gap:0.35rem;">
                            <span style="font-size:0.75rem;text-transform:uppercase;color:var(--text-light);">Height</span>
                            <input type="text" name="height" value="${escapeHtml(String(data.roster_info?.height ?? ''))}" style="padding:0.6rem;border-radius:7px;">
                        </label>
                        <label style="display:flex;flex-direction:column;gap:0.35rem;grid-column:1/-1;">
                            <span style="font-size:0.75rem;text-transform:uppercase;color:var(--text-light);">Role</span>
                            <input type="text" name="role" value="${escapeHtml(String(data.roster_info?.role ?? ''))}" style="padding:0.6rem;border-radius:7px;">
                        </label>
                        <label style="display:flex;flex-direction:column;gap:0.35rem;grid-column:1/-1;">
                            <span style="font-size:0.75rem;text-transform:uppercase;color:var(--text-light);">Notes</span>
                            <textarea name="notes" rows="3" style="padding:0.6rem;border-radius:7px;resize:vertical;">${escapeHtml(String(data.roster_info?.notes ?? ''))}</textarea>
                        </label>
                    </div>
                    <div style="display:flex;justify-content:flex-end;gap:0.6rem;margin-top:0.9rem;flex-wrap:wrap;">
                        <button type="button" id="cancel-player-profile-btn" class="btn-primary" style="background:transparent;color:var(--text);border:1px solid var(--border);">Cancel</button>
                        <button type="submit" id="save-player-profile-btn" class="btn-primary">Save Profile</button>
                    </div>
                </form>
            </div>
            
            <!-- Season Totals -->
            <div style="margin: 1.5rem 0;">
                <h3 style="margin: 0 0 1rem 0; font-size: 1.1rem; color: var(--primary);">Season Totals (${data.season_stats.games} Games)</h3>
                <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(100px, 1fr)); gap: 0.75rem; padding: 1rem; background: var(--card-bg); border-radius: 6px; border: 1px solid var(--border);">
                    <div style="text-align: center;">
                        <div style="font-size: 0.7rem; color: var(--text-light);">PTS</div>
                        <div style="font-weight: 700; font-size: 1.3rem; color: var(--primary);">${data.season_stats.pts}</div>
                    </div>
                    <div style="text-align: center;">
                        <div style="font-size: 0.7rem; color: var(--text-light);">REB</div>
                        <div style="font-weight: 700; font-size: 1.3rem;">${data.season_stats.reb}</div>
                    </div>
                    <div style="text-align: center;">
                        <div style="font-size: 0.7rem; color: var(--text-light);">AST</div>
                        <div style="font-weight: 700; font-size: 1.3rem;">${data.season_stats.asst}</div>
                    </div>
                    <div style="text-align: center;">
                        <div style="font-size: 0.7rem; color: var(--text-light);">STL</div>
                        <div style="font-weight: 700; font-size: 1.3rem;">${data.season_stats.stl}</div>
                    </div>
                    <div style="text-align: center;">
                        <div style="font-size: 0.7rem; color: var(--text-light);">BLK</div>
                        <div style="font-weight: 700; font-size: 1.3rem;">${data.season_stats.blk}</div>
                    </div>
                    <div style="text-align: center;">
                        <div style="font-size: 0.7rem; color: var(--text-light);">TO</div>
                        <div style="font-weight: 700; font-size: 1.3rem;">${data.season_stats.to}</div>
                    </div>
                    <div style="text-align: center;">
                        <div style="font-size: 0.7rem; color: var(--text-light);">FG</div>
                        <div style="font-weight: 700; font-size: 1.1rem;">${data.season_stats.fg}-${data.season_stats.fga}</div>
                    </div>
                    <div style="text-align: center;">
                        <div style="font-size: 0.7rem; color: var(--text-light);">3PT</div>
                        <div style="font-weight: 700; font-size: 1.1rem;">${data.season_stats.fg3}-${data.season_stats.fg3a}</div>
                    </div>
                    <div style="text-align: center;">
                        <div style="font-size: 0.7rem; color: var(--text-light);">FT</div>
                        <div style="font-weight: 700; font-size: 1.1rem;">${data.season_stats.ft}-${data.season_stats.fta}</div>
                    </div>
                    <div style="text-align: center;">
                        <div style="font-size: 0.7rem; color: var(--text-light);">PF</div>
                        <div style="font-weight: 700; font-size: 1.3rem;">${data.season_stats.fouls}</div>
                    </div>
                    <div style="text-align: center;">
                        <div style="font-size: 0.7rem; color: var(--text-light);">+/-</div>
                        <div style="font-weight: 700; font-size: 1.3rem; color: ${(data.season_stats.plus_minus || 0) > 0 ? 'var(--success)' : (data.season_stats.plus_minus || 0) < 0 ? '#dc3545' : 'inherit'};">${(data.season_stats.plus_minus || 0) > 0 ? '+' : ''}${data.season_stats.plus_minus || 0}</div>
                    </div>
                </div>
            </div>
            
            <!-- Per Game Averages -->
            <div style="margin: 1.5rem 0;">
                <h3 style="margin: 0 0 1rem 0; font-size: 1.1rem; color: var(--primary);">Per Game Averages</h3>
                <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(100px, 1fr)); gap: 0.75rem; padding: 1rem; background: var(--card-bg); border-radius: 6px; border: 1px solid var(--border);">
                    <div style="text-align: center;">
                        <div style="font-size: 0.7rem; color: var(--text-light);">PPG</div>
                        <div style="font-weight: 700; font-size: 1.3rem; color: var(--primary);">${safeFixed(data.season_stats.ppg)}</div>
                    </div>
                    <div style="text-align: center;">
                        <div style="font-size: 0.7rem; color: var(--text-light);">RPG</div>
                        <div style="font-weight: 700; font-size: 1.3rem;">${safeFixed(data.season_stats.rpg)}</div>
                    </div>
                    <div style="text-align: center;">
                        <div style="font-size: 0.7rem; color: var(--text-light);">APG</div>
                        <div style="font-weight: 700; font-size: 1.3rem;">${safeFixed(data.season_stats.apg)}</div>
                    </div>
                    <div style="text-align: center;">
                        <div style="font-size: 0.7rem; color: var(--text-light);">SPG</div>
                        <div style="font-weight: 700; font-size: 1.3rem;">${safeFixed(data.season_stats.spg)}</div>
                    </div>
                    <div style="text-align: center;">
                        <div style="font-size: 0.7rem; color: var(--text-light);">BPG</div>
                        <div style="font-weight: 700; font-size: 1.3rem;">${safeFixed(data.season_stats.bpg)}</div>
                    </div>
                    <div style="text-align: center;">
                        <div style="font-size: 0.7rem; color: var(--text-light);">TPG</div>
                        <div style="font-weight: 700; font-size: 1.3rem; color: #dc3545;">${safeFixed(data.season_stats.tpg)}</div>
                    </div>
                    <div style="text-align: center;">
                        <div style="font-size: 0.7rem; color: var(--text-light);">FPG</div>
                        <div style="font-weight: 700; font-size: 1.3rem; color: #dc3545;">${safeFixed(data.season_stats.fpg)}</div>
                    </div>
                    <div style="text-align: center;">
                        <div style="font-size: 0.7rem; color: var(--text-light);">+/-/G</div>
                        <div style="font-weight: 700; font-size: 1.3rem; color: ${((data.season_stats.plus_minus || 0) / (data.season_stats.games || 1)) > 0 ? 'var(--success)' : ((data.season_stats.plus_minus || 0) / (data.season_stats.games || 1)) < 0 ? '#dc3545' : 'inherit'};">${((data.season_stats.plus_minus || 0) / (data.season_stats.games || 1)) > 0 ? '+' : ''}${safeFixed((data.season_stats.plus_minus || 0) / (data.season_stats.games || 1))}</div>
                    </div>
                </div>
            </div>
            
            <!-- Shooting Splits & Efficiency -->
            <div style="margin: 1.5rem 0;">
                <h3 style="margin: 0 0 1rem 0; font-size: 1.1rem; color: var(--primary);">Shooting Performance</h3>
                <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(120px, 1fr)); gap: 0.75rem; padding: 1rem; background: var(--card-bg); border-radius: 6px; border: 1px solid var(--border);">
                    <div style="text-align: center;">
                        <div style="font-size: 0.7rem; color: var(--text-light);">FG%</div>
                        <div style="font-weight: 700; font-size: 1.3rem;">${safeFixed(data.season_stats.fg_pct)}%</div>
                        <div style="font-size: 0.6rem; color: var(--text-light);">${data.season_stats.fg || 0}/${data.season_stats.fga || 0}</div>
                    </div>
                    <div style="text-align: center;">
                        <div style="font-size: 0.7rem; color: var(--text-light);">3P%</div>
                        <div style="font-weight: 700; font-size: 1.3rem;">${safeFixed(data.season_stats.fg3_pct)}%</div>
                        <div style="font-size: 0.6rem; color: var(--text-light);">${data.season_stats.fg3 || 0}/${data.season_stats.fg3a || 0}</div>
                    </div>
                    <div style="text-align: center;">
                        <div style="font-size: 0.7rem; color: var(--text-light);">FT%</div>
                        <div style="font-weight: 700; font-size: 1.3rem;">${safeFixed(data.season_stats.ft_pct)}%</div>
                        <div style="font-size: 0.6rem; color: var(--text-light);">${data.season_stats.ft || 0}/${data.season_stats.fta || 0}</div>
                    </div>
                    <div style="text-align: center;">
                        <div style="font-size: 0.7rem; color: var(--text-light);">2P%</div>
                        <div style="font-weight: 700; font-size: 1.3rem;">${safeFixed(((data.season_stats.fg || 0) - (data.season_stats.fg3 || 0)) / Math.max(1, (data.season_stats.fga || 0) - (data.season_stats.fg3a || 0)) * 100)}%</div>
                        <div style="font-size: 0.6rem; color: var(--text-light);">${(data.season_stats.fg || 0) - (data.season_stats.fg3 || 0)}/${(data.season_stats.fga || 0) - (data.season_stats.fg3a || 0)}</div>
                    </div>
                    <div style="text-align: center;">
                        <div style="font-size: 0.7rem; color: var(--text-light);">FGM/G</div>
                        <div style="font-weight: 700; font-size: 1.3rem;">${safeFixed((data.season_stats.fg || 0) / (data.season_stats.games || 1))}</div>
                        <div style="font-size: 0.6rem; color: var(--text-light);">per game</div>
                    </div>
                    <div style="text-align: center;">
                        <div style="font-size: 0.7rem; color: var(--text-light);">FGA/G</div>
                        <div style="font-weight: 700; font-size: 1.3rem;">${safeFixed((data.season_stats.fga || 0) / (data.season_stats.games || 1))}</div>
                        <div style="font-size: 0.6rem; color: var(--text-light);">per game</div>
                    </div>
                </div>
            </div>
            
            <!-- Performance Metrics -->
            <div style="margin: 1.5rem 0;">
                <h3 style="margin: 0 0 1rem 0; font-size: 1.1rem; color: var(--primary);">Performance Metrics</h3>
                <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(120px, 1fr)); gap: 0.75rem; padding: 1rem; background: var(--card-bg); border-radius: 6px; border: 1px solid var(--border);">
                    <div style="text-align: center;">
                        <div style="font-size: 0.7rem; color: var(--text-light);">A/T Ratio</div>
                        <div style="font-weight: 700; font-size: 1.3rem; color: ${(data.season_stats.to || 0) > 0 ? ((data.season_stats.asst || 0) / data.season_stats.to >= 2 ? 'var(--success)' : (data.season_stats.asst || 0) / data.season_stats.to >= 1 ? '#ffa500' : '#dc3545') : 'var(--success)'};">${(data.season_stats.to || 0) > 0 ? safeFixed((data.season_stats.asst || 0) / data.season_stats.to) : '∞'}</div>
                        <div style="font-size: 0.6rem; color: var(--text-light);">assists/turnovers</div>
                    </div>
                    <div style="text-align: center;">
                        <div style="font-size: 0.7rem; color: var(--text-light);">Games</div>
                        <div style="font-weight: 700; font-size: 1.3rem;">${data.season_stats.games || 0}</div>
                        <div style="font-size: 0.6rem; color: var(--text-light);">played</div>
                    </div>
                    <div style="text-align: center;">
                        <div style="font-size: 0.7rem; color: var(--text-light);">Double-Doubles</div>
                        <div style="font-weight: 700; font-size: 1.3rem;">${(data.game_logs || []).filter(g => {
                            const stats = g.stats || {};
                            const categories = [stats.pts || 0, (stats.oreb || 0) + (stats.dreb || 0), stats.asst || 0, stats.stl || 0, stats.blk || 0].filter(x => x >= 10);
                            return categories.length >= 2;
                        }).length}</div>
                        <div style="font-size: 0.6rem; color: var(--text-light);">career</div>
                    </div>
                    <div style="text-align: center;">
                        <div style="font-size: 0.7rem; color: var(--text-light);">High Score</div>
                        <div style="font-weight: 700; font-size: 1.3rem; color: var(--primary);">${(data.game_logs || []).length > 0 ? Math.max(...data.game_logs.map(g => (g.stats || {}).pts || 0)) : 0}</div>
                        <div style="font-size: 0.6rem; color: var(--text-light);">points</div>
                    </div>
                    <div style="text-align: center;">
                        <div style="font-size: 0.7rem; color: var(--text-light);">Best REB</div>
                        <div style="font-weight: 700; font-size: 1.3rem;">${(data.game_logs || []).length > 0 ? Math.max(...data.game_logs.map(g => ((g.stats || {}).oreb || 0) + ((g.stats || {}).dreb || 0))) : 0}</div>
                        <div style="font-size: 0.6rem; color: var(--text-light);">rebounds</div>
                    </div>
                    <div style="text-align: center;">
                        <div style="font-size: 0.7rem; color: var(--text-light);">Best AST</div>
                        <div style="font-weight: 700; font-size: 1.3rem;">${(data.game_logs || []).length > 0 ? Math.max(...data.game_logs.map(g => (g.stats || {}).asst || 0)) : 0}</div>
                        <div style="font-size: 0.6rem; color: var(--text-light);">assists</div>
                    </div>
                </div>
            </div>

            ${advancedHtml}

            <h3 style="margin-top: 2rem; color: var(--primary); margin-bottom: 0.75rem; font-size: 0.95rem; text-transform: uppercase; letter-spacing: 0.06em;">Game-by-Game Performance</h3>
            <div style="overflow-x: auto; margin-bottom: 1.5rem; border-radius: 8px; border: 1px solid var(--border); overflow: hidden;">
            <table class="box-score-table" style="min-width: 1200px;">
                <thead>
                    <tr>
                        <th style="min-width:90px">Date</th>
                        <th style="min-width:90px">Opponent</th>
                        <th>W/L</th>
                        <th>Edit</th>
                        <th style="color:var(--primary)">PTS</th>
                        <th>FG</th>
                        <th>FG%</th>
                        <th>3P</th>
                        <th>3P%</th>
                        <th>FT</th>
                        <th>FT%</th>
                        <th>REB</th>
                        <th>OREB</th>
                        <th>DREB</th>
                        <th>AST</th>
                        <th>STL</th>
                        <th>BLK</th>
                        <th>TO</th>
                        <th>PF</th>
                        <th>+/-</th>
                    </tr>
                </thead>
                <tbody>
                    ${data.game_logs.sort((a, b) => {
                        const dateA = new Date(a.date);
                        const dateB = new Date(b.date);
                        return dateA - dateB;
                    }).map(game => {
                        const stats = game.stats;
                        const reb = stats.oreb + stats.dreb;
                        const fgPct = stats.fg_att > 0 ? (stats.fg_made / stats.fg_att * 100).toFixed(1) : '0.0';
                        const fg3Pct = stats.fg3_att > 0 ? (stats.fg3_made / stats.fg3_att * 100).toFixed(1) : '0.0';
                        const ftPct = stats.ft_att > 0 ? (stats.ft_made / stats.ft_att * 100).toFixed(1) : '0.0';
                        const pm = stats.plus_minus;
                        const resultColor = game.result === 'W' ? 'var(--success)' : game.result === 'L' ? 'var(--danger)' : 'var(--text-light)';
                        
                        return `
                            <tr>
                                <td style="color:var(--text-light);font-size:0.8rem">${game.date}</td>
                                <td>${game.location === 'away' ? '<span style="color:var(--text-light);font-size:0.8em">@</span> ' : '<span style="color:var(--text-light);font-size:0.8em">vs</span> '}${escapeHtml(game.opponent)}</td>
                                <td style="font-weight:800;color:${resultColor}">${game.result}</td>
                                <td><a href="/games?editGameId=${encodeURIComponent(String(game.gameId))}" class="table-edit-link">Edit</a></td>
                                <td style="font-weight:800;color:var(--primary)">${stats.pts}</td>
                                <td>${stats.fg_made}-${stats.fg_att}</td>
                                <td>${fgPct}%</td>
                                <td>${stats.fg3_made}-${stats.fg3_att}</td>
                                <td>${fg3Pct}%</td>
                                <td>${stats.ft_made}-${stats.ft_att}</td>
                                <td>${ftPct}%</td>
                                <td style="font-weight:700">${reb}</td>
                                <td>${stats.oreb}</td>
                                <td>${stats.dreb}</td>
                                <td style="font-weight:600">${stats.asst}</td>
                                <td>${stats.stl}</td>
                                <td>${stats.blk}</td>
                                <td style="color:${stats.to >= 4 ? 'var(--danger)' : 'inherit'}">${stats.to}</td>
                                <td>${stats.fouls}</td>
                                <td style="font-weight:700;color:${pm > 0 ? 'var(--success)' : pm < 0 ? 'var(--danger)' : 'var(--text-light)'}">${pm > 0 ? '+' : ''}${pm}</td>
                            </tr>
                        `;
                    }).join('')}
                </tbody>
            </table>
            </div>
        `;
        
        document.getElementById('playerDetail').innerHTML = detailHtml;
        const editProfileBtn = document.getElementById('edit-player-profile-btn');
        const profileEditor = document.getElementById('player-profile-editor');
        const cancelProfileBtn = document.getElementById('cancel-player-profile-btn');
        const profileForm = document.getElementById('player-profile-form');
        const saveProfileBtn = document.getElementById('save-player-profile-btn');

        if (editProfileBtn && profileEditor) {
            editProfileBtn.addEventListener('click', () => {
                profileEditor.classList.toggle('hidden');
            });
        }

        if (cancelProfileBtn && profileEditor) {
            cancelProfileBtn.addEventListener('click', () => {
                profileEditor.classList.add('hidden');
            });
        }

        if (profileForm) {
            profileForm.addEventListener('submit', async (event) => {
                event.preventDefault();

                const formData = new FormData(profileForm);
                const profilePayload = {
                    number: parseOptionalInteger(formData.get('number')),
                    grade: String(formData.get('grade') || '').trim(),
                    position: String(formData.get('position') || '').trim(),
                    height: String(formData.get('height') || '').trim(),
                    role: String(formData.get('role') || '').trim(),
                    notes: String(formData.get('notes') || '').trim()
                };

                const originalLabel = saveProfileBtn?.textContent || 'Save Profile';
                try {
                    if (saveProfileBtn) {
                        saveProfileBtn.disabled = true;
                        saveProfileBtn.textContent = 'Saving...';
                    }

                    await savePlayerProfile(playerName, profilePayload);
                    await refreshPlayers();
                    await showPlayerDetail(playerName);
                } catch (saveError) {
                    console.error('Error saving player profile:', saveError);
                    window.alert(`Failed to save player profile: ${saveError.message}`);
                } finally {
                    if (saveProfileBtn) {
                        saveProfileBtn.disabled = false;
                        saveProfileBtn.textContent = originalLabel;
                    }
                }
            });
        }

        const deleteBtn = document.getElementById('delete-player-btn');
        if (deleteBtn) {
            deleteBtn.addEventListener('click', () => {
                void deletePlayer(playerName);
            });
        }
        playerModal.classList.add('show');
    } catch (error) {
        console.error('Error loading player detail:', error);
        const detailEl = document.getElementById('playerDetail');
        if (detailEl) {
            detailEl.innerHTML = `<div class="error-message">⚠️ Error loading player details: ${escapeHtml(error.message)}</div>`;
            playerModal.classList.add('show');
        }
    }
}

function displayRankings() {
    const container = document.getElementById('rankings-container');
    const statSelect = document.getElementById('ranking-stat');
    const searchValue = document.getElementById('player-search').value.toLowerCase();
    const stat = statSelect.value;
    
    // Filter players based on search
    let filteredPlayers = searchValue 
        ? allPlayers.filter(p => p.name.toLowerCase().includes(searchValue))
        : allPlayers;
    
    // Players already have all stats calculated from the API
    const playersWithStats = filteredPlayers;
    
    // Sort by selected stat
    const sortedPlayers = [...playersWithStats].sort((a, b) => {
        const valA = a[stat] || 0;
        const valB = b[stat] || 0;
        // For turnovers, lower is better
        return stat === 'tpg' || stat === 'to' ? valA - valB : valB - valA;
    });
    
    // Get stat display info
    const statInfo = getStatDisplayInfo(stat);
    
    container.innerHTML = `
        <div class="rankings-header">
            <h2>Player Rankings: ${statInfo.label}</h2>
            <p class="rankings-subtitle">${filteredPlayers.length} players ranked</p>
        </div>
        <div class="rankings-list">
            ${sortedPlayers.map((player, index) => {
                const rank = index + 1;
                const value = formatStatValue(player[stat], stat);
                const rankClass = rank <= 3 ? 'top-rank' : '';
                const medal = rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : '';
                
                return `
                    <div class="ranking-item ${rankClass}" onclick="showPlayerDetail('${player.name}')">
                        <div class="ranking-position">
                            <span class="rank-number">${rank}</span>
                            ${medal ? `<span class="rank-medal">${medal}</span>` : ''}
                        </div>
                        <div class="ranking-player-info">
                            <div class="ranking-player-number">#${player.number || '-'}</div>
                            <div class="ranking-player-name">${player.full_name || player.name}</div>
                            ${player.grade ? `<div class="ranking-player-grade">${player.grade}</div>` : ''}
                        </div>
                        <div class="ranking-stat-value">
                            <div class="ranking-stat-number">${value}</div>
                            <div class="ranking-stat-label">${statInfo.shortLabel}</div>
                        </div>
                        <div class="ranking-context">
                            <div class="context-stat">PPG: ${safeFixed(player.ppg, 1)}</div>
                            <div class="context-stat">RPG: ${safeFixed(player.rpg, 1)}</div>
                            <div class="context-stat">APG: ${safeFixed(player.apg, 1)}</div>
                            <div class="context-stat">GP: ${player.games || 0}</div>
                        </div>
                    </div>
                `;
            }).join('')}
        </div>
    `;
}

function getStatDisplayInfo(stat) {
    const statMap = {
        ppg: { label: 'Points Per Game', shortLabel: 'PPG' },
        pts: { label: 'Total Points', shortLabel: 'PTS' },
        rpg: { label: 'Rebounds Per Game', shortLabel: 'RPG' },
        reb: { label: 'Total Rebounds', shortLabel: 'REB' },
        oreb: { label: 'Offensive Rebounds', shortLabel: 'OREB' },
        dreb: { label: 'Defensive Rebounds', shortLabel: 'DREB' },
        apg: { label: 'Assists Per Game', shortLabel: 'APG' },
        asst: { label: 'Total Assists', shortLabel: 'AST' },
        spg: { label: 'Steals Per Game', shortLabel: 'SPG' },
        stl: { label: 'Total Steals', shortLabel: 'STL' },
        bpg: { label: 'Blocks Per Game', shortLabel: 'BPG' },
        blk: { label: 'Total Blocks', shortLabel: 'BLK' },
        fg_pct: { label: 'Field Goal Percentage', shortLabel: 'FG%' },
        fg3_pct: { label: '3-Point Percentage', shortLabel: '3P%' },
        ft_pct: { label: 'Free Throw Percentage', shortLabel: 'FT%' },
        efg_pct: { label: 'Effective Field Goal %', shortLabel: 'eFG%' },
        ts_pct: { label: 'True Shooting %', shortLabel: 'TS%' },
        fg: { label: 'Field Goals Made', shortLabel: 'FGM' },
        fg3: { label: '3-Pointers Made', shortLabel: '3PM' },
        games: { label: 'Games Played', shortLabel: 'GP' },
        tpg: { label: 'Turnovers Per Game', shortLabel: 'TPG' },
        to: { label: 'Total Turnovers', shortLabel: 'TO' },
        fpg: { label: 'Fouls Per Game', shortLabel: 'FPG' },
        ast_to_ratio: { label: 'Assist/Turnover Ratio', shortLabel: 'AST/TO' },
        per: { label: 'Player Efficiency Rating', shortLabel: 'PER' },
        usage_rate: { label: 'Usage Rate', shortLabel: 'USG%' },
        defensive_rating: { label: 'Defensive Rating', shortLabel: 'DEF RTG' },
        pm_per_game: { label: 'Plus/Minus Per Game', shortLabel: '+/-' }
    };
    return statMap[stat] || { label: stat.toUpperCase(), shortLabel: stat.toUpperCase() };
}

function formatStatValue(value, stat) {
    const num = Number(value);
    if (!Number.isFinite(num)) return '-';
    
    // Percentages
    if (stat.includes('_pct') || stat.includes('%')) {
        return num.toFixed(1) + '%';
    }
    
    // Per-game stats (show one decimal)
    if (stat.endsWith('pg')) {
        return num.toFixed(1);
    }
    
    // Decimal stats (ratios and efficiency ratings)
    if (stat === 'ast_to_ratio' || stat === 'per' || stat === 'defensive_rating') {
        return num.toFixed(1);
    }
    
    // Usage rate (show as percentage)
    if (stat === 'usage_rate') {
        return num.toFixed(1) + '%';
    }
    
    // Whole numbers
    return Math.round(num).toString();
}

function setupModal() {
    playerModal = document.getElementById('playerModal');
    const closeBtn = document.querySelector('.close');
    
    if (closeBtn) {
        closeBtn.addEventListener('click', () => {
            playerModal.classList.remove('show');
        });
    }
    
    window.addEventListener('click', (e) => {
        if (e.target === playerModal) {
            playerModal.classList.remove('show');
        }
    });
}
