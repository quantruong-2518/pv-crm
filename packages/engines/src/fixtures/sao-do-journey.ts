import {
  ContractRungKey,
  LEAD_LANE_BACKBONE,
  OPPORTUNITY_MILESTONE_LABEL,
  StageKey,
  type JourneyContract,
  type JourneyDeal,
  type JourneyInstallment,
  type JourneyLink,
  type JourneyRungState,
  type JourneyDealSubStep,
  type JourneySubStep,
  type WorkstreamHolder,
  type WorkstreamJourneyResponse,
} from '@pv/contracts'
import { daysUntil, dueLevelOf, stepLevelOf } from '../contract-due'
import { PIPELINE_STAGES } from './das-vina'
import { saoDo, SAO_DO_CUSTOMER, SAO_DO_FROZEN_AT, SAO_DO_PEOPLE, SAO_DO_SIGNED_AT } from './sao-do'
import { SAO_DO_CONTRACTS, type Contract } from './sao-do-contracts'

/** SCENARIO 1 · the JOURNEY half — the customer's four journeys for the rebuilt
 *  `/sales/workstreams/:code` screen (shape: `WorkstreamJourneyResponse`).
 *
 *  Built LAZILY on first call: `sao-do.ts` re-exports this file, so when a
 *  screen enters through that door this module runs before `sao-do.ts` has
 *  declared `SAO_DO_FROZEN_AT` — a top-level constant would hit the TDZ.
 *
 *  Facts the scenario already had (lead, renewal quote, main contract) are read by
 *  reference; every day count and due level is computed against the freeze.
 *  Stage limits come from `PIPELINE_STAGES` because it is the only static
 *  declaration of them (the live ones sit in config rows). New figures are
 *  locked by `sao-do-journey.test.ts`. */

type Body = Omit<WorkstreamJourneyResponse, 'previous' | 'next' | 'hiddenDeals'>
type Mark = { at: string; by: WorkstreamHolder | null } | 'skip' | undefined
type Tail = {
  state: Extract<JourneyRungState, 'current' | 'done' | 'stopped'>
  endAt: string | null
}

const DAY_MS = 86_400_000
const LIMIT_DAYS = new Map<string, number>(PIPELINE_STAGES.map((s) => [s.key, s.limitDays]))

const at = (day: string, time = '09:00') => `${day}T${time}:00+07:00`
const span = (from: string, to: string) => daysUntil(to, from)

function must<T>(value: T | undefined, what: string): T {
  if (value === undefined) throw new Error(`sao-do-journey: missing ${what}`)
  return value
}

const actor = (id: string): WorkstreamHolder => {
  const a = must(
    saoDo.actors.find((x) => x.id === id),
    id,
  )
  return { id: a.id, name: a.name }
}

/** People outside `actors` carry no id anywhere, so their slot in the frozen
 *  `SAO_DO_PEOPLE` list is the only stable handle there is. */
const person = (name: string): WorkstreamHolder => {
  const i = SAO_DO_PEOPLE.findIndex((p) => p.name === name)
  if (i < 0) throw new Error(`sao-do-journey: missing ${name}`)
  return { id: `sao-do-people-${i}`, name }
}

/** One walk for all three ladders: rungs before the last reached one are done
 *  and last until the next reached rung; the last takes the tail's state. */
function walk<K extends string>(keys: readonly K[], marks: Partial<Record<K, Mark>>, tail: Tail) {
  const reached = keys.flatMap((k) => {
    const m = marks[k]
    return typeof m === 'object' ? [{ key: k, ...m }] : []
  })
  return keys.map((key) => {
    const m = marks[key]
    const blank = { key, at: null, by: null, days: null }
    if (m === 'skip') return { ...blank, state: 'skipped' as const }
    if (m === undefined) return { ...blank, state: 'upcoming' as const }
    const next = reached[reached.findIndex((r) => r.key === key) + 1]
    if (next) return { key, state: 'done' as const, at: m.at, by: m.by, days: span(m.at, next.at) }
    const end = tail.state === 'current' ? SAO_DO_FROZEN_AT : tail.endAt
    return { key, state: tail.state, at: m.at, by: m.by, days: end ? span(m.at, end) : null }
  })
}

