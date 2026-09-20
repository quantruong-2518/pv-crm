import type {
  CostKind,
  ExitReason,
  LeadMotion,
  LeadSourceKind,
  LeadTier,
  StageKey,
} from '@pv/contracts'

/** The demo book `seed.ts` plants: twenty chip-industry companies, each walked
 *  along the real order of a sale — account → contacts → lead from a source →
 *  opportunity → contract.
 *
 *  Every time is DAYS AGO from the moment the seed runs, not a calendar date,
 *  so stage clocks and rotting flags read the same whichever day it is loaded.
 *  Tax codes are left empty and mailboxes use the reserved `.example` domain:
 *  the companies are real, the people and paperwork are not, and nothing here
 *  may be mailed for real by a campaign run. */

export type SourceKey = 'event' | 'email' | 'linkedin' | 'referral' | 'website' | 'expansion'

type SourceSeed = {
  key: SourceKey
  name: string
  kind: 'campaign' | 'event' | 'organic'
  motion: LeadMotion
  sourceKind: LeadSourceKind
  costs: { kind: CostKind; label: string; amount: number; daysAgo: number }[]
  event?: { venue: string; registered: number; checkedIn: number; daysAgo: number }
  campaign?: { name: string; slogan: string; state: 'RUNNING' | 'DONE' }
}

export const SOURCES: SourceSeed[] = [
  {
    key: 'event',
    name: 'Hội thảo Smart Factory ngành bán dẫn — TP.HCM',
    kind: 'event',
    motion: 'EVENT',
    sourceKind: 'MANUAL',
    costs: [
      { kind: 'EVENT', label: 'Thuê gian hàng 9m²', amount: 85_000_000, daysAgo: 80 },
      { kind: 'CONTENT', label: 'In brochure và standee', amount: 12_500_000, daysAgo: 76 },
      { kind: 'EVENT', label: 'Quà tặng khách ghé gian hàng', amount: 9_800_000, daysAgo: 72 },
    ],
    event: { venue: 'SECC, Quận 7, TP.HCM', registered: 140, checkedIn: 96, daysAgo: 70 },
    campaign: {
      name: 'Hội thảo Smart Factory bán dẫn 2026',
      slogan: 'Nhìn thấy từng lô wafer ngay trong ca',
      state: 'DONE',
    },
  },
  {
    key: 'email',
    name: 'Chuỗi email — nhà máy OSAT và substrate miền Bắc',
    kind: 'campaign',
    motion: 'OUTBOUND',
    sourceKind: 'APOLLO',
    costs: [
      {
        kind: 'DATA',
        label: 'Apollo 1.500 dòng — KCN Bắc Ninh, Bắc Giang',
        amount: 6_000_000,
        daysAgo: 155,
      },
      { kind: 'CHANNEL', label: 'Gói gửi ESP · 6 tháng', amount: 6_600_000, daysAgo: 155 },
      { kind: 'CONTENT', label: 'Case study truy xuất lô OSAT', amount: 15_000_000, daysAgo: 140 },
    ],
    campaign: {
      name: 'Email nurture OSAT miền Bắc',
      slogan: 'Truy xuất một lô chip trong 30 giây',
      state: 'RUNNING',
    },
  },
  {
    key: 'linkedin',
    name: 'LinkedIn Ads — Quản lý sản xuất ngành bán dẫn',
    kind: 'campaign',
    motion: 'OUTBOUND',
    sourceKind: 'LANDING_PAGE',
    costs: [
      { kind: 'CHANNEL', label: 'LinkedIn Ads · tháng 7', amount: 22_000_000, daysAgo: 88 },
      { kind: 'CHANNEL', label: 'LinkedIn Ads · tháng 8', amount: 24_000_000, daysAgo: 58 },
      { kind: 'CHANNEL', label: 'LinkedIn Ads · tháng 9', amount: 18_000_000, daysAgo: 17 },
      { kind: 'TOOL', label: 'Landing page builder · năm', amount: 7_200_000, daysAgo: 90 },
    ],
    campaign: {
      name: 'LinkedIn Ads Q3 — Plant Manager bán dẫn',
      slogan: 'OEE thật, không phải OEE trên Excel',
      state: 'RUNNING',
    },
  },
  {
    key: 'referral',
    name: 'Giới thiệu từ đối tác và khách hàng',
    kind: 'organic',
    motion: 'REFERRAL',
    sourceKind: 'MANUAL',
    costs: [],
  },
  {
    key: 'website',
    name: 'Website — form đăng ký demo',
    kind: 'organic',
    motion: 'INBOUND',
    sourceKind: 'LANDING_PAGE',
    costs: [{ kind: 'TOOL', label: 'Hosting và form · năm', amount: 4_800_000, daysAgo: 150 }],
  },
  {
    key: 'expansion',
    name: 'Khách hàng hiện hữu — mở rộng',
    kind: 'organic',
    motion: 'RECYCLE',
    sourceKind: 'MANUAL',
    costs: [],
  },
]

