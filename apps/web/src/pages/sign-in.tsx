import { useLocation, useNavigate } from 'react-router-dom'
import { AuroraField, Badge, GlassCard, wordmarkLight } from '@pv/ui'
import { dasVina } from '@pv/engines/fixtures/das-vina'
import { useSession } from '@/app/session'

/** Màn chọn vai — cửa vào của POC.
 *
 *  Chưa có backend nên không có mật khẩu: chọn một người trong phòng là vào.
 *  Cái này KHÔNG phải màn đăng nhập thật, nó là công tắc đổi vai — và đổi vai
 *  là thứ bộ màn cần được (docs/luat-thiet-ke.md §7 · màn 03 phải đổi theo
 *  người xem: TP Kinh doanh nhìn khác Giám đốc).
 *
 *  Danh sách người lấy từ `actors` của kịch bản 2 · DAS Vina — bảng vai đã
 *  chốt của Pebble Sales. Đây là màn duy
 *  nhất biết danh sách này; store phiên thì không, nên nó không kéo kịch bản
 *  vào những màn không liên quan. */
export function SignInPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const signIn = useSession((s) => s.signIn)

  const from = (location.state as { from?: string } | null)?.from ?? '/'

  return (
    <AuroraField>
      <div className="flex min-h-svh items-center justify-center p-6">
        <GlassCard className="flex w-full max-w-md flex-col gap-5 p-8">
          <div className="flex flex-col gap-2">
            <img src={wordmarkLight} alt="PV One" className="h-6 self-start object-contain" />
            <p className="text-muted-foreground text-[12.5px] leading-[1.65]">
              Chọn vai để vào. Mỗi vai thấy một phần khác nhau của hệ — quyền do E2 quyết, không
              phải do màn tự giấu.
            </p>
          </div>

          <div className="flex flex-col gap-2">
            {dasVina.actors.map((actor) => (
              <button
                key={actor.id}
                type="button"
                onClick={() => {
                  signIn(actor)
                  navigate(from, { replace: true })
                }}
                className="motion-std flex items-center gap-3 rounded-md bg-white/5 px-4 py-3 text-left hover:bg-white/10"
              >
                <span className="flex-1">
                  <b className="block text-[13.5px] font-semibold">{actor.name}</b>
                  <small className="text-muted-foreground block text-[11px] font-normal">
                    {actor.role}
                  </small>
                </span>
                {actor.ownOnly ? <Badge tone="draft">chỉ khách của mình</Badge> : null}
              </button>
            ))}
          </div>
        </GlassCard>
      </div>
    </AuroraField>
  )
}

export default SignInPage
