// Dashboard JavaScript
let scoringChart = null;
let shootingChart = null;

const safeFixed = (value, decimals = 1, fallback = '0.0') => {
    const num = Number(value);
    return Number.isFinite(num) ? num.toFixed(decimals) : fallback;
};
const toNumber = (value, fallback = 0) => (Number.isFinite(Number(value)) ? Number(value) : fallback);
const safeRatio = (numerator, denominator, scale = 1) => {
    const num = Number(numerator);
    const den = Number(denominator);
    if (!Number.isFinite(num) || !Number.isFinite(den) || den === 0) return 0;
    return (num / den) * scale;
};

async function fetchJson(url) {
    const response = await fetch(url);
    if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
    }
    return response.json();
}

function destroyDashboardCharts() {
    if (scoringChart && typeof scoringChart.destroy === 'function') {
        try {
            scoringChart.destroy();
        } catch (error) {
            console.warn('Failed to destroy scoring chart:', error);
        }
        scoringChart = null;
    }
    if (shootingChart && typeof shootingChart.destroy === 'function') {
        try {
            shootingChart.destroy();
        } catch (error) {
            console.warn('Failed to destroy shooting chart:', error);
        }
        shootingChart = null;
    }
}

window.addEventListener('pagehide', destroyDashboardCharts);
window.addEventListener('beforeunload', destroyDashboardCharts);

document.addEventListener('DOMContentLoaded', async () => {
    // Check if Chart.js is loaded
    if (typeof Chart === 'undefined') {
        console.error('Chart.js is not loaded!');
        return;
    }
    
    // Show loading states
    showLoader('top-scorers-container', 'Loading leaderboards...');
    showLoader('charts-container', 'Loading team trends...');
    
    // Load critical data in parallel
    const results = await Promise.allSettled([
        loadSeasonStats(),
        loadLeaderboards(),
        loadAdvancedStats()
    ]);
    results.forEach((result) => {
        if (result.status === 'rejected') {
            console.error('Dashboard load failed:', result.reason);
        }
    });
    
    // Load charts after critical data is ready (don't block)
    loadCharts().catch(error => {
        console.error('Error loading charts:', error);
        const chartsContainer = document.getElementById('charts-container');
        if (chartsContainer) {
            showEmptyState('charts-container', 'Unable to load trend charts', '📊');
        }
    });
});

async function loadSeasonStats() {
    try {
        const stats = await fetchJson('/api/season-stats');
        
        if (!stats) {
            console.error('No season stats data received');
            return;
        }

        const recordEl = document.getElementById('record');
        if (recordEl) recordEl.textContent = `${stats.win}-${stats.loss}`;
        
        const winPctEl = document.getElementById('win-pct');
        if (winPctEl) {
            const totalGames = stats.win + stats.loss;
            const winPct = safeRatio(stats.win, totalGames, 100).toFixed(0);
            winPctEl.textContent = `Win Percentage: ${winPct}%`;
        }
        
        const ppgEl = document.getElementById('ppg');
        if (ppgEl) ppgEl.textContent = safeFixed(stats.ppg, 1);
        
        const fgPctEl = document.getElementById('fg-pct');
        if (fgPctEl) fgPctEl.textContent = safeFixed(stats.fg_pct, 1) + '%';
        
        const rpgEl = document.getElementById('rpg');
        if (rpgEl) rpgEl.textContent = safeFixed(stats.rpg, 1);
        
        const apgEl = document.getElementById('apg');
        if (apgEl) apgEl.textContent = safeFixed(stats.apg, 1);
    } catch (error) {
        console.error('Error loading season stats:', error);
    }
}

async function loadAdvancedStats() {
    try {
        const stats = await fetchJson('/api/advanced/team');
        
        if (!stats || !stats.scoring_efficiency || !stats.ball_movement) {
            console.error('Invalid advanced stats data structure:', stats);
            return;
        }
        
        // Update advanced efficiency metrics
        const efgPctEl = document.getElementById('efg-pct');
        if (efgPctEl) efgPctEl.textContent = safeFixed(stats.scoring_efficiency.efg_pct, 1) + '%';
        
        const tsPctEl = document.getElementById('ts-pct');
        if (tsPctEl) tsPctEl.textContent = safeFixed(stats.scoring_efficiency.ts_pct, 1) + '%';
        
        const pppEl = document.getElementById('ppp');
        if (pppEl) pppEl.textContent = safeFixed(stats.scoring_efficiency.ppp, 2);
        
        const astRateEl = document.getElementById('ast-rate');
        if (astRateEl) astRateEl.textContent = safeFixed(stats.ball_movement.assisted_scoring_rate, 1) + '%';
    } catch (error) {
        console.error('Error loading advanced stats:', error);
    }
}

