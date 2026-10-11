# On-screen copy

Read this before writing any string a user will see: a label, a hint, a
subtitle, an empty state, an error, a button.

Every quote below (`'...'`) is a literal display string — kept in Vietnamese
because it is content. Do not translate it.

## Who reads the screen

PV One is B2B. Its users are 18 to 50 years old and must be able to use it with
no technology knowledge. The owner's standard for content is
`'thực sự Việt, sáng nghĩa'` — genuinely Vietnamese, plain in meaning.

**The one test.** A string answers "what do I fill in here" or "what happens
when I press this", in words an office worker already uses. A string that
answers anything else is cut.

## Five faults

Each "before" was taken from the code when this page was written; the file is
named so the screen can be found.

1. **Implementation leaks** — the string explains how the product does it.
   `apps/web/src/pages/users-parts.tsx`
   - Before: `'Chỉ thấy lead và cơ hội đứng tên mình. Máy chủ cắt ngay trong SQL, không phải bộ lọc của màn.'`
   - After: `'Người này chỉ thấy lead và cơ hội do họ phụ trách.'` — an admin
     ticks this box for someone else, so `'mình'` would not say whose.
2. **Defensive negation** — `'chứ không…'`, `'không phải…'`: the string argues
   against a reading the user never had.
   `apps/web/src/pages/source-parts.tsx`
   - Before: `'Không bắt buộc. Để 0 nghĩa là chưa đặt, và sau này màn ghi 'chưa đặt kỳ vọng' chứ không ghi 'hụt'.'`
   - After: `'Không bắt buộc. Để 0 nếu chưa đặt kỳ vọng.'`
3. **Counting the UI instead of naming the action.**
   `apps/web/src/pages/campaign-profile-parts.tsx`
   - Before: `'Bảy ô này mở một chiến dịch nháp. Chưa lá thư nào rời máy ở bước này.'`
   - After: `'Chưa gửi thư nào ở bước này.'` — the button already says
     `'Tạo chiến dịch nháp'`, so that half is not said twice.
4. **Capitals for emphasis, narrator voice** — the string talks about its own
   fields as characters. Law 6 in `docs/design-system/laws.md` already rules
   out uppercase.
   `apps/web/src/components/account-fields.tsx`
   - Before: `'Có mã số thuế thì nó THẮNG tên: hai dòng cùng mã số thuế là một công ty, dù tên viết khác nhau.'`
   - After: `'Trùng mã số thuế là cùng một công ty, kể cả khi tên viết khác nhau.'`
5. **Coined verbs and metaphors.**
   `apps/web/src/pages/opportunity-new.tsx`
   - Before: `'Cơ hội mới mọc ra từ lead đang chọn. Mã do máy chủ cấp lúc tạo.'`
   - After: `'Mã được cấp tự động.'` — the title already says `'Mở cơ hội'`,
     so the first sentence goes.

## Rules

- **Keep the consequence, drop the mechanism.** The user needs to know the code
  is assigned automatically; not who assigns it.
- **Reuse the words already on labels**, do not coin new ones. The label maps
  live in `packages/contracts` — `LEAD_STATE_LABEL` in
  `packages/contracts/src/sales/enums.ts` is one. A lead that became an
  opportunity is `'Thành cơ hội'` there, so a hint says that and nothing else.
- **No technical vocabulary**: `'máy chủ'`, `'endpoint'`, `'SQL'` in its
  database sense, `'phiên bản'`, `'đồng bộ'`, `'hệ thống cấp'`. The machine
  checks the first two only, as "Machine-enforced vs. eyes-only" below sets
  out; the rest are eyes-only.
- **No sentence shapes translated from English**: a passive nobody needs,
  `'một cách…'`, `'việc'` + verb.
- **A hint that only restates its label is deleted**, not rewritten.

## Why AI writes this way here

Law 1 in the root `CLAUDE.md` — a comment says why, versus the alternative — is
right for comments and wrong on screen. And an agent writes the copy right
after building, when the mechanism is what it remembers.

## Machine-enforced vs. eyes-only

Machine-enforced — `aurora/no-ai-slop`
(`tools/eslint-plugin-aurora/rules/no-ai-slop.js`) flags two things:

- the words `'máy chủ'` and `'endpoint'`;
- an all-capitals word of three or more letters that carries a Vietnamese
  vowel mark.

It looks only at strings written straight into JSX: text, string attributes,
and `{}` expressions, including ternaries and `&&`. Existing violations are
locked by count in `eslint-suppressions.json`; `pnpm lint:debt` says how many
are left.

Eyes-only — everything else on this page, and what the rule does not reach:

- copy held in a variable, passed as a call argument (a toast, a `setState`),
  or kept in a plain object (a label map, a column list);
- a shouted word of two letters, or one with no vowel mark;
- `'SQL'` in its database sense — the rule leaves the word alone because it is
  also a lead tier shown to users.

## English and Korean

Content priority is Vietnamese, then English, then Korean. English and Korean
are written from the intent of the string, never translated word for word from
the Vietnamese.
