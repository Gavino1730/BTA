import { type FormEvent, useState } from "react";

interface RoutedPageProps {
  onNavigate: (path: string) => void;
}

export function SupportHubPage({ onNavigate }: RoutedPageProps) {
  const [topic, setTopic] = useState<"bug" | "feature" | "help">("help");
  const [message, setMessage] = useState("");
  const [status, setStatus] = useState("Submit support details below. In preproduction this is a local intake placeholder.");

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = message.trim();
    if (!trimmed) {
      setStatus("Add details so we can help you faster.");
      return;
    }
    setStatus("Support request recorded (preproduction placeholder). We will connect this to the ticketing workflow before production.");
    setMessage("");
  }

  return (
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
            <p className="settings-section-desc">Common tasks and where to go next.</p>
          </div>
        </div>
        <ul style={{ margin: 0, paddingLeft: "1.05rem", lineHeight: 1.7, color: "rgba(232,234,240,0.85)" }}>
          <li>Need setup guidance: open Team Settings and complete roster + pairing.</li>
          <li>Need account help: use Forgot Password and Reset Password pages.</li>
          <li>Need direct support: use the intake form below, then contact page.</li>
        </ul>
      </section>

      <form className="stats-page-card settings-section-card" onSubmit={handleSubmit}>
        <div className="stats-page-card-head">
          <div>
            <h3>Support Intake</h3>
            <p className="settings-section-desc">Response expectation: 1-2 business days during pilot.</p>
          </div>
          <button type="submit" className="shell-nav-link shell-nav-link-active">Submit</button>
        </div>

        <div className="setup-grid">
          <label className="stats-filter-field">
            <span>Type</span>
            <select value={topic} onChange={(event) => setTopic(event.target.value as "bug" | "feature" | "help")}> 
              <option value="help">Help Request</option>
              <option value="bug">Bug Report</option>
              <option value="feature">Feature Request</option>
            </select>
          </label>
          <label className="stats-filter-field" style={{ gridColumn: "1 / -1" }}>
            <span>Details</span>
            <textarea
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              rows={5}
              placeholder="Describe what happened, expected behavior, and your game context."
            />
          </label>
        </div>

        <p className="stats-page-status">{status}</p>
        <div className="account-action-row">
          <button type="button" className="shell-nav-link" onClick={() => onNavigate("/contact")}>Open Contact Page</button>
          <button type="button" className="shell-nav-link" onClick={() => onNavigate("/terms")}>Terms</button>
          <button type="button" className="shell-nav-link" onClick={() => onNavigate("/privacy")}>Privacy</button>
        </div>
      </form>
    </div>
  );
}

export function ContactHubPage({ onNavigate }: RoutedPageProps) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [status, setStatus] = useState("Use this preproduction form for pilot and support inquiries.");

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!name.trim() || !email.trim() || !message.trim()) {
      setStatus("Complete all fields before submitting.");
      return;
    }

    setStatus("Contact request recorded (preproduction placeholder). We will wire this to email + ticketing before production.");
    setMessage("");
  }

  return (
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
            <p className="settings-section-desc">Direct support email placeholder: support@bta.local</p>
          </div>
          <button type="submit" className="shell-nav-link shell-nav-link-active">Send</button>
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
          <label className="stats-filter-field" style={{ gridColumn: "1 / -1" }}>
            <span>Message</span>
            <textarea
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              rows={5}
              placeholder="Tell us what you need, plus best callback/contact details."
            />
          </label>
        </div>

        <p className="stats-page-status">{status}</p>
        <div className="account-action-row">
          <button type="button" className="shell-nav-link" onClick={() => onNavigate("/support")}>Back to Support</button>
          <button type="button" className="shell-nav-link" onClick={() => onNavigate("/")}>Home</button>
        </div>
      </form>
    </div>
  );
}