async function loadLeaderboards() {
    try {
        const leaderboards = await fetchJson('/api/leaderboards');
        
        // Validate data structure
        if (!leaderboards || !leaderboards.pts || !leaderboards.reb || !leaderboards.asst) {
            console.error('Invalid leaderboards data structure:', leaderboards);
            showEmptyState('top-scorers-container', 'No scorer data available', '🏀');
            return;
        }

        // Top Scorers
        const topScorersEl = document.getElementById('top-scorers');
        if (topScorersEl) {
            if (leaderboards.pts.length === 0) {
                showEmptyState('top-scorers-container', 'No scorer data available', '🏀');
            } else {
                const scorersHtml = leaderboards.pts.slice(0, 5).map(p => `
                    <tr>
                        <td><strong>${escapeHtml(p.first_name || p.name.split(' ')[0])}</strong></td>
                        <td>${p.pts}</td>
                    </tr>
                `).join('');
                topScorersEl.innerHTML = scorersHtml;
            }
        }

        // Top Rebounders
        const topReboundersEl = document.getElementById('top-rebounders');
        if (topReboundersEl) {
            if (leaderboards.reb.length === 0) {
                showEmptyState('top-rebounders-container', 'No rebound data available', '📦');
            } else {
                const reboundersHtml = leaderboards.reb.slice(0, 5).map(p => `
                    <tr>
                        <td><strong>${escapeHtml(p.first_name || p.name.split(' ')[0])}</strong></td>
                        <td>${p.reb}</td>
                    </tr>
                `).join('');
                topReboundersEl.innerHTML = reboundersHtml;
            }
        }

        // Top Assist Leaders
        const topAssistsEl = document.getElementById('top-assists');
        if (topAssistsEl) {
            if (leaderboards.asst.length === 0) {
                showEmptyState('top-assists-container', 'No assist data available', '🎯');
            } else {
                const assistsHtml = leaderboards.asst.slice(0, 5).map(p => `
                    <tr>
                        <td><strong>${escapeHtml(p.first_name || p.name.split(' ')[0])}</strong></td>
                        <td>${p.asst}</td>
                    </tr>
                `).join('');
                topAssistsEl.innerHTML = assistsHtml;
            }
        }
    } catch (error) {
        console.error('Error loading leaderboards:', error);
        showError('top-scorers', 'Failed to load leaderboard data. Please refresh the page.');
    }
}

async function loadRecentGames() {
    try {
        showLoader('games-list', 'Loading recent games...');
        let games = await fetchJson('/api/games');

        // Sort games by date
        games.sort((a, b) => {
            const dateA = new Date(a.date);
            const dateB = new Date(b.date);
            return dateA - dateB;
        });

        const gamesList = document.getElementById('games-list');
        const recentGames = games.slice(-5).reverse();
        
        if (recentGames.length === 0) {
            showEmptyState('games-list', 'No games recorded yet', '🏀');
            return;
        }

        gamesList.innerHTML = recentGames.map(game => `
            <div class="game-card">
                <div class="game-info">
                    <div class="game-date">${game.date}</div>
                    <div class="game-opponent">
                        ${game.location === 'away' ? '@' : 'vs'} ${escapeHtml(game.opponent)}
                    </div>
                </div>
                <div class="game-score">
                    <span class="score-vc">${game.vc_score}</span>
                    <span class="score-separator">-</span>
                    <span class="score-opp">${game.opp_score}</span>
                    <span class="result-badge ${game.result === 'W' ? 'win' : 'loss'}">
                        ${game.result === 'W' ? 'WIN' : 'LOSS'}
                    </span>
                </div>
            </div>
        `).join('');
    } catch (error) {
        console.error('Error loading games:', error);
        showError('games-list', 'Failed to load recent games. Please try again.');
    }
}

