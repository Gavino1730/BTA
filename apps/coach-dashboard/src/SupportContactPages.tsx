import { type FormEvent, useState } from "react";
import { PublicSiteChrome } from "./PublicSiteChrome.js";
import { apiBase, apiKeyHeader } from "./platform.js";

interface RoutedPageProps {
  onNavigate: (path: string) => void;
}

export function SupportHubPage({ onNavigate }: RoutedPageProps) {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [topic, setTopic] = useState<"bug" | "feature" | "help">("help");
  const [severity, setSeverity] = useState<"low" | "medium" | "high">("medium");
  const [gameId, setGameId] = useState("");
  const [device, setDevice] = useState("");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [status, setStatus] = useState("Submit support details below. During preproduction this form records intake and will be connected to the ticket pipeline.");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = message.trim();
    if (!trimmed || !email.trim()) {
      setStatus("Add your email and issue details so we can help you faster.");
      return;
    }

    setSubmitting(true);
    try {
      const response = await fetch(`${apiBase}/api/intake/support`, {
        method: "POST",
        headers: apiKeyHeader(true),
        body: JSON.stringify({
          fullName,
          email,
          topic,
          severity,
          gameId,
          device,
          message: trimmed,
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        setStatus(typeof payload.error === "string" ? payload.error : "Could not submit support request.");
        return;
      }

      setStatus("Support request submitted. Check your email for confirmation.");
      setMessage("");
      setGameId("");
      setDevice("");
    } catch {
      setStatus("Could not reach the API. Check your connection and try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <PublicSiteChrome onNavigate={onNavigate}>
      <main className="mkt-detail-main mkt-no-cards">
      <div className="stats-page">
        <section className="stats-page-hero compact">
          <div>
            <h1>Support</h1>
            <p className="stats-page-subtitle">FAQ, bug reports, and feature requests in one place.</p>
          </div>
          <p className="stats-page-status">Preproduction</p>
        </section>

      <section className="stats-page-card settings-section-card">
        <div className="stats-page-card-head">
          <div>
            <h3>Quick Help</h3>
            <p className="settings-section-desc">Common tasks, triage order, and escalation guidance.</p>
          </div>
        </div>
        <ul style={{ margin: 0, paddingLeft: "1.05rem", lineHeight: 1.7, color: "rgba(232,234,240,0.85)" }}>
          <li>Before tip-off: verify roster readiness, pairing code, and active game context in Live view.</li>
          <li>During games: prioritize sync, scoreboard, and correction issues first, then submit severity-tagged support details.</li>
          <li>After games: include game ID, expected vs actual behavior, and correction attempts already tried.</li>
          <li>Account issues: use password reset first, then escalate through Contact with school ID and impacted email.</li>
        </ul>
      </section>

      <section className="stats-page-card settings-section-card">
        <div className="stats-page-card-head">
          <div>
            <h3>Escalation Guide</h3>
            <p className="settings-section-desc">Use severity to help us triage quickly and route to the right owner.</p>
          </div>
        </div>
        <div className="stats-game-list">
          <div className="stats-game-row">
            <div>
              <strong>High Severity</strong>
              <span>Live game blocked, score mismatch, or operator unable to continue.</span>
            </div>
            <div className="stats-game-score-block">
              <strong>Same Day</strong>
              <span>During active event windows</span>
            </div>
          </div>
          <div className="stats-game-row">
            <div>
              <strong>Medium Severity</strong>
              <span>Workflow impacted but game can continue with workaround.</span>
            </div>
            <div className="stats-game-score-block">
              <strong>1 Day</strong>
              <span>Business day target</span>
            </div>
          </div>
          <div className="stats-game-row">
            <div>
              <strong>Low Severity</strong>
              <span>Quality improvements, UX polish, and non-blocking issues.</span>
            </div>
            <div className="stats-game-score-block">
              <strong>2 Days</strong>
              <span>Business day target</span>
            </div>
          </div>
        </div>
      </section>

      <form className="stats-page-card settings-section-card" onSubmit={handleSubmit}>
        <div className="stats-page-card-head">
          <div>
            <h3>Support Intake</h3>
            <p className="settings-section-desc">Response expectation: 1-2 business days during pilot.</p>
          </div>
          <button type="submit" className="shell-nav-link shell-nav-link-active" disabled={submitting}>{submitting ? "Submitting..." : "Submit"}</button>
        </div>

        <div className="setup-grid">
          <label className="stats-filter-field">
            <span>Name</span>
            <input value={fullName} onChange={(event) => setFullName(event.target.value)} placeholder="Your name" />
          </label>
          <label className="stats-filter-field">
            <span>Email</span>
            <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@school.org" />
          </label>
          <label className="stats-filter-field">
            <span>Type</span>
            <select value={topic} onChange={(event) => setTopic(event.target.value as "bug" | "feature" | "help")}> 
              <option value="help">Help Request</option>
              <option value="bug">Bug Report</option>
              <option value="feature">Feature Request</option>
            </select>
          </label>
          <label className="stats-filter-field">
            <span>Severity</span>
            <select value={severity} onChange={(event) => setSeverity(event.target.value as "low" | "medium" | "high")}> 
              <option value="low">Low - non-blocking</option>
              <option value="medium">Medium - workflow impact</option>
              <option value="high">High - game-day blocked</option>
            </select>
          </label>
          <label className="stats-filter-field">
            <span>Game ID (optional)</span>
            <input value={gameId} onChange={(event) => setGameId(event.target.value)} placeholder="game-12345" />
          </label>
          <label className="stats-filter-field">
            <span>Device / Browser (optional)</span>
            <input value={device} onChange={(event) => setDevice(event.target.value)} placeholder="iPad Safari, Coach Laptop Chrome" />
          </label>
          <label className="stats-filter-field" style={{ gridColumn: "1 / -1" }}>
            <span>Details</span>
            <textarea
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              rows={5}
              placeholder="Describe what happened, expected behavior, exact steps, and what you already tried."
            />
          </label>
        </div>

        <p className="stats-page-subcopy" style={{ marginTop: "0.6rem" }}>
          Expected response windows: high severity same day during active events, medium within 1 business day, low within 2 business days.
        </p>

        <p className="stats-page-status">{status}</p>
        <div className="account-action-row">
          <button type="button" className="shell-nav-link" onClick={() => onNavigate("/contact")}>Open Contact Page</button>
          <button type="button" className="shell-nav-link" onClick={() => onNavigate("/terms")}>Terms</button>
          <button type="button" className="shell-nav-link" onClick={() => onNavigate("/privacy")}>Privacy</button>
        </div>
      </form>

        <section className="stats-page-card settings-section-card" style={{ marginBottom: "1rem" }}>
        <div className="stats-page-card-head">
          <div>
            <h3>What To Include For Faster Resolution</h3>
            <p className="settings-section-desc">Good intake detail can cut follow-up cycles significantly.</p>
          </div>
        </div>
        <ul style={{ margin: 0, paddingLeft: "1.05rem", lineHeight: 1.7, color: "rgba(232,234,240,0.85)" }}>
          <li>School ID and role of impacted user (coach, operator, or player).</li>
          <li>Exact timestamp and game ID where issue occurred.</li>
          <li>Expected behavior versus observed behavior.</li>
          <li>Workarounds already attempted.</li>
          <li>Screenshot or short recording reference if available.</li>
        </ul>
        </section>
      </div>
      </main>
    </PublicSiteChrome>
  );
}

export function ContactHubPage({ onNavigate }: RoutedPageProps) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [organization, setOrganization] = useState("");
  const [category, setCategory] = useState<"support" | "pilot" | "billing" | "security">("support");
  const [preferredReply, setPreferredReply] = useState<"email" | "phone">("email");
  const [phone, setPhone] = useState("");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [status, setStatus] = useState("Use this preproduction form for support, pilot onboarding, billing, and security inquiries.");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!name.trim() || !email.trim() || !message.trim()) {
      setStatus("Complete all fields before submitting.");
      return;
    }
    if (preferredReply === "phone" && !phone.trim()) {
      setStatus("Add a phone number when phone callback is selected.");
      return;
    }

    setSubmitting(true);
    try {
      const response = await fetch(`${apiBase}/api/intake/contact`, {
        method: "POST",
        headers: apiKeyHeader(true),
        body: JSON.stringify({
          name,
          email,
          organization,
          category,
          preferredReply,
          phone,
          message,
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        setStatus(typeof payload.error === "string" ? payload.error : "Could not submit contact request.");
        return;
      }

      setStatus("Contact request submitted. Check your email for confirmation.");
      setMessage("");
      setPhone("");
    } catch {
      setStatus("Could not reach the API. Check your connection and try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <PublicSiteChrome onNavigate={onNavigate}>
      <main className="mkt-detail-main mkt-no-cards">
      <div className="stats-page">
        <section className="stats-page-hero compact">
          <div>
            <h1>Contact</h1>
            <p className="stats-page-subtitle">Support and pilot requests.</p>
          </div>
          <p className="stats-page-status">Preproduction</p>
        </section>

      <form className="stats-page-card settings-section-card" onSubmit={handleSubmit}>
        <div className="stats-page-card-head">
          <div>
            <h3>Get In Touch</h3>
            <p className="settings-section-desc">Direct support email placeholder: support@bta.local. Include school ID for faster routing.</p>
          </div>
          <button type="submit" className="shell-nav-link shell-nav-link-active" disabled={submitting}>{submitting ? "Sending..." : "Send"}</button>
        </div>

        <div className="setup-grid">
          <label className="stats-filter-field">
            <span>Name</span>
            <input value={name} onChange={(event) => setName(event.target.value)} placeholder="Your name" />
          </label>
          <label className="stats-filter-field">
            <span>Email</span>
            <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@school.org" />
          </label>
          <label className="stats-filter-field">
            <span>School / Organization</span>
            <input value={organization} onChange={(event) => setOrganization(event.target.value)} placeholder="Valley Catholic" />
          </label>
          <label className="stats-filter-field">
            <span>Category</span>
            <select value={category} onChange={(event) => setCategory(event.target.value as "support" | "pilot" | "billing" | "security")}> 
              <option value="support">Support</option>
              <option value="pilot">Pilot Onboarding</option>
              <option value="billing">Billing</option>
              <option value="security">Security</option>
            </select>
          </label>
          <label className="stats-filter-field">
            <span>Preferred Reply</span>
            <select value={preferredReply} onChange={(event) => setPreferredReply(event.target.value as "email" | "phone")}> 
              <option value="email">Email</option>
              <option value="phone">Phone</option>
            </select>
          </label>
          <label className="stats-filter-field">
            <span>Phone (optional unless callback selected)</span>
            <input value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="(555) 123-4567" />
          </label>
          <label className="stats-filter-field" style={{ gridColumn: "1 / -1" }}>
            <span>Message</span>
            <textarea
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              rows={5}
              placeholder="Tell us what you need, urgency, timeline, and best contact window."
            />
          </label>
        </div>

        <p className="stats-page-subcopy" style={{ marginTop: "0.6rem" }}>
          Contact routing: support and pilot requests target 1 business day acknowledgement; billing and security requests are prioritized for admin follow-up.
        </p>

        <p className="stats-page-status">{status}</p>
        <div className="account-action-row">
          <button type="button" className="shell-nav-link" onClick={() => onNavigate("/support")}>Back to Support</button>
          <button type="button" className="shell-nav-link" onClick={() => onNavigate("/")}>Home</button>
        </div>
      </form>

        <section className="stats-page-card settings-section-card" style={{ marginBottom: "1rem" }}>
        <div className="stats-page-card-head">
          <div>
            <h3>Contact Channels and Expected Follow-Up</h3>
            <p className="settings-section-desc">Preproduction channels are manually monitored and routed by category.</p>
          </div>
        </div>
        <div className="stats-game-list">
          <div className="stats-game-row">
            <div>
              <strong>Support / Pilot</strong>
              <span>Operational questions, onboarding, and workflow help.</span>
            </div>
            <div className="stats-game-score-block">
              <span>Target acknowledgement: 1 business day</span>
            </div>
          </div>
          <div className="stats-game-row">
            <div>
              <strong>Billing</strong>
              <span>Pilot pricing, term clarifications, and renewal planning.</span>
            </div>
            <div className="stats-game-score-block">
              <span>Routed to admin contact</span>
            </div>
          </div>
          <div className="stats-game-row">
            <div>
              <strong>Security</strong>
              <span>Account compromise concerns or sensitive access issues.</span>
            </div>
            <div className="stats-game-score-block">
              <span>Prioritized for urgent review</span>
            </div>
          </div>
        </div>
        </section>
      </div>
      </main>
    </PublicSiteChrome>
  );
}
