# 0130 · Prompts are versioned specs; lead fill reads the company in two calls; size is a band; provinces use the 2025 names

Status: accepted (amends 0128: headcount becomes `sizeBand`, one search call becomes two; amends 0127: the ledger carries `prompt_version`)
Source: project owner's decisions in session, 28/10/2026 (slice A-1 of `.claude/HANDOFF-ai.md`)

## Context

0128's fill ran one prompt written as free text, asked for "headcount" as a
number the web rarely states, saved provinces as people typed them, and had no
way to tell which prompt text produced a given fill. Quality could be neither
measured nor traced.

## Decision

### 1 · A prompt is a versioned spec

Every prompt is standardised, for every item: context, ordered steps, a spec per
returned field (what it is, sources in priority order, how to find it, output
format, when it is "unsure", an example), the output format and the global
rules. A spec is data (`PromptSpec` in `apps/api/src/platform/ai/prompts/`),
rendered to text by one deterministic renderer. Field specs are shared and
reusable (the lead fill now, the bulk fill and the scan later). Data a run
supplies (the lead, the closed lists) goes in the user message, never into the
spec.

`prompt_version` (`id@version`) is written on every `platform.ai_call` row. The
version goes up on every edit that changes the rendered text.

### 2 · Two calls instead of one

1. **Identify** the company (official website, tax code, legal name, head-office
   address, province) by web search. The server verifies the tax code with the
   registry (VietQR) as in 0128 §3.
2. **Read** the website the first call identified, for products, category and
   industries (closed lists from config), size, factory address and the named
   contact's title and phone.

Gemini's thinking level is MEDIUM for these research calls; the scan keeps LOW.
Anthropic gets the same knob as `output_config.effort`. The enricher keeps its
public shape (draft in, per-field suggestions out), so `LeadAiFillService` and
a bulk step do not change.

### 3 · Size is a band

"Số người tại chỗ" becomes "Quy mô", stored as `size_band`: `lt50`, `50-200`,
`200-500`, `500-1000`, `gt1000`. Labels: "Dưới 50 người", "50–200 người",
"200–500 người", "500–1.000 người", "Trên 1.000 người". Each band includes its
lower bound: 200 is `200-500`, 1,000 is `gt1000`. The AI marks a band sure only
when the company's own site states it.

### 4 · Provinces: bare names, the 2025 units

A province is stored as the bare name, without "Tỉnh" / "Thành phố" / "TP.",
and as one of the 34 units after the 2025 merger; an old name maps to the unit
that absorbed it. The server normalises on every write of `province` (lead,
account, scan, import, AI); migration 0156 backfills the stored rows. Text that
matches nothing is kept as typed. The mapping lives twice, as `normaliseProvince`
in `@pv/contracts` and as `legacy_normalise_province` in the migration; each
comment names the other.

### 5 · Address

The factory address from the site; when the site does not give one, the
registry's head-office address, marked unsure.

### 6 · Eval harness

`pnpm ai:eval` runs the real enricher over real leads with known answers and
prints per-field accuracy, unsure rate, latency and prompt versions. It costs
money: it prints an estimate and calls nothing without `--yes`. The data file
is customer data and stays gitignored (the `.ai-eval` folder of the api app); the script's
docblock documents its shape.

### 7 · Quota

One press is now two calls. Migration 0156 raises the `lead-enrich` route to
8192 output tokens, 60000 ms and 200 calls per user per day, only where the row
still holds 0153's seed values; an admin's edit is never overwritten.

### 8 · Ship order and the follow-up

Migrate before deploy. Until the new API runs, temporary triggers
(`*_legacy_size_province_sync`) turn the old API's writes (headcount, raw
province) into the new form. Migration 0156 is additive: `headcount` stays.

Follow-up migration DROP list: the `headcount` columns on lead and account, the
legacy triggers and functions (`legacy_size_province_sync`, `legacy_size_band`,
`legacy_normalise_province`), and `headcount` from the `required_filled`
expression.

### 9 · Not in this slice

Many contacts (A-3) and the background tray (A-2); see `.claude/HANDOFF-ai.md`.

## Consequences

- A change in fill quality traces to a prompt version through `ai_call`.
- A fill costs about twice the calls and more thinking per press.
- `headcount` stays readable this ship; the forms stop writing it.
- Open questions 132–134 hang on this decision.
