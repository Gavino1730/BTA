// Trends Page JavaScript
let teamCharts = {};
let playerCharts = {};
let allPlayers = [];
let currentTrendsData = null;
let comprehensiveInsights = null;
const EMPTY_STATS_LABEL = 'No Stats';
const COMPARISON_STATS = [
    { key: 'ppg', label: 'Points Per Game' },
    { key: 'rpg', label: 'Rebounds Per Game' },
    { key: 'apg', label: 'Assists Per Game' },
    { key: 'tpg', label: 'Turnovers Per Game', lowerBetter: true },
    { key: 'fg_pct', label: 'Field Goal %' },
    { key: 'fg3_pct', label: '3-Point %' },
    { key: 'ft_pct', label: 'Free Throw %' }
];

const isFiniteNumber = (value) => Number.isFinite(Number(value));
const toNumber = (value, fallback = 0) => (isFiniteNumber(value) ? Number(value) : fallback);
const safeRatio = (numerator, denominator, scale = 1) => {
    const num = Number(numerator);
    const den = Number(denominator);
    if (!Number.isFinite(num) || !Number.isFinite(den) || den === 0) return 0;
    return (num / den) * scale;
};
const safeFixed = (value, decimals = 1, fallback = '0.0') => {
    const num = Number(value);
    return Number.isFinite(num) ? num.toFixed(decimals) : fallback;
};

function createZeroTeamTrends() {
    return {
        games: [0],
        opponents: [EMPTY_STATS_LABEL],
        dates: [''],
        vc_score: [0],
        opp_score: [0],
        fg_pct: [0],
        fg3_pct: [0],
        asst: [0],
        to: [0],
        reb: [0],
        oreb: [0],
        dreb: [0],
        stl: [0],
        blk: [0],
        ft: [0],
        fta: [0]
    };
}

function createZeroPlayerTrends() {
    return {
        games: [0],
        opponents: [EMPTY_STATS_LABEL],
        dates: [''],
        pts: [0],
        fg: [0],
        fg_att: [0],
        fg3: [0],
        fg3_att: [0],
        reb: [0],
        asst: [0]
    };
}

async function fetchJson(url) {
    const response = await fetch(url);
    if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
    }
    return response.json();
}

function destroyCharts(chartMap) {
    Object.keys(chartMap).forEach((key) => {
        if (chartMap[key] && typeof chartMap[key].destroy === 'function') {
            try {
                chartMap[key].destroy();
            } catch (error) {
                console.warn(`Failed to destroy chart ${key}:`, error);
            }
            chartMap[key] = null;
        }
    });
}

function destroyAllCharts() {
    destroyCharts(teamCharts);
    destroyCharts(playerCharts);
}

window.addEventListener('pagehide', destroyAllCharts);
window.addEventListener('beforeunload', destroyAllCharts);

