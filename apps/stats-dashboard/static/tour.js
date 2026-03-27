// Guided tour overlay for Bench IQ Stats Dashboard
(function () {
  'use strict';

  const TOUR_STEPS = [
    {
      target: '[data-page="dashboard"]',
      title: 'Dashboard',
      text: 'Your season overview: team performance trends, scoring averages, and win/loss summary live here.',
      position: 'bottom',
    },
    {
      target: '[data-page="games"]',
      title: 'Games',
      text: 'Browse individual game logs. Select any game to see player-level box scores and game-flow data.',
      position: 'bottom',
    },
    {
      target: '[data-page="players"]',
      title: 'Players',
      text: 'Season stats for every player on the roster: points, assists, rebounds, efficiency ratings, and more.',
      position: 'bottom',
    },
    {
      target: '[data-page="trends"]',
      title: 'Trends',
      text: 'Track how the team is improving (or struggling) over the course of the season with rolling-average charts.',
      position: 'bottom',
    },
    {
      target: '[data-page="ai-insights"]',
      title: 'AI Insights',
      text: 'GPT-powered analysis of your team\'s data. Ask custom questions or run pre-built scouting reports.',
      position: 'bottom',
    },
    {
      target: '[data-page="settings"]',
      title: 'Settings',
      text: 'Set your team name, colors, roster, and AI preferences. You can also re-run the setup wizard here.',
      position: 'bottom',
    },
    {
      target: '.tour-help-btn',
      title: 'Need Help?',
      text: 'Click the ? button any time to restart this tour.',
      position: 'bottom',
    },
  ];

  let currentTourStep = 0;
  let overlay = null;
  let tooltip = null;
  let highlightBox = null;

  // ── Public API ────────────────────────────────────────────────────

  window.tourStart = function () {
    currentTourStep = 0;
    ensureOverlay();
    showTourStep(0);
  };

  window.tourNext = function () {
    if (currentTourStep < TOUR_STEPS.length - 1) {
      showTourStep(currentTourStep + 1);
    } else {
      tourEnd();
    }
  };

  window.tourPrev = function () {
    if (currentTourStep > 0) {
      showTourStep(currentTourStep - 1);
    }
  };

  window.tourEnd = function () {
    if (overlay) {
      overlay.remove();
      overlay = null;
      tooltip = null;
      highlightBox = null;
    }
  };

  // ── DOM construction ──────────────────────────────────────────────

  function ensureOverlay() {
    if (overlay) { overlay.remove(); }

    overlay = document.createElement('div');
    overlay.id = 'tour-overlay';
    overlay.style.cssText = `
      position:fixed;inset:0;z-index:9998;pointer-events:none;
    `;

    // Dark tinted backdrop via four rects rendered in CSS clip-path — simpler:
    // just a semi-transparent full-screen div, except where the highlight is.
    // We'll use a backdrop div + a cut-out trick via box-shadow on the highlight.
    const backdrop = document.createElement('div');
    backdrop.id = 'tour-backdrop';
    backdrop.style.cssText = `
      position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:9998;pointer-events:auto;
    `;
    backdrop.addEventListener('click', tourEnd);

    highlightBox = document.createElement('div');
    highlightBox.id = 'tour-highlight';
    highlightBox.style.cssText = `
      position:fixed;z-index:9999;border-radius:6px;
      box-shadow:0 0 0 4px #4f8cff, 0 0 0 9999px rgba(0,0,0,.55);
      pointer-events:none;transition:all .25s;
    `;

    tooltip = document.createElement('div');
    tooltip.id = 'tour-tooltip';
    tooltip.style.cssText = `
      position:fixed;z-index:10000;background:#1a1a2e;color:#e2e8f0;
      border:1.5px solid #4f8cff;border-radius:10px;padding:16px 18px;
      width:280px;max-width:90vw;box-shadow:0 8px 32px rgba(0,0,0,.5);
      font-family:inherit;pointer-events:auto;
    `;

    document.body.appendChild(backdrop);
    document.body.appendChild(highlightBox);
    document.body.appendChild(tooltip);
  }

  function showTourStep(idx) {
    currentTourStep = idx;
    const step = TOUR_STEPS[idx];
    const target = document.querySelector(step.target);

    if (!target) {
      // Skip missing targets
      if (idx < TOUR_STEPS.length - 1) showTourStep(idx + 1);
      else tourEnd();
      return;
    }

    // Position highlight
    const rect = target.getBoundingClientRect();
    const pad = 6;
    highlightBox.style.top = (rect.top - pad) + 'px';
    highlightBox.style.left = (rect.left - pad) + 'px';
    highlightBox.style.width = (rect.width + pad * 2) + 'px';
    highlightBox.style.height = (rect.height + pad * 2) + 'px';

    // Build tooltip HTML
    const isLast = idx === TOUR_STEPS.length - 1;
    tooltip.innerHTML = `
      <div style="font-size:11px;color:#4f8cff;text-transform:uppercase;letter-spacing:1px;margin-bottom:4px">
        Step ${idx + 1} of ${TOUR_STEPS.length}
      </div>
      <div style="font-weight:700;font-size:15px;margin-bottom:8px">${step.title}</div>
      <div style="font-size:13px;line-height:1.55;color:#a0aec0">${step.text}</div>
      <div style="display:flex;justify-content:space-between;margin-top:14px;gap:8px">
        <button onclick="tourEnd()" style="flex:0 0 auto;background:transparent;border:1px solid #4a5568;color:#a0aec0;padding:6px 12px;border-radius:6px;cursor:pointer;font-size:12px">
          Skip
        </button>
        <div style="display:flex;gap:6px">
          ${idx > 0 ? `<button onclick="tourPrev()" style="background:transparent;border:1.5px solid #4f8cff;color:#4f8cff;padding:6px 14px;border-radius:6px;cursor:pointer;font-size:13px">Back</button>` : ''}
          <button onclick="tourNext()" style="background:#4f8cff;border:none;color:#fff;padding:6px 14px;border-radius:6px;cursor:pointer;font-size:13px;font-weight:600">
            ${isLast ? 'Done' : 'Next'}
          </button>
        </div>
      </div>
    `;

    // Position tooltip below or above the target
    positionTooltip(rect, step.position || 'bottom');
  }

  function positionTooltip(anchorRect, preferred) {
    const tt = tooltip;
    tt.style.visibility = 'hidden';
    tt.style.display = 'block';
    const tooltipH = tt.offsetHeight || 160;
    const tooltipW = tt.offsetWidth || 280;
    const pad = 12;
    const vp = { w: window.innerWidth, h: window.innerHeight };

    let top, left;

    if (preferred === 'bottom' && anchorRect.bottom + tooltipH + pad < vp.h) {
      top = anchorRect.bottom + pad;
    } else {
      top = Math.max(pad, anchorRect.top - tooltipH - pad);
    }

    left = anchorRect.left + anchorRect.width / 2 - tooltipW / 2;
    left = Math.max(pad, Math.min(left, vp.w - tooltipW - pad));

    tt.style.top = top + 'px';
    tt.style.left = left + 'px';
    tt.style.visibility = 'visible';
  }

  // ── Keyboard support ──────────────────────────────────────────────

  document.addEventListener('keydown', function (e) {
    if (!tooltip) return;
    if (e.key === 'ArrowRight' || e.key === 'Enter') { e.preventDefault(); tourNext(); }
    if (e.key === 'ArrowLeft') { e.preventDefault(); tourPrev(); }
    if (e.key === 'Escape') { tourEnd(); }
  });

})();
