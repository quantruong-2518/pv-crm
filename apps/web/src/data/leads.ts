import { queryOptions } from '@tanstack/react-query'
import { INIT_DATA_SLOTS, LEADS, OPEN_DEALS, type Lead } from '@pv/engines/fixtures/das-vina'

/** Sổ lead — kịch bản 2 · DAS Vina.
 *
 *  Đây là chỗ DUY NHẤT màn lấy sổ lead. Khi có backend, đổi thân `fetchLeadBook`
 *  thành lời gọi HTTP; `leadBookQuery` và mọi màn đang dùng nó không phải sửa. */

/** Lead mồi: DAS Vina, lead duy nhất của kịch bản đã có số chốt.
 *  Từng trường đều có nguồn, không trường nào tự đặt:
 *   · mã/công ty/tỉnh/người giữ/cột/ngày → sổ 10 cơ hội (`OPEN_DEALS`)
 *   · ngành `chip`   → Đỗ Quang Huy giữ mảng chip (`actors`)
 *   · bậc `sql`      → đã là cơ hội, tức đã qua bậc `co-hoi` của phễu
 *   · đủ 10/10 ô     → điều kiện DUY NHẤT để thành cơ hội thật, nên đã là cơ
 *                      hội thì bắt buộc đủ (docs · "Bộ 10 câu và hai agent") */
export const ANCHOR_CODE = 'OP-0288'

function anchorLead(): Lead[] {
  const deal = OPEN_DEALS.find((d) => d.code === ANCHOR_CODE)
  if (!deal) return []
  return [
    {
      code: deal.code,
      company: deal.company,
      province: deal.province,
      category: 'chip',
      tier: 'sql',
      answered: INIT_DATA_SLOTS,
      owner: deal.owner,
      stage: deal.stage,
      daysHere: deal.daysInStage,
    },
  ]
}

async function fetchLeadBook(): Promise<Lead[]> {
  /* `LEADS` đang rỗng, chờ chốt rồi đổ mock. Sổ thật thay hẳn dòng mồi ngay khi
     có dòng đầu tiên. */
  return LEADS.length > 0 ? LEADS : anchorLead()
}

export const leadBookQuery = queryOptions({
  queryKey: ['sales', 'lead-book'] as const,
  queryFn: fetchLeadBook,
})
