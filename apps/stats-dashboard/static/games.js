// Games Page JavaScript
let allGames = [];
let gameModal = null;
const EMPTY_STATS_LABEL = 'No Stats';
const EDITABLE_PLAYER_FIELDS = [
    { key: 'name', label: 'Player', type: 'text' },
    { key: 'number', label: '#', type: 'number', min: 0 },
    { key: 'fg_made', label: 'FGM', type: 'number', min: 0 },
    { key: 'fg_att', label: 'FGA', type: 'number', min: 0 },
    { key: 'fg3_made', label: '3PM', type: 'number', min: 0 },
    { key: 'fg3_att', label: '3PA', type: 'number', min: 0 },
    { key: 'ft_made', label: 'FTM', type: 'number', min: 0 },
    { key: 'ft_att', label: 'FTA', type: 'number', min: 0 },
    { key: 'oreb', label: 'OREB', type: 'number', min: 0 },
    { key: 'dreb', label: 'DREB', type: 'number', min: 0 },
    { key: 'asst', label: 'AST', type: 'number', min: 0 },
    { key: 'stl', label: 'STL', type: 'number', min: 0 },
    { key: 'blk', label: 'BLK', type: 'number', min: 0 },
    { key: 'to', label: 'TO', type: 'number', min: 0 },
    { key: 'fouls', label: 'PF', type: 'number', min: 0 },
    { key: 'plus_minus', label: '+/-', type: 'number' }
];

const toNumber = (value, fallback = 0) => (Number.isFinite(Number(value)) ? Number(value) : fallback);
const safeRatio = (numerator, denominator, scale = 1) => {
    const num = Number(numerator);
    const den = Number(denominator);
    if (!Number.isFinite(num) || !Number.isFinite(den) || den === 0) return 0;
    return (num / den) * scale;
};

function getResultState(result) {
    if (result === 'W') {
        return { className: 'win', shortLabel: 'W', longLabel: 'WIN' };
    }
    if (result === 'L') {
        return { className: 'loss', shortLabel: 'L', longLabel: 'LOSS' };
    }
    return { className: 'tie', shortLabel: 'T', longLabel: 'TIE' };
}

function getDiffState(value) {
    if (value > 0) {
        return { className: 'positive', label: `+${value}` };
    }
    if (value < 0) {
        return { className: 'negative', label: String(value) };
    }
    return { className: 'neutral', label: '0' };
}

document.addEventListener('DOMContentLoaded', async () => {
    showLoader('games-container', 'Loading games...');
    await loadGames();
    setupFilters();
    setupModal();
    openRequestedGameFromQuery();
});

