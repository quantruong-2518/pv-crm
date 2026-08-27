import { createDb } from '@api/platform/db/create-db'
import {
  dasVina,
  leadContact,
  leadProfile,
  EXIT_REASONS,
  LEAD_CATEGORIES,
  LEAD_TIERS,
  LEADS,
  OPEN_DEALS,
  PIPELINE_STAGES,
  SOURCES,
  type Lead,
  type QuestionKey,
} from '@pv/engines/fixtures/das-vina'
import { CONFIG_PREFIX, ContactChannel, type ConfigList, type ExitReason } from '@pv/contracts'
import { configEntry } from '@api/branches/sales/config/config.schema'
import { contract } from '@api/branches/sales/contract/contract.schema'
import { lead } from '@api/branches/sales/lead/lead.schema'
import { opportunity } from '@api/branches/sales/opportunity/opportunity.schema'
import { actor, edge, objectRef } from '@api/platform/db/platform.schema'
import { loadEnv } from '@api/platform/config/env'

/** Nạp kịch bản 2 · DAS Vina vào Postgres tại máy.
 *
 *  Nguồn là FIXTURE ĐÓNG BĂNG, không phải dữ liệu bịa: cùng 100 dòng sổ mà
 *  `apps/web` đang vẽ, nên hai đầu so được với nhau bằng mắt trong lúc cắt
 *  từng endpoint sang backend. Đây là chỗ DUY NHẤT trong `apps/api` được phép
 *  nhập fixture — chỗ khác nhập là đưa tên khách hàng vào đường chạy thật.
 *
 *  Chạy: `pnpm db:migrate && pnpm db:seed`. */

/** Nhãn tiếng Việt (fixture) → khoá ASCII (hợp đồng).
 *
 *  Bảng này TỒN TẠI vì nợ số 4 chưa trả xong ở phía fixture: `Lead.exitReason`
 *  đang lưu thẳng nhãn hiển thị làm giá trị. Nó biến mất khi bước B của
 *  `docs/ban-giao-backend.md` đổi fixture sang khoá. */
const EXIT_KEY: Record<string, ExitReason> = {
  'Không gọi được ai': 'khong-goi-duoc',
  'Không phải khách của mình': 'khong-phai-khach-cua-minh',
  'Năm nay không có tiền': 'khong-co-ngan-sach',
  'Người liên hệ nghỉ việc': 'nguoi-lien-he-nghi',
  'Khách chọn bên khác': 'chon-ben-khac',
  'Im sau báo giá': 'im-sau-bao-gia',
}

/** Dịch nhãn sang khoá, và NỔ khi gặp nhãn lạ.
 *
 *  Bản trước viết `EXIT_KEY[label] ?? null` — fixture thêm lý do thứ bảy thì
 *  52 dòng sổ lặng lẽ mất trường `exitReason`, seed vẫn báo thành công, và cái
 *  sai chỉ lộ ra ở một biểu đồ nào đó vài tuần sau. Seed hỏng to còn hơn seed
 *  hỏng nhỏ mà im. */
function exitKeyOf(label: string): ExitReason {
  const key = EXIT_KEY[label]
  if (!key) {
    throw new Error(
      `Lý do rơi "${label}" chưa có khoá ASCII trong EXIT_KEY. ` +
        `Thêm vào cả \`packages/contracts/src/sales/enums.ts\` lẫn bảng ở seed.`,
    )
  }
  return key
}

/** Ba quy ước "trống" của fixture → MỘT quy ước của bảng.
 *
 *  `Lead` dùng `undefined`, `LeadProfile` dùng `''`, `Opportunity` trộn cả hai
 *  (nợ số 5). Bảng chỉ nhận `NULL`, và CHECK `lead_no_blank` từ chối chuỗi
 *  rỗng — nên phép chuẩn hoá phải xảy ra ở ĐÂY, không phải ở chỗ đọc. */
const blank = <T>(v: T | '' | null | undefined): T | null =>
  v === '' || v === null || v === undefined ? null : v

const DAY = 86_400_000

