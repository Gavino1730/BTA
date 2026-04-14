# Changelog

All notable changes to this project should be documented in this file.

## Unreleased

- Organization member invites now return explicit `emailDelivery` status (`sent`, `disabled`, `failed`) and a `warning` message when delivery is unavailable or fails.
- Added organization invite resend endpoint support and coverage for `POST /api/org/members/:memberId/resend-invite`.
- Coach dashboard settings now surface invite delivery outcomes and include a resend email action for invited members.
- iPad operator setup was simplified to operator-owned settings (connection code, API URL/key, sound/haptics, device name), while team/opponent setup remains coach-controlled.
- Stripe checkout session creation now applies a shared professional checkout profile (promo codes, automatic tax, billing address, phone number, tax ID collection).
- Marketing site navigation/footer branding now uses `brand-icon.png`.
- Removed redundant favicon assets from workspace package roots where public/app asset paths already cover icons.
