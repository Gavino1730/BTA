// AI Insights JavaScript - Chatbot Version
let conversationHistory = [];
let statsContext = null;

const safeFixed = (value, decimals = 1, fallback = '0.0') => {
    const num = Number(value);
    return Number.isFinite(num) ? num.toFixed(decimals) : fallback;
};
const safeRatio = (numerator, denominator, scale = 1) => {
    const num = Number(numerator);
    const den = Number(denominator);
    if (!Number.isFinite(num) || !Number.isFinite(den) || den === 0) return 0;
    return (num / den) * scale;
};

async function fetchJson(url, options = {}) {
    const response = await fetch(url, options);
    if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
    }
    return response.json();
}

// Load conversation from sessionStorage on page load
document.addEventListener('DOMContentLoaded', async () => {
    await loadStatsContext();
    loadConversationHistory();

    const refreshContextBtn = document.getElementById('refresh-context-btn');
    if (refreshContextBtn) {
        refreshContextBtn.addEventListener('click', async () => {
            refreshContextBtn.disabled = true;
            refreshContextBtn.textContent = 'Refreshing...';
            try {
                await loadStatsContext();
            } finally {
                refreshContextBtn.disabled = false;
                refreshContextBtn.textContent = 'Refresh';
            }
        });
    }
});

// Load stats context for the sidebar
async function loadStatsContext() {
    try {
        const results = await Promise.allSettled([
            fetchJson('/api/players'),
            fetchJson('/api/games'),
            fetchJson('/api/season-stats')
        ]);

        const players = results[0].status === 'fulfilled' ? results[0].value : [];
        const games = results[1].status === 'fulfilled' ? results[1].value : [];
        const seasonStats = results[2].status === 'fulfilled' ? results[2].value : { season_team_stats: {}, season_player_stats: {} };

        if (results.some((result) => result.status === 'rejected')) {
            console.warn('Some stats context requests failed');
        }
        
        statsContext = { players, games, seasonStats };
        
        // Update stats panel
        updateStatsPanel();
    } catch (error) {
        console.error('Error loading stats context:', error);
        // Set a fallback stats context
        statsContext = { players: [], games: [], seasonStats: { season_team_stats: {}, season_player_stats: {} } };
    }
}

// Update the stats sidebar panel
function updateStatsPanel() {
    if (!statsContext) return;
    
    const teamStats = statsContext.seasonStats.season_team_stats || {};
    const playerStats = statsContext.seasonStats.season_player_stats || {};
    
    // Team Record - add null checks
    const wins = teamStats.win || 0;
    const losses = teamStats.loss || 0;
    const totalGames = wins + losses;
    const winRate = totalGames > 0 ? safeRatio(wins, totalGames, 100).toFixed(1) : '0.0';
    
    const teamRecordElement = document.getElementById('team-record-info');
    if (teamRecordElement) {
        teamRecordElement.innerHTML = `
            <div class="stat-item">
                <strong>${wins}-${losses}</strong>
                <span>${winRate}% Win Rate</span>
            </div>
            <div class="stat-item">
                <span>PPG:</span> <strong>${safeFixed(teamStats.ppg, 1)}</strong>
            </div>
            <div class="stat-item">
                <span>RPG:</span> <strong>${safeFixed(teamStats.rpg, 1)}</strong>
            </div>
            <div class="stat-item">
                <span>APG:</span> <strong>${safeFixed(teamStats.apg, 1)}</strong>
            </div>
        `;
    }
    
    // Top Players by PPG - add validation
    const topPlayers = Object.entries(playerStats)
        .filter(([name, stats]) => stats && typeof stats === 'object' && typeof stats.ppg === 'number' && isFinite(stats.ppg))
        .sort((a, b) => b[1].ppg - a[1].ppg)
        .slice(0, 5);
    
    const topPlayersElement = document.getElementById('top-players-info');
    if (topPlayersElement) {
        topPlayersElement.innerHTML = topPlayers.map(([name, playerStats]) => `
            <div class="player-stat-item">
                <span class="player-name">${name}</span>
                <span class="player-ppg">${safeFixed(playerStats.ppg, 1)} PPG</span>
            </div>
        `).join('');
    }
    
    // Recent Games (last 5) - add validation
    const recentGamesElement = document.getElementById('recent-games-info');
    if (recentGamesElement) {
        if (Array.isArray(statsContext.games) && statsContext.games.length > 0) {
            const recentGames = statsContext.games.slice(-5).reverse();
            recentGamesElement.innerHTML = recentGames.map(game => `
                <div class="game-item ${game.result === 'W' ? 'win' : 'loss'}">
                    <span class="game-result">${game.result || '?'}</span>
                    <span class="game-info">${game.opponent || 'Unknown'} ${game.vc_score || 0}-${game.opp_score || 0}</span>
                </div>
            `).join('');
        } else {
            recentGamesElement.innerHTML = '<div class="game-item">No games data available</div>';
        }
    }
}

