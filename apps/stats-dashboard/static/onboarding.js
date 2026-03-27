// Onboarding wizard for Bench IQ
(function () {
  'use strict';

  const STEPS = 5;
  let currentStep = 0;
  let selectedColor = '#4f8cff';
  let playerRowCount = 0;

  // ── Step navigation ──────────────────────────────────────────────

  function showStep(n) {
    document.querySelectorAll('.ob-section').forEach((s, i) => {
      s.classList.toggle('visible', i === n);
    });
    document.querySelectorAll('.ob-step-dot').forEach((d, i) => {
      d.classList.toggle('active', i === n);
      d.classList.toggle('done', i < n);
    });
    const lbl = document.getElementById('step-label');
    if (lbl) lbl.textContent = `Step ${n + 1} of ${STEPS}`;
    currentStep = n;
  }

  window.obNext = function () { showStep(currentStep + 1); };
  window.obBack = function () { showStep(Math.max(0, currentStep - 1)); };

  window.obSkipRoster = function () { showStep(3); };

  // ── Color swatches ────────────────────────────────────────────────

  window.obSelectColor = function (el) {
    document.querySelectorAll('.ob-color-swatch').forEach(s => s.classList.remove('selected'));
    el.classList.add('selected');
    selectedColor = el.dataset.color;
    document.getElementById('ob-color-custom').value = selectedColor;
  };

  window.obCustomColor = function (el) {
    document.querySelectorAll('.ob-color-swatch').forEach(s => s.classList.remove('selected'));
    selectedColor = el.value;
  };

  // ── Step 1: Save Team ─────────────────────────────────────────────

  window.obSaveTeam = async function () {
    const nameEl = document.getElementById('ob-team-name');
    const seasonEl = document.getElementById('ob-season');
    const styleEl = document.getElementById('ob-playing-style');
    const status = document.getElementById('step1-status');
    const btn = document.getElementById('step1-next-btn');

    const name = nameEl.value.trim();
    if (!name) {
      status.textContent = 'Team name is required.';
      status.className = 'ob-status error';
      nameEl.focus();
      return;
    }

    status.textContent = 'Saving…';
    status.className = 'ob-status';
    btn.disabled = true;

    try {
      const res = await fetch('/api/team', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          season: seasonEl.value.trim() || undefined,
          teamColor: selectedColor,
          playingStyle: styleEl.value.trim() || undefined,
        }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        status.textContent = body.error || `Error ${res.status}`;
        status.className = 'ob-status error';
        btn.disabled = false;
        return;
      }

      status.textContent = '✓ Team saved';
      status.className = 'ob-status success';
      showStep(2);
    } catch (err) {
      status.textContent = 'Could not reach the stats server. Is it running?';
      status.className = 'ob-status error';
    } finally {
      btn.disabled = false;
    }
  };

  // ── Step 2: Roster ────────────────────────────────────────────────

  window.obAddPlayerRow = function () {
    const tbody = document.getElementById('ob-player-rows');
    const idx = playerRowCount++;
    const tr = document.createElement('tr');
    tr.dataset.idx = idx;
    tr.innerHTML = `
      <td><input type="number" placeholder="#" min="0" max="99" class="ob-num-inp" id="ob-num-${idx}"></td>
      <td><input type="text" placeholder="Full name" class="ob-name-inp" id="ob-name-${idx}"></td>
      <td><input type="text" placeholder="PG" maxlength="4" class="ob-pos-inp" id="ob-pos-${idx}" style="width:52px"></td>
      <td><input type="text" placeholder="11" maxlength="2" class="ob-grade-inp" id="ob-grade-${idx}" style="width:48px"></td>
      <td><button class="ob-player-rm" onclick="this.closest('tr').remove()" aria-label="Remove player">✕</button></td>
    `;
    tbody.appendChild(tr);
    tr.querySelector('.ob-name-inp').focus();
  };

  window.obSavePlayers = async function () {
    const status = document.getElementById('step2-status');
    const rows = document.querySelectorAll('#ob-player-rows tr');
    const players = [];

    for (const row of rows) {
      const numEl = row.querySelector('.ob-num-inp');
      const nameEl = row.querySelector('.ob-name-inp');
      const posEl = row.querySelector('.ob-pos-inp');
      const gradeEl = row.querySelector('.ob-grade-inp');
      const name = nameEl ? nameEl.value.trim() : '';
      if (!name) continue;
      players.push({
        name,
        number: numEl ? numEl.value.trim() : '',
        position: posEl ? posEl.value.trim() : '',
        grade: gradeEl ? gradeEl.value.trim() : '',
      });
    }

    if (players.length === 0) {
      // Treat same as skip
      showStep(3);
      return;
    }

    status.textContent = `Saving ${players.length} player${players.length !== 1 ? 's' : ''}…`;
    status.className = 'ob-status';

    let saved = 0;
    for (const p of players) {
      try {
        const res = await fetch(`/api/player/${encodeURIComponent(p.name)}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(p),
        });
        if (res.ok) saved++;
      } catch {
        // continue with remaining players
      }
    }

    if (saved > 0) {
      // Sync to realtime API
      try { await fetch('/api/roster-sync', { method: 'PUT' }); } catch { /* non-fatal */ }
    }

    status.textContent = saved > 0 ? `✓ ${saved} player${saved !== 1 ? 's' : ''} saved` : 'Could not save players. Check server connection.';
    status.className = saved > 0 ? 'ob-status success' : 'ob-status error';

    if (saved > 0) {
      setTimeout(() => showStep(3), 500);
    }
  };

  // ── Done screen URL setup ─────────────────────────────────────────

  function setupDoneUrls() {
    const host = window.location.hostname || 'localhost';
    const statsUrl = `${window.location.protocol}//${host}:5000`;
    const operatorUrl = `${window.location.protocol}//${host}:5174`;
    const coachUrl = `${window.location.protocol}//${host}:5173`;

    const statsEl = document.getElementById('done-stats-url');
    const opEl = document.getElementById('done-operator-url');
    const coachEl = document.getElementById('done-coach-url');
    const opLink = document.getElementById('done-operator-link');
    const coachLink = document.getElementById('done-coach-link');

    if (statsEl) statsEl.textContent = statsUrl;
    if (opEl) opEl.textContent = operatorUrl;
    if (coachEl) coachEl.textContent = coachUrl;
    if (opLink) opLink.href = operatorUrl;
    if (coachLink) coachLink.href = coachUrl;
  }

  // ── Tour start redirect ───────────────────────────────────────────
  // Clicking "Start Tutorial" on done screen redirects to the main dashboard
  // with a ?tour=1 flag that tour.js picks up.
  const tourLink = document.getElementById('done-stats-tour');
  if (tourLink) {
    tourLink.href = '/?tour=1';
  }

  // ── Init ──────────────────────────────────────────────────────────
  showStep(0);
  setupDoneUrls();
  // Add one empty player row so the roster step isn't blank
  obAddPlayerRow();

})();
