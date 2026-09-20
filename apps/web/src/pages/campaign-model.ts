import { MAS_RECIPIENT_BLOCK_LABEL, MasRecipientBlock } from '@pv/contracts'
import type {
  CampaignOverlap,
  CampaignPreflightResponse,
  CampaignProfile,
  CampaignState,
} from '@pv/contracts'
import type { StageTrackStep } from '@pv/ui'
import { CAMPAIGN_STATE_LABEL } from '@/data/campaign-book'

/** Module 1 · what the campaign screens agree on before any of them draws.
 *
 *  The four-step wizard died on 20/09 and its two step lists went with it: a
 *  campaign that already exists is not a form being walked, which is the whole
 *  argument in `packages/ui/src/patterns/stage-track.tsx`. What is left here is
 *  the profile draft (typed in the create modal, edited in the profile tab),
 *  the lifecycle columns, and the readiness answer.
 *
 *  Nothing with JSX in it lives here — that is the line between a `-model.ts`
 *  and a `-parts.tsx`. */

export type ProfileDraft = {
  name: string
  slogan: string
  thumbnailUrl: string
  ownerId: string
  sourceId: string
}

export function emptyProfile(): ProfileDraft {
  return { name: '', slogan: '', thumbnailUrl: '', ownerId: '', sourceId: '' }
}

export function profileFrom(c: CampaignProfile): ProfileDraft {
  return {
    name: c.name,
    slogan: c.slogan ?? '',
    thumbnailUrl: c.thumbnailUrl ?? '',
    ownerId: c.ownerId ?? '',
    sourceId: c.sourceId ?? '',
  }
}

/** THE CEILING NOBODY WAS TOLD ABOUT, said out loud with both numbers.
 *
 *  Neither `/start` nor `/waves` carries `leadCodes` — the server reads the
 *  audience itself — so nothing on the way in passes a zod door that could have
 *  caught the size, while `CampaignMemberPatch.add` takes 500 a round. An
 *  audience of 201 is easy to build and impossible to fire.
 *
 *  The ceiling comes from `CampaignProfile.batchCeiling`, not from
 *  `MAS_MAX_RECIPIENTS`: that constant bounds a hand-picked REQUEST and never
 *  sees a campaign, while the real limit is `PV_MAS_BATCH_MAX`. */
export function ceilingNote(count: number, ceiling: number): string {
  return `Đang có ${count} người nhận, vượt trần ${ceiling} của một đợt gửi — bớt xuống rồi hãy bắn.`
}

/** The three faces of one campaign. On the address bar (`?tab=`), so a screen
 *  opened on the audience can be sent to the person who has to fix it — the
 *  same filters-on-the-address ritual the book follows. */
export type CampaignTab = 'waves' | 'audience' | 'profile'

export const DEFAULT_CAMPAIGN_TAB: CampaignTab = 'waves'

export function parseCampaignTab(raw: string | null): CampaignTab {
  return raw === 'audience' || raw === 'profile' ? raw : DEFAULT_CAMPAIGN_TAB
}

/** The lifecycle as a track — and `STOPPED` is deliberately not on it.
 *
 *  Stopping pulls queued mail back out and the server refuses both `/start`
 *  (`state !== 'DRAFT'`) and `/waves` afterwards, so a stopped campaign stands
 *  in no column at all. `StageTrack` takes a plain index for exactly this
 *  reason; the caller draws something else. See `stageIndexOf`. */
const TRACK_STATES = ['DRAFT', 'RUNNING', 'DONE'] as const satisfies readonly CampaignState[]

export const CAMPAIGN_STAGES: StageTrackStep[] = TRACK_STATES.map((state) => ({
  key: state,
  label: CAMPAIGN_STATE_LABEL[state],
}))

/** `null` = off the board, draw a pill instead of the bar. */
export function stageIndexOf(state: CampaignState): number | null {
  const at = TRACK_STATES.indexOf(state as (typeof TRACK_STATES)[number])
  return at === -1 ? null : at
}

/** One line of the readiness band: why the fire button is, or is not, ready. */
export type ReadyRow = {
  key: string
  label: string
  ok: boolean
  note: string
  /** Where this gap is closed. Absent = nothing to fix, the row is a fact. */
  fix?: Extract<CampaignTab, 'audience' | 'profile'>
}

/** One sentence per reason a member of the audience produces no letter.
 *
 *  The counting stopped here on 20/09: the band used to count blank mailboxes
 *  off the member list by hand, which is the same number the server computes
 *  and therefore a second place for it to be wrong. */