// Toggle stats panel visibility
function toggleStatsPanel() {
    const panel = document.getElementById('stats-panel');
    if (panel) {
        panel.classList.toggle('hidden');
    }
}

// Load conversation history from sessionStorage
function loadConversationHistory() {
    try {
        const saved = sessionStorage.getItem('chatHistory');
        if (saved) {
            conversationHistory = JSON.parse(saved);
            // Validate history array
            if (!Array.isArray(conversationHistory)) {
                conversationHistory = [];
            }
            displayConversationHistory();
        }
    } catch (error) {
        console.error('Failed to load chat history:', error);
        conversationHistory = [];
        try {
            sessionStorage.removeItem('chatHistory');
        } catch (e) {
            console.error('Failed to clear invalid chat history:', e);
        }
    }
}

// Save conversation history to sessionStorage with size limit
function saveConversationHistory() {
    try {
        const historyJson = JSON.stringify(conversationHistory);
        // Check size (arbitrary limit of 1MB)
        if (historyJson.length > 1024 * 1024) {
            // Trim history if too large
            conversationHistory = conversationHistory.slice(-10);
            sessionStorage.setItem('chatHistory', JSON.stringify(conversationHistory));
            console.warn('Chat history trimmed due to size limit');
        } else {
            sessionStorage.setItem('chatHistory', historyJson);
        }
    } catch (error) {
        console.error('Failed to save chat history:', error);
        // Clear and retry with empty history
        conversationHistory = [];
        try {
            sessionStorage.removeItem('chatHistory');
        } catch (e) {
            console.error('Failed to clear chat history:', e);
        }
    }
}

// Display all messages in the conversation
function displayConversationHistory() {
    const container = document.getElementById('chat-messages-container');
    
    if (!container) {
        console.error('Error: chat-messages-container element not found');
        return;
    }
    
    // Clear welcome message if there's history
    if (conversationHistory.length > 0) {
        container.innerHTML = '';
    }
    
    conversationHistory.forEach(msg => {
        addMessageToUI(msg.role, msg.content, false);
    });
    
    scrollToBottom();
}

// Add a message to the UI
function addMessageToUI(role, content, shouldScroll = true) {
    const container = document.getElementById('chat-messages-container');
    
    if (!container) {
        console.error('Error: chat-messages-container element not found');
        return;
    }
    
    // Remove welcome message on first user message
    if (role === 'user') {
        const welcome = container.querySelector('.welcome-message');
        if (welcome) welcome.remove();
    }
    
    const messageDiv = document.createElement('div');
    messageDiv.className = `chat-message ${role}-message`;
    
    if (role === 'user') {
        messageDiv.innerHTML = `
            <div class="message-content">${escapeHtml(content)}</div>
        `;
    } else {
        messageDiv.innerHTML = `
            <div class="message-content">${formatAIResponse(content)}</div>
        `;
    }
    
    container.appendChild(messageDiv);
    
    if (shouldScroll) {
        scrollToBottom();
    }
}

// Scroll chat to bottom
function scrollToBottom() {
    const container = document.getElementById('chat-messages-container');
    if (container) {
        container.scrollTop = container.scrollHeight;
    }
}

// Send a message
async function sendMessage() {
    const input = document.getElementById('chat-input');
    if (!input) {
        console.error('Error: chat-input element not found');
        return;
    }
    
    const message = input.value.trim();
    
    if (!message) return;
    
    // Clear input and disable send button
    input.value = '';
    input.style.height = 'auto';
    const sendBtn = document.getElementById('send-btn');
    if (sendBtn) {
        sendBtn.disabled = true;
    }
    
    // Add user message to history and UI
    conversationHistory.push({ role: 'user', content: message });
    addMessageToUI('user', message);
    saveConversationHistory();
    
    // Show typing indicator
    showTypingIndicator();
    
    try {
        const data = await fetchJson('/api/ai/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                message: message,
                history: conversationHistory.slice(-10) // Send last 10 messages for context
            })
        });
        
        hideTypingIndicator();
        
        if (data.error) {
            const errorMsg = `⚠️ Error: ${data.error}`;
            conversationHistory.push({ role: 'assistant', content: errorMsg });
            addMessageToUI('assistant', errorMsg);
        } else {
            const assistantReply = typeof data.reply === 'string' ? data.reply : (typeof data.response === 'string' ? data.response : 'No response available');
            conversationHistory.push({ role: 'assistant', content: assistantReply });
            addMessageToUI('assistant', assistantReply);
        }
        
        saveConversationHistory();
    } catch (error) {
        hideTypingIndicator();
        console.error('Chat error:', error);
        const errorMsg = `⚠️ Connection error: Unable to reach AI service. Please check your internet connection and try again.`;
        conversationHistory.push({ role: 'assistant', content: errorMsg });
        addMessageToUI('assistant', errorMsg);
        saveConversationHistory();
    } finally {
        if (sendBtn) {
            sendBtn.disabled = false;
        }
        input.focus();
    }
}

