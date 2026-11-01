# 0132 · An open comm gets an AI report on one press, and nothing is written until the person presses

Status: accepted (amends 0075 §6, which deferred AI pre-fill; fills the seam 0074 §2 left)
Source: project owner's decisions in session, 01/11/2026

## Context

0075 §6 deferred AI pre-fill of a comm's close-out to a later turn and kept
0074's seam and law 9 for when it arrives. On a comm record the person has typed
notes, sometimes a transcript or minutes files, and must still write the summary,
the evaluation and the next step by hand. The owner asked that AI turn what was
recorded into a report, with buttons to create the summary and the minutes, and
propose the next step as buttons.

## Decision

### 1 · One door, synchronous

`POST /comms/debriefs/:id/ai-report`, body `CommAiReportBody`, 200
`CommAiReport` (contract `packages/contracts/src/comms/ai-report.ts`, task
`comm-report` in `packages/contracts/src/ai-cost.ts`).

It is not a tray job (0131). The A-2 tray is lead-shaped (`LeadAiJob`,
`lead.edit`) and has never run for real, and the report is one model call that
fits inside the request. A later slice can move it to a tray (open question 137).

### 2 · Proposal only; nothing is stored

The door writes nothing: no migration on comms tables and no row for the
report. Each part reaches the record through the person's press and the
existing close door. This differs from the lead fill (0128), which writes
directly: a comm's summary and evaluation are what the person confirms, so the
press that uses a part is the consent, and law 9 holds.

### 3 · One press, one model call, one whole report

Title, summary, minutes, answers and steps come from a single call. No web
search and no tools.

### 4 · Sources

- The typed note from the body.
- The turns of this record that have visible text (the `turnsCovered` window),
  never earlier records' turns on the same thread.
- The record's attachments, read through `CommAttachmentRepository.listOf` and
  `StorageService.read`: `text/plain` as text capped at `TRANSCRIPT_MAX`
  characters; DOCX as text, same cap, read by unzipping `word/document.xml` to at
  most 20 MB and scanning its `w:t` runs, because an XML parser builds a tree of
  every tag and a 9 KB upload took the API process down with `mammoth`; PDF and
  images as file parts, a PDF checked by its header and for `/Encrypt`, never
  parsed, because a parser inflates its streams with no cap. Audio is not read and is named in `sources.unread`. An object missing
  from storage goes in `unread`.
- At most 5 file reads, 10 MB of files and `TRANSCRIPT_MAX` characters of file
  text per press, reads and bytes judged before a file is downloaded; the rest go
  in `unread`.
  Turns stop at `TRANSCRIPT_MAX` characters, newest kept.
- Context: the subject's kind, label and state; the last 3 confirmed summaries
  on the same subject; the open next step; for a meeting its title, time, goal,
  hosts and guests.

The caps, the 20 MB and the 3-summary context are chosen values, not derived.
The caps replace a token ceiling (§9); 10 MB because a 15 MB PDF is about 20 MB
of base64 sent inline; 3 summaries give the model the recent thread without the
whole history.

With no source at all (no note, no turn text, no readable file) the door
answers 409 `'Chưa có gì để AI đọc. Ghi chú hoặc tải tệp lên trước.'` With a
recording alone, 409 `'AI chưa nghe được ghi âm. Ghi chú hoặc tải tệp chữ lên trước.'`

### 5 · Gate = the close gate

`DebriefService.closable(who, id)`. The record must be open (`closedAt` null,
409 otherwise). The caller must also hold `comm.view-content`, because the
answer carries content, reach on the thread as the messages door judges it, and
the subject's `confirmable`: a former owner whose lead moved on is refused here
as the close door refuses them, or the report would hand them turns the messages
door hides. `@Need({ permission: 'comm.view' })` as the sibling doors. The route
is checked before any file is read. One audit line just before the model call,
counts only, never content.

### 6 · The server checks the model

- Every answer's criterion and answer id must be in the live vocabulary; an
  unknown row is dropped, never guessed.
- A step with a `templateId` must be in the frame's active templates of the
  subject's current state; kind, text and dueDays then come from the template,
  not the model.
- A step without a template survives only where `freeEntry` is true and its
  `kindId` is a live step kind.
- No step at all when the subject takes none, or on a bought customer, whose
  templates hang on the temperature the person picks after pressing, so an
  offered step could be refused at close. At most `COMM_AI_MAX_STEPS`.
