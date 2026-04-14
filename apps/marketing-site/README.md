# BTA Courtside Marketing Site

Next.js App Router marketing surface for BTA Courtside.

## Local Development

From repo root:

```bash
npm run dev:marketing
```

Or directly in this workspace:

```bash
npm run dev
```

## Production Build

From repo root:

```bash
npm run build -w @bta/marketing-site
```

## Environment

- `NEXT_PUBLIC_SITE_URL`: canonical public URL used by metadata, robots, and sitemap.
	- Example: `https://btaintel.com`
- `NEXT_PUBLIC_DASHBOARD_URL`: coach dashboard base used by marketing CTAs and login handoff links.
	- Example: `https://dashboard.btaintel.com`
- `NEXT_PUBLIC_API_BASE`: realtime API base used by marketing intake flows.
	- Example: `https://api.btaintel.com`

Use `apps/marketing-site/.env.example` as a starting point for local development.
