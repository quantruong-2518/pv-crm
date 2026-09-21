import { Injectable } from '@nestjs/common'
import type { Actor } from '@pv/engines'
import {
  ConfigBundle,
  ConfigListResponse,
  ConfigProposalReceipt,
  isLadder,
  MotionPolicyResponse,
  LeadMotionOptionResponse,
  type LeadMotion,
  type MotionPolicyPatch,
  type ConfigEntryCreate,
  type ConfigEntryPatch,
  type ConfigList,
  type ConfigOrderPatch,
} from '@pv/contracts'
import { conflict, invalid, notFound } from '@api/platform/http/problem'
import type { ApprovalApplier } from '@api/platform/approval/approval.service'
import type { ApprovalRowDb } from '@api/platform/approval/approval.schema'
import type { Db } from '@api/platform/db/db.module'
import { SalesConfigGate, type ConfigChange } from './config.approval'
import { toBundle, toContract, toUsage } from './config.mapper'
import { SalesConfigRepository } from './config.repository'
import type { ConfigRowDb } from './config.schema'

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
  constructor(
    private readonly repo: SalesConfigRepository,
    private readonly gate: SalesConfigGate,
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
      },
    }
    this.assertAttrs(list, body)
    const rows = await this.repo.list(list)
    this.assertShapeKept(change, rows)
    await this.assertOwnerReal(body.ownerId)
    this.assertNameFree(rows, body.name)

    return this.propose(who, change)
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

    const change: ConfigChange = { kind: 'update', list, id, patch: body }
    this.assertShapeKept(change, rows)
    if (body.ownerId) await this.assertOwnerReal(body.ownerId)
    if (body.name !== undefined) this.assertNameFree(rows, body.name, id)

    return this.propose(who, change)
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
    const change: ConfigChange = { kind: 'reorder', list, ids: body.ids }
    const rows = await this.repo.list(list)
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

  // ── CHỖ NỐI E3 · một điểm cho mọi đường ghi ───────────────────────────────

  /** Mọi thay đổi đi qua ĐÚNG hàm này. Không có đường vòng.
   *
   *  Hôm nay `gate.propose` ném lỗi vì E3 chưa có nơi lưu — xem
   *  `config.approval.ts`, chỗ đó ghi rõ ba việc phải làm để mở. Nhánh
   *  `approved` bên dưới là đường sẽ chạy ngày E3 gật ngay (chuỗi duyệt rỗng,
   *  hoặc người đề nghị cũng là người gật); nhánh `waiting` KHÔNG ghi gì cả, và
   *  đó là toàn bộ điểm của việc tách hai bước. */
  private async propose(who: Actor, change: ConfigChange): Promise<ConfigProposalReceipt> {
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
    await this.applyChange(tx, request.payload as ConfigChange)
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
  private async applyChange(tx: Db, change: ConfigChange): Promise<void> {
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
    /* Proposals raised before the lock may still be waiting. */
    this.assertShapeKept(change, rows)

    if (change.kind === 'create') {
      this.assertNameFree(rows, change.draft.name)
      await this.repo.create(tx, change.list, change.draft)
      return
    }

    if (change.kind === 'update') {
      if (change.patch.name !== undefined) {
        this.assertNameFree(rows, change.patch.name, change.id)
      }
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
    v: { limitDays?: number; ownerId?: string | null; kind?: string },
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
      (change.patch.active !== undefined &&
        rows.find((r) => r.id === change.id)?.active !== change.patch.active)
    if (!reshapes) return
    throw conflict(
      `Danh mục ${change.list} có cấu trúc cố định — chỉ đổi được tên và số ngày giới hạn của từng chặng, không thêm, tắt hay xếp lại chặng.`,
    )
  }

  /** Tên không trùng trong phần ĐANG SỐNG của danh mục.
   *
   *  `config_name_live` ở tầng bảng mới là hàng rào thật (nó không phân biệt
   *  hoa thường và không cửa vào nào quên được). Câu hỏi ở đây chỉ để trả lời
   *  sớm và trả lời tử tế — nói ra mã của dòng đang chiếm tên, thứ mà một lỗi
   *  `23505` từ driver không nói được. */
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
      'Thứ tự mới phải liệt kê đúng và đủ các mục của danh mục.',
    )
  }

  private assertNameFree(rows: ConfigRowDb[], name: string, exceptId?: string): void {
    const key = name.toLowerCase()
    const clash = rows.find((r) => r.active && r.id !== exceptId && r.name.toLowerCase() === key)
    if (clash) throw conflict(`Danh mục này đã có mục tên "${clash.name}" (${clash.id}).`)
  }

  /** Người phụ trách phải có trong sổ nhân sự. */
  private async assertOwnerReal(ownerId: string | null | undefined): Promise<void> {
    if (!ownerId) return
    if (await this.repo.actorExists(ownerId)) return
    throw invalid({ ownerId: [`Không có người nào mang mã "${ownerId}".`] })
  }
}
