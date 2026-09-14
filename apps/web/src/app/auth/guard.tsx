import { useEffect, type ReactNode } from 'react'
import { Lock } from '@pv/ui'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import { AuroraField, Button, GlassCard, Icon } from '@pv/ui'
import type { AccessNeed, Branch, Permission, Verdict } from '@pv/engines'
import { useAccess } from './can'
import { ExpiryWarning } from './expiry'
import { ReauthDialog } from './reauth-dialog'
import { access, useSession } from './session'

/** HAI cổng: `RequireAccess` cho cả một màn, `Can` cho một nút.
 *
 *  Cùng file vì chúng cùng hỏi một hàm E2 và cùng phải nói cùng một câu — tách
 *  ra hai nơi là hai luật quyền chờ lệch nhau. Phần hook thuần (`useCan`) nằm ở
 *  `can.ts` vì file này chỉ được export component.
 *
 *  Cửa vào của một màn.
 *
 *  ------------------------------------------------------------------
 *  NĂM TRẠNG THÁI PHIÊN → BA CÁCH XỬ, KHÔNG GỘP
 *  ------------------------------------------------------------------
 *  | Phiên        | Làm gì                                                   |
 *  |--------------|----------------------------------------------------------|
 *  | `booting`  | ĐỢI. Không đá đi đâu — xem lý do ngay dưới               |
 *  | `guest`      | về màn đăng nhập, nhớ đường đang định vào                |
 *  | `expired`    | về màn đăng nhập, kèm LÝ DO và đường quay lại            |
 *  | `signing-in`   | như `guest` — form đang bay, chưa có kết luận            |
 *  | `signed-in`     | hỏi E2; không qua thì hiện đúng câu, KHÔNG đá đi         |
 *
 *  **Vì sao `booting` phải đợi.** Lúc app vừa mở, câu trả lời cho "ai đang
 *  đăng nhập" chưa có. Coi "chưa biết" là "chưa đăng nhập" thì mỗi lần F5 ở một
 *  trang trong, người dùng bị ném về màn đăng nhập rồi mới quay lại — và với
 *  backend thật (một vòng `/me`) thì cú nháy đó dài đủ để họ kịp bấm nhầm.
 *
 *  **Vì sao hết hạn thì ĐÁ RA, chứ không khoá tại chỗ.** Bản trước giữ màn cũ
 *  trong cây và phủ một lớp mờ có ô mật khẩu lên trên, để người dùng không mất
 *  phiếu đang gõ dở. Cái giá là dữ liệu của người vừa rời đi vẫn nằm trên màn
 *  — trên đúng cái máy vừa bị bỏ trống, tức đúng tình huống mà mốc "ngồi không"
 *  sinh ra để xử. Nay đá thẳng về `/dang-nhap` kèm đường quay lại: phần chưa
 *  lưu mất, nhưng màn sạch. Dải cảnh báo hai phút (`expiry.tsx`) là chỗ bù lại
 *  cho cái mất đó, và nó có nút gia hạn.
 *
 *  **Vì sao thiếu quyền thì KHÔNG đá về màn đăng nhập.** Đá một người đã đăng
 *  nhập về màn đăng nhập vì họ thiếu quyền là nói dối họ về nguyên nhân; họ sẽ
 *  đăng nhập lại vòng vo và không bao giờ vào được. Chỗ này hiện đúng câu của
 *  E2 — cùng luật với hàng "Bị ẩn theo quyền của bạn" của màn Tìm toàn cục
 *  (docs/luat-thiet-ke.md §7), hai chỗ hiện.
 *
 *  Mọi lần chặn đều ghi vết qua E2. Chặn mà không ghi thì sau này không ai trả
 *  lời được câu "vì sao hôm đó tôi không vào được". */