function escapeAttribute(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/"/g, '&quot;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

function parseInteger(value, fallback = 0) {
    const parsed = Number.parseInt(String(value ?? '').trim(), 10);
    return Number.isFinite(parsed) ? parsed : fallback;
}

function getGameById(gameId) {
    const normalizedId = Number(gameId);
    return allGames.find((game) => Number(game.gameId) === normalizedId) || null;
}

function openRequestedGameFromQuery() {
    const params = new URLSearchParams(window.location.search);
    const requestedId = params.get('editGameId');
    if (!requestedId) return;

    const game = getGameById(requestedId);
    if (game) {
        showGameEditor(game);
    }

    const url = new URL(window.location.href);
    url.searchParams.delete('editGameId');
    window.history.replaceState({}, '', url);
}

function normalizeEditablePlayer(player = {}) {
    const normalized = {
        name: String(player.name || '').trim(),
        number: player.number ?? ''
    };

    EDITABLE_PLAYER_FIELDS.forEach((field) => {
        if (field.key === 'name' || field.key === 'number') return;
        normalized[field.key] = toNumber(player[field.key]);
    });

    normalized.reb = toNumber(player.oreb) + toNumber(player.dreb);
    normalized.pts = ((toNumber(player.fg_made) - toNumber(player.fg3_made)) * 2)
        + (toNumber(player.fg3_made) * 3)
        + toNumber(player.ft_made);

    return normalized;
}

function buildTeamStatsFromPlayers(playerStats) {
    const totals = {
        fg: 0,
        fga: 0,
        fg3: 0,
        fg3a: 0,
        ft: 0,
        fta: 0,
        oreb: 0,
        dreb: 0,
        reb: 0,
        asst: 0,
        to: 0,
        stl: 0,
        blk: 0,
        fouls: 0
    };

    playerStats.forEach((player) => {
        totals.fg += toNumber(player.fg_made);
        totals.fga += toNumber(player.fg_att);
        totals.fg3 += toNumber(player.fg3_made);
        totals.fg3a += toNumber(player.fg3_att);
        totals.ft += toNumber(player.ft_made);
        totals.fta += toNumber(player.ft_att);
        totals.oreb += toNumber(player.oreb);
        totals.dreb += toNumber(player.dreb);
        totals.asst += toNumber(player.asst);
        totals.to += toNumber(player.to);
        totals.stl += toNumber(player.stl);
        totals.blk += toNumber(player.blk);
        totals.fouls += toNumber(player.fouls);
    });

    totals.reb = totals.oreb + totals.dreb;
    return totals;
}

function buildGameEditRowMarkup(player = {}) {
    const normalized = normalizeEditablePlayer(player);

    return `
        <tr class="game-edit-row">
            ${EDITABLE_PLAYER_FIELDS.map((field) => {
                const value = normalized[field.key] ?? '';
                const inputMode = field.type === 'number' ? 'numeric' : 'text';
                const minAttr = typeof field.min === 'number' ? ` min="${field.min}"` : '';

                return `
                    <td>
                        <input
                            type="${field.type}"
                            inputmode="${inputMode}"
                            data-field="${field.key}"
                            value="${escapeAttribute(value)}"
                            ${minAttr}
                            style="width:${field.key === 'name' ? '180px' : '72px'};padding:0.45rem 0.5rem;border-radius:6px;"
                        >
                    </td>
                `;
            }).join('')}
            <td data-computed="reb" style="font-weight:700;">${normalized.reb}</td>
            <td data-computed="pts" style="font-weight:700;color:var(--primary);">${normalized.pts}</td>
            <td>
                <button type="button" class="game-edit-remove btn-primary game-delete-btn">Remove</button>
            </td>
        </tr>
    `;
}

function appendGameEditRow(tbody, player = {}) {
    if (!tbody) return;
    tbody.insertAdjacentHTML('beforeend', buildGameEditRowMarkup(player));
}

function collectEditablePlayerRow(row, { requireName = true } = {}) {
    const player = {};
    const nameInput = row.querySelector('[data-field="name"]');
    const name = String(nameInput?.value || '').trim();
    if (requireName && !name) {
        throw new Error('Each player row needs a player name.');
    }
    player.name = name;

    const numberInput = row.querySelector('[data-field="number"]');
    const rawNumber = String(numberInput?.value || '').trim();
    player.number = rawNumber ? parseInteger(rawNumber) : null;

    EDITABLE_PLAYER_FIELDS.forEach((field) => {
        if (field.key === 'name' || field.key === 'number') return;
        const input = row.querySelector(`[data-field="${field.key}"]`);
        player[field.key] = parseInteger(input?.value);
    });

    player.reb = player.oreb + player.dreb;
    player.pts = ((player.fg_made - player.fg3_made) * 2) + (player.fg3_made * 3) + player.ft_made;
    return player;
}

function updateGameEditSummary(form) {
    if (!form) return;

    const rows = Array.from(form.querySelectorAll('.game-edit-row'));
    const players = rows.map((row) => collectEditablePlayerRow(row, { requireName: false }));
    rows.forEach((row, index) => {
        const player = players[index];
        const rebCell = row.querySelector('[data-computed="reb"]');
        const ptsCell = row.querySelector('[data-computed="pts"]');
        if (rebCell) rebCell.textContent = String(player.reb);
        if (ptsCell) ptsCell.textContent = String(player.pts);
    });

    const teamStats = buildTeamStatsFromPlayers(players);
    const scoreInput = form.querySelector('[name="vc_score"]');
    const oppScoreInput = form.querySelector('[name="opp_score"]');
    const teamScore = parseInteger(scoreInput?.value);
    const oppScore = parseInteger(oppScoreInput?.value);
    const playerPoints = players.reduce((sum, player) => sum + player.pts, 0);
    const summaryEl = document.getElementById('game-edit-summary');
    if (!summaryEl) return;

    const mismatch = teamScore !== playerPoints;
    summaryEl.innerHTML = `
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:0.75rem;">
            <div><div style="font-size:0.72rem;color:var(--text-light);text-transform:uppercase;">Derived Team FG</div><div style="font-weight:700;">${teamStats.fg}-${teamStats.fga}</div></div>
            <div><div style="font-size:0.72rem;color:var(--text-light);text-transform:uppercase;">Derived Team 3P</div><div style="font-weight:700;">${teamStats.fg3}-${teamStats.fg3a}</div></div>
            <div><div style="font-size:0.72rem;color:var(--text-light);text-transform:uppercase;">Derived Team FT</div><div style="font-weight:700;">${teamStats.ft}-${teamStats.fta}</div></div>
            <div><div style="font-size:0.72rem;color:var(--text-light);text-transform:uppercase;">Rebounds</div><div style="font-weight:700;">${teamStats.reb}</div></div>
            <div><div style="font-size:0.72rem;color:var(--text-light);text-transform:uppercase;">Assists / TO</div><div style="font-weight:700;">${teamStats.asst} / ${teamStats.to}</div></div>
            <div><div style="font-size:0.72rem;color:var(--text-light);text-transform:uppercase;">Player Points</div><div style="font-weight:700;color:${mismatch ? 'var(--danger)' : 'var(--primary)'};">${playerPoints}</div></div>
            <div><div style="font-size:0.72rem;color:var(--text-light);text-transform:uppercase;">Final Score</div><div style="font-weight:700;">${teamScore}-${oppScore}</div></div>
        </div>
        <div style="margin-top:0.75rem;color:${mismatch ? 'var(--danger)' : 'var(--text-light)'};font-size:0.85rem;">
            ${mismatch ? 'Player points do not match the edited team score yet.' : 'Player totals and edited score are aligned.'}
        </div>
    `;
}

function collectGameEditPayload(form) {
    const playerRows = Array.from(form.querySelectorAll('.game-edit-row'));
    const playerStats = playerRows.map((row) => collectEditablePlayerRow(row));
    const teamStats = buildTeamStatsFromPlayers(playerStats);

    return {
        date: String(form.querySelector('[name="date"]')?.value || '').trim(),
        opponent: String(form.querySelector('[name="opponent"]')?.value || '').trim(),
        location: String(form.querySelector('[name="location"]')?.value || 'home').trim(),
        vc_score: parseInteger(form.querySelector('[name="vc_score"]')?.value),
        opp_score: parseInteger(form.querySelector('[name="opp_score"]')?.value),
        team_stats: teamStats,
        player_stats: playerStats
    };
}

async function saveGameEdits(gameId) {
    const form = document.getElementById('game-edit-form');
    if (!form) return;

    const saveBtn = document.getElementById('save-game-edit-btn');
    const originalLabel = saveBtn?.textContent || 'Save Changes';

    try {
        const payload = collectGameEditPayload(form);
        if (saveBtn) {
            saveBtn.disabled = true;
            saveBtn.textContent = 'Saving...';
        }

        const response = await fetch(`/api/game/${encodeURIComponent(String(gameId))}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        const responsePayload = await readResponsePayload(response);
        if (!response.ok) {
            throw new Error(getResponseErrorMessage(responsePayload, 'Failed to save game edits'));
        }

        await loadGames();
        const updatedGame = getGameById(gameId);
        if (updatedGame) {
            await showGameDetail(updatedGame);
        } else if (gameModal) {
            gameModal.classList.remove('show');
        }
    } catch (error) {
        console.error('Error saving game edits:', error);
        window.alert(`Failed to save game edits: ${error.message}`);
    } finally {
        if (saveBtn) {
            saveBtn.disabled = false;
            saveBtn.textContent = originalLabel;
        }
    }
}

function showGameEditor(game) {
    const playerRows = Array.isArray(game.player_stats) ? game.player_stats : [];
    const detailEl = document.getElementById('gameDetail');
    if (!detailEl) return;

    detailEl.innerHTML = `
        <form id="game-edit-form">
            <div class="game-detail-header">
                <div class="game-detail-info">
                    <div class="game-detail-date">Edit Saved Game #${game.gameId}</div>
                    <div class="game-detail-opponent">${escapeHtml(game.opponent)}</div>
                </div>
                <div style="display:flex;gap:0.5rem;align-items:center;flex-wrap:wrap;">
                    <button type="button" id="cancel-game-edit-btn" class="btn-primary" style="background:transparent;color:var(--text);border:1px solid var(--border);">Cancel</button>
                    <button type="submit" id="save-game-edit-btn" class="btn-primary">Save Changes</button>
                </div>
            </div>

            <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:0.75rem;margin-bottom:1rem;">
                <label style="display:flex;flex-direction:column;gap:0.35rem;">
                    <span style="font-size:0.8rem;color:var(--text-light);text-transform:uppercase;">Date</span>
                    <input type="text" name="date" value="${escapeAttribute(game.date)}" required style="padding:0.7rem;border-radius:8px;">
                </label>
                <label style="display:flex;flex-direction:column;gap:0.35rem;">
                    <span style="font-size:0.8rem;color:var(--text-light);text-transform:uppercase;">Opponent</span>
                    <input type="text" name="opponent" value="${escapeAttribute(game.opponent)}" required style="padding:0.7rem;border-radius:8px;">
                </label>
                <label style="display:flex;flex-direction:column;gap:0.35rem;">
                    <span style="font-size:0.8rem;color:var(--text-light);text-transform:uppercase;">Location</span>
                    <select name="location" style="padding:0.7rem;border-radius:8px;">
                        <option value="home" ${game.location === 'home' ? 'selected' : ''}>Home</option>
                        <option value="away" ${game.location === 'away' ? 'selected' : ''}>Away</option>
                        <option value="neutral" ${game.location === 'neutral' ? 'selected' : ''}>Neutral</option>
                    </select>
                </label>
                <label style="display:flex;flex-direction:column;gap:0.35rem;">
                    <span style="font-size:0.8rem;color:var(--text-light);text-transform:uppercase;">Team Score</span>
                    <input type="number" min="0" name="vc_score" value="${escapeAttribute(game.vc_score)}" required style="padding:0.7rem;border-radius:8px;">
                </label>
                <label style="display:flex;flex-direction:column;gap:0.35rem;">
                    <span style="font-size:0.8rem;color:var(--text-light);text-transform:uppercase;">Opponent Score</span>
                    <input type="number" min="0" name="opp_score" value="${escapeAttribute(game.opp_score)}" required style="padding:0.7rem;border-radius:8px;">
                </label>
            </div>

            <div id="game-edit-summary" style="padding:1rem;border:1px solid var(--border);border-radius:10px;background:var(--light-bg);margin-bottom:1rem;"></div>

            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:0.75rem;gap:0.75rem;flex-wrap:wrap;">
                <h3 style="margin:0;color:var(--primary);">Editable Box Score</h3>
                <button type="button" id="add-player-row-btn" class="btn-primary" style="padding:0.55rem 0.9rem;">Add Player Row</button>
            </div>

            <div class="table-wrapper">
                <table class="box-score-table" style="min-width:1700px;">
                    <thead>
                        <tr>
                            ${EDITABLE_PLAYER_FIELDS.map((field) => `<th>${field.label}</th>`).join('')}
                            <th>REB</th>
                            <th>PTS</th>
                            <th>Actions</th>
                        </tr>
                    </thead>
                    <tbody id="game-edit-player-body"></tbody>
                </table>
            </div>
        </form>
    `;

    const tbody = document.getElementById('game-edit-player-body');
    if (playerRows.length === 0) {
        appendGameEditRow(tbody, {});
    } else {
        playerRows.forEach((player) => appendGameEditRow(tbody, player));
    }

    const form = document.getElementById('game-edit-form');
    const cancelBtn = document.getElementById('cancel-game-edit-btn');
    const addRowBtn = document.getElementById('add-player-row-btn');

    if (cancelBtn) {
        cancelBtn.addEventListener('click', () => {
            void showGameDetail(game);
        });
    }

    if (addRowBtn) {
        addRowBtn.addEventListener('click', () => {
            appendGameEditRow(tbody, {});
            updateGameEditSummary(form);
        });
    }

    if (tbody) {
        tbody.addEventListener('click', (event) => {
            const removeBtn = event.target.closest('.game-edit-remove');
            if (!removeBtn) return;
            const row = removeBtn.closest('.game-edit-row');
            if (row) {
                row.remove();
                if (!tbody.children.length) {
                    appendGameEditRow(tbody, {});
                }
                updateGameEditSummary(form);
            }
        });
    }

    if (form) {
        form.addEventListener('input', () => updateGameEditSummary(form));
        form.addEventListener('submit', (event) => {
            event.preventDefault();
            void saveGameEdits(game.gameId);
        });
        updateGameEditSummary(form);
    }

    gameModal.classList.add('show');
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

async function loadGames() {
    try {
        const response = await fetch('/api/games');
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        allGames = await response.json();
        
        if (allGames.length === 0) {
            renderZeroGameState();
            return;
        }
        
        // Sort games by date safely
        allGames.sort((a, b) => {
            try {
                const dateA = new Date(a.date);
                const dateB = new Date(b.date);
                // Check for invalid dates
                if (isNaN(dateA.getTime()) || isNaN(dateB.getTime())) {
                    return 0; // Keep original order if dates are invalid
                }
                return dateA - dateB;
            } catch (error) {
                console.warn('Date parsing error:', error);
                return 0;
            }
        });
        
        displayGames(allGames);
    } catch (error) {
        console.error('Error loading games:', error);
        showError('games-container', 'Failed to load games. Please refresh the page.');
    }
}

function renderZeroGameState() {
    const container = document.getElementById('games-container');
    if (!container) return;
    container.innerHTML = '';
}

// Backward compatibility for cached templates still calling the previous API.
window.renderZeroGameState = renderZeroGameState;

async function deleteGame(gameId) {
    if (!Number.isFinite(Number(gameId))) return;

    const confirmed = window.confirm(`Delete game #${gameId} from stats and synced coach data?`);
    if (!confirmed) return;

    try {
        const response = await fetch(`/api/game/${encodeURIComponent(String(gameId))}/delete`, {
            method: 'POST'
        });
        const payload = await readResponsePayload(response);
        if (!response.ok) {
            throw new Error(getResponseErrorMessage(payload, 'Failed to delete game'));
        }

        if (gameModal) {
            gameModal.classList.remove('show');
        }
        await loadGames();
    } catch (error) {
        console.error('Error deleting game:', error);
        window.alert(`Failed to delete game: ${error.message}`);
    }
}

function displayGames(games) {
    const container = document.getElementById('games-container');
    if (!container) return;
    
    if (games.length === 0) {
        container.innerHTML = '';
        return;
    }
    
    container.innerHTML = '';
    
    games.forEach(game => {
        const pointDiff = toNumber(game.vc_score) - toNumber(game.opp_score);
        const resultState = getResultState(game.result);
        const diffState = getDiffState(pointDiff);
        const gameCard = document.createElement('div');
        gameCard.className = 'game-card';
        gameCard.innerHTML = `
            <div class="game-card-header">
                <div class="game-card-date">${escapeHtml(game.date)}</div>
                <div class="game-card-actions">
                    <span class="result-badge ${resultState.className}">${resultState.shortLabel}</span>
                    <button class="game-edit-btn" type="button" aria-label="Edit game ${game.gameId}">Edit</button>
                    <button class="game-delete-btn" type="button" aria-label="Delete game ${game.gameId}">Del</button>
                </div>
            </div>
            <div class="game-card-opponent">${game.location === 'away' ? '@' : 'vs'} ${escapeHtml(game.opponent)}</div>
            <div class="game-card-score">
                <div class="game-card-score-vc">${game.vc_score}</div>
                <div class="game-card-score-divider">-</div>
                <div class="game-card-score-opp">${game.opp_score}</div>
            </div>
            <div class="game-card-diff ${diffState.className}">
                ${diffState.label}
            </div>
        `;

        const editBtn = gameCard.querySelector('.game-edit-btn');
        if (editBtn) {
            editBtn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                showGameEditor(game);
            });
        }

        const deleteBtn = gameCard.querySelector('.game-delete-btn');
        if (deleteBtn) {
            deleteBtn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                void deleteGame(game.gameId);
            });
        }
        
        gameCard.addEventListener('click', () => showGameDetail(game));
        container.appendChild(gameCard);
    });
}

