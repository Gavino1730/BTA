# BTA Courtside Marketing Theme Rules

## Purpose
Use this as the source of truth for premium marketing styling decisions for the BTA Courtside web presence.
The canonical design tokens live in `apps/shared-ui/courtside-theme.css` (used by coach-dashboard + ipad-operator)
and are mirrored in `apps/marketing-site/src/app/globals.css`.

## Core Direction
- Mood: composed, fast, intelligent, premium.
- Visual tone: dark, structured, interface-led, high-contrast.
- Avoid: generic SaaS sections, cartoon sports motifs, neon overload, betting-app look, fitness-brand look.

## Design Token Naming Convention
All canonical tokens use the `--bta-*` prefix (e.g. `--bta-accent-violet`).
Each app may define local aliases (e.g. `--accent-primary`) that point to `--bta-*` values.
Migrate callsites to `--bta-*` names over time.

## Color Tokens

### Backgrounds
| Token | Value | Usage |
|---|---|---|
| `--bta-bg-base` | `#0d1020` | Page/app background |
| `--bta-bg-elevated` | `#151a30` | Cards, panels |
| `--bta-bg-panel` | `#1c2340` | Raised surfaces |
| `--bta-bg-panel-2` | `#2b335a` | Borders, depth layer |

### Text
| Token | Value | Usage |
|---|---|---|
| `--bta-text-primary` | `#f7f8fc` | Headings, body |
| `--bta-text-secondary` | `#d8ddf0` | Supporting copy |
| `--bta-text-tertiary` | `#a5add0` | Captions, metadata |
| `--bta-text-muted` | `#666c8f` | Disabled, placeholder |

### Brand Accents
| Token | Value | Name |
|---|---|---|
| `--bta-accent-violet` | `#6e5bff` | Courtside Violet (primary CTA) |
| `--bta-accent-violet-dark` | `#4636c9` | Deep Violet (hover state) |
| `--bta-accent-cyan` | `#46d7ff` | Signal Cyan (secondary highlight) |
| `--bta-accent-glow` | `rgba(70,215,255,0.4)` | Ambient glow |

### Semantic States
| Token | Value |
|---|---|
| `--bta-success` | `#38e39f` |
| `--bta-warning` | `#ffb84d` |
| `--bta-danger` | `#ff5d73` |
| `--bta-info` | `#46d7ff` |

### Borders & Rings
| Token | Value |
|---|---|
| `--bta-border-soft` | `#2b335a` |
| `--bta-border-strong` | `#4a588f` |
| `--bta-ring` | `rgba(70,215,255,0.5)` |

## Typography
| Token | Value | Usage |
|---|---|---|
| `--bta-font-body` | `"Inter", system-ui, sans-serif` | All body text |
| `--bta-font-display` | `"Syne", "Inter", system-ui, sans-serif` | Headlines |
| `--bta-font-mono` | `"JetBrains Mono", ui-monospace, monospace` | Stat numbers, timecodes |

**Marketing site** loads Inter + Syne + JetBrains Mono via `next/font/google` in `layout.tsx`.
**Vite apps** load the same fonts via `<link>` in each app's `index.html`.

## Typography Rules
- Display font: Syne 700/800 — geometric, confident, tight letter-spacing.
- Body/UI font: Inter — clean, neutral, legible at all sizes.
- Stats/numbers: JetBrains Mono — tabular figures, consistent spacing.
- Headline behavior: high contrast, large, tight line-height.
- Body copy behavior: concise, neutral, utility-focused.
- Avoid long paragraphs and buzzword copy.

## Gradient System
- Hero gradient: `linear-gradient(135deg, #2B235C 0%, #4636C9 45%, #6E5BFF 100%)`
- CTA gradient: `linear-gradient(135deg, #6E5BFF 0%, #46D7FF 100%)`
- Subtle background wash: `radial-gradient(circle at top right, rgba(110,91,255,.22), transparent 45%)`

## Exact UI Usage

