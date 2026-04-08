import { useEffect, useRef, useState, type CSSProperties } from "react";

interface MarketingPageProps {
  onNavigate: (path: string) => void;
  isAuthenticated?: boolean;
}

// ---- Static content ----

const FEATURES = [
  { icon: "⚡", eyebrow: "Real-Time",        title: "Stats as they happen",       desc: "See score, possessions, and momentum update in real time. No more clipboard delay." },
  { icon: "📱", eyebrow: "iPad Operator",    title: "One-tap sideline entry",      desc: "Your scorekeeper enters stats on an iPad. The coach dashboard updates in under a second." },
  { icon: "📊", eyebrow: "Season Analytics", title: "Trends across every game",    desc: "Win/loss record, FG% over time, point margin charts, and shooting splits — all in one view." },
  { icon: "👤", eyebrow: "Player Insights",  title: "Per-player breakdowns",       desc: "Game logs, PPG trends, and side-by-side comparisons to sharpen your rotation decisions." },
  { icon: "🤖", eyebrow: "AI Insights",      title: "Automated observations",      desc: "Spot momentum shifts, pace changes, and efficiency drops without crunching numbers manually." },
  { icon: "🔐", eyebrow: "Secure Access",    title: "One account, one team",       desc: "Your roster, games, and insights belong to your login. Team data never crosses accounts." },
];

const STEPS = [
  { n: "01", title: "Set up your roster",   desc: "Add players, numbers, and positions. Takes about 5 minutes and you can edit any time." },
  { n: "02", title: "Pair on game day",     desc: "Share a 6-digit code with the scorekeeper. They open the iPad app and you're connected — no cables, no accounts for them." },
  { n: "03", title: "Coach with live data", desc: "Stats flow to your dashboard as the game unfolds. Review trends between quarters, at halftime, and after the final buzzer." },
];

const FAQS = [
  { q: "How does the live tracking actually work?",   a: "The scorekeeper uses a separate iPad app to enter stats. Each tap syncs to the server and fans out to your coach dashboard in under a second via WebSocket. Events are queued offline and replayed if the connection drops." },
  { q: "Do I need a special device?",                 a: "Any modern iPad or tablet works for stat entry. The coach dashboard runs in any browser — laptop, tablet, or phone. No App Store installs required for the coach." },
  { q: "Is there a free demo?",                       a: 'Yes — the demo is free, public, and loaded with realistic sample data from a full season. No account needed. Click "Try the Demo" on this page.' },
  { q: "How do I get my roster into the system?",     a: "The Setup page walks you through adding players, numbers, and positions. You can also bulk-import from a JSON file." },
  { q: "Does it work for JV or freshman teams?",      a: "Absolutely. The system is team-agnostic — set up any roster and track any level of play with the same dashboard." },
];

// ---- Live demo widget ----

const DEMO_EVENTS = [
  { msg: "+2 Home #1",                vc: 2, opp: 0 },
  { msg: "+3 Home #4 (3PT)",          vc: 3, opp: 0 },
  { msg: "+2 Home #3",                vc: 2, opp: 0 },
  { msg: "+1 Home #1 (FT)",           vc: 1, opp: 0 },
  { msg: "Turnover -> Away",          vc: 0, opp: 0 },
  { msg: "+2 Away #24",               vc: 0, opp: 2 },
  { msg: "+3 Away wing",              vc: 0, opp: 3 },
  { msg: "Timeout - Home",            vc: 0, opp: 0 },
  { msg: "+2 Home #2",                vc: 2, opp: 0 },
  { msg: "Foul -> Away (bonus)",      vc: 0, opp: 0 },
  { msg: "+2 Home #5",                vc: 2, opp: 0 },
];

const DEMO_BOX = [
  { name: "Player #1",   pts: 24, reb: 3, ast: 6 },
  { name: "Player #3",   pts: 14, reb: 8, ast: 2 },
  { name: "Player #4",   pts: 10, reb: 6, ast: 1 },
  { name: "Player #2",   pts: 6,  reb: 2, ast: 4 },
  { name: "Player #5",   pts: 4,  reb: 1, ast: 3 },
];

