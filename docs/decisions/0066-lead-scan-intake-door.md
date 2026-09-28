# 0066 · A fourth lead intake door reads photos and files through Gemini, deterministic grouping, no AI-preview block

Status: accepted
Source: project owner's decision in session, 28/09/2026

## Context

`/sales/leads/scan` is a fourth door onto `sales.lead`, alongside manual entry,
CSV import and the Apollo import — someone drops a stack of business-card
photos or scanned profile sheets and expects leads out the other end. Nothing
in the existing intake path reads an image, and nothing in the codebase before
this stored an uploaded file at all (open question 10 in `open-questions.md`
about Apollo dedup and ADR 0029's non-scope note both assumed there was no
attachment store to lean on).

## Decision

### 1 · Source, trust and ownership

New `sales.lead` source kind `SCAN`, trust level `DECLARED` — the uploader has
reviewed and owns every row that comes out, unlike an import that trusts the
file. The scan motion table only derives `EVENT` (a campaign was picked) or
`OUTBOUND` (none was); `REFERRAL`/`PARTNER` were dropped from it —
`scan_batch_motion_known` and `scan_batch_motion_matches_campaign` in
`apps/api/src/branches/sales/lead/lead-scan.schema.ts` hold exactly that pair,
one campaign per batch, never per company. The owner of every lead created
from a batch is the uploader, not a picked-later PIC.

### 2 · Flow: three steps plus a result screen, one button, sequential per-company transactions

Drop → AI reads → preview & create, then a result screen that redirects to the
lead book. The "Tạo N lead" button commits per company **sequentially**, each
company in its own transaction
(`apps/api/src/branches/sales/lead/lead-scan.commit.ts`) — one bad company does
not roll back the ones already written, and does not need a savepoint scheme
to avoid that.

Matching against existing leads, decided per company:

- a match with an **in-scope** lead fills only the fields that were empty and
  adds the new contacts;
- a match with an **out-of-scope** lead is held back (`HELD_OTHER_OWNER`)
  without revealing which lead or account it collided with — scope is a
  visibility rule, and naming the match would leak through it; an in-scope
  match always wins over an out-of-scope one when both exist;
- a company with no contact email is **not** created — it is held
  (`HELD_MISSING_CONTACT`) and its files sit unlinked until the 30-day purge
  (§7) removes them; there is no later screen to come back and complete it;
- a company with no name takes its primary contact's email as the name.

A field the AI could not read with confidence, or read two different ways
across the batch's files, is shown to the reviewer as `INFERRED` ("Chưa chắc"
— `apps/web/src/pages/lead-scan-model.ts`) rather than silently picked
(`ScanFieldConfidence` in `packages/engines/src/lead-scan.ts`).

### 3 · AI reads, code decides — one interface, deterministic grouping

Reading is Gemini Flash (`gemini-3.8-flash`, model name from env
`SCAN_GEMINI_MODEL`, paid tier so the images are not used for Google's
training) behind one interface,
`apps/api/src/platform/ai/scan-reader.ts` — chosen over Claude on a straight
price comparison for this job, and swappable behind the interface if that
changes. The interface exists so the model choice is not load-bearing
anywhere else.

Grouping and dedupe across the pages of one batch is deliberately **not**
asked of the model: `packages/engines/src/lead-scan.ts` runs union-find over
the same shared keys — tax-code root, email, normalised phone, non-free-mail
domain, folded company name — so two entities link whenever they share any
one of these, and the order the links are made in does not change the result.
Matching a group against the existing lead book uses tax-code root first,
then email; an in-scope match always outranks an out-of-scope one when a
group hits both. A read result is cached by the sha256 of the original file,
but only reused across batches belonging to the **same** `created_by`
(`LeadScanRepository.cachedReads` joins `scan_batch` on it) — the hash is
declared by the browser and never verified, so pooling it across uploaders
would let one person plant a read another person's batch then reuses.

### 4 · Law 9 deviation: no "AI đề xuất / Căn cứ / Chưa tạo gì cả" block

The preview step ships without the standard basis block. The owner removed it
deliberately: the summary tiles on that step carry the same job — they
_are_ the basis — and nothing is written to `sales.lead` until the person
presses the button, so the substance of law 9 (an AI action always waits for a
button) holds even though its usual widget does not appear here.

