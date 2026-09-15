# 0006 · Four backend foundation choices — same repo, Node/TS, Postgres, FE keeps its stack

Status: accepted
Source: docs/ban-giao-backend.md — table "Locked in", rows #1, #2, #3, #5 (row
#4 — zod is the sole type source — split out to ADR 0003)

## Context

Preparing to build `apps/api`, cut 23/08/2026, before the first line of code.

## Decision

| #   | Decision                      | The deciding reason, not a secondary one                                                                                                                             |
| --- | ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **Same repo**, add `apps/api` | A separate repo would force `@pv/engines` to publish versioned — "one permission matrix, checked twice" becomes two drifting versions                                |
| 2   | **Node + TypeScript**         | `eslint.config.js:141` already bans the engine from importing React, stating "so the engine can be reused on the backend". Another language means copying the matrix |
| 3   | **Postgres**                  | The E1 graph is a recursive CTE · the log is an append-only table · the 32-field `LeadProfile` is JSONB                                                              |
| 5   | **FE keeps its stack**        | React 19 + Vite + TanStack Query + zustand. An ERP behind login, no SEO, no need for SSR                                                                             |

## Consequences

The full data map (ERD · data flow · three permission axes · zod contracts)
was sketched ahead of these four decisions:
<https://claude.ai/code/artifact/28053515-1fd9-4860-a24f-ec7672340214>
