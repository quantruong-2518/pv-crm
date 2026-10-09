import { queryOptions, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Facebook,
  Globe,
  Linkedin,
  Mail,
  MessageCircle,
  Send,
  Smartphone,
  type IconGlyph,
} from '@pv/ui'
import { type WaveChannel } from '@pv/engines/fixtures/das-vina'
import {
  ActivityFreshnessResponse,
  LEAD_STOP_REASON_OTHER,
  LeadTier,
  OPPORTUNITY_STOP_REASON_OTHER,
  OPPORTUNITY_STAGE_LABEL,
  StageKey,
  type ConfigBundle,
  type ConfigEntry,
  type ConfigList,
  type ConfigEntryPatch,
  type ConfigProposalReceipt,
  type ActivityFreshnessPatch,
} from '@pv/contracts'
import { api, isApiError, userMessage, type ApiError } from '@/app/api'

/** Cấu hình phòng kinh doanh — module 6. Kịch bản 2 · DAS Vina.
 *
 *  Mọi hằng số định hình dữ liệu của phòng gom về đúng một chỗ. Màn khác đọc
 *  chúng qua fixture/engine; màn Cấu hình là nơi DUY NHẤT được sửa.
 *
 *  `usage` — số dòng đang bám vào từng mục, thứ quyết định một thay đổi có phải
 *  qua E3 hay không — nay đếm bằng SQL trên bảng thật và về theo
 *  `salesCatalogQuery` ở cuối file. Mục nào cũng phải trả lời được câu đó, kể cả
 *  mục chưa có giá trị nào (5.5): "chưa ai đặt ngưỡng" mà lại có ngần ấy lead
 *  đang chạy không hạn mới là thứ người xem cần biết. */

/** Kênh gửi hiển thị bằng tên người đọc được (luật 14). Tên sản phẩm giữ nguyên
 *  tiếng Anh — "Zalo OA" không dịch thành "tài khoản chính thức Zalo".
 *
 *  Bảng này thuộc về mục 5.7, tức thuộc về màn Cấu hình. Module 1 hiện còn giữ
 *  một bản sao cục bộ; theo luật 1 của module này thì bản sao đó phải rút về
 *  đây khi ai đó chạm vào màn Chiến dịch lần sau — vì thế hằng số này export
 *  sẵn, chỗ còn thiếu chỉ là dòng import bên màn Chiến dịch. */
export const CHANNEL_LABEL: Record<WaveChannel, string> = {
  email: 'Email',
  'zalo-oa': 'Zalo OA',
  telegram: 'Telegram',
  'in-app': 'Trong app',
  linkedin: 'LinkedIn',
  facebook: 'Facebook',
  website: 'Website',
}

/** Icon định danh của từng kênh — nhìn là biết đợt đó gửi đi đâu, không phải
 *  đọc chữ rồi mới biết. Dùng ở MỌI chỗ web nhắc tới kênh, để một kênh chỉ có
 *  đúng một hình.
 *
 *  Bảng nằm ở tầng `data/` của app chứ không ở `@pv/ui`: "kênh nào là kênh gì"
 *  là kiến thức nghiệp vụ của phòng kinh doanh, còn thư viện chỉ biết nhận một
 *  `IconGlyph` qua props. Đẩy bảng này vào `@pv/ui` là bắt thư viện biết Zalo
 *  OA tồn tại (luật biên giới package · CLAUDE.md).
 *
 *  Truyền tên icon làm dữ liệu là hợp lệ với luật 11 — chỗ render vẫn phải đi
 *  qua `<Icon icon={...} />`, không ai render thẳng.
 *
 *  Bốn kênh E4 lấy hình của chính công cụ gửi (thư · tin nhắn · Telegram · app
 *  trên máy khách); ba kênh còn lại lấy logo nền tảng, vì chúng là chỗ ĐĂNG chứ
 *  không phải chỗ gửi — khác biệt đó là nợ treo số 2, đừng làm mờ nó đi. */
export const CHANNEL_ICON: Record<WaveChannel, IconGlyph> = {
  email: Mail,
  'zalo-oa': MessageCircle,
  telegram: Send,
  'in-app': Smartphone,
  linkedin: Linkedin,
  facebook: Facebook,
  website: Globe,
}

