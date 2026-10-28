import { Injectable, Logger } from '@nestjs/common'
import type { Actor } from '@pv/engines'
import {
  ActivityFreshnessResponse,
  RecareCyclesResponse,
  CommVocabularyResponse,
  ConfigBundle,
  ConfigListResponse,
  ConfigProposalChange,
  ConfigProposalReceipt,
  ConfigProposalsResponse,
  isLadder,
  MotionPolicyResponse,
  LeadMotionOptionResponse,
  LeadIndustryOptionsResponse,
  LeadLabelOptionsResponse,
  LeadStopReasonResponse,
  type ActivityFreshnessPatch,
  type RecareCyclesPatch,
  type LeadMotion,
  type MotionPolicyPatch,
  type ConfigEntryCreate,
  type ConfigEntryMerge,
  type ConfigEntryPatch,
  type ConfigList,
  type ConfigOrderPatch,
  type StageKey,
} from '@pv/contracts'
import { conflict, invalid, notFound } from '@api/platform/http/problem'
import { ApprovalService, type ApprovalApplier } from '@api/platform/approval/approval.service'
import type { ApprovalRowDb } from '@api/platform/approval/approval.schema'
import type { Db } from '@api/platform/db/db.module'
import { SettingService } from '@api/platform/setting/setting.service'
import { applyKpiConfig, isKpiConfigChange } from '../kpi/kpi-config.approval'
import { activityFreshnessOf } from './activity-freshness'
import { recareCyclesOf } from './recare-cycles'
import { SalesConfigGate, type ConfigChange } from './config.approval'
import { toBundle, toContract, toUsage } from './config.mapper'
import { SalesConfigRepository, type ConfigPatchDb } from './config.repository'
import type { ConfigRowDb } from './config.schema'
import { isFrameChange } from './step-frame.approval'
import { StepFrameService } from './step-frame.service'

/** Cấu hình danh mục Sales — nơi DUY NHẤT biết cả repository lẫn engine.
 *
 *  Ở module lead, engine mà service biết là E2. Ở đây là **E3**, và nó được
 *  biết qua đúng một cửa: `SalesConfigGate`. Ranh giới vẫn y hệt và vẫn là thứ
 *  chịu lực của cả `apps/api` — repository `async` và không quyết định gì;
 *  engine đồng bộ, nhận dữ liệu đã nạp, trả một quyết định; service nối hai
 *  thứ đó.
 *
 *  ------------------------------------------------------------------
 *  ĐỌC THÌ TRẢ, GHI THÌ ĐỀ NGHỊ
 *  ------------------------------------------------------------------
 *  Mọi hàm ghi dưới đây kiểm xong xuôi — hình dữ liệu, thuộc tính có đúng danh
 *  mục không, tên có trùng không, người phụ trách có thật không — rồi KHÔNG
 *  ghi. Chúng dựng một `ConfigChange` và đưa cho cửa duyệt. Lý do nằm ở ma trận
 *  quyền: E2 chỉ cấp `config.propose`, không có `config.edit`.
 *
 *  Kiểm trước rồi mới đề nghị chứ không đề nghị rồi kiểm lúc gật: người gõ sai
 *  phải biết mình gõ sai ngay lúc gõ, không phải ba ngày sau khi trưởng phòng
 *  bấm nút và nhận một lỗi không phải của họ. */
@Injectable()
export class SalesConfigService implements ApprovalApplier {
  private readonly log = new Logger('sales.config')
  /** Requests whose payload failed to parse, so each is logged once per boot. */
  private readonly unreadable = new Set<string>()

  constructor(
    private readonly repo: SalesConfigRepository,
    private readonly gate: SalesConfigGate,
    private readonly settings: SettingService,
    private readonly frame: StepFrameService,
    private readonly approvals: ApprovalService,
  ) {}

  /** Cả sáu danh mục. Một lần gọi, một câu truy vấn. */
  async bundle(): Promise<ConfigBundle> {
    /* Kiểm chính dữ liệu MÌNH trả ra bằng hợp đồng — cùng lý do với
       `LeadBookResponse.parse`: một cột đổi kiểu hoặc một trường quên map đều
       lọt qua `tsc` nếu mapper sai theo, nhưng không lọt qua đây. Giá phải trả
       bị chặn trên bởi kích thước của chính sáu danh mục, vài chục dòng. */
    /* The two queries run side by side, not in sequence: neither depends on the
       other, and the config screen waits on both before it can draw a row. */
    const [rows, tallies] = await Promise.all([this.repo.all(), this.repo.usage()])
    return ConfigBundle.parse(toBundle(rows, toUsage(tallies)))
  }

