# 0005 · Run on Fly.io + Neon — conditional, not the final answer

Status: accepted (conditional — see section "Not locked in")
Source: docs/ban-giao-api.md — section "Where it runs — Fly.io + Neon, conditional"

## Context

`docs/ban-giao-backend.md` left two questions open: the BE framework (later
locked in as NestJS — ADR 0007) and where the BE runs. Where it runs locked in
on **26/08**: a container host first, ECS/RDS once there is someone on ops
duty — the team currently has no one on ops duty.

## Decision

**Fly.io** (API + worker, two processes sharing one image,
`apps/api/fly.toml`) · **Neon** (managed Postgres). Compared to AWS: estimated
cost ~30–45 USD/month at the current scale, while AWS RDS + ECS Fargate + ALB
struggles to stay under 150 USD/month even at low traffic because ALB and RDS
carry fixed floor costs regardless of load. A PaaS (Fly) is cheaper to operate
than a self-managed IaaS (bare Vultr VM) or self-managed AWS.

The build still goes through the existing `apps/api/Dockerfile`, not a
buildpack — Fly.io itself recommends against buildpacks for a monorepo.
"No Docker" is only true for the day-to-day dev workflow (still
`pglite://`); Docker is now only a build recipe on the Fly side.

**No microservices.** Modular monolith, modules split by BRANCH, one Postgres
with multiple schemas. Three reasons live in the code itself: `E2.check()`
runs inside a loop filtering row by row, so it cannot become an RPC call;
`E1.story()` traces ACROSS branches, so splitting the database would be a
distributed traversal; and the invariant "a lead changes exactly once" is one
transaction in a monolith, a compensating saga in microservices. Heavy work is
split by PROCESS (`worker.ts`), not by service.

## Not locked in

**Conditional, not the final call:** this decision DELIBERATELY skips over
Decree 53/2022 (in-country data residency) — neither Fly.io nor Neon has
infrastructure in Vietnam; the closest is Singapore. The legal question in
`docs/ban-giao-backend.md` remains open, unanswered here. If legal confirms
in-country storage is mandatory, the part that must change is **Neon → Vultr
Managed Database or a VN cloud** (Viettel IDC/VNG/FPT/CMC — Vultr has a Ho Chi
Minh City datacenter, needs re-confirming before picking); Fly.io/Vercel do
not hold data at rest, so they would not need to change.

## Consequences

Four things not yet done as of the 24/08 preparation cut (out of scope for
that pass — only config was drafted, nothing deployed yet): create the
Fly.io + Neon accounts, `fly launch`/`fly deploy` with a real `DATABASE_URL`,
set `VITE_API_URL` on Vercel. All four need human hands, not scriptable
because they touch real accounts/secrets.
