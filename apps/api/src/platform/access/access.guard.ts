import { Inject, Injectable, type CanActivate, type ExecutionContext } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import type { FastifyRequest } from 'fastify'
import type { AccessControl, DenyReason as EngineDenyReason } from '@pv/engines'
import type { DenyReason as ContractDenyReason } from '@pv/contracts'
import { AuditRepository } from '../audit/audit.repository'
import { ACCESS } from '../engines/tokens'
import { PvError } from '../http/problem'
import { NEED_KEY, PUBLIC_KEY, type RouteNeed } from './need.decorator'

/** CHỐT LỆCH GIỮA ENGINE VÀ HỢP ĐỒNG — giờ là một phép gán, không còn là bảng.
 *
 *  `packages/contracts` vẫn khai lại bốn `DenyReason` bằng zod thay vì nhập từ
 *  engine, để hợp đồng không kéo theo cả engine. Thứ đã bỏ là chỗ hai bên dùng
 *  HAI BỘ CHỮ cho cùng bốn lý do: engine tiếng Việt, hợp đồng ASCII, và một
 *  `Record` mười lăm dòng ngồi đây dịch qua lại. Engine đã đổi sang đúng chữ
 *  của hợp đồng, nên bảng ấy thành ánh xạ đồng nhất.
 *
 *  Phép gán này giữ nguyên tính chất đã mua bằng bảng kia: nó chỉ biên dịch khi
 *  hai union còn trùng khít, nên thêm lý do thứ năm ở một bên mà quên bên kia
 *  là build đỏ — không đợi tới lúc màn nhận một chuỗi nó không biết đọc.
 *  `errors.ts` bên web vừa bỏ đúng bảng sinh đôi của bảng này. */
const asContractReason = (r: EngineDenyReason): ContractDenyReason => r

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
        action: 'view',
        note: `chặn ${req.method} ${req.url} · ${verdict.reason}`,
      })
    }

    const unauth = verdict.reason === 'unauthenticated'
    throw new PvError({
      kind: unauth ? 'unauthenticated' : 'forbidden',
      status: unauth ? 401 : 403,
      title: verdict.note,
      reason: asContractReason(verdict.reason),
    })
  }
}
