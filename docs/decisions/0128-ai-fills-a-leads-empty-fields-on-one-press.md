# 0128 · AI fills a lead's empty fields on one press, with no review step

Status: accepted (builds on 0127; applies law 9 with the press as the consent)
Source: project owner's decision in session, 28/10/2026

## Context

0127 gave AI calls one gateway; the only feature on it was the lead scan, which
runs in the background. This is the first AI feature a person presses: a lead
arrives with a company name and a contact, and the rest of the company profile
is typed by hand.

## Decision

### 1 · The button and the flow

On a lead's profile, the "Doanh nghiệp" section header carries "Điền ô còn
thiếu". It shows only to someone who may edit the lead, when the lead has a
company name and a contact, and at least one fillable field is empty.

**There is no review step.** The press is the consent. The server writes, the
fields fill on screen, and a toast with "Hoàn tác" stays for 10 s. Three
rules hold the flow:

- only empty fields are written; a field that has a value is never overwritten;
- a value the AI is unsure of is still written, marked "Chưa chắc";
- a field a person edits afterwards loses its AI mark.

Fillable: legal name, tax code, website, address, province, category, main
product, industries, headcount, and the primary contact's title and phone.
Never filled: company, contact name, email, tier, need fields, owners, source.

### 2 · Four owner decisions

1. Contacts from the web: only as the company publishes them, and always with
   the source.
2. The fill writes the lead only, plus its primary contact's title and phone
   (through the contact writer); never the account book.
3. A tax code already owned by another account is not written. The screen shows
   the clash and offers "attach this lead to that account" (the existing
   account PATCH).
4. `website` is a field on lead and on account.

### 3 · Pipeline

`POST /sales/leads/:code/ai-fill`, permission `lead.edit`, scoped as the lead
PATCH is. Sources, surest first:

1. The contact's own mail domain, when it names an employer → website, sure.
2. The model with web search, through the gateway under a new task
   `lead-enrich`. A value counts only with the page it came from; a value the
   lead patch would refuse is dropped.
3. The tax registry (VietQR, behind a swappable interface) verifies a tax code:
   sure only when the registry's name folds to the lead's company or legal name
   exactly. Then tax code, legal name and address come from the registry. A
   registry that is down leaves the code unsure; it never fails the fill.
4. A duplicate check by tax root against the account book.
5. One transaction re-reads the lead under lock and writes only the fields
   still empty, with provenance and one audit line.

### 4 · Provenance

`sales.lead.ai_fill` (jsonb, migration 0153) holds, per field, source, unsure
and time. The source is a page URL or a fixed token (`tax-registry`,
`email-domain`). The lead PATCH drops the mark of every field present in its
body; that is also how "Hoàn tác" removes provenance, since undo is a PATCH
clearing the filled fields.

### 5 · Route and cost

Migration 0153 widens both task CHECKs and seeds the `lead-enrich` route row
(editable at the route door, as 0127 §2). The gateway gains an opt-in web
search: Gemini maps it to Google Search grounding, Anthropic to its web search
tool. **Per-search vendor cost is not in the ledger yet**; only tokens are.

### 6 · Law 9

Law 9 asks that AI waits for a button and shows its basis. Here the button is
the consent, the per-field caption "AI điền · <source>" is the basis, and
"Hoàn tác" is the way back. The review step of `AIAction` is replaced by these
three, not dropped.

### 7 · Reuse

The enricher takes a plain draft and returns per-field suggestions; it reads
and writes no table. `LeadAiFillService` is the only part that applies it to a
stored lead. A bulk step (sheet import, scan, before leads enter the DB) can
call the enricher directly; the owner asked for that as a next step, and it is
not built.

### 8 · Components

Kit components M-21…M-24 (button, field states, field mark, tax-code clash) in
`@pv/ui`; the result toast reuses `Toast` (O-08) with an undo action and
carries no component of its own (M-25 in the kit is the example of it).

## Consequences

- Ship order: migration 0153 before the API; the new API reads the new columns
  and the route row.
- A mistaken fill costs one press of "Hoàn tác" within 10 s, or editing the
  field by hand afterwards.
- Open questions 124–127 hang on this decision.

## Amendment 28/10/2026 (see 0130)

"Headcount" in §1 is now `sizeBand`, a band; the pipeline in §3 is two model calls, identify then read the site. Migration 0156 renames the `headcount` key in `lead.ai_fill`.
