## Summary

Describe the change and why it is needed.

## Type of change

- [ ] Bug fix
- [ ] New feature
- [ ] Breaking change
- [ ] Docs or tooling update

## Affected areas

- [ ] `apps/coach-dashboard`
- [ ] `apps/ipad-operator`
- [ ] `services/realtime-api`
- [ ] `services/insight-engine`
- [ ] `packages/shared-schema`
- [ ] `packages/game-state`
- [ ] Other

## Reliability checklist

- [ ] Shared contract changes are synchronized across producers/consumers
- [ ] Game-state behavior remains deterministic/replay-safe
- [ ] Multi-tenant and auth boundaries remain enforced
- [ ] No direct app-to-app imports introduced

## Validation

- [ ] `npm run build`
- [ ] `npm run test`
- [ ] `npm run validate:env` (if API/env behavior changed)
- [ ] Invite create/resend flow validated (`emailDelivery` + warning behavior)
- [ ] Billing checkout session flow validated in staging (tax/billing collection)

## Screenshots or logs (if relevant)

Add before/after screenshots, API examples, or test logs.

## Linked issues

Closes #
