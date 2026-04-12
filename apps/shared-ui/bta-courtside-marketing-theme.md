# BTA Courtside Marketing Theme Rules

## Purpose
Use this as the source of truth for premium marketing styling decisions for the BTA Courtside web presence.

## Core Direction
- Mood: composed, fast, intelligent, premium.
- Visual tone: dark, structured, interface-led, high-contrast.
- Avoid: generic SaaS sections, cartoon sports motifs, neon overload, betting-app look, fitness-brand look.

## Color Tokens
Apply these tokens through CSS variables in the marketing app global stylesheet.

- --bg-base: #090c14
- --bg-elevated: #0e1320
- --panel-1: rgba(16, 24, 39, 0.72)
- --panel-2: rgba(18, 28, 46, 0.78)
- --panel-3: rgba(38, 54, 84, 0.5)
- --text-primary: #f4f7ff
- --text-secondary: rgba(229, 236, 255, 0.76)
- --text-tertiary: rgba(206, 216, 242, 0.56)
- --accent-primary: #4f6dff
- --accent-secondary: #25d2c5
- --accent-on: #f6f8ff
- --accent-glow: rgba(79, 109, 255, 0.55)
- --border-soft: rgba(175, 196, 248, 0.18)
- --border-strong: rgba(190, 212, 255, 0.35)
- --ring: rgba(107, 133, 255, 0.75)

## Typography Rules
- Display font: Cormorant Garamond.
- Body/UI font: Manrope.
- Headline behavior: high contrast, large, tight line-height.
- Body copy behavior: concise, neutral, utility-focused.
- Avoid long paragraphs and buzzword copy.

## Elevation and Surface Rules
- Glass panels require: translucent dark panel, soft border, large blur, deep shadow.
- Shadows:
  - --shadow-md: 0 12px 34px rgba(0, 0, 0, 0.32)
  - --shadow-lg: 0 24px 56px rgba(0, 0, 0, 0.42)
  - --shadow-xl: 0 34px 90px rgba(0, 0, 0, 0.55)
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
  - Prefer transform and opacity over layout-triggering animation.
  - Respect reduced-motion preferences.

## Data Object Language
Floating elements should represent product reality.

Allowed motifs:
- Shot chart dots
- Player tags
- Timeline markers
- Score widgets
- Possession arrows
- Substitution indicators
- Live status chips
- AI insight badges
- Court coordinate nodes
- Stat cards
- Play sequence fragments
- Film cue markers

Disallowed motifs:
- Decorative confetti not mapped to basketball data semantics.
- Cartoon sports graphics.
- Generic futuristic HUD clutter with no product meaning.

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
- Buttons: rounded full, confident contrast, subtle glow for primary only.
- Cards: dark glass style, layered depth, calm hover transform.
- Chips: dense, data-like, compact uppercase metadata where appropriate.
- Dropdowns: custom polished panels, never browser-default menus.

## Copy Rules
- Voice: sharp, confident, practical.
- Focus areas: live stat keeping, game operations, film review, AI coaching insights.
- Avoid: exaggerated claims, corporate filler, and generic AI language.

## Mapping Guide
- CSS variables live in global stylesheet and drive Tailwind utility values.
- shadcn/ui base components should be customized with token-driven class variants.
- Section content should be centralized in a content config for fast iteration.
