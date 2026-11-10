# 0138 · Global search in the header runs on Postgres `pg_trgm` in Neon, folds accents with a SQL function, and reads the base tables with no index table

Status: accepted
Source: project owner's decision, recorded retroactively from the retired `.claude/HANDOFF-global-search.md` (git history), a plan written 08/10/2026. The plan was marked "chưa duyệt, chưa dựng" when written; it was built afterwards (migration 0088 and `apps/api/src/branches/sales/search/` exist). No separate record of the owner's approval survives. Only the existence of the migration and the module was checked against code; the rest below is the plan as written.

## Context

`packages/ui/src/organisms/header-search.tsx` filtered only screen names, by an
accent-free string. There was no record search, no search endpoint in
`apps/api`, and no `pg_trgm` or `unaccent` in any migration. Each book's own
search box used `ILIKE` through `platform/db/like.ts`.

## Decision

### 1 · Behaviour

- **General search (default):** typing searches lead, company, contact,
  opportunity, campaign and contract — matching on the title or on the contact
  attached to the record.
- **Specific search:** pick a kind chip, or type a prefix (`lead:`, `cơ hội:`,
  `chiến dịch:`, `hợp đồng:`, `công ty:`, `liên hệ:`), and only that kind is
  searched.
- **Fuzzy:** accent-free, missing characters and one or two wrong characters
  still match.
- **Recent:** opening the box before typing shows recent searches and records
  just opened.
- Screen names ("ĐI TỚI") stay, as the first group.

### 2 · The tool: Postgres `pg_trgm` on Neon, no added service

| Option                            | Why not / why                                                                                                                                         |
| --------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| Meilisearch · Typesense · Algolia | One more system to sync, permissions filtered a second time outside E2, and paid. CRM data of thousands to tens of thousands of rows does not need it |
| Postgres full-text (`tsvector`)   | Matches by word, does not tolerate typos, has no Vietnamese dictionary                                                                                |
| Fuse.js in the browser            | The whole book must be downloaded to the client — breaks the `ownOnly` scope axis                                                                     |
| **`pg_trgm` + SQL `fold`**        | Real fuzzy; permission and `leadLive` filtered in the same SQL; always fresh; no new infrastructure                                                   |

Two decisions go with it:

- **Fold accents with `translate()`, not `unaccent`.** `unaccent` is not
  `IMMUTABLE`, so it cannot go in an expression index. A SQL function
  `sales.fold(text)` = `lower(translate(...))` can, and matches, character for
  character, the `fold()` already in `header-search.tsx`.
- **`UNION ALL` straight over the base tables, no separate index table.** A
  `search_doc` table forces every write path (create, edit, file import, image
  scan, switch-off) to remember to sync it — forget one path and the results
  are silently wrong. A GIN trigram index on `sales.fold(column)` gives the
  same speed at this data size.

### 3 · Database (migration 0088)

- `CREATE EXTENSION IF NOT EXISTS pg_trgm`.
- Function `sales.fold(text)`, `IMMUTABLE`.
- Index `GIN (sales.fold(col) gin_trgm_ops)` on:
  - `lead`: `company`, `contact_name`, `email`, `phone`, `code`
  - `account`: `name`, `legal_name`, `tax_code`
  - `contact`: `name`, `email`, `phone`
  - `opportunity`: `name`, `code`
  - `campaign`: `name`
  - `contract`: `code`
- Table `platform.search_recent` (§7).

**PGlite trap:** PGlite ships `pg_trgm` in `dist/contrib` but it must be loaded
when the client is built. `create-db.ts` does not load it, and the `pglite`
driver of `drizzle-kit` builds its own client so it **cannot load it** _(to be
verified)_. Planned handling: the extension + index block in the migration is
wrapped in `DO $$ … $$` that runs only when `pg_available_extensions` lists
`pg_trgm`; `create-db.ts` loads the extension for PGlite; the search module
runs `CREATE EXTENSION IF NOT EXISTS` at start-up when `kind === 'pglite'`.
Result: one SQL path on both machines.

### 4 · Contract (`packages/contracts/src/sales/search.ts`)

```
SearchKind   = 'lead' | 'account' | 'contact' | 'opportunity' | 'campaign' | 'contract'
SearchQuery  = { q: string(2..120), kinds?: SearchKind[], limit?: 1..20 (default 5) }
SearchHit    = { kind, code, title, subtitle?, matched: { field, text }, score }
SearchResult = { groups: { kind, hits: SearchHit[], more: boolean }[] }
```

`matched` says why the row came out ("Liên hệ: Nguyễn Văn A"). A `contact` hit
carries the parent lead's `code` so a click opens the right profile.

### 5 · API (`apps/api/src/branches/sales/search/`)

