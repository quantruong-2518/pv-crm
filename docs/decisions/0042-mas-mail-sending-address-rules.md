# 0042 · Four rules for the MAS sending address, kept stable across waves

Status: accepted
Source: docs/ban-giao-mas-mail.md — section "Địa chỉ gửi — quy cách đầy đủ nằm trong `.env`"

## Context

`apps/api/.env` carries a long comment block spelling out each part of
`PV_EMAIL_MAS_FROM`. Three domains are in play:

```
notify.pebblevina.com   → transactional, already warmed up, DO NOT touch
go.pebblevina.com       → MAS (recommended), verified separately on Resend
pebblevina.com          → NEVER send bulk from here — the root domain carries employee Workspace mail
```

## Decision

Four rules govern the MAS sending address:

1. A **separate marketing subdomain**, with its own warm-up — it does not
   inherit `notify.`'s reputation.
2. The local part reads like a **person's name** (`quan@`), **never**
   `no-reply@`/`info@`/`marketing@`.
3. The display name is **person + company** — clearly outperforms a bare
   brand name in B2B.
4. The domain must be **verified on Resend**; check with `dig`, do not trust
   the dashboard.

Plus one standing rule: **keep the same local part across waves.** Changing
the sending address repeatedly is a snowshoe-spam signal, and every change
resets reputation to zero.

## Consequences

Any future change to the MAS sending address — new subdomain, new local
part — has to satisfy all four rules plus the stability rule, not just "does
it look like a valid email address".