### 5 · First real attachment store

Tigris (S3-compatible) in production, disk locally, both behind
`apps/api/src/platform/storage/` and one generic `platform.attachment` table —
not a lead-scan-specific one, so the next feature that needs a file does not
open a second store. The browser uploads directly to storage via a presigned
PUT, not through the API process. Images are re-encoded client-side in a Web
Worker to at most 2048px on the long edge, WebP (falling back to JPEG where
WebKit cannot encode WebP), with a JPEG thumbnail kept alongside. PDFs are
uploaded as-is; only pages 1–4 and the last 2 are sent to the AI reader, on
the assumption that a long scanned profile keeps its identifying pages at the
front and its signature/stamp pages at the back.

This partially supersedes ADR 0029's line "no server-side PDF generation, no
dedicated attachment store" — the PDF-generation half stands, the
no-attachment-store half does not; see `apps/api/src/platform/storage/` for
what replaced it. A pointer line was added to 0029 rather than rewriting it.

### 6 · Scanned contacts are not opted in to MAS

A `SCAN` lead keeps its campaign attribution (for reporting: which event or
outbound push produced it) but is **not** enrolled as a campaign member, so it
draws no MAS wave. Uploading a photo of a business card is not the contact
opting into marketing mail.

### 7 · Retention: one sweep every 15 minutes, three rules

`LeadScanSweeper` (`apps/api/src/branches/sales/lead/lead-scan.sweeper.ts`)
runs on the 15-minute rung itself, in both the API process and the worker,
because a daily pace would leave a batch stuck for up to a day before the
15-minute rule ever got to look at it:

- a batch stuck in `UPLOADING` for more than a day is failed;
- a batch stuck in `READING` or `COMMITTING` for more than 15 minutes is
  failed — a read is one model call and a commit a handful of short
  transactions, so 15 minutes past either means the worker holding it died;
- a file in `platform.attachment` that nothing points to for more than 30
  days is deleted, in its own pass so a failed purge cannot undo the expiries
  above it.

### 8 · The commit re-checks the uploader's standing, not just their name

`LeadScanCommit.commitOnce` re-fetches the uploader through
`ActorRepository.byId` and checks `disabled_at`, then re-asks E2 —
`access.check(actor, { branch: 'Sales', permission: 'lead.edit' })` — before
writing anything. Missing, disabled or no-longer-permitted all fail the batch
(`CREATOR_REVOKED`) with nothing written. The commit job runs later, in a
worker, in the uploader's name but outside their request — this is the same
question the route asked at upload time, asked again at the moment it
actually matters: after whatever time a batch sat in the queue.

### 9 · Drop zone reuses `.drop-dots`

The drop target uses the existing `.drop-dots` edge treatment. It reads as a
border under law 4, but the class already exists precisely as the sanctioned
non-`border` way to mark a droppable edge, so this needs no new exception.

### 10 · Batch and file limits live in the contract

50 files per batch, 25 MB raw per file, as constants in
`packages/contracts/src/sales/lead-scan.ts` — not hand-checked separately on
each side of the wire.

## Consequences

The attachment store is now real infrastructure, not a placeholder: other
features can use `platform.attachment` and the presigned-upload path instead of
inventing their own. The Gemini dependency is one interface deep, so a later
price or quality argument for switching models does not touch
`lead-scan.service.ts` or the commit path. Law 9's CI check
(`AiActionProps.basis`) does not see this screen's compliance — it holds by
inspection, not by the gate, and is worth re-checking by eye if the preview
step is ever redesigned.

## Alternatives rejected

**Asking the model to group and dedupe pages itself.** Rejected: the same two
cards would not reliably group the same way twice, and the deterministic
union-find in `packages/engines/src/lead-scan.ts` is cheap and auditable where
a model call is neither.

**One transaction for the whole "Tạo N lead" click.** Rejected under §2: a
single bad company would roll back every company in the batch, including ones
that had nothing wrong with them.

**A lead-scan-specific attachment table.** Rejected under §5: the same need
(store a file, serve it back, sweep the orphans) was about to recur for the
next feature that touches a file, and a generic `platform.attachment` table
costs nothing extra now.