/** Mốc lead vào chỗ hiện tại, tính NGƯỢC từ `daysHere` của fixture.
 *
 *  Bảng lưu mốc chứ không lưu số ngày (xem `lead.schema.ts`), nên seed phải
 *  đổi chiều: `stage_since = mốc dừng − daysHere`. Lead đã rơi thì đồng hồ
 *  dừng ở `exitedAt`, nên con số của nó cố định mãi mãi; lead còn sống thì mốc
 *  dừng là `now()`, nên `daysHere` khớp fixture NGAY SAU KHI SEED rồi trôi
 *  theo ngày thật. Đó là hệ quả đúng của việc bỏ một cột đóng băng — kịch bản
 *  "hôm nay" phải chạy theo hôm nay. */
function stageSinceOf(l: Lead): Date {
  const stop = l.exitedAt ? new Date(l.exitedAt).getTime() : Date.now()
  return new Date(stop - l.daysHere * DAY)
}

/** Hồ sơ có ĐỦ hai ô liên hệ, dùng để lấy tên người và email.
 *
 *  `contact_name` và `email` là cột BẮT BUỘC của bảng, nhưng fixture chỉ lộ
 *  chúng khi lead đã moi được ô 4 và ô 5 — 58 và 62 dòng trong 100 dòng thì
 *  chưa. Thay vì bịa một mẫu email mới, seed gọi CHÍNH bộ sinh tất định của
 *  fixture trên một bản sao đã đánh dấu hai ô đó là đã moi: cùng công thức,
 *  cùng kết quả, không có dữ liệu lạ nào vào cơ sở dữ liệu.
 *
 *  Những trường khác của hai ô ấy (`contact_title`, `phone`, `channel`) VẪN
 *  lấy theo `filled` thật, vì hai cột đếm ô của bảng đo chúng — lấy theo bản
 *  sao thì mọi lead đều đủ ô 4 và ô 5, và cổng init data mất nghĩa. */
const CONTACT_SLOTS: QuestionKey[] = ['nguoi-lien-he', 'kenh']

function contactOf(l: Lead) {
  const full: Lead = { ...l, filled: [...new Set([...l.filled, ...CONTACT_SLOTS])] }
  const c = leadContact(full)
  /* Bản sao đã đánh dấu đủ hai ô nên `leadContact` luôn trả người VÀ email —
     nhưng chữ ký của nó vẫn cho phép vắng, nên kiểm ở đây thay vì ép kiểu. Ngày
     fixture đổi cách sinh, chỗ này nổ chứ không nhét `undefined` vào cột
     `NOT NULL`. */
  if (!c?.email) throw new Error(`Không dựng được người liên hệ cho ${l.code}`)
  return { ...c, email: c.email }
}

/** Nhãn bảy kênh liên lạc — CHÉP NGUYÊN VĂN từ `CHANNEL_LABEL` bên
 *  `apps/web/src/data/sales-config.ts`.
 *
 *  Chép chứ không nhập: máy chủ không được với sang app web (eslint chặn, và
 *  đúng ra là thế). Chép chứ không đặt tên mới: bảy nhãn này đã chốt ở màn Cấu
 *  hình, gõ lại theo ý mình ở đây là dựng bản thứ hai của cùng một quyết định.
 *
 *  Đây là bản chép CUỐI CÙNG của bảng đó. Sau lần seed này nguồn sự thật là
 *  `sales.config_entry`; bảng bên `apps/web` phải rút về đọc từ API, cùng đường
 *  mà `PIPELINE_STAGES`, `LEAD_CATEGORIES` và bốn danh mục kia đang đi.
 *
 *  Hai thuộc tính của kênh — `hasRoad` (E4 đã gửi thật được chưa) và "có địa
 *  chỉ để dội hay không" — KHÔNG theo vào bảng: lược đồ đã chốt của
 *  `config_entry` chỉ có ba cột thuộc tính (`limit_days`, `owner_id`, `kind`),
 *  không cột nào chở được chúng. Chúng ở nguyên `E4_CHANNELS` và
 *  `ADDRESSED_CHANNELS` bên `apps/web`. Ghi ra để không ai tưởng là chỗ quên. */