  async list(list: ConfigList): Promise<ConfigListResponse> {
    const rows = await this.repo.list(list)
    return ConfigListResponse.parse({ list, rows: rows.map(toContract) })
  }

  async create(
    who: Actor,
    list: ConfigList,
    body: ConfigEntryCreate,
  ): Promise<ConfigProposalReceipt> {
    const change: ConfigChange = {
      kind: 'create',
      list,
      draft: {
        name: body.name,
        ...(body.limitDays === undefined ? {} : { limitDays: body.limitDays }),
        ...(body.ownerId === undefined ? {} : { ownerId: body.ownerId }),
        ...(body.kind === undefined ? {} : { kind: body.kind }),
        ...(body.stage === undefined ? {} : { stage: body.stage }),
        ...(body.doNotContact === undefined ? {} : { doNotContact: body.doNotContact }),
        ...(body.criterionId === undefined ? {} : { criterionId: body.criterionId }),
        ...(body.parentId === undefined ? {} : { parentId: body.parentId }),
      },
    }
    this.assertAttrs(list, body)
    if (list === 'COMM_ANSWER' && body.criterionId === undefined) {
      throw invalid({ criterionId: ['Chọn câu hỏi cho câu trả lời.'] })
    }
    const rows = await this.repo.list(list)
    this.assertShapeKept(change, rows)
    await this.assertOwnerReal(body.ownerId)
    await this.assertCriterionReal(body.criterionId)
    const parentName = await this.parentNameOf(body.parentId)
    this.assertNameFree(rows, body.name, undefined, body.criterionId ?? body.parentId)

    return this.propose(who, { ...change, ...(parentName && { parentName }) })
  }

  async patch(
    who: Actor,
    list: ConfigList,
    id: string,
    body: ConfigEntryPatch,
  ): Promise<ConfigProposalReceipt> {
    this.assertAttrs(list, body)

    const rows = await this.repo.list(list)

    if (!rows.some((r) => r.id === id)) throw notFound(`mục của danh mục ${list}`, id)

    const was = rows.find((r) => r.id === id)?.name
    const parentName = await this.parentNameOf(body.parentId ?? undefined)
    const change: ConfigChange = {
      kind: 'update',
      list,
      id,
      patch: body,
      ...(was && { was }),
      ...(parentName && { parentName }),
    }
    this.assertShapeKept(change, rows)
    if (body.ownerId) await this.assertOwnerReal(body.ownerId)
    await this.assertCriterionReal(body.criterionId)
    this.assertPatchNameFree(rows, id, body)
    await this.assertCategoryEmptied(list, id, body)
    await this.assertParentOn(list, rows, id, body)

    return this.propose(who, change)
  }

  /** `POST /sales/config/INDUSTRY/merge` — two live industries, or nothing to fold.
   *  No name check: the source is switched off, so it frees its name. */
  async merge(who: Actor, body: ConfigEntryMerge): Promise<ConfigProposalReceipt> {
    const rows = await this.repo.list('INDUSTRY')
    const names = this.assertMergeable(rows, body.sourceId, body.targetId)
    return this.propose(who, { kind: 'merge', list: 'INDUSTRY', ...body, names })
  }

  /** Đổi thứ tự cả danh mục.
   *
   *  Đòi danh sách ĐẦY ĐỦ và ĐÚNG bằng những gì đang có. Một danh sách thiếu
   *  dòng sẽ để lại dòng đó mang `ord` cũ, tức chèn nó vào một chỗ ngẫu nhiên
   *  giữa các số mới — và `ord` ở đây là thứ chở nghĩa nghiệp vụ ("bậc nào",
   *  "cột thứ mấy"), nên một thứ tự sai không phải chuyện hiển thị. */
  async reorder(
    who: Actor,
    list: ConfigList,
    body: ConfigOrderPatch,
  ): Promise<ConfigProposalReceipt> {
    const rows = await this.repo.list(list)
    const names = body.ids.flatMap((id) => rows.find((r) => r.id === id)?.name ?? [])
    const change: ConfigChange = {
      kind: 'reorder',
      list,
      ids: body.ids,
      ...(names.length === body.ids.length && { names }),
    }
    this.assertShapeKept(change, rows)
    this.assertOrderCovers(
      rows.map((r) => r.id),
      body.ids,
    )

    return this.propose(who, change)
  }