/** Bốn kênh E4 đã có đường thật. Ba kênh còn lại khai báo được nhưng chưa gửi
 *  được — nợ treo số 2 của docs, không lấp bằng cách giấu chúng đi. */
export const E4_CHANNELS: WaveChannel[] = ['email', 'zalo-oa', 'telegram', 'in-app']

/** Kênh GỬI TỚI MỘT ĐỊA CHỈ — nơi duy nhất "mail hỏng" có nghĩa.
 *
 *  Khác `E4_CHANNELS` ở một chỗ và chỗ đó quan trọng: `in-app` hệ gửi được
 *  nhưng nó không có địa chỉ nào để dội, còn ba kênh đăng bài thì vừa không gửi
 *  được vừa không dội được. Tách hai danh sách vì chúng trả lời hai câu khác
 *  nhau — "hệ có gửi hộ được không" và "gửi hỏng thì có đo được không". */
export const ADDRESSED_CHANNELS: WaveChannel[] = ['email', 'zalo-oa', 'telegram']

/** Object neo của ContextRail — cùng chuỗi với sổ lead, vì cấu hình ở đây là
 *  thứ đang áp lên đúng câu chuyện đó (luật 10). */
export const ANCHOR_CODE = 'OP-0288'

// ---------------------------------------------------------------------------
// Danh mục THẬT — sáu bảng từ `GET /sales/config`
// ---------------------------------------------------------------------------

/** Sáu danh mục như máy chủ đang giữ chúng: `{ id, name, ord, active }` cộng
 *  ba thuộc tính riêng (`limitDays` · `ownerId` · `kind`).
 *
 *  ------------------------------------------------------------------
 *  TỪ 31/08 NÓ CHỞ CẢ `usage` — VÀ ĐÓ LÀ THỨ CẮT MÀN CẤU HÌNH
 *  ------------------------------------------------------------------
 *  Docblock cũ ở đây viết "máy chủ KHÔNG trả `usage`", nên `salesConfigQuery`
 *  bên trên phải đếm lấy trên sổ fixture 100 dòng trong khi Sổ lead đếm trên
 *  Neon 121 — hai con số về cùng một phòng, lệch nhau, trên hai màn cạnh nhau.
 *  `GET /sales/config` nay trả `usage` đếm bằng SQL trên bảng thật
 *  (`config.repository.ts#usage`), nên mọi phép đếm của màn Cấu hình đi qua
 *  ĐÂY. Luật đặt khoá của bảng đếm nằm ở `ConfigUsage` (`@pv/contracts`) —
 *  quan trọng khi nối, vì bốn danh mục còn khoá theo chuỗi cũ chứ chưa theo
 *  `id` cấu hình (nợ §6).
 *
 *  Cache dài là mặc định của cả app (`staleTime: Infinity` ở
 *  `app/query-client.ts`) và ở đây nó đúng theo nghĩa mạnh nhất: danh mục chỉ
 *  đổi khi có người duyệt một đề nghị qua E3, tức là một biến cố có người
 *  bấm nút — không phải thứ trôi sau lưng người dùng. */
export const salesCatalogQuery = queryOptions({
  queryKey: ['sales', 'config', 'catalog'] as const,
  queryFn: ({ signal }) =>
    api.read<ConfigBundle>('/sales/config', {
      need: { branch: 'Sales', permission: 'config.view' },
      signal,
    }),
})

/** The label behind a stored stop key — a config id, or the virtual `'other'`
 *  key (`LEAD_STOP_REASON_OTHER`, an alias of `OPPORTUNITY_STOP_REASON_OTHER`
 *  — one sentinel, ADR 0070), never a sentence.
 *
 *  `rows` comes from whichever door the caller can reach: `leadStopReasonsQuery`
 *  for anyone who stops or reads a lead, or this screen's own `EXIT_REASON`
 *  (the config screen reads it straight off the catalog) — same two fields either way, so one function
 *  serves both without asking either caller for a permission it may not hold.
 *
 *  Reads the WHOLE list, inactive rows included — a lead stopped under a
 *  reason the desk later switched off still has to say what it was stopped
 *  for. Falls back to the key itself, which is ugly and TRUE. */