const CHANNEL_NAME: Record<ContactChannel, string> = {
  email: 'Email',
  'zalo-oa': 'Zalo OA',
  telegram: 'Telegram',
  'in-app': 'Trong app',
  linkedin: 'LinkedIn',
  facebook: 'Facebook',
  website: 'Website',
}

/** Một dòng danh mục trước khi có mã và số thứ tự. */
type ConfigSeed = { name: string; limitDays?: number; ownerId?: string | null; kind?: string }

/** Đánh mã và đánh số theo ĐÚNG thứ tự fixture đang có.
 *
 *  Thứ tự nhập là thứ tự nghiệp vụ, nên nó không được sắp lại theo bảng chữ cái
 *  hay theo bất cứ thứ gì khác: 'Mới' phải là `ord` 1 và 'Chờ ký' phải là 5, vì
 *  đó là hình dạng thật của cái phễu. Mã thì ngược lại — nó KHÔNG mang nghĩa,
 *  nó chỉ cần bất biến. */
function configRows(list: ConfigList, items: ConfigSeed[]) {
  return items.map((it, i) => ({
    id: `${CONFIG_PREFIX[list]}-${String(i + 1).padStart(2, '0')}`,
    list,
    name: it.name,
    ord: i + 1,
    active: true,
    limitDays: it.limitDays ?? null,
    ownerId: it.ownerId ?? null,
    kind: it.kind ?? null,
  }))
}

