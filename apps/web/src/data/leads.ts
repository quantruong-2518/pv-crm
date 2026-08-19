import { queryOptions } from '@tanstack/react-query'
import { DAS_VINA_LEAD, LEADS, type Lead } from '@pv/engines/fixtures/das-vina'

/** Sổ lead — module 2. Kịch bản 2 · DAS Vina.
 *
 *  Đây là chỗ DUY NHẤT màn lấy sổ lead. Khi có backend, đổi thân `fetchLeadBook`
 *  thành lời gọi HTTP; `leadBookQuery` và mọi màn đang dùng nó không phải sửa.
 *
 *  Nguồn của lead (chiến dịch, sự kiện) nằm ở `data/campaigns.ts` — module 1 và
 *  module 2 đọc hai query khác nhau trên cùng một kịch bản. */

/** Dòng mồi: lead của chính DAS Vina, nối thẳng sang OP-0288 trong sổ cơ hội. */
export const ANCHOR_CODE = DAS_VINA_LEAD

async function fetchLeadBook(): Promise<Lead[]> {
  return LEADS
}

export const leadBookQuery = queryOptions({
  queryKey: ['sales', 'lead-book'] as const,
  queryFn: fetchLeadBook,
})
