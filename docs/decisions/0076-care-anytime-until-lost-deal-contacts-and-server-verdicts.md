# 0076 · Care activities and quotations are recorded until the deal is lost; the deal's contacts and run are readable and editable; the server says what each act may do

Status: accepted (amends 0072 §3 application; closes 0073 Open/debt items: contacts read/edit, run ordinal)
Source: project owner's decisions in chat, 01/10/2026

## Context

0072 §3 allowed activities "from `assigned` until signed or lost". The code
read that as: refused while a sign request is pending and on won deals. A won
deal still gets samples, visits and new quotations, and the history should say
so. 0073 left the deal's contacts and "Lượt thứ N" unread after create. Screens
were each re-deriving what a deal may do.

## Decision

### 1 · Activities and quotations until LOST

Care activities (`sample`, `poc`, `demo`, `site-visit`) and quotations may be
recorded from `assigned` until the deal is LOST — including while a sign request
is pending and on a WON deal. Never at `new`, never on a lost deal.

On a won deal they write history only, no stage move; a quotation there is a new
round ("Gửi lần n").

Back-date floors: an activity from the deal's acceptance; a quotation from entry
into the current stage, and on a won deal from the latest contract's signing
day. The signing gate is unchanged: a recorded quotation.

This confirms 0072 §3 literally and supersedes the code's earlier refusal while
signing is pending and on won deals.

### 2 · The deal's contacts are read and editable

Read on the deal profile. Editable after create through
`PUT /sales/opportunities/:code/contacts`, permission `opportunity.edit`,
scoped, gated like any other edit. Same rules as create (0073 §1): at least
one, exactly one primary. Each change leaves a history entry.

Deals created before 0073 with no contact rows show the lead's own contact as
primary. Calls, Zalo and mail on the deal address the deal's primary contact.

### 3 · The deal row carries its run

Workstream code, run ordinal "Lượt thứ N", and customer new/returning (derived
per 0073 §2), on both the list and the profile.

### 4 · The server returns the verdicts

Per deal: whether each act is allowed and why not (activity, quotation, sign,
stop, accept, assign, edit), and the back-date floors. Screens do not re-derive
these rules.

### 5 · Do-not-contact stays a separate turn

0067 D5 enforcement is not part of this. Until it lands, the stop dialog states
only what happens now and does not promise the lead will not be contacted.

### 6 · Stop reasons readable by whoever may stop

Readable with `opportunity.edit`, not only by `config.view` holders.

### 7 · The list

- A real facets route.
- Server filters "overdue in stage" and "no seller".
- Per-row care-activity counts and next step.
- Bulk-mail recipients come from the deal's primary contact.

## Amends / closes

- **0072 §3** — application: "until signed or lost" is read as until lost.
- **0073 Open / debt** — "Deal profile read and edit of contacts" and
  "Lượt thứ N" are closed here. The other two items stay open.

## Out of scope

- Do-not-contact enforcement (0067 D5, separate turn).
