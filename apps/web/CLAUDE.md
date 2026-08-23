# apps/web — where the real app is assembled; read routes.tsx before hunting for a screen

- `pages/` — one screen is one or a few `*.tsx` files (+ `*-parts.tsx` if split
  into blocks, `*-model.ts` if it has calculation logic separate from render).
  Register it in `routes.tsx` — no route means the screen doesn't exist, no
  matter how much of the file is written.
- `app/` — state that lives ACROSS screens: `desk.ts` (pins/assignments/drafts,
  per user), `chrome.tsx` (nav shell, reads paths from here — don't hardcode
  them in a screen). State that dies with the screen (filters, page number)
  stays in that screen's own `useState`.
  - `app/auth/` — the whole auth flow: session state machine, ticket expiry,
    multi-tab sync, the screen gate (`RequireAccess`) and the button gate
    (`useCan`). Import from `@/app/auth`, never from a file inside it. Read its
    `index.ts` for the file-by-file map.
  - `app/api/` — every call that crosses into "data from outside" goes through
    this interceptor chain, which stamps the session, refuses dead sessions and
    enforces permissions before any byte moves. `data/*.ts` calls it; screens
    never do.
- `components/` — things only one or a few screens use, not mature enough for
  `@pv/ui` yet. Once it is, move it to the right zone in `@pv/ui` — don't let
  it linger here.
- `data/` — app-specific data models and calculations (not frozen fixture data
  — scenario numbers live in `packages/engines/fixtures`).
- `kit/` — the live theme kit at `/kit`, kept OUT of the real user bundle
  (lazy-loaded separately in `routes.tsx`). Add new `@pv/ui` components here.

Data scenarios, hard rules, screen-building process: see `/man` and the root
CLAUDE.md.