// Send a quick prompt
function sendQuickPrompt(prompt) {
    const input = document.getElementById('chat-input');
    if (input) {
        input.value = prompt;
        sendMessage();
    }
}

// Clear chat history
function clearChatHistory() {
    if (conversationHistory.length === 0) return;
    
    if (confirm('Clear all conversation history?')) {
        conversationHistory = [];
        sessionStorage.removeItem('chatHistory');
        
        const container = document.getElementById('chat-messages-container');
        if (container) {
            container.innerHTML = `
                <div class="welcome-message">
                    <h3>👋 Hi! I'm your AI Stats Assistant</h3>
                    <p>I have access to all your team and player statistics. You can ask me:</p>
                    <ul>
                        <li>💪 "Who are our top scorers?"</li>
                        <li>📈 "Show me John's shooting trends"</li>
                        <li>🎯 "How can we improve our three-point shooting?"</li>
                        <li>🏆 "Compare our last 3 games"</li>
                        <li>📊 "What's our defensive rebound average?"</li>
                    </ul>
                    <p>Just type your question below!</p>
                </div>
            `;
        }
    }
}

// Handle Enter key in textarea (Shift+Enter for new line)
function handleChatKeydown(event) {
    if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        sendMessage();
    }
}

// Auto-resize textarea as user types
function autoResizeInput(textarea) {
    textarea.style.height = 'auto';
    textarea.style.height = Math.min(textarea.scrollHeight, 120) + 'px';
}

// Show typing indicator
function showTypingIndicator() {
    const typingIndicator = document.getElementById('typing-indicator');
    if (typingIndicator) {
        typingIndicator.classList.remove('hidden');
    }
    scrollToBottom();
}

// Hide typing indicator
function hideTypingIndicator() {
    const typingIndicator = document.getElementById('typing-indicator');
    if (typingIndicator) {
        typingIndicator.classList.add('hidden');
    }
}

// Escape HTML to prevent XSS
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Clean and format AI response (removes markdown symbols)
function formatAIResponse(text) {
    if (!text || typeof text !== 'string') {
        return 'No response available';
    }
    
    // First escape HTML to prevent XSS
    const escapeHtml = (str) => {
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    };
    
    let cleanText = escapeHtml(text);
    
    // Remove markdown headers (### Header -> Header)
    cleanText = cleanText
        .replace(/^#{1,6}\s+(.+)$/gm, '$1')
        // Remove bold markers (**text** or __text__ -> text)
        .replace(/\*\*(.+?)\*\*/g, '$1')
        .replace(/__(.+?)__/g, '$1')
        // Remove italic markers (*text* or _text_ -> text)
        .replace(/\*(.+?)\*/g, '$1')
        .replace(/_(.+?)_/g, '$1')
        // Clean up bullet points (keep the dash/asterisk bullet style)
        .replace(/^[•\-\*]\s+/gm, '• ')
        // Convert line breaks
        .replace(/\n/g, '<br>');
    
    return cleanText;
}

async function loadTeamSummary() {
    try {
        document.getElementById('team-summary').style.display = 'block';
        document.getElementById('ask-coach-section').style.display = 'none';
        document.getElementById('player-analysis-section').style.display = 'none';
        document.getElementById('game-analysis-section').style.display = 'none';
        
        const data = await fetchJson('/api/ai/team-summary');
        const content = document.getElementById('team-summary-content');
        
        if (data.error) {
            content.innerHTML = `<div class="error-message">⚠️ ${data.error}</div>
                <p>Please configure your OpenAI API key as an environment variable: <code>OPENAI_API_KEY</code></p>`;
        } else {
            content.innerHTML = `<div class="ai-response">${formatAIResponse(data.summary)}</div>`;
        }
    } catch (error) {
        document.getElementById('team-summary-content').innerHTML = `<div class="error-message">Error: ${error.message}</div>`;
    }
}

async function askCoach() {
    try {
        const question = document.getElementById('question-input').value.trim();
        const analysisType = document.getElementById('analysis-type').value;
        const askBtn = document.getElementById('ask-btn');
        
        if (!question) {
            alert('Please ask a question');
            return;
        }
        
        askBtn.disabled = true;
        askBtn.textContent = 'Analyzing...';
        document.getElementById('coach-response').style.display = 'block';
        document.getElementById('coach-answer-content').innerHTML = '<div class="loading">AI Coach is thinking...</div>';
        
        const data = await fetchJson('/api/ai/analyze', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ query: question, type: analysisType })
        });
        
        if (data.error) {
            document.getElementById('coach-answer-content').innerHTML = 
                `<div class="error-message">⚠️ ${data.error}</div>
                <p>Please configure your OpenAI API key as an environment variable: <code>OPENAI_API_KEY</code></p>`;
        } else {
            document.getElementById('coach-answer-content').innerHTML = 
                `<div class="ai-response"><strong>AI Response:</strong><br>${formatAIResponse(data.analysis)}</div>`;
        }
        
        askBtn.disabled = false;
        askBtn.textContent = 'Get AI Insight';
    } catch (error) {
        document.getElementById('coach-answer-content').innerHTML = 
            `<div class="error-message">Error: ${error.message}</div>`;
        document.getElementById('ask-btn').disabled = false;
        document.getElementById('ask-btn').textContent = 'Get AI Insight';
    }
}

