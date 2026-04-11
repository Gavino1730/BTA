import { type ReactNode } from "react";

interface PublicSiteChromeProps {
  onNavigate: (path: string) => void;
  children: ReactNode;
}

export function PublicSiteChrome({ onNavigate, children }: PublicSiteChromeProps) {
  return (
    <div className="mkt-page mkt-detail-page">
      <header className="mkt-nav modern-nav">
        <div className="mkt-nav-inner">
          <button type="button" className="mkt-brand" onClick={() => onNavigate("/")}>
            <span className="mkt-brand-icon">🏀</span>
            <span className="mkt-brand-name">BTA Courtside</span>
          </button>
          <nav className="mkt-nav-links" aria-label="Site navigation">
            <button type="button" onClick={() => onNavigate("/")}>Home</button>
            <button type="button" onClick={() => onNavigate("/product")}>Product</button>
            <button type="button" onClick={() => onNavigate("/how-it-works")}>How It Works</button>
            <button type="button" onClick={() => onNavigate("/pricing")}>Pricing</button>
            <button type="button" onClick={() => onNavigate("/compare")}>Compare</button>
            <button type="button" onClick={() => onNavigate("/support")}>Support</button>
          </nav>
          <div className="mkt-nav-actions">
            <button type="button" className="mkt-btn mkt-btn-subtle" onClick={() => onNavigate("/login")}>Coach Login</button>
            <button type="button" className="mkt-btn mkt-btn-primary" onClick={() => onNavigate("/login")}>Get Started</button>
          </div>
        </div>
      </header>

      <div className="mkt-main-content">
        {children}
      </div>

      <footer className="mkt-footer modern-footer">
        <div className="mkt-footer-inner">
          <div className="mkt-footer-brand">
            <span>BTA Courtside Platform</span>
            <span className="mkt-footer-tagline">Live operations and analytics for high school basketball.</span>
          </div>
          <nav className="mkt-footer-links">
            <button type="button" onClick={() => onNavigate("/help")}>Help</button>
            <button type="button" onClick={() => onNavigate("/support")}>Support</button>
            <button type="button" onClick={() => onNavigate("/contact")}>Contact</button>
            <button type="button" onClick={() => onNavigate("/billing")}>Billing</button>
            <button type="button" onClick={() => onNavigate("/terms")}>Terms</button>
            <button type="button" onClick={() => onNavigate("/privacy")}>Privacy</button>
            <button type="button" onClick={() => onNavigate("/data-deletion")}>Data Deletion</button>
          </nav>
        </div>
      </footer>
    </div>
  );
}
