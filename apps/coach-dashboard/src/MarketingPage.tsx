import { useEffect, useRef, useState } from "react";

interface MarketingPageProps {
  onNavigate: (path: string) => void;
  isAuthenticated?: boolean;
}

// ---- Static content ----

const FEATURES = [
  { icon: "🏀", eyebrow: "Live Bench", title: "See the game as it unfolds", desc: "Score, momentum, and key stat shifts update in real time while you coach." },
  { icon: "📱", eyebrow: "Operator Flow", title: "Simple iPad stat entry", desc: "One scorekeeper can capture events quickly without complex setup." },
  { icon: "📈", eyebrow: "Team Analytics", title: "Game and season trends", desc: "Review player impact, lineup outcomes, and team performance after every game." },
  { icon: "🔒", eyebrow: "School Scoped", title: "Reliable and secure", desc: "Data stays tied to your organization with role-based access controls." },
];

const STEPS = [
  { n: "01", title: "Set up once", desc: "Add your roster and confirm game context before tip-off." },
  { n: "02", title: "Pair the iPad", desc: "Operator joins with a short connection code on game day." },
  { n: "03", title: "Coach with clarity", desc: "Use live context in-game and review trends immediately after." },
];

const USE_CASES = [
  {
    title: "Varsity Staff",
    desc: "Make faster in-game decisions with live scoreflow and player impact signals.",
  },
  {
    title: "JV And Development",
    desc: "Track progress consistently across games and support player development plans.",
  },
  {
    title: "Program Leadership",
    desc: "Get one clear source of truth across games, staff, and seasons.",
  },
];

const GAME_MOMENTS = [
  {
    moment: "Q4, 1:32",
    problem: "Opponent starts a 6-0 run and your offense stalls.",
    signal: "Momentum flips and shot quality drops on two possessions.",
    call: "Run through #1 again before the defense resets.",
  },
  {
    moment: "Q3, 4:18",
    problem: "Two empty trips after a timeout.",
    signal: "Current lineup is -7 in the last 3:00.",
    call: "Swap to your high-assist unit for the next two possessions.",
  },
  {
    moment: "Q2, 0:49",
    problem: "Need a smart end-of-half possession.",
    signal: "Best efficiency is from left-wing action this quarter.",
    call: "Go back to the same set before halftime.",
  },
];

const TRUST_PROOF = [
  { value: "25+", label: "Games tracked this season" },
  { value: "<1s", label: "Coach dashboard update target" },
  { value: "1", label: "Operator can run game entry" },
  { value: "100%", label: "Events replay when reconnecting" },
];

const POSITIONING = [
  {
    title: "Post-game tools",
    points: [
      "Great for film and breakdown after the final buzzer",
      "Explains what happened",
      "Not built for live sideline decisions",
    ],
  },
  {
    title: "BTA during the game",
    points: [
      "Built for active possessions, runs, and substitutions",
      "Shows what to do next",
      "Designed for live coaching decisions in real time",
    ],
  },
];

