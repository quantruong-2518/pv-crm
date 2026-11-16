import type { Knobs } from './story.types'

/** The hand-written layer: journeys whose outcome is fixed so every state and
 *  transition the product has is on screen at least once. Each scenario
 *  overrides the knobs it cares about; the generator samples the rest exactly
 *  as for the bulk. `guarantees` is what `--report` checks — one entry per
 *  (table, state) it promises, matched by the report's own state names. */

type DealKnobs = NonNullable<Knobs['deal']>
type ContractKnobs = NonNullable<Knobs['contract']>
export type Override = Omit<Partial<Knobs>, 'deal' | 'contract' | 'born' | 'scenario'> & {
  /** Days before the run day the journey is born (min, max). */
  bornDaysAgo?: [number, number]
  deal?: Partial<DealKnobs> | null
  contract?: Partial<ContractKnobs> | null
}
export type Scenario = { key: string; title: string; guarantees: string[]; knobs: Override }

const won = (contract: Partial<ContractKnobs>, deal: Partial<DealKnobs> = {}): Override => ({
  lead: { state: 'converted' },
  bornDaysAgo: [70, 105],
  deal: { end: { kind: 'won' }, quoteRounds: 1, signApproval: 'approved', ...deal },
  contract,
})

export const SCENARIOS: Scenario[] = [
  // Lead states and moves
  {
    key: 'S01',
    title: 'Lead mới vào kho, chưa ai nhận',
    guarantees: ['lead:new'],
    knobs: {
      lead: { state: 'new' },
      worker: null,
      bornDaysAgo: [0, 2],
      motion: 'INBOUND',
      sourceKind: 'LANDING_PAGE',
    },
  },
  {
    key: 'S02',
    title: 'Lead đã nhận, chưa chạm',
    guarantees: ['lead:assigned'],
    knobs: { lead: { state: 'assigned' }, bornDaysAgo: [1, 4] },
  },
  {
    key: 'S03',
    title: 'Lead đang chăm, có bước tiếp theo quá hạn',
    guarantees: ['lead:working', 'next_step:overdue'],
    knobs: { lead: { state: 'working' }, leadNextStep: true, bornDaysAgo: [10, 30] },
  },
  {
    key: 'S04',
    title: 'Lead tạm dừng vì chưa có ngân sách, hẹn gọi lại',
    guarantees: ['lead:nurturing', 'touch:nurtured'],
    knobs: {
      lead: { state: 'nurturing', reasonKey: 'EX-03', recontact: true },
      bornDaysAgo: [40, 90],
    },
  },
  {
    key: 'S05',
    title: 'Lead trong danh sách nuôi dưỡng tự trả lời, quay về kho',
    guarantees: ['lead:new-replied', 'touch:customer-replied'],
    knobs: { lead: { state: 'new', fromPool: 'replied' }, bornDaysAgo: [50, 90] },
  },
  {
    key: 'S06',
    title: 'Lead nuôi dưỡng được nhận lại',
    guarantees: ['touch:resumed'],
    knobs: {
      lead: { state: 'working' },
      motion: 'RECYCLE',
      campaign: 'recycle',
      bornDaysAgo: [40, 70],
    },
  },
  {
    key: 'S07',
    title: 'Lead bị khoá',
    guarantees: ['lead:disabled'],
    knobs: { lead: { state: 'assigned' }, disabled: true, bornDaysAgo: [20, 40] },
  },
  {
    key: 'S08',
    title: 'Lead trùng được gộp',
    guarantees: ['lead:merged'],
    knobs: {
      lead: { state: 'working' },
      duplicateMerged: true,
      motion: 'EVENT',
      campaign: 'expo-sep',
      sourceKind: 'SCAN',
    },
  },
  {
    key: 'S09',
    title: 'Lead nâng lên SQL',
    guarantees: ['touch:tier-raised', 'lead:tier-sql'],
    knobs: { lead: { state: 'working' }, tierReached: 'sql', bornDaysAgo: [15, 40] },
  },
  {
    key: 'S10',
    title: 'Lead đến từ đối tác',
    guarantees: ['lead:motion-PARTNER'],
    knobs: { lead: { state: 'converted' }, motion: 'PARTNER', bornDaysAgo: [40, 80] },
  },

  // Holds on leads
  {
    key: 'S11',
    title: 'Lead tạm hoãn, sắp tới hạn',
    guarantees: ['hold:open-due-soon'],
    knobs: { lead: { state: 'working' }, leadHold: { open: 'due-soon' } },
  },
  {
    key: 'S12',
    title: 'Lead tạm hoãn đã quá hạn',
    guarantees: ['hold:open-overdue'],
    knobs: { lead: { state: 'working' }, leadHold: { open: 'overdue' } },
  },
  {
    key: 'S13',
    title: 'Tạm hoãn kết thúc vì khách liên hệ lại',
    guarantees: ['hold:ended-touch'],
    knobs: { lead: { state: 'working' }, leadHold: { ended: 'touch' } },
  },
  {
    key: 'S14',
    title: 'Tạm hoãn chuyển sang chờ',
    guarantees: ['hold:ended-to-waiting'],
    knobs: { lead: { state: 'nurturing', reasonKey: 'EX-07' }, leadHold: { ended: 'to-waiting' } },
  },

  // Deals at every stage and every loss
  {
    key: 'S15',
    title: 'Cơ hội mới chờ trưởng phòng nhận',
    guarantees: ['opportunity:open-new'],
    knobs: {
      lead: { state: 'converted' },
      bornDaysAgo: [3, 8],
      deal: { end: { kind: 'open', stage: 'new' } },
    },
  },
  {
    key: 'S16',
    title: 'Cơ hội đã nhận, chưa chăm',
    guarantees: ['opportunity:open-assigned'],
    knobs: { lead: { state: 'converted' }, deal: { end: { kind: 'open', stage: 'assigned' } } },
  },
  {
    key: 'S17',
    title: 'Cơ hội đang chăm, đã demo và khảo sát',
    guarantees: ['opportunity:open-engaged', 'touch:demo-held', 'touch:site-visited'],
    knobs: {
      lead: { state: 'converted' },
      deal: {
        end: { kind: 'open', stage: 'engaged' },
        activities: ['demo', 'site-visit'],
        presales: 'u-nari',
      },
    },
  },
  {
    key: 'S18',
    title: 'Cơ hội báo giá ba vòng, vòng cuối đang chờ',
    guarantees: ['opportunity:open-quotation', 'quotation:pending', 'quotation:not-closed'],
    knobs: {
      lead: { state: 'converted' },
      bornDaysAgo: [60, 90],
      deal: { end: { kind: 'open', stage: 'quotation' }, quoteRounds: 3 },
    },
  },
  {
    key: 'S19',
    title: 'Cơ hội chờ duyệt ký',
    guarantees: ['approval:waiting-contract-sign'],
    knobs: {
      lead: { state: 'converted' },
      deal: { end: { kind: 'open', stage: 'quotation' }, quoteRounds: 1, signApproval: 'waiting' },
    },
  },
  {
    key: 'S20',
    title: 'Mất ở bước mới vì không phải khách của mình',
    guarantees: ['opportunity:lost-new'],
    knobs: {
      lead: { state: 'nurturing', reasonKey: 'EX-08' },
      deal: { end: { kind: 'lost', atStage: 'new', reasonKey: 'LR-04' } },
    },
  },
  {
    key: 'S21',
    title: 'Mất sau báo giá vì giá cao',
    guarantees: ['opportunity:lost-quotation', 'lead:nurturing-EX-08'],
    knobs: {
      lead: { state: 'nurturing', reasonKey: 'EX-08' },
      deal: { end: { kind: 'lost', atStage: 'quotation', reasonKey: 'LR-01' }, quoteRounds: 2 },
    },
  },
  {
    key: 'S22',
    title: 'Mất với lý do khác, có ghi chú',
    guarantees: ['opportunity:lost-other'],
    knobs: {
      lead: { state: 'nurturing', reasonKey: 'EX-08' },
      deal: { end: { kind: 'lost', atStage: 'engaged', reasonKey: 'other' } },
    },
  },
  {
    key: 'S23',
    title: 'Đổi Sale chính giữa chừng',
    guarantees: ['touch:handed-over', 'opportunity:primary-changed'],
    knobs: {
      lead: { state: 'converted' },
      deal: { end: { kind: 'open', stage: 'engaged' }, primaryChanged: true },
    },
  },
  {
    key: 'S24',
    title: 'Cơ hội tạm hoãn, hết hạn hôm nay',
    guarantees: ['hold:open-due-deal'],
    knobs: {
      lead: { state: 'converted' },
      deal: { end: { kind: 'open', stage: 'engaged' }, hold: { open: 'due' } },
    },
  },

  // Signing and contracts
  {
    key: 'S25',
    title: 'Ký bị từ chối rồi duyệt lại',
    guarantees: ['approval:rejected', 'approval:approved'],
    knobs: won({ installments: ['paid', 'paid'] }, { signApproval: 'rejected-then-approved' }),
  },
  {
    key: 'S26',
    title: 'Hợp đồng thu đủ',
    guarantees: ['contract:collected'],
    knobs: won({ installments: ['paid', 'paid', 'paid'] }),
  },
  {
    key: 'S27',
    title: 'Kỳ thu quá hạn, chưa ghi lý do',
    guarantees: ['installment:overdue', 'contract:overdue'],
    knobs: won({ installments: ['paid', 'overdue', 'upcoming'] }),
  },
  {
    key: 'S28',
    title: 'Lý do trễ đang chờ duyệt',
    guarantees: ['installment_overdue_reason:waiting'],
    knobs: won({ installments: ['paid', 'overdue-waiting'] }),
  },
  {
    key: 'S29',
    title: 'Lý do trễ được duyệt',
    guarantees: ['installment_overdue_reason:approved'],
    knobs: won({ installments: ['overdue-approved', 'upcoming'] }),
  },
  {
    key: 'S30',
    title: 'Lý do trễ bị từ chối',
    guarantees: ['installment_overdue_reason:rejected'],
    knobs: won({ installments: ['paid', 'overdue-rejected'] }),
  },
  {
    key: 'S31',
    title: 'Kỳ thu trễ quá 15 ngày',
    guarantees: ['installment:long-overdue'],
    knobs: won({ installments: ['long-overdue', 'upcoming'] }),
  },
  {
    key: 'S32',
    title: 'Kỳ thu sắp tới hạn trong tuần',
    guarantees: ['installment:due-soon'],
    knobs: { ...won({ installments: ['paid', 'due-soon'] }), bornDaysAgo: [50, 70] },
  },
  {
    key: 'S33',
    title: 'Chấm dứt, khách bồi thường',
    guarantees: ['contract:terminated', 'termination:customer-pays', 'lead:nurturing-EX-09'],
    knobs: {
      ...won({ installments: ['paid', 'upcoming'], termination: 'customer-pays' }),
      lead: { state: 'nurturing', reasonKey: 'EX-09' },
    },
  },
  {
    key: 'S34',
    title: 'Chấm dứt, mình bồi thường và đã trả xong',
    guarantees: ['termination:company-pays-settled'],
    knobs: {
      ...won({ installments: ['paid'], termination: 'company-pays-settled' }),
      lead: { state: 'nurturing', reasonKey: 'EX-09' },
    },
  },
  {
    key: 'S35',
    title: 'Khách cũ mua thêm',
    guarantees: ['workstream:growth', 'contract:second'],
    knobs: won({ installments: ['paid'], growth: true, temperature: ['hot', 'warm'] }),
  },
  {
    key: 'S36',
    title: 'Khách sau bán nguội dần, tới hạn chăm lại',
    guarantees: ['customer_temperature:cold', 'after-sale:due'],
    knobs: won({ installments: ['paid', 'paid'], temperature: ['warm', 'cold'] }),
  },
  {
    key: 'S37',
    title: 'Hợp đồng thiếu chứng từ',
    guarantees: ['contract_document:missing'],
    knobs: won({ installments: ['paid', 'upcoming'], documentsMissing: true }),
  },
  {
    key: 'S38',
    title: 'Hợp đồng bằng USD',
    guarantees: ['contract:usd'],
    knobs: won({ installments: ['paid', 'upcoming'] }, { currency: 'USD' }),
  },

  // Today slice
  {
    key: 'S39',
    title: 'Có buổi gặp hôm nay',
    guarantees: ['meeting:today'],
    knobs: {
      lead: { state: 'converted' },
      deal: { end: { kind: 'open', stage: 'engaged' } },
      meetings: { held: 1, cancelled: 0, upcoming: 0, today: true },
    },
  },
  {
    key: 'S40',
    title: 'Buổi gặp bị huỷ vì cơ hội dừng',
    guarantees: ['meeting:cancelled-opportunity-lost'],
    knobs: {
      lead: { state: 'nurturing', reasonKey: 'EX-08' },
      deal: { end: { kind: 'lost', atStage: 'engaged', reasonKey: 'LR-02' } },
      meetings: { held: 1, cancelled: 1, upcoming: 0, today: false },
    },
  },
]
