# 0140 · Invoices are recorded, not issued; a contract climbs one ladder for every kind; the implementer is a second role chosen at Triển khai

Status: accepted
Source: project owner's decisions in session, 27/09/2026, recorded retroactively from the retired `.claude/HANDOFF-workstream-loop.md` (git history): "Các cấp logic đã chốt với chủ dự án" (items 4 and 5), "Luật", and flow D item 2. The invoice rule is the "lựa chọn đúng logic" the owner handed over rather than a ruling in the owner's own words. Design canvas https://claude.ai/artifact/GWVAqJSDxm87NwbgT6eGB5 (`E-Model`). Whether the ladder is built was not checked.

## Context

**Invoices.** ADR 0030 §4 puts invoicing and receivables out of scope as
Finance's territory and says "payment installments" is a contract-side
milestone, NOT an invoice. ADR 0054 reopens the customer journey but does not
reverse 0030. `open-questions.md` question 21 ("Is invoicing back in scope")
is still open. The handover said this decision "answers question 21 in
practice" and "cần ghi vào ADR". This ADR records it; it does not close
question 21 — see the note under that question.

**Implementer.** ADR 0110 "Not built" says: "Người triển khai": no column; the
API sends `implementer: null`; a later ADR with a migration. ADR 0121 §1
already reads the contract ladder as rungs `deploy`, `accept`, `done`, with
`deploy` and `accept` reading `skipped`.

## Decision

### 1 · Invoices are only recorded

Invoices are only **recorded** (number, invoice date; date and amount
collected), never issued. This is the "lựa chọn đúng logic" the project owner
handed over.

### 2 · The contract ladder

Contract (**mới**): Đã ký · Triển khai · Nghiệm thu · Thu tiền · Hoàn tất. One
ladder for every kind; a rung the kind does not use is skipped (a licence skips
Triển khai and Nghiệm thu).

Journey: open → reaches Tăng trưởng when every contract is Hoàn tất → closes
Thắng · Thua · Rời bỏ (the three close reasons already exist).

### 3 · Sub-steps shown only in the drawer

The sub-steps appear in the drawer only: each quotation send, discount approval
pending, sign approval pending; the POC step; the MES deployment milestones
(Khởi động · Cấu hình và tích hợp · Chạy thử UAT · Go-live); the acceptance
protocol; each instalment (chưa đến hạn · đến hạn · đã xuất hoá đơn · đã thu ·
quá hạn by DueLevel).

### 4 · The contract has two people

A contract has two roles: the holder (inherited from the opportunity —
collection, commission, customer relationship) and the **"người triển khai"**,
chosen when the contract moves to the Triển khai rung. A kind that is not
deployed (licence) has no such role.

## Consequences

- The handover listed what has to change for this to be real: signing must stop
  closing the journey; one contract per opportunity (`contractCode`) becomes a
  list; a contract-kind catalogue, contract state, deployment milestones,
  invoice and collected milestones per instalment. Not checked against code.
