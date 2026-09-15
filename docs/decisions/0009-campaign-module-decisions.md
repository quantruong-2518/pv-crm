# 0009 · Seven campaign module decisions — source split from campaign, MAS not rewritten

Status: accepted
Source: docs/ban-giao-campaign.md — table "Eight decisions locked in", rows
#1, #2, #4–#8 (row #3 — one route one permission — split out to ADR 0004)

## Context

The campaign module answers three questions the project owner asked: schedule
each batch, fire MAS mail per campaign, record which campaign a lead belongs
to.

## Decision

| #   | Decision                                                                                           | Reason                                                                                                                                                                                                                                                                                                                                              |
| --- | -------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **Split "Source" and "Campaign" (`sales.campaign`) apart**, do not merge                           | Closes D2. `sales.campaign` is the SENDING unit (comment already in the schema: "CONSUMES LEADS, DOES NOT PRODUCE THEM"); a source is where a lead is BORN. Two opposite definitions, cannot merge into one table without breaking one of them                                                                                                      |
| 2   | Contract named `campaign-book.ts`, NOT `campaign.ts`                                               | A real file-name collision between two sessions running in parallel: the other session had already claimed `campaign.ts` for the SOURCE contract. Recorded so the next person does not collide on the name again                                                                                                                                    |
| 4   | `start()`/`stop()` **call straight into** `MasService.send()`/`MasService.cancel()`, not rewritten | All of suppression, the queue, the bounce breaker, the cancel rule (A6) already exist. Rewriting means one rule in two places, and the second copy drifts from the first at the very next edit                                                                                                                                                      |
| 5   | State is raised to `RUNNING` **BEFORE** the per-batch send loop                                    | If one batch fails midway (bad template, MAS is off, over the batch cap), the campaign is still correctly RUNNING with whatever batches already sent successfully — not pretending to be a DRAFT while mail is already queued. A failed batch is resent individually via `POST /sales/mail/runs` with `campaignCode`, not by calling `/start` again |
| 6   | Reuse `campaign.edit` for both create and edit, no new `campaign.create` permission                | Matches the existing `lead.edit` pattern (shared by create+edit in `LeadController`). Current role matrix: every role with `campaign.edit` also has `campaign.broadcast` (marketing/director/head-of-sales/account-executive), so `/start`/`/stop` declare `campaign.broadcast` directly, no need for an elevation mechanism like `MasController`'s |
| 7   | `campaign.sourceId`/`sourceName` are in the contract NOW, not deferred to a later pass             | Column `campaign.source_id` was added by the session building SOURCE in the same pass (references `config_entry.id`). Put straight into `CampaignCreate`/`Patch`/`Row` — no need for a separate migration later just to label "which source does this campaign belong to" for reporting                                                             |
| 8   | A profile's batch history reads through `MailRunRepository.list()`, NOT `byId()`                   | `byId()` returns the RAW DB row of `mail_run` (enough for `stop()`, which only needs `.state`/`.id`). The eleven numbers of `MailRunRow` (`sent`/`delivered`/`opened`/…) are only assembled by `list()`, across two reads of `email_delivery`/`mail_event` — hit this type error here before it reached `pnpm check`                                |