/** What PV One sells, as a deal lists it. Order is the catalog order. */
export const PRODUCTS = [
  'PV One MES — điều hành sản xuất',
  'PV One Trace — truy xuất lô và genealogy',
  'PV One WMS — kho và vật tư',
  'PV One CMMS — bảo trì thiết bị',
  'Tích hợp ERP / SAP',
  'Triển khai và đào tạo',
] as const

export type ProductNo = 0 | 1 | 2 | 3 | 4 | 5

export type DealSeed = {
  enteredDaysAgo: number
  /** Furthest column reached: where an open deal stands, where a won one was
   *  before signing, where a lost one was when it died. */
  stage: StageKey
  stageDaysAgo: number
  amount: number | null
  probability: number | null
  expectedCloseInDays: number | null
  products: ProductNo[]
  description: string
  /** Discovery criteria ticked so far; deals past discovery have all four. */
  ticks?: number
  won?: { signedDaysAgo: number }
  lost?: { reason: string; note: string; daysAgo: number }
}

export type JourneySeed = {
  account: string
  source: SourceKey
  bornDaysAgo: number
  tier: LeadTier
  /** Which of the account's contacts this lead talks to, primary first.
   *  Defaults to all of them; a second lead at one company needs its own
   *  person, since a live lead's mailbox is unique. */
  contacts?: number[]
  /** The seller who takes the lead into the pipeline — SQL only. */
  ownerId?: string
  pain?: string
  currentStack?: string
  decisionMaker?: string
  approver?: string
  budget?: number
  deadlineInDays?: number
  exit?: { reason: ExitReason; daysAgo: number }
  /** Oldest first. More than one is the SAME lead trying again — a deal that
   *  died without the lead exiting, then a later deal opened fresh. Only the
   *  furthest-along OPEN one ever drives the lead's own `stage` column and the
   *  run's stand; the rest are history a swimlane still has to show. */
  deals?: DealSeed[]
}

const EXCEL = 'Excel và báo cáo cuối ca; mỗi phòng giữ một bản số riêng.'