export function stopReasonLabel(
  rows: readonly { id: string; name: string }[] | undefined,
  key: string | undefined,
): string | undefined {
  if (key === undefined) return undefined
  if (key === LEAD_STOP_REASON_OTHER) return 'Khác'
  return (rows ?? []).find((r) => r.id === key)?.name ?? key
}

// ---------------------------------------------------------------------------
// Two new catalogs — PRODUCTS and DEAL CARE REASONS
// ---------------------------------------------------------------------------

/** The `PRODUCT` catalog, for the picker on the deal form.
 *
 *  ------------------------------------------------------------------
 *  THE FIRST CATALOG WITH A REAL FOREIGN KEY POINTING AT IT
 *  ------------------------------------------------------------------
 *  The other five still join to the book by a lower-cased string (debt §6).
 *  This one does not: `sales.opportunity_product.product_id` is a COMPOSITE
 *  foreign key into `config_id_list`, so a wrong id is refused by Postgres
 *  rather than quietly becoming a chip with no label. That is why
 *  `usage.PRODUCT` is keyed by `id` — usable directly, with none of the
 *  positional matching `exitReasonRows` has to do.
 *
 *  Returns an EMPTY ARRAY before the query lands, never `undefined`: the picker
 *  maps over it, and an `undefined` branch is a branch every call site has to
 *  remember. A screen that needs to tell "loading" apart reads the query's own
 *  `isPending`. */
export function useProductCatalog() {
  const { data } = useQuery(salesCatalogQuery)
  return data?.PRODUCT ?? []
}

/** The `LOSS_REASON` catalog — why a DEAL was stopped (ADR 0069 §1, final).
 *  DIFFERENT from the lead's `EXIT_REASON` list: that one is why a LEAD left
 *  or parked. Both are open lists with a virtual "other" key.
 *
 *  Joined by ID, the second list after `PRODUCT` able to say that:
 *  `sales.opportunity.stop_reason` stores the configuration id the seller
 *  picked, so editing a label no longer resets that row's count to zero.
 *  `stageLabel` is `null` when `stage` is absent — the reason applies in every
 *  column, and the caller draws that caption. */
export function lossReasonRows(catalog: ConfigBundle | undefined) {
  return (catalog?.LOSS_REASON ?? [])
    .filter((r) => r.active)
    .map((r) => ({
      id: r.id,
      label: r.name,
      stage: r.stage ?? null,
      stageLabel: r.stage ? OPPORTUNITY_STAGE_LABEL[r.stage] : null,
      usage: catalog?.usage.LOSS_REASON[r.id] ?? 0,
    }))
}

/** The stop reasons a deal standing in ONE column may be stopped with.
 *
 *  A reason with no `stage` applies everywhere; one carrying a stage is offered
 *  only in that column — the same rule the server checks the sent key by, so a
 *  key the drawer could offer can never earn a 400. Empty until the catalog
 *  lands, never `undefined`: the picker maps over it. */
export function useCareReasons(stage: StageKey | null) {
  const { data } = useQuery(salesCatalogQuery)
  return lossReasonRows(data).filter((r) => r.stage === null || r.stage === stage)
}

/** The LABEL behind a stored stop key — `opportunity.stopReason` is a catalogue
 *  id, never a Vietnamese sentence, so a screen printing it raw shows 'LR-03'.
 *
 *  Reads the whole list rather than `lossReasonRows`, inactive rows included: a
 *  deal stopped under a reason the desk later switched off still has to say
 *  why it stopped. Falls back to the key, which is ugly and TRUE — the one
 *  thing it must never do is borrow a neighbouring row's label. */
export function useCareReasonLabel(reasonKey: string | undefined) {
  const { data } = useQuery(salesCatalogQuery)
  if (reasonKey === undefined) return undefined
  if (reasonKey === OPPORTUNITY_STOP_REASON_OTHER) return 'Khác'
  return (data?.LOSS_REASON ?? []).find((r) => r.id === reasonKey)?.name ?? reasonKey
}

// ---------------------------------------------------------------------------
// LADDERS — the two lists that carry a clock, and the door that changes one
// ---------------------------------------------------------------------------

