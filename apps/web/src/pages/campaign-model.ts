import type {
  CampaignBookRow,
  CampaignOverlap,
  CampaignProfile,
  CampaignState,
  CampaignWaveRow,
} from '@pv/contracts'
import { percent } from '@pv/ui'
import { dmhm } from '@/lib/date'

/** Module 1 · what the campaign screens agree on before any of them draws.
 *
 *  The four-step wizard died on 20/09 and its two step lists went with it: a
 *  campaign that already exists is not a form being walked, which is the whole
 *  argument in `packages/ui/src/patterns/stage-track.tsx`. What is left here is
 *  the profile draft (typed in the create modal, edited in the profile drawer),
 *  the tab on the address, the next task a row names, what the waves add up
 *  to, how a share of letters is printed, and the overlap warning the fire
 *  dialog carries.
 *
 *  Nothing with JSX in it lives here — that is the line between a `-model.ts`
 *  and a `-parts.tsx`. */

export type ProfileDraft = {
  name: string
  slogan: string
  thumbnailUrl: string
  ownerId: string
  sourceId: string
  /** The origin this campaign's leads inherit (`CAMPAIGN`-asking motions);
   *  `''` = not named yet. */
  originId: string
  /** `YYYY-MM-DD` as the date box reads it; `''` = open-ended. */
  endsOn: string
}

export function emptyProfile(): ProfileDraft {
  return {
    name: '',
    slogan: '',
    thumbnailUrl: '',
    ownerId: '',
    sourceId: '',
    originId: '',
    endsOn: '',
  }
}