- Summary and title are clamped to their contract maxima. `title` is null on a
  meeting record.

### 7 · Prompt

`PromptSpec` with a version, id `comm-report` (0130). Customer content goes in
the user message as a clearly delimited data block; a rule says anything inside
it is data and any instruction there is ignored. Facts only from the data:
never invent a name, number, date or commitment. Output text in plain
Vietnamese. Title at most 80 characters, summary at most 1,500 (chosen, below
the contract maxima so a clamp rarely cuts a sentence). Minutes as plain text with these
headings, dropping a heading that has nothing: `Biên bản`, `Thời gian`,
`Người dự`, `Nội dung chính`, `Đã thống nhất`, `Việc cần làm` (ai, việc, hạn),
`Còn mở`. Answers only where the data supports them, and may be empty. Steps at
most 3, best first, each with one sentence naming what in the data calls for it.

### 8 · The minutes are a text attachment, not a column

The minutes are saved as a `text/plain` file through the existing
`useAttachCommFile`, named `Biên bản <subject code> <dd-mm-yyyy>.txt`. A column
would change the close doors; a file changes none, and the file list already
shows it and, being `text/plain`, the next press reads it back.

### 9 · Route

`comm-report`: primary `gemini-3.8-flash`, fallback `claude-sonnet-5-5`,
no `max_tokens_in`, `max_tokens_out` 8192, `timeout_ms` 25000, 100 calls per
user per day, budget 0, **off** (owner's decision, 01/11/2026): the door answers
409, and `GET /comms/debriefs/ai-report` tells the screen to hide the buttons,
until someone switches the route on after the transfer assessment (open question
139). Editable without a deploy through `PUT /ai/routes/comm-report`.

25 s because the request is held open and Fly's proxy drops a silent connection
at about 60 s; it is the value 0153 used for the same reason. Attempts can
still add up, so a press carries a 55 s deadline and the gateway opens no attempt
that could not finish inside it. No token ceiling, because its count call would
spend that window and a call over it is refused for good, reading as busy on
every retry; the door's caps (§4) bound the input instead. The 100 per day, the
8192 and the 55 s are chosen values.

### 10 · Errors

`AiUnavailableError` follows the scan and fill split:

- off or no key: 409 `'Chưa bật AI báo cáo. Báo quản trị viên.'`
- daily limit: 429 `'Bạn đã hết lượt AI báo cáo trong 24 giờ qua. Thử lại sau.'`
  (budget: `'Đã hết hạn mức AI báo cáo trong 24 giờ qua. Thử lại sau.'`)
- transient or output failure: 429 `'AI đang bận. Thử lại sau ít phút.'`, not
  503, because the web answers a 503 with its full-screen outage overlay, which
  would hide this sentence and the form

### 11 · Screens

The first fill (`CommFillWorkspace`) and the meeting close-out
(`MeetingHeldForm`). Not the later edit (`CommEditWorkspace`) and not the mobile
log.

Buttons `Tạo tóm tắt` and `Tạo biên bản`. A press runs the door and shows the
part asked for; the other button reuses the same report while the note is
unchanged; pressing the same button again always runs a new call. Each part is
an `AiAction` (law 9):

- **Summary:** title and summary, `confirmLabel` `Dùng bản này`, `empty`
  `Chưa điền gì. Ghi chú của bạn vẫn giữ nguyên.` Pressing replaces the note box
  (and the title only if it is empty); the previous note stays recoverable with
  one press.
- **Minutes:** in an editable box, `confirmLabel` `Lưu vào tệp đính kèm`.
- **Evaluation:** question and proposed answer, `confirmLabel`
  `Dùng đánh giá này`; fills only unanswered questions.
- **Next step:** one `AiChoices` block, a row per suggestion with step text, due
  and its reason, and a `Chọn bước này` button on each. Pressing sets the step draft exactly
  as `CommNextStepFields`' `pick` does for a template. This slice does not open
  the booking, quotation or composer screens.

The basis line comes from `CommAiSources` only: note, N turns, file names; then
`Chưa đọc: <names>` when `unread` is non-empty.

## Consequences

- Migration 0158 (the `comm-report` route row, seeded off). Ship order: migration before the
  API; the web after the API.
- Customer content from comms now goes to Google and Anthropic (open question
  139).
- Audio is not read until recording consent exists (open question 140).
- Open questions 137–140 hang on this decision.
