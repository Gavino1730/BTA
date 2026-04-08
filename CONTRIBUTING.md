# Contributing to BTA Platform

Thanks for helping improve BTA.

## Before you start

1. Open an issue for significant behavior changes.
2. Keep changes minimal and scoped.
3. Preserve existing event names, payload shapes, and route names unless the change explicitly requires updates.

## Local setup

```bash
npm install
npm run build
npm run test
```

Run apps/services as needed:

- `npm run dev:api`
- `npm run dev:operator`
- `npm run dev:coach`

## Development expectations

- Treat `packages/shared-schema` as contract source of truth.
- Keep replay behavior deterministic in `packages/game-state`.
- Avoid direct app-to-app imports; share code through `packages/*`.
- Add tests with behavior changes (prefer vitest tests near changed modules).

## Pull request checklist

Before opening a PR, confirm:

1. `npm run build` passes.
2. `npm run test` passes.
3. If API env behavior changed, `npm run validate:env` passes.
4. New behavior has tests, or the PR explains why tests are not practical.
5. Docs are updated when public behavior, scripts, or environment contracts change.

## Commit guidance

- Use clear commit messages with a short imperative subject.
- Keep unrelated refactors out of the PR.
- If payload contracts changed, update all producers and consumers in the same PR.

## Review focus

Reviewers prioritize:

- Live game reliability and regression risk
- Deterministic replay safety
- Multi-tenant safety and auth correctness
- Backward compatibility of shared contracts