async function loadCharts() {
    try {
        const trends = await fetchJson('/api/team-trends');
        
        // Validate data
        if (!trends || !trends.games || trends.games.length === 0) {
            console.warn('No game data available for charts');
            return;
        }
        
        // Sort by date to ensure chronological order
        const gameIds = trends.games;
        const sortedIndices = gameIds.map((_, i) => i).sort((a, b) => {
            const dateA = new Date(trends.dates[a]);
            const dateB = new Date(trends.dates[b]);
            return dateA - dateB;
        });
        
        const sortedOpponents = sortedIndices.map(i => trends.opponents[i]);
        const sortedVcScore = sortedIndices.map(i => toNumber(trends.vc_score[i]));
        const sortedOppScore = sortedIndices.map(i => toNumber(trends.opp_score[i]));
        const sortedFgPct = sortedIndices.map(i => toNumber(trends.fg_pct[i]));
        const sortedFg3Pct = sortedIndices.map(i => toNumber(trends.fg3_pct[i]));

        // Scoring Chart
        const scoringCtx = document.getElementById('scoringChart');
        if (!scoringCtx) {
            console.error('Scoring chart canvas not found');
            return;
        }
        
        if (scoringChart) scoringChart.destroy();
        scoringChart = new Chart(scoringCtx.getContext('2d'), {
            type: 'line',
            data: {
                labels: sortedOpponents,
                datasets: [
                    {
                        label: 'Team',
                        data: sortedVcScore,
                        borderColor: '#4169E1',
                        backgroundColor: 'rgba(65, 105, 225, 0.1)',
                        tension: 0.3,
                        fill: true,
                        pointRadius: 5,
                        pointBackgroundColor: '#4169E1',
                        borderWidth: 2
                    },
                    {
                        label: 'Opponents',
                        data: sortedOppScore,
                        borderColor: '#9E9E9E',
                        backgroundColor: 'rgba(158, 158, 158, 0.1)',
                        tension: 0.3,
                        fill: true,
                        pointRadius: 5,
                        pointBackgroundColor: '#9E9E9E',
                        borderWidth: 2
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        display: true,
                        labels: {
                            font: { size: 13 },
                            color: '#f0f0f0',
                            padding: 15
                        }
                    },
                    tooltip: {
                        backgroundColor: 'rgba(0,0,0,0.8)',
                        padding: 12,
                        titleFont: { size: 13 },
                        bodyFont: { size: 12 }
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        grid: {
                            color: 'rgba(255, 255, 255, 0.1)'
                        },
                        ticks: {
                            font: { size: 11 },
                            color: '#c0c0c0'
                        }
                    },
                    x: {
                        grid: {
                            display: false
                        },
                        ticks: {
                            font: { size: 10 },
                            color: '#c0c0c0',
                            maxRotation: 45,
                            minRotation: 45
                        }
                    }
                }
            }
        });

        // Shooting Efficiency Chart
        const shootingCtx = document.getElementById('shootingChart');
        if (!shootingCtx) {
            console.error('Shooting chart canvas not found');
            return;
        }
        
        if (shootingChart) shootingChart.destroy();
        shootingChart = new Chart(shootingCtx.getContext('2d'), {
            type: 'bar',
            data: {
                labels: sortedOpponents,
                datasets: [
                    {
                        label: 'FG%',
                        data: sortedFgPct,
                        backgroundColor: 'rgba(65, 105, 225, 0.8)',
                        borderColor: '#4169E1',
                        borderWidth: 1
                    },
                    {
                        label: '3P%',
                        data: sortedFg3Pct,
                        backgroundColor: 'rgba(158, 158, 158, 0.8)',
                        borderColor: '#9E9E9E',
                        borderWidth: 1
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        display: true,
                        labels: {
                            font: { size: 13 },
                            color: '#f0f0f0',
                            padding: 15
                        }
                    },
                    tooltip: {
                        backgroundColor: 'rgba(0,0,0,0.8)',
                        padding: 12,
                        titleFont: { size: 13 },
                        bodyFont: { size: 12 },
                        callbacks: {
                            label: function(context) {
                                return context.dataset.label + ': ' + context.parsed.y.toFixed(1) + '%';
                            }
                        }
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        max: 100,
                        grid: {
                            color: 'rgba(255, 255, 255, 0.1)'
                        },
                        ticks: {
                            font: { size: 11 },
                            color: '#c0c0c0',
                            callback: function(value) {
                                return value + '%';
                            }
                        }
                    },
                    x: {
                        grid: {
                            display: false
                        },
                        ticks: {
                            font: { size: 10 },
                            color: '#c0c0c0',
                            maxRotation: 45,
                            minRotation: 45
                        }
                    }
                }
            }
        });
    } catch (error) {
        console.error('Error loading charts:', error);
        showEmptyState('charts-container', 'Unable to load trend charts', '📊');
    }
}