const BLOCK_NOTE: Record<MasRecipientBlock, (n: number) => string> = {
  EXITED: (n) => `${n} người đã rơi khỏi phễu — bỏ họ khỏi tệp nhận cho khớp với thứ sắp gửi.`,
  SUPPRESSED: (n) =>
    `${n} người đã hủy đăng ký hoặc bị chặn — không gửi tới những địa chỉ đó được nữa, lần nào cũng vậy.`,
  NO_EMAIL: (n) =>
    `${n} người chưa có email — những dòng này chắc chắn bị bỏ qua lúc bắn, trừ khi ai đó điền vào.`,
  DUPLICATE: (n) =>
    `${n} người trùng địa chỉ với người khác trong tệp — một địa chỉ chỉ nhận đúng một lá.`,
}

/** WHY THE NEXT WAVE CANNOT GO — answered before the button is pressed, and
 *  answered by the server that will do the sending.
 *
 *  `preflight` is `undefined` while `POST /sales/campaigns/:code/preflight` is
 *  in the air, and also for a reader without `campaign.broadcast` who never
 *  asks. Both cases drop the rows rather than draw a reassuring zero — the
 *  rule this function already followed for a member list still loading. */
export function campaignReadiness(
  c: CampaignProfile,
  preflight: CampaignPreflightResponse | undefined,
): ReadyRow[] {
  const over = c.audienceCount > c.batchCeiling

  const audience: ReadyRow = {
    key: 'audience',
    label: 'Tệp nhận',
    ok: c.audienceCount > 0 && !over,
    note:
      c.audienceCount === 0
        ? 'Chưa có ai trong tệp nhận — máy chủ từ chối một đợt không người nhận.'
        : over
          ? ceilingNote(c.audienceCount, c.batchCeiling)
          : `${c.audienceCount} người nhận, còn dưới trần ${c.batchCeiling} của một đợt.`,
    ...(c.audienceCount > 0 && !over ? {} : { fix: 'audience' as const }),
  }

  const waves: ReadyRow = {
    key: 'waves',
    label: 'Chuỗi đợt',
    ok: true,
    note:
      c.waveCount === 0
        ? 'Chưa đợt nào rời máy — lượt bắn tới là đợt 1.'
        : `${c.waveCount} đợt đã rời máy — lượt bắn tới là đợt ${c.waveCount + 1}.`,
  }

  return [audience, ...reachRows(c, preflight), waves]
}

/** The preflight read as lines: one per block reason that actually happened,
 *  then the overlap warning. An empty audience says so on its own row above,
 *  so there is nothing to add under it. */
function reachRows(c: CampaignProfile, preflight?: CampaignPreflightResponse): ReadyRow[] {
  if (!preflight || c.audienceCount === 0) return []

  if (preflight.blocked === 0) {
    return [
      {
        key: 'reach',
        label: 'Gửi được',
        ok: true,
        note: `Cả ${preflight.sendable} người trong tệp đều có chỗ nhận thư.`,
      },
      ...overlapRows(preflight.alsoRunning),
    ]
  }

  const blocks = MasRecipientBlock.options.flatMap<ReadyRow>((reason) => {
    const n = preflight.recipients.filter((r) => r.block === reason).length
    if (n === 0) return []
    return [
      {
        key: `block-${reason}`,
        label: MAS_RECIPIENT_BLOCK_LABEL[reason],
        ok: false,
        note: BLOCK_NOTE[reason](n),
        fix: 'audience',
      },
    ]
  })

  return [...blocks, ...overlapRows(preflight.alsoRunning)]
}

/** TWO CAMPAIGNS WRITING TO THE SAME PERSON — a warning, never a fence.
 *
 *  The server sends these letters and there is no `MasRecipientBlock` for it,
 *  so nothing here may disable the fire button. It is on the band because it
 *  is the one thing a sender cannot see anywhere else: `campaign_member` is per
 *  campaign, so the second letter is invisible until the person complains. */
function overlapRows(rows: readonly CampaignOverlap[]): ReadyRow[] {
  if (rows.length === 0) return []

  const people = new Set(rows.map((r) => r.leadCode)).size
  const names = [...new Set(rows.map((r) => r.campaignName))]
  const where =
    names.length > 2
      ? `${names.slice(0, 2).join(', ')} và ${names.length - 2} chiến dịch khác`
      : names.join(', ')

  return [
    {
      key: 'overlap',
      label: 'Trùng chiến dịch',
      ok: false,
      note: `${people} người trong tệp đang nhận thư của ${where} — đợt này vẫn gửi cho họ, nên họ đọc hai lá trong cùng một quãng.`,
      fix: 'audience',
    },
  ]
}
