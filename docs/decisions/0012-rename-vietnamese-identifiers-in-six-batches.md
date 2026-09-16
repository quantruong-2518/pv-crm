# 0012 · Rename Vietnamese identifiers to English in six fixed batches

Status: accepted (batch 1 shipped; batches 2–6 pending)
Source: docs/ban-giao-dinh-danh-tieng-anh.md; the excluded `HĐ` case also
recorded at docs/fix-later.md §14 <!--ctx:ignore-->

## Context

`CLAUDE.md`'s identifier rule used to carry an exception, "enum values stay as
they are". That exception was dropped 14/09/2026: an enum value travels into
JSON, into a URL, into a Postgres `CHECK` constraint, into a stack trace — the
same reason that already forced comments into English at `9d43fd7`. The
rename work was cut into six batches, targeting 14/09/2026.

## Decision

**Boundary — what changes, what does not:**

| Changes to English                                                      | Stays as is                                              |
| ----------------------------------------------------------------------- | -------------------------------------------------------- |
| enum/union values                                                       | user-facing display labels                               |
| type · interface · field · variable · function · component · file names | error messages shown on screen (including zod's `error`) |
| `Record` keys                                                           | fixture data — people's names, company names, provinces  |
| permission values                                                       | sample mail content                                      |
| column names and values inside `CHECK` constraints                      | `docs/` and every handover doc                           |

**Unaccented Vietnamese is still Vietnamese.** `dau-moi` · `tim-hieu` ·
`MaObject` all must change. No regex separates them from English — that is
human eyes' job, and the reason this inventory exists.

The mandatory precedent to read before writing any migration:
**`0030_role_id_english.sql`** — it changed `'giám-đốc' → 'director'` in
`platform.actor.role_id`, and its docblock records the journal-numbering trap
that made `POST /auth/sign-in` throw a ZodError in production on 04/09.

**Method that has run successfully, and three traps already paid for:**

```bash
git ls-files 'packages/*.ts' 'packages/*.tsx' 'apps/*.ts' 'apps/*.tsx' \
  | xargs perl -pi -e "s/\bTenCu\b/NewName/g;"
pnpm format          # MANDATORY, see trap 3
pnpm check           # tier 2 — touching packages/contracts requires it
```

- **Trap 1 · zsh does not word-split.** `perl -pi -e '…' $files` with
  `files=$(git ls-files …)` makes perl treat all 416 paths as ONE filename and
  report `File name too long`. No file gets touched, but a full pass is lost.
  Use `| xargs`, never a variable.
- **Trap 2 · BSD sed has no `\b`.** macOS `sed` does not understand word
  boundaries, so `sed -i '' 's/\bDong\b/…/'` silently matches nothing. Use
  `perl`.
- **Trap 3 · prettier re-wraps lines after a rename.** A longer new name makes
  prettier want to break the line differently, and `format:check` goes red on
  exactly those files. Perl writes directly so the `on-edit.mjs` hook never
  runs. **Run `pnpm format` before `check:fast`**, or lose a check pass.

**Batch 2 — exact list, pending.** Pure TS. No database, no fixture, no
number-locking test touched.

> **Different from batch 1 in one decisive way.** Batch 1 renamed
> **identifiers** — `MaObject`, `textNhap` — long CamelCase strings, almost
> never colliding. Batch 2 renames **values** — `'dat'`, `'ngay'`, `'moi'` —
> short lowercase slugs inside quotes. **Must match INSIDE THE QUOTES**
> (`s/'dat'/'met'/g`), and must grep with context before changing anything.
> `'moi'` is a `StageKey`; `'ngay'` is a web `Grain`, an E4 `timing`, and an
> unrelated `QuestionKey`, all three.
>
> **16/09 — half of the `'moi'` warning has expired.** A separate pass renamed
> every Vietnamese web route to English, so the collision with
> `/sales/campaigns/moi` is gone: that path is now `/sales/campaigns/new`.
> The `StageKey` half still stands and is still batch 2's work — the route
> rename did not touch stored values.
> Absolutely no tree-wide `sed`.

| Type            | Declared at                          | Values → proposed                                                                                                                                                                                                                             |
| --------------- | ------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Grain`         | `web/src/data/period.ts:54`          | `thang·quy·nam·ngay` → `month·quarter·year·day`                                                                                                                                                                                               |
| `WorkKind`      | `web/src/data/home.ts:121`           | `thu-tien·co-hoi·lead` → `payment·opportunity·lead`                                                                                                                                                                                           |
| `Verdict`       | `data/performance.ts:107`            | `dat·can-cai-thien·chua-do·chua-chot` → `met·needs-work·no-data·not-final`                                                                                                                                                                    |
| `RoleKind`      | `data/performance.ts:99`             | only `truong-phong` → `head-of-sales` (to match the existing `RoleId`)                                                                                                                                                                        |
| `NextActionKey` | `data/leads.ts:277-287`              | `nhan-lead·lay-o-thieu·de-nghi-sql·nhac-ky·day-cot·bao-tac·goi-khach·nhan-tin·giao-viec·mo-nguon` → `claim-lead·fill-slots·propose-sql·chase-signature·advance-stage·flag-blocked·call-customer·send-message·assign-owner·open-source-record` |
| recipient group | `data/leads.ts:644`                  | `toi·goi-y·con-lai` → `mine·suggested·rest`                                                                                                                                                                                                   |
| source state    | `data/campaigns.ts:102-103`          | `dang-chay·da-xong` → `running·done` (to match `CampaignState`, already English)                                                                                                                                                              |
| `IntakeTrust`   | `engines/lead-intake.ts:92`          | `xac-minh·khai-bao·tho` → `verified·declared·raw`                                                                                                                                                                                             |
| `LEAD_INTAKES`  | `engines/lead-intake.ts:70`          | `dong-bo·tay·tep·quet·api` → `sync·manual·file·scan·api`                                                                                                                                                                                      |
| E4 `timing`     | `e4-notifications.ts:95,122,144,156` | `'ngay'` → `'immediate'`, **and declare a union in place of `timing?: string`**                                                                                                                                                               |
| local names     | scattered                            | `inDong` · `patchNguon` · `chuaKy` · `dongOf`                                                                                                                                                                                                 |

Three spots that need a human eye, not a mechanical rename:

1. **`Verdict.chua-do` vs `chua-chot`.** The docblock at
   `performance.ts:101-106` says they DIFFER: `chua-do` is "no data source
   yet"; `chua-chot` is "measured, the number is complete, but the period has
   not closed." The proposed `no-data`/`not-final` keeps that distinction — any
   other name must keep it too.
2. **`NextActionKey.mo-nguon`** — "mở nguồn" means opening the lead-source
   record, not "open source". `open-source-record` is the safe proposal but
   long; whoever does the work may pick something else.
3. **`IntakeTrust` has TWO copies** — `XAC_MINH/KHAI_BAO/THO` (UPPER) at
   `contracts/sales/lead-intake.ts:68` and `xac-minh/khai-bao/tho` (lower) at
   `engines/lead-intake.ts:92`. `LeadMotion` also has two copies, converted in
   `lead.mapper.ts`. The debt is already recorded in the `enums.ts:120-135`
   docblock — **this batch is the moment to pay it off**, do not rename both
   copies and leave them as two copies.

`ApiFailure` (11 Vietnamese-accented values, ~120 call sites) · `AuthStatus` ·
`ExpiryReason` were originally scheduled for batch 6 because at planning time
they sat inside the auth/reauth working tree. That work has landed
(`dc4849b`, `11d97cb`), so **these three fold into batch 2**. Note
`sign-in.tsx:47-50` is `Record<ExpiryReason, string>` — rename the key, keep
the Vietnamese sentence.

**The six batches:**

| Batch | Scope                                                                                                                                                                                             |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **1** | `primitives.ts` + `config.ts` + `currency.ts` — 10 bottom-tier identifiers — **shipped, `8013c49`**                                                                                               |
| **2** | Pure web + `IntakeTrust`/`LEAD_INTAKES` + E4 `timing` (+ `ApiFailure` folded in) — see list above                                                                                                 |
| **3** | Fixture/engines: `EdgeKind·SourceKind·CostKind·OriginKind·TurnKind·RateConfidence·KpiLayer·KpiMeasureUnit·QuestionKey`, the `CREDIT_RULES` key, `DueLevel` — `DueLevel` has a number-locking test |
| **4** | DB, one migration per enum in sequence: `LeadTier → StageKey → TouchKind → OpportunityState`, starting at `0033`, not squashed together                                                           |
| **5** | Contract set: `ConditionSide·DocState·RecordState·RecordChannel` — the most expensive: 4 CHECK constraints hold ACCENTED characters                                                               |
| **6** | _(folded into batch 2)_                                                                                                                                                                           |

**Batches 4 and 5 backfill data that is live on Neon — ask the project owner
before running them.**

Batch 5 is the heaviest because of four things at once: CHECK constraints
holding accents (`'khách'`, `'đủ'`, `'chờ-ký'`, `'chưa-tới'`, `'gọi'`), two
declared copies (contracts + `sao-do-contracts.ts`), number-locking tests that
touch `'khách'` and `'quá-hạn'`, and live data going back to `0025`. Three
constraints read exactly the column being changed and must keep this order
during backfill: `lead_exit_no_stage` · `opportunity_stage_clock` ·
`opportunity_lost_state_closed`. The correct shape already exists at `0008`
and `0011` — the comment at the top of each file explains why the CHECK must
be declared AFTER the load step. `drizzle/meta/*.json` regenerates,
**never hand-edit it**.

**Three things that must NOT be cleaned up by mistake:**

1. **Labels in fixtures and seeds.** `EXIT_REASONS[].label` ·
   `INIT_DATA_QUESTIONS[].label` · `KPI_LAYERS[].label` ·
   `CAMPAIGN_STATUS[].label`, people/company/province names, `REPLY`/`DIGEST`/
   `ASK` content, sample mail content in `0013`/`0019`/`0023`. Only the **key**
   next to them changes.
2. **`SOURCE_KIND_LABEL`** — `contracts/sales/lead-source.ts:65-70`. The key
   is already English, the value is a Vietnamese label, and the docblock
   states this is a deliberate exception to "labels belong to the screen
   layer" because server-rendered mail/export also reads it.
3. **The file names `das-vina.ts` · `sao-do.ts` · `sao-do-contracts.ts`** and
   `ScenarioId = 'sao-do' | 'das-vina'`. That is **scenario naming**, i.e.
   data. Renaming it only makes the PR bigger, it does not make the code less
   Vietnamese.

**One case carved out of all six batches.** `ObjectKind` still has an
accented value, `'HĐ'`. It is simultaneously the E1 key, the permission-domain
lookup key (`contract`), the `ContractCode` regex (`/^HĐ-\d{3,6}$/`,
deliberately NOT matching `ObjectCode` because `Đ` sits outside `A-Z`), a
code-generating function running INSIDE Postgres
(`contract.repository.ts:79`), on-screen text (lead badge, kit page,
ContextRail), and **the contract number printed on paper the customer
holds**. This one touches live data, a code-generation function inside
Postgres, and bookmarked user URLs — folding it into the batch plan would turn
a style cleanup into a data migration, and the two fail in different ways.
Full detail was at `fix-later.md` §14.

## Consequences

Two sub-questions remain genuinely unresolved and are not decided by this
ADR: whether the `HĐ`/`CTR`/`HD` prefix is shown on screen at all (the project
owner raised, 14/09, "an item's id should only show the number, no prefix"),
and, if it is still shown, which spelling replaces `HĐ`.