function dealRungs(
  marks: Partial<Record<StageKey, Mark>>,
  tail: Tail,
  subSteps: Partial<Record<StageKey, JourneyDealSubStep[]>> = {},
): JourneyDeal['rungs'] {
  return walk(StageKey.options, marks, tail).map((r) => {
    const limitDays = LIMIT_DAYS.get(r.key) ?? null
    // Flow G3: the stage clock ends `limitDays` after entry, graded on the due ladder.
    const clockEnd =
      r.state === 'current' && r.at && limitDays
        ? new Date(Date.parse(r.at) + limitDays * DAY_MS).toISOString()
        : null
    return {
      ...r,
      limitDays,
      dueLevel: clockEnd ? dueLevelOf(clockEnd, SAO_DO_FROZEN_AT) : null,
      subSteps: subSteps[r.key] ?? [],
    }
  })
}

type StepInput = { at?: string | null; due?: string | null; note?: string | null }

function step(label: string, state: JourneyRungState, s: StepInput = {}): JourneySubStep {
  const due = s.due ?? null
  const doneAt = s.at ?? null
  return {
    label,
    state,
    at: doneAt,
    due,
    note: s.note ?? null,
    dueLevel: due ? dueLevelOf(due, SAO_DO_FROZEN_AT, doneAt ?? undefined) : null,
  }
}

/** The n-th quote send, as a rung sub-step: one per quotation-sent touch. */
function quoteSent(round: number, label: string, s: StepInput): JourneyDealSubStep {
  return { ...step(label, 'done', s), kind: 'quote-sent', round }
}

/** A care activity done under the `engaged` rung (ADR 0072). */
function activity(
  kind: 'sample' | 'poc' | 'demo' | 'site-visit',
  day: string,
  by: WorkstreamHolder,
): JourneyDealSubStep {
  return {
    ...step(OPPORTUNITY_MILESTONE_LABEL[kind], 'done', { at: at(day) }),
    kind: 'activity',
    activity: kind,
    by,
  } as JourneyDealSubStep
}

type InstallmentInput = Pick<
  Contract['installments'][number],
  'no' | 'label' | 'share' | 'amount' | 'due' | 'paidAt'
>

/** Paid always means paid in full — the scenario has no partial payment. */
function installment(row: InstallmentInput, invoicedAt: string | null): JourneyInstallment {
  return {
    no: row.no,
    label: row.label,
    share: row.share,
    amount: row.amount,
    due: row.due,
    invoiceNo: null,
    invoicedAt,
    paidAt: row.paidAt ?? null,
    paidAmount: row.paidAt ? row.amount : null,
    dueLevel: dueLevelOf(row.due, SAO_DO_FROZEN_AT, row.paidAt),
  }
}

/** A licence contract: one payment, no deployment, no acceptance. */
function licenceContract(c: {
  code: string
  dealCode: string
  amount: number
  signedAt: string
  holder: WorkstreamHolder
  invoicedAt: string
  paid: InstallmentInput & { paidAt: string }
  licence: { from: string; to: string }
}): JourneyContract {
  const by = c.holder
  return {
    code: c.code,
    dealCode: c.dealCode,
    kind: 'licence',
    amount: c.amount,
    signedAt: c.signedAt,
    holder: c.holder,
    implementer: null,
    rungs: walk(
      ContractRungKey.options,
      {
        signed: { at: c.signedAt, by },
        deploy: 'skip',
        accept: 'skip',
        collect: { at: c.invoicedAt, by },
        done: { at: c.paid.paidAt, by },
      },
      { state: 'done', endAt: null },
    ),
    milestones: [],
    acceptance: [],
    installments: [installment(c.paid, c.invoicedAt)],
    licence: c.licence,
  }
}

/** One `amount` for a one-shot licence, stated once and split into its single
 *  installment, so the two can never disagree. */
const oneShot = (amount: number, due: string, paidAt: string) => ({
  no: 1,
  label: 'Thanh toán một lần sau khi ký',
  share: 100,
  amount,
  due,
  paidAt,
})

// ---------------------------------------------------------------------------
// WS-0041 · journey 1 — the 2025 CMMS licence, closed WON once it grew twice
// ---------------------------------------------------------------------------

const HD_2531_AMOUNT = 360_000_000
const HD_2531_LICENCE = { from: '2025-09-01', to: '2026-08-31' }

