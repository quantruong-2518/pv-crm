import type {
  CampaignBookRow,
  CampaignMemberRow,
  CampaignMemberState,
  CampaignProfile,
  CampaignWaveRow,
} from '@pv/contracts'
import type { RunTally } from '@api/platform/mail/mail-run.repository'
import type { MailRunRow } from '@api/platform/mail/mail-run.schema'
import type { CampaignRowDb } from './campaign.schema'

type WaveTotals = NonNullable<CampaignBookRow['waveTotals']>

/** Một dòng đã đọc xong, kèm thứ không phải cột — cùng khuôn `LeadRead` ở
 *  `lead.mapper.ts`: `ownerName`/`ownerEmail` từ join `actor`, `sourceName` từ
 *  join `configEntry`, hai số đếm từ hai subquery tương quan. */
export type CampaignRead = {
  row: CampaignRowDb
  ownerName: string | null
  ownerEmail: string | null
  sourceName: string | null
  audienceCount: number
  waveCount: number
  /** Not a SELECT column: the counters live in `platform`, so the service
   *  attaches them after the page is read. Absent = not summed, or no wave. */
  waveTotals?: WaveTotals
}

/** One wave joined to the two facts of its run that are plain columns. */
export type CampaignWaveRunRead = {
  campaignCode: string
  waveNo: number
  mailRunId: string
  state: MailRunRow['state']
  startedAt: Date | null
}

/** Folds waves into one total per campaign. `runs` arrives oldest wave first,
 *  so the first `SENDING` one met is the earliest wave still going out. A
 *  campaign with no wave gets no entry — the contract wants absence, not zeros. */
export function waveTotalsOf(
  runs: readonly CampaignWaveRunRead[],
  tallies: ReadonlyMap<string, RunTally>,
): Map<string, WaveTotals> {
  const out = new Map<string, WaveTotals>()
  for (const run of runs) {
    const t = out.get(run.campaignCode) ?? { sent: 0, delivered: 0, clicked: 0, bounced: 0 }
    const tally = tallies.get(run.mailRunId)
    t.sent += tally?.sent ?? 0
    t.delivered += tally?.delivered ?? 0
    t.clicked += tally?.clicked ?? 0
    t.bounced += tally?.bounced ?? 0
    const startedAt = run.startedAt?.toISOString()
    if (startedAt && (!t.lastWaveAt || startedAt > t.lastWaveAt)) t.lastWaveAt = startedAt
    if (run.state === 'SENDING') t.sendingWaveNo ??= run.waveNo
    out.set(run.campaignCode, t)
  }
  return out
}

/** Hàng trong bảng ↔ dòng trong hợp đồng. Chỗ DUY NHẤT biết cả hai hình —
 *  cùng lý do `lead.mapper.ts#toContract` tồn tại: cột thêm vào bảng thì
 *  không tự lộ ra API, cột đổi tên thì `tsc` bắt được ở đây. */
export function toContract(read: CampaignRead): CampaignBookRow {
  const { row, ownerName, ownerEmail, sourceName, audienceCount, waveCount, waveTotals } = read
  return {
    code: row.code,
    name: row.name,
    state: row.state,
    ...(row.ownerId ? { ownerId: row.ownerId } : {}),
    ...(ownerName ? { ownerName } : {}),
    ...(ownerEmail ? { ownerEmail } : {}),
    ...(row.sourceId ? { sourceId: row.sourceId } : {}),
    ...(sourceName ? { sourceName } : {}),
    originId: row.originId,
    ...(row.slogan ? { slogan: row.slogan } : {}),
    ...(row.thumbnailUrl ? { thumbnailUrl: row.thumbnailUrl } : {}),
    ...(row.endsOn ? { endsOn: row.endsOn } : {}),
    audienceCount,
    waveCount,
    ...(waveCount > 0 && waveTotals ? { waveTotals } : {}),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
}

/** Hồ sơ = dòng sổ, cộng chuỗi đợt. Không map lại `read` lần hai, đúng luật
 *  `toProfile` gọi `toContract` bên `lead.mapper.ts`.
 *
 *  `limits` đi vào từ ngoài chứ không đọc `Env` ở đây: mapper là hàm thuần,
 *  và hai con số đó là của môi trường chứ không của hàng trong bảng. */
export function toProfile(
  read: CampaignRead,
  waves: CampaignWaveRow[],
  limits: { batchCeiling: number; bounceCeilingPercent: number; bounceMinSample: number },
): CampaignProfile {
  return { ...toContract(read), waves, ...limits }
}

/** One `campaign_member` row joined to the lead behind it. */
export type CampaignMemberRead = {
  leadCode: string
  company: string
  contactName: string
  email: string | null
  state: CampaignMemberState
  addedAt: Date
}

/** A blank address is dropped rather than sent as `''`: the contract leaves
 *  `email` optional so the screen can mark, up front, a member the send is
 *  certain to skip — instead of the sender finding it afterwards in `skipped`. */
export function toMemberRow(read: CampaignMemberRead): CampaignMemberRow {
  return {
    leadCode: read.leadCode,
    company: read.company,
    contactName: read.contactName,
    ...(read.email ? { email: read.email } : {}),
    state: read.state,
    addedAt: read.addedAt.toISOString(),
  }
}
