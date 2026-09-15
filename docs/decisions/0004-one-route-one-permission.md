# 0004 · One route, one permission — a route that needs two gets split

Status: accepted
Source: docs/ban-giao-campaign.md — table "Eight decisions locked in", row #3

## Context

Building the campaign module, answering three questions the project owner
asked: schedule each batch, fire MAS mail per campaign, record which campaign
a lead belongs to.

## Decision

`/start` and `/stop` are **two separate routes**, not a `state` field on
`PATCH`.

## Consequences

They require `campaign.broadcast` (actually firing mail), while renaming or
changing the owner only requires `campaign.edit`. Folding them into one
`PATCH` would mean reading the body before knowing which permission applies —
`MasController` already has to do that for a different reason (one route
serving two reach levels); here it is not needed because it is already two
routes.