  // ── the six motions · read, and propose ──────────────────────────────────

  /** What every motion declares today — including the ones that declare
   *  nothing, which is most of them and is the honest answer. */
  async motions(): Promise<MotionPolicyResponse> {
    return MotionPolicyResponse.parse({ rows: await this.repo.motions() })
  }

  /** The typist's slice of the same rows; `parse` drops the policy columns. */
  async motionOptions(): Promise<LeadMotionOptionResponse> {
    return LeadMotionOptionResponse.parse({ rows: await this.repo.motions() })
  }

  /** The stop-reason catalogue for lead readers without `config.view` (ADR 0070).
   *  Inactive rows included, so an old stop still prints its label. */
  async stopReasons() {
    return LeadStopReasonResponse.parse({ rows: await this.repo.list('EXIT_REASON') })
  }

  /** The `WAITING_LABEL` catalogue in desk order, retired rows flagged: a chip
   *  on a lead may still name one, and the picker offers the active ones only. */
  async leadLabels(): Promise<LeadLabelOptionsResponse> {
    const rows = await this.repo.list('WAITING_LABEL')
    return LeadLabelOptionsResponse.parse({
      rows: rows.map(({ id, name, active }) => ({ id, name, active })),
    })
  }

  /** Categories and industries for whoever types a lead, retired rows flagged:
   *  a lead may still carry one, and the pickers offer the active ones only. */
  async leadIndustries(): Promise<LeadIndustryOptionsResponse> {
    const [categories, industries] = await Promise.all([
      this.repo.list('CATEGORY'),
      this.repo.list('INDUSTRY'),
    ])
    return LeadIndustryOptionsResponse.parse({
      categories: categories.map(({ id, name, ownerId, active }) => ({
        id,
        name,
        ownerId,
        active,
      })),
      industries: industries.map(({ id, name, parentId, active }) => ({
        id,
        name,
        categoryId: parentId,
        active,
      })),
    })
  }

  /** The close-out vocabulary (ADR 0074) — and the rule of which questions a
   *  close-out must answer, so the form and `NextStepDebriefHook` cannot drift. */
  async commVocabulary(): Promise<CommVocabularyResponse> {
    const [criteria, answers, kinds] = await Promise.all([
      this.repo.list('COMM_CRITERION'),
      this.repo.list('COMM_ANSWER'),
      this.repo.list('STEP_KIND'),
    ])
    const option = ({ id, name }: ConfigRowDb) => ({ id, name })
    return CommVocabularyResponse.parse({
      criteria: criteria
        .filter((c) => c.active)
        .map((c) => ({
          ...option(c),
          answers: answers.filter((a) => a.active && a.criterionId === c.id).map(option),
        }))
        .filter((c) => c.answers.length > 0),
      stepKinds: kinds.filter((k) => k.active).map(option),
    })
  }

  /** Change one motion's declaration. Like every other write on this module it
   *  does not write: it proposes, and the One inbox decides.
   *
   *  Nothing is validated here beyond what the contract already refused. The
   *  other three doors check names against the book because a name can clash
   *  with a neighbour; a motion has no neighbours to clash with, and its two
   *  real fences — a sane deadline and a role that exists — are CHECKs on the
   *  table. Repeating them here would be a second wording of one rule. */
  proposeMotion(
    who: Actor,
    motion: LeadMotion,
    body: MotionPolicyPatch,
  ): Promise<ConfigProposalReceipt> {
    return this.propose(who, { kind: 'motion', motion, patch: body })
  }

  /** `GET /sales/config/activity-freshness` — the book's staleness pair. */
  async activityFreshness(): Promise<ActivityFreshnessResponse> {
    return ActivityFreshnessResponse.parse(await activityFreshnessOf(this.settings))
  }

  /** Propose the pair. The contract already held each bound and
   *  `alertDays > warnDays`; nothing here is checked against other rows. */
  proposeActivityFreshness(
    who: Actor,
    body: ActivityFreshnessPatch,
  ): Promise<ConfigProposalReceipt> {
    return this.propose(who, { kind: 'activity-freshness', value: body })
  }

