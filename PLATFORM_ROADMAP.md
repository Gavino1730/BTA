# BTA Courtside Roadmap - Active Work

Last updated: April 14, 2026.

This roadmap intentionally tracks only work that is still open, partially complete, or in active planning. Completed items were removed to keep this file focused.

Status legend:
- ?? In progress / partial
- ?? Planned
- ? Not started

## 1. Launch-Critical Platform Readiness

Security and tenant isolation - ??
- ?? Enforce explicit production origins and reject wildcard/missing origin configuration.
- ?? Confirm production tenant/auth hardening (`BTA_REQUIRE_TENANT=1`, `BTA_JWT_WRITE_REQUIRED=1`) in hosted environment.

Reliability and durability - ??
- ?? Confirm durable Postgres persistence (`DATABASE_URL`) in production with restart verification.
- ?? Guarantee acknowledged-write durability before returning ingest success.
- ?? Finalize game-time outage recovery runbook and complete full-game outage drill sign-off.

Release operations - ??
- ?? Keep production promotion blocked on `npm run validate:env`, `npm run test -w @bta/realtime-api`, and `npm run build`.

## 2. Product Surface Gaps (Coach + Operator)

Settings and account depth - ??
- ?? Expand `/settings` beyond shell state: theme, notifications, timezone, defaults, privacy/device controls.

Notifications and activity - ??
- ?? Add billing/export/system notification sources to `/notifications` and `/stats/notifications`.
- ?? Expand recent-activity event sources (roster/settings/auth/export actions).

Search and discoverability - ?
- ?? Build global search across players, games, and key workflows.

Admin and org management - ??
- ?? Expand `/admin` from read-only shell into users/orgs/subscriptions/support/logs/flags modules.
- ?? Add audit-log UI on top of existing API (`GET /api/games/:gameId/audit-log`).
- ?? Add org policy controls and visible permission matrix in `/org/settings`.

Exports and reporting - ??
- ?? CSV player stats export.
- ?? PDF game report export.
- ?? Season summary export.
- ?? Billing invoice download support.

## 3. Support, Docs, and Legal Completion

Support and contact operations - ??
- ?? Wire support/contact forms to production ticket routing and SLA workflow.
- ?? Complete full FAQ/help content set (quick setup, game creation, operator sync, troubleshooting).

Legal completion - ??
- ?? Replace placeholder Terms and Privacy with final counsel-reviewed copy.
- ?? Add cookie notice/banner behavior.

## 4. Marketing and Monetization Polish

Marketing pages - ??
- ?? Add real product screenshots and stronger trust/social-proof depth on key public pages.
- ?? Improve pricing and demo CTA depth for higher conversion quality.

Pricing and billing UX parity - ??
- ?? Expand public pricing to a clearer tier comparison with limits and trial language.
- ?? Complete billing UX parity: clearer next invoice details, trial countdown, and invoice/receipt visibility.

## 5. Post-Launch Candidates (Not Blocking Launch)

- ?? Fine-grained RBAC expansion (owner/coach/operator/analyst granularity).
- ?? Roster audit history and change timeline.
- ?? Per-client API key rotation and scoped credentials.
- ?? Platform SLO dashboards/alerts for live-game reliability and AI usage trends.
- ?? Cache-warming and load-test improvements for analytics and burst ingest.

## Notes

- Keep this file short and current: remove completed items as they ship.
- Technical implementation detail and owner/date tracking live in `improvements/IMPROVEMENTS.md`.