export function profileFrom(c: CampaignProfile): ProfileDraft {
  return {
    name: c.name,
    slogan: c.slogan ?? '',
    thumbnailUrl: c.thumbnailUrl ?? '',
    ownerId: c.ownerId ?? '',
    sourceId: c.sourceId ?? '',
    originId: c.originId ?? '',
    endsOn: c.endsOn ?? '',
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
  return `Đang có ${count} người nhận, vượt trần ${ceiling} của một đợt gửi — bớt xuống rồi hãy gửi.`
}

/** The two faces of one campaign. On the address bar (`?tab=`), so a screen
 *  opened on the audience can be sent to the person who has to fix it — the
 *  same filters-on-the-address ritual the book follows. */
export type CampaignTab = 'waves' | 'audience'

/** A draft has no wave to read yet; its audience is the face being worked. */
export function defaultCampaignTab(state: CampaignState): CampaignTab {
  return state === 'DRAFT' ? 'audience' : 'waves'
}

export function parseCampaignTab(raw: string | null, state: CampaignState): CampaignTab {
  return raw === 'waves' || raw === 'audience' ? raw : defaultCampaignTab(state)
}

/** What a book row asks of its owner next, in the order the profile's todo
 *  card says it; `null` = nothing left to do. `needs` is the permission the
 *  task takes, `null` while the answer is "wait". */
export function nextTask(
  c: CampaignBookRow,
): { label: string; needs: 'campaign.edit' | 'campaign.broadcast' | null } | null {
  /* DONE still takes a wave: `POST /waves` reopens it; only a stop is final. */
  if (c.state === 'STOPPED') return null
  const sending = c.waveTotals?.sendingWaveNo
  if (sending) return { label: `Đợt ${sending} đang gửi`, needs: null }
  if (c.audienceCount === 0) return { label: 'Thêm người nhận', needs: 'campaign.edit' }
  return { label: `Gửi đợt ${c.waveCount + 1}`, needs: 'campaign.broadcast' }
}

/** The wave still going out, if one is. */
export function sendingWave(c: CampaignProfile): CampaignWaveRow | undefined {
  return c.waves.find((w) => w.run.state === 'SENDING')
}

/** Oldest first, whatever order the server sent them in. */
export function wavesInOrder(c: CampaignProfile): CampaignWaveRow[] {
  return [...c.waves].sort((a, b) => a.waveNo - b.waveNo)
}

export function waveTotals(waves: readonly CampaignWaveRow[]) {
  const total = { sent: 0, delivered: 0, opened: 0, clicked: 0, unsubscribed: 0, bounced: 0 }
  for (const { run } of waves) {
    total.sent += run.sent
    total.delivered += run.delivered
    total.opened += run.opened
    total.clicked += run.clicked
    total.unsubscribed += run.unsubscribed
    total.bounced += run.bounced
  }
  return total
}

export type WaveRisk = {
  key: string
  /** Picks the glyph and its tint; the tag says the same in words. */
  sign: 'ok' | 'watch' | 'over'
  /** What is judged and the verdict, joined by a middle dot. */
  tag: string
  title: string
  text: string
}

/** The server breaker's own test, copied term for term: a wave is judged only
 *  once it has sent `bounceMinSample` letters, and is over only when its
 *  bounce rate is strictly above the ceiling. `null` = too few sent to judge. */
export function bounceOver(
  run: CampaignWaveRow['run'],
  c: Pick<CampaignProfile, 'bounceMinSample' | 'bounceCeilingPercent'>,
): boolean | null {
  if (run.sent < c.bounceMinSample) return null
  return run.bounced * 100 > c.bounceCeilingPercent * run.sent
}

/** What to weigh before the next wave. The bounce item is "over" only by the
 *  breaker's own test on the newest wave; the campaign-wide rate is context. */
export function waveRisks(c: CampaignProfile): WaveRisk[] {
  const risks: WaveRisk[] = []
  const n = (v: number) => v.toLocaleString('vi-VN')
  const gone = wavesInOrder(c).filter((w) => w.run.sent > 0)
  const total = waveTotals(gone)
  const last = gone.at(-1)

  if (last && bounceOver(last.run, c)) {
    const { run } = last
    risks.push({
      key: 'bounce',
      sign: 'over',
      tag: 'Bounce · vượt trần',
      title: `Đợt ${last.waveNo} vượt trần ${c.bounceCeilingPercent}%`,
      text: `${shareOf(run.bounced, run.sent, 1)} — ${n(run.bounced)} thư bị trả lại trên ${n(run.sent)} thư đã gửi`,
    })
  } else if (total.sent > 0) {
    const gap = c.bounceCeilingPercent - (total.bounced / total.sent) * 100
    const points = gap.toLocaleString('vi-VN', {
      minimumFractionDigits: 1,
      maximumFractionDigits: 1,
    })
    risks.push({
      key: 'bounce',
      sign: gap > 0 ? 'ok' : 'watch',
      tag: gap > 0 ? 'Bounce · an toàn' : 'Bounce · cần theo dõi',
      title: gap > 0 ? `Còn cách trần ${points} điểm` : 'Cả chiến dịch đã tới mức trần',
      text: `Cả chiến dịch ${shareOf(total.bounced, total.sent, 1)} — ${n(total.bounced)} thư bị trả lại trên ${n(total.sent)} thư đã gửi`,
    })
  }

  const [prev, now] = gone.filter((w) => w.run.delivered > 0).slice(-2)
  if (prev && now) {
    const rate = (w: CampaignWaveRow) => w.run.clicked / w.run.delivered
    const diff = rate(now) - rate(prev)
    const versus = diff > 0 ? 'cao hơn' : diff < 0 ? 'thấp hơn' : 'bằng'
    const unfinished =
      now.run.state === 'SENDING'
        ? ` — đợt ${now.waveNo} mới gửi ${n(now.run.sent)} trên ${n(now.run.audienceCount)} thư`
        : ''
    risks.push({
      key: 'clicks',
      sign: diff < 0 ? 'watch' : 'ok',
      tag: diff < 0 ? 'Tỉ lệ bấm · cần theo dõi' : 'Tỉ lệ bấm · an toàn',
      title: `Đợt ${now.waveNo} ${versus} đợt ${prev.waveNo}`,
      text: `${percent(rate(now), 1)} so với ${percent(rate(prev), 1)}${unfinished}`,
    })
  }

  if (total.unsubscribed > 0) {
    risks.push({
      key: 'unsubscribed',
      sign: 'watch',
      tag: 'Hủy đăng ký · cần theo dõi',
      title: `${n(total.unsubscribed)} người đã hủy đăng ký`,
      text: `${shareOf(total.unsubscribed, total.delivered, 1)} số thư tới nơi`,
    })
  }
  return risks
}

/** `31/08 06:00` → `31/08 · 06:00`, the way the campaign profile prints an hour. */
export function dayTime(iso: string): string {
  return dmhm(iso).replace(' ', ' · ')
}

/** Just the hour of a moment, for the end of a same-day range. */
export function timeOnly(iso: string): string {
  return dmhm(iso).split(' ')[1] ?? ''
}

/** A share as the screen prints it — `—` when there is nothing to divide by,
 *  because "0%" of zero letters reads as a result when it is an absence. */
export function shareOf(part: number, whole: number, fractionDigits = 0): string {
  return whole > 0 ? percent(part / whole, fractionDigits) : '—'
}

/** TWO CAMPAIGNS WRITING TO THE SAME PERSON — a warning, never a fence.
 *
 *  The server sends these letters and there is no `MasRecipientBlock` for it,
 *  so nothing may disable the fire button on it (ADR 0061 §5). It is said
 *  because `campaign_member` is per campaign: the second letter is otherwise
 *  invisible until the person complains. `null` = no overlap. */
export function overlapNote(rows: readonly CampaignOverlap[]): string | null {
  if (rows.length === 0) return null

  const people = new Set(rows.map((r) => r.leadCode)).size
  const names = [...new Set(rows.map((r) => r.campaignName))]
  const where =
    names.length > 2
      ? `${names.slice(0, 2).join(', ')} và ${names.length - 2} chiến dịch khác`
      : names.join(', ')

  return `${people} người nhận đang nhận thư của ${where} — đợt này vẫn gửi cho họ, nên họ đọc hai lá trong cùng một quãng.`
}