  /** `GET /sales/config/recare-cycles` — the bought-customer cycles (ADR 0121 §4). */
  async recareCycles(): Promise<RecareCyclesResponse> {
    return RecareCyclesResponse.parse(await recareCyclesOf(this.settings))
  }

  /** Propose the trio. The contract held each bound; there is no order to keep. */
  proposeRecareCycles(who: Actor, body: RecareCyclesPatch): Promise<ConfigProposalReceipt> {
    return this.propose(who, { kind: 'recare-cycles', value: body })
  }

  /** `GET /sales/config/proposals/mine` — the reader's own waiting changes,
   *  so the screen can mark the rows they touch. A payload that no longer
   *  parses is skipped rather than failing the read: one old row must not hide
   *  every other note. */
  async myProposals(who: Actor): Promise<ConfigProposalsResponse> {
    const rows = await this.approvals.waitingRaisedBy(who, 'config-change')
    const proposals = rows.flatMap((row) => {
      const change = ConfigProposalChange.safeParse(row.payload)
      if (change.success) {
        return [
          {
            approvalId: row.id,
            createdAt: row.raisedAt.toISOString(),
            consequence: row.consequence,
            change: change.data,
          },
        ]
      }
      if (!this.unreadable.has(row.id)) {
        this.unreadable.add(row.id)
        this.log.warn(`proposal ${row.id}: payload does not parse, skipped`)
      }
      return []
    })
    return ConfigProposalsResponse.parse({ rows: proposals })
  }

  // ── CHỖ NỐI E3 · một điểm cho mọi đường ghi ───────────────────────────────

  /** Mọi thay đổi đi qua ĐÚNG hàm này. Không có đường vòng.
   *
   *  Hôm nay `gate.propose` ném lỗi vì E3 chưa có nơi lưu — xem
   *  `config.approval.ts`, chỗ đó ghi rõ ba việc phải làm để mở. Nhánh
   *  `approved` bên dưới là đường sẽ chạy ngày E3 gật ngay (chuỗi duyệt rỗng,
   *  hoặc người đề nghị cũng là người gật); nhánh `waiting` KHÔNG ghi gì cả, và
   *  đó là toàn bộ điểm của việc tách hai bước. */
  async propose(who: Actor, change: ConfigChange): Promise<ConfigProposalReceipt> {
    /* Nothing is applied here any more, not even when the proposer could
       approve it themselves a second later. Applying belongs to
       `ApprovalService.decide`, which is the only place that can settle the
       request and write the change in ONE transaction — see `apply` below. */
    const receipt = await this.gate.propose(who, change)

    /* The receipt is NARROWED here rather than in the controller: `change` is
       this branch's private description of the work, and a controller that
       forwards it whole makes a draft's internal shape part of the wire. */
    return ConfigProposalReceipt.parse({ requestId: receipt.requestId, state: receipt.state })
  }

  // ── the applier · what "approved" means for this branch ──────────────────

  /** `ApprovalApplier` — called by `platform` once a `config-change` request
   *  has been approved, with the transaction that settled it.
   *
   *  Riding that transaction is the whole design: a request that reads
   *  `approved` while the vocabulary never changed is a failure with nothing
   *  red anywhere. Either both land or neither does.
   *
   *  The payload comes back out as the `ConfigChange` this branch put in.
   *  `platform.approval` stored it without reading it — it has no business
   *  knowing what a config list is — so the cast here is the branch reading its
   *  own handwriting, not a type assertion about somebody else's data. */
  async apply(tx: Db, request: ApprovalRowDb): Promise<void> {
    await this.applyChange(tx, request.payload as ConfigChange, request.raisedById)
  }

