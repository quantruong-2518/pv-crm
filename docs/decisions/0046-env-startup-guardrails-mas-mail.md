# 0046 · `env.ts` refuses to start on four unsafe MAS mail configurations

Status: accepted
Source: docs/ban-giao-campaign.md — section "Ba hàng rào cấu hình — và vì sao chúng phải là hàng rào"

## Context

The local `.env` had reached a state where `DATABASE_URL` pointed at
**production** Neon, `PV_EMAIL_ENABLED=true`, `PV_MAS_ENABLED=true`, and
three values were each individually valid-looking but jointly dangerous:

- `PV_EMAIL_MAS_FROM` shared the same `notify.` domain as `PV_EMAIL_FROM` —
  firing bulk mail from the already-warmed-up transactional subdomain, the
  exact thing `ban-giao-mas-mail.md` (now ADR 0042) writes in capitals: DO
  NOT TOUCH. Two variables kept apart that get filled with the same domain
  build the form of separation and lose all of its effect.
- `PV_API_PUBLIC_URL=http://localhost:4123` — the real unsubscribe link
  inside a live letter points at the **recipient's own machine**. A silent
  unsubscribe attempt turns into a spam complaint, and Resend's complaint
  ceiling is 0.08%.
- `PV_MAS_SENDER_POSTAL="Pebble Vina · [postal address not yet supplied]"` —
  a placeholder string printed straight into the footer of every marketing
  letter. The old `.refine` only counted characters, so it read as fine.

## Decision

All three slipped through because they are **individually valid-looking
values**. `env.ts` now refuses to boot on:

- the same domain used for both transactional and MAS mail (when both send
  gates are open at once)
- `PV_API_PUBLIC_URL` pointing at localhost (under the same condition)
- a postal address string containing square brackets

Plus a fourth guardrail, unrelated to MAS but in the same family:
`PV_EMAIL_WORKER_CONCURRENCY ≤ PV_EMAIL_RATE_PER_SECOND` — losing that race
means a `retry` spends the same budget as a real Resend error, so raising
thread count to "go faster" instead parks letters as `dead` without going
any faster.

## Consequences

`.env` was lowered to `PV_MAS_ENABLED=false` to match; transactional mail is
unaffected. It can be turned back on as soon as `go.pebblevina.com` finishes
DKIM verification and the API has a real public host.
