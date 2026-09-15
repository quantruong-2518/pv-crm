# 0048 · `useMasSend` picks its permission from the request body; the wave modal always sends exactly one wave per submit

Status: accepted
Source: docs/ban-giao-campaign.md — section "Lượt 29/08 (phần hai) — FE: ba sổ, một tiền tố", subsection "Ba quyết định đáng biết", items 1 and 3

## Context

Building the three FE books under `/sales/campaigns` (Sổ chiến dịch · Nguồn
dẫn · Sổ lô gửi) and wiring the shared MAS stepper modal into both the lead
book and the campaign flow.

## Decision

**`useMasSend` chooses its required permission from the request BODY**,
rather than declaring one permission in code. Sending a single letter needs
`lead.send-email` (with `ownOnly`); attaching a batch to a campaign needs
`campaign.broadcast` — matching exactly how `MasService.send()` branches on
the server side. Hardcoding one permission would either block a Sale from a
plain single send, or open the client-side gate wider than the real one,
leaving the user to discover they lack permission only after finishing the
letter.

**The "Start running" box always sends exactly ONE wave**, even though
`CampaignStart` accepts up to 20. A second wave is composed only after
seeing the numbers from the first, and it goes through the "Attach to
campaign" field of the MAS modal — it does not call `/start` a second time.

## Consequences

`masPreview` still hardcodes `lead.send-email` even though the "Preview"
button now also sits on the campaign screen, which only requires
`campaign.broadcast` — a role that can broadcast a campaign but has no
personal send permission hits an error exactly where a preview letter should
be. This is a known gap, left open: `masPreview` needs the same body-based
permission split as `useMasSend`.
