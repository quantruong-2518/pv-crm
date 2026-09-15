# 0019 · One error shape (RFC 9457) for every API error, with a `reason` field for what HTTP status cannot say

Status: accepted
Source: docs/tich-hop-be.md — section "The shape of an error — RFC 9457, one
shape for every error"

## Context

Building the Lead module's v1 API integration. The frontend needs one
predictable error shape to branch on, not five ad hoc ones.

## Decision

Every error response follows RFC 9457:

```jsonc
{
  "type": "invalid", // unauthenticated · forbidden · not-found · conflict · invalid · server
  "title": "Dữ liệu gửi lên không hợp lệ.", // a sentence the user can read, in Vietnamese
  "status": 400,
  "instance": "/sales/leads?sort=xyz",
  "reason": "permission-denied", // present only for forbidden/unauthenticated
  "errors": { "sort": ["…"] }, // per-field errors — the screen highlights the right field
  "traceId": "…", // echoes the X-PV-Request-Id sent by the client
}
```

**Four rejection reasons do not collapse into two HTTP codes**, so `reason`
carries the difference. They must not be merged: conflating `unauthenticated`
with `permission-denied` kicks an **already** logged-in user back to the
login screen, and they will loop through login forever without ever getting
in.

| `reason`                    | Meaning                                        | What the screen must do                  |
| --------------------------- | ---------------------------------------------- | ---------------------------------------- |
| `unauthenticated` (401)     | Not logged in                                  | Go to the login screen                   |
| `branch-not-licensed` (403) | The company has **not purchased this branch**  | "No Sales branch" — not a user error     |
| `permission-denied` (403)   | The role lacks the permission                  | Hide/disable the button, do not redirect |
| `out-of-scope` (403)        | Has the permission, but this is not their data | Same as above                            |

Table-layer errors are pre-translated, **no more 500s**:

| Situation                                 | Code    | What the user sees                                                           |
| ----------------------------------------- | ------- | ---------------------------------------------------------------------------- |
| Email already belongs to a live lead      | **409** | "Email này đã có trong sổ lead — một email không mở được hai lead cùng lúc." |
| `budget` sent without `currency`          | **400** | error attached to **both** fields                                            |
| A required field arrives empty at the DB  | **400** | error attached to the field name                                             |
| `owner_id` points at a nonexistent person | **400** | "Người phụ trách không có trong sổ nhân sự."                                 |
| Connection lost, schema mismatch…         | **500** | "Máy chủ gặp sự cố." — the real cause only goes to the log                   |