function ws0041(): Body {
  const huy = actor('u-huy')
  const ha = actor('u-ha')
  const signedAt = at('2025-08-20', '15:00')
  return {
    code: 'WS-0041',
    ordinal: 1,
    customer: SAO_DO_CUSTOMER.name,
    accountCode: null,
    status: 'closed',
    closeReason: 'WON',
    openedAt: at('2025-06-02'),
    closedAt: at('2026-07-08', '14:00'),
    lead: {
      code: 'LD-0058',
      state: 'converted',
      holder: huy,
      rungs: walk(
        LEAD_LANE_BACKBONE,
        {
          new: { at: at('2025-06-02'), by: huy },
          assigned: { at: at('2025-06-02'), by: huy },
          verifying: { at: at('2025-06-04'), by: huy },
          working: { at: at('2025-06-09'), by: huy },
          converted: { at: at('2025-06-20'), by: huy },
        },
        { state: 'done', endAt: null },
      ),
    },
    deals: [
      {
        code: 'OP-0074',
        name: 'Bản quyền CMMS',
        holder: huy,
        acceptedBy: null,
        acceptedAt: null,
        amount: HD_2531_AMOUNT,
        expectedClose: '2025-08-31',
        outcome: 'won',
        outcomeAt: signedAt,
        rungs: dealRungs(
          {
            new: { at: at('2025-06-20', '10:00'), by: huy },
            assigned: { at: at('2025-06-21'), by: huy },
            engaged: { at: at('2025-07-02'), by: huy },
            quotation: { at: at('2025-07-21'), by: huy },
          },
          { state: 'done', endAt: signedAt },
          { engaged: [activity('poc', '2025-07-02', huy)] },
        ),
        nextAction: null,
        contractCodes: ['HĐ-2531'],
        stop: null,
      },
    ],
    contracts: [
      licenceContract({
        code: 'HĐ-2531',
        dealCode: 'OP-0074',
        amount: HD_2531_AMOUNT,
        signedAt,
        holder: huy,
        invoicedAt: at('2025-08-21', '10:00'),
        paid: oneShot(HD_2531_AMOUNT, '2025-08-30T00:00:00+07:00', '2025-08-28T00:00:00+07:00'),
        licence: HD_2531_LICENCE,
      }),
    ],
    doors: [
      {
        kind: 'growth',
        journeyCode: 'WS-0088',
        leadCode: 'LD-0334',
        from: { code: 'HĐ-2531', rung: 'done' },
        at: at('2026-07-08'),
        need: 'Khách muốn đưa MES vào xưởng X1',
        decidedBy: ha,
      },
      {
        kind: 'growth',
        journeyCode: 'WS-0089',
        leadCode: 'LD-0335',
        from: { code: 'HĐ-2531', rung: 'done' },
        at: at('2026-07-08', '14:00'),
        need: 'Bản quyền CMMS hết hạn cuối tháng 8 — khách muốn gia hạn',
        decidedBy: huy,
      },
    ],
  }
}

// ---------------------------------------------------------------------------
// WS-0088 · journey 2 — the rich one: one lead, three deals (failed · 1 · 2 contracts)
// ---------------------------------------------------------------------------

const HD_2608_AMOUNT = 240_000_000

/** The main MES contract is rebuilt from `SAO_DO_CONTRACTS`, never retyped: its milestones,
 *  acceptance and invoice day are the conditions, docs and records already
 *  written into its installments. */
function hd2607(dealCode: string): JourneyContract {
  const hd = must(
    SAO_DO_CONTRACTS.find((c) => c.code === 'HĐ-2607'),
    'HĐ-2607',
  )
  const lines = hd.installments
  const cond = (id: string) =>
    must(
      lines.flatMap((i) => i.conditions).find((x) => x.id === id),
      id,
    )
  const doc = (id: string) =>
    must(
      lines.flatMap((i) => i.docs).find((x) => x.id === id),
      id,
    )
  const record = (id: string) =>
    must(
      lines.flatMap((i) => i.records).find((x) => x.id === id),
      id,
    )

  const holder = { id: hd.ownerId, name: hd.ownerName }
  const implementer = person('Lê Minh Đức')
  const [kickoff, uat] = ['d2-c1', 'd3-c1'].map(cond)
  const stamped = (x: typeof kickoff) => ({ at: x?.doneAt, due: x?.due, note: x?.what })
  // Only installment 1 has an invoice (doc d1-t2); d1-r1 is the day it went out.
  const invoiced = (no: number) => (no === 1 ? record('d1-r1').at : null)

  return {
    code: hd.code,
    dealCode,
    kind: 'deployment',
    amount: hd.amount,
    signedAt: hd.signedAt,
    holder,
    implementer,
    rungs: walk(
      ContractRungKey.options,
      {
        signed: { at: hd.signedAt, by: holder },
        deploy: { at: must(kickoff?.doneAt, 'd2-c1.doneAt'), by: implementer },
        // Collect stays upcoming while deploy runs: one rung at a time. The advance
        // already paid shows only in `installments`, as on the canvas contract card.
      },
      { state: 'current', endAt: null },
    ),
    milestones: [
      step('Khởi động', 'done', stamped(kickoff)),
      // Done (the trial ran on it) but undated: no condition or record dates it, and
      // d2-c2 is operator training, not configuration.
      step('Cấu hình và tích hợp', 'done'),
      step('Chạy thử (UAT)', 'current', { due: uat?.due, note: record('d3-r1').what }),
      // No condition in the contract means go-live, so it carries no date.
      step('Go-live', 'upcoming'),
    ],
    acceptance: [
      { label: doc('d2-t1').name, state: doc('d2-t1').state, at: cond('d2-c3').doneAt ?? null },
      { label: cond('d3-c4').what, state: 'missing', at: null },
    ],
    installments: lines.map((i) => installment(i, invoiced(i.no))),
    licence: null,
  }
}

