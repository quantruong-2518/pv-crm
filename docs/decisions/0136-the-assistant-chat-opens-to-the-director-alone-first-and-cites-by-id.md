# 0136 · The assistant chat opens to the director alone first, answers cite figures by id, and a person can report a wrong answer

Status: accepted (amends 0133: D3 built, §7 known limits; amends 0134: known limit 1, refs per message)
Date: 2026-11-02
Source: project owner's words in session, 02/11/2026: "có UI trên design rồi mà, triển khai luôn đi chứ"

## Context

ADR 0133 built the base and left the chat unreachable until gate 0, a keyed run
on both vendors, closed. The owner asked for the chat screen now and chose to
try it alone first, before that run. Gate 0 is still OPEN. Wave 1 builds the
chat route, the screens, the report of a wrong answer, and D3 of 0133.

## Decision

### 1 · Who can use it, and the override of gate 0

A new permission `assistant.use`, director only by default. Widening to Sales
is ticking it per role in the role matrix, no code. The entry shows only when
the `assistant` route is on and the person holds the permission
(`GET /assistant/availability`), so web and API ship order does not matter.
Why: switching on for the owner is the owner's explicit override of gate 0;
widening to the department should wait for the keyed run.

`assistant.review`, admin only, reads a reported answer and the question before
it, nothing else. Each read writes an audit line, and each answer is re-checked
as the reader: rows outside the reader's scope come blank and flagged.
Why: managers never read chats.

### 2 · The turn route

- The turn streams as SSE over POST. The web reads it with a fetch reader,
  because EventSource cannot POST. A heartbeat every 25 s keeps the socket open.
- A closed socket does not stop a turn. Stop is its own route and works on the
  machine running the turn (one API machine today).
- Errors are events with codes, never a 500.
- The assistant has its own limiter pool. A boot sweep closes turns a deploy
  interrupted.
- The 60-per-hour cap counts ledger rows (`ai_call` turn ids), so deleting a
  chat does not give turns back.
- Gateway refusals (key, limits, budget) happen before any session or turn row
  is written.
- The session list pages by a keyset cursor, 50 per page.

### 3 · Refs are re-checked on every read (closes 0134's first known limit)

Refs per message come from the turn's tool calls. They are re-checked through
the same door reads on load and on replay. The re-check is batched per kind
through the book door's scope, with up to 20 single reads through `get_record`
for codes a book leaves out. A message naming a record the person can no longer
read is `withheld`. Both `withheld` and `unchecked` are left out of replay and
carry forward to every later answer in that chat, on screen and in replay.
Why: a permission lost must not leave a phone or a record readable in history;
a later turn can repeat earlier prose. A BD co-owner on a signed deal sees
records through the profile door that the book hides, so the book alone would
withhold what the person may read.

The cap is 400 distinct codes per chat. Past it, or when a read fails, the
answer is `unchecked` ("Chưa kiểm lại được quyền xem."), separate from
`withheld`. Why: fail closed, and the person is told it is not a refusal.

### 4 · `list_my_work` lists the asker's own work

It lists the asker's own open leads, deals and next steps, not everything in
scope.
Why: a director would otherwise get the whole company.

### 5 · D3 is built: the model writes no figure of its own

- Tool values carry `⟦vN⟧` cite ids. The model writes no digits or codes of its
  own. The server fills cites while streaming and stores the filled text.
- Any other figure is shown as "[chưa rõ]" unless it echoes the person's own
  message. A code is allowed only if read this turn or written by the person.
- The echo set is only the person's own words and the subject code. The model
  says "hôm nay", never a clock time.
- Live models still must prove they cite correctly. If not, reopen D3.

### 6 · Report "Báo câu trả lời sai"

Migration 0162: one row per person per answer; a re-report moves to the top.

### 7 · Web

Suggestions are template keys the web words in three languages; sample
questions live in the web.

A right-hand panel on the existing Drawer and AiAction style, with no new
`--ai-*` tokens; the canvas's gradient look is an owner follow-up. A
`/assistant` page with sessions, an admin screen for reports, three languages.

## Known limits

- Stop is per machine; it works only on the machine running the turn.
- The folded summary is not re-checked (summary route off).
- Once a chat crosses 400 codes, its later answers reload `unchecked`.
- Whether a co-owner on a signed deal should see records their own books hide
  is open (question 166).
- A name with digits loses them in the answer text.
- Figures in words pass.
- "Đã báo sai" is not remembered after reopen.
- Refs for linked codes cited in text get no chip.

## Consequences

- Ship order: migration 0162 on Neon before the API deploy.
- The answer copy "[chưa rõ]" and the budget sentence "Trợ lý đã hết lượt dùng
  trong 24 giờ qua. Thử lại sau." wait on the owner (open question 165).
- New open questions 165 and 166.
