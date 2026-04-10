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
- ✅ Sign out all sessions (`POST /api/auth/logout-all`)
- ✅ Delete account (`DELETE /api/auth/me`) with password + DELETE confirmation
- ✅ Profile photo upload (png/jpeg/webp avatar)
- Note: organization profile is currently managed in Team Settings, not Account.

Settings Page (`/settings`) - 🔄 Partial
- Implemented: dedicated settings placeholder page.
- Needed: theme, notifications, default school, timezone, display options, game defaults, sound toggles, privacy, device management.

Billing Page (`/billing`) - 🔄 Partial
- Implemented: billing placeholder with pilot pricing CTA.
- Future fields: plan, price, renewal date, payment method, invoices, usage, cancel/upgrade, trial status.
- 🚧 Stripe integration for subscriptions and payments (checkout, customer portal, webhook lifecycle events)
- 🚧 Monthly plan/tier model (multi-tier pricing, feature entitlements, upgrade/downgrade paths)
- 🚧 Paywall readiness for premium features/routes with clear upgrade prompts
- 🚧 Free trial/demo conversion flow (trial start/end, grace messaging, in-app upsell, conversion CTA)

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
- ✅ Standalone coach help center page
- 🔄 Quick setup, game creation, operator sync, connection troubleshooting guides

Contact Page (`/contact`) - 🔄 Partial
- Implemented: preproduction contact form and support/pilot intake surface.
- Remaining: production email/ticket integration and response SLA automation.

## Section 3: Legal Pages

- 🔄 Terms of Service (`/terms`) placeholder page shipped; counsel-reviewed final copy pending
- 🔄 Privacy Policy (`/privacy`) placeholder page shipped; final policy language pending
- ❌ Cookie notice/banner
- 🔄 Data deletion request (`/data-deletion`) preproduction request page shipped

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
- 🚧 Scope: public pricing table with monthly tiers, trial/demo offer, and CTA path into Stripe checkout
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

Notification Center - 🔄 Partial
- ✅ Initial `/stats/notifications` page with live-context alerts and game-based activity feed
- ✅ Client-side persistence and read/unread controls for notifications
- ✅ Dedicated `/api/notifications` feed now provides invite + system + results event sources
- 🚧 Remaining: billing and export pipeline notification sources

Recent Activity Feed - 🔄 Partial
- ✅ Initial recent activity timeline sourced from latest games
- 🚧 Remaining: richer event sources (roster/settings/auth/export actions)
Global Search - ❌ Not Started

Empty States - 🔄 Partial
- Expanded coverage now ships on core stats pages (`/stats`, `/stats/games`, `/stats/players`, `/stats/trends`) with actionable empty-state CTAs and retry paths.
- Remaining: tighten edge-case empty copy on secondary stats/live subpanels.

Error States - 🔄 Partial
- ✅ Dedicated 404 / 403 / 500 / offline / expired-session pages
- 🚧 Unauthorized page variant and deeper route-specific recovery copy

Loading States / Skeletons - 🔄 Partial
- Explicit loading indicators and retry flows now ship across core stats pages.
- Remaining: introduce shared skeleton components and expand to non-core panels.

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
- Implemented: help, support, contact, billing, terms, privacy, data deletion links in authenticated shell.
- Remaining: product/pricing links, copyright and social/legal polish.

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
- ✅ `/forgot-password`
- ✅ `/reset-password`
- ✅ `/setup`
- ✅ `/account` (partial feature set)
- ✅ `/terms`
- ✅ `/privacy`
- ✅ `/support`
- ✅ `/contact`
- ✅ `/billing`
- ✅ `/settings`
- ✅ `/help`
- ✅ `/data-deletion`
- ✅ `/404`
- ✅ `/403`
- ✅ `/500`
- ✅ `/offline`
- ✅ `/session-expired`
- ✅ `/live`
- ✅ `/stats`
- ✅ `/stats/games`
- ✅ `/stats/players`
- ✅ `/stats/trends`
- ✅ `/stats/insights`
- ✅ `/stats/settings`

Missing / Needed:
- P2: `/features`, `/pricing`, `/about`, `/notifications`, `/org/settings`, `/admin`, `/docs`
- P3: `/changelog`, `/roadmap`

## Section 12: Build Order

1. Notification center category expansion (billing/export/system integrations)
2. Org settings deepening (audit logs, policy controls, org-level preferences)
3. Admin panel starter UI
4. CSV/PDF export expansion
5. Monetization foundation (Stripe subscriptions, monthly tiers, paywall hooks, free trial/demo conversion)
6. Premium pages (features/pricing/about/changelog/roadmap)
7. Dedicated docs center (`/docs`) and richer help content
8. Shared skeleton system + loading-state design unification

Org Settings Standalone Page - 🔄 Partial
- ✅ Dedicated `/org/settings` route and navigation entry
- ✅ Organization profile and member management wired to existing onboarding/org APIs
- 🚧 Remaining: org policy controls, audit log panel, and advanced permissions matrix

## Notes

- This is a preproduction roadmap and should be updated as work ships.
- Technical deep-dive tasks remain in `improvements/IMPROVEMENTS.md`.
