# 0129 · Category (nhóm ngành) and industry (ngành) become configurable lists

Status: accepted (amends 0079 §5: industries stop being free-text tags; replaces the four-value category enum)
Source: project owner's decisions in session, 28/10/2026

## Context

The category was a fixed four-value enum (chip, mechanical, automotive, pharma)
on the lead and the account. The industry was up to four free-text tags on the
lead, "notes only, never a routing input" (0079 §5). `CATEGORY` existed as a
config list but was neither shown nor wired. Neither could be edited without a
release, and nothing could be counted by industry.

## Decision

### 1 · Two config lists, edited in Settings through approval

Category and industry are config lists edited in Thiết lập › Lead, through the
existing propose → director approves flow, like every other list.

### 2 · What a lead carries

- One category per lead; at most 4 industries, all of that category. An account
  carries a category only.
- A person can only add industries of the lead's category. Changing the
  category keeps only the industries of the new category.
- A lead whose stored tags have no category keeps them and they show; the
  uncategorised industries are not offered for new picks.

### 3 · Legacy tags and clean-up

- Every free-text tag becomes an industry with no category ("Chưa xếp nhóm").
  De-duplication is case-insensitive only, matching the live-name unique index;
  the first-seen spelling is kept.
- An administrator cleans up later: move to a category, rename, archive, or
  merge. Merge moves every lead's link to the target and archives the source.
  It is allowed only from an uncategorised industry, or between industries of
  the same category.
- A category is not archived while it still has active industries.

### 4 · AI picks only from the lists

The lead fill (0128) picks category and industries only from the configured
lists: the live lists go into the prompt, names map back to ids, anything not
on a list is dropped. The prompt redesign is separate.

### 5 · Screens

- Industries show as pills with "+N" for the rest (`PillOverflow` in `@pv/ui`);
  at 4 the add control is disabled.
- Report Báo cáo › Theo ngành: rows grouped category → industry, for this
  month, quarter or year. A lead counts in each of its industries, so rows do
  not sum to the total. Conversion is the share of the leads created in the
  period that already have an opportunity. Same door as the lead book
  (`lead.view`).
- "Sale phụ trách" of a category is the category's owner in config, replacing
  the fixture's name comparison.

### 6 · Data model (migration 0154)

- `config_entry.parent_id` (a generated `parent_list`, composite self-FK, only
  for `INDUSTRY`; NULL = uncategorised). The live-name unique key gains the
  parent, so an industry name is unique per category.
- `lead.category_id` and `account.category_id`, composite FKs to `CATEGORY`,
  backfilled from the slug; the four categories are inserted by name where the
  database lacks them.
- `sales.lead_industry (lead_code, industry_id)`; the cap of 4 is held by the
  contract and `settleIndustries`, not by the database.

### 7 · This ship is additive

`lead.category`, `account.category` and `lead.industries` stay, so the old api
keeps running between migrate and deploy; the new code neither reads nor writes
them. Migrate runs before deploy. Temporary triggers copy whatever the old api
writes to the old columns in that window onto the new ones; the new api never
writes the old columns, so they are inert afterwards. A one-off catch-up script
was rejected: it could not tell an old-api write from a value a person cleared on
the new api, and would bring the cleared value back. A follow-up migration drops
the three columns, their CHECKs and the triggers.

## Consequences

- 0079 §5 no longer describes industries: they are a configured list, a lead's
  tags are links to it, and they are a filter and a report axis.
- The fixture's `LEAD_CATEGORIES` stops being a source of truth for live
  screens.
- Open questions 128–131 hang on it.