function LiveDemoWidget() {
  const [seconds, setSeconds] = useState(123);
  const [vcScore, setVcScore] = useState(58);
  const [oppScore, setOppScore] = useState(54);
  const [evtIdx, setEvtIdx] = useState(0);
  const [momentum, setMomentum] = useState(14);
  const [shotsInRun, setShotsInRun] = useState(3);
  const [possession, setPossession] = useState<"HOME" | "AWAY">("HOME");
  const [evtVisible, setEvtVisible] = useState(false);
  const tick = useRef(0);

  useEffect(() => {
    const id = setInterval(() => {
      tick.current++;
      setSeconds((prev) => (prev > 0 ? prev - 1 : 480));
      if (tick.current % 4 === 0) {
        const evt = DEMO_EVENTS[evtIdx % DEMO_EVENTS.length];
        setVcScore((p) => p + evt.vc);
        setOppScore((p) => p + evt.opp);
        setMomentum((m) => {
          const shift = evt.vc > evt.opp ? 8 : evt.opp > evt.vc ? -9 : 3;
          return Math.max(-42, Math.min(42, m + shift));
        });
        setShotsInRun((r) => (evt.vc > 0 ? Math.min(7, r + 1) : Math.max(0, r - 1)));
        setPossession((team) => (team === "HOME" ? "AWAY" : "HOME"));
        setEvtIdx((e) => e + 1);
        setEvtVisible(true);
        setTimeout(() => setEvtVisible(false), 2600);
      }
    }, 1000);
    return () => clearInterval(id);
  }, [evtIdx]);

  const mins = Math.floor(seconds / 60);
  const secs = String(seconds % 60).padStart(2, "0");
  const currentEvt = DEMO_EVENTS[Math.max(0, evtIdx - 1) % DEMO_EVENTS.length];
  const momentumPct = Math.max(0, Math.min(100, 50 + momentum));

  return (
    <div className="mkt-demo-widget">
      <div className="mkt-demo-header">
        <span className="mkt-live-dot" aria-hidden="true" />
        <span className="mkt-live-label">LIVE</span>
        <span className="mkt-demo-clock">Q4 - {mins}:{secs}</span>
        <span className="mkt-demo-sample-tag">Sample data</span>
      </div>
      <div className="mkt-demo-statebar">
        <span className={`mkt-possession-tag ${possession === "HOME" ? "is-home" : "is-away"}`}>
          Possession: {possession}
        </span>
        <span className="mkt-run-tag">Run: {shotsInRun}-0</span>
      </div>
      <div className="mkt-demo-scoreboard">
        <div className="mkt-demo-team mkt-demo-team-home">
          <span className="mkt-demo-team-abbr">HOME</span>
          <span className="mkt-demo-team-name">Home Team</span>
          <strong className="mkt-demo-score mkt-demo-score-home">{vcScore}</strong>
        </div>
        <div className="mkt-demo-sep">-</div>
        <div className="mkt-demo-team mkt-demo-team-away">
          <strong className="mkt-demo-score">{oppScore}</strong>
          <span className="mkt-demo-team-name">Away Team</span>
          <span className="mkt-demo-team-abbr">AWAY</span>
        </div>
      </div>
      <div className="mkt-demo-momentum" role="img" aria-label={`Momentum ${momentum >= 0 ? "Home Team" : "Away Team"}`}>
        <div className="mkt-demo-momentum-head">
          <span>Momentum</span>
          <strong>{momentum >= 0 ? `HOME +${momentum}` : `AWAY +${Math.abs(momentum)}`}</strong>
        </div>
        <div className="mkt-demo-momentum-track">
          <span className="mkt-demo-momentum-fill" style={{ width: `${momentumPct}%` }} />
        </div>
      </div>
      <div
        className="mkt-demo-event-row"
        style={{ opacity: evtVisible ? 1 : 0, transition: "opacity 0.35s" }}
        aria-live="polite"
      >
        <span className="mkt-demo-event-dot" aria-hidden="true" />
        <span className="mkt-demo-event-text">{currentEvt.msg}</span>
      </div>
      <div className="mkt-demo-insight">Insight: Player #1 is 4/5 over the last 3:00.</div>
      <div className="mkt-demo-recommendation">Recommendation: Run through #1 next two possessions.</div>
      <div className="mkt-demo-box">
        <div className="mkt-demo-box-head">
          <span>Player</span><span>PTS</span><span>REB</span><span>AST</span>
        </div>
        {DEMO_BOX.map((p) => (
          <div key={p.name} className="mkt-demo-box-row">
            <span>{p.name}</span>
            <span>{p.pts}</span>
            <span>{p.reb}</span>
            <span>{p.ast}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---- Public demo dashboard (no auth required) ----

const DEMO_GAMES = [
  { opponent: "Opponent A",    loc: "home", result: "W", vc: 62, opp: 48, date: "Feb 14" },
  { opponent: "Opponent B",    loc: "away", result: "W", vc: 55, opp: 51, date: "Feb 11" },
  { opponent: "Opponent C",    loc: "home", result: "L", vc: 44, opp: 58, date: "Feb 7"  },
  { opponent: "Opponent D",    loc: "away", result: "W", vc: 67, opp: 43, date: "Feb 4"  },
  { opponent: "Opponent E",    loc: "home", result: "L", vc: 51, opp: 64, date: "Jan 31" },
];

const DEMO_PLAYERS = [
  { name: "Player #1",    num: "1",  ppg: 18.4, rpg: 4.2, apg: 5.8, fg: 44.1 },
  { name: "Player #3",    num: "3",  ppg: 12.3, rpg: 6.8, apg: 1.9, fg: 41.3 },
  { name: "Player #4",    num: "4",  ppg: 9.8,  rpg: 5.2, apg: 2.1, fg: 38.7 },
  { name: "Player #2",    num: "2",  ppg: 7.2,  rpg: 3.1, apg: 3.4, fg: 36.2 },
  { name: "Player #5",    num: "5",  ppg: 6.4,  rpg: 2.8, apg: 2.1, fg: 35.1 },
  { name: "Player #15",   num: "15", ppg: 2.8,  rpg: 4.1, apg: 0.8, fg: 51.2 },
];

const TH_ST: CSSProperties = {
  padding: "0.5rem 0.65rem", fontSize: "0.67rem", fontWeight: 700,
  textTransform: "uppercase", letterSpacing: "0.1em", color: "rgba(232,234,240,0.4)",
};

export function DemoPage({ onNavigate }: { onNavigate: (path: string) => void }) {
  return (
    <div style={{ minHeight: "100vh", background: "var(--bg)" }}>
      <div className="mkt-demo-banner">
        <span>Demo mode - sample team season data - read-only</span>
        <button type="button" className="mkt-btn mkt-btn-primary" onClick={() => onNavigate("/login")}>
          Sign In for Real Data -&gt;
        </button>
      </div>

      <header className="mkt-demo-page-nav">
        <button type="button" className="mkt-brand" onClick={() => onNavigate("/")} aria-label="Go to home page">
          <span style={{ fontSize: "0.9rem", color: "rgba(232,234,240,0.55)" }}>Home</span>
          <span className="mkt-brand-name">BTA Courtside</span>
        </button>
        <span className="mkt-demo-page-title">Demo Dashboard</span>
        <div className="mkt-demo-page-actions">
          <button type="button" className="mkt-btn mkt-btn-ghost" onClick={() => onNavigate("/")}>Home</button>
          <button type="button" className="mkt-btn mkt-btn-primary" onClick={() => onNavigate("/login")}>Sign In</button>
        </div>
      </header>

      <div className="stats-page">
        <section className="stats-page-hero">
          <div>
            <h1>Sample Team</h1>
            <p className="stats-page-subtitle">2025-26 Season - Sample Data</p>
          </div>
          <span className="stats-page-status">Demo - read-only</span>
        </section>

        <section className="stats-metric-grid">
          {[
            { label: "Record",     val: "12-6",  detail: "Win % 67%",             accent: true },
            { label: "PPG",        val: "58.3",  detail: "Opponent PPG 46.2" },
            { label: "FG%",        val: "43.2%", detail: "3PT 32.1% - FT 72.1%" },
            { label: "Rebounding", val: "28.4",  detail: "Boards per game" },
            { label: "Assists",    val: "14.2",  detail: "TO avg 10.8" },
            { label: "Def Events", val: "9.9",   detail: "STL 7.1 - BLK 2.8" },
          ].map((c) => (
            <div key={c.label} className={`stats-metric-card${c.accent ? " accent-blue" : ""}`}>
              <span className="stats-metric-label">{c.label}</span>
              <strong className="stats-metric-value">{c.val}</strong>
              <span className="stats-metric-detail">{c.detail}</span>
            </div>
          ))}
        </section>

        <section className="stats-page-grid two-column">
          <section className="stats-page-card">
            <div className="stats-page-card-head">
              <h3>Recent Games</h3>
              <span className="stats-page-status">Last 5</span>
            </div>
            <div className="stats-game-list">
              {DEMO_GAMES.map((g) => {
                const margin = g.vc - g.opp;
                return (
                  <div key={g.opponent + g.date} className="stats-game-row">
                    <div>
                      <strong>{g.loc === "away" ? "@" : "vs"} {g.opponent}</strong>
                      <span>{g.date}</span>
                    </div>
                    <div className="stats-game-score-block">
                      <strong>{g.vc}-{g.opp}</strong>
                      <span style={{ fontSize: "0.78rem", color: margin > 0 ? "#86efac" : "#fca5a5" }}>
                        {g.result} - {margin > 0 ? `+${margin}` : margin}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          <section className="stats-page-card">
            <div className="stats-page-card-head">
              <h3>Top Scorers</h3>
              <span className="stats-page-status">Season PPG</span>
            </div>
            <div className="stats-leader-list">
              {[...DEMO_PLAYERS].sort((a, b) => b.ppg - a.ppg).map((p) => (
                <div key={p.name} className="stats-leader-row">
                  <span>#{p.num} {p.name}</span>
                  <strong>{p.ppg}</strong>
                </div>
              ))}
            </div>
          </section>
        </section>

        <section className="stats-page-card" style={{ marginBottom: "2rem" }}>
          <div className="stats-page-card-head">
            <h3>Player Season Averages</h3>
            <span className="stats-page-status">Per game</span>
          </div>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.88rem" }}>
              <thead>
                <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
                  <th style={{ ...TH_ST, textAlign: "left" }}>#</th>
                  <th style={{ ...TH_ST, textAlign: "left" }}>Player</th>
                  <th style={{ ...TH_ST, textAlign: "center" }}>PPG</th>
                  <th style={{ ...TH_ST, textAlign: "center" }}>RPG</th>
                  <th style={{ ...TH_ST, textAlign: "center" }}>APG</th>
                  <th style={{ ...TH_ST, textAlign: "center" }}>FG%</th>
                </tr>
              </thead>
              <tbody>
                {DEMO_PLAYERS.map((p, i) => (
                  <tr
                    key={p.name}
                    style={{ borderBottom: i < DEMO_PLAYERS.length - 1 ? "1px solid rgba(255,255,255,0.05)" : "none" }}
                  >
                    <td style={{ padding: "0.55rem 0.65rem", color: "rgba(232,234,240,0.4)", fontSize: "0.82rem" }}>{p.num}</td>
                    <td style={{ padding: "0.55rem 0.65rem", fontWeight: 600, color: "#e8eaf0" }}>{p.name}</td>
                    <td style={{ padding: "0.55rem 0.65rem", textAlign: "center", fontWeight: 700, color: i === 0 ? "#a8c5ff" : "#e8eaf0" }}>{p.ppg}</td>
                    <td style={{ padding: "0.55rem 0.65rem", textAlign: "center", color: "#e8eaf0" }}>{p.rpg}</td>
                    <td style={{ padding: "0.55rem 0.65rem", textAlign: "center", color: "#e8eaf0" }}>{p.apg}</td>
                    <td style={{ padding: "0.55rem 0.65rem", textAlign: "center", color: "#e8eaf0" }}>{p.fg}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <div className="mkt-demo-page-cta">
          <div>
            <h2>Want this for your team?</h2>
            <p>Sign in to set up your roster, connect the iPad operator, and track games live.</p>
          </div>
          <button
            type="button"
            className="mkt-btn mkt-btn-primary mkt-btn-lg"
            onClick={() => onNavigate("/login")}
          >
            Sign In to Get Started
          </button>
        </div>
      </div>
    </div>
  );
}

// ---- Main marketing page ----

export function MarketingPage({ onNavigate, isAuthenticated = false }: MarketingPageProps) {
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  return (
    <div className="mkt-page">
      <header className="mkt-nav">
        <div className="mkt-nav-inner">
          <button type="button" className="mkt-brand" onClick={() => onNavigate("/")}>
            <span className="mkt-brand-icon">🏀</span>
            <span className="mkt-brand-name">BTA Courtside</span>
          </button>
          <nav className="mkt-nav-links" aria-label="Site navigation">
            <a href="#features">Features</a>
            <button type="button" onClick={() => onNavigate("/demo")}>Demo</button>
          </nav>
          <div className="mkt-nav-actions">
            <button type="button" className="mkt-btn mkt-btn-subtle" onClick={() => onNavigate("/login")}>Coach Login</button>
            <button type="button" className="mkt-btn mkt-btn-primary" onClick={() => onNavigate("/demo")}>Start Live Demo</button>
          </div>
        </div>
      </header>

      <main>
        {/* Hero */}
        <section className="mkt-hero" aria-label="Hero">
          <div className="mkt-hero-inner">
            <div className="mkt-hero-copy">
              <span className="mkt-badge">Courtside Control System</span>
              <h1 className="mkt-h1">
                Win the next possession before it starts.
                <span className="mkt-gradient-text">BTA Courtside runs at game speed.</span>
              </h1>
              <p className="mkt-hero-sub">
                Live scoreflow, momentum tracking, and rotation signals in one command surface, built for decisions made in ten seconds or less.
              </p>
              <div className="mkt-hero-rails" aria-hidden="true">
                <span className="mkt-hero-rail">Possession pressure</span>
                <span className="mkt-hero-rail">Shot-quality trend</span>
                <span className="mkt-hero-rail">Bench readiness</span>
              </div>
              <div className="mkt-hero-actions">
                <button type="button" className="mkt-btn mkt-btn-primary mkt-btn-lg" onClick={() => onNavigate("/demo")}>
                  Open Live Command View
                </button>
                <button
                  type="button"
                  className="mkt-btn mkt-btn-subtle mkt-btn-lg"
                  onClick={() => onNavigate(isAuthenticated ? "/live" : "/login")}
                >
                  {isAuthenticated ? "Enter Dashboard" : "Coach Login"}
                </button>
              </div>
              <div className="mkt-trust-row">
                {["Realtime possession map", "Live player impact", "Sideline resilient sync", "Sub-second updates"].map((p) => (
                  <span key={p} className="mkt-trust-pill">{p}</span>
                ))}
              </div>
            </div>
            <div className="mkt-hero-demo">
              <LiveDemoWidget />
            </div>
          </div>
        </section>

        {/* Numbers bar */}
        <section className="mkt-numbers">
          <div className="mkt-numbers-inner">
            {[
              { val: "< 1s",   label: "Updates in under 1 second" },
              { val: "Auto",   label: "Tracks every key stat live" },
              { val: "2 sec",  label: "Connects sideline devices fast" },
              { val: "Offline",label: "Built for dead-gym WiFi" },
            ].map((n) => (
              <div key={n.label} className="mkt-number-item">
                <strong>{n.val}</strong>
                <span>{n.label}</span>
              </div>
            ))}
          </div>
        </section>

        {/* Features */}
        <section id="features" className="mkt-section">
          <div className="mkt-section-inner">
            <div className="mkt-section-head">
              <span className="mkt-eyebrow">Everything in one place</span>
              <h2>A better way to run the bench</h2>
              <p className="mkt-section-sub">One connected system for live stats, season trends, and smart coaching decisions.</p>
            </div>
            <div className="mkt-feature-grid">
              {FEATURES.map((f) => (
                <article key={f.title} className="mkt-feature-card">
                  <div className="mkt-feature-icon" aria-hidden="true">{f.icon}</div>
                  <span className="mkt-eyebrow">{f.eyebrow}</span>
                  <h3>{f.title}</h3>
                  <p>{f.desc}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        {/* How it works */}
        <section id="how-it-works" className="mkt-section mkt-section-alt">
          <div className="mkt-section-inner">
            <div className="mkt-section-head">
              <span className="mkt-eyebrow">Simple setup</span>
              <h2>Up and running in minutes</h2>
              <p className="mkt-section-sub">No hardware to install. No complex onboarding. Just a browser and an iPad.</p>
            </div>
            <div className="mkt-steps">
              {STEPS.map((s) => (
                <div key={s.n} className="mkt-step">
                  <div className="mkt-step-num">{s.n}</div>
                  <h3>{s.title}</h3>
                  <p>{s.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Demo CTA band */}
        <div className="mkt-demo-cta">
          <div className="mkt-demo-cta-inner">
            <div>
              <h2>See the full dashboard for yourself</h2>
              <p>The demo is free, public, and loaded with realistic season data. No account needed.</p>
            </div>
            <button type="button" className="mkt-btn mkt-btn-primary mkt-btn-lg" onClick={() => onNavigate("/demo")}>
              Open Demo Dashboard →
            </button>
          </div>
        </div>

        {/* FAQ */}
        <section id="faq" className="mkt-section">
          <div className="mkt-section-inner mkt-faq-shell">
            <div className="mkt-section-head">
              <span className="mkt-eyebrow">Questions & answers</span>
              <h2>Common questions</h2>
              <p className="mkt-section-sub">Everything coaches ask before their first game.</p>
            </div>
            <div className="mkt-faq-list">
              {FAQS.map((faq, i) => (
                <div key={i} className={`mkt-faq-item${openFaq === i ? " mkt-faq-open" : ""}`}>
                  <button
                    type="button"
                    className="mkt-faq-question"
                    onClick={() => setOpenFaq(openFaq === i ? null : i)}
                    aria-expanded={openFaq === i}
                  >
                    <span>{faq.q}</span>
                    <span className="mkt-faq-chevron" aria-hidden="true">{openFaq === i ? "−" : "+"}</span>
                  </button>
                  {openFaq === i && (
                    <div className="mkt-faq-answer"><p>{faq.a}</p></div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Final CTA */}
        <section className="mkt-final-cta">
          <div className="mkt-final-cta-inner">
            <h2>Ready to coach smarter?</h2>
            <p>Start with the free demo, or sign in if you already have an account.</p>
            <div className="mkt-hero-actions">
              <button type="button" className="mkt-btn mkt-btn-primary mkt-btn-lg" onClick={() => onNavigate("/demo")}>
                Try Demo — free
              </button>
              <button type="button" className="mkt-btn mkt-btn-ghost mkt-btn-lg" onClick={() => onNavigate("/login")}>
                Sign In
              </button>
            </div>
          </div>
        </section>
      </main>

      <footer className="mkt-footer">
        <div className="mkt-footer-inner">
          <div className="mkt-footer-brand">
            <span>🏀 BTA Courtside</span>
            <span className="mkt-footer-tagline">Built for coaches. Runs at game speed.</span>
          </div>
          <nav className="mkt-footer-links">
            <button type="button" onClick={() => onNavigate("/demo")}>Demo</button>
            <button type="button" onClick={() => onNavigate("/login")}>Sign In</button>
          </nav>
        </div>
      </footer>
    </div>
  );
}
