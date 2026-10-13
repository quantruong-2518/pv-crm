# 0091 · A director or a head of sales signs a contract without approval

Status: accepted (supersedes 0057 §7's "No self-approval" paragraph; built, not yet shipped)
Source: owner decision 13/10/2026 — a director or a head of sales who presses the sign door writes the contract at once; sellers still go through approval

## Context

0057 §7 sent every signature through a `contract-sign` request and refused the
person holding the approval seat from raising one. With a single approver seat
that left a director with no way to record a contract at all (the refusal
sentence was "Người duyệt ký không tự gửi đề nghị ký được. Nhờ Sale đứng đơn
gửi.").

## Decision

### 1 · Two seats sign directly

A director or a head of sales who presses the sign door on a deal writes the
contract in that request, with no approval step (`signsDirect`, `SIGN_DIRECT` in
`opportunity-sign.service.ts`; `signNow` does the write). Sellers and everyone
else still raise a `contract-sign` request that a director approves
(`SIGN_APPROVERS`), as 0057 §7 set.

### 2 · The deal's conditions are kept for everyone

`signVerdict` runs on both paths: the deal is not lost, it has at least one
quotation in the ledger, it has a seller on the SALE lane (the commission owner
is taken from there), and no sign request is already waiting on it. If a
seller's request waits, the director approves that one instead; the door
answers 409.

### 3 · Scope is unchanged

The door stays `opportunity.close` + scoped. A director and a head of sales are
not own-only, so in practice they reach every deal.

### 4 · One audit row per direct signature

Each direct signature writes one `platform.audit` row naming the contract and
the signer's role, in the same transaction as the contract.

### 5 · The screen is told which path it is on

The profile carries `signsDirect`. The sign drawer says "Ký hợp đồng" and "Đã
ký hợp đồng HĐ-…" on the direct path, "Đề nghị ký" and "Gửi đề nghị ký" on the
other. The door answers 201 with `ContractSignedReceipt` (the contract code) on
the direct path, and 202 with the approval receipt otherwise.

## What this supersedes

- **0057 §7**, the "No self-approval" paragraph — "the person holding the
  sign-approval seat cannot raise a sign request for that deal". The rest of §7
  stands: a seller's signature still goes through E3, one waiting request per
  deal, the deal frozen while it waits.

## Alternatives rejected

| Alternative                                                  | Why not                                                    |
| ------------------------------------------------------------ | ---------------------------------------------------------- |
| Only the director signs directly; the head still is approved | The owner chose both seats direct                          |
| The director raises a request and a second director approves | Needs two director accounts, which the owner does not have |

## Consequences and known limits

- Given up: the two-person check on a contract created by a director or a head
  of sales. The owner chose this knowingly over the two alternatives above.
- The only record of such a signature is the audit row (§4).

## Rollout

Not shipped. No migration. Exercised over HTTP on a throwaway PGlite database (director, head of sales, seller); not yet seen on a running screen.