  /** The write itself. Nobody calls this directly.
   *
   *  ------------------------------------------------------------------
   *  EVERYTHING IS CHECKED AGAIN, AGAINST THE LIST AS IT IS NOW
   *  ------------------------------------------------------------------
   *  The checks at propose time ran against the book as it stood THEN, and the
   *  request may have waited days. Two proposals can be perfectly valid apart
   *  and impossible together — one renames an existing row to some name, the
   *  other adds a new row with that same name — because neither was applied when
   *  the other was checked. Approving both would then break `config_name_live`
   *  deep inside this transaction, and
   *  what the approver would read is whatever the constraint translator makes
   *  of it.
   *
   *  So the same assertions run again here, on rows read through `tx`. When one
   *  fails the transaction rolls back — including the settling UPDATE — so the
   *  request stays WAITING rather than becoming an approval whose change never
   *  happened. The approver is told why, and somebody can re-propose against
   *  the book as it now stands.
   *
   *  The sentences are the propose-time sentences, deliberately: one wording
   *  per rule. "This name is taken" is the same fact whether it is read while
   *  typing or while approving. */
  private async applyChange(tx: Db, change: ConfigChange, proposerId: string): Promise<void> {
    /* The journey frame re-judges and writes its own four kinds (ADR 0080). */
    if (isFrameChange(change)) return this.frame.apply(tx, change)
    /* The KPI overlay and alert pair (ADR 0099 §2) re-judge and write their own. */
    if (isKpiConfigChange(change)) return applyKpiConfig(tx, change, proposerId, this.settings)
    if (change.kind === 'activity-freshness') {
      /* Both keys land in the approval's tx, so the pair never half-applies. */
      await this.settings.setIn(tx, proposerId, [
        { key: 'sales.activity.warn-days', value: change.value.warnDays },
        { key: 'sales.activity.alert-days', value: change.value.alertDays },
      ])
      return
    }
    if (change.kind === 'recare-cycles') {
      await this.settings.setIn(tx, proposerId, [
        { key: 'sales.after-sale.hot-days', value: change.value.hotDays },
        { key: 'sales.after-sale.warm-days', value: change.value.warmDays },
        { key: 'sales.after-sale.cold-days', value: change.value.coldDays },
      ])
      return
    }
    if (change.kind === 'motion') {
      /* Nothing to re-check across rows: a motion has no name to collide with
         and no order to keep whole. What could still be wrong — a nonsense
         deadline, a role that is not a role — is refused by the table's own
         CHECKs, which hold for every door rather than only the checked ones. */
      const written = await this.repo.patchMotion(tx, change.motion, change.patch)
      if (!written) throw notFound('luồng', change.motion)
      return
    }

    const rows = await this.repo.list(change.list, tx)
    if (change.kind === 'merge') {
      this.assertMergeable(rows, change.sourceId, change.targetId)
      return this.repo.mergeIndustry(tx, change.sourceId, change.targetId)
    }
    /* Proposals raised before the lock may still be waiting. */
    this.assertShapeKept(change, rows)

    if (change.kind === 'create') {
      const { criterionId, parentId } = change.draft
      await this.parentNameOf(parentId, tx)
      this.assertNameFree(rows, change.draft.name, undefined, criterionId ?? parentId)
      await this.repo.create(tx, change.list, change.draft)
      return
    }

    if (change.kind === 'update') {
      await this.parentNameOf(change.patch.parentId ?? undefined, tx)
      this.assertPatchNameFree(rows, change.id, change.patch)
      await this.assertCategoryEmptied(change.list, change.id, change.patch, tx)
      await this.assertParentOn(change.list, rows, change.id, change.patch, tx)
      /* `patch` answers `null` when `(list, id)` no longer resolves — the row
         was removed while the request waited. Dropping that answer would record
         an approval for a write that touched nothing. */
      const written = await this.repo.patch(tx, change.list, change.id, change.patch)
      if (!written) throw notFound('mục cấu hình', change.id)
      return
    }

    /* A reorder names every id in the list. One added or removed while the
       request waited makes the list it carries wrong — and a wrong `ord` is not
       a display bug here: it is which rung, which column. */
    this.assertOrderCovers(
      rows.map((r) => r.id),
      change.ids,
    )
    await this.repo.reorder(tx, change.list, change.ids)
  }

  // ── kiểm · ba câu hỏi mà zod của thân yêu cầu không trả lời được ──────────

