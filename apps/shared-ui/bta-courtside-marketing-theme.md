# BTA Courtside Marketing Theme Rules

## Purpose
Use this as the source of truth for premium marketing styling decisions for the BTA Courtside web presence.

## Core Direction
- Mood: composed, fast, intelligent, premium.
- Visual tone: dark, structured, interface-led, high-contrast.
- Avoid: generic SaaS sections, cartoon sports motifs, neon overload, betting-app look, fitness-brand look.

## Color Tokens
Apply these tokens through CSS variables in the marketing app global stylesheet.

Brand Primaries:
- --accent-primary: #6E5BFF (Courtside Violet)
- --accent-primary-dark: #4636C9 (Deep Violet)
- --hero-tone: #2B235C (Night Indigo)

Background System:
- --bg-base: #0D1020
- --bg-elevated: #151A30
- --panel-1: #151A30
- --panel-2: #1C2340
- --panel-3: #2B335A
- --border-soft: #2B335A
- --border-strong: #3B4678

Text System:
- --text-primary: #F7F8FC
- --text-secondary: #C9CDE3
- --text-tertiary: #8E95B8
- --text-disabled: #666C8F

Accent Colors:
- --accent-secondary: #46D7FF (Signal Cyan)
- --accent-success: #38E39F (Victory Green)
- --accent-signal: #FFB84D (Alert Amber)
- --accent-danger: #FF5D73 (Competitive Red)
- --accent-ivory: #F5EDE2 (Soft Ivory, headings emphasis only)

Interaction:
- --accent-on: #FFFFFF
- --accent-glow: rgba(70, 215, 255, 0.4)
- --ring: rgba(70, 215, 255, 0.5)

## Typography Rules
- Display font: Instrument Serif.
- Body/UI font: Inter.
- Headline behavior: high contrast, large, tight line-height.
- Body copy behavior: concise, neutral, utility-focused.
- Avoid long paragraphs and buzzword copy.

## Gradient System
- Hero gradient: linear-gradient(135deg, #2B235C 0%, #4636C9 45%, #6E5BFF 100%)
- CTA gradient: linear-gradient(135deg, #6E5BFF 0%, #46D7FF 100%)
- Subtle background wash: radial-gradient(circle at top right, rgba(110,91,255,.22), transparent 45%)

## Exact UI Usage
- Navbar:
  - Background: rgba(13,16,32,.72) blur
  - Border: #2B335A
- Hero card:
  - Background: #151A30
- Primary button:
  - Background: #6E5BFF
  - Text: white
  - Hover: #7C6BFF
- Secondary button:
  - Background: transparent
  - Border: #2B335A
- Cards:
  - Background: #151A30 or #1C2340
- Charts/stats:
  - Primary: #6E5BFF
  - Secondary: #46D7FF
  - Positive: #38E39F
  - Warning: #FFB84D
  - Negative: #FF5D73

## Color Ratio Rule
- 70% dark neutrals
- 20% violet tones
- 10% accents

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
- This file is the reusable AI reference for future design edits in this repo.
