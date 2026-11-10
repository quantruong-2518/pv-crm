# 0139 · Journeys link as a tree, every object gets a Documents shelf, and every book exports and imports

Status: accepted
Source: project owner's decisions in session, 27/09/2026 ("ĐÃ CHỐT"), recorded retroactively from the retired `.claude/HANDOFF-workstream-loop.md` (git history), flows I, J and K. Design canvas https://claude.ai/artifact/GWVAqJSDxm87NwbgT6eGB5 (board `F-Company`). The handover marked these as agreed, not built; whether any of them is built was not checked, except where the Context says so.

## Context

The shared flows C, A, D, E, G and H of the same session are ratified in ADRs
0067 to 0070, 0085, 0110 and 0121 and are not repeated here. These three were
not given an ADR.

**J1 contradicts ADR 0029.** ADR 0029 excludes server-side PDF generation (and
stays in force on that point after 0066); J1 below says "máy sinh PDF báo giá
từ dòng hàng". This ADR does not resolve it — see `open-questions.md`, question 171.

## Decision

### I · Links — ĐÃ CHỐT

1. **Journeys link as a tree.** Each new journey links back to exactly ONE
   previous journey; one journey can spawn MANY later journeys running in
   parallel (e.g. a licence renewal plus opening a second factory). The company
   screen draws the tree; ContextRail shows 1 chip before, n chips after.
2. Defaults (not asked): ContextRail on every detail screen; one shared code
   generator replaces the `NEXT_CODE` copied into each repository, and adds the
   code `BG-`.

### J · Documents — ĐÃ CHỐT

1. **Every object has a Documents shelf** for uploading files; the parent
   screen aggregates its children's documents (as the activity stream does).
   **Quotation: the machine generates a PDF from the line items**, one file per
   version. Signed contract, acceptance protocol, invoice: upload the signed /
   issued copy.
2. **Attachments in a mail only in the group-send mode**, chosen from the
   Documents shelf of the source object; the "Báo giá" template attaches the
   latest PDF by itself. Bulk send carries no attachment.

### K · Import and export — ĐÃ CHỐT (all four chosen)

- **Excel export from every book**, exactly the filter on screen, within the
  scope the user may see.
- **Import of existing customers:** old contracts (company, kind, value, signing
  date, status) → the machine builds the journey at the right rung (usually
  Growth).
- **Import of company + contact** on their own, with no lead.
- **Import straight into the waiting-group list** with a stop reason.
- Lead import and opportunity import stay as they are.

## Consequences

- Left for later in the same session: B · Permissions and F · Approval ("tạm
  thời chưa làm tới"), and the five vertical flows (Lead · Opportunity ·
  Quotation · Contract · Journey) "chuẩn sau khi luồng chung đã lên canvas".
