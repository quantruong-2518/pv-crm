# 0084 · One admission gate decides every lead before it is written; each door chooses its own reaction to the verdict

Status: accepted (replaces 0070 §B where it says file-import duplicates are written and flagged)
Source: project owner's decisions in chat, 11/10/2026

## Context

Four doors write a lead: the manual form, file import, the image / business-card
scan, and the public landing form. Each matched duplicates differently. Manual
and landing did no lead-level check. File import dropped rows on a narrow key
(folded name + company + phone). Scan matched only on lead email or tax-code
root, and was the only door that merged a new contact into an existing lead.
Accounts are unique on raw tax code, else lower-trimmed name
(`account_identity_uniq`), so spelling variants opened second accounts. Nothing
told the user that a new lead was attached to an existing company.

## Decision

### 1 · One gate, shared decision, separate reactions

Before any lead is written, for every door present and future: normalise keys →
load candidates for the whole batch in a fixed number of reads → a pure
decision → write through the reusable account / contact / lead writers under a
lock. Each door decides its own reaction to the verdict; the decision is
shared, the reaction is not.

### 2 · Where it lives

- Key normaliser (the only one): `packages/engines/src/lead-keys.ts`
- Pure decision: `packages/engines/src/lead-admission.ts`
- Wire shapes: `packages/contracts/src/sales/lead-admission.ts`
- Service, with its repository and mapper beside it:
  `apps/api/src/branches/sales/lead/lead-admission.service.ts`
- Stored keys and indexes: `apps/api/drizzle/0097_admission_keys.sql` and
  `apps/api/drizzle/0098_email_domain_idx.sql`

### 3 · Two questions, five verdicts

Two questions in order: which company, then is this person / enquiry already
there. Five verdicts — `new-account`, `same-lead`, `new-contact`,
`returning-account`, `needs-review`. Their definitions are the engine file in
§2, not here.

### 4 · Strong and weak evidence

Tax-code root, folded company name (when the two sides do not carry different
tax roots) and a person's email are strong. Email domain alone and phone alone
are weak and never decide on their own. A name alone identifies a person only
when it is all they came with.

### 5 · Reaction per door

- **Manual form** asks the user: check first, then create with the choice it
  saw. The server re-decides under the lock and refuses a stale choice. A
  seller cannot open a second lead on a customer held by someone else; that
  goes to the head of sales. `needs-review` does not bypass the fence: a caller
  who may not assign leads cannot `create-lead` when any candidate lead belongs
  to someone else.
- **Landing** never refuses and never asks. An exact repeat by a known person
  (`same-lead`) leaves a `re-entered` touch, no new lead and no second alert. A
  new person at a known company (`new-contact`) opens a new lead attached to
  the matched account, so the normal internal alert goes out — an enquiry is
  never silent. Uncertain evidence still becomes a new lead.
- **File import** keeps "a row already in the book is dropped and reported", so
  re-importing a file is idempotent. A `needs-review` row that the caller's
  fence forbids is dropped and reported, not written. It now also attaches a new lead to an
  existing account, or adds a new person to an open lead in the importer's
  scope.
- **Scan** decides through the same gate: `planLeadScan` in
  `packages/engines/src/lead-scan.ts` takes the same book slice and calls the
  same decision, and its outcomes map from the verdicts. A person already in
  scope merges into that lead and leaves a `re-entered` touch; out of scope the
  group is held; a new company becomes a new lead; a company already in the book
  with no open lead gets a new lead on that account; `needs-review` is held,
  nothing written, and a person types it. The commit re-decides under the gate
  lock per group and holds a group when the book no longer supports the planned
  outcome. Two scanned groups returning to one company open one lead between
  them.

### 6 · Who added it

Every door already wrote `lead.created_by` and `lead.source_kind` (the creator
is empty for the anonymous landing door). This change adds `account.created_by`
and the `re-entered` touch, which records who entered a customer again and
through which door when no lead was created.

### 7 · Concurrency

An advisory lock on the company keys and person emails, taken inside the write
transaction — not a unique index, because emails and phones are not
legitimately unique on leads. After deciding, the writer also locks the
account(s) the decision resolved to and re-decides once, because two writers
can reach one account through different keys.

