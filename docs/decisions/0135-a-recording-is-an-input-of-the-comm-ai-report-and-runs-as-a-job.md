# 0135 · A recording is an input of the comm AI report, and it runs as a job

Status: accepted, except §2, which is proposed (supersedes 0132 §4 on audio and its recording-alone 409; amends 0132 §1 for a record with a recording)
Source: project owner's decision in session, 02/11/2026

## Context

0132 left audio unread (§4) until recording consent exists (open question 140),
and answered 409 on a record whose only content was a recording. On a call or a
meeting the recording is often the only full account of what was said. The owner
decided that a record with a recording and any other content can be pressed, and
that the AI analyses all inputs together.

## Decision

### 1 · One call, every input, through a job

The recording goes in the same call as the note, the turns, the file texts and
the files of 0132 §4. The press does not wait for the answer: it opens a job
(0131's shape: tray row, worker, sweeper) and returns 202. Contract:
`packages/contracts/src/comms/ai-report.ts`; migration 0161 (`comms.ai_job`, task
`comm-audio-report`). A record without a recording keeps the synchronous door of
0132 §1. `CommAiReportStatus.recording` tells the screen whether the audio route
is on.

Only the largest audio attachment is read; the other audio stays in `unread`.

### 2 · Consent: a tick at the press (PROPOSED)

The press carries a required tick, "Tôi xác nhận mọi người trong ghi âm đã được báo trước": `recordingNotice`, a literal `true`, written to the audit log with the job.

This is a lighter stand-in. It is NOT the `comms.consent` row ADR 0011 specifies,
and `comms.consent` still does not exist in code. The owner has not ruled on it;
it was the assistant's recommendation. Open question 140 keeps the consent part
open.

### 3 · The simple way first

One call through the Gemini Files API: the recording is uploaded, awaited until
ACTIVE, used and deleted inside one attempt. The owner chose to try the simple way
first. Rejected: NotebookLM (the consumer product has no official API; the
Enterprise one is v1alpha and no query endpoint was found).

Not built: chunking, stored transcripts, and machine checks of numbers against
timestamps. Add them only if a real file shows missed or wrong content. In their
place each line of the minutes carries its recording time, so a person can check
by ear, and a "Cần nghe lại" heading lists what was unclear.

**Quality rests on one recording so far.** On 02/11/2026 the owner ran one 2-hour
Vietnamese and Korean meeting with an interpreter on `gemini-3.8-flash`: 180,127
tokens in, 2,039 out, 26 s of upload and 24 s of model time. Three runs on that one file
settled the prompt and the thinking level. At low effort each run dropped different
things: figures it had heard, an event with its date, every open point. Walking the
recording in blocks of ten minutes at medium effort kept all but one of 15 facts
gathered from the earlier runs, in 60 s of model time and about 6,700 tokens out.
So the job runs at medium effort and chunking stays unbuilt.

Limits that remain: "Cần nghe lại" stayed empty in all three runs, so the model does
not admit doubt and a person must read the minutes. Proper names moved between runs.
Whether a line under "Đã thống nhất" was really agreed needs someone who was there.
No one has compared the result with the meeting itself yet.

### 4 · Route

`comm-audio-report`: Gemini only, no fallback (the gateway has no audio path to
Claude), seeded **off**. The owner turns it on with `PUT /ai/routes/comm-audio-report`.
That door refuses a fallback and an input ceiling on this task: a fallback would
send the recording twice, and `countTokens` takes no recording, so a ceiling would
fail every job.

### 5 · Timeout

540 s per attempt for this task only, 90 s elsewhere. The 90 s cap protects the
other queues from redelivery and double billing, so it stays for them; one
attempt of 540 s fits under the job queue's 30 min expiry.

### 6 · Double billing

Every send of the recording bills all of it, so each path that could send it
twice is closed. The gateway makes one attempt on this task (`AiCaller.oneAttempt`):
no retry on a cut-off or malformed answer, no fallback. A job is claimed only at
step 0, and a progress write that finds the job gone stops before the model call.
Once the call starts there is no redelivery: a delivery past that point writes
FAILED. A failure before the call may be retried. An attempt that dies mid-stream
records the tokens it saw, so the ledger does not read 0 on the costliest failure.

### 7 · Quota

A press counts the jobs not yet run against the daily limit, in the transaction
that opens the job, because the gateway counts only the ledger and a job not yet
run has no row there.

### 8 · What the job row holds

The note and the report stay on the job row for 24 h, then the sweeper deletes
the row. They are customer content. Only the presser reads them, behind the same
gate as the press, and each read of a finished job writes a `view` audit line. The
tray's list carries neither.

## Deviations from the usual path

- Streaming on the recording path only: Node's fetch cuts a response that stays
  silent for 300 s, and a stream sends headers at its first chunk.
- The Gemini client for the upload is a one-call SDK client with a bounded
  `fetch`, because `files.upload` takes no limit.

## Consequences

- Ship order: migrate 0159, 0160 and 0161 before deploying the API, and the API before
  the web, because the web reads `CommAiReportStatus.recording`.
- Customer audio goes to Google once the route is on (open question 139).
- Open questions 158–164 hang on this decision; 140 is updated.