async function seed(): Promise<void> {
  const env = loadEnv()
  const { db, close, kind } = await createDb(env.DATABASE_URL)

  const actors = dasVina.actors
  const idOf = new Map(actors.map((a) => [a.name, a.id]))

  /** Tên người → id, và NỔ nếu fixture nhắc một người không có trong sổ nhân
   *  sự. Áp cho cả ba vai đứng tên trên lead, không chỉ người giữ. */
  const personId = (name: string | undefined | null, code: string, role: string) => {
    if (!name) return null
    const id = idOf.get(name)
    if (!id) throw new Error(`${code}: ${role} "${name}" không khớp actor nào`)
    return id
  }

  /* ── Sáu danh mục cấu hình ─────────────────────────────────────────────────
     Lấy ĐÚNG từ fixture: giữ nguyên thứ tự, giữ nguyên nhãn. Không dòng nào
     được thêm, không `limitDays` nào được đoán — sáu danh mục này chính là thứ
     hôm nay còn là `z.enum` và hằng số, nên một giá trị bịa ra ở đây sẽ được
     đọc như luật đã chốt của phòng kinh doanh.

     `CATEGORY` là danh mục duy nhất có khoá ngoại sang người: fixture ghi TÊN
     Sale phụ trách ngành, bảng lưu `id` — `personId` dịch, và nổ nếu fixture
     nhắc một người không có trong sổ nhân sự.

     `SOURCE` là danh mục duy nhất số dòng không cố định: nó theo `SOURCES` của
     kỳ, tám nguồn tính tới 17/08. */
  const configSeed = [
    ...configRows(
      'STAGE',
      PIPELINE_STAGES.map((s) => ({ name: s.label, limitDays: s.limitDays })),
    ),
    ...configRows(
      'TIER',
      LEAD_TIERS.map((t) => ({ name: t.label })),
    ),
    ...configRows(
      'CATEGORY',
      LEAD_CATEGORIES.map((c) => ({
        name: c.label,
        ownerId: personId(c.sale, `CATEGORY·${c.key}`, 'Sale phụ trách ngành'),
      })),
    ),
    ...configRows(
      'EXIT_REASON',
      EXIT_REASONS.map((r) => ({ name: r.label })),
    ),
    ...configRows(
      'CHANNEL',
      ContactChannel.options.map((k) => ({ name: CHANNEL_NAME[k] })),
    ),
    ...configRows(
      'SOURCE',
      SOURCES.map((s) => ({ name: s.label, kind: s.kind })),
    ),
  ]

  const rows = LEADS.map((l, i) => {
    const p = leadProfile(l)
    const c = contactOf(l)
    const hasContactSlot = l.filled.includes('nguoi-lien-he')
    const reachable = l.filled.includes('kenh')

    return {
      code: l.code,
      createdAt: new Date(l.createdAt),

      company: l.company,
      legalName: blank(p.legalName),
      taxCode: blank(p.taxCode),
      address: blank(p.address),
      province: blank(l.province),
      category: l.category,
      mainProduct: blank(p.mainProduct),
      headcount: p.headcount,
      plants: p.plants,

      contactName: c.name,
      contactTitle: hasContactSlot ? blank(c.title) : null,
      email: c.email.trim().toLowerCase(),
      phone: reachable ? blank(c.phone) : null,
      contactChannel: reachable ? blank(c.channel as ContactChannel) : null,

      pain: blank(p.pain),
      currentStack: blank(p.currentStack),
      decisionMaker: blank(p.decisionMaker),
      approver: blank(p.approver),
      /* Tiền luôn đi cặp với đơn vị — CHECK `lead_money_pair` từ chối một nửa. */
      budget: p.budget,
      currency: p.budget === null ? null : p.currency,
      deadline: blank(p.deadline),

      ownerId: personId(l.owner, l.code, 'người giữ'),
      bdOwnerId: personId(blank(p.bdOwner), l.code, 'BD'),
      marketingOwnerId: personId(blank(p.marketingOwner), l.code, 'Marketing'),

      tier: l.tier,
      stage: l.stage ?? null,
      stageSince: stageSinceOf(l),
      /* Fixture chưa có khái niệm CỬA VÀO (landing · bd · import) — nó có từ
         luồng MAS mail trở đi. Để trống chứ không đoán: một giá trị đoán ở đây
         sẽ được đọc như dữ liệu thật ở màn Performance. */
      intakeChannel: null,
      source: blank(l.source),
      score: 0,
      lastTouchAt: null,

      exitReason: l.exitReason ? exitKeyOf(l.exitReason) : null,
      exitedAt: l.exitedAt ? new Date(l.exitedAt) : null,
      _i: i,
      /* Display NAME, not id — `platform.object.owner` stores the label E2's
         scope axis still compares against. Carried here rather than looked up
         again so the mirror rows below read from the same source as the lead
         row. Dropped before insert, like `_i`. */
      _owner: l.owner ?? null,
    }
  })

  /* ── E1 mirror rows, one per lead ──────────────────────────────────────────
     `lead.code` is a FOREIGN KEY into `platform.object` since 27/08, so a lead
     without a mirror row can no longer be written at all — that is the whole
     point of the key (see the docblock on the column in `lead.schema.ts`).

     The fixture's own `objects` list carries FOUR rows — account, contact,
     opportunity, quote — and no leads, so these 100 are built here. Built, not
     invented: same shape `lead.mapper.ts#toRef` produces when the API turns a
     lead row into an E1 object, and every field is read off the lead row that
     already exists. No new data enters the database.

     `state` holds the STAGE KEY ('moi'), matching `toRef`. The four fixture
     objects hold Vietnamese labels there instead ('Đang tìm hiểu') — that
     mismatch predates this file and is not resolved here; resolving it means
     deciding whether `object.state` is a key or a label, which is a decision
     for the module that reads it. */
  const leadObjects = rows.map((r) => ({
    code: r.code,
    kind: 'LD' as const,
    branch: 'Sales' as const,
    label: r.company,
    owner: r._owner,
    state: r.stage,
    amount: null,
  }))

  /* ── Cơ hội và hợp đồng ────────────────────────────────────────────────────
     Quan hệ lead → cơ hội nay là 1-n, nên `deal_code`/`contract_code` không
     còn là cột của lead. Hai bảng dưới đây là chỗ chúng đi tới.

     Fixture gán `dealCode` cho 10 dòng đầu và `contractCode` cho 6 dòng tiếp
     theo — và 6 dòng đã ký KHÔNG có `dealCode`. Nhưng một hợp đồng phải đến từ
     một cơ hội (khoá ngoại ghép của `contract` bắt buộc thế), nên seed dựng
     thêm 6 cơ hội tương ứng, mã suy thẳng từ mã hợp đồng. Đó là suy ra theo mô
     hình, không phải bịa dữ liệu: hợp đồng đã tồn tại thì cơ hội sinh ra nó
     cũng đã tồn tại. */
  const deals = rows
    .filter((r) => r._i < OPEN_DEALS.length)
    .map((r) => {
      const d = OPEN_DEALS[r._i]
      if (!d) throw new Error(`Thiếu OPEN_DEALS[${r._i}]`)
      return {
        code: d.code,
        leadCode: r.code,
        stage: d.stage,
        amount: d.amount,
        currency: 'VND' as const,
        ownerId: personId(d.owner, d.code, 'người giữ cơ hội'),
        closedAt: null,
        lostReason: null,
        createdAt: r.createdAt,
      }
    })

  const signedRows = rows.filter((r) => LEADS[r._i]?.contractCode)
  const won = signedRows.map((r) => {
    const code = LEADS[r._i]?.contractCode
    if (!code) throw new Error(`Thiếu contractCode ở ${r.code}`)
    return {
      opportunity: {
        code: code.replace(/^[^-]+/, 'OP'),
        leadCode: r.code,
        stage: null,
        amount: null,
        currency: null,
        ownerId: r.ownerId,
        closedAt: r.stageSince,
        lostReason: null,
        createdAt: r.createdAt,
      },
      contract: {
        code,
        opportunityCode: code.replace(/^[^-]+/, 'OP'),
        leadCode: r.code,
        amount: null,
        currency: null,
        signedAt: r.stageSince,
        ownerId: r.ownerId,
      },
    }
  })

  await db.transaction(async (tx) => {
    /* Xoá theo thứ tự NGƯỢC khoá ngoại. Seed là thao tác dựng LẠI, không phải
       thêm chồng — chạy hai lần phải ra cùng một cơ sở dữ liệu. */
    await tx.delete(contract)
    await tx.delete(opportunity)
    await tx.delete(edge)
    await tx.delete(lead)
    /* Sau `lead`: ngày sáu cột của lead thành khoá ngoại ghép trỏ vào
       `config_entry`, thứ tự này là thứ tự BẮT BUỘC. Trước `actor`: cột
       `owner_id` của `CATEGORY` trỏ sang sổ nhân sự. */
    await tx.delete(configEntry)
    await tx.delete(objectRef)
    await tx.delete(actor)

    await tx.insert(actor).values(
      actors.map((a) => ({
        id: a.id,
        name: a.name,
        email: a.email,
        role: a.role,
        roleId: a.roleId,
        branches: a.branches,
        ownOnly: a.ownOnly ?? false,
      })),
    )

    /* Ngay sau `actor` vì `CATEGORY.owner_id` trỏ vào đó, và trước `lead` vì
       sáu cột từ vựng của lead sẽ trỏ vào đây. */
    await tx.insert(configEntry).values(configSeed)

    /* E1 · đồ thị. Object trước, cạnh sau — cạnh có khoá ngoại hai đầu. */
    await tx.insert(objectRef).values([
      ...dasVina.objects.map((o) => ({
        code: o.code,
        kind: o.kind,
        branch: o.branch,
        label: o.label,
        owner: o.owner ?? null,
        state: o.state ?? null,
        amount: o.amount ?? null,
      })),
      /* BEFORE `lead` below, and that order is now mandatory rather than
         tidy: the foreign key on `lead.code` rejects every one of the 100
         rows if these are not already committed in the same transaction. */
      ...leadObjects,
    ])
    await tx
      .insert(edge)
      .values(dasVina.edges.map((e) => ({ fromCode: e.from, toCode: e.to, kind: e.kind })))

    await tx.insert(lead).values(rows.map(({ _i, _owner, ...row }) => row))
    await tx.insert(opportunity).values([...deals, ...won.map((w) => w.opportunity)])
    await tx.insert(contract).values(won.map((w) => w.contract))
  })

  console.log(
    `Đã nạp ${actors.length} actor · ${dasVina.objects.length + leadObjects.length} object · ` +
      `${dasVina.edges.length} cạnh · ${rows.length} lead · ` +
      `${deals.length + won.length} cơ hội · ${won.length} hợp đồng · ` +
      `${configSeed.length} dòng cấu hình · driver ${kind}.`,
  )
  await close()
}

void seed().catch((e: unknown) => {
  console.error(e)
  process.exitCode = 1
})
