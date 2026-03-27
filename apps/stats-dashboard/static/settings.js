// Settings Page JavaScript
class SettingsManager {
    constructor() {
        this.currentPlayer = null;
        this.rosterData = null;
        
        this.init();
    }

    async init() {
        this.bindEvents();
        await this.loadSettings();
        await this.loadRoster();
    }

    bindEvents() {
        // Team settings save
        document.getElementById('save-team-settings')?.addEventListener('click', () => this.saveTeamSettings());
        
        // Roster management
        document.getElementById('add-player-btn')?.addEventListener('click', () => this.openPlayerModal());
        document.getElementById('save-player')?.addEventListener('click', () => this.savePlayer());
        
        // Modal events
        document.querySelectorAll('.modal-close').forEach(btn => {
            btn.addEventListener('click', () => this.closePlayerModal());
        });
        
        // Close modal on backdrop click
        document.getElementById('player-modal')?.addEventListener('click', (e) => {
            if (e.target.id === 'player-modal') {
                this.closePlayerModal();
            }
        });
    }

    async loadSettings() {
        try {
            const response = await fetch('/api/teams');
            const data = await response.json();
            
            if (data.teams && data.teams.length > 0) {
                const team = data.teams[0];
                document.getElementById('team-name').value = team.name || '';
                document.getElementById('season').value = team.season || '';
                document.getElementById('team-color').value = team.teamColor || '#1a1a2e';
            }

            // Load AI settings from dedicated endpoint
            const aiResponse = await fetch('/api/ai-settings');
            if (aiResponse.ok) {
                const ai = await aiResponse.json();
                document.getElementById('playing-style').value = ai.playingStyle || '';
                document.getElementById('team-context').value = ai.teamContext || '';
                document.getElementById('custom-prompt').value = ai.customPrompt || '';
            }
        } catch (error) {
            console.error('Error loading settings:', error);
            this.showNotification('Error loading team settings', 'error');
        }
    }

    async loadRoster() {
        try {
            const response = await fetch('/api/roster/players');
            const players = await response.json();
            // API returns a flat array; normalize into the shape the rest of the code expects
            this.rosterData = {
                roster: players.map(p => ({
                    name: p.name,
                    number: p.roster_info?.number ?? p.number,
                    position: p.roster_info?.position ?? p.position ?? '',
                    role: p.roster_info?.role ?? p.role ?? '',
                    height: p.roster_info?.height ?? p.height ?? '',
                    grade: p.roster_info?.grade ?? p.grade ?? '',
                    notes: p.roster_info?.notes ?? p.notes ?? ''
                }))
            };
            
            this.renderRosterTable();
        } catch (error) {
            console.error('Error loading roster:', error);
            this.showNotification('Error loading roster', 'error');
        }
    }

