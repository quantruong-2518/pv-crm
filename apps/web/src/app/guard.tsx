import { useEffect, type ReactNode } from 'react'
import { Lock } from 'lucide-react'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import { AuroraField, Button, GlassCard, Icon } from '@pv/ui'
import type { Branch } from '@pv/engines'
import { access, canEnter, useSession } from './session'

/** Cửa vào của một màn.
 *
 *  Hai tầng, KHÔNG gộp làm một:
 *   1 · chưa đăng nhập  → đá về màn chọn vai, nhớ đường đang định vào;
 *   2 · đăng nhập rồi nhưng không có nhánh → KHÔNG đá đi đâu cả, hiện đúng câu
 *       "Bị ẩn theo quyền của bạn" và nói thẳng là bản này chưa có đường xin
 *       quyền. Lối ra duy nhất có thật là đổi vai, nên đó là nút duy nhất.
 *
 *  Phân biệt này quan trọng: đá người đã đăng nhập về màn login khi họ chỉ
 *  thiếu quyền là nói dối họ về nguyên nhân, và họ sẽ đăng nhập lại vòng vo.
 *  Cách hiện ở tầng 2 giống hàng "Bị ẩn theo quyền của bạn" của màn Tìm toàn
 *  cục (docs/luat-thiet-ke.md §7) — cùng một luật, hai chỗ hiện.
 *
 *  Mọi lần chặn đều ghi vết qua E2. Chặn mà không ghi thì sau này không ai
 *  trả lời được câu "vì sao hôm đó tôi không vào được". */
export function RequireAccess({
  branch = null,
  children,
}: {
  /** Nhánh cần license. `null` = màn One Core, chỉ cần đăng nhập. */
  branch?: Branch | null
  children: ReactNode
}) {
  const actor = useSession((s) => s.actor)
  const location = useLocation()
  const allowed = canEnter(actor, branch)

  useEffect(() => {
    if (actor && !allowed) {
      access.log({
        actorId: actor.id,
        action: 'xem',
        note: `chặn vào ${location.pathname} · thiếu nhánh ${branch}`,
      })
    }
  }, [actor, allowed, branch, location.pathname])

  if (!actor) return <Navigate to="/dang-nhap" replace state={{ from: location.pathname }} />
  if (!allowed) return <BranchLocked branch={branch} />

  return <>{children}</>
}

function BranchLocked({ branch }: { branch: Branch | null }) {
  const navigate = useNavigate()
  const signOut = useSession((s) => s.signOut)

  return (
    <AuroraField>
      <div className="flex min-h-svh items-center justify-center p-6">
        <GlassCard className="flex max-w-md flex-col items-center gap-4 p-8 text-center">
          <Icon icon={Lock} size={26} className="text-muted-foreground" />
          <h1 className="font-display text-[20px] font-semibold">Bị ẩn theo quyền của bạn</h1>
          {/* Câu này KHÔNG được hứa một đường xin quyền: bản POC chưa nối E3,
              nên yêu cầu mở quyền chưa đi tới ai. Trước bản này màn có nút "Xin
              quyền" với `onClick` rỗng — bấm không xảy ra gì và không chữ nào
              nói ra điều đó. Bỏ nút, giữ câu, đúng cách `chrome.tsx` bỏ hẳn
              `onOpenAssistant` để không vẽ ra một nút không đưa đi đâu. */}
          <p className="text-muted-foreground text-pretty text-[12.5px] leading-[1.65]">
            Vai hiện tại không có nhánh {branch}. Bản này chưa có đường xin quyền — mở nhánh là việc
            của quản trị, và chuỗi duyệt E3 chưa nối. Đổi sang vai có nhánh đó để xem.
          </p>
          <div className="flex gap-3">
            {/* Nút DUY NHẤT của màn nên nó là nút chính, không phải `ghost`:
                `ghost` là kiểu của lối phụ, mà ở đây không còn lối nào khác. */}
            <Button
              size="md"
              onClick={() => {
                signOut()
                navigate('/dang-nhap', { replace: true })
              }}
            >
              Đổi vai
            </Button>
          </div>
        </GlassCard>
      </div>
    </AuroraField>
  )
}
