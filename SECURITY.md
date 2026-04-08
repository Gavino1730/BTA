# Security Policy

## Supported versions

Security fixes are applied to the default branch.

## Reporting a vulnerability

Please do not open public issues for security reports.

Use one of these channels:

1. Open a private GitHub security advisory (preferred)
2. Contact maintainers directly through repository owner contact

Include:

- Vulnerability type and impact
- Reproduction steps or proof of concept
- Affected components and environment details
- Any suggested mitigation

## Response targets

- Initial acknowledgment: within 72 hours
- Triage and severity assessment: within 7 days
- Fix timeline: based on impact and exploitability

## Security priorities for this platform

- Tenant isolation and scope enforcement
- AuthN/AuthZ correctness on write routes and sockets
- Event payload validation and persistence safeguards
- Safe handling of secrets and production environment contracts
