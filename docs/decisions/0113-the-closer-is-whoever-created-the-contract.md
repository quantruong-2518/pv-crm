# 0113 · The closer is whoever created the contract

Status: accepted
Source: project owner's decision, 22/10/2026

## Context

ADR 0110 §1 defaulted the closer to the signer only when the signer is a
seller, otherwise to the deal's Sale chính, and let the sign form pick any
active seller. A contract created from a director or admin account therefore
landed on the deal's PIC.

Example: journey WS-0259 — contracts created from another account show "Nari"
(the deal PIC, who is also the collector) as closer.

## Decision

The person who creates the contract IS the closer (`sales.contract.owner_id`):
whoever presses sign or, on the approval path, whoever raised the sign request
(not the approving director). This holds for non-sellers too (director, admin);
they then hold the commission and KPI for it.

- The sign form no longer has the "Người chốt hợp đồng" picker.
- The API ignores any `ownerId` in the body.
- The "must be an active seller" check and the fallback to the deal holder are
  gone.
- The collector (ADR 0111) is unchanged: still picked explicitly.

## Old data

Migration 0139 rewrites `owner_id` of existing contracts to their creator,
taken from the `signed` touch (`sales.touch`, the actor of the sign) and,
failing that, the approved sign request's raiser. Contracts with no record keep
their owner. Mirror rows follow. Live KPI and commission move with it; closed
KPI months keep their frozen numbers.

## Consequences

Commission and KPI of past contracts may move between people. The head of sales
and the director keep their write rights (ADR 0110 §2).

Ship order: migrate Neon (0139), deploy the API, run 0139 once more, then push the web.

## Supersedes in part

ADR 0110 §1 (who the closer is and how it is chosen).
