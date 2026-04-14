## Release summary

One or two sentences describing this release.

## Highlights

-
-

## Reliability and operations

- Any impact to ingest, replay, fouls, periods, lineups, or socket fanout.
- Any production env contract updates.
- Invite email delivery behavior (`sent`/`disabled`/`failed`) and fallback messaging.
- Billing checkout behavior (tax, billing address, phone, tax ID collection).

## Migration notes

-

## Verification checklist

- [ ] `npm run build`
- [ ] `npm run test`
- [ ] `npm run validate:env` (if API/env behavior changed)
- [ ] Invite creation and resend endpoints return expected `emailDelivery` shape
- [ ] Checkout session flow validated in staging
