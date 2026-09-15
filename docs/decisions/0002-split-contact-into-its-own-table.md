# 0002 · Split `sales.contact` into its own table, replacing email-on-`lead`

Status: accepted (supersedes 0001)
Source: packages/contracts/src/sales/contact.ts — docblock at the top of the file

## Context

Decision #1 of `docs/ban-giao-db.md` once locked in "email sits directly on
`lead`, no `contact` split" — and it wrote its own expiry date into that same
line, verbatim (docblock, section "WHY A TABLE AT ALL, WHEN DECISION #1 SAID
NOT TO SPLIT ONE"):

> "`docs/ban-giao-db.md` decision #1 is explicit: 'email sits directly on
> `lead`, no `contact` split — one lead = one person = one mailbox'. That was
> the right call for the shape of the data at the time, and it came with its
> own expiry date written into the same line: 'the day one company needs
> several people to receive mail will be a migration'. Today is that day, and
> two things fixed the date rather than one opinion replacing another.
>
> FIRST — `sales.meeting_attendee` had to describe the customer's side with a
> typed-in name, because, in its own docblock, the customer side 'has no book
> of its own to point at yet'. A meeting is the place people from both sides
> are named together, so it is the first table that wanted a foreign key here
> and could not have one. Every guest row is a person we have met, sitting in
> a string column where nobody can ask 'have we met this person before'.
>
> SECOND — `platform.email_suppression` is keyed on the ADDRESS, primary key
> `recipient`, not on a lead. The mail layer has therefore been operating at
> contact granularity from the day it was built: a bounce blocks a mailbox,
> and the lead it belonged to is not part of that fact. The schema is what is
> arriving late here, not the requirement."

## Decision

Build the `sales.contact` table — "People on the CUSTOMER'S side — the book
that did not exist until now" — with five doors:

> GET /sales/leads/:code/contacts permission `lead.view` · scoped
> POST /sales/leads/:code/contacts permission `lead.edit` · scoped
> PATCH /sales/contacts/:code permission `lead.edit` · scoped
> DELETE /sales/contacts/:code permission `lead.edit` · scoped
> POST /sales/contacts/:code/primary permission `lead.edit` · scoped
>
> No new permission: a contact is a part of the lead's profile, so seeing one
> is `lead.view` and touching one is `lead.edit`.

`email` is optional on the `contact` table — and this is NOT a relaxation of
`lead.email NOT NULL` (decision #4 of `docs/ban-giao-db.md`), verbatim:

> "`lead.email` is `NOT NULL` (decision #4) to enforce exactly one rule: a
> lead with no mailbox cannot take part in the MAS mail flow, which is the
> main flow of the whole branch. That rule is about the LEAD, and the lead
> still holds it — nothing in this file relaxes that column.
>
> A SECOND person at the same company is a different question. […] So: the
> lead guarantees a mailbox exists for the mail flow; a contact row records
> the person as they actually are."

`isPrimary` is a property of the SET, not of one row — enforced with a partial
unique index `UNIQUE(lead_code) WHERE is_primary`, not left to the service to
remember. Changing the primary goes through `POST …/primary`, not
`PATCH { isPrimary: true }`, because the operation touches TWO rows in one
transaction.

## Alternatives considered

Keep `sales.lead` as is and bolt on a `contact_2_*` column group. Rejected
because it "reaches its limit at the third person, makes 'which mailbox
bounced' unanswerable without knowing which column set it came from, and
turns every future per-person fact into five more mostly NULL columns on the
busiest table in the branch."