export const JOURNEYS: JourneySeed[] = [
  {
    account: 'amkor',
    source: 'referral',
    bornDaysAgo: 160,
    tier: 'sql',
    contacts: [0, 1],
    ownerId: 'u-am',
    pain: 'Truy xuất một lô SiP lỗi mất hai ngày vì dữ liệu nằm rải ở ba hệ thống.',
    currentStack: 'MES tự viết từ 2018, không nối với SAP.',
    decisionMaker: 'Giám đốc Nhà máy chốt phạm vi, tập đoàn duyệt ngân sách',
    approver: 'Trên 2 tỷ phải trình Amkor Korea',
    budget: 5_000_000_000,
    deadlineInDays: -10,
    deals: [
      {
        enteredDaysAgo: 140,
        stage: 'awaiting-signature',
        stageDaysAgo: 52,
        amount: 4_850_000_000,
        probability: 90,
        expectedCloseInDays: null,
        products: [0, 1, 4, 5],
        description: 'MES giai đoạn 1 cho hai line SiP, truy xuất lô tới cấp wafer, nối SAP PP.',
        won: { signedDaysAgo: 40 },
      },
    ],
  },
  {
    account: 'hana',
    source: 'email',
    bornDaysAgo: 150,
    tier: 'sql',
    ownerId: 'u-am',
    pain: 'Yield theo lô chỉ có sau ca, không dừng máy kịp khi tỉ lệ lỗi tăng.',
    currentStack: EXCEL,
    decisionMaker: 'Phó Giám đốc Sản xuất',
    approver: 'Tổng Giám đốc duyệt',
    budget: 3_500_000_000,
    deals: [
      {
        enteredDaysAgo: 128,
        stage: 'awaiting-signature',
        stageDaysAgo: 38,
        amount: 3_200_000_000,
        probability: 85,
        expectedCloseInDays: null,
        products: [0, 1, 5],
        description: 'MES và cảnh báo yield theo lô cho xưởng đóng gói DRAM.',
        won: { signedDaysAgo: 25 },
      },
    ],
  },
  {
    account: 'qorvo',
    source: 'website',
    bornDaysAgo: 120,
    tier: 'sql',
    ownerId: 'u-sale',
    pain: 'Kiểm kê vật tư tiêu hao phòng sạch làm bằng tay mỗi tuần.',
    currentStack: 'Oracle cho kế toán, kho theo dõi trên Excel.',
    decisionMaker: 'Giám đốc Vận hành',
    approver: 'Giám đốc Tài chính khu vực',
    budget: 2_500_000_000,
    deals: [
      {
        enteredDaysAgo: 100,
        stage: 'awaiting-signature',
        stageDaysAgo: 24,
        amount: 2_450_000_000,
        probability: 85,
        expectedCloseInDays: null,
        products: [2, 1, 5],
        description: 'WMS phòng sạch và truy xuất vật tư theo lô sản phẩm RF.',
        won: { signedDaysAgo: 12 },
      },
    ],
  },
  {
    account: 'amkor',
    source: 'expansion',
    bornDaysAgo: 20,
    tier: 'sql',
    contacts: [2],
    ownerId: 'u-am',
    pain: 'Máy bonder dừng không kế hoạch, lịch bảo trì vẫn nằm trên bảng trắng.',
    currentStack: 'MES PV One giai đoạn 1; bảo trì theo dõi trên Excel.',
    decisionMaker: 'Giám đốc Nhà máy',
    approver: 'Trên 2 tỷ phải trình Amkor Korea',
    budget: 1_800_000_000,
    deadlineInDays: 75,
    deals: [
      {
        enteredDaysAgo: 15,
        stage: 'discovery',
        stageDaysAgo: 8,
        amount: 1_600_000_000,
        probability: 30,
        expectedCloseInDays: 70,
        products: [3, 2],
        description: 'Giai đoạn 2: bảo trì dự phòng cho 120 máy bonder và kho phụ tùng.',
        ticks: 3,
      },
    ],
  },
  {
    account: 'semv',
    source: 'email',
    bornDaysAgo: 110,
    tier: 'sql',
    ownerId: 'u-am',
    pain: 'Không biết tấm substrate nào đang chờ ở công đoạn nào khi khách hỏi tiến độ.',
    currentStack: 'MES của tập đoàn cho line chính, line FC-BGA mới chưa có.',
    decisionMaker: 'Giám đốc Nhà máy FC-BGA',
    approver: 'Samsung Electro-Mechanics Hàn Quốc',
    budget: 6_000_000_000,
    deadlineInDays: 30,
    deals: [
      {
        enteredDaysAgo: 92,
        stage: 'awaiting-signature',
        stageDaysAgo: 6,
        amount: 5_400_000_000,
        probability: 80,
        expectedCloseInDays: 14,
        products: [0, 1, 4, 5],
        description: 'MES cho line FC-BGA mới, đồng bộ lệnh sản xuất với hệ thống tập đoàn.',
      },
    ],
  },
  {
    account: 'intel',
    source: 'event',
    bornDaysAgo: 70,
    tier: 'sql',
    ownerId: 'u-grace',
    pain: 'Dữ liệu dừng máy của khu test phải gom tay để tính OEE hằng tuần.',
    currentStack: 'Hệ thống nội bộ toàn cầu; khu test phụ trợ dùng Excel.',
    decisionMaker: 'Giám đốc Kỹ thuật Sản xuất',
    approver: 'Mua hàng khu vực châu Á',
    budget: 8_000_000_000,
    deadlineInDays: 60,
    deals: [
      {
        enteredDaysAgo: 58,
        stage: 'quoted',
        stageDaysAgo: 12,
        amount: 7_900_000_000,
        probability: 50,
        expectedCloseInDays: 45,
        products: [0, 3, 4, 5],
        description: 'OEE thời gian thực và bảo trì cho khu test phụ trợ, nối hệ thống nội bộ.',
      },
    ],
  },
  {
    account: 'luxshare',
    source: 'linkedin',
    bornDaysAgo: 85,
    tier: 'sql',
    ownerId: 'u-sale',
    pain: 'Hai nhà máy báo sản lượng theo hai cách, tổng hợp cuối tháng lệch nhau.',
    currentStack: EXCEL,
    decisionMaker: 'Giám đốc Sản xuất',
    approver: 'Tổng Giám đốc',
    budget: 3_000_000_000,
    deals: [
      {
        enteredDaysAgo: 70,
        stage: 'quoted',
        stageDaysAgo: 34,
        amount: 2_900_000_000,
        probability: 40,
        expectedCloseInDays: 20,
        products: [0, 2],
        description: 'MES chung cho hai nhà máy Quang Châu, một bộ số sản lượng.',
      },
    ],
  },
  {
    account: 'onsemi',
    source: 'event',
    bornDaysAgo: 68,
    tier: 'sql',
    ownerId: 'u-sale',
    pain: 'Chuyển đổi sản phẩm trên line mất nửa ca vì tra công thức bằng giấy.',
    currentStack: 'Camstar cũ, sắp hết hỗ trợ.',
    decisionMaker: 'Trưởng phòng Cải tiến đề xuất, Giám đốc Nhà máy chốt',
    budget: 3_800_000_000,
    deals: [
      {
        enteredDaysAgo: 50,
        stage: 'demo-done',
        stageDaysAgo: 9,
        amount: 3_600_000_000,
        probability: 35,
        expectedCloseInDays: 60,
        products: [0, 1, 5],
        description: 'Thay Camstar cho line đóng gói linh kiện công suất.',
      },
    ],
  },
  {
    /* Two deals, same lead: the first died in discovery when the budget froze,
     * and the lead sat SQL-with-nothing-moving for months before a second deal
     * reopened once money was free again — the swimlane's multi-lane view has
     * nothing to draw without a record shaped exactly like this one. */
    account: 'coherent',
    source: 'linkedin',
    bornDaysAgo: 150,
    tier: 'sql',
    ownerId: 'u-am',
    pain: 'Không truy được lô laser diode lỗi về đúng mẻ nguyên liệu.',
    currentStack: EXCEL,
    decisionMaker: 'Quản lý Sản xuất',
    deals: [
      {
        enteredDaysAgo: 130,
        stage: 'discovery',
        stageDaysAgo: 115,
        amount: 1_800_000_000,
        probability: 15,
        expectedCloseInDays: null,
        products: [1, 2],
        description:
          'Khảo sát truy xuất lô laser diode — dừng giữa chừng vì ngân sách CNTT bị đóng băng.',
        ticks: 1,
        lost: {
          reason: 'Ngân sách IT bị đóng băng cuối năm',
          note: 'Tập đoàn tạm dừng mọi dự án CNTT ngoài compliance, hẹn xem lại đầu năm sau.',
          daysAgo: 110,
        },
      },
      {
        enteredDaysAgo: 30,
        stage: 'discovery',
        stageDaysAgo: 11,
        amount: 2_100_000_000,
        probability: 20,
        expectedCloseInDays: 90,
        products: [1, 2],
        description: 'Ngân sách được duyệt lại — mở lại khảo sát truy xuất lô laser diode.',
        ticks: 2,
      },
    ],
  },
  {
    account: 'lginnotek',
    source: 'email',
    bornDaysAgo: 40,
    tier: 'sql',
    ownerId: 'u-sale',
    pain: 'Tỉ lệ lỗi module camera theo ca chỉ biết khi QA tổng hợp xong.',
    currentStack: 'MES tập đoàn cho line chính; line đế mạch mới dùng Excel.',
    decisionMaker: 'Trưởng phòng Sản xuất',
    deals: [
      {
        enteredDaysAgo: 25,
        stage: 'discovery',
        stageDaysAgo: 17,
        amount: 3_800_000_000,
        probability: 20,
        expectedCloseInDays: 100,
        products: [0, 1],
        description: 'MES và theo dõi lỗi theo ca cho line đế mạch mới.',
        ticks: 1,
      },
    ],
  },
  {
    account: 'jabil',
    source: 'website',
    bornDaysAgo: 9,
    tier: 'sql',
    ownerId: 'u-sale',
    pain: 'Khách yêu cầu báo cáo truy xuất theo serial trong 24 giờ, hiện mất ba ngày.',
    deals: [
      {
        enteredDaysAgo: 3,
        stage: 'new',
        stageDaysAgo: 3,
        amount: null,
        probability: null,
        expectedCloseInDays: null,
        products: [1],
        description: 'Khách vừa điền form demo, chưa khảo sát.',
      },
    ],
  },
  {
    account: 'foxconn',
    source: 'event',
    bornDaysAgo: 130,
    tier: 'sql',
    ownerId: 'u-sale',
    pain: 'Line mới mở chưa có hệ thống theo dõi WIP.',
    currentStack: 'Chờ tập đoàn quyết định dùng MES nào.',
    decisionMaker: 'Phó Tổng Giám đốc',
    approver: 'Tập đoàn tại Đài Loan',
    budget: 4_000_000_000,
    exit: { reason: 'chose-competitor', daysAgo: 30 },
    deals: [
      {
        enteredDaysAgo: 112,
        stage: 'quoted',
        stageDaysAgo: 55,
        amount: 4_200_000_000,
        probability: 10,
        expectedCloseInDays: null,
        products: [0, 2, 5],
        description: 'MES và WMS cho line lắp ráp mới.',
        lost: {
          reason: 'Giá cao hơn đối thủ',
          note: 'Tập đoàn chọn MES của nhà cung cấp Đài Loan đang chạy ở nhà máy mẹ, giá thấp hơn khoảng 20%.',
          daysAgo: 30,
        },
      },
    ],
  },
  {
    account: 'hanwha',
    source: 'event',
    bornDaysAgo: 66,
    tier: 'mql',
    pain: 'Kế hoạch gia công lập tay, không biết máy CNC nào đang rảnh.',
  },
  {
    account: 'infineon',
    source: 'linkedin',
    bornDaysAgo: 60,
    tier: 'sql',
    ownerId: 'u-sale',
    pain: 'Kỹ sư test phải đối chiếu tay kết quả kiểm công suất với lô wafer đầu vào.',
    currentStack: 'Hệ thống kiểm thử nội bộ, không nối với MES.',
    decisionMaker: 'Trưởng nhóm Test Engineering',
    deals: [
      {
        enteredDaysAgo: 45,
        stage: 'demo-done',
        stageDaysAgo: 20,
        amount: 2_600_000_000,
        probability: 25,
        expectedCloseInDays: null,
        products: [0, 1],
        description: 'Nối kết quả kiểm công suất với lô wafer đầu vào cho khu test.',
        lost: {
          reason: 'Chọn giải pháp nội bộ tập đoàn',
          note: 'Tập đoàn Infineon toàn cầu đã có công cụ tương tự, nhà máy dùng lại thay vì mua ngoài.',
          daysAgo: 15,
        },
      },
    ],
  },
  {
    account: 'fptsemi',
    source: 'website',
    bornDaysAgo: 14,
    tier: 'sql',
    ownerId: 'u-sale',
    pain: 'Dây chuyền kiểm thử mới chưa có cách gắn số serial với kết quả test.',
    currentStack: 'Chưa có hệ thống, đang chạy thử bằng tay.',
    decisionMaker: 'Giám đốc Dự án Nhà máy',
    deals: [
      {
        enteredDaysAgo: 10,
        stage: 'new',
        stageDaysAgo: 10,
        amount: 900_000_000,
        probability: 10,
        expectedCloseInDays: null,
        products: [1],
        description: 'Gắn số serial vào kết quả test cho dây chuyền kiểm thử mới.',
        lost: {
          reason: 'Dự án hoãn',
          note: 'Nhà máy dời lịch chạy dây chuyền kiểm thử sang năm sau, dừng mọi mua sắm liên quan.',
          daysAgo: 4,
        },
      },
    ],
  },
  { account: 'sdv', source: 'email', bornDaysAgo: 6, tier: 'prospect' },
  { account: 'viettel', source: 'linkedin', bornDaysAgo: 3, tier: 'prospect' },
  {
    account: 'renesas',
    source: 'event',
    bornDaysAgo: 67,
    tier: 'mql',
    exit: { reason: 'not-a-fit', daysAgo: 50 },
  },
  {
    account: 'marvell',
    source: 'linkedin',
    bornDaysAgo: 55,
    tier: 'prospect',
    exit: { reason: 'not-a-fit', daysAgo: 41 },
  },
  {
    account: 'synopsys',
    source: 'email',
    bornDaysAgo: 95,
    tier: 'prospect',
    exit: { reason: 'unreachable', daysAgo: 70 },
  },
  {
    account: 'meiko',
    source: 'email',
    bornDaysAgo: 100,
    tier: 'mql',
    pain: 'Truy xuất lô PCB cho khách ô tô vẫn làm trên giấy.',
    exit: { reason: 'no-budget', daysAgo: 60 },
  },
  {
    /* Same account, a second run months later — the account's own budget
     * freeze lifted and a colleague's referral opened a fresh lead, the same
     * shape `amkor` already uses twice above. This one dies one step from
     * signature instead of at the top of the funnel, the missing rung in the
     * lost-outcome spread. */
    account: 'meiko',
    source: 'referral',
    bornDaysAgo: 25,
    tier: 'sql',
    ownerId: 'u-sale',
    pain: 'Truy xuất lô PCB ô tô vẫn làm trên giấy; khách ô tô bắt đầu đòi báo cáo điện tử.',
    currentStack: 'Giấy tờ và Excel, không có hệ thống truy xuất.',
    decisionMaker: 'Trưởng phòng Chất lượng',
    approver: 'Tổng Giám đốc',
    budget: 2_200_000_000,
    deals: [
      {
        enteredDaysAgo: 20,
        stage: 'awaiting-signature',
        stageDaysAgo: 5,
        amount: 2_000_000_000,
        probability: 60,
        expectedCloseInDays: null,
        products: [1, 5],
        description: 'Truy xuất lô PCB theo yêu cầu khách ô tô, số hoá phiếu kiểm tra giấy.',
        lost: {
          reason: 'Ban giám đốc phủ quyết phút chót',
          note: 'Hợp đồng đã thống nhất điều khoản; Tổng Giám đốc mới nhậm chức yêu cầu dừng để rà soát lại toàn bộ ngân sách CNTT.',
          daysAgo: 2,
        },
      },
    ],
  },
]

