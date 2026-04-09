# Platform Roadmap - Preproduction

Last updated: April 8, 2026.

This document tracks what is shipped, partially shipped, and still coming soon so we can move from "working product" to "finished platform" without losing scope.

Status legend:
- ✅ Done
- 🔄 Partial
- 🚧 Coming Soon / Planned
- ❌ Not Started

## Section 1: Core Account Stuff

Account Page (`/account`) - 🔄 Partial
- ✅ Edit full name
- ✅ Edit email
- ✅ Change password (single form, calls `PUT /api/auth/me`)
- 🚧 Sign out all sessions
- 🚧 Delete account
- 🚧 Profile photo
- Note: organization profile is currently managed in Team Settings, not Account.

Settings Page (`/settings`) - 🚧 Coming Soon
- No dedicated user preferences page exists yet.
- Needed: theme, notifications, default school, timezone, display options, game defaults, sound toggles, privacy, device management.

Billing Page (`/billing`) - 🚧 Placeholder Needed
- Add placeholder with "Contact for pilot pricing" CTA.
- Future fields: plan, price, renewal date, payment method, invoices, usage, cancel/upgrade, trial status.

Team / Organization Management - 🔄 Partial
- ✅ Members list
- ✅ Invite members (`POST /api/org/members`)
- ✅ Remove members
- ✅ Role assignment (admin / coach / operator / player)
- 🚧 Audit log UI (API exists: `GET /api/games/:gameId/audit-log`)
- 🚧 Dedicated org management page
- 🚧 Permission matrix visibility

## Section 2: Support and Trust Pages

Support Page (`/support`) - 🔄 Partial
- Implemented: preproduction support hub with quick-help guidance and support intake form UX.
- Remaining: backend ticket routing, status page link, full FAQ content library.

Help Center / Docs (`/help` or `/docs`) - 🔄 Partial
- ✅ iPad tips page in operator app
- ✅ Tutorial overlays in both apps
- ❌ Standalone coach help center page
- ❌ Quick setup, game creation, operator sync, connection troubleshooting guides

Contact Page (`/contact`) - 🔄 Partial
- Implemented: preproduction contact form and support/pilot intake surface.
- Remaining: production email/ticket integration and response SLA automation.

## Section 3: Legal Pages

- ❌ Terms of Service (`/terms`)
- ❌ Privacy Policy (`/privacy`)
- ❌ Cookie notice/banner
- ❌ Data deletion request (`/data-deletion`)

## Section 4: Product / Marketing Pages

Landing Page (`/`) - 🔄 Partial
- ✅ Hero section
- ✅ Features grid
- ✅ How-it-works steps
- ✅ Inline FAQ accordion
- ✅ Footer links
- ✅ Animated live demo widget
- 🚧 Real product screenshots
- 🚧 "Who it is for" section
- 🚧 Pricing / demo CTA depth
- 🚧 Trust / social proof section

Features Page (`/features`) - ❌ Not Started
Pricing Page (`/pricing`) - ❌ Not Started
About Page (`/about`) - ❌ Not Started
Demo Page (`/demo`) - ✅ Done

## Section 5: Auth Flow

- ✅ Sign up / registration (`/setup`)
- ✅ Log in (`/login`)
- ✅ Forgot password page (`/forgot-password`)
- ✅ Reset password page (`/reset-password`)
- ❌ Email verification
- ❌ Invite acceptance
- 🚧 Magic link / SSO (later)

## Section 6: In-App Dashboard Extras

Notification Center - ❌ Not Started
- Needed: game issues, billing alerts, sync failed, export complete, subscription warnings, invite updates.

Recent Activity Feed - ❌ Not Started
Global Search - ❌ Not Started

Empty States - 🔄 Partial
- Empty-state CTA work has started, but complete coverage is still in progress.

Error States - 🔄 Partial
- ❌ Dedicated 404 / 403 / 500 / offline / unauthorized / expired-session pages

Loading States / Skeletons - 🔄 Partial
- Basic loading indicators exist, but no shared skeleton system.

## Section 7: Admin and Management

Admin Panel (UI) - 🚧 Planned
- ✅ Security metrics API exists
- ✅ Factory reset API exists
- ❌ Admin UI for users/orgs/subscriptions/support/logs/flags

Role / Permissions UI - 🔄 Partial
- ✅ Server-side role enforcement exists
- ✅ Team Settings role assignment exists
- ❌ User-visible permissions matrix
- ❌ Fine-grained controls

Audit Log UI - 🚧 Planned
- ✅ API exists (`GET /api/games/:gameId/audit-log`)
- ❌ Dashboard UI not built

## Section 8: Data and Export

- ✅ Roster JSON export / import
- 🚧 CSV player stats export
- 🚧 PDF game report
- 🚧 Season summary export
- 🚧 Printable/shareable box score
- ❌ Billing invoice download

## Section 9: Footer

Public marketing footer - ✅ Done
Authenticated app footer - 🔄 Partial
- Implemented: support, contact, billing, terms, privacy links in authenticated shell.
- Remaining: product/pricing/docs links, copyright and social/legal polish.

## Section 10: Premium Feel Pages

- 🚧 Public changelog page
- ❌ Roadmap page
- ❌ Status page
- ❌ Testimonials / case studies
- ❌ Demo booking page
- ❌ Full onboarding wizard
- 🚧 Invite teammates flow UX

## Section 11: Route Map

Existing:
- ✅ `/`
- ✅ `/demo`
- ✅ `/login`
- ✅ `/setup`
- ✅ `/account` (partial feature set)
- ✅ `/live`
- ✅ `/stats`
- ✅ `/stats/games`
- ✅ `/stats/players`
- ✅ `/stats/trends`
- ✅ `/stats/insights`
- ✅ `/stats/settings`

Missing / Needed:
- P0: `/forgot-password`, `/reset-password`
- P1: `/terms`, `/privacy`, `/support`, `/contact`, `/billing`, `/settings`
- P2: `/features`, `/pricing`, `/about`, `/notifications`, `/org/settings`, `/admin`, `/help`, `/data-deletion`
- P3: `/changelog`, `/roadmap`

## Section 12: Build Order

1. Forgot password + reset password (P0)
2. Terms + Privacy pages
3. Support + Contact pages
4. Footer links update (public + app)
5. Account completion (sign out all sessions, delete account, profile photo)
6. Billing placeholder
7. User settings page
8. Error/loading/empty-state pass
9. Notification center + recent activity
10. Org settings standalone page
11. Admin panel starter UI
12. CSV/PDF export expansion
13. Premium pages (features/pricing/about/changelog/roadmap)

## Notes

- This is a preproduction roadmap and should be updated as work ships.
- Technical deep-dive tasks remain in `improvements/IMPROVEMENTS.md`.