    renderRosterTable() {
        const tbody = document.getElementById('roster-body');
        if (!tbody || !this.rosterData?.roster) return;
        
        tbody.innerHTML = '';
        
        this.rosterData.roster.forEach(player => {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td class="jersey-number">${player.number || '-'}</td>
                <td class="player-name">${player.name}</td>
                <td>${player.position || '-'}</td>
                <td>${player.role || '-'}</td>
                <td>${player.height || '-'}</td>
                <td>${player.grade || '-'}</td>
                <td>${player.notes || '-'}</td>
                <td>
                    <div class="action-buttons">
                        <button class="btn-small btn-edit" onclick="settingsManager.editPlayer('${player.name}')">Edit</button>
                        <button class="btn-small btn-delete" onclick="settingsManager.deletePlayer('${player.name}')">Delete</button>
                    </div>
                </td>
            `;
            tbody.appendChild(row);
        });
    }

    async saveTeamSettings() {
        try {
            const name = document.getElementById('team-name').value;
            const season = document.getElementById('season').value;
            const teamColor = document.getElementById('team-color').value;
            const playingStyle = document.getElementById('playing-style').value;
            const teamContext = document.getElementById('team-context').value;
            const customPrompt = document.getElementById('custom-prompt').value;

            // Save team identity + roster via roster-sync
            const rosterPayload = {
                team: name,
                season: season,
                teamColor: teamColor,
                playingStyle: playingStyle,
                teamContext: teamContext,
                customPrompt: customPrompt,
                focusInsights: [],
                roster: this.rosterData?.roster || []
            };

            const [syncRes, aiRes] = await Promise.all([
                fetch('/api/roster-sync', {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(rosterPayload)
                }),
                fetch('/api/ai-settings', {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ playingStyle, teamContext, customPrompt })
                })
            ]);

            if (syncRes.ok && aiRes.ok) {
                this.showNotification('Team settings saved successfully!', 'success');
            } else {
                throw new Error('Failed to save team settings');
            }
        } catch (error) {
            console.error('Error saving team settings:', error);
            this.showNotification('Error saving team settings', 'error');
        }
    }

    openPlayerModal(playerName = null) {
        const modal = document.getElementById('player-modal');
        const title = document.getElementById('modal-title');
        
        this.currentPlayer = playerName;
        
        if (playerName) {
            title.textContent = 'Edit Player';
            this.populatePlayerForm(playerName);
        } else {
            title.textContent = 'Add Player';
            this.clearPlayerForm();
        }
        
        modal.classList.add('show');
    }

    closePlayerModal() {
        const modal = document.getElementById('player-modal');
        modal.classList.remove('show');
        this.currentPlayer = null;
    }

    populatePlayerForm(playerName) {
        const player = this.rosterData?.roster.find(p => p.name === playerName);
        if (!player) return;
        
        document.getElementById('player-name').value = player.name || '';
        document.getElementById('player-number').value = player.number || '';
        document.getElementById('player-position').value = player.position || '';
        document.getElementById('player-grade').value = player.grade || '';
        document.getElementById('player-height').value = player.height || '';
        document.getElementById('player-role').value = player.role || '';
        document.getElementById('player-ai-context').value = player.notes || '';
    }

    clearPlayerForm() {
        document.getElementById('player-name').value = '';
        document.getElementById('player-number').value = '';
        document.getElementById('player-position').value = '';
        document.getElementById('player-grade').value = '';
        document.getElementById('player-height').value = '';
        document.getElementById('player-role').value = '';
        document.getElementById('player-ai-context').value = '';
    }

    async savePlayer() {
        try {
            const playerData = {
                name: document.getElementById('player-name').value.trim(),
                number: parseInt(document.getElementById('player-number').value) || null,
                position: document.getElementById('player-position').value,
                grade: document.getElementById('player-grade').value,
                height: document.getElementById('player-height').value.trim(),
                role: document.getElementById('player-role').value.trim(),
                notes: document.getElementById('player-ai-context').value.trim()
            };
            
            if (!playerData.name) {
                this.showNotification('Player name is required', 'error');
                return;
            }
            
            if (!playerData.number) {
                this.showNotification('Jersey number is required', 'error');
                return;
            }
            
            // Check for duplicate jersey numbers (except current player)
            if (this.rosterData?.roster) {
                const duplicate = this.rosterData.roster.find(p => 
                    p.number === playerData.number && p.name !== this.currentPlayer
                );
                if (duplicate) {
                    this.showNotification(`Jersey number ${playerData.number} is already used by ${duplicate.name}`, 'error');
                    return;
                }
            }
            
            let response;
            if (this.currentPlayer) {
                // Update existing player
                response = await fetch(`/api/player/${encodeURIComponent(this.currentPlayer)}`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify(playerData)
                });
            } else {
                // Add new player  
                response = await fetch(`/api/player/${encodeURIComponent(playerData.name)}`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify(playerData)
                });
            }
            
            if (response.ok) {
                this.showNotification(`Player ${this.currentPlayer ? 'updated' : 'added'} successfully!`, 'success');
                await this.loadRoster(); // Refresh roster table
                this.closePlayerModal();
            } else {
                const error = await response.json();
                throw new Error(error.error || 'Failed to save player');
            }
            
        } catch (error) {
            console.error('Error saving player:', error);
            this.showNotification(error.message || 'Error saving player', 'error');
        }
    }

    editPlayer(playerName) {
        this.openPlayerModal(playerName);
    }

    async deletePlayer(playerName) {
        if (!confirm(`Are you sure you want to delete ${playerName} from the roster?`)) {
            return;
        }
        
        try {
            const response = await fetch(`/api/roster/player/${encodeURIComponent(playerName)}`, {
                method: 'DELETE'
            });
            
            if (response.ok) {
                this.showNotification('Player deleted successfully!', 'success');
                await this.loadRoster(); // Refresh roster table
            } else {
                throw new Error('Failed to delete player');
            }
            
        } catch (error) {
            console.error('Error deleting player:', error);
            this.showNotification('Error deleting player', 'error');
        }
    }

    showNotification(message, type = 'info') {
        // Create notification element
        const notification = document.createElement('div');
        notification.className = `notification notification-${type}`;
        notification.textContent = message;
        
        // Style the notification
        notification.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            padding: 1rem 1.5rem;
            background: ${type === 'success' ? '#28a745' : type === 'error' ? '#dc3545' : '#007bff'};
            color: white;
            border-radius: 4px;
            box-shadow: 0 2px 8px rgba(0,0,0,0.2);
            z-index: 2000;
            max-width: 300px;
            font-weight: 600;
        `;
        
        document.body.appendChild(notification);
        
        // Auto-remove after 3 seconds
        setTimeout(() => {
            if (notification.parentNode) {
                notification.parentNode.removeChild(notification);
            }
        }, 3000);
    }
}

// Initialize settings manager when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    window.settingsManager = new SettingsManager();
});