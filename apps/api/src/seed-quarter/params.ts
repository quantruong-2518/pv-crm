import type { LeadMotion, LeadSourceKind } from '@pv/contracts'
import type { ActorId, InstallmentEnd, OppStage, Termination } from './story.types'

/** Every tunable of the demo quarter, in one place, so the generator decides
 *  nothing about the business on its own. Calibrated to land near 150
 *  companies, 800 leads, 250 deals and 80 contracts between `WINDOW_START` and
 *  the run day. Weights are relative (they need not sum to 1). Reason ids are
 *  config_entry ids, identical on PGlite and Neon (checked 16/11/2026). */

export const SEED = 20260801
export const WINDOW_START = '2026-08-01'

/** The real seats on production (16/11/2026). The harness plants copies on PGlite. */
export const CAST = {
  director: 'u-quantb',
  head: 'u-grace',
  marketers: ['u-vita', 'u-vivian'],
  bds: ['u-test1', 'u-test2', 'u-vita', 'u-vivian'],
  presales: ['u-nari'],
  sales: ['u-sale1', 'u-test1', 'u-test2', 'u-nari'],
  collectors: ['u-sale1', 'u-nari'],
} as const satisfies Record<string, ActorId | readonly ActorId[]>

/** KPI teams under the head (ADR 0101), rostered from August. */
export const TEAMS = [
  {
    key: 'north',
    name: 'Nhóm Miền Bắc',
    lead: 'u-sale1',
    members: ['u-sale1', 'u-test1', 'u-vita'],
  },
  {
    key: 'south',
    name: 'Nhóm Miền Nam',
    lead: 'u-nari',
    members: ['u-nari', 'u-test2', 'u-vivian'],
  },
] as const

export const COUNTS = {
  companies: 150,
  partners: 6,
  leads: 800,
  contactsPerCompany: [2, 6],
} as const

export const MOTION: Record<LeadMotion, number> = {
  OUTBOUND: 30,
  INBOUND: 25,
  EVENT: 15,
  RECYCLE: 12,
  REFERRAL: 10,
  PARTNER: 8,
}

/** Source kind by motion: first entry is the usual one. */
export const SOURCE_KIND: Record<LeadMotion, [LeadSourceKind, number][]> = {
  OUTBOUND: [
    ['IMPORT', 50],
    ['APOLLO', 30],
    ['MANUAL', 20],
  ],
  INBOUND: [
    ['LANDING_PAGE', 80],
    ['MANUAL', 20],
  ],
  EVENT: [
    ['SCAN', 70],
    ['MANUAL', 30],
  ],
  RECYCLE: [['MANUAL', 100]],
  REFERRAL: [['MANUAL', 100]],
  PARTNER: [['MANUAL', 100]],
}

/** Eight campaigns. A lead of a campaign motion is born in its window. Waves
 *  are mail runs: 'sent' or 'draft' only — a scheduled wave would really send. */
export const CAMPAIGNS = [
  {
    key: 'event-aug',
    name: 'Hội thảo Nhà máy thông minh 08/2026',
    motion: 'EVENT',
    owner: 'u-vita',
    state: 'DONE',
    from: '2026-08-18',
    to: '2026-08-24',
    event: { venue: 'GEM Center, TP.HCM', day: '2026-08-20', registered: 240, checkedIn: 168 },
    waves: ['sent', 'sent'],
    audience: 180,
  },
  {
    key: 'mail-electronics',
    name: 'Thư ngành điện tử quý 3',
    motion: 'OUTBOUND',
    owner: 'u-vivian',
    state: 'DONE',
    from: '2026-08-05',
    to: '2026-09-15',
    event: null,
    waves: ['sent', 'sent', 'sent'],
    audience: 420,
  },
  {
    key: 'expo-sep',
    name: 'Triển lãm Sản xuất Việt Nam 2026',
    motion: 'EVENT',
    owner: 'u-vita',
    state: 'DONE',
    from: '2026-09-10',
    to: '2026-09-16',
    event: { venue: 'SECC, TP.HCM', day: '2026-09-12', registered: 520, checkedIn: 377 },
    waves: ['sent'],
    audience: 260,
  },
  {
    key: 'recycle',
    name: 'Chăm lại khách tạm dừng',
    motion: 'RECYCLE',
    owner: 'u-vivian',
    state: 'DONE',
    from: '2026-09-01',
    to: '2026-10-31',
    event: null,
    waves: ['sent', 'sent'],
    audience: 150,
  },
  {
    key: 'webinar-mes',
    name: 'Webinar giải pháp MES',
    motion: 'INBOUND',
    owner: 'u-vita',
    state: 'DONE',
    from: '2026-10-05',
    to: '2026-10-12',
    event: { venue: 'Trực tuyến', day: '2026-10-08', registered: 310, checkedIn: 142 },
    waves: ['sent'],
    audience: 300,
  },
  {
    key: 'mail-auto',
    name: 'Thư ngành ô tô quý 4',
    motion: 'OUTBOUND',
    owner: 'u-vivian',
    state: 'RUNNING',
    from: '2026-10-15',
    to: 'today',
    event: null,
    waves: ['sent', 'sent', 'draft'],
    audience: 380,
  },
  {
    key: 'expansion',
    name: 'Khách cũ mua thêm',
    motion: 'REFERRAL',
    owner: 'u-vita',
    state: 'STOPPED',
    from: '2026-09-20',
    to: '2026-10-20',
    event: null,
    waves: ['sent'],
    audience: 60,
  },
  {
    key: 'tet-2027',
    name: 'Chiến dịch Tết 2027',
    motion: 'OUTBOUND',
    owner: 'u-vivian',
    state: 'DRAFT',
    from: null,
    to: null,
    event: null,
    waves: [],
    audience: 0,
  },
] as const

/** Per delivered letter. Bounces/suppressions are shares of all letters. */
export const MAIL = {
  delivered: 0.92,
  bounced: 0.025,
  suppressed: 0.01,
  complained: 0.002,
  failedPermanent: 0.005,
  withheld: 0.03, // replied or met before a gated wave
  open: 0.38,
  clickOfOpened: 0.24,
  unsubscribe: 0.008,
  reply: 0.02,
} as const

/** Final lead state, by AGE on the run day. Young leads stay open. */
export const LEAD_END_BY_AGE: {
  maxDays: number
  w: { new: number; assigned: number; working: number; nurturing: number; converted: number }
}[] = [
  { maxDays: 7, w: { new: 45, assigned: 30, working: 20, nurturing: 3, converted: 2 } },
  { maxDays: 30, w: { new: 8, assigned: 14, working: 30, nurturing: 25, converted: 23 } },
  { maxDays: 999, w: { new: 3, assigned: 4, working: 14, nurturing: 45, converted: 34 } },
]
export const LEAD = {
  disabledShare: 0.012,
  replyFromPoolShare: 0.07, // of nurturing: came back as new
  recontactShare: 0.4, // of nurturing: a recontact date set
  duplicateMergedShare: 0.04,
  holdShare: 0.05,
  nextStepShare: 0.7, // of open owned leads
  /** Tier reached. */
  tier: { none: 25, prospect: 30, mql: 25, sql: 20 },
  firstResponseHours: { median: 6, max: 72 },
}
/** Park reasons for nurturing leads that never had a deal (EX-08/09 are automatic). */
export const EXIT_REASON: [string, number][] = [
  ['EX-01', 22],
  ['EX-02', 10],
  ['EX-03', 20],
  ['EX-04', 8],
  ['EX-05', 14],
  ['EX-06', 10],
  ['EX-07', 16],
]

/** Deal end for converted leads. Open deals sit at a stage; lost at the stage they stopped. */
export const DEAL_END: {
  open: Record<OppStage, number>
  lost: Record<OppStage, number>
  won: number
} = {
  open: { new: 12, assigned: 15, engaged: 25, quotation: 23 },
  lost: { new: 10, assigned: 20, engaged: 35, quotation: 30 },
  won: 80,
}
export const LOSS_REASON: [string, number][] = [
  ['LR-01', 22],
  ['LR-02', 18],
  ['LR-03', 15],
  ['LR-04', 10],
  ['LR-05', 12],
  ['LR-06', 8],
  ['LR-07', 6],
  ['other', 3],
]
export const QUOTE_REVISION_REASON: [string, number][] = [
  ['QR-01', 45],
  ['QR-02', 20],
  ['QR-03', 25],
  ['QR-04', 10],
]
export const DEAL = {
  bdShare: 0.7,
  presalesShare: 0.4,
  primaryChangedShare: 0.06,
  usdShare: 0.1,
  holdShare: 0.08,
  nextStepShare: 0.8, // of open deals
  /** Activities by share of deals that reached engaged. */
  activity: { demo: 0.5, 'site-visit': 0.3, poc: 0.15, sample: 0.2, solution: 0.35 },
  quoteRounds: [
    [1, 55],
    [2, 30],
    [3, 15],
  ] as [number, number][],
  /** Days in each step (min, max). */
  acceptLagDays: [0.2, 3],
  assignedToEngagedDays: [2, 10],
  engagedToQuotationDays: [7, 25],
  quotationToSignDays: [10, 40],
  /** Deal value in VND, log-uniform; USD deals divide by ~26 000. */
  valueVnd: [180_000_000, 5_200_000_000],
  signApproval: { none: 10, approved: 80, 'rejected-then-approved': 6 }, // won deals
  waitingApprovals: 4, // open quotation deals with a sign request waiting today
}

export const CONTRACT = {
  installmentsCount: [
    [1, 25],
    [2, 35],
    [3, 30],
    [4, 10],
  ] as [number, number][],
  firstDueAfterSignDays: [10, 20],
  gapDays: [30, 45, 60],
  /** End of an installment whose due is BEFORE the run day. */
  pastDue: {
    paid: 74,
    'paid-late': 12,
    overdue: 4,
    'overdue-waiting': 3,
    'overdue-approved': 3,
    'overdue-rejected': 2,
    'long-overdue': 2,
  } as Partial<Record<InstallmentEnd, number>>,
  /** Of installments due after the run day: within 7 days = due-soon. */
  termination: {
    none: 76,
    plain: 1,
    'customer-pays': 1,
    'company-pays': 1,
    'company-pays-settled': 1,
  } as Record<Termination, number>,
  temperatureReadings: [0, 3],
  growthShare: 0.08,
  documentsMissingShare: 0.15,
}

/** Meetings per journey by how far it went. 'upcoming' lands in the 14 days after the run day. */
export const MEETINGS = {
  leadOnly: { held: [0, 1], cancelled: 0.04, upcoming: 0.06 },
  deal: { held: [1, 3], cancelled: 0.08, upcoming: 0.15 },
  todayCount: 5,
}

/** Working hours in Vietnam for every human beat; weekends carry 5% of beats. */
export const HOURS = { from: 8, to: 18, weekendShare: 0.05 }

/** KPI: targets per role per month (agreed), plus December packages to defuse
 *  KpiAssignmentSweeper's 21/11 default. Values per person per month. */
export const KPI = {
  months: ['2026-08', '2026-09', '2026-10', '2026-11'],
  december: '2026-12',
  absences: 4,
  /** Notifications older than this many days are marked read. */
  readAfterDays: 3,
}

/** Admin traces. */
export const ADMIN = {
  aiCalls: 650,
  assistantSessions: 30,
  leadAiJobs: { done: 60, failed: 5 },
  scanBatches: 4,
  usdRate: [26_050, 26_420], // manual USD rate per day, set by the director
}