const HD_2609_AMOUNT = 120_000_000

/** The training kind walked through every rung: sessions are its deployment,
 *  and it waits at acceptance while the customer's signer is away. */
function hd2609(dealCode: string, holder: WorkstreamHolder): JourneyContract {
  const trainer = person('Nguyễn Văn Tú')
  const signedAt = at('2026-07-24', '15:00')
  const sentAt = at('2026-08-06', '10:00')
  const half = HD_2609_AMOUNT / 2
  return {
    code: 'HĐ-2609',
    dealCode,
    kind: 'training',
    amount: HD_2609_AMOUNT,
    signedAt,
    holder,
    implementer: trainer,
    rungs: walk(
      ContractRungKey.options,
      {
        signed: { at: signedAt, by: holder },
        deploy: { at: at('2026-07-28'), by: trainer },
        accept: { at: sentAt, by: trainer },
      },
      { state: 'current', endAt: null },
    ),
    milestones: [
      step('Buổi 1 · Lập kế hoạch tổng', 'done', { at: at('2026-07-28') }),
      step('Buổi 2 · Điều độ theo ca', 'done', { at: at('2026-07-31') }),
      step('Buổi 3 · Thực hành trên dữ liệu thật', 'done', { at: at('2026-08-05') }),
    ],
    acceptance: [{ label: 'Biên bản nghiệm thu đào tạo', state: 'awaiting-signature', at: sentAt }],
    installments: [
      installment(
        {
          no: 1,
          label: 'Tạm ứng sau khi ký',
          share: 50,
          amount: half,
          due: '2026-07-31T00:00:00+07:00',
          paidAt: '2026-07-30T00:00:00+07:00',
        },
        at('2026-07-25', '10:00'),
      ),
      installment(
        {
          no: 2,
          label: 'Sau nghiệm thu đào tạo',
          share: 50,
          amount: half,
          due: '2026-08-20T00:00:00+07:00',
        },
        null,
      ),
    ],
    licence: null,
  }
}