/** THE MAIL HISTORY OF THE THREE CAMPAIGNS — added 20/09.
 *
 *  Without it the seed contradicted its own rules: `CampaignSweeper` only
 *  closes a campaign to `DONE` when at least one wave EXISTS (ADR 0045), yet
 *  CP-0001 was planted `DONE` with none, and the two `RUNNING` ones had nothing
 *  a reader could open. Every number a campaign screen draws — sent, delivered,
 *  opened, clicked, unsubscribed, bounced — comes from the rows below. */
export type WaveSeed = {
  source: SourceKey
  no: number
  label: string
  subject: string
  body: string
  /** When the batch left, counted back from the moment the seed runs. */
  daysAgo: number
}

export const WAVES: WaveSeed[] = [
  {
    source: 'event',
    no: 1,
    label: 'Đợt 1 · cảm ơn khách ghé gian hàng',
    subject: 'Cảm ơn {{contactName}} đã ghé gian hàng PV One',
    body: 'Chào {{contactName}},\n\nCảm ơn anh/chị đã dành thời gian ghé gian hàng của PV One tại Hội thảo Smart Factory.\n\nGửi anh/chị bản ghi phần demo truy xuất lô wafer, và **case study** của một nhà máy OSAT đã rút thời gian truy vết từ 4 giờ xuống 30 giây.',
    daysAgo: 66,
  },
  {
    source: 'event',
    no: 2,
    label: 'Đợt 2 · mời xem demo riêng',
    subject: '{{company}} có muốn xem bản demo trên số liệu của chính mình?',
    body: 'Chào {{contactName}},\n\nBản demo ở hội thảo chạy trên số liệu mẫu. Nếu anh/chị gửi một file sản lượng bất kỳ của {{company}}, bên em dựng lại đúng màn đó trên số liệu thật trong hai ngày.\n\n- Không cần kết nối hệ thống\n- Không ràng buộc gì sau buổi demo',
    daysAgo: 52,
  },
  {
    source: 'email',
    no: 1,
    label: 'Đợt 1 · giới thiệu truy xuất lô',
    subject: 'Truy xuất một lô chip của {{company}} trong 30 giây',
    body: 'Chào {{contactName}},\n\nMột nhà máy OSAT ở Bắc Ninh vừa rút thời gian truy vết một lô hàng lỗi từ 4 giờ xuống dưới 30 giây.\n\nEm gửi anh/chị bản mô tả ngắn cách họ làm — đọc hết trong 3 phút.',
    daysAgo: 34,
  },
  {
    source: 'email',
    no: 2,
    label: 'Đợt 2 · case study substrate',
    subject: 'Case study: nhà máy substrate giảm 62% thời gian dựng báo cáo ca',
    body: 'Chào {{contactName}},\n\nTiếp nối thư trước, đây là con số đo được sau 3 tháng ở một nhà máy substrate cùng quy mô {{company}}:\n\n- Dựng báo cáo ca: 45 phút → 17 phút\n- Sai lệch tồn kho cuối ca: 3,1% → 0,4%',
    daysAgo: 12,
  },
  {
    source: 'linkedin',
    no: 1,
    label: 'Đợt 1 · OEE thật',
    subject: 'OEE của {{company}} đang được tính từ đâu?',
    body: 'Chào {{contactName}},\n\nPhần lớn nhà máy em gặp đều tính OEE trên Excel, nhập tay cuối ca — nên con số đúng về hình thức nhưng trễ một ngày.\n\nEm gửi anh/chị một bản so sánh ngắn giữa OEE nhập tay và OEE đọc thẳng từ máy.',
    daysAgo: 15,
  },
]

