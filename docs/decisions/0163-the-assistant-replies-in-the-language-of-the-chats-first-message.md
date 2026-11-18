# 0163 · The assistant replies in the language of the chat's first message and keeps it for the whole chat

Status: accepted (shipped 17/11/2026, commit 30d958ae: migration 0175 on Neon, ledger id 173, verified; API + worker on Fly v231, /healthz ok; web sends `lang` in the follow-up push; prompt v18 never run live, gate 0 OPEN)
Date: 2026-11-17
Source: owner, 17/11/2026; ADR 0136 §7 (three languages on the web), ADR 0133

## Context

The web speaks three languages (vi, en, ko); the assistant answered in
Vietnamese whatever the person wrote. The owner ruled on 17/11/2026: the reply
language is chosen from the FIRST message and kept for the whole chat. No switch
mid-chat, even if the person writes in another language or asks to switch.
Exception (0164): a text written for someone else may be in a named language.

## Decision

1. One language per chat, set on the turn that opens the session and stored on
   the session (`platform.assistant_session.lang`, `vi` | `en` | `ko`, migration
   0175). Later turns ignore any language sent. Existing chats become `vi`.
2. Detected without an AI call (`detectLang`): script first, then two closed
   word lists for unaccented text, and a tie or no hit falls back to the web's
   UI language, else `vi`. Reasons: it costs nothing and a chat cannot be talked
   into a switch.
3. The model is told the language on the context line; prompt assistant v18
   answers always in it and renders Vietnamese-quoted phrases in it. The summary
   prompt (v3) receives it too.
4. Cites are printed per language by the binder, with the web's locale tags;
   period labels mirror the web picker. A masked digit prints as the language's
   "unknown" mark.

## Consequences

- Ship order: migrate 0175 on Neon, deploy the API to Fly and confirm `/healthz`, only then push the web change (`apps/web/src/data/assistant-stream.ts`) to master. `AssistantTurnBody` is `.strict()` and the web builds on every push, so a new web sending `lang` to the old API gets a 400 on every chat turn.
- The locale tag map and the en/ko period labels are hand-copied into `apps/api/src/platform/assistant/assistant-bind.ts` from the web; see `docs/status.md`.
- A person who wants another language starts a new chat.
- The morning brief (`assistant-brief`) stays Vietnamese.
- en and ko answer quality is unmeasured; the live eval has not run for v18.
- Korean dates from Node ICU print `2026/11/01`; browsers print `2026. 11. 01.`.
