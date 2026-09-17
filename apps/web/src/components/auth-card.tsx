import { useThemeMode, wordmarkBlue } from '@pv/ui'
import { forwardRef, useState, type ReactNode } from 'react'
import { ArrowLeft, Eye, EyeOff } from '@pv/ui'
import { Link } from 'react-router-dom'
import {
  AuroraField,
  cn,
  GlassCard,
  Icon,
  Input,
  Separator,
  wordmarkLight,
  type InputProps,
} from '@pv/ui'
import { setLang, useLang, LANG_LABEL, type Lang } from '@/app/i18n'
import { langSwitchText, passwordEyeText, t } from '@/data/auth-i18n'

/** Khung chung của ba màn auth — đăng nhập · quên mật khẩu · đặt lại.
 *
 *  Ba màn là BA ĐƯỜNG DẪN chứ không phải ba trạng thái của một component: nút
 *  Back của trình duyệt phải chạy, và link đặt lại trong mail thì bắt buộc phải
 *  có URL riêng. Nhưng chúng phải trông như một chỗ — người dùng đang đi trong
 *  một luồng, không nhảy giữa ba màn lạ. Nên khung nằm ở đây, đúng một bản.
 *
 *  Card 420px, không phải `max-w-md` (448px): form auth chỉ có hai ô, để rộng
 *  hơn nữa thì dòng chữ hướng dẫn dài ra và mắt phải quét ngang nhiều hơn cần.
 *
 *  Không phải component của `@pv/ui`: nó biết bố cục của đúng ba màn này. Bao
 *  giờ có màn thứ tư ngoài luồng auth cần đúng khung này thì mới chuyển. */
export function AuthCard({
  title,
  lead,
  back,
  children,
}: {
  title: string
  /** Một câu dưới tiêu đề: màn này hỏi gì và sẽ xảy ra chuyện gì tiếp theo.
   *
   *  Bỏ trống được, và màn đăng nhập bỏ trống thật: "Đăng nhập" + hai ô có nhãn
   *  đã nói hết việc phải làm. Câu giải thích ở đó chỉ là chữ người dùng phải
   *  đọc qua mới tới được ô đầu tiên. Hai màn quên/đặt lại thì giữ, vì chúng
   *  hứa một chuyện sắp xảy ra mà nhìn form không đoán ra. */
  lead?: ReactNode
  /** Đường lùi một bước trong luồng — chỉ màn giữa luồng mới có. Đây là lối đi
   *  phụ DUY NHẤT của card; màn đăng nhập không có gì dưới nút Đăng nhập cả. */
  back?: { to: string; label: string }
  children: ReactNode
}) {
  const themeMode = useThemeMode()
  return (
    <AuroraField>
      <div className="flex min-h-svh items-center justify-center p-6">
        <GlassCard className="flex w-full max-w-[420px] flex-col gap-6 p-8">
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between gap-3">
              <img
                src={themeMode === 'stone' ? wordmarkBlue : wordmarkLight}
                alt="PV One"
                className="h-6 object-contain"
              />
              <LangSwitch />
            </div>
            <div className="flex flex-col gap-2">
              <h1 className="font-display m-0 text-[20px] font-semibold">{title}</h1>
              {lead && (
                <p className="text-muted-foreground m-0 text-pretty text-[12.5px] leading-[1.65]">
                  {lead}
                </p>
              )}
            </div>
          </div>

          {children}

          {back && (
            <div className="flex flex-col gap-4">
              <Separator />
              <Link
                to={back.to}
                className="motion-std text-muted-foreground hover:text-foreground inline-flex items-center gap-2 self-start text-[12px] font-semibold"
              >
                <Icon icon={ArrowLeft} size={14} />
                {back.label}
              </Link>
            </div>
          )}
        </GlassCard>
      </div>
    </AuroraField>
  )
}

/** VN · KO · EN, in that fixed order — a pick, not a dial. `setLang` in
 *  `app/i18n.ts` sets the code directly, so landing on the one you want never
 *  costs more than one click. Every word on the four auth screens reads off
 *  this value. */
const LANGS: Lang[] = ['vi', 'ko', 'en']

function LangSwitch() {
  const lang = useLang()
  return (
    <div
      role="group"
      aria-label={t(lang, langSwitchText.label)}
      className="flex items-center gap-2 font-mono text-[11.5px] font-semibold"
    >
      {LANGS.map((code, i) => {
        const active = code === lang
        return (
          <span key={code} className="flex items-center gap-2">
            {i > 0 && (
              <span aria-hidden="true" className="text-muted-foreground/35">
                ·
              </span>
            )}
            <button
              type="button"
              aria-pressed={active}
              onClick={() => setLang(code)}
              className={cn(
                'motion-std focus-visible:outline-ring rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2',
                active ? 'text-foreground' : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {LANG_LABEL[code]}
            </button>
          </span>
        )
      })}
    </div>
  )
}

/** Một ô của form auth: nhãn · ô · lỗi của riêng ô đó.
 *
 *  Lỗi nằm SÁT ô chứ không gom lên đầu form. Form hai ô mà báo lỗi ở đầu thì
 *  người dùng vẫn phải tự dò xem ô nào sai — với form dài thì còn tệ hơn.
 *
 *  Chỗ trống của dòng lỗi không được giữ sẵn: form auth chỉ cao chừng này, giữ
 *  chỗ cho hai dòng lỗi chưa xảy ra làm card rỗng hẳn một khoảng. Card nhích
 *  lên khi có lỗi là chuyển động ĐÚNG — nó kéo mắt về chỗ vừa hỏng. */
export function AuthField({
  label,
  htmlFor,
  error,
  below,
  children,
}: {
  label: string
  htmlFor: string
  error?: string
  /** Content after the error, not before — a link like "Forgot password?"
   *  sitting between the input and its own error would read as if the error
   *  belonged to whatever comes after the link instead. */
  below?: ReactNode
  children: ReactNode
}) {
  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={htmlFor} className="text-[11.5px] font-semibold">
        {label}
      </label>
      {children}
      {error && (
        <p role="alert" className="text-destructive-foreground m-0 text-[11px] leading-[1.5]">
          {error}
        </p>
      )}
      {below}
    </div>
  )
}

/** Ô mật khẩu kèm nút hiện/ẩn.
 *
 *  Có nút hiện vì hai lý do đo được: gõ mật khẩu dài trên bàn phím tablet sai
 *  nhiều, và người sai mật khẩu hai lần liên tiếp thường bỏ cuộc chứ không thử
 *  lần ba. Nút mặc định ở trạng thái ẨN — hiện sẵn là để lộ mật khẩu cho người
 *  đứng sau lưng.
 *
 *  `aria-label` đổi theo trạng thái, vì với trình đọc màn hình thì một nút tên
 *  "Hiện mật khẩu" đang ở chế độ hiện là nói ngược. */
export const PasswordInput = forwardRef<HTMLInputElement, Omit<InputProps, 'type'>>(
  ({ className, ...props }, ref) => {
    const [show, setShow] = useState(false)
    const lang = useLang()

    return (
      <div className="relative">
        <Input
          {...props}
          ref={ref}
          type={show ? 'text' : 'password'}
          className={cn('pr-12', className)}
        />
        <button
          type="button"
          onClick={() => setShow((v) => !v)}
          aria-label={t(lang, show ? passwordEyeText.hide : passwordEyeText.show)}
          className="motion-std text-muted-foreground hover:text-foreground hover:bg-surface-ink/9 absolute right-1 top-1 flex size-8 items-center justify-center rounded-md"
        >
          <Icon icon={show ? EyeOff : Eye} size={16} />
        </button>
      </div>
    )
  },
)
PasswordInput.displayName = 'PasswordInput'