function ws0088(): Body {
  const huy = actor('u-huy')
  const ha = actor('u-ha')
  const lead = must(
    saoDo.objects.find((o) => o.code === 'LD-0334'),
    'LD-0334',
  )
  const mes = hd2607('OP-0291')
  const training = hd2609('OP-0290', huy)
  const stoppedAt = at('2026-08-03', '15:30')
  const licence = licenceContract({
    code: 'HĐ-2608',
    dealCode: 'OP-0291',
    amount: HD_2608_AMOUNT,
    signedAt: at('2026-07-21', '16:35'),
    holder: huy,
    invoicedAt: at('2026-07-22', '10:00'),
    paid: oneShot(HD_2608_AMOUNT, '2026-07-31T00:00:00+07:00', '2026-07-30T00:00:00+07:00'),
    licence: { from: '2026-08-01', to: '2027-07-31' },
  })
  return {
    code: 'WS-0088',
    ordinal: 2,
    customer: SAO_DO_CUSTOMER.name,
    accountCode: null,
    status: 'open',
    closeReason: null,
    openedAt: at('2026-07-08'),
    closedAt: null,
    lead: {
      code: lead.code,
      state: 'converted',
      holder: ha,
      rungs: walk(
        LEAD_LANE_BACKBONE,
        {
          new: { at: at('2026-07-08'), by: ha },
          assigned: { at: at('2026-07-08'), by: ha },
          verifying: { at: at('2026-07-09'), by: ha },
          working: { at: at('2026-07-10'), by: ha },
          converted: { at: at('2026-07-13'), by: ha },
        },
        { state: 'done', endAt: null },
      ),
    },
    deals: [
      {
        code: 'OP-0289',
        name: 'Cân tự động cho kho thành phẩm',
        holder: huy,
        acceptedBy: null,
        acceptedAt: null,
        amount: 180_000_000,
        expectedClose: '2026-09-30',
        outcome: 'lost',
        outcomeAt: stoppedAt,
        rungs: dealRungs(
          {
            new: { at: at('2026-07-13', '10:00'), by: huy },
            assigned: { at: at('2026-07-13', '14:00'), by: huy },
            engaged: { at: at('2026-07-14'), by: huy },
          },
          { state: 'stopped', endAt: stoppedAt },
          { engaged: [activity('poc', '2026-07-14', huy)] },
        ),
        nextAction: null,
        contractCodes: [],
        stop: {
          reason: 'Chưa có ngân sách năm nay',
          note: null,
          doNotContact: false,
          concludedBy: huy,
        },
      },
      {
        code: 'OP-0290',
        name: 'Đào tạo lập kế hoạch sản xuất trên MES cho phòng Kế hoạch',
        holder: huy,
        acceptedBy: null,
        acceptedAt: null,
        amount: training.amount,
        expectedClose: '2026-07-31',
        outcome: 'won',
        outcomeAt: training.signedAt,
        rungs: dealRungs(
          {
            new: { at: at('2026-07-13', '11:00'), by: huy },
            assigned: { at: at('2026-07-14'), by: huy },
            engaged: 'skip',
            quotation: { at: at('2026-07-15'), by: huy },
          },
          { state: 'done', endAt: training.signedAt },
          {
            quotation: [quoteSent(1, 'Gửi báo giá', { at: at('2026-07-15', '10:00') })],
          },
        ),
        nextAction: null,
        contractCodes: [training.code],
        stop: null,
      },
      {
        code: 'OP-0291',
        name: 'MES xưởng X1',
        holder: huy,
        acceptedBy: null,
        acceptedAt: null,
        amount: must(mes.amount ?? undefined, 'HĐ-2607.amount') + HD_2608_AMOUNT,
        expectedClose: '2026-07-24',
        outcome: 'won',
        outcomeAt: SAO_DO_SIGNED_AT,
        rungs: dealRungs(
          {
            new: { at: at('2026-07-13', '14:00'), by: huy },
            assigned: { at: at('2026-07-13', '16:00'), by: huy },
            engaged: { at: at('2026-07-14'), by: huy },
            quotation: { at: at('2026-07-17', '10:00'), by: huy },
          },
          { state: 'done', endAt: SAO_DO_SIGNED_AT },
          {
            engaged: [activity('poc', '2026-07-14', huy)],
            quotation: [quoteSent(1, 'Gửi báo giá', { at: at('2026-07-17', '10:00') })],
          },
        ),
        nextAction: null,
        contractCodes: [mes.code, licence.code],
        stop: null,
      },
    ],
    contracts: [training, mes, licence],
    doors: [
      {
        kind: 'growth',
        journeyCode: 'WS-0093',
        leadCode: 'LD-0352',
        from: { code: mes.code, rung: 'deploy' },
        at: at('2026-08-08', '16:00'),
        need: 'Trong lúc chạy thử dây chuyền 1, khách xin thêm báo cáo hiệu suất theo ca',
        decidedBy: ha,
      },
    ],
  }
}

// ---------------------------------------------------------------------------
// WS-0089 · journey 3 — the CMMS renewal (quote silent since 04/08) and a late add-on
// ---------------------------------------------------------------------------

