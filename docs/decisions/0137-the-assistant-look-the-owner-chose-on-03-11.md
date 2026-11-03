# 0137 · The assistant look the owner chose on 03/11: a sparkle mark, a plain answer bubble, and the AI tray beside the button

Status: accepted (amends laws 4, 5, 9, 15 for the assistant only; amends 0136 §7)
Date: 2026-11-03
Source: the project owner's comments on the design canvas "Trợ lý và khay Việc AI" (https://claude.ai/artifact/KiXSty98Bc9wgCBDgNt5Xf), 03/11/2026, closed with "oke rồi đó giờ sửa giao diện một cách triệt để"

## Context

The owner found the first chat screens plain, the shared AI icon ugly, and the AI
tray pill sitting on the round assistant button. A canvas was drawn in Sứ and
revised comment by comment. These decisions bend four laws, so they are written
down here instead of hiding in code comments.

## Decision

1. **The AI mark is a sparkle cluster** (`AiMark`, Hugeicons Sparkles), drawn bare
   in `text-primary` with no tile. It replaces `orbit` everywhere it meant AI or the
   assistant. Law 15 now names `AiMark`; `aurora/no-ai-slop` still refuses the raw
   vendor names (`Sparkles`, `Bot`, `Wand`…), so every screen takes the one mark
   through the alias.
2. **The assistant's answer is not an `AiAction`.** It is a read-only answer, not a
   proposal, so it has no confirm button: the code chip and the record card open the
   record. Law 9 still holds for every AI block that proposes a change.
3. **Answer bubble**: plain card, a soft shadow, no ring, corners 6 · 24 · 24 · 24
   (the sharp corner points at the mark). No AI wash. In Aurora the bubble sits on
   `muted` because a card would vanish into the page.
4. **Record card inside an answer** carries a light inset hairline and no shadow:
   an exception to law 4. The same canvas also approved an inset hairline on the
   panel's "Đang xem" row and a primary ring on code chips, and the radii drawn
   there for the question bubble (16 · 16 · 4 · 16), the composer, chips and
   session buttons; all are limited to the assistant screens.
5. **The round assistant button** is a white disc with a 2px conic halo from
   existing tokens (primary, aurora-2, accent-foreground, aurora-1): a seventh place
   a gradient may sit. It is 56px.
6. **The collapsed AI tray sits on the button's row**, to its left; open, it stacks
   above. Each job is a card with its kind, a progress bar and the current step;
   the full step list opens on demand.
7. Panel: "Câu hỏi đề xuất", a one-row "Đang xem" for the record on screen, a
   full-screen icon of its own, stop as an icon only.

## Consequences

- Record card facts (step, value, close date) show for opportunities only, read
  live through the viewer's own opportunity door; leads and contracts show the label.
- Nobody has seen these screens with a real answer streaming yet.
