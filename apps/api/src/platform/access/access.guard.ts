import { Inject, Injectable, type CanActivate, type ExecutionContext } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import type { FastifyRequest } from 'fastify'
import type { AccessControl, DenyReason as EngineDenyReason } from '@pv/engines'
import type { DenyReason as ContractDenyReason } from '@pv/contracts'
import { AuditRepository } from '../audit/audit.repository'
import { ACCESS } from '../engines/tokens'
import { PvError } from '../http/problem'
import { NEED_KEY, PUBLIC_KEY, type RouteNeed } from './need.decorator'

/** CHỐT LỆCH GIỮA ENGINE VÀ HỢP ĐỒNG.
 *
 *  `packages/contracts` khai lại bốn `DenyReason` bằng zod thay vì nhập từ
 *  engine (để hợp đồng không kéo theo cả engine), bằng khoá ASCII thay vì
 *  tiếng Việt (để sống sót qua HTTP). Bảng dưới đây dịch 1-1, đúng bảng đã ghi
 *  ở `e2-access.ts`. `Record<EngineDenyReason, …>` là chỗ `tsc` bắt được nếu
 *  hai bên lệch: thêm một lý do thứ năm vào E2 mà quên thêm vào bảng này thì
 *  build đỏ ngay, không đợi tới lúc màn nhận một chuỗi nó không biết đọc. */
const CONTRACT_REASON: Record<EngineDenyReason, ContractDenyReason> = {
  'chưa-đăng-nhập': 'unauthenticated',
  'thiếu-nhánh': 'branch-not-licensed',
  'thiếu-quyền': 'permission-denied',
  'ngoài-phạm-vi': 'out-of-scope',
}
const asContractReason = (r: EngineDenyReason): ContractDenyReason => CONTRACT_REASON[r]

/** Hàng rào quyền của máy chủ — bản đối xứng của `requireAccess` bên web.
 *
 *  ------------------------------------------------------------------
 *  HỎNG THEO HƯỚNG ĐÓNG
 *  ------------------------------------------------------------------
 *  Bản trước viết `if (!need) return true` — quên `@Need` trên một endpoint là
 *  endpoint đó công khai, và không có gì báo. Đó là hỏng theo hướng MỞ, ngược
 *  hẳn với chính E2, nơi đã chọn hướng ngược lại cho cùng loại tình huống:
 *  *"Vai lạ thì KHÔNG có quyền gì — hỏng theo hướng đóng, không hỏng theo
 *  hướng nổ."*
 *
 *  Giờ thì không khai gì = bị từ chối. Và để chỗ hỏng không phải chờ một người
 *  dùng thật đâm vào mới lộ, `RouteAudit` quét toàn bộ route lúc khởi động và
 *  không cho máy chủ lên nếu còn endpoint chưa khai. */
@Injectable()
export class AccessGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    @Inject(ACCESS) private readonly access: AccessControl,
    private readonly audit: AuditRepository,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const targets = [ctx.getHandler(), ctx.getClass()]

    if (this.reflector.getAllAndOverride<boolean>(PUBLIC_KEY, targets)) return true

    const need = this.reflector.getAllAndOverride<RouteNeed | undefined>(NEED_KEY, targets)
    const req = ctx.switchToHttp().getRequest<FastifyRequest>()

    if (!need) {
      /* Không tới được đây khi `RouteAudit` còn chạy — nhưng nếu ai đó tắt nó,
         đường này vẫn phải đóng chứ không mở. */
      throw new PvError({
        kind: 'forbidden',
        status: 403,
        title: 'Đường dữ liệu chưa khai quyền.',
        reason: 'permission-denied',
      })
    }

    const actor = req.actor ?? null
    const verdict = this.access.check(actor, need)
    if (verdict.ok) return true

    /* Ghi vết ở CHỖ CHẶN THẬT — một lần cho một lần chặn. Chỉ ghi được khi
       biết người là ai; chưa đăng nhập thì không có gì để quy trách nhiệm. */
    if (actor) {
      await this.audit.write({
        actorId: actor.id,
        action: 'xem',
        note: `chặn ${req.method} ${req.url} · ${verdict.reason}`,
      })
    }

    const unauth = verdict.reason === 'chưa-đăng-nhập'
    throw new PvError({
      kind: unauth ? 'unauthenticated' : 'forbidden',
      status: unauth ? 401 : 403,
      title: verdict.note,
      reason: asContractReason(verdict.reason),
    })
  }
}