function setupFilters() {
    const searchInput = document.getElementById('game-search');
    const resultFilter = document.getElementById('game-result-filter');

    searchInput.addEventListener('input', filterGames);
    resultFilter.addEventListener('change', filterGames);
}

function filterGames() {
    const searchValue = document.getElementById('game-search').value.toLowerCase();
    const resultValue = document.getElementById('game-result-filter').value;

    const filtered = allGames.filter(game => {
        const matchesSearch = game.opponent.toLowerCase().includes(searchValue);
        const matchesResult = resultValue === '' || game.result === resultValue;
        return matchesSearch && matchesResult;
    });

    displayGames(filtered);
}

async function showGameDetail(game) {
    const teamStats = game.team_stats || {};
    // Calculate basic percentages
    const pointDiff = toNumber(game.vc_score) - toNumber(game.opp_score);
    const resultState = getResultState(game.result);
    const diffState = getDiffState(pointDiff);
    const vcFgPct = safeRatio(teamStats.fg, teamStats.fga, 100).toFixed(1);
    const vc3pPct = safeRatio(teamStats.fg3, teamStats.fg3a, 100).toFixed(1);
    const vcFtPct = safeRatio(teamStats.ft, teamStats.fta, 100).toFixed(1);
    
    // Calculate advanced stats
    const fg2Made = toNumber(teamStats.fg) - toNumber(teamStats.fg3);
    const fg2Att = toNumber(teamStats.fga) - toNumber(teamStats.fg3a);
    const fg2Pct = safeRatio(fg2Made, fg2Att, 100).toFixed(1);
    
    // Effective FG%
    const efgPct = safeRatio(toNumber(teamStats.fg) + 0.5 * toNumber(teamStats.fg3), teamStats.fga, 100).toFixed(1);
    
    // True Shooting %
    const tsPct = safeRatio(game.vc_score, 2 * (toNumber(teamStats.fga) + 0.44 * toNumber(teamStats.fta)), 100).toFixed(1);
    
    // Points per shot
    const ptsPerShot = safeRatio(game.vc_score, teamStats.fga, 1).toFixed(2);
    
    // Assist/Turnover Ratio
    const astToRatio = safeRatio(teamStats.asst, teamStats.to, 1).toFixed(2);
    
    // Offensive Rebound %
    const orebPct = safeRatio(teamStats.oreb, toNumber(teamStats.oreb) + toNumber(teamStats.dreb), 100).toFixed(1);
    
    // Estimated possessions
    const possessions = toNumber(teamStats.fga) + 0.44 * toNumber(teamStats.fta) - toNumber(teamStats.oreb) + toNumber(teamStats.to);
    const possessionsDisplay = Number.isFinite(possessions) ? possessions.toFixed(1) : '0.0';
    
    // Points per possession
    const ppp = safeRatio(game.vc_score, possessions, 1).toFixed(3);
    
    // Turnover rate
    const toRate = safeRatio(teamStats.to, possessions, 100).toFixed(1);
    
    // Assist rate
    const astRate = safeRatio(teamStats.asst, teamStats.fg, 100).toFixed(1);
    
    const detailHtml = `
        <div class="game-detail-header">
            <div class="game-detail-info">
                <div class="game-detail-date">${escapeHtml(game.date)}</div>
                <div class="game-detail-opponent">${game.location === 'away' ? '@' : 'vs'} ${escapeHtml(game.opponent)}</div>
            </div>
            <div class="game-detail-actions">
                <div class="game-detail-result ${resultState.className}">
                    ${resultState.longLabel}
                </div>
                <button id="edit-game-btn" type="button" class="game-edit-btn">
                    Edit Game
                </button>
                <button id="delete-game-btn" type="button" class="game-delete-btn">
                    Delete Game
                </button>
            </div>
        </div>

        <div class="game-detail-score">
            <div class="score-column">
                <div class="score-team">Team</div>
                <div class="score-value">${game.vc_score}</div>
            </div>
            <div class="score-column">
                <div class="score-team">${game.opponent}</div>
                <div class="score-value">${game.opp_score}</div>
            </div>
        </div>

        <div class="stat-differentials">
            <div class="stat-diff-item">
                <div class="stat-diff-label">Point Diff</div>
                <div class="stat-diff-value ${diffState.className}">
                    ${diffState.label}
                </div>
            </div>
            <div class="stat-diff-item">
                <div class="stat-diff-label">FG%</div>
                <div class="stat-diff-value">${vcFgPct}%</div>
            </div>
            <div class="stat-diff-item">
                <div class="stat-diff-label">3P%</div>
                <div class="stat-diff-value">${vc3pPct}%</div>
            </div>
            <div class="stat-diff-item">
                <div class="stat-diff-label">FT%</div>
                <div class="stat-diff-value">${vcFtPct}%</div>
            </div>
            <div class="stat-diff-item">
                <div class="stat-diff-label">eFG%</div>
                <div class="stat-diff-value">${efgPct}%</div>
            </div>
            <div class="stat-diff-item">
                <div class="stat-diff-label">TS%</div>
                <div class="stat-diff-value">${tsPct}%</div>
            </div>
        </div>

        <h3 style="margin-top: 1.5rem; color: var(--primary); margin-bottom: 1rem;">Advanced Game Metrics</h3>
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 1rem; padding: 1rem; background: var(--light-bg); border-radius: 6px; margin-bottom: 1.5rem;">
            <div>
                <div style="font-size: 0.75rem; color: var(--text-light); text-transform: uppercase; margin-bottom: 0.25rem;">Possessions</div>
                <div style="font-size: 1.5rem; font-weight: 700; color: var(--primary);">${possessionsDisplay}</div>
            </div>
            <div>
                <div style="font-size: 0.75rem; color: var(--text-light); text-transform: uppercase; margin-bottom: 0.25rem;">Pts/Possession</div>
                <div style="font-size: 1.5rem; font-weight: 700; color: var(--primary);">${ppp}</div>
            </div>
            <div>
                <div style="font-size: 0.75rem; color: var(--text-light); text-transform: uppercase; margin-bottom: 0.25rem;">Pts/Shot</div>
                <div style="font-size: 1.5rem; font-weight: 700; color: var(--primary);">${ptsPerShot}</div>
            </div>
            <div>
                <div style="font-size: 0.75rem; color: var(--text-light); text-transform: uppercase; margin-bottom: 0.25rem;">AST/TO Ratio</div>
                <div style="font-size: 1.5rem; font-weight: 700; color: ${astToRatio >= 2 ? 'var(--success)' : astToRatio < 1 ? '#dc3545' : 'var(--primary)'};">${astToRatio}</div>
            </div>
            <div>
                <div style="font-size: 0.75rem; color: var(--text-light); text-transform: uppercase; margin-bottom: 0.25rem;">TO Rate</div>
                <div style="font-size: 1.5rem; font-weight: 700; color: ${toRate < 15 ? 'var(--success)' : toRate > 20 ? '#dc3545' : 'var(--primary)'};">${toRate}%</div>
            </div>
            <div>
                <div style="font-size: 0.75rem; color: var(--text-light); text-transform: uppercase; margin-bottom: 0.25rem;">AST Rate</div>
                <div style="font-size: 1.5rem; font-weight: 700; color: var(--primary);">${astRate}%</div>
            </div>
            <div>
                <div style="font-size: 0.75rem; color: var(--text-light); text-transform: uppercase; margin-bottom: 0.25rem;">OREB%</div>
                <div style="font-size: 1.5rem; font-weight: 700; color: var(--primary);">${orebPct}%</div>
            </div>
            <div>
                <div style="font-size: 0.75rem; color: var(--text-light); text-transform: uppercase; margin-bottom: 0.25rem;">2PT FG%</div>
                <div style="font-size: 1.5rem; font-weight: 700; color: var(--primary);">${fg2Pct}%</div>
            </div>
        </div>

        <h3 style="margin-top: 2rem; color: var(--primary); margin-bottom: 0.75rem; font-size: 0.95rem; text-transform: uppercase; letter-spacing: 0.06em;">Team Box Score</h3>
        <div class="table-wrapper">
        <table class="box-score-table">
            <thead>
                <tr>
                    <th style="min-width:110px">Player</th>
                    <th>FG</th>
                    <th>3P</th>
                    <th>FT</th>
                    <th>REB</th>
                    <th>OREB</th>
                    <th>DREB</th>
                    <th>AST</th>
                    <th>STL</th>
                    <th>BLK</th>
                    <th>TO</th>
                    <th>PF</th>
                    <th>+/-</th>
                    <th style="color:var(--primary)">PTS</th>
                </tr>
            </thead>
            <tbody>
                ${(game.player_stats || []).map(p => {
                    const totalReb = toNumber(p.oreb) + toNumber(p.dreb);
                    const displayName = p.first_name || (p.name ? p.name.split(' ')[0] : 'Unknown');
                    const pm = toNumber(p.plus_minus);
                    return `
                    <tr>
                        <td>${escapeHtml(displayName)} <span style="color:var(--text-light);font-weight:500;font-size:0.75em;">#${p.number}</span></td>
                        <td>${p.fg_made}-${p.fg_att}</td>
                        <td>${p.fg3_made}-${p.fg3_att}</td>
                        <td>${p.ft_made}-${p.ft_att}</td>
                        <td style="font-weight:700">${totalReb}</td>
                        <td>${p.oreb}</td>
                        <td>${p.dreb}</td>
                        <td style="font-weight:600">${p.asst}</td>
                        <td>${p.stl}</td>
                        <td>${p.blk}</td>
                        <td style="color:${p.to >= 4 ? 'var(--danger)' : 'inherit'}">${p.to}</td>
                        <td>${p.fouls}</td>
                        <td style="font-weight:700;color:${pm > 0 ? 'var(--success)' : pm < 0 ? 'var(--danger)' : 'var(--text-light)'}">${pm > 0 ? '+' : ''}${pm}</td>
                        <td style="font-weight:800;color:var(--primary)">${p.pts}</td>
                    </tr>
                `}).join('')}
            </tbody>
        </table>
        </div>
        <div style="margin-top: 1rem; padding: 1rem; background: var(--light-bg); border-radius: 4px;">
            <div style="font-weight: 700; margin-bottom: 0.5rem;">Team Totals</div>
            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(120px, 1fr)); gap: 0.5rem; font-size: 0.9rem;">
                <div><strong>FG:</strong> ${teamStats.fg}-${teamStats.fga} (${vcFgPct}%)</div>
                <div><strong>2PT:</strong> ${fg2Made}-${fg2Att} (${fg2Pct}%)</div>
                <div><strong>3P:</strong> ${teamStats.fg3}-${teamStats.fg3a} (${vc3pPct}%)</div>
                <div><strong>FT:</strong> ${teamStats.ft}-${teamStats.fta} (${vcFtPct}%)</div>
                <div><strong>REB:</strong> ${teamStats.reb} (${teamStats.oreb}+${teamStats.dreb})</div>
                <div><strong>AST:</strong> ${teamStats.asst}</div>
                <div><strong>TO:</strong> ${teamStats.to}</div>
                <div><strong>STL:</strong> ${teamStats.stl}</div>
                <div><strong>BLK:</strong> ${teamStats.blk}</div>
                <div><strong>PF:</strong> ${teamStats.fouls || 0}</div>
            </div>
        </div>

        <div id="game-ai-recap" class="game-ai-recap">
            <div class="game-ai-recap-header">
                <span class="game-ai-recap-title">&#x2728; AI Game Recap</span>
                <span id="game-ai-recap-status" class="game-ai-recap-loading">Generating&hellip;</span>
            </div>
            <div id="game-ai-recap-body" class="game-ai-recap-body"></div>
        </div>
    `;
    
    document.getElementById('gameDetail').innerHTML = detailHtml;
    const editBtn = document.getElementById('edit-game-btn');
    if (editBtn) {
        editBtn.addEventListener('click', () => {
            showGameEditor(game);
        });
    }
    const deleteBtn = document.getElementById('delete-game-btn');
    if (deleteBtn) {
        deleteBtn.addEventListener('click', () => {
            void deleteGame(game.gameId);
        });
    }
    gameModal.classList.add('show');

    // Load AI game recap async
    void (async () => {
        const recapStatus = document.getElementById('game-ai-recap-status');
        const recapBody = document.getElementById('game-ai-recap-body');
        const recapSection = document.getElementById('game-ai-recap');
        try {
            const res = await fetch(`/api/ai/game-analysis/${game.gameId}`);
            if (!res.ok) {
                // AI unavailable (503) or other error — hide section silently
                if (recapSection) recapSection.style.display = 'none';
                return;
            }
            const payload = await res.json();
            if (payload.error) {
                if (recapSection) recapSection.style.display = 'none';
                return;
            }
            if (recapStatus) recapStatus.remove();
            if (recapBody) recapBody.textContent = payload.analysis || '';
        } catch (_) {
            if (recapSection) recapSection.style.display = 'none';
        }
    })();
}

function setupModal() {
    gameModal = document.getElementById('gameModal');
    const closeBtn = document.querySelector('.close');
    
    closeBtn.addEventListener('click', () => {
        gameModal.classList.remove('show');
    });
    
    window.addEventListener('click', (e) => {
        if (e.target === gameModal) {
            gameModal.classList.remove('show');
        }
    });
}