function ws0089(): Body {
  const huy = actor('u-huy')
  const quote = must(
    saoDo.objects.find((o) => o.code === 'BG-0512'),
    'BG-0512',
  )
  const sentAt = at('2026-08-04', '10:00')
  const nextDue = '2026-08-12'
  return {
    code: 'WS-0089',
    ordinal: 3,
    customer: SAO_DO_CUSTOMER.name,
    accountCode: null,
    status: 'open',
    closeReason: null,
    openedAt: at('2026-07-08', '14:00'),
    closedAt: null,
    lead: {
      code: 'LD-0335',
      state: 'converted',
      holder: huy,
      rungs: walk(
        LEAD_LANE_BACKBONE,
        {
          new: { at: at('2026-07-08', '14:00'), by: huy },
          assigned: { at: at('2026-07-08', '14:00'), by: huy },
          verifying: { at: at('2026-07-09'), by: huy },
          working: { at: at('2026-07-10'), by: huy },
          converted: { at: at('2026-07-14'), by: huy },
        },
        { state: 'done', endAt: null },
      ),
    },
    deals: [
      {
        code: 'OP-0292',
        name: 'Gia hạn bản quyền CMMS',
        holder: huy,
        acceptedBy: null,
        acceptedAt: null,
        // Renewal quoted at the price of the licence it renews.
        amount: HD_2531_AMOUNT,
        expectedClose: HD_2531_LICENCE.to,
        outcome: 'open',
        outcomeAt: null,
        rungs: dealRungs(
          {
            new: { at: at('2026-07-24', '10:00'), by: huy },
            assigned: { at: at('2026-07-24', '14:00'), by: huy },
            engaged: 'skip',
            quotation: { at: sentAt, by: huy },
          },
          { state: 'current', endAt: null },
          {
            quotation: [quoteSent(1, `Gửi báo giá ${quote.code}`, { at: sentAt })],
          },
        ),
        nextAction: null,
        contractCodes: [],
        stop: null,
      },
      {
        code: 'OP-0293',
        name: 'Mở rộng CMMS sang xưởng X2',
        holder: huy,
        acceptedBy: null,
        acceptedAt: null,
        amount: 280_000_000,
        expectedClose: '2026-09-15',
        outcome: 'open',
        outcomeAt: null,
        rungs: dealRungs(
          {
            new: { at: at('2026-07-14', '10:00'), by: huy },
            assigned: { at: at('2026-07-14', '14:00'), by: huy },
            engaged: { at: at('2026-07-16'), by: huy },
          },
          { state: 'current', endAt: null },
          { engaged: [activity('poc', '2026-07-16', huy)] },
        ),
        nextAction: {
          text: 'Hẹn anh Đạt chốt kết quả POC',
          due: nextDue,
          doer: huy,
          dueLevel: stepLevelOf(nextDue, SAO_DO_FROZEN_AT),
          kind: null,
        },
        contractCodes: [],
        stop: null,
      },
    ],
    contracts: [],
    doors: [],
  }
}

// ---------------------------------------------------------------------------
// WS-0093 · journey 4 — born 08/08 from the MES trial run, no deal yet
// ---------------------------------------------------------------------------

function ws0093(): Body {
  const ha = actor('u-ha')
  const born = at('2026-08-08', '16:00')
  return {
    code: 'WS-0093',
    ordinal: 4,
    customer: SAO_DO_CUSTOMER.name,
    accountCode: null,
    status: 'open',
    closeReason: null,
    openedAt: born,
    closedAt: null,
    lead: {
      code: 'LD-0352',
      state: 'assigned',
      holder: ha,
      rungs: walk(
        LEAD_LANE_BACKBONE,
        { new: { at: born, by: ha }, assigned: { at: born, by: ha } },
        { state: 'current', endAt: null },
      ),
    },
    deals: [],
    contracts: [],
    doors: [],
  }
}

// ---------------------------------------------------------------------------
// THE TREE — links are derived from growth doors, so the rail cannot disagree
// ---------------------------------------------------------------------------

function linkOf(j: Body): JourneyLink {
  return {
    code: j.code,
    ordinal: j.ordinal,
    bornBy: 'growth',
    status: j.status,
    closeReason: j.closeReason,
  }
}

function assemble(bodies: Body[]): WorkstreamJourneyResponse[] {
  const byCode = new Map(bodies.map((b) => [b.code, b]))
  const edges = bodies.flatMap((from) =>
    from.doors.flatMap((d) =>
      d.kind === 'growth' ? [{ from, to: must(byCode.get(d.journeyCode), d.journeyCode) }] : [],
    ),
  )
  return bodies.map((b) => {
    const prev = edges.find((e) => e.to.code === b.code)
    return {
      ...b,
      hiddenDeals: 0,
      previous: prev ? linkOf(prev.from) : null,
      next: edges.filter((e) => e.from.code === b.code).map((e) => linkOf(e.to)),
    }
  })
}

let built: readonly WorkstreamJourneyResponse[] | undefined

/** All four, in ordinal order. */
export function saoDoJourneys(): readonly WorkstreamJourneyResponse[] {
  built ??= assemble([ws0041(), ws0088(), ws0089(), ws0093()])
  return built
}

export function saoDoJourney(code: string): WorkstreamJourneyResponse | undefined {
  return saoDoJourneys().find((j) => j.code === code)
}
