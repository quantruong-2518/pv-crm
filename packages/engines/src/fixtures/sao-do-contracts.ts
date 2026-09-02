/** SCENARIO 1 · the CONTRACT half — the three live contracts of the tenant.
 *
 *  Split out of `sao-do.ts` for length, not for scope: this is the same
 *  scenario frozen at the same 10/08 · 07:58, and `sao-do.ts` re-exports it so
 *  `@pv/engines/fixtures/sao-do` stays the only door.
 *
 *  ------------------------------------------------------------------
 *  WHY CONDITIONS LIVE INSIDE AN INSTALLMENT, NOT IN A LIST OF THEIR OWN
 *  ------------------------------------------------------------------
 *  Because that is how the contract is written. Clause 4.2 does not say "there
 *  are ten obligations"; it says "installment 2 falls due once both sides sign
 *  the phase-1 acceptance record". An obligation tied to no money is one nobody
 *  reads; tied to money, its urgency comes for free instead of being assigned
 *  by hand.
 *
 *  NO NEW NUMBERS: `contracts.test.ts` next door locks the figures the scenario
 *  already carried — 1,840,000,000 for the main contract and the 890,000,000 of
 *  due receivables in `SAO_DO_KPI`. */

/** Which side owes the work. Two values only, and that is the point: every line
 *  has exactly one side on the hook, so "which side is this stuck on" always
 *  has an answer. */
export type ConditionSide = 'ta' | 'khách'

export type InstallmentCondition = {
  id: string
  side: ConditionSide
  what: string
  due: string
  /** Empty = not done. For a customer-side line, "done" means the CUSTOMER did
   *  it, not that we chased them — that is exactly where two-sided checklists
   *  usually start lying. */
  doneAt?: string
  who: string
}

/** "Not there yet" is a REAL state, not an empty slot: the invoice is unissued
 *  because the customer has not signed, and that ordering belongs to the
 *  contract rather than to the software. */
export type DocState = 'đủ' | 'chờ-ký' | 'chưa-có'

export type InstallmentDoc = {
  id: string
  name: string
  state: DocState
  hint: string
}

export type RecordState = 'xong' | 'chờ-trả-lời' | 'đã-xếp' | 'chưa-tới'

/** One touch — already sent, or queued to send. Both kinds share ONE list
 *  because the reader asks a single question: what have we chased, what is left
 *  to chase. Splitting it into "history" and "plan" makes them join two lists in
 *  their head. */
export type InstallmentRecord = {
  id: string
  at: string
  channel: 'email' | 'zalo-oa' | 'trong-app' | 'gọi'
  what: string
  detail: string
  state: RecordState
}

/** Free-hand note — the place for what no field can hold. "The contact is away
 *  in Korea until 11/08" explains four days of silence on its own, and no column
 *  in the schema carries that sentence. */
export type InstallmentNote = {
  id: string
  at: string
  who: string
  text: string
}

export type Installment = {
  no: number
  label: string
  /** Share of the contract value, whole percent. */
  share: number
  amount: number
  due: string
  /** Day the money landed. Empty = not collected. */
  paidAt?: string
  conditions: InstallmentCondition[]
  docs: InstallmentDoc[]
  records: InstallmentRecord[]
  notes: InstallmentNote[]
}

export type Contract = {
  code: string
  customer: string
  /** The customer-side contact — the person who signs acceptance. */
  contact: string
  contactRole: string
  signedAt: string
  amount: number
  /** `Actor.id` of the Sale who owns it. E2's scope axis reads this field. */
  ownerId: string
  ownerName: string
  installments: Installment[]
}

/** Two contracts belong to one Sale, the third to another — deliberately, so
 *  the book has something to cut when the viewer is an `ownOnly` Sale. With all
 *  three under one owner the book looks identical for every role, and a
 *  forgotten scope filter never surfaces while the screen is being built. */
