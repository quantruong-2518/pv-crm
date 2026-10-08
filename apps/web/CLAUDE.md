# apps/web — where the real app is assembled; read routes.tsx before hunting for a screen

- `pages/` — one screen is one or a few `*.tsx` files (+ `*-parts.tsx` if split
  into blocks, `*-model.ts` if it has calculation logic separate from render).
  Register it in `routes.tsx` — no route means the screen doesn't exist, no
  matter how much of the file is written.
- `app/` — state that lives ACROSS screens: `desk.ts` (pins/assignments/drafts,
  per user), `chrome.tsx` (nav shell, reads paths from here — don't hardcode
  them in a screen). State that dies with the screen stays in that screen's own
  `useState` — except server-paged books: their filters, search text and page
  live in the ADDRESS.
  - `app/book-query.ts` — `useBookQuery` keeps a book's filters, search text and
    page in the URL; `useBookPageClamp` pulls the page back when the result
    shrinks. Used by every server-paged book (leads, opportunities, accounts,
    contacts, campaigns, mail-runs, contracts). Client-side books use
    `app/client-book-filter.ts`, the same idea without paging.
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
  — scenario numbers live in `packages/engines/src/fixtures`).
- `kit/` — the live theme kit at `/kit`, kept OUT of the real user bundle
  (lazy-loaded separately in `routes.tsx`). Add new `@pv/ui` components here.

Data scenarios and hard rules: see the root CLAUDE.md.