async function analyzeSelectedPlayer() {
    const playerName = document.getElementById('player-select').value;
    if (!playerName) return;
    
    try {
        const content = document.getElementById('player-insights-content');
        content.innerHTML = '<div class="loading">AI Coach analyzing player...</div>';
        
        const data = await fetchJson(`/api/ai/player-insights/${playerName}`);
        
        if (data.error) {
            content.innerHTML = `<div class="error-message">⚠️ ${data.error}</div>
                <p>Please configure your OpenAI API key as an environment variable: <code>OPENAI_API_KEY</code></p>`;
        } else {
            content.innerHTML = `<div class="ai-response"><strong>${data.player} - AI Insights:</strong><br>${formatAIResponse(data.insights)}</div>`;
        }
    } catch (error) {
        document.getElementById('player-insights-content').innerHTML = 
            `<div class="error-message">Error: ${error.message}</div>`;
    }
}

async function analyzeSelectedGame() {
    const gameId = document.getElementById('game-select').value;
    if (!gameId) return;
    
    try {
        const content = document.getElementById('game-insights-content');
        content.innerHTML = '<div class="loading">AI Coach analyzing game...</div>';
        
        const data = await fetchJson(`/api/ai/game-analysis/${gameId}`);
        
        if (data.error) {
            content.innerHTML = `<div class="error-message">⚠️ ${data.error}</div>
                <p>Please configure your OpenAI API key as an environment variable: <code>OPENAI_API_KEY</code></p>`;
        } else {
            content.innerHTML = `<div class="ai-response"><strong>Game vs ${data.game} - AI Analysis:</strong><br>${formatAIResponse(data.analysis)}</div>`;
        }
    } catch (error) {
        document.getElementById('game-insights-content').innerHTML = 
            `<div class="error-message">Error: ${error.message}</div>`;
    }
}

function toggleAIChat() {
    const chatBox = document.getElementById('chat-box');
    chatBox.style.display = chatBox.style.display === 'none' ? 'block' : 'none';
}

async function sendChatMessage() {
    const input = document.getElementById('chat-input');
    const message = input.value.trim();
    
    if (!message) return;
    
    input.value = '';
    
    // Add user message to chat
    const messages = document.getElementById('chat-messages');
    const userMsg = document.createElement('div');
    userMsg.className = 'chat-message user-message';
    userMsg.textContent = message;
    messages.appendChild(userMsg);
    
    try {
        const data = await fetchJson('/api/ai/analyze', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ query: message, type: 'general' })
        });
        
        const aiMsg = document.createElement('div');
        aiMsg.className = 'chat-message ai-message';
        aiMsg.innerHTML = data.error ? `Error: ${data.error}` : formatAIResponse(data.analysis);
        messages.appendChild(aiMsg);
        
        messages.scrollTop = messages.scrollHeight;
    } catch (error) {
        const errorMsg = document.createElement('div');
        errorMsg.className = 'chat-message error-message';
        errorMsg.textContent = `Error: ${error.message}`;
        messages.appendChild(errorMsg);
    }
}

function handleChatKeypress(event) {
    if (event.key === 'Enter') {
        sendChatMessage();
    }
}