// Clean AI response text (removes markdown symbols)
function formatAIResponse(text) {
    return text
        // Remove headers (### Header -> Header)
        .replace(/^#{1,6}\s+(.+)$/gm, '$1')
        // Remove bold markers (**text** or __text__ -> text)
        .replace(/\*\*(.+?)\*\*/g, '$1')
        .replace(/__(.+?)__/g, '$1')
        // Remove italic markers (*text* or _text_ -> text)
        .replace(/\*(.+?)\*/g, '$1')
        .replace(/_(.+?)_/g, '$1')
        // Clean up bullet points
        .replace(/^[•\-\*]\s+/gm, '• ')
        // Convert line breaks
        .replace(/\n/g, '<br>');
}

document.addEventListener('DOMContentLoaded', async () => {
    // Load data in parallel for faster page interaction
    const results = await Promise.allSettled([
        loadPlayers(),
        loadTeamTrends(),
        loadVolatilityStats(),
        loadComprehensiveInsights()
    ]);
    results.forEach((result) => {
        if (result.status === 'rejected') {
            console.error('Trends page load failed:', result.reason);
        }
    });
    setupTabs();
    // Don't set up player/comparison selectors yet - they're in hidden tabs
});

async function loadPlayers() {
    try {
        allPlayers = await fetchJson('/api/players');
    } catch (error) {
        console.error('Error loading players:', error);
    }
}

async function loadComprehensiveInsights() {
    try {
        comprehensiveInsights = await fetchJson('/api/comprehensive-insights');
    } catch (error) {
        console.error('Error loading comprehensive insights:', error);
    }
}

async function loadVolatilityStats() {
    try {
        const data = await fetchJson('/api/advanced/volatility');
        if (!data || !data.team_volatility) {
            console.warn('Volatility stats missing or invalid');
            return;
        }
        
        document.getElementById('ppg-range').textContent = data.team_volatility.ppg_range || '0.0';
        document.getElementById('fg-std').textContent = safeFixed(data.team_volatility.fg_pct_std_dev, 1) + '%';
        document.getElementById('to-std').textContent = safeFixed(data.team_volatility.to_std_dev, 1);
    } catch (error) {
        console.error('Error loading volatility stats:', error);
    }
}

function setupPlayerSelector() {
    const select = document.getElementById('playerSelect');
    
    if (!select) {
        console.error('playerSelect element not found');
        return;
    }
    
    // Clear existing options except the first one
    while (select.options.length > 1) {
        select.remove(1);
    }

    if (allPlayers.length === 0) {
        const option = document.createElement('option');
        option.value = '';
        option.textContent = EMPTY_STATS_LABEL;
        select.appendChild(option);
        void loadPlayerTrends('');
        return;
    }
    
    allPlayers.forEach(player => {
        const option = document.createElement('option');
        option.value = player.name;  // Use abbreviated name for API
        option.textContent = player.first_name || player.name;  // Display first name only
        select.appendChild(option);
    });

    select.addEventListener('change', async (e) => {
        if (e.target.value) {
            await loadPlayerTrends(e.target.value);
        }
    });
}

async function loadTeamTrends() {
    let trends = createZeroTeamTrends();

    try {
        const response = await fetchJson('/api/team-trends');
        if (response && response.games && response.games.length > 0) {
            trends = response;
        } else {
            console.warn('No game data available for trends');
        }
        currentTrendsData = trends;  // Store for AI analysis
        
        // Sort by date to ensure chronological order
        const gameIds = trends.games;
        const sortedIndices = gameIds.map((_, i) => i).sort((a, b) => {
            const dateA = new Date(trends.dates[a]);
            const dateB = new Date(trends.dates[b]);
            return dateA - dateB;
        });
        
        const sortedOpp = sortedIndices.map(i => trends.opponents[i]);
        const sortedVcScore = sortedIndices.map(i => toNumber(trends.vc_score[i]));
        const sortedOppScore = sortedIndices.map(i => toNumber(trends.opp_score[i]));
        const sortedFgPct = sortedIndices.map(i => toNumber(trends.fg_pct[i]));
        const sortedFg3Pct = sortedIndices.map(i => toNumber(trends.fg3_pct[i]));
        const sortedAsst = sortedIndices.map(i => toNumber(trends.asst[i]));
        const sortedTo = sortedIndices.map(i => toNumber(trends.to[i]));

        // Scoring Chart
        const scoringCtx = document.getElementById('teamScoringChart').getContext('2d');
        if (teamCharts.scoring) teamCharts.scoring.destroy();
        teamCharts.scoring = new Chart(scoringCtx, {
            type: 'line',
            data: {
                labels: sortedOpp,
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
                        labels: { font: { size: 13 }, color: '#f0f0f0', padding: 15 }
                    },
                    tooltip: {
                        backgroundColor: 'rgba(0,0,0,0.8)',
                        padding: 12
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        grid: { color: 'rgba(255, 255, 255, 0.1)' },
                        ticks: { font: { size: 11 }, color: '#c0c0c0' }
                    },
                    x: {
                        grid: { display: false },
                        ticks: { font: { size: 10 }, color: '#c0c0c0', maxRotation: 45, minRotation: 45 }
                    }
                }
            }
        });

        // Shooting Efficiency Chart
        const shootingCtx = document.getElementById('teamShootingChart').getContext('2d');
        if (teamCharts.shooting) teamCharts.shooting.destroy();
        teamCharts.shooting = new Chart(shootingCtx, {
            type: 'bar',
            data: {
                labels: sortedOpp,
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
                        labels: { font: { size: 13 }, color: '#f0f0f0', padding: 15 }
                    },
                    tooltip: {
                        backgroundColor: 'rgba(0,0,0,0.8)',
                        padding: 12,
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
                        grid: { color: 'rgba(255, 255, 255, 0.1)' },
                        ticks: {
                            font: { size: 11 },
                            color: '#c0c0c0',
                            callback: function(value) { return value + '%'; }
                        }
                    },
                    x: {
                        grid: { display: false },
                        ticks: { font: { size: 10 }, color: '#c0c0c0', maxRotation: 45, minRotation: 45 }
                    }
                }
            }
        });

        // Assists vs Turnovers Chart
        const astCtx = document.getElementById('teamAstChart').getContext('2d');
        if (teamCharts.ast) teamCharts.ast.destroy();
        teamCharts.ast = new Chart(astCtx, {
            type: 'line',
            data: {
                labels: sortedOpp,
                datasets: [
                    {
                        label: 'Assists',
                        data: sortedAsst,
                        borderColor: '#4169E1',
                        backgroundColor: 'rgba(65, 105, 225, 0.1)',
                        tension: 0.3,
                        fill: true,
                        pointRadius: 5,
                        pointBackgroundColor: '#4169E1',
                        borderWidth: 2
                    },
                    {
                        label: 'Turnovers',
                        data: sortedTo,
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
                        labels: { font: { size: 13 }, color: '#f0f0f0', padding: 15 }
                    },
                    tooltip: {
                        backgroundColor: 'rgba(0,0,0,0.8)',
                        padding: 12
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        grid: { color: 'rgba(255, 255, 255, 0.1)' },
                        ticks: { font: { size: 11 }, color: '#c0c0c0' }
                    },
                    x: {
                        grid: { display: false },
                        ticks: { font: { size: 10 }, color: '#c0c0c0', maxRotation: 45, minRotation: 45 }
                    }
                }
            }
        });
        
        const isMobile = window.innerWidth < 768;

        // Prepare sorted stat arrays for new charts
        const sortedReb = sortedIndices.map(i => toNumber(trends.reb[i]));
        const sortedOreb = sortedIndices.map(i => toNumber(trends.oreb[i]));
        const sortedDreb = sortedIndices.map(i => toNumber(trends.dreb[i]));
        const sortedStl = sortedIndices.map(i => toNumber(trends.stl[i]));
        const sortedBlk = sortedIndices.map(i => toNumber(trends.blk[i]));
        const sortedFt = sortedIndices.map(i => toNumber(trends.ft[i]));
        const sortedFta = sortedIndices.map(i => toNumber(trends.fta[i]));

        const commonLineOptions = {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: true,
                    labels: {
                        font: { size: isMobile ? 11 : 13, weight: '500' },
                        padding: 15,
                        color: '#f0f0f0'
                    }
                },
                tooltip: {
                    backgroundColor: 'rgba(30, 30, 30, 0.95)',
                    padding: 12,
                    titleFont: { size: 13, weight: 'bold' },
                    bodyFont: { size: 12 }
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    grid: { color: 'rgba(255, 255, 255, 0.08)', lineWidth: 1 },
                    ticks: { font: { size: isMobile ? 10 : 12 }, color: '#c0c0c0' }
                },
                x: {
                    grid: { display: false },
                    ticks: {
                        font: { size: isMobile ? 9 : 11 },
                        maxRotation: 50,
                        minRotation: 50,
                        autoSkip: false,
                        color: '#c0c0c0'
                    }
                }
            }
        };
        
        // Rebounding Trends Chart
        const reboundingCanvas = document.getElementById('teamReboundingChart');
        if (!reboundingCanvas) {
            console.error('Rebounding chart canvas not found');
        } else {
            const reboundingCtx = reboundingCanvas.getContext('2d');
            if (teamCharts.rebounding) teamCharts.rebounding.destroy();
            teamCharts.rebounding = new Chart(reboundingCtx, {
            type: 'line',
            data: {
                labels: sortedOpp,
                datasets: [
                    {
                        label: 'Total Rebounds',
                        data: sortedReb,
                        borderColor: '#4169E1',
                        backgroundColor: 'rgba(65, 105, 225, 0.15)',
                        tension: 0.35,
                        fill: true,
                        pointRadius: isMobile ? 4 : 6,
                        pointHoverRadius: isMobile ? 6 : 8,
                        pointBackgroundColor: '#4169E1',
                        pointBorderColor: '#fff',
                        pointBorderWidth: 2,
                        borderWidth: 3
                    },
                    {
                        label: 'Offensive Rebounds',
                        data: sortedOreb,
                        borderColor: '#32CD32',
                        backgroundColor: 'rgba(50, 205, 50, 0.15)',
                        tension: 0.35,
                        fill: true,
                        pointRadius: isMobile ? 4 : 6,
                        pointHoverRadius: isMobile ? 6 : 8,
                        pointBackgroundColor: '#32CD32',
                        pointBorderColor: '#fff',
                        pointBorderWidth: 2,
                        borderWidth: 3
                    }
                ]
            },
            options: {
                ...commonLineOptions,
                scales: {
                    ...commonLineOptions.scales,
                    y: {
                        ...commonLineOptions.scales.y,
                        title: {
                            display: true,
                            text: 'Rebounds',
                            font: { size: isMobile ? 11 : 12, weight: '600' },
                            color: '#f0f0f0'
                        }
                    }
                }
            }
            });
        }
        
        // Defensive Activity Chart
        const defenseCanvas = document.getElementById('teamDefenseChart');
        if (!defenseCanvas) {
            console.error('Defense chart canvas not found');
        } else {
            const defenseCtx = defenseCanvas.getContext('2d');
            if (teamCharts.defense) teamCharts.defense.destroy();
            teamCharts.defense = new Chart(defenseCtx, {
            type: 'bar',
            data: {
                labels: sortedOpp,
                datasets: [
                    {
                        label: 'Steals',
                        data: sortedStl,
                        backgroundColor: 'rgba(255, 140, 0, 0.85)',
                        borderColor: '#FF8C00',
                        borderWidth: 0,
                        borderRadius: 4,
                        hoverBackgroundColor: '#FF8C00',
                        maxBarThickness: 35
                    },
                    {
                        label: 'Blocks',
                        data: sortedBlk,
                        backgroundColor: 'rgba(220, 20, 60, 0.85)',
                        borderColor: '#DC143C',
                        borderWidth: 0,
                        borderRadius: 4,
                        hoverBackgroundColor: '#DC143C',
                        maxBarThickness: 35
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                layout: {
                    padding: {
                        left: 10,
                        right: 10,
                        top: 10,
                        bottom: isMobile ? 20 : 30
                    }
                },
                plugins: {
                    legend: {
                        display: true,
                        position: 'top',
                        align: 'center',
                        labels: {
                            font: { size: isMobile ? 11 : 13, weight: '500' },
                            padding: 15,
                            usePointStyle: true,
                            pointStyle: 'circle',
                            boxWidth: 8,
                            color: '#f0f0f0'
                        }
                    },
                    tooltip: {
                        backgroundColor: 'rgba(30, 30, 30, 0.95)',
                        padding: 14,
                        titleFont: { size: 13, weight: 'bold' },
                        bodyFont: { size: 12 },
                        borderColor: '#4169E1',
                        borderWidth: 2,
                        cornerRadius: 6
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        grid: {
                            color: 'rgba(255, 255, 255, 0.08)',
                            lineWidth: 1
                        },
                        ticks: {
                            font: { size: isMobile ? 10 : 12 },
                            color: '#c0c0c0',
                            padding: 8
                        },
                        title: {
                            display: true,
                            text: 'Count',
                            font: { size: isMobile ? 11 : 12, weight: '600' },
                            color: '#f0f0f0'
                        }
                    },
                    x: {
                        grid: { display: false },
                        ticks: {
                            font: { size: isMobile ? 9 : 11 },
                            maxRotation: 50,
                            minRotation: 50,
                            autoSkip: false,
                            color: '#c0c0c0',
                            padding: 8
                        }
                    }
                }
            }
            });
        }
        
        // Free Throw Performance Chart
        const ftCanvas = document.getElementById('teamFTChart');
        if (!ftCanvas) {
            console.error('Free throw chart canvas not found');
        } else {
            const ftCtx = ftCanvas.getContext('2d');
            if (teamCharts.ft) teamCharts.ft.destroy();
            teamCharts.ft = new Chart(ftCtx, {
            type: 'line',
            data: {
                labels: sortedOpp,
                datasets: [
                    {
                        label: 'FT%',
                        data: sortedFt.map((ft, idx) => {
                            const fta = sortedFta[idx];
                            return safeRatio(ft, fta, 100);
                        }),
                        borderColor: '#9932CC',
                        backgroundColor: 'rgba(153, 50, 204, 0.15)',
                        tension: 0.35,
                        fill: true,
                        pointRadius: isMobile ? 4 : 6,
                        pointHoverRadius: isMobile ? 6 : 8,
                        pointBackgroundColor: '#9932CC',
                        pointBorderColor: '#fff',
                        pointBorderWidth: 2,
                        borderWidth: 3
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                layout: {
                    padding: {
                        left: 10,
                        right: 10,
                        top: 10,
                        bottom: isMobile ? 20 : 30
                    }
                },
                plugins: {
                    legend: { 
                        display: false
                    },
                    tooltip: {
                        backgroundColor: 'rgba(30, 30, 30, 0.95)',
                        padding: 14,
                        titleFont: { size: 13, weight: 'bold' },
                        bodyFont: { size: 12 },
                        borderColor: '#9932CC',
                        borderWidth: 2,
                        cornerRadius: 6,
                        callbacks: {
                            label: function(context) {
                                return 'FT%: ' + context.parsed.y.toFixed(1) + '%';
                            }
                        }
                    }
                },
                scales: {
                    y: { 
                        beginAtZero: true,
                        max: 100,
                        grid: {
                            color: 'rgba(255, 255, 255, 0.08)',
                            lineWidth: 1
                        },
                        ticks: {
                            font: { size: isMobile ? 10 : 12 },
                            color: '#c0c0c0',
                            padding: 8,
                            callback: function(value) {
                                return value + '%';
                            }
                        },
                        title: {
                            display: true,
                            text: 'Percentage',
                            font: { size: isMobile ? 11 : 12, weight: '600' },
                            color: '#f0f0f0'
                        }
                    },
                    x: {
                        grid: { display: false },
                        ticks: {
                            font: { size: isMobile ? 9 : 11 },
                            maxRotation: 50,
                            minRotation: 50,
                            autoSkip: false,
                            color: '#c0c0c0',
                            padding: 8
                        }
                    }
                }
            }
            });
        }
    } catch (error) {
        console.error('Error loading team trends:', error);
        currentTrendsData = trends;

        const gameIds = trends.games;
        const sortedIndices = gameIds.map((_, i) => i);
        const sortedOpp = sortedIndices.map(i => trends.opponents[i]);
        const sortedVcScore = sortedIndices.map(i => toNumber(trends.vc_score[i]));
        const sortedOppScore = sortedIndices.map(i => toNumber(trends.opp_score[i]));
        const sortedFgPct = sortedIndices.map(i => toNumber(trends.fg_pct[i]));
        const sortedFg3Pct = sortedIndices.map(i => toNumber(trends.fg3_pct[i]));
        const sortedAsst = sortedIndices.map(i => toNumber(trends.asst[i]));
        const sortedTo = sortedIndices.map(i => toNumber(trends.to[i]));
        const sortedReb = sortedIndices.map(i => toNumber(trends.reb[i]));
        const sortedOreb = sortedIndices.map(i => toNumber(trends.oreb[i]));
        const sortedStl = sortedIndices.map(i => toNumber(trends.stl[i]));
        const sortedBlk = sortedIndices.map(i => toNumber(trends.blk[i]));
        const sortedFt = sortedIndices.map(i => toNumber(trends.ft[i]));
        const sortedFta = sortedIndices.map(i => toNumber(trends.fta[i]));
        const isMobile = window.innerWidth < 768;

        const scoringCtx = document.getElementById('teamScoringChart')?.getContext('2d');
        if (scoringCtx) {
            if (teamCharts.scoring) teamCharts.scoring.destroy();
            teamCharts.scoring = new Chart(scoringCtx, {
                type: 'line',
                data: { labels: sortedOpp, datasets: [{ label: 'Team', data: sortedVcScore, borderColor: '#4169E1', backgroundColor: 'rgba(65, 105, 225, 0.1)', tension: 0.3, fill: true, pointRadius: 5, pointBackgroundColor: '#4169E1', borderWidth: 2 }, { label: 'Opponents', data: sortedOppScore, borderColor: '#9E9E9E', backgroundColor: 'rgba(158, 158, 158, 0.1)', tension: 0.3, fill: true, pointRadius: 5, pointBackgroundColor: '#9E9E9E', borderWidth: 2 }] },
                options: { responsive: true, maintainAspectRatio: false }
            });
        }

        const shootingCtx = document.getElementById('teamShootingChart')?.getContext('2d');
        if (shootingCtx) {
            if (teamCharts.shooting) teamCharts.shooting.destroy();
            teamCharts.shooting = new Chart(shootingCtx, {
                type: 'bar',
                data: { labels: sortedOpp, datasets: [{ label: 'FG%', data: sortedFgPct, backgroundColor: 'rgba(65, 105, 225, 0.8)', borderColor: '#4169E1', borderWidth: 1 }, { label: '3P%', data: sortedFg3Pct, backgroundColor: 'rgba(158, 158, 158, 0.8)', borderColor: '#9E9E9E', borderWidth: 1 }] },
                options: { responsive: true, maintainAspectRatio: false }
            });
        }

        const reboundingCtx = document.getElementById('teamReboundingChart')?.getContext('2d');
        if (reboundingCtx) {
            if (teamCharts.rebounding) teamCharts.rebounding.destroy();
            teamCharts.rebounding = new Chart(reboundingCtx, {
                type: 'line',
                data: { labels: sortedOpp, datasets: [{ label: 'Total Rebounds', data: sortedReb, borderColor: '#4169E1', backgroundColor: 'rgba(65, 105, 225, 0.15)', tension: 0.35, fill: true, pointRadius: isMobile ? 4 : 6, pointBackgroundColor: '#4169E1', pointBorderColor: '#fff', pointBorderWidth: 2, borderWidth: 3 }, { label: 'Offensive Rebounds', data: sortedOreb, borderColor: '#32CD32', backgroundColor: 'rgba(50, 205, 50, 0.15)', tension: 0.35, fill: true, pointRadius: isMobile ? 4 : 6, pointBackgroundColor: '#32CD32', pointBorderColor: '#fff', pointBorderWidth: 2, borderWidth: 3 }] },
                options: { responsive: true, maintainAspectRatio: false }
            });
        }

        const astCtx = document.getElementById('teamAstChart')?.getContext('2d');
        if (astCtx) {
            if (teamCharts.ast) teamCharts.ast.destroy();
            teamCharts.ast = new Chart(astCtx, {
                type: 'line',
                data: { labels: sortedOpp, datasets: [{ label: 'Assists', data: sortedAsst, borderColor: '#4169E1', backgroundColor: 'rgba(65, 105, 225, 0.1)', tension: 0.3, fill: true, pointRadius: 5, pointBackgroundColor: '#4169E1', borderWidth: 2 }, { label: 'Turnovers', data: sortedTo, borderColor: '#9E9E9E', backgroundColor: 'rgba(158, 158, 158, 0.1)', tension: 0.3, fill: true, pointRadius: 5, pointBackgroundColor: '#9E9E9E', borderWidth: 2 }] },
                options: { responsive: true, maintainAspectRatio: false }
            });
        }

        const defenseCtx = document.getElementById('teamDefenseChart')?.getContext('2d');
        if (defenseCtx) {
            if (teamCharts.defense) teamCharts.defense.destroy();
            teamCharts.defense = new Chart(defenseCtx, {
                type: 'bar',
                data: { labels: sortedOpp, datasets: [{ label: 'Steals', data: sortedStl, backgroundColor: 'rgba(255, 140, 0, 0.85)' }, { label: 'Blocks', data: sortedBlk, backgroundColor: 'rgba(220, 20, 60, 0.85)' }] },
                options: { responsive: true, maintainAspectRatio: false }
            });
        }

        const ftCtx = document.getElementById('teamFTChart')?.getContext('2d');
        if (ftCtx) {
            if (teamCharts.ft) teamCharts.ft.destroy();
            teamCharts.ft = new Chart(ftCtx, {
                type: 'line',
                data: { labels: sortedOpp, datasets: [{ label: 'FT%', data: sortedFt.map((ft, idx) => safeRatio(ft, sortedFta[idx], 100)), borderColor: '#9932CC', backgroundColor: 'rgba(153, 50, 204, 0.15)', tension: 0.35, fill: true, pointRadius: isMobile ? 4 : 6, pointBackgroundColor: '#9932CC', pointBorderColor: '#fff', pointBorderWidth: 2, borderWidth: 3 }] },
                options: { responsive: true, maintainAspectRatio: false }
            });
        }
    }
}

async function loadPlayerTrends(playerName) {
    let trends = createZeroPlayerTrends();

    try {
        if (playerName) {
            const response = await fetchJson(`/api/player-trends/${playerName}`);
            if (response && response.games && response.games.length > 0) {
                trends = response;
            } else {
                console.warn('No game data available for player trends');
            }
        }
        
        // Sort by date to ensure chronological order
        const gameIds = trends.games;
        const sortedIndices = gameIds.map((_, i) => i).sort((a, b) => {
            const dateA = new Date(trends.dates[a]);
            const dateB = new Date(trends.dates[b]);
            return dateA - dateB;
        });
        
        const sortedOpp = sortedIndices.map(i => trends.opponents[i]);
        const sortedPts = sortedIndices.map(i => toNumber(trends.pts[i]));
        const sortedFg = sortedIndices.map(i => toNumber(trends.fg[i]));
        const sortedFgAtt = sortedIndices.map(i => toNumber(trends.fg_att[i]));
        const sortedFg3 = sortedIndices.map(i => toNumber(trends.fg3[i]));
        const sortedFg3Att = sortedIndices.map(i => {
            if (trends.fg3_att) return trends.fg3_att[i];
            return 0;
        });
        const sortedReb = sortedIndices.map(i => toNumber(trends.reb[i]));
        const sortedAsst = sortedIndices.map(i => toNumber(trends.asst[i]));

        const isMobile = window.innerWidth < 768;

        // Points Chart
        const ptsCtx = document.getElementById('playerPtsChart').getContext('2d');
        if (playerCharts.pts) playerCharts.pts.destroy();
        playerCharts.pts = new Chart(ptsCtx, {
            type: 'line',
            data: {
                labels: sortedOpp,
                datasets: [
                    {
                        label: 'Points',
                        data: sortedPts,
                        borderColor: '#4169E1',
                        backgroundColor: 'rgba(65, 105, 225, 0.15)',
                        tension: 0.35,
                        fill: true,
                        pointRadius: isMobile ? 4 : 6,
                        pointHoverRadius: isMobile ? 6 : 8,
                        pointBackgroundColor: '#4169E1',
                        pointBorderColor: '#fff',
                        pointBorderWidth: 2,
                        borderWidth: 3
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                layout: {
                    padding: {
                        left: 10,
                        right: 10,
                        top: 10,
                        bottom: isMobile ? 20 : 30
                    }
                },
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        backgroundColor: 'rgba(30, 30, 30, 0.95)',
                        padding: 14,
                        titleFont: { size: 13, weight: 'bold' },
                        bodyFont: { size: 12 },
                        borderColor: '#4169E1',
                        borderWidth: 2,
                        cornerRadius: 6,
                        callbacks: {
                            label: function(context) {
                                return 'Points: ' + context.parsed.y.toFixed(1);
                            }
                        }
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        grid: {
                            color: 'rgba(255, 255, 255, 0.08)',
                            lineWidth: 1
                        },
                        ticks: {
                            font: { size: isMobile ? 10 : 12 },
                            color: '#c0c0c0',
                            padding: 8
                        },
                        title: {
                            display: true,
                            text: 'Points',
                            font: { size: isMobile ? 11 : 12, weight: '600' },
                            color: '#f0f0f0'
                        }
                    },
                    x: {
                        grid: { display: false },
                        ticks: {
                            font: { size: isMobile ? 9 : 11 },
                            maxRotation: 50,
                            minRotation: 50,
                            autoSkip: false,
                            color: '#c0c0c0',
                            padding: 8
                        }
                    }
                }
            }
        });

        // Shooting Efficiency Chart
        const shootingCtx = document.getElementById('playerShootingChart').getContext('2d');
        if (playerCharts.shooting) playerCharts.shooting.destroy();
        
        const fg_pct = sortedFg.map((fg, i) => safeRatio(fg, sortedFgAtt[i], 100));
        const fg3_pct = sortedFg3.map((fg3, i) => safeRatio(fg3, sortedFg3Att[i], 100));

        playerCharts.shooting = new Chart(shootingCtx, {
            type: 'bar',
            data: {
                labels: sortedOpp,
                datasets: [
                    {
                        label: 'FG%',
                        data: fg_pct,
                        backgroundColor: 'rgba(65, 105, 225, 0.85)',
                        borderColor: '#4169E1',
                        borderWidth: 0,
                        borderRadius: 4,
                        hoverBackgroundColor: '#4169E1',
                        maxBarThickness: 35
                    },
                    {
                        label: '3P%',
                        data: fg3_pct,
                        backgroundColor: 'rgba(128, 128, 128, 0.75)',
                        borderColor: '#808080',
                        borderWidth: 0,
                        borderRadius: 4,
                        hoverBackgroundColor: '#909090',
                        maxBarThickness: 35
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                layout: {
                    padding: {
                        left: 10,
                        right: 10,
                        top: 10,
                        bottom: isMobile ? 20 : 30
                    }
                },
                plugins: {
                    legend: {
                        display: true,
                        position: 'top',
                        align: 'center',
                        labels: {
                            font: { size: isMobile ? 11 : 13, weight: '500' },
                            padding: 15,
                            usePointStyle: true,
                            pointStyle: 'circle',
                            boxWidth: 8,
                            color: '#f0f0f0'
                        }
                    },
                    tooltip: {
                        backgroundColor: 'rgba(30, 30, 30, 0.95)',
                        padding: 14,
                        titleFont: { size: 13, weight: 'bold' },
                        bodyFont: { size: 12 },
                        borderColor: '#4169E1',
                        borderWidth: 2,
                        cornerRadius: 6,
                        callbacks: {
                            label: function(context) {
                                let label = context.dataset.label || '';
                                if (label) {
                                    label += ': ';
                                }
                                if (context.parsed.y !== null) {
                                    label += context.parsed.y.toFixed(1) + '%';
                                }
                                return label;
                            }
                        }
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        max: 100,
                        grid: {
                            color: 'rgba(255, 255, 255, 0.08)',
                            lineWidth: 1
                        },
                        ticks: {
                            font: { size: isMobile ? 10 : 12 },
                            color: '#c0c0c0',
                            padding: 8
                        },
                        title: {
                            display: true,
                            text: 'Percentage',
                            font: { size: isMobile ? 11 : 12, weight: '600' },
                            color: '#f0f0f0'
                        }
                    },
                    x: {
                        grid: { display: false },
                        ticks: {
                            font: { size: isMobile ? 9 : 11 },
                            maxRotation: 50,
                            minRotation: 50,
                            autoSkip: false,
                            color: '#c0c0c0',
                            padding: 8
                        }
                    }
                }
            }
        });

        // Rebounds & Assists Chart
        const rebAstCtx = document.getElementById('playerRebAstChart').getContext('2d');
        if (playerCharts.rebAst) playerCharts.rebAst.destroy();
        playerCharts.rebAst = new Chart(rebAstCtx, {
            type: 'line',
            data: {
                labels: sortedOpp,
                datasets: [
                    {
                        label: 'Rebounds',
                        data: sortedReb,
                        borderColor: '#4169E1',
                        backgroundColor: 'rgba(65, 105, 225, 0.15)',
                        tension: 0.35,
                        fill: true,
                        pointRadius: isMobile ? 4 : 6,
                        pointHoverRadius: isMobile ? 6 : 8,
                        pointBackgroundColor: '#4169E1',
                        pointBorderColor: '#fff',
                        pointBorderWidth: 2,
                        borderWidth: 3
                    },
                    {
                        label: 'Assists',
                        data: sortedAsst,
                        borderColor: '#808080',
                        backgroundColor: 'rgba(128, 128, 128, 0.12)',
                        tension: 0.35,
                        fill: true,
                        pointRadius: isMobile ? 4 : 6,
                        pointHoverRadius: isMobile ? 6 : 8,
                        pointBackgroundColor: '#808080',
                        pointBorderColor: '#fff',
                        pointBorderWidth: 2,
                        borderWidth: 3
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                layout: {
                    padding: {
                        left: 10,
                        right: 10,
                        top: 10,
                        bottom: isMobile ? 20 : 30
                    }
                },
                plugins: {
                    legend: {
                        display: true,
                        position: 'top',
                        align: 'center',
                        labels: {
                            font: { size: isMobile ? 11 : 13, weight: '500' },
                            padding: 15,
                            usePointStyle: true,
                            pointStyle: 'circle',
                            boxWidth: 8,
                            color: '#f0f0f0'
                        }
                    },
                    tooltip: {
                        backgroundColor: 'rgba(30, 30, 30, 0.95)',
                        padding: 14,
                        titleFont: { size: 13, weight: 'bold' },
                        bodyFont: { size: 12 },
                        borderColor: '#4169E1',
                        borderWidth: 2,
                        cornerRadius: 6,
                        callbacks: {
                            label: function(context) {
                                let label = context.dataset.label || '';
                                if (label) {
                                    label += ': ';
                                }
                                if (context.parsed.y !== null) {
                                    label += context.parsed.y.toFixed(1);
                                }
                                return label;
                            }
                        }
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        grid: {
                            color: 'rgba(255, 255, 255, 0.08)',
                            lineWidth: 1
                        },
                        ticks: {
                            font: { size: isMobile ? 10 : 12 },
                            color: '#c0c0c0',
                            padding: 8
                        }
                    },
                    x: {
                        grid: { display: false },
                        ticks: {
                            font: { size: isMobile ? 9 : 11 },
                            maxRotation: 50,
                            minRotation: 50,
                            autoSkip: false,
                            color: '#c0c0c0',
                            padding: 8
                        }
                    }
                }
            }
        });
    } catch (error) {
        console.error('Error loading player trends:', error);
        if (playerName) {
            return loadPlayerTrends('');
        }
    }
}



function setupTabs() {
    const tabButtons = document.querySelectorAll('.tab-button');
    const tabContents = document.querySelectorAll('.tab-content');
    
    // Track which tabs have been initialized
    const initializedTabs = new Set();

    tabButtons.forEach(button => {
        button.addEventListener('click', () => {
            const tabName = button.dataset.tab;

            tabButtons.forEach(b => b.classList.remove('active'));
            tabContents.forEach(c => c.classList.remove('active'));

            button.classList.add('active');
            const tabElement = document.getElementById(`${tabName}-tab`);
            
            if (tabElement) {
                tabElement.classList.add('active');
            } else {
                console.error('Tab element not found:', `${tabName}-tab`);
            }
            
            // Initialize tab content on first view
            if (!initializedTabs.has(tabName)) {
                initializedTabs.add(tabName);
                
                if (tabName === 'insights') {
                    displayComprehensiveInsights();
                } else if (tabName === 'player') {
                    setupPlayerSelector();
                } else if (tabName === 'comparison') {
                    setupComparisonSelectors();
                }
            } else if (tabName === 'insights') {
                // Refresh insights each time
                displayComprehensiveInsights();
            }
        });
    });
}

function displayComprehensiveInsights() {
    if (!comprehensiveInsights) return;
    
    // Display team insights
    displayTeamInsights();
    
    // Display recommendations
    displayRecommendations();
    
    // Display player insights
    displayPlayerInsights();
}

function renderZeroComparisonState(title = '0 vs 0') {
    const container = document.getElementById('comparison-results');
    if (!container) return;

    container.innerHTML = '';

    const headerDiv = document.createElement('div');
    headerDiv.style.gridColumn = '1 / -1';
    headerDiv.style.textAlign = 'center';
    headerDiv.style.marginBottom = '1rem';
    const h3 = document.createElement('h3');
    h3.textContent = title;
    headerDiv.appendChild(h3);
    container.appendChild(headerDiv);

    COMPARISON_STATS.forEach((stat) => {
        const statDiv = document.createElement('div');
        statDiv.className = 'comparison-stat';

        const nameDiv = document.createElement('div');
        nameDiv.className = 'comparison-stat-name';
        nameDiv.textContent = stat.label;
        statDiv.appendChild(nameDiv);

        const valuesDiv = document.createElement('div');
        valuesDiv.className = 'comparison-values';

        const value1Div = document.createElement('div');
        value1Div.className = 'comparison-value';
        value1Div.textContent = formatStatValue(0, stat.key);
        valuesDiv.appendChild(value1Div);

        const vsDiv = document.createElement('div');
        vsDiv.style.color = 'var(--text-light)';
        vsDiv.style.fontSize = '0.8rem';
        vsDiv.textContent = 'vs';
        valuesDiv.appendChild(vsDiv);

        const value2Div = document.createElement('div');
        value2Div.className = 'comparison-value';
        value2Div.textContent = formatStatValue(0, stat.key);
        valuesDiv.appendChild(value2Div);

        statDiv.appendChild(valuesDiv);
        container.appendChild(statDiv);
    });
}

function displayTeamInsights() {
    const container = document.getElementById('team-insights-grid');
    const insights = comprehensiveInsights;
    
    if (!insights.team_trends) return;
    
    const trends = insights.team_trends;
    
    // Clear existing content
    container.innerHTML = '';
    
    // Create insight cards safely
    const cards = [
        {
            title: 'Recent Performance',
            items: [
                { label: 'Record', value: trends.recent_performance?.record || 'N/A' },
                { label: 'Avg Score', value: trends.recent_performance?.avg_score || 'N/A' },
                { label: 'Point Differential', value: (trends.recent_performance?.point_differential > 0 ? '+' : '') + (trends.recent_performance?.point_differential || 'N/A') },
                { label: 'Trend', value: trends.recent_performance?.trend || 'N/A' }
            ]
        },
        {
            title: 'Scoring Trends',
            items: [
                { label: 'Recent Avg', value: (trends.scoring_trends?.recent_avg || 'N/A') + ' PPG' },
                { label: 'Early Season', value: (trends.scoring_trends?.early_avg || 'N/A') + ' PPG' },
                { label: 'Improvement', value: (trends.scoring_trends?.improvement > 0 ? '+' : '') + (trends.scoring_trends?.improvement || 'N/A') },
                { label: 'Trend', value: trends.scoring_trends?.trend || 'N/A' }
            ]
        },
        {
            title: 'Defensive Trends',
            items: [
                { label: 'Recent Allowed', value: (trends.defensive_trends?.recent_avg_allowed || 'N/A') + ' PPG' },
                { label: 'Early Season', value: (trends.defensive_trends?.early_avg_allowed || 'N/A') + ' PPG' },
                { label: 'Improvement', value: (trends.defensive_trends?.improvement > 0 ? '+' : '') + (trends.defensive_trends?.improvement || 'N/A') },
                { label: 'Trend', value: trends.defensive_trends?.trend || 'N/A' }
            ]
        },
        {
            title: 'Key Metrics',
            items: [
                { label: 'Win %', value: (insights.key_metrics?.win_pct || 'N/A') + '%' },
                { label: 'FG%', value: (insights.key_metrics?.fg_pct || 'N/A') + '%' },
                { label: '3P%', value: (insights.key_metrics?.fg3_pct || 'N/A') + '%' },
                { label: 'AST/TO', value: ((insights.key_metrics?.apg || 0) / (insights.key_metrics?.tpg || 1)).toFixed(2) }
            ]
        }
    ];
    
    cards.forEach(card => {
        const cardDiv = document.createElement('div');
        cardDiv.className = 'insight-card';
        
        const titleDiv = document.createElement('div');
        titleDiv.className = 'insight-title';
        titleDiv.textContent = card.title;
        cardDiv.appendChild(titleDiv);
        
        const contentDiv = document.createElement('div');
        contentDiv.className = 'insight-content';
        
        card.items.forEach(item => {
            const p = document.createElement('p');
            const strong = document.createElement('strong');
            strong.textContent = item.label + ': ';
            p.appendChild(strong);
            p.appendChild(document.createTextNode(String(item.value)));
            contentDiv.appendChild(p);
        });
        
        cardDiv.appendChild(contentDiv);
        container.appendChild(cardDiv);
    });
}

function displayRecommendations() {
    const container = document.getElementById('recommendations-list');
    const recommendations = comprehensiveInsights?.recommendations || [];
    
    if (recommendations.length === 0) {
        container.innerHTML = '<li>No specific recommendations at this time.</li>';
        return;
    }
    
    container.innerHTML = '';
    recommendations.forEach(rec => {
        const li = document.createElement('li');
        li.className = `rec-${escapeHtml(rec.priority).toLowerCase()}`;
        
        const strong = document.createElement('strong');
        strong.textContent = `${rec.category} (${rec.priority} Priority): `;
        li.appendChild(strong);
        
        li.appendChild(document.createTextNode(rec.recommendation));
        
        const br = document.createElement('br');
        li.appendChild(br);
        
        const small = document.createElement('small');
        const em = document.createElement('em');
        em.textContent = rec.reason;
        small.appendChild(em);
        li.appendChild(small);
        
        container.appendChild(li);
    });
}

function displayPlayerInsights() {
    const container = document.getElementById('player-insights-grid');
    const playerInsights = comprehensiveInsights?.player_insights || [];
    
    if (playerInsights.length === 0) {
        container.innerHTML = '<div class="player-insight-card">No player insights available.</div>';
        return;
    }
    
    container.innerHTML = '';
    playerInsights.slice(0, 12).forEach(player => {
        const card = document.createElement('div');
        card.className = 'player-insight-card';
        
        const nameDiv = document.createElement('div');
        nameDiv.className = 'player-insight-name';
        nameDiv.textContent = player.name || 'Unknown Player';
        card.appendChild(nameDiv);
        
        const roleDiv = document.createElement('div');
        roleDiv.className = 'player-insight-role';
        roleDiv.textContent = player.role || 'N/A';
        card.appendChild(roleDiv);
        
        // Strengths section
        const strengthsDiv = document.createElement('div');
        strengthsDiv.className = 'strengths';
        const strengthsH4 = document.createElement('h4');
        strengthsH4.textContent = 'Strengths';
        strengthsDiv.appendChild(strengthsH4);
        
        const strengthTagsDiv = document.createElement('div');
        strengthTagsDiv.className = 'strength-tags';
        (player.strengths || []).forEach(strength => {
            const tag = document.createElement('span');
            tag.className = 'strength-tag';
            tag.textContent = strength;
            strengthTagsDiv.appendChild(tag);
        });
        strengthsDiv.appendChild(strengthTagsDiv);
        card.appendChild(strengthsDiv);
        
        // Improvements section
        const improvementsDiv = document.createElement('div');
        improvementsDiv.className = 'improvements';
        const improvementsH4 = document.createElement('h4');
        improvementsH4.textContent = 'Areas for Improvement';
        improvementsDiv.appendChild(improvementsH4);
        
        const improvementTagsDiv = document.createElement('div');
        improvementTagsDiv.className = 'improvement-tags';
        (player.areas_for_improvement || []).forEach(area => {
            const tag = document.createElement('span');
            tag.className = 'improvement-tag';
            tag.textContent = area;
            improvementTagsDiv.appendChild(tag);
        });
        improvementsDiv.appendChild(improvementTagsDiv);
        card.appendChild(improvementsDiv);
        
        // Efficiency grade
        const gradeDiv = document.createElement('div');
        gradeDiv.style.marginTop = '0.75rem';
        gradeDiv.style.fontSize = '0.85rem';
        gradeDiv.style.color = 'var(--text-light)';
        gradeDiv.textContent = 'Efficiency Grade: ';
        const gradeStrong = document.createElement('strong');
        gradeStrong.textContent = player.efficiency_grade || 'N/A';
        gradeDiv.appendChild(gradeStrong);
        card.appendChild(gradeDiv);
        
        container.appendChild(card);
    });
}

function setupComparisonSelectors() {
    const player1Select = document.getElementById('player1Select');
    const player2Select = document.getElementById('player2Select');
    const compareButton = document.getElementById('compareButton');
    
    if (!player1Select || !player2Select || !compareButton) {
        console.error('Comparison selector elements not found');
        return;
    }
    
    // Clear existing options except the first one
    while (player1Select.options.length > 1) {
        player1Select.remove(1);
    }
    while (player2Select.options.length > 1) {
        player2Select.remove(1);
    }

    renderZeroComparisonState();

    if (allPlayers.length === 0) {
        compareButton.disabled = true;
        return;
    }

    compareButton.disabled = false;
    
    // Populate player options
    allPlayers.forEach(player => {
        const option1 = new Option(player.first_name || player.name, player.name);
        const option2 = new Option(player.first_name || player.name, player.name);
        player1Select.appendChild(option1);
        player2Select.appendChild(option2);
    });
    
    // Setup compare button
    compareButton.addEventListener('click', compareSelectedPlayers);
}

async function compareSelectedPlayers() {
    const player1 = document.getElementById('player1Select').value;
    const player2 = document.getElementById('player2Select').value;
    
    if (!player1 || !player2) {
        alert('Please select both players to compare');
        return;
    }
    
    if (player1 === player2) {
        alert('Please select two different players');
        return;
    }
    
    try {
        const query = `/api/player-comparison?players=${encodeURIComponent(player1)}&players=${encodeURIComponent(player2)}`;
        const comparison = await fetchJson(query);
        
        displayComparison(comparison);
    } catch (error) {
        console.error('Error comparing players:', error);
    }
}

function displayComparison(comparison) {
    const container = document.getElementById('comparison-results');
    
    if (!comparison.players || comparison.players.length < 2) {
        renderZeroComparisonState();
        return;
    }
    
    const player1 = comparison.players[0];
    const player2 = comparison.players[1];
    
    // Clear container
    container.innerHTML = '';
    
    // Add header
    const headerDiv = document.createElement('div');
    headerDiv.style.gridColumn = '1 / -1';
    headerDiv.style.textAlign = 'center';
    headerDiv.style.marginBottom = '1rem';
    const h3 = document.createElement('h3');
    h3.textContent = `${player1.name || 'Player 1'} vs ${player2.name || 'Player 2'}`;
    headerDiv.appendChild(h3);
    container.appendChild(headerDiv);
    
    // Add comparison stats
    COMPARISON_STATS.forEach(stat => {
        const val1 = player1.basic_stats?.[stat.key] || 0;
        const val2 = player2.basic_stats?.[stat.key] || 0;
        
        let winner1 = false, winner2 = false;
        if (stat.lowerBetter) {
            winner1 = val1 < val2 && val2 > 0;
            winner2 = val2 < val1 && val1 > 0;
        } else {
            winner1 = val1 > val2;
            winner2 = val2 > val1;
        }
        
        const statDiv = document.createElement('div');
        statDiv.className = 'comparison-stat';
        
        const nameDiv = document.createElement('div');
        nameDiv.className = 'comparison-stat-name';
        nameDiv.textContent = stat.label;
        statDiv.appendChild(nameDiv);
        
        const valuesDiv = document.createElement('div');
        valuesDiv.className = 'comparison-values';
        
        const value1Div = document.createElement('div');
        value1Div.className = winner1 ? 'comparison-value comparison-winner' : 'comparison-value';
        value1Div.textContent = formatStatValue(val1, stat.key);
        valuesDiv.appendChild(value1Div);
        
        const vsDiv = document.createElement('div');
        vsDiv.style.color = 'var(--text-light)';
        vsDiv.style.fontSize = '0.8rem';
        vsDiv.textContent = 'vs';
        valuesDiv.appendChild(vsDiv);
        
        const value2Div = document.createElement('div');
        value2Div.className = winner2 ? 'comparison-value comparison-winner' : 'comparison-value';
        value2Div.textContent = formatStatValue(val2, stat.key);
        valuesDiv.appendChild(value2Div);
        
        statDiv.appendChild(valuesDiv);
        container.appendChild(statDiv);
    });
}

function formatStatValue(value, stat) {
    const num = Number(value);
    if (!isFinite(num)) return '0';
    
    if (stat.includes('_pct')) {
        return `${num.toFixed(1)}%`;
    }
    if (stat.includes('pg')) {
        return num.toFixed(1);
    }
    return Math.round(num).toString();
}
