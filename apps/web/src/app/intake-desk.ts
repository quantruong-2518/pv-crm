import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { LeadIntake, LeadMotion } from '@pv/engines'
import type { ImportedLead, ImportedOpportunity } from '@/data/intake'

/** Sổ nạp — những LÔ người dùng đã đẩy vào hệ.
 *
 *  ------------------------------------------------------------------
 *  VÌ SAO LÀ KHO RIÊNG, KHÔNG NHÉT VÀO `app/desk.ts`
 *  ------------------------------------------------------------------
 *  `desk.ts` khoá mọi thứ theo MÃ MỘT DÒNG: patch hồ sơ của lead X, ghi chú
 *  trên lead X, phiếu đổi của lead X. Một lô nạp thì ngược lại — nó là một
 *  ĐƠN VỊ, và mọi câu hỏi đáng hỏi về nó đều hỏi ở mức lô: ai nạp, nạp lúc
 *  nào, từ tệp nào, bao nhiêu dòng vào, bao nhiêu dòng trùng. Băm 412 dòng ra
 *  thành 412 khoá thì không câu nào trong số đó còn trả lời được, và cái nút
 *  "hoàn tác lô vừa nạp" — thứ đầu tiên người ta tìm sau khi nạp nhầm tệp —
 *  không còn chỗ nào để bám.
 *
 *  ------------------------------------------------------------------
 *  GIỮ CẢ DÒNG, KHÔNG GIỮ PATCH
 *  ------------------------------------------------------------------
 *  Khác `desk.ops` một bậc quan trọng và có lý do: patch một dòng sổ cơ hội
 *  dựng lại được từ fixture nên chỉ cần chở phần đã đổi. Dòng nạp thì KHÔNG có
 *  bản gốc nào để dựng lại — nó chỉ tồn tại trong tệp mà người dùng đã đóng từ
 *  lâu. Không giữ cả dòng thì tải lại trang là mất sạch.
 *
 *  ------------------------------------------------------------------
 *  HOÀN TÁC ĐƯỢC, VÀ ĐÓ LÀ ĐIỂM CHÍNH CỦA CẤU TRÚC NÀY
 *  ------------------------------------------------------------------
 *  Nạp nhầm tệp là chuyện sẽ xảy ra — nhầm cột, nhầm chiến dịch, nhầm cả tệp.
 *  Giữ theo lô thì gỡ ra là một cú bấm; giữ rời từng dòng thì cách duy nhất là
 *  xoá tay 412 dòng, và không ai làm hết. Đây là lý do `batchId` bám theo từng
 *  dòng nạp (`ImportedLead.batchId`) thay vì để lô và dòng rời nhau. */

export type ImportBatch = {
  id: string
  /** Sổ nào nhận lô này. */
  spec: 'lead' | 'recipient' | 'op'
  /** Chỗ nạp, nếu nạp từ trong một hồ sơ — mã chiến dịch. Bỏ trống = nạp thẳng
   *  vào sổ. */
  scope?: string
  fileName: string
  motion: LeadMotion
  intake: LeadIntake
  /** ISO, giờ máy người dùng. Đây là thời gian THẬT chứ không phải mốc của kịch
   *  bản đóng băng: hành động này do người dùng làm hôm nay. */
  at: string
  /** Tên người bấm nạp. */
  by: string
  accepted: number
  duplicates: number
  dupInFile: number
  errors: number
}

type IntakeState = {
  batches: ImportBatch[]
  /** Dòng đã nạp vào sổ lead, mới nhất đứng đầu. */
  leads: ImportedLead[]
  /** Dòng đã nạp vào sổ cơ hội. */
  ops: ImportedOpportunity[]
  /** Bộ đếm sinh mã lô — đếm chứ không `Date.now()`, cùng lý do với `seq` của
   *  `desk.ts`: hai lô nạp trong cùng một mili giây phải ra hai mã khác nhau. */
  seq: number

  addLeads: (batch: Omit<ImportBatch, 'id'>, rows: (batchId: string) => ImportedLead[]) => string
  addOps: (
    batch: Omit<ImportBatch, 'id'>,
    rows: (batchId: string) => ImportedOpportunity[],
  ) => string
  /** Gỡ nguyên một lô: dòng của nó ra khỏi cả hai sổ. */
  undoBatch: (id: string) => void
  reset: () => void
}

/** Mảng rỗng dùng chung — trả `[]` mới mỗi lần trong selector làm React coi
 *  snapshot đổi liên tục. Cùng lý do với `NONE` của `desk.ts`. */
const NO_LEADS: ImportedLead[] = []
const NO_OPS: ImportedOpportunity[] = []

export const useIntakeDesk = create<IntakeState>()(
  persist(
    (set) => ({
      batches: [],
      leads: NO_LEADS,
      ops: NO_OPS,
      seq: 0,

      /* `rows` là một HÀM nhận mã lô chứ không phải một mảng dựng sẵn, vì mã lô
         chỉ có sau khi bộ đếm tăng — mà bộ đếm thì nằm trong `set`. Truyền mảng
         vào thì chỗ gọi phải tự đoán mã kế tiếp, và hai lô nạp gần nhau sẽ đoán
         trúng cùng một mã. */
      addLeads: (batch, rows) => {
        let id = ''
        set((s) => {
          id = `lo-${s.seq + 1}`
          return {
            seq: s.seq + 1,
            batches: [{ ...batch, id }, ...s.batches],
            leads: [...rows(id), ...s.leads],
          }
        })
        return id
      },

      addOps: (batch, rows) => {
        let id = ''
        set((s) => {
          id = `lo-${s.seq + 1}`
          return {
            seq: s.seq + 1,
            batches: [{ ...batch, id }, ...s.batches],
            ops: [...rows(id), ...s.ops],
          }
        })
        return id
      },

      undoBatch: (id) =>
        set((s) => ({
          batches: s.batches.filter((b) => b.id !== id),
          leads: s.leads.filter((l) => l.batchId !== id),
          ops: s.ops.filter((o) => o.batchId !== id),
        })),

      reset: () => set({ batches: [], leads: NO_LEADS, ops: NO_OPS, seq: 0 }),
    }),
    { name: 'pv-intake-desk' },
  ),
)

/** Lô gần nhất — dòng "vừa nạp xong" trên màn đọc cái này. */
export function latestBatch(state: IntakeState): ImportBatch | undefined {
  return state.batches[0]
}