/** One rung of a ladder, as the configuration screen needs it.
 *
 *  `key` is the lower-case slug the rest of `sales` still stores ('discovery',
 *  'prospect'); `id` is the configuration row the write door addresses. Both,
 *  because the screen has to count with one and write with the other. */
export type LadderRow = {
  id: string
  key: string
  label: string
  limitDays: number | null
  usage: number
}

/** The rungs of a ladder list, paired with the keys the rest of the system
 *  stores — THE ONE PLACE on the web side that pairing is made.
 *
 *  ------------------------------------------------------------------
 *  THE TWO SIDES DO NOT SHARE A KEY, SO THE JOIN IS BY POSITION
 *  ------------------------------------------------------------------
 *  Exactly the situation `exitReasonRows` above is in, and the server's
 *  `stageConfigOf` on the other end: `sales.lead` and `sales.opportunity` hold
 *  a slug, `config_entry` holds a label and an id of its own, and no column
 *  carries both. The only join that holds is
 *  ORDINAL POSITION, and it holds because `seed.ts` writes both lists straight
 *  from the fixture arrays with `ord` starting at 1.
 *
 *  Same fence as the other two, for the same reason: a count that does not
 *  match drops the server's labels and prints the key. A rung reading
 *  'prospect' is ugly and TRUE; a rung wearing one name beside another rung's
 *  deadline is pretty and lying, and it is the number somebody gets judged by.
 *
 *  Empty before the catalog lands, never `undefined` — the screen maps over it.
 *  A screen that must tell loading apart reads the query's own `isPending`. */
export function ladderRows(catalog: ConfigBundle | undefined, list: 'STAGE' | 'TIER'): LadderRow[] {
  const keys: readonly string[] = list === 'STAGE' ? StageKey.options : LeadTier.options
  /* Retired rungs stay in the bundle (disable, never delete) but hold no
     position — the server's ladder filters them the same way (ADR 0072 §7). */
  const rows: ConfigEntry[] = (catalog?.[list] ?? []).filter((r) => r.active)
  if (rows.length === 0) return []

  const aligned = rows.length === keys.length

  return rows.map((row, i) => {
    const key = aligned ? (keys[i] ?? row.id) : row.id
    return {
      id: row.id,
      key,
      label: aligned ? row.name : key,
      limitDays: row.limitDays ?? null,
      usage: catalog?.usage[list][key] ?? 0,
    }
  })
}

/** One pending edit on the configuration screen.
 *
 *  `what` is the sentence the screen shows in its pending list; the approver
 *  reads a different one, written server-side at the gate that knows the change
 *  (`config.approval.ts#consequenceOf`). Two audiences, two sentences, neither
 *  guessing at the other's. */
export type ConfigEdit = {
  list: ConfigList
  id: string
  what: string
  limitDays: number
}

/** What one edit came back as. A batch answers a row per edit rather than
 *  throwing on the first failure — see the mutation below. */
export type ConfigEditResult =
  { what: string; requestId: string } | { what: string; failure: string }

export const isEditDone = (r: ConfigEditResult): r is { what: string; requestId: string } =>
  'requestId' in r

/** Send the screen's pending edits — ONE REQUEST PER EDIT.
 *
 *  ------------------------------------------------------------------
 *  ONE SEND, N ROWS IN THE INBOX — AND THAT IS THE DECISION
 *  ------------------------------------------------------------------
 *  Settled 14/09. `ConfigChange` is one change per request all the way down:
 *  the gate writes one consequence sentence, and `applyChange` re-checks that
 *  one change against the book as it stands at approval time. A package of five
 *  would need a second `ApprovalKind`, a payload shape of its own, and an
 *  all-or-nothing apply — and it would take from the approver the move they
 *  most need, which is to refuse the one wrong box and pass the other four.
 *
 *  The screen still SENDS once, because luật 2 of this module stands: nothing
 *  on the configuration screen saves as you type. One press, N requests.
 *
 *  ------------------------------------------------------------------
 *  SEQUENTIAL, AND EVERY ANSWER KEPT
 *  ------------------------------------------------------------------
 *  In order rather than in parallel, so the inbox reads top-to-bottom the way
 *  the screen does. And a rejected edit does not abandon the rest: each one is
 *  caught and reported, because the four that went through are already rows in
 *  somebody's inbox and a screen that threw would never say so.
 *
 *  Nothing is repainted on success. The change has not happened — it happens
 *  when the director approves it, which arrives through another screen. The
 *  invalidation below re-reads the catalog exactly as the server still holds
 *  it, which is the truth this screen should be showing. */
