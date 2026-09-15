# 0049 · `MAIL_COMPOSER` is supplied by the Sales branch through a token, inverting the platform→branch dependency

Status: accepted
Source: docs/ban-giao-mail.md — section "Biên giới: giữ được gì, nới chỗ nào"

## Context

What the transactional mail build keeps unchanged: `platform/` does not
import `branches/`, the engine does no I/O, a repository does not decide
anything, `apps/api` does not know React, and a branch emits an event rather
than choosing a channel.

Building the body of a lead-intake letter needs `sales.lead` and
`sales.lead_intake`, but `platform` is not allowed to know a branch's
tables.

## Decision

The one place the dependency direction is deliberately allowed to run
backward, with the reason written at the site: **`MAIL_COMPOSER` is supplied
by the Sales branch.** The worker asks through a token and never knows which
branch answered. Today there is exactly one composer; the day a second
branch needs a template, this spot becomes a **registry keyed by
`delivery.template`**.

## Consequences

Adding a second branch's mail composer means turning `MAIL_COMPOSER` from a
single token into a registry dispatched by `delivery.template`, not adding a
second token or a branch-specific worker path.