### 8 · `account_identity_uniq` is deliberately unchanged

Production may already hold accounts equal under the new folding, so
tightening it waits for a clean-up of existing duplicates (question 43).

### 9 · What a match in someone else's book reveals

A match in someone else's book is reported without the lead code and never
with the owner's name. The account is withheld too whenever the matched lead is
out of the caller's scope. An account code is shown only when the caller holds
a live lead on that account, or no lead of it — open, closed, switched off or
unowned — lies outside the caller's scope; an anonymous caller is shown
nothing. The rule is in
`apps/api/src/branches/sales/lead/lead-admission.mapper.ts`. The reason: the
account profile lists the account's leads, owners and contacts without a scope
filter, so an account code is as good as the lead code.

## Consequences

- Existing duplicates are not merged; there is still no lead-merge or
  account-merge feature.
- Debt: rows written before the gate have empty keys until the backfill runs
  (`apps/api/src/branches/sales/lead/lead-admission.backfill.ts`, script
  `db:backfill:admission-keys` in `apps/api/package.json`). Ship order is
  migrate → deploy → backfill, and the seed script fills keys, so only databases written before the gate
  need the backfill.
- A scan merge no longer writes its own `field-filled` row naming the batch: a
  fill of empty company fields with no new person leaves only the `re-entered`
  row.
- A company-record mailbox (e.g. a general `info@` address on a profile) is no
  longer evidence against the book, so a profile-only group that used to merge
  is now held for missing a contact email.
- A group that joins a lead opened earlier in the same batch is counted in none
  of the scan result's created / merged / held figures.
- Debt: on a re-delivered scan job the second group of a same-company pair is
  skipped and its people are not attached; it needs per-group progress in the
  scan result contract.
- File import reports people added to an existing lead in their own `joined`
  list rather than among duplicates.
- The `re-entered` touch is stored but no screen lists it yet: the lead profile
  has no surface for non-rung touches since ADR 0078.
- Debt: contracts keep a second `foldText` / `leadDupKey`, used by the web's
  in-file grouping, which folds differently from the engine normaliser.
- Adding people on re-entry writes exactly the people the gate named; the
  contact service's own "already here" test is not consulted on this path.
- File import honours the engine's batch grouping for a returning company (two
  spellings open one lead) and moves the non-repeated people of a repeated
  draft onto the first lead.
- `contact.name_key` was removed before shipping; the gate folds names from the
  raw columns.
- The account profile's unscoped listing of leads, owners and contacts predates
  this change and is the reason for §9's rule.
- Debt: the `/ship` skill (`.claude/skills/ship/SKILL.md`) has no backfill step
  yet.
- Debt: a `needs-review` that resolves to no single account still opens an
  account by raw identity when the user or a batch door creates anyway.
- Debt: the check door is an unthrottled, unaudited probe for "is this mailbox
  / phone / name in the book".
- Debt: a person's email is strong evidence even when the incoming company name
  is different and unmatched, so a person who changed employer gets the new
  lead attached to the old company.
- A landing re-entry does not send a second internal alert; the existing rule
  that a repeated submit must not mail again still holds.
- No automated test locks the decision (repo rule: no unrequested tests); it
  was exercised by hand on local PGlite.

## Open

Not decided; each is a numbered question in `open-questions.md`:

- Two open leads on one company (question 39).
- A re-entry through file import leaving a touch (question 40).
- Landing auto-attach (question 41).
- Sourcing credit on a duplicate (question 42).
- Tightening `account_identity_uniq` (question 43).
- A seller's request to the head of sales (question 44).
- Claiming a customer whose leads are unowned (question 49).
- Filtering the account profile by scope (question 50).
- Rate-limiting or auditing the check door (question 51).
- Downgrading an email-only match with an unmatched company name (question 52).
- A scan that adds nothing new leaving a `re-entered` row every time (question 45).
- A company-record mailbox as evidence against the book (question 46).
- Where a `re-entered` touch shows on the lead profile (question 47).
- A file-import row with uncertain evidence waiting for a person (question 48).