const FAQS = [
  { q: "How does live sync work during games?", a: "The operator logs events on an iPad and updates are broadcast to the coach dashboard in real time. If connectivity drops, queued events replay when service returns." },
  { q: "What devices are supported?", a: "The coach view runs in a modern browser. Stat entry is optimized for iPad, but any modern tablet browser works." },
  { q: "How do we get started?", a: "Start by signing in, creating your roster, and pairing your operator device before game time." },
  { q: "Is this only for varsity?", a: "No. Programs use it across varsity, JV, and development squads with the same operating model." },
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
            <button type="button" onClick={() => onNavigate("/features")}>Features</button>
            <button type="button" onClick={() => onNavigate("/about")}>About</button>
            <button type="button" onClick={() => onNavigate("/support")}>Support</button>
          </nav>
          <div className="mkt-nav-actions">
            <button type="button" className="mkt-btn mkt-btn-subtle" onClick={() => onNavigate("/login")}>Coach Login</button>
            <button type="button" className="mkt-btn mkt-btn-primary" onClick={() => onNavigate(isAuthenticated ? "/live" : "/login")}>Get Started</button>
          </div>
        </div>
      </header>

      <main>
        {/* Hero */}
        <section className="mkt-hero" aria-label="Hero">
          <div className="mkt-hero-inner">
            <div className="mkt-hero-copy">
              <span className="mkt-badge">Built for high school basketball programs</span>
              <h1 className="mkt-h1">
                Make the right call before the next possession starts.
                <span className="mkt-gradient-text">See momentum shifts before they cost you the game.</span>
              </h1>
              <p className="mkt-hero-sub">
                BTA does not replace film review. It gives your bench staff live signals while the game is still being decided.
              </p>
              <p className="mkt-hero-moment">
                <strong>Q4, 1:32:</strong> your best player is 4/5 in the last 3:00, momentum is turning, and the next recommendation is to run that action again now.
              </p>
              <div className="mkt-hero-actions">
                <button type="button" className="mkt-btn mkt-btn-primary mkt-btn-lg" onClick={() => onNavigate(isAuthenticated ? "/live" : "/login")}>
                  Get Started
                </button>
                <button
                  type="button"
                  className="mkt-btn mkt-btn-subtle mkt-btn-lg"
                  onClick={() => onNavigate(isAuthenticated ? "/live" : "/login")}
                >
                  {isAuthenticated ? "Open Dashboard" : "Coach Login"}
                </button>
              </div>
              <div className="mkt-trust-row">
                {["During-game recommendations", "Possession-by-possession context", "Offline-safe sync", "Built for bench decisions"].map((p) => (
                  <span key={p} className="mkt-trust-pill">{p}</span>
                ))}
              </div>
            </div>
            <div className="mkt-hero-demo">
              <LiveDemoWidget />
            </div>
          </div>
        </section>

        <section className="mkt-proof-strip" aria-label="Trust and proof">
          <div className="mkt-proof-inner">
            {TRUST_PROOF.map((item) => (
              <article key={item.label} className="mkt-proof-item">
                <strong>{item.value}</strong>
                <span>{item.label}</span>
              </article>
            ))}
          </div>
        </section>

        <section className="mkt-spotlight" aria-label="Live product spotlight">
          <div className="mkt-spotlight-inner">
            <div className="mkt-section-head mkt-spotlight-head">
              <span className="mkt-eyebrow">The Product Moment</span>
              <h2>This is what your staff sees during a run</h2>
              <p className="mkt-section-sub">Live possession changes, momentum movement, and a recommendation while there is still time to act.</p>
            </div>
            <div className="mkt-spotlight-panel">
              <LiveDemoWidget />
            </div>
          </div>
        </section>

        {/* Numbers bar */}
        <section className="mkt-numbers">
          <div className="mkt-numbers-inner">
            {[
              { val: "Before", label: "Guessing who is hot" },
              { val: "After", label: "System shows who to run through" },
              { val: "Before", label: "Static stats after the game" },
              { val: "After", label: "Live context during possessions" },
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
              <h2>A cleaner workflow from tip-off to final review</h2>
              <p className="mkt-section-sub">Fewer screens, clearer signals, and consistent data your whole staff can trust.</p>
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

        <section className="mkt-section mkt-section-alt">
          <div className="mkt-section-inner">
            <div className="mkt-section-head">
              <span className="mkt-eyebrow">During A Real Game</span>
              <h2>From signal to call in seconds</h2>
              <p className="mkt-section-sub">Not generic dashboards. Concrete moments with immediate coaching actions.</p>
            </div>
            <div className="mkt-moment-grid">
              {GAME_MOMENTS.map((item) => (
                <article key={item.moment} className="mkt-moment-card">
                  <p className="mkt-moment-time">{item.moment}</p>
                  <h3>{item.problem}</h3>
                  <p>{item.signal}</p>
                  <p className="mkt-moment-call">Call: {item.call}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="mkt-section">
          <div className="mkt-section-inner">
            <div className="mkt-section-head">
              <span className="mkt-eyebrow">Positioning</span>
              <h2>This is not film review</h2>
              <p className="mkt-section-sub">Film tools matter after games. BTA is built for decisions before the next possession.</p>
            </div>
            <div className="mkt-compare-grid">
              {POSITIONING.map((column) => (
                <article key={column.title} className="mkt-compare-card">
                  <h3>{column.title}</h3>
                  <ul>
                    {column.points.map((point) => (
                      <li key={point}>{point}</li>
                    ))}
                  </ul>
                </article>
              ))}
            </div>
          </div>
        </section>

        {/* How it works */}
        <section id="how-it-works" className="mkt-section mkt-section-alt">
          <div className="mkt-section-inner">
            <div className="mkt-section-head">
              <span className="mkt-eyebrow">How it works</span>
              <h2>Simple on purpose</h2>
              <p className="mkt-section-sub">No extra hardware. No long training cycle. One reliable game-day routine.</p>
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

        <section className="mkt-section">
          <div className="mkt-section-inner">
            <div className="mkt-section-head">
              <span className="mkt-eyebrow">Who uses BTA</span>
              <h2>Built for programs, not just one team</h2>
              <p className="mkt-section-sub">From varsity game management to long-term development tracking.</p>
            </div>
            <div className="mkt-feature-grid">
              {USE_CASES.map((useCase) => (
                <article key={useCase.title} className="mkt-feature-card">
                  <h3>{useCase.title}</h3>
                  <p>{useCase.desc}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        {/* Demo CTA band */}
        <div className="mkt-demo-cta">
          <div className="mkt-demo-cta-inner">
            <div>
              <h2>Evaluate one game-day decision in under 3 minutes</h2>
              <p>Sign in, pair your operator, and watch recommendations surface during live play.</p>
            </div>
            <button type="button" className="mkt-btn mkt-btn-primary mkt-btn-lg" onClick={() => onNavigate(isAuthenticated ? "/live" : "/login")}>
              Start Now
            </button>
          </div>
        </div>

        {/* FAQ */}
        <section id="faq" className="mkt-section">
          <div className="mkt-section-inner mkt-faq-shell">
            <div className="mkt-section-head">
              <span className="mkt-eyebrow">Questions & answers</span>
              <h2>What coaches ask first</h2>
              <p className="mkt-section-sub">Quick answers for setup, reliability, and fit.</p>
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
            <p>Sign in and onboard your team when you are ready.</p>
            <div className="mkt-hero-actions">
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
            <button type="button" onClick={() => onNavigate("/login")}>Sign In</button>
            <button type="button" onClick={() => onNavigate("/help")}>Help</button>
            <button type="button" onClick={() => onNavigate("/support")}>Support</button>
            <button type="button" onClick={() => onNavigate("/contact")}>Contact</button>
            <button type="button" onClick={() => onNavigate("/terms")}>Terms</button>
            <button type="button" onClick={() => onNavigate("/privacy")}>Privacy</button>
            <button type="button" onClick={() => onNavigate("/data-deletion")}>Data Deletion</button>
          </nav>
        </div>
      </footer>
    </div>
  );
}
