# 0095 · Contract kind is a config list, not a closed enum

Status: accepted (supersedes the closed three-value contract kind in 0090 §2 and 0069 §5)
Source: owner decision 13/10/2026 — the kinds of contract the company sells must be editable without a deploy

## Context

0090 and 0069 fixed the contract kind as three values (licence · deployment ·
training), held in two hard `CHECK` constraints. Adding a fourth kind meant a
migration and a release. The company sells more kinds than three.

## Decision

### 1 · The kind is the config list `CONTRACT_KIND`

Prefix `CK`, codes `CK-01` … `CK-14`. The three old values map `licence` →
`CK-01`, `deployment` → `CK-02`, `training` → `CK-03`. The `kind` stored on
`contract` and on `quotation` is the config code, not a label.

### 2 · A composite FK replaces the two hard CHECKs

`(kind, kind_list)` references `config_entry`, so a kind that is not in the list
cannot be stored. The constraint is the database's; the service does not
re-check it.

### 3 · "Active" is required only when a write introduces a kind

A new negotiation, or giving a kind to a round that had none, must name an
active entry. A kind already stored on a record that was later hidden keeps
working: its rounds, its sign requests and its contract are untouched.

### 4 · Config writes use the existing approval flow

Adding, hiding or renaming a kind goes through the same approval flow as every
other config list; there is no second door.

### 5 · A read door for roles without `config.view`

`GET /sales/opportunities/contract-kinds`, permission `opportunity.view`. The
pickers and the labels on a deal are needed by roles that hold
`opportunity.view` but not `config.view`.

### 6 · Waiting sign requests are rewritten

Migration 0108 also rewrites `payload.sign.kind` of every `contract-sign`
approval still waiting, from the old value to the `CK` code. A request raised
before the migration would otherwise fail to parse after it.

## Rollout order

Migrate Neon → deploy the API immediately → push web. The old API cannot parse
`CK` values; the new web needs `CONTRACT_KIND` in the config bundle the new API
serves. The gap between migrate and deploy is the window where the old API
reads `CK` codes it cannot parse.

Shipped 15/10: migration 0108 applied on Neon, API release v140. Web had been
pushed to master before the migrate, so the web ran ahead of the API until the
deploy finished — the order above was not kept.

## Alternatives rejected

| Alternative                               | Why not                                        |
| ----------------------------------------- | ---------------------------------------------- |
| Keep the enum and add values by migration | Every new kind costs a migration and a release |
| Store a free-text kind with no FK         | A typo becomes a new kind and the tally splits |

## Consequences and known limits

- The tally counts contracts and quotations together, per kind.
- A role with neither `opportunity.view` nor `config.view` sees the raw code
  instead of the label. Latent: the default role matrix has no such role.
- Hiding a kind does not retire it from records that already carry it (§3); that
  is deliberate.
