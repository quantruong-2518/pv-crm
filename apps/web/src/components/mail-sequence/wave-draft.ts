import type { CampaignWaveInput } from '@pv/contracts'

/** The draft a mail SEQUENCE is written in — one letter per wave, no audience.
 *
 *  Lifted out of the campaign screens unchanged on 18/09: the same chain is
 *  now composed from three doors (campaign wizard, one lead, one opportunity),
 *  and a copy per door is three places for "wave 2" to mean different things.
 *
 *  A wave is `CampaignWaveInput` — `MasSendRequest` minus `audience` and
 *  `campaignCode` — so this state knows nothing about WHO receives it. Whoever
 *  sends puts the audience back on. */

type WaveDraft = CampaignWaveInput & { localId: string }

let waveSeq = 0
const newWaveId = () => `w${++waveSeq}`
const stripLocalId = ({ localId: _localId, ...rest }: WaveDraft): CampaignWaveInput => rest

/** The live state of `WaveComposer` — NOT just the locked waves. `committed`
 *  holds the ones already added; the eight fields beside it are the wave BEING
 *  WRITTEN, not locked yet. The two are kept apart because wave 1 exists
 *  without anybody pressing "+" — see `effectiveWaves`. */
export type ComposerState = {
  committed: WaveDraft[]
  templateCode: string
  label: string
  subject: string
  body: string
  ctaLabel: string
  ctaUrl: string
  bookingUrl: string
  timing: 'now' | 'later'
  at: string
}

export function emptyComposerState(): ComposerState {
  return {
    committed: [],
    templateCode: '',
    label: '',
    subject: '',
    body: '',
    ctaLabel: '',
    ctaUrl: '',
    bookingUrl: '',
    timing: 'now',
    at: '',
  }
}

function composerScheduleOk(s: ComposerState): boolean {
  return (
    s.timing === 'now' ||
    (s.at !== '' && !Number.isNaN(new Date(s.at).getTime()) && new Date(s.at) > new Date())
  )
}

export function composerDraftValid(s: ComposerState): boolean {
  return (
    s.label.trim() !== '' &&
    s.subject.trim() !== '' &&
    s.body.trim() !== '' &&
    composerScheduleOk(s)
  )
}

export function composerDraftInput(s: ComposerState): CampaignWaveInput {
  return {
    label: s.label.trim(),
    subject: s.subject.trim(),
    body: s.body.trim(),
    ...(s.templateCode === '' ? {} : { templateCode: s.templateCode }),
    ...(s.ctaLabel.trim() !== '' && s.ctaUrl.trim() !== ''
      ? { cta: { label: s.ctaLabel.trim(), url: s.ctaUrl.trim() } }
      : {}),
    ...(s.bookingUrl.trim() !== '' ? { bookingUrl: s.bookingUrl.trim() } : {}),
    ...(s.timing === 'later' ? { scheduledAt: new Date(s.at).toISOString() } : {}),
  }
}

/** THE FIRST WAVE NEEDS NO "+": filling the form on the left is already a real
 *  wave. The button only LOCKS the wave being written — so it cannot be edited
 *  by accident once it is considered done — and opens an empty form for the
 *  next one. So what actually goes out is every locked wave plus the one in the
 *  box, when that one is complete enough to send. */
export function effectiveWaves(s: ComposerState): CampaignWaveInput[] {
  const locked = s.committed.map(stripLocalId)
  return composerDraftValid(s) ? [...locked, composerDraftInput(s)] : locked
}

/** Lock the wave being written and open an empty box for the next one. The id
 *  is local and never leaves the browser: it keys the timeline rows and the
 *  remove button, nothing the server ever sees. */
export function commitDraft(s: ComposerState): ComposerState {
  return {
    ...emptyComposerState(),
    committed: [...s.committed, { localId: newWaveId(), ...composerDraftInput(s) }],
  }
}

export function dropCommitted(s: ComposerState, localId: string): ComposerState {
  return { ...s, committed: s.committed.filter((w) => w.localId !== localId) }
}

/** WHY this chain cannot be sent yet, in one sentence — for a caller whose send
 *  button is a step away from the compose box (the MAS panel) and has to say
 *  what is missing without re-reading the draft field by field. `null` = at
 *  least one wave would go out. */
export function composerBlocker(s: ComposerState): string | null {
  if (effectiveWaves(s).length > 0) return null

  const gaps = [
    s.label.trim() === '' ? 'tên đợt' : null,
    s.subject.trim() === '' ? 'tiêu đề' : null,
    s.body.trim() === '' ? 'nội dung' : null,
  ].filter((gap) => gap !== null)

  return gaps.length > 0
    ? `Còn thiếu ${gaps.join(', ')}.`
    : 'Thời gian đặt lịch phải sau thời điểm hiện tại.'
}
