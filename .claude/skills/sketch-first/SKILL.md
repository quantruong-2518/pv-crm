---
name: sketch-first
description: Sketch the layout in text and get it approved BEFORE writing code. Use for any request to build a new screen, change a layout, add/remove/merge blocks, or change how a table or form is presented in pv-crm — even when the request already sounds unambiguous. Skip for copy, colour, or label changes, and for fixing compile errors.
---

# Sketch first, code second

## Why this skill exists

Real numbers from the 22/08 session on `/sales/leads/:code`:

|                                                               | Tokens |
| ------------------------------------------------------------- | ------ |
| Rebuilding the layout 3 times (grid → flex-wrap → even grid)  | ~105k  |
| 12 full-page screenshots, each one staying in context forever | ~319k  |
| Overwriting an 800-line file three times                      | ~33k   |

All three were avoidable with a **text sketch costing about 1k tokens**. The
reviewer rejects the wrong layout before a single line of code exists — and
rejecting a 20-line diagram is faster than rejecting a built screen.

A smaller context also makes the answers _more correct_, not just cheaper: six
screenshot versions of the same screen are six chances to misremember which one
is currently running.

---

## Step 1 · Sketch — write no code

Read at most **two** files: the screen being changed, and
`docs/luat-thiet-ke.md` if §1–§2 is not already in context. Do not scan the
tree, do not open fixtures.

Return exactly four parts, **under 60 lines total**:

**1 · The question this screen answers** — one sentence. If it takes two, that
is two screens.

**2 · Block diagram** — ASCII, showing column ratios and vertical order:

```
┌─ header ───────────────────────────────────────┐
│ Account: DAS Vina          [Running]           │
│ LD-0103 · SQL · Chip · Bac Ninh                │
├─ main column 3 ──────────┬─ side column 1 ─────┤
│ Lead profile (3-col form)│ Source              │
│ Key notes                │ Who is on it        │
│ Next actions             │ Activity feed       │
├──────────────────────────┴─────────────────────┤
│ TOOLS BAR  contact · PIC │ pin assign call     │
└────────────────────────────────────────────────┘
```

**3 · Block table** — four columns, one row per block:

| Block | Question it answers (≤10 words) | Data source | Editable? |
| ----- | ------------------------------- | ----------- | --------- |

**4 · Decisions that need a yes** — numbered, one line each, **each with the
default I will take if you say nothing**. Example: `3 · Form field width: even
3-column grid (default), or width per content type?`

Then **STOP**. Touch no files until there is an answer.

---

## Step 2 · Data contract — only for screens with a form or table

List it in prose, not code: `field name · type · which fixture it comes from ·
required or not`. This is the cheapest place to catch a missing field or a
duplicated one. If a field does not exist in the fixture yet, say so — never
invent it.

---

## Step 3 · Code — four token rules

1. **`Edit` per block.** Use `Write` only for a new file or when replacing more
   than 70% of one. Changing three spots in an 800-line file: Edit ~600 tokens,
   Write ~11k.
2. **Run `pnpm format` exactly once**, right before the final `pnpm check`.
   Every early format run triggers a burst of `<system-reminder>` whole-file
   diffs into context.
3. **Take exactly one screenshot**, after every edit is done — not after each
   step. To inspect detail, `zoom` on the region (roughly 4× cheaper) and drop
   the window to 1280×800 first.
4. **Never re-read a file you just wrote.** Edit and Write already fail loudly
   if the write did not land.

Everything else follows `/man` and `CLAUDE.md` as usual.

---

## Step 4 · Report

Say **what changed and why**; do not paste the code back. Any decision made
beyond the approved sketch has to be called out — whoever approved the diagram
is entitled to know where the build drifted from it.

---

## Skip this skill when

- changing a string, a colour, or a column label;
- fixing a compile error or a red test;
- the user already supplied a diagram or a layout description detailed enough
  to build from directly;
- the change fits in one file and under ~30 lines.

When in doubt, sketch — 1k tokens is cheaper than one rebuild.