`GET /sales/search` — four files, the branch's usual shape.

- **Repository:** one `UNION ALL` statement, one branch per kind. Match
  condition: `fold(col) LIKE '%q%' OR fold(col) %> q`; ranked by exact code
  match → prefix match → `word_similarity`. Each kind takes `limit + 1` rows to
  know `more`. Reuse `contains()` for the `LIKE` part.
- **Match through a contact:** a lead matches on both its inline contact
  columns and the `sales.contact` table; an opportunity matches through
  `opportunity_contact`.
- **Intent detection:** an all-digit string prefers `phone`/`tax_code`; an `@`
  prefers `email`; a code-shaped string puts the exact code match first.
- **Permission — the riskiest part:**
  - Each kind has its own permission (`lead.view`, `account.view`,
    `opportunity.view`, `campaign.view`, `contract.view`). `@Need` can declare
    only one, so the service asks E2 per kind and **drops the whole `UNION`
    branch** of a kind the reader may not see _(to be verified: how the service
    calls E2)_.
  - Axis 3: a branch that is `scoped` adds the matching `leadScope` or
    `owner_id`.
  - `leadLive` on every branch that reads or joins `sales.lead` (lead,
    contact, opportunity, contract).
  - A row cut by axis 3 is **absent**, not counted in `more`.

### 6 · Cache

- **Client (main):** react-query, key `['search', q, kinds]`,
  `staleTime: 60_000` (overriding the app's default `Infinity`), `gcTime: 5
minutes`, `placeholderData: keepPreviousData` so the list does not flicker
  while typing. Debounce 200 ms, minimum 2 characters, cancel the old request
  with `signal`.
- **Server: no cache in the first round.** The cache key would have to carry
  the actor and the permissions, and a lead just switched off would keep
  showing until the TTL. With the trigram index the query is already fast. If
  p95 is measured above 150 ms, reuse `platform/geo/ttl-cache.ts` with a 30 s
  TTL keyed by `actorId`.
- The response header is `Cache-Control: private, no-store`.

### 7 · Recent searches

Stored on the server (`platform.search_recent`), not in `localStorage`: it
follows the person across two machines, and it is the log of what people
searched without finding.

```
id · actor_id · q · kinds text[] · picked_kind · picked_code · result_count · at
```

- **When written:** on clicking a result, or Enter. Not per keystroke. A
  search with 0 results is written when the box closes, for later review.
- **How many kept:** the newest 20 per person; a duplicate `(actor, kind,
code)` updates `at`.
- **Read:** `GET /sales/search/recent` returns only `kind + code`, then
  **rebuilds the labels through the search repository itself** — a lead that was
  switched off, or one the person lost access to, drops out of the list.
- `POST /sales/search/recent` writes; `DELETE` clears the person's own.

### 8 · UI

- `HeaderSearch` stays in `@pv/ui` and does not know the app: add props
  `kinds`, `groups`, `recents`, `loading`, `onQueryChange`, `onPick`. The data
  is loaded by `apps/web/src/app/chrome.tsx` through `data/search.ts`.
- Dropdown layout: kind chip row → GẦN ĐÂY (when the box is empty) → ĐI TỚI →
  one group per kind, at most 5 rows each + "Xem tất cả" opening the matching
  book with `q` filled in.
- Each row: kind icon · title (matched part in bold) · a sub-line saying why it
  matched.
- Keyboard keeps ⌘K, ↑↓, ↵, esc; add Tab to switch chip.
- Labels precise and neutral; one place per piece of information.
- **Human-checked:** law 13 (contrast on `glass-overlay`, the bold match) and
  tablet buttons ≥ 48px — the current row is `h-11`, 44px, and must go up.
- Add a row to the kit `apps/web/src/kit/zone-*.tsx`.

## Acceptance (as written in the plan)

- `nguyen van a`, `Nguyễn Văn A`, `nguyn van a` all return the same contact.
- Typing a company name returns that company's leads, companies, opportunities
  and contracts.
- With the "Lead" chip on, only the lead group remains.
- An `ownOnly` person does not see other people's leads, even through a contact
  match.
- A switched-off lead appears in no group, including opportunities and
  contracts hanging under it.
- A person without `campaign.view` does not see the campaign group.
- `100%` and `LD_0042` are read as text, not wildcards.
- Typing the same string again within 60 s sends no new request.
- Opening the empty box shows recent searches; logging in on another machine
  still shows them.

## Not decided

The plan's own "Còn mở" list is in `open-questions.md`, questions 167 to 170.

## Consequences

- Ship order, from the plan: migration 0088 on Neon first (a production write —
  the project owner runs it), then the API, then push `master`; the wrong order
  makes the web call an endpoint that does not exist.