/** What became of ONE letter, decided by its position — no randomness, so the
 *  seed plants the same book every run and `seed-book.test.ts` can lock the
 *  totals it adds up to. */
export type LetterFate = {
  state: 'delivered' | 'bounced' | 'suppressed'
  opened: boolean
  clicked: boolean
  unsubscribed: boolean
}

/** `index` is the recipient's place in the campaign's member list, `waveNo`
 *  shifts the pattern so two waves of one campaign do not land identically.
 *
 *  The two periods are SIX, not a realistic bounce rate: a seeded campaign
 *  holds five or six people, so anything rarer never fires and the bounce tile
 *  and its warning could not be looked at. The same seat bounces on wave 1 and
 *  is suppressed from wave 2 on — which is the real sequence, a hard bounce
 *  putting an address on the suppression list. */
export function letterFate(index: number, waveNo: number): LetterFate {
  if (waveNo > 1 && index % 6 === 5) {
    return { state: 'suppressed', opened: false, clicked: false, unsubscribed: false }
  }
  if (index % 6 === 5) {
    return { state: 'bounced', opened: false, clicked: false, unsubscribed: false }
  }
  const opened = (index * 7 + waveNo * 3) % 9 < 4
  return {
    state: 'delivered',
    opened,
    clicked: opened && (index + waveNo) % 5 === 2,
    unsubscribed: opened && (index + waveNo) % 13 === 4,
  }
}