  /** Thuộc tính riêng phải đúng danh mục của nó.
   *
   *  zod kiểm được HÌNH của thân yêu cầu, nhưng `list` nằm ở ĐƯỜNG DẪN — nên
   *  quan hệ "chỉ `STAGE` mới có `limitDays`" không nằm trong tầm nhìn của nó.
   *  Ở đây là chỗ duy nhất thấy đủ cả hai. `CHECK config_limit_only_ladder` ở
   *  tầng bảng là lưới thứ hai; nó bắt được chuyện tương tự nhưng chỉ nói được
   *  bằng tiếng của Postgres. */
  private assertAttrs(
    list: ConfigList,
    v: {
      limitDays?: number
      ownerId?: string | null
      kind?: string
      stage?: StageKey | null
      doNotContact?: boolean
      criterionId?: string
      parentId?: string | null
    },
  ): void {
    const wrong: Record<string, string[]> = {}
    const only = (field: string, owner: ConfigList, given: boolean): void => {
      if (given && list !== owner) wrong[field] = [`Chỉ danh mục ${owner} mới có ô này.`]
    }

    /* `limitDays` is the one attribute whose owner is a SET rather than a single
       list — every ladder has a clock per phase. The other two still belong to
       exactly one list each, so they keep the single-owner form. */
    if (v.limitDays !== undefined && !isLadder(list)) {
      wrong.limitDays = ['Chỉ danh mục có thang chặng mới có ô này.']
    }
    only('ownerId', 'CATEGORY', v.ownerId !== undefined)
    only('kind', 'SOURCE', v.kind !== undefined)
    only('stage', 'LOSS_REASON', v.stage !== undefined)
    only('doNotContact', 'LOSS_REASON', v.doNotContact !== undefined)
    only('criterionId', 'COMM_ANSWER', v.criterionId !== undefined)
    only('parentId', 'INDUSTRY', v.parentId !== undefined)

    /* A new rung of a ladder used to be REQUIRED to arrive with a deadline.
       It no longer is, for the reason written where the CHECK lives: since
       `0038` a clock is a ladder's privilege, not its duty, because `TIER`'s
       numbers are the thing §8.5 says nobody has decided. Demanding one here
       would put the invented number back in through the door instead of the
       table. Missing means missing, and the screen says so. */

    if (Object.keys(wrong).length > 0) throw invalid(wrong)
  }

  /** `STAGE` and `TIER` rungs pair with code keys BY POSITION (`ladder.ts`), so
   *  adding, switching off or reordering one silently shifts every limit. Their
   *  shape is code, not config (ADR 0057 §3): rename and `limitDays` only. */
  private assertShapeKept(
    change: Extract<ConfigChange, { list: ConfigList }>,
    rows: ConfigRowDb[],
  ): void {
    if (!isLadder(change.list)) return
    const reshapes =
      change.kind === 'create' ||
      change.kind === 'reorder' ||
      change.kind === 'merge' ||
      (change.patch.active !== undefined &&
        rows.find((r) => r.id === change.id)?.active !== change.patch.active)
    if (!reshapes) return
    throw conflict(`Danh mục ${change.list} chỉ đổi được tên và số ngày giới hạn của từng chặng.`)
  }

  /** The new order must name every id of the list and nothing else.
   *
   *  Shared by the propose door and the apply step rather than written twice:
   *  the two run against different snapshots of the same book, and two copies
   *  of one rule are two chances for the later one to be the stale one. */
  private assertOrderCovers(have: string[], given: string[]): void {
    const missing = have.filter((id) => !given.includes(id))
    const strange = given.filter((id) => !have.includes(id))
    if (missing.length === 0 && strange.length === 0) return

    throw invalid(
      {
        ids: [
          ...(missing.length > 0 ? [`Thiếu: ${missing.join(', ')}`] : []),
          ...(strange.length > 0 ? [`Không thuộc danh mục này: ${strange.join(', ')}`] : []),
        ],
      },
      'Thứ tự mới phải có đủ các mục của danh mục.',
    )
  }

  /** `scope` mirrors `config_name_live`'s `coalesce(criterion_id, parent_id)`:
   *  an answer's name is unique within its question, an industry's within its
   *  category; every other row has neither, so its whole list counts. */
  private assertNameFree(
    rows: ConfigRowDb[],
    name: string,
    exceptId?: string,
    scope: string | null = null,
  ): void {
    const key = name.toLowerCase()
    const clash = rows.find(
      (r) =>
        r.active &&
        r.id !== exceptId &&
        (r.criterionId ?? r.parentId) === scope &&
        r.name.toLowerCase() === key,
    )
    if (clash) throw conflict(`Danh mục này đã có mục tên "${clash.name}" (${clash.id}).`)
  }