export function useProposeConfigEdits() {
  const client = useQueryClient()

  return useMutation<ConfigEditResult[], ApiError, ConfigEdit[]>({
    mutationFn: async (edits) => {
      const out: ConfigEditResult[] = []

      for (const edit of edits) {
        try {
          const receipt = await api.write<ConfigProposalReceipt>(
            `/sales/config/${edit.list}/${edit.id}`,
            {
              method: 'PATCH',
              body: { limitDays: edit.limitDays },
              need: { branch: 'Sales', permission: 'config.propose' },
            },
          )
          out.push({ what: edit.what, requestId: receipt.requestId })
        } catch (error) {
          out.push({
            what: edit.what,
            failure: isApiError(error) ? userMessage(error) : 'Không gửi được đề nghị này.',
          })
        }
      }

      return out
    },
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ['sales', 'config', 'catalog'] })
      void client.invalidateQueries({ queryKey: ['platform', 'approvals', 'pending'] })
    },
  })
}

/** Add one entry to a catalog — used by 5.4c, the products list.
 *
 *  Separate from the batch above because it is a different verb with a
 *  different body, and because it is the only place on this screen that creates
 *  rather than amends. The products list is the one the screen's empty state
 *  tells its reader to fill in so the deal form has something to pick from —
 *  a sentence that had no box under it until 14/09. */
export function useProposeProduct() {
  const client = useQueryClient()

  return useMutation<ConfigProposalReceipt, ApiError, string>({
    mutationFn: (name) =>
      api.write<ConfigProposalReceipt>('/sales/config/PRODUCT', {
        method: 'POST',
        body: { name },
        need: { branch: 'Sales', permission: 'config.propose' },
      }),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ['sales', 'config', 'catalog'] })
      void client.invalidateQueries({ queryKey: ['platform', 'approvals', 'pending'] })
    },
  })
}

/** Add one entry to `LOSS_REASON` — used by 5.4b.
 *
 *  `stage` scopes the reason to one column of the board; absent, it applies to
 *  every stage (spec §5). Same shape as `useProposeProduct` above — a second
 *  list, a second door — because `LOSS_REASON` is the other OPEN catalog on
 *  this screen and stays that way rather than sharing a body with `PRODUCT`,
 *  which the service's `assertAttrs` would refuse anyway (`stage` belongs to
 *  `LOSS_REASON` alone). */
export function useProposeLossReason() {
  const client = useQueryClient()

  return useMutation<ConfigProposalReceipt, ApiError, { name: string; stage?: StageKey }>({
    mutationFn: (body) =>
      api.write<ConfigProposalReceipt>('/sales/config/LOSS_REASON', {
        method: 'POST',
        body,
        need: { branch: 'Sales', permission: 'config.propose' },
      }),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ['sales', 'config', 'catalog'] })
      void client.invalidateQueries({ queryKey: ['platform', 'approvals', 'pending'] })
    },
  })
}

/** Add one entry to `EXIT_REASON` — used by 5.4's `AddStopReason` row.
 *
 *  Same shape as `useProposeProduct` — a name-only `POST`, no `stage` — because
 *  the door refuses `stage` on any list but `LOSS_REASON` (`assertAttrs`). The
 *  catalogue is shared by both stop doors (ADR 0070), so one new row here
 *  reaches the park picker and the disqualify picker at once. */
export function useProposeStopReason() {
  const client = useQueryClient()

  return useMutation<ConfigProposalReceipt, ApiError, string>({
    mutationFn: (name) =>
      api.write<ConfigProposalReceipt>('/sales/config/EXIT_REASON', {
        method: 'POST',
        body: { name },
        need: { branch: 'Sales', permission: 'config.propose' },
      }),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ['sales', 'config', 'catalog'] })
      void client.invalidateQueries({ queryKey: ['platform', 'approvals', 'pending'] })
    },
  })
}