export const SAO_DO_CONTRACTS: Contract[] = [
  {
    code: 'HĐ-2607',
    customer: 'Sao Đỏ Engineering',
    contact: 'Nguyễn Văn Đạt',
    contactRole: 'Phó giám đốc kỹ thuật',
    signedAt: '2026-07-21T16:20:00+07:00',
    amount: 1_840_000_000,
    ownerId: 'u-huy',
    ownerName: 'Đỗ Quang Huy',
    installments: [
      {
        no: 1,
        label: 'Tạm ứng sau khi ký',
        share: 30,
        amount: 552_000_000,
        due: '2026-07-28T00:00:00+07:00',
        paidAt: '2026-07-25T00:00:00+07:00',
        conditions: [
          {
            id: 'd1-c1',
            side: 'ta',
            what: 'Ký hợp đồng và gửi bản gốc cho khách',
            due: '2026-07-22T00:00:00+07:00',
            doneAt: '2026-07-21T00:00:00+07:00',
            who: 'Đỗ Quang Huy',
          },
          {
            id: 'd1-c2',
            side: 'khách',
            what: 'Chuẩn bị mặt bằng phòng máy và điện 3 pha',
            due: '2026-07-26T00:00:00+07:00',
            doneAt: '2026-07-24T00:00:00+07:00',
            who: 'Nguyễn Văn Đạt',
          },
        ],
        docs: [
          {
            id: 'd1-t1',
            name: 'Hợp đồng HĐ-2607 bản ký.pdf',
            state: 'đủ',
            hint: '12 trang · ký 21/07',
          },
          { id: 'd1-t2', name: 'Hoá đơn GTGT đợt 1', state: 'đủ', hint: 'Phạm Thị Mai xuất 22/07' },
          { id: 'd1-t3', name: 'Uỷ nhiệm chi của khách', state: 'đủ', hint: 'tiền về 25/07' },
        ],
        records: [
          {
            id: 'd1-r1',
            at: '2026-07-22T09:10:00+07:00',
            channel: 'email',
            what: 'Gửi hợp đồng bản ký và hoá đơn đợt 1',
            detail: 'khách xác nhận trong ngày',
            state: 'xong',
          },
          {
            id: 'd1-r2',
            at: '2026-07-25T15:02:00+07:00',
            channel: 'trong-app',
            what: 'Kế toán ghi nhận tiền về',
            detail: 'sớm hơn hạn 3 ngày',
            state: 'xong',
          },
        ],
        notes: [],
      },
      {
        no: 2,
        label: 'Sau nghiệm thu giai đoạn 1',
        share: 30,
        amount: 552_000_000,
        due: '2026-08-12T00:00:00+07:00',
        conditions: [
          {
            id: 'd2-c1',
            side: 'ta',
            what: 'Bàn giao máy chủ và cài đặt MES',
            due: '2026-07-30T00:00:00+07:00',
            doneAt: '2026-07-29T00:00:00+07:00',
            who: 'Lê Minh Đức',
          },
          {
            id: 'd2-c2',
            side: 'ta',
            what: 'Đào tạo vận hành ca 1 — 4 kỹ thuật viên',
            due: '2026-08-05T00:00:00+07:00',
            doneAt: '2026-08-04T00:00:00+07:00',
            who: 'Lê Minh Đức',
          },
          {
            id: 'd2-c3',
            side: 'ta',
            what: 'Gửi biên bản nghiệm thu giai đoạn 1 cho khách',
            due: '2026-08-08T00:00:00+07:00',
            doneAt: '2026-08-08T00:00:00+07:00',
            who: 'Lê Minh Đức',
          },
          {
            id: 'd2-c4',
            side: 'khách',
            what: 'Ký biên bản nghiệm thu giai đoạn 1',
            due: '2026-08-06T00:00:00+07:00',
            who: 'Nguyễn Văn Đạt',
          },
        ],
        docs: [
          {
            id: 'd2-t1',
            name: 'Biên bản nghiệm thu GĐ1.pdf',
            state: 'chờ-ký',
            hint: '2 trang · ta gửi 08/08',
          },
          { id: 'd2-t2', name: '6 ảnh chạy thử · xưởng X1', state: 'đủ', hint: 'chụp 07/08' },
          {
            id: 'd2-t3',
            name: 'Hoá đơn GTGT đợt 2',
            state: 'chưa-có',
            hint: 'kế toán xuất sau khi có chữ ký',
          },
          {
            id: 'd2-t4',
            name: 'Uỷ nhiệm chi của khách',
            state: 'chưa-có',
            hint: 'bằng chứng tiền đã chuyển',
          },
        ],
        records: [
          {
            id: 'd2-r1',
            at: '2026-07-29T08:30:00+07:00',
            channel: 'trong-app',
            what: 'Nhắc kiểm tra khách đã mở duyệt chi chưa',
            detail: 'đã xem',
            state: 'xong',
          },
          {
            id: 'd2-r2',
            at: '2026-08-05T09:04:00+07:00',
            channel: 'email',
            what: 'Thư báo trước hạn — gửi Nguyễn Văn Đạt',
            detail: 'khách mở 06/08 08:11',
            state: 'xong',
          },
          {
            id: 'd2-r3',
            at: '2026-08-08T09:12:00+07:00',
            channel: 'email',
            what: 'Gửi biên bản nghiệm thu GĐ1',
            detail: 'Lê Minh Đức gửi · chưa có bản ký về',
            state: 'xong',
          },
          {
            id: 'd2-r4',
            at: '2026-08-09T14:22:00+07:00',
            channel: 'zalo-oa',
            what: 'Nhắc lần 2 — xin ngày khách chuyển tiền',
            detail: 'đã nhận · chưa trả lời sau 20 giờ',
            state: 'chờ-trả-lời',
          },
          {
            id: 'd2-r5',
            at: '2026-08-12T08:00:00+07:00',
            channel: 'trong-app',
            what: 'Đối chiếu với kế toán — tiền về chưa',
            detail: 'bạn và Phạm Thị Mai',
            state: 'đã-xếp',
          },
          {
            id: 'd2-r6',
            at: '2026-08-13T08:00:00+07:00',
            channel: 'email',
            what: 'Nhắc chính thức — dẫn điều 6.1, phạt chậm 0,05%/ngày',
            detail: 'cc Trưởng phòng Kinh doanh · soạn sẵn',
            state: 'chưa-tới',
          },
        ],
        notes: [
          {
            id: 'd2-n1',
            at: '2026-08-09T16:40:00+07:00',
            who: 'Đỗ Quang Huy',
            text: 'Gọi lần 1 không bắt máy. Trợ lý bên anh Đạt nói anh đi công tác Hàn Quốc, 11/08 mới về. Nhịp nhắc 12/08 gần như chắc chắn trượt — cần xin người ký thay hoặc chấp nhận trễ 2–3 ngày.',
          },
        ],
      },
      {
        no: 3,
        label: 'Sau bàn giao toàn bộ',
        share: 30,
        amount: 552_000_000,
        due: '2026-09-20T00:00:00+07:00',
        conditions: [
          {
            id: 'd3-c1',
            side: 'ta',
            what: 'Chạy thử dây chuyền 1',
            due: '2026-08-08T00:00:00+07:00',
            who: 'Lê Minh Đức',
          },
          {
            id: 'd3-c2',
            side: 'khách',
            what: 'Cấp dữ liệu mã hàng (BOM) cho dây chuyền 2',
            due: '2026-08-25T00:00:00+07:00',
            who: 'Nguyễn Văn Đạt',
          },
          {
            id: 'd3-c3',
            side: 'ta',
            what: 'Bàn giao tài liệu vận hành',
            due: '2026-09-18T00:00:00+07:00',
            who: 'Lê Minh Đức',
          },
          {
            id: 'd3-c4',
            side: 'khách',
            what: 'Ký biên bản nghiệm thu toàn bộ',
            due: '2026-09-18T00:00:00+07:00',
            who: 'Nguyễn Văn Đạt',
          },
        ],
        docs: [
          {
            id: 'd3-t1',
            name: 'Kế hoạch chạy thử dây chuyền 1',
            state: 'đủ',
            hint: 'Lê Minh Đức lập 02/08',
          },
        ],
        records: [
          {
            id: 'd3-r1',
            at: '2026-08-09T10:15:00+07:00',
            channel: 'trong-app',
            what: 'Kế hoạch báo chạy thử trễ, hẹn xong 14/08',
            detail: 'Lê Minh Đức cam kết · chưa phải ngày chốt',
            state: 'xong',
          },
          {
            id: 'd3-r2',
            at: '2026-09-06T08:00:00+07:00',
            channel: 'email',
            what: 'Thư báo trước hạn đợt 3',
            detail: 'soạn sẵn theo nhịp hạn − 14',
            state: 'chưa-tới',
          },
        ],
        notes: [],
      },
      {
        no: 4,
        label: 'Giữ lại bảo hành',
        share: 10,
        amount: 184_000_000,
        due: '2027-03-20T00:00:00+07:00',
        conditions: [
          {
            id: 'd4-c1',
            side: 'ta',
            what: 'Hết 12 tháng bảo hành không sự cố',
            due: '2027-03-20T00:00:00+07:00',
            who: 'Lê Minh Đức',
          },
        ],
        docs: [],
        records: [],
        notes: [],
      },
    ],
  },
  {
    /** One installment, both sides done since 24/07 — this one is late payment
     *  and nothing else. It exists so the book can tell apart two very different
     *  kinds of stuck: stuck on work, and stuck on money. */
    code: 'HĐ-2604',
    customer: 'Minh Quang',
    contact: 'Phòng Mua hàng',
    contactRole: 'đầu mối chung',
    signedAt: '2026-06-12T00:00:00+07:00',
    amount: 520_000_000,
    ownerId: 'u-huy',
    ownerName: 'Đỗ Quang Huy',
    installments: [
      {
        no: 1,
        label: 'Thanh toán một lần sau bàn giao',
        share: 100,
        amount: 520_000_000,
        due: '2026-07-29T00:00:00+07:00',
        conditions: [
          {
            id: 'mq-c1',
            side: 'ta',
            what: 'Bàn giao và nghiệm thu toàn bộ',
            due: '2026-07-22T00:00:00+07:00',
            doneAt: '2026-07-20T00:00:00+07:00',
            who: 'Lê Minh Đức',
          },
          {
            id: 'mq-c2',
            side: 'khách',
            what: 'Ký biên bản nghiệm thu',
            due: '2026-07-24T00:00:00+07:00',
            doneAt: '2026-07-24T00:00:00+07:00',
            who: 'Phòng Mua hàng',
          },
        ],
        docs: [
          { id: 'mq-t1', name: 'Biên bản nghiệm thu.pdf', state: 'đủ', hint: 'hai bên ký 24/07' },
          { id: 'mq-t2', name: 'Hoá đơn GTGT', state: 'đủ', hint: 'xuất 25/07' },
          { id: 'mq-t3', name: 'Uỷ nhiệm chi của khách', state: 'chưa-có', hint: 'chưa thấy tiền' },
        ],
        records: [
          {
            id: 'mq-r1',
            at: '2026-08-03T09:00:00+07:00',
            channel: 'email',
            what: 'Nhắc chính thức lần 1 — dẫn điều 6.1',
            detail: 'khách hẹn "cuối tuần"',
            state: 'xong',
          },
          {
            id: 'mq-r2',
            at: '2026-08-10T09:00:00+07:00',
            channel: 'email',
            what: 'Nhắc chính thức lần 2 — cc Trưởng phòng Kinh doanh',
            detail: 'nhịp lặp 3 ngày một lần',
            state: 'đã-xếp',
          },
        ],
        notes: [
          {
            id: 'mq-n1',
            at: '2026-08-06T11:30:00+07:00',
            who: 'Đỗ Quang Huy',
            text: 'Nghĩa vụ hai bên xong hết từ 24/07 — đây thuần là chậm trả. Kế toán bên khách nói đang chờ duyệt chi của giám đốc.',
          },
        ],
      },
    ],
  },
  {
    /** Owned by the other Sale. This is the row that disappears for the Sale
     *  who owns the two above — E2's scope axis, not its role axis. */
    code: 'HĐ-2606',
    customer: 'Trường Thịnh',
    contact: 'Phòng Kỹ thuật',
    contactRole: 'đầu mối chung',
    signedAt: '2026-07-04T00:00:00+07:00',
    amount: 370_000_000,
    ownerId: 'u-ha',
    ownerName: 'Trần Thu Hà',
    installments: [
      {
        no: 1,
        label: 'Thanh toán một lần sau bàn giao',
        share: 100,
        amount: 370_000_000,
        due: '2026-08-10T00:00:00+07:00',
        conditions: [
          {
            id: 'tt-c1',
            side: 'ta',
            what: 'Bàn giao và nghiệm thu toàn bộ',
            due: '2026-08-03T00:00:00+07:00',
            doneAt: '2026-08-01T00:00:00+07:00',
            who: 'Lê Minh Đức',
          },
          {
            id: 'tt-c2',
            side: 'khách',
            what: 'Ký biên bản nghiệm thu',
            due: '2026-08-05T00:00:00+07:00',
            doneAt: '2026-08-05T00:00:00+07:00',
            who: 'Phòng Kỹ thuật',
          },
        ],
        docs: [
          { id: 'tt-t1', name: 'Biên bản nghiệm thu.pdf', state: 'đủ', hint: 'hai bên ký 05/08' },
          { id: 'tt-t2', name: 'Hoá đơn GTGT', state: 'đủ', hint: 'xuất 06/08' },
          {
            id: 'tt-t3',
            name: 'Uỷ nhiệm chi của khách',
            state: 'chưa-có',
            hint: 'đến hạn hôm nay',
          },
        ],
        records: [
          {
            id: 'tt-r1',
            at: '2026-08-07T09:00:00+07:00',
            channel: 'email',
            what: 'Thư báo trước hạn',
            detail: 'khách xác nhận sẽ chuyển đúng hạn',
            state: 'xong',
          },
        ],
        notes: [],
      },
    ],
  },
]