  /** Moving an answer to another question can clash as much as a rename can.
   *  Reviving a retired row re-enters `config_name_live` under its old name,
   *  so `active: true` on an inactive row is checked like a rename. */
  private assertPatchNameFree(
    rows: ConfigRowDb[],
    id: string,
    patch: Pick<ConfigPatchDb, 'name' | 'criterionId' | 'parentId' | 'active'>,
  ): void {
    const row = rows.find((r) => r.id === id)
    if (!row) return
    const revives = patch.active === true && !row.active
    const moves = patch.criterionId !== undefined || patch.parentId !== undefined
    if (patch.name === undefined && !moves && !revives) return
    const parentId = patch.parentId === undefined ? row.parentId : patch.parentId
    this.assertNameFree(
      rows,
      patch.name ?? row.name,
      id,
      patch.criterionId ?? row.criterionId ?? parentId,
    )
  }

  /** Both live INDUSTRY rows, distinct; answers their names for the sentence. */
  private assertMergeable(
    rows: ConfigRowDb[],
    sourceId: string,
    targetId: string,
  ): [string, string] {
    const live = (id: string) => rows.find((r) => r.id === id && r.active)
    const [source, target] = [live(sourceId), live(targetId)]
    if (!source) throw invalid({ sourceId: [`Không tìm thấy ngành đang dùng "${sourceId}".`] })
    if (!target) throw invalid({ targetId: [`Không tìm thấy ngành đang dùng "${targetId}".`] })
    /* Owner's rule: only a stray spelling, or a twin in the same category, folds in. */
    if (source.parentId !== null && source.parentId !== target.parentId) {
      throw conflict('Chỉ gộp được ngành chưa xếp nhóm hoặc cùng nhóm ngành.')
    }
    return [source.name, target.name]
  }

  /** A category is switched off only once none of its industries is on: a live
   *  industry under a dead category could still be picked, and nowhere shown. */
  private async assertCategoryEmptied(
    list: ConfigList,
    id: string,
    patch: Pick<ConfigPatchDb, 'active'>,
    db?: Db,
  ): Promise<void> {
    if (list !== 'CATEGORY' || patch.active !== false) return
    const industries = await this.repo.list('INDUSTRY', db)
    if (!industries.some((i) => i.active && i.parentId === id)) return
    throw conflict('Còn ngành đang dùng trong nhóm này. Chuyển hoặc tắt các ngành đó trước.')
  }

  /** Switching an industry back on under a category that is off would make a
   *  pick nobody can see; a NEW parent in the same patch is `parentNameOf`'s. */
  private async assertParentOn(
    list: ConfigList,
    rows: ConfigRowDb[],
    id: string,
    patch: Pick<ConfigPatchDb, 'active' | 'parentId'>,
    db?: Db,
  ): Promise<void> {
    if (list !== 'INDUSTRY' || patch.active !== true || patch.parentId !== undefined) return
    const parentId = rows.find((r) => r.id === id)?.parentId
    if (!parentId || (await this.repo.byId('CATEGORY', parentId, db))?.active) return
    throw conflict('Nhóm ngành của ngành này đang tắt. Bật nhóm ngành trước.')
  }

  /** An industry hangs only on a live CATEGORY: the FK knows the row exists, not
   *  that it is still on. Re-asked at approval through `tx`; answers its name. */
  private async parentNameOf(id: string | undefined, db?: Db): Promise<string | undefined> {
    if (id === undefined) return undefined
    const row = await this.repo.byId('CATEGORY', id, db)
    if (row?.active) return row.name
    throw invalid({ parentId: [`Không tìm thấy nhóm ngành đang dùng "${id}".`] })
  }

  /** The self-FK refuses too, but only at approval; the typist hears it now.
   *  Any `COMM_CRITERION` row, off ones included — config rows are never deleted. */
  private async assertCriterionReal(id: string | undefined): Promise<void> {
    if (id === undefined || (await this.repo.byId('COMM_CRITERION', id))) return
    throw invalid({ criterionId: [`Không tìm thấy câu hỏi "${id}".`] })
  }

  /** Người phụ trách phải có trong sổ nhân sự. */
  private async assertOwnerReal(ownerId: string | null | undefined): Promise<void> {
    if (!ownerId) return
    if (await this.repo.actorExists(ownerId)) return
    throw invalid({ ownerId: [`Không tìm thấy người "${ownerId}".`] })
  }
}