/** Each funnel column's deadline, keyed by column — READ FROM CONFIGURATION,
 *  not from the fixture.
 *
 *  Both lead screens ask this question ("is this lead past its column's
 *  deadline"), and until 14/09 each built its own `Map` out of
 *  `PIPELINE_STAGES`, a constant of the frozen scenario. The deal book next
 *  door was already reading the real deadlines, so editing a column limit and
 *  having it approved left two books of one department colouring rows by two
 *  different tables.
 *
 *  `null` = nobody has set a deadline for that column. NOT an implicit
 *  `Infinity`: the caller has to decide what to print for a column with no
 *  clock, and the true sentence there is "nothing can be said", not "on time".
 *
 *  This answers for LEADS, not for deals. A deal book row now carries
 *  `position.overdueBy` from the server (`isRottingOp`), because the server has
 *  both the ladder and the mark of when the deal entered the column. A lead row
 *  carries only `daysHere`, so the comparison still happens here — but at least
 *  the table it compares against is the real one. */
export function stageLimits(catalog: ConfigBundle | undefined): Map<string, number | null> {
  return new Map(ladderRows(catalog, 'STAGE').map((r) => [r.key, r.limitDays]))
}

/** `stageLimits` as a hook, so two screens share one cached read. Empty until
 *  the catalog lands, which reads as "no limit configured" for one round trip —
 *  the honest direction to be wrong in: a lead is not accused of being late
 *  before the rule it is judged by has arrived. */
export function useStageLimits(): Map<string, number | null> {
  const { data } = useQuery(salesCatalogQuery)
  return stageLimits(data)
}

/** The catalog changed only once approved; until then the inbox did. */
function proposalSent(client: ReturnType<typeof useQueryClient>) {
  void client.invalidateQueries({ queryKey: ['sales', 'config', 'catalog'] })
  void client.invalidateQueries({ queryKey: ['platform', 'approvals', 'pending'] })
}

/** Add one row to a comm close-out list. `criterionId` rides only with an
 *  answer — the service judges that relation, like `stage` on `LOSS_REASON`. */
export function useProposeCommEntry() {
  const client = useQueryClient()

  return useMutation<
    ConfigProposalReceipt,
    ApiError,
    { list: ConfigList; name: string; criterionId?: string }
  >({
    mutationFn: ({ list, ...body }) =>
      api.write<ConfigProposalReceipt>(`/sales/config/${list}`, {
        method: 'POST',
        body,
        need: { branch: 'Sales', permission: 'config.propose' },
      }),
    onSuccess: () => proposalSent(client),
  })
}

/** Rename one entry or switch it on/off — the only "delete" a config row has. */
export function useProposeConfigPatch() {
  const client = useQueryClient()

  return useMutation<
    ConfigProposalReceipt,
    ApiError,
    { list: ConfigList; id: string; patch: ConfigEntryPatch }
  >({
    mutationFn: ({ list, id, patch }) =>
      api.write<ConfigProposalReceipt>(`/sales/config/${list}/${id}`, {
        method: 'PATCH',
        body: patch,
        need: { branch: 'Sales', permission: 'config.propose' },
      }),
    onSuccess: () => proposalSent(client),
  })
}

/** The book's last-activity thresholds (ADR 0077 §4) — the two numbers the
 *  server judges every row's `activityFreshness` against. */
export const activityFreshnessQuery = queryOptions({
  queryKey: ['sales', 'config', 'activity-freshness'] as const,
  queryFn: ({ signal }) =>
    api.read<ActivityFreshnessResponse>('/sales/config/activity-freshness', {
      need: { branch: 'Sales', permission: 'config.view' },
      schema: ActivityFreshnessResponse,
      signal,
    }),
})

/** Proposes the PAIR, so `alertDays > warnDays` is judged on one body. */
export function useProposeActivityFreshness() {
  const client = useQueryClient()

  return useMutation<ConfigProposalReceipt, ApiError, ActivityFreshnessPatch>({
    mutationFn: (body) =>
      api.write<ConfigProposalReceipt>('/sales/config/activity-freshness', {
        method: 'PATCH',
        body,
        need: { branch: 'Sales', permission: 'config.propose' },
      }),
    onSuccess: () => proposalSent(client),
  })
}
