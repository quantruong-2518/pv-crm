---
name: i18n-add
description: Add one on-screen string in all three languages (vi, en, ko) to the right place in apps/web — a `message(vi, en, ko)` call, never a locale file. Use when a screen, toast, dialog, route title or enum label needs new user-facing text, and on "thêm chuỗi" / "dịch chuỗi này".
---

# Add a string in Vietnamese, English and Korean

pv-crm has no locale files. A string is a `message(vi, en, ko)` call
(`apps/web/src/app/i18n.ts`) that carries all three languages, so a missing
language cannot compile. Vietnamese leads: it is the source and the owner's
priority; English and Korean are written from the _intent_ of the string,
never word for word from the Vietnamese (`docs/design-system/ui-copy.md`,
"English and Korean").

## 1 · Find the string a home

Look for an existing one first — the same words on two labels is drift:

```bash
grep -rn "<a distinctive Vietnamese word>" apps/web/src packages/contracts/src | head
```

Then put it where its neighbours are:

| The string is…                                            | Home                                                                                                                                                                                   |
| --------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| used by one screen or component, once                     | inline in that file: `t(message('…', '…', '…'))`                                                                                                                                       |
| shared by a screen's files, or the screen has a copy file | the screen's `apps/web/src/data/<topic>-copy.ts` (or `<topic>-i18n.ts`) object, e.g. `LEAD_COPY` in `apps/web/src/data/lead-copy.ts`                                                   |
| a nav entry or a screen's header                          | `apps/web/src/app/chrome-i18n.ts`; the browser-tab title in `apps/web/src/app/route-copy.ts`                                                                                           |
| the label of an enum value from `@pv/contracts`           | Vietnamese in the contract's label map (`LEAD_STATE_LABEL` and kin), then a `Record<Enum, Message>` in `apps/web/src/data/sales-labels-i18n.ts` that passes the contract label as `vi` |

A new enum value with no entry in that `Record` is a compile error; follow the
error to the file. A toast or a string built outside React uses
`translate(copy)` instead of `t`.

## 2 · Write the Vietnamese

Read `docs/design-system/ui-copy.md` first. A string answers "what do I fill in
here" or "what happens when I press this" in one short sentence an office worker
already uses. Keep the consequence, drop the mechanism; reuse the words already
on the labels; no `máy chủ`, `endpoint`, `SQL`, `đồng bộ`. `aurora/no-ai-slop`
reads only the first two, and only in JSX — a toast or a copy file escapes it.

## 3 · Write English and Korean

- English: concise, native, sentence case.
- Korean: polite register held through the whole screen (해요체 or 합쇼체, not
  mixed); product terms follow the screen already built — lead, opportunity
  (`기회`), contract (`계약`), campaign (`캠페인`) — so grep a neighbour for the term.
- Interpolation lives inside each language's own template literal, so word order
  can differ: `message(`${n} lead…`, `${n} leads…`, `리드 ${n}개…`)`.
- A Vietnamese string that is a lookup key, not display text, takes
  `// i18n-ignore` on its line (`i18n-ignore-file` in a block comment exempts a
  whole file).

When the owner or caller gave no Korean, write your best Korean and flag it:
**the English and the Korean wait for a native check**, and the report says which
strings. Leave `''` only for a language you cannot write at all — `pnpm i18n:check`
reports it, which is the point. `pnpm i18n:fill <file>` fills empty literals with
Haiku but needs `ANTHROPIC_API_KEY` or the key line in `apps/api/.env` (exit 3
without it, and a worktree's `.env` is empty).

## 4 · Done when

```bash
pnpm i18n:check        # 0 hardcoded, 0 empty en/ko
pnpm check:fast
```

Report each string with its three texts, the file it went to, and the list
that needs a native check.