export function RequireAccess({
  branch = null,
  permission,
  children,
}: {
  /** Nhánh cần license. `null` = màn One Core, chỉ cần đăng nhập. */
  branch?: Branch | null
  /** Quyền vai mà màn này đòi. Bỏ trống = màn chỉ đọc, có license là vào được. */
  permission?: Permission
  children: ReactNode
}) {
  const status = useSession((s) => s.status)
  const actor = useSession((s) => s.actor)
  const expiredBy = useSession((s) => s.expiredBy)
  const location = useLocation()
  const verdict = access.check(actor, { branch, permission })
  const denied = verdict.ok ? null : verdict.reason

  useEffect(() => {
    if (status !== 'signed-in' || !actor || !denied) return
    access.log({
      actorId: actor.id,
      action: 'view',
      note: `chặn vào ${location.pathname} · ${denied}`,
    })
  }, [status, actor, denied, location.pathname])

  /* Đợi, và đợi bằng đúng khung mà `Suspense` của route dùng — nhấp nháy giữa
     hai khung trống khác nhau cũng là nhấp nháy. */
  if (status === 'booting') return <AuroraField>{null}</AuroraField>

  if (status !== 'signed-in' || !actor) {
    return (
      <Navigate
        to="/dang-nhap"
        replace
        /* `reason` travels BESIDE `expired`, not instead of it: `expiredBy`
           can be left over from an older expiry after the user signed out, so
           on its own it cannot say whether this trip is one. Two fields, two
           questions — "did a session just die" and "of what". */
        state={{
          from: location.pathname + location.search,
          expired: status === 'expired',
          reason: status === 'expired' ? expiredBy : undefined,
        }}
      />
    )
  }

  if (!verdict.ok) return <AccessLocked verdict={verdict} />

  return (
    <>
      {children}
      <ExpiryWarning />
      {/* Mounted here rather than in `chrome.tsx`: this box only means anything
          once there is a session and E2 has passed, which is exactly this
          branch. It renders nothing until an interceptor calls `askReauth()`. */}
      <ReauthDialog />
    </>
  )
}

/** Cổng của một NÚT.
 *
 *  Mặc định không vẽ gì khi thiếu quyền. Nhưng khi hành động là thứ người dùng
 *  đang đi tìm — nút "Giao việc" mà một Sale mong có — thì nút khoá kèm câu
 *  giải thích tốt hơn khoảng trống: nav bên trái đã theo đúng luật đó (mục khoá
 *  vẫn hiện, có ổ khoá). Truyền `fallback` cho những chỗ ấy. */
export function Can({
  need,
  children,
  fallback = null,
}: {
  need: AccessNeed
  children: ReactNode
  fallback?: ReactNode
}) {
  return <>{useAccess(need).ok ? children : fallback}</>
}

/** Màn "không vào được" — MỘT khung, ba câu.
 *
 *  Ba lý do E2 đưa ra dẫn tới ba đường sửa khác nhau, nên chúng phải là ba câu
 *  khác nhau. Gộp thành một câu "Bạn không có quyền" là đẩy người dùng đi hỏi
 *  nhầm người: thiếu license thì hỏi người ký hợp đồng, thiếu vai thì xin qua
 *  E3, ngoài phạm vi thì nhờ chính người đang giữ dữ liệu đó. */
function AccessLocked({ verdict }: { verdict: Extract<Verdict, { ok: false }> }) {
  const navigate = useNavigate()
  const signOut = useSession((s) => s.signOut)

  const said =
    verdict.reason === 'branch-not-licensed'
      ? 'Công ty chưa mở nhánh này. Xin quyền để mở, hoặc đăng nhập bằng vai khác.'
      : verdict.reason === 'out-of-scope'
        ? 'Dữ liệu này không đứng tên bạn. Nhờ người đang giữ nó mở giúp.'
        : 'Vai hiện tại không có quyền vào màn này. Xin quyền để mở.'

  return (
    <AuroraField>
      <div className="flex min-h-svh items-center justify-center p-6">
        <GlassCard className="flex max-w-md flex-col items-center gap-4 p-8 text-center">
          <Icon icon={Lock} size={26} className="text-muted-foreground" />
          <h1 className="font-display text-[20px] font-semibold">Bị ẩn theo quyền của bạn</h1>
          <p className="text-muted-foreground text-pretty text-[12.5px] leading-[1.65]">{said}</p>
          <div className="flex gap-3">
            <Button
              onClick={() => {
                /* Nối E3 khi có backend: yêu cầu mở quyền là một chuỗi duyệt,
                   không phải email gửi tay. */
              }}
            >
              Xin quyền
            </Button>
            <Button
              variant="ghost"
              onClick={() => {
                signOut()
                navigate('/dang-nhap', { replace: true })
              }}
            >
              Đăng xuất
            </Button>
          </div>
        </GlassCard>
      </div>
    </AuroraField>
  )
}
