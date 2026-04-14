interface ErrorStatePageProps {
  title: string;
  subtitle: string;
  onPrimary?: () => void;
  primaryLabel?: string;
  onSecondary?: () => void;
  secondaryLabel?: string;
}

function ErrorStatePage({
  title,
  subtitle,
  onPrimary,
  primaryLabel,
  onSecondary,
  secondaryLabel,
}: ErrorStatePageProps) {
  return (
    <div className="stats-page">
      <section className="stats-page-card" style={{ maxWidth: "760px", margin: "2.5rem auto" }}>
        <p className="stats-page-eyebrow">System Status</p>
        <h1>{title}</h1>
        <p className="stats-page-subtitle">{subtitle}</p>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "0.65rem", marginTop: "1rem" }}>
          {onPrimary && primaryLabel && (
            <button type="button" className="shell-nav-link shell-nav-link-active" onClick={onPrimary}>
              {primaryLabel}
            </button>
          )}
          {onSecondary && secondaryLabel && (
            <button type="button" className="shell-nav-link" onClick={onSecondary}>
              {secondaryLabel}
            </button>
          )}
        </div>
      </section>
    </div>
  );
}

export function NotFoundPage({ onNavigate }: { onNavigate: (path: string) => void }) {
  return (
    <ErrorStatePage
      title="Page Not Found"
      subtitle="We couldn't find that page. Check the URL or head back to the dashboard."
      onPrimary={() => onNavigate("/live")}
      primaryLabel="Go to Live Dashboard"
      onSecondary={() => onNavigate("/stats")}
      secondaryLabel="Open Overview"
    />
  );
}

export function ForbiddenPage({ onNavigate }: { onNavigate: (path: string) => void }) {
  return (
    <ErrorStatePage
      title="Access Restricted"
      subtitle="Your account does not have permission to view this page."
      onPrimary={() => onNavigate("/stats")}
      primaryLabel="Go to Overview"
      onSecondary={() => onNavigate("/account")}
      secondaryLabel="Open Account"
    />
  );
}

export function UnauthorizedPage({ onNavigate }: { onNavigate: (path: string) => void }) {
  return (
    <ErrorStatePage
      title="Unauthorized"
      subtitle="You're signed in, but this page needs additional permissions or organization scope."
      onPrimary={() => onNavigate("/account")}
      primaryLabel="Review Account"
      onSecondary={() => onNavigate("/stats")}
      secondaryLabel="Open Overview"
    />
  );
}

export function ServerErrorPage({ onNavigate }: { onNavigate: (path: string) => void }) {
  return (
    <ErrorStatePage
      title="Server Error"
      subtitle="Something went wrong loading this page. Retry or return to the dashboard."
      onPrimary={() => onNavigate("/live")}
      primaryLabel="Retry Dashboard"
      onSecondary={() => onNavigate("/stats")}
      secondaryLabel="Open Overview"
    />
  );
}

export function OfflinePage({ onNavigate }: { onNavigate: (path: string) => void }) {
  return (
    <ErrorStatePage
      title="You Are Offline"
      subtitle="Network is unavailable. Reconnect and try again."
      onPrimary={() => onNavigate("/live")}
      primaryLabel="Retry Live"
      onSecondary={() => onNavigate("/stats")}
      secondaryLabel="Open Overview"
    />
  );
}

export function SessionExpiredPage({ onNavigate }: { onNavigate: (path: string) => void }) {
  return (
    <ErrorStatePage
      title="Session Expired"
      subtitle="Your authentication session expired. Sign in again to continue."
      onPrimary={() => onNavigate("/login")}
      primaryLabel="Sign In"
      onSecondary={() => onNavigate("/forgot-password")}
      secondaryLabel="Reset Password"
    />
  );
}
