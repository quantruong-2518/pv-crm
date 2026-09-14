import { Injectable, Logger } from '@nestjs/common'
import type { Actor, ApprovalState, RoleId } from '@pv/engines'
import type { ConfigList } from '@pv/contracts'
import { ApprovalService } from '@api/platform/approval/approval.service'
import type { ConfigDraft, ConfigPatchDb } from './config.repository'

/** THE E3 SEAM — one point for all three write doors, and it is now WIRED.
 *
 *  ------------------------------------------------------------------
 *  WHY EVERY WRITE GOES THROUGH HERE
 *  ------------------------------------------------------------------
 *  E2's permission matrix has no `config.edit`. It has `config.view` and
 *  `config.propose`, and that is an answer rather than an omission: changing
 *  the department's working vocabulary is something somebody has to say yes to,
 *  not something one person finishes by pressing save. Dropping an exit reason
 *  that 21 leads are standing on takes those 21 rows' ground away.
 *
 *  So `POST`/`PATCH` on this module do NOT write to the table. They build a
 *  `ConfigChange` — a complete, already-validated description of the work — and
 *  hand it to this gate, which turns it into a request in the One inbox. The
 *  change lands only when somebody approves it, and it lands inside the very
 *  transaction that records the approval (`ApprovalService.decide`).
 *
 *  ------------------------------------------------------------------
 *  WHO SAYS YES: THE DIRECTOR, ONE LINK
 *  ------------------------------------------------------------------
 *  The matrix names who may PROPOSE — director and head of sales — and says
 *  nothing about who approves, because approval chains are policy rather than
 *  code. The policy, settled 14/09: one link, the director.
 *
 *  It follows that a director's own proposal waits for the director. That is
 *  deliberate and it is not theatre: the two steps stay two steps, so the inbox
 *  holds one honest record of every change with a named person and a timestamp
 *  against it. Read `CONFIG_APPROVERS` below before changing it — a second
 *  approver is a policy decision, not a refactor.
 *
 *  ------------------------------------------------------------------
 *  WHAT THE APPROVER READS
 *  ------------------------------------------------------------------
 *  `platform.approval` stores the change as an opaque payload it never reads,
 *  plus `consequence`: a Vietnamese sentence, written HERE, saying what happens
 *  if the request is approved. The inbox is a platform screen and must never
 *  have to decode a branch's payload to draw a row — that would make every
 *  branch's internals part of the platform's contract. */

/** Việc cần gật. Đã kiểm xong ở service — cửa này không kiểm lại, và người
 *  duyệt đọc đúng thứ sẽ xảy ra chứ không đọc một payload thô.
 *
 *  Hai kiểu `ConfigDraft`/`ConfigPatchDb` mượn thẳng từ repository chứ không
 *  khai lại: đề nghị và phần áp dụng phải là CÙNG một hình dữ liệu, kẻo có ngày
 *  người ta gật một thứ và hệ ghi xuống một thứ khác. `id` và `ord` không nằm
 *  trong `draft` vì máy chủ sinh chúng lúc ÁP DỤNG — hai đề nghị cùng chờ mà đã
 *  giữ sẵn `ord` thì cái được gật sau mang một số đã cũ. */
export type ConfigChange =
  | { kind: 'tao'; list: ConfigList; draft: ConfigDraft }
  | { kind: 'sua'; list: ConfigList; id: string; patch: ConfigPatchDb }
  | { kind: 'thu-tu'; list: ConfigList; ids: string[] }

/** Biên lai của một đề nghị. `state` là của E3, không phải của module này. */
export type ConfigReceipt = {
  /** Mã yêu cầu trong Hộp duyệt của One. */
  requestId: string
  state: ApprovalState
  change: ConfigChange
}

/** Cửa DI. Lớp trừu tượng chứ không `interface`: Nest cần một GIÁ TRỊ làm token
 *  (`emitDecoratorMetadata` ghi tham chiếu lớp vào `design:paramtypes`), mà
 *  interface của TypeScript biến mất lúc biên dịch. Đổi bản triển khai là đổi
 *  đúng một dòng `useClass`. */
export abstract class SalesConfigGate {
  abstract propose(who: Actor, change: ConfigChange): Promise<ConfigReceipt>
}

/** Roles that must say yes to a configuration change, in order.
 *
 *  ONE link, the director — the policy settled 14/09. A list rather than a
 *  constant single value because the shape of the answer is "a chain", and a
 *  second approver must be one line here rather than a rewrite of the gate.
 *
 *  Resolved to actual people by `ApprovalService.chainFor` at the moment a
 *  request is raised, and frozen into the row from then on: a chain that
 *  re-resolved on every read would silently move a pending request to whoever
 *  holds the role TODAY, which is how a decision trail stops being one. */
const CONFIG_APPROVERS: RoleId[] = ['director']

/** The sentence the approver reads instead of the payload.
 *
 *  Written at the door that knows the change rather than at the screen that
 *  draws it, for the same reason `ConfigChange` exists at all: the person
 *  saying yes must see the consequence, not a JSON body. Short on purpose —
 *  an inbox row is scanned, not studied. */
function consequenceOf(change: ConfigChange): string {
  if (change.kind === 'tao') return `Thêm "${change.draft.name}" vào danh mục ${change.list}`
  if (change.kind === 'sua') return `Sửa dòng ${change.id} của danh mục ${change.list}`
  return `Xếp lại thứ tự danh mục ${change.list} — ${change.ids.length} dòng`
}

/** The live gate: every proposal becomes a row in the One inbox.
 *
 *  Answers `waiting` and nothing else. There is no path here that applies a
 *  change immediately, not even for the person who could approve it a second
 *  later, because "propose" and "approve" being two acts is the entire point of
 *  the split — and because `ApprovalService.decide` is the only place that
 *  knows how to apply and record in one transaction. */
@Injectable()
export class SalesConfigGateE3 extends SalesConfigGate {
  private readonly log = new Logger('sales.config')

  constructor(private readonly approvals: ApprovalService) {
    super()
  }

  async propose(who: Actor, change: ConfigChange): Promise<ConfigReceipt> {
    const chain = await this.approvals.chainFor(CONFIG_APPROVERS)
    const request = await this.approvals.open(who, {
      kind: 'config-change',
      consequence: consequenceOf(change),
      /* The payload is this branch's own shape and the platform never reads it.
         It comes back out at apply time, in `SalesConfigService.apply`, where
         the branch is the one reading it again. */
      payload: change,
      chain,
    })

    this.log.log(`đề nghị ${request.id} · ${change.kind} · ${change.list} · bởi ${who.id}`)

    return { requestId: request.id, state: request.state, change }
  }
}