### Navbar
- Background: `rgba(13,16,32,.72)` with `backdrop-filter: blur`
- Border: `var(--bta-border-soft)` (`#2b335a`)

### Primary Button
- Background: `var(--bta-accent-violet)` (`#6e5bff`)
- Text: white
- Hover: `#7c6bff`
- Border-radius: `var(--bta-radius-full)` (pill)

### Secondary Button
- Background: transparent
- Border: `var(--bta-border-soft)`

### Cards / Panels
- Background: `var(--bta-bg-elevated)` or `var(--bta-bg-panel)`
- Border: 1px `var(--bta-border-soft)`
- Inset top shine: `inset 0 1px 0 rgba(201,205,227,0.07)`

### Charts / Stats
- Primary: `var(--bta-accent-violet)`
- Secondary: `var(--bta-accent-cyan)`
- Positive: `var(--bta-success)`
- Warning: `var(--bta-warning)`
- Negative: `var(--bta-danger)`

## Color Ratio Rule
- 70% dark neutrals (`--bta-bg-*`)
- 20% violet tones
- 10% accent colors (cyan, success, warning, danger)

## Elevation and Surface Rules
- Glass panels require: translucent dark panel, soft border, large blur, deep shadow.
- Shadows:
  - `--bta-shadow-md`: `0 14px 34px rgba(5,8,22,0.44)`
  - `--bta-shadow-lg`: `0 28px 64px rgba(5,8,22,0.52)`
  - `--bta-shadow-xl`: `0 38px 96px rgba(4,6,16,0.62)`
- Borders should remain subtle and never pure white.

## Structured Background System
- Use a persistent alignment grid across major sections.
- Grid should remain subtle and masked, not noisy.
- Use ambient radial glows in accent colors behind key sections.
- Never use random abstract blob gradients as primary style language.

## Motion Rules
Use Motion for React for all non-trivial animations.

- Required motion types:
  - Scroll reveal per section.
  - Parallax-like ambient background drift.
  - Floating basketball-data objects.
  - Hover lift and card transitions.
- Motion quality:
  - Controlled and smooth, not chaotic.
  - Prefer `transform` and `opacity` over layout-triggering animation.
  - Respect `prefers-reduced-motion` — use `--bta-motion-*` tokens which collapse to `0.001ms` when reduced motion is enabled.

## Data Object Language
Floating elements should represent product reality.

**Allowed motifs:**
shot chart dots, player tags, timeline markers, score widgets, possession arrows,
substitution indicators, live status chips, AI insight badges, court coordinate nodes,
stat cards, play sequence fragments, film cue markers.

**Disallowed motifs:**
Decorative confetti, cartoon sports graphics, generic futuristic HUD clutter.

## Section Architecture Requirements
Homepage sections must remain in this sequence:
1. Navigation
2. Hero
3. Trust/proof strip
4. Core product pillars
5. Product showcase
6. Use cases
7. Why different
8. Social proof/results
9. Final CTA
10. Footer

## Component Styling Rules
- Buttons: `border-radius: var(--bta-radius-full)`, confident contrast, subtle glow on primary only.
- Cards: dark glass style, layered depth, calm hover transform.
- Chips: dense, data-like, compact uppercase metadata where appropriate.
- Dropdowns: custom polished panels, never browser-default menus.

## Copy Rules
- Voice: sharp, confident, practical.
- Focus areas: live stat keeping, game operations, film review, AI coaching insights.
- Avoid: exaggerated claims, corporate filler, and generic AI language.

## Implementation Notes
- CSS variables live in their respective global stylesheets and drive Tailwind utility values in the marketing site.
- `shadcn/ui` base components should be customized with token-driven class variants.
- Section content should be centralized in a content config for fast iteration.
- This file is the reusable AI reference for future design edits in this repo.
- **When adding new tokens**: add to `apps/shared-ui/courtside-theme.css` first (Vite apps), then mirror in `apps/marketing-site/src/app/globals.css`.
