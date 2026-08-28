import type { CampaignBookRow, CampaignProfile, CampaignWaveRow } from '@pv/contracts'
import type { CampaignRowDb } from './campaign.schema'

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
}

/** Hàng trong bảng ↔ dòng trong hợp đồng. Chỗ DUY NHẤT biết cả hai hình —
 *  cùng lý do `lead.mapper.ts#toContract` tồn tại: cột thêm vào bảng thì
 *  không tự lộ ra API, cột đổi tên thì `tsc` bắt được ở đây. */
export function toContract(read: CampaignRead): CampaignBookRow {
  const { row, ownerName, ownerEmail, sourceName, audienceCount, waveCount } = read
  return {
    code: row.code,
    name: row.name,
    state: row.state,
    ...(row.ownerId ? { ownerId: row.ownerId } : {}),
    ...(ownerName ? { ownerName } : {}),
    ...(ownerEmail ? { ownerEmail } : {}),
    ...(row.sourceId ? { sourceId: row.sourceId } : {}),
    ...(sourceName ? { sourceName } : {}),
    audienceCount,
    waveCount,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
}

/** Hồ sơ = dòng sổ, cộng chuỗi đợt. Không map lại `read` lần hai, đúng luật
 *  `toProfile` gọi `toContract` bên `lead.mapper.ts`. */
export function toProfile(read: CampaignRead, waves: CampaignWaveRow[]): CampaignProfile {
  return { ...toContract(read), waves }
}
