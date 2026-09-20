import { useEffect, useMemo, useState } from 'react'
import { PenLine, TriangleAlert, X } from '@pv/ui'
import { Button, Chip, Drawer, Icon, Input, MetaPill, Select, billions, cn, vnd } from '@pv/ui'
import { CURRENCIES, toMoneyVnd, type CurrencyCode } from '@pv/engines/fixtures/das-vina'
import type { ContractSign, OpportunityRow } from '@pv/contracts'
import { userMessage } from '@/app/api'
import { toastDone } from '@/app/toast'
import { peopleIdOptions, useSalesPeople } from '@/data/directory'
import { saleOwnersOf } from '@/data/opportunities'
import { useSignContract } from '@/data/opportunities-write'
import { Field } from './ops-fields'
import { dmy } from '@/lib/date'

/** Đề nghị ký hợp đồng cho một cơ hội — panel đè lên hồ sơ đơn.
 *
 *  ------------------------------------------------------------------
 *  BA Ô, VÀ CẢ BA ĐỀU LÀ Ô XÁC NHẬN CHỨ KHÔNG PHẢI Ô BẮT BUỘC
 *  ------------------------------------------------------------------
 *  `ContractSign` để cả ba trường tuỳ chọn: vắng số tiền là lấy theo đơn, vắng
 *  ngày là lấy lúc này, vắng người là lấy Sale đầu tiên đứng đơn. Nghĩa là một
 *  lượt ký đúng bằng số đã chào, hôm nay, bởi người đang đứng đơn — trường hợp
 *  chín trên mười — gửi lên một thân rỗng cũng chạy.
 *
 *  Panel vẫn bày cả ba ra, và vì một lý do khác hẳn "máy chủ đòi": ba con số
 *  này là thứ người duyệt đọc, và một khi được gật thì hợp đồng KHÔNG GỠ ĐƯỢC
 *  từ giao diện. Người gửi phải nhìn thấy ba con số TRƯỚC khi gửi, kể cả khi cả
 *  ba đều đã đúng sẵn.
 *
 *  ------------------------------------------------------------------
 *  VÌ SAO DRAWER, KHÔNG PHẢI MỘT MÀN
 *  ------------------------------------------------------------------
 *  Cùng lý do với `convert-dialog.tsx`, và cùng ngôn ngữ đè màn: người bấm đang
 *  ĐỌC DỞ hồ sơ đơn — họ vừa xem số tiền, ai đứng đơn, đơn nằm cột nào. Ba ô
 *  của panel này lấy đúng từ đó. Đóng panel lại là đọc tiếp, không mất chỗ.
 *
 *  ------------------------------------------------------------------
 *  NEVER PAINTS "SIGNED" ITSELF
 *  ------------------------------------------------------------------
 *  The panel closes once the server has taken the request, and only then. The
 *  answer is a 202 receipt, not a contract: `useSignContract` re-reads the
 *  profile, whose `pendingSign` locks the button until an approver decides. */

type SignForm = {
  /** `null` = không ghi đè; máy chủ lấy số của đơn. */
  amount: number | null
  currency: CurrencyCode
  /** `YYYY-MM-DD` như ô `<input type="date">` đọc ra. */
  signedDate: string
  /** `''` = không ghi đè; máy chủ lấy Sale đầu tiên đứng đơn. */
  ownerId: string
}

/** Hôm nay theo lịch của MÁY NGƯỜI DÙNG, `YYYY-MM-DD`.
 *
 *  Cắt từ `toISOString()` sẽ sai đúng một ngày cho bất kỳ ai bấm sau 17:00 giờ
 *  Hà Nội: lúc đó UTC đã sang ngày hôm sau, và ô ngày mở ra bày ngày mai. */
function localDay(at: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}`
}

/** `YYYY-MM-DD` của ô nhập → `Moment` (ISO 8601 có múi giờ) mà hợp đồng đòi.
 *
 *  Cột bên máy chủ là `timestamptz`, nên một chuỗi ngày trần buộc ai đó phải
 *  BỊA ra giờ trong ngày — và bịa nửa đêm địa phương thì đọc ngược lại ở UTC ra
 *  ngày hôm trước. Hai nhánh ở đây tránh cả hai chỗ đó:
 *
 *   · Ngày đang chọn ĐÚNG là hôm nay — trường hợp thường — thì gửi thẳng thời
 *     điểm thật. Không bịa gì cả, và trùng đúng thứ máy chủ sẽ tự lấy nếu ta bỏ
 *     trống ô này.
 *   · Ngày khác — giấy tờ vào sổ muộn vài hôm — thì lấy 12:00 GIỜ ĐỊA PHƯƠNG.
 *     Giữa trưa là mốc duy nhất còn đọc ra đúng ngày đó ở mọi múi giờ từ UTC-11
 *     tới UTC+12, nên đơn ký ngày 28 không đọc thành ngày 27 ở một máy khác. */
function signedAtOf(day: string): string {
  const now = new Date()
  if (day === localDay(now)) return now.toISOString()
  const [y = '', m = '', d = ''] = day.split('-')
  return new Date(Number(y), Number(m) - 1, Number(d), 12, 0, 0).toISOString()
}

/** Phiếu → thân request. Ô nào không ghi đè gì thì VẮNG MẶT, không gửi `null`.
 *
 *  `amount` và `currency` đi thành cặp hoặc không đi cái nào — hợp đồng có
 *  `.refine` bắt đúng điều đó, gương lại CHECK `contract_money_pair` của bảng.
 *  Gửi một mình đồng tiền là một 400 gọi tên ô, không phải một trường bị bỏ qua. */
function bodyOf(form: SignForm): ContractSign {
  const money = form.amount !== null && form.amount > 0

  return {
    ...(money ? { amount: form.amount as number, currency: form.currency } : {}),
    ...(form.signedDate === '' ? {} : { signedAt: signedAtOf(form.signedDate) }),
    ...(form.ownerId === '' ? {} : { ownerId: form.ownerId }),
  }
}

type Props = {
  op: OpportunityRow
  open: boolean
  onClose: () => void
}

export function SignDrawer({ op, open, onClose }: Props) {
  const people = useSalesPeople()
  const sign = useSignContract(op.code)

  /* Mồi từ CHÍNH ĐƠN đang mở, không phải từ một tờ giấy trắng. `op` giữ nguyên
     tham chiếu giữa các lần vẽ của react-query, nên bản mồi cũng vậy, nên
     `useEffect` bên dưới không nạp đè lên ô người dùng vừa sửa. */
  const seed = useMemo<SignForm>(
    () => ({
      amount: op.amount,
      /* Đơn cũ chưa có tiền thì cũng chưa có đồng tiền; ô Select phải chọn sẵn
         một cái để không rỗng, và VND là mặc định của sổ này. */
      currency: op.currency ?? 'VND',
      signedDate: localDay(new Date()),
      ownerId: saleOwnersOf(op)[0]?.id ?? '',
    }),
    [op],
  )

  const [form, setForm] = useState<SignForm>(seed)

  /* Mở panel là một lần bắt đầu mới. Không nạp lại thì đóng rồi mở lại vẫn thấy
     con số vừa sửa dở của lần trước — trên một thao tác không gỡ được, đó là
     đúng loại nhầm lẫn đắt nhất. */
  useEffect(() => {
    if (open) setForm(seed)
  }, [open, seed])

  const set = <K extends keyof SignForm>(key: K, value: SignForm[K]) =>
    setForm((f) => ({ ...f, [key]: value }))

  const symbol = CURRENCIES.find((c) => c.code === form.currency)?.symbol ?? ''
  const owner = people.find((a) => a.id === form.ownerId)
  const busy = sign.isPending

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title="Đề nghị ký"
      subtitle={
        <>
          <span className="font-mono">{op.code}</span> · {op.account} — được duyệt thì đơn rời năm
          cột và đứng ở "Đã ký".
        </>
      }
      meta={<Chip>{op.code}</Chip>}
      footer={
        <div className="flex flex-wrap items-center justify-between gap-4">
          {/* `min-w-0 flex-1`, not the default `flex-basis: auto`: the idle
              sentence is wider than the drawer, so its natural size pushes the
              buttons onto a second row and `justify-between` then left-aligns them. */}
          <span
            className={cn(
              'min-w-0 flex-1 text-[11.5px] leading-[1.5]',
              sign.error ? 'text-destructive-foreground' : 'text-foreground',
            )}
            aria-live="polite"
          >
            {/* Lỗi máy chủ thắng mọi câu khác — người vừa bấm mà bị từ chối cần
              biết vì sao trước khi biết chuyện gì lẽ ra đã xảy ra. 409 ở cửa
              này nghĩa là đơn đã ký, đã thua, hoặc đang có đề nghị ký chờ duyệt; `userMessage` dịch
              nguyên câu của máy chủ thay vì đoán lại. */}
            {sign.error
              ? userMessage(sign.error)
              : busy
                ? 'Đang gửi đề nghị ký…'
                : 'Gửi xong là một đề nghị chờ duyệt. Hợp đồng và số hợp đồng chỉ có khi người duyệt gật.'}
          </span>
          <div className="flex shrink-0 gap-2">
            <Button size="md" variant="ghost" disabled={busy} onClick={onClose}>
              <Icon icon={X} size={16} />
              Huỷ
            </Button>
            <Button
              size="md"
              disabled={busy}
              onClick={() => {
                sign.mutate(bodyOf(form), {
                  onSuccess: () => {
                    toastDone('Đã gửi đề nghị ký, chờ duyệt.')
                    onClose()
                  },
                })
              }}
            >
              <Icon icon={PenLine} size={16} />
              {busy ? 'Đang gửi…' : 'Gửi đề nghị ký'}
            </Button>
          </div>
        </div>
      }
    >
      <div className="flex flex-col gap-6">
        <section className="grid gap-4 sm:grid-cols-2">
          <Field
            label="Số tiền ký"
            hint="Mồi bằng giá trị đơn. Số chốt thường không phải số đã chào — sửa ở đây, đơn giữ nguyên số cũ."
          >
            <span className="relative flex items-center">
              <Input
                inputMode="numeric"
                aria-label="Số tiền ký"
                className="pr-8 font-mono"
                value={form.amount === null ? '' : form.amount.toLocaleString('vi-VN')}
                onChange={(e) => {
                  const digits = e.target.value.replace(/\D/g, '')
                  set('amount', digits === '' ? null : Number(digits))
                }}
              />
              <span className="text-muted-foreground pointer-events-none absolute right-3 text-[12px]">
                {symbol}
              </span>
            </span>
          </Field>

          <Field label="Đồng tiền" plain>
            <Select
              label="Đồng tiền"
              hideLabel
              value={form.currency}
              neutralValue={form.currency}
              onChange={(v) => set('currency', v as CurrencyCode)}
              options={CURRENCIES.map((c) => ({ value: c.code, label: c.label }))}
              className="w-full"
            />
          </Field>

          {form.amount !== null && form.amount > 0 && (
            <span className="text-muted-foreground text-[11.5px] leading-[1.5] sm:col-span-2">
              {form.currency === 'VND'
                ? `${vnd(form.amount)} · ${billions(form.amount)}`
                : `${form.amount.toLocaleString('vi-VN')} ${symbol} · ${billions(toMoneyVnd(form.amount, form.currency))} quy ra đồng`}
            </span>
          )}
        </section>

        <Field
          label="Ngày ký"
          hint={
            form.signedDate !== ''
              ? `Đọc là ${dmy(form.signedDate)}. Giấy tờ hay vào sổ sau khi bút đã ký — lùi lại đúng ngày đó.`
              : 'Bỏ trống thì lấy đúng lúc bấm.'
          }
        >
          <Input
            type="date"
            aria-label="Ngày ký"
            value={form.signedDate}
            onChange={(e) => set('signedDate', e.target.value)}
          />
        </Field>

        <Field
          label="Hoa hồng về"
          plain
          hint="Mồi bằng Sale đứng đơn đầu tiên. Phần chốt của hoa hồng ghi cho đúng một người — đổi ở đây không đổi ai đứng đơn."
        >
          <Select
            label="Hoa hồng về"
            hideLabel
            value={form.ownerId}
            neutralValue={form.ownerId}
            onChange={(v) => set('ownerId', v)}
            options={peopleIdOptions(people)}
            className="w-full"
          />
        </Field>

        {/* Câu cảnh báo là phần THẬT SỰ của panel này, không phải chữ trang trí:
            cửa ký không có đường ngược. Icon qua cổng `<Icon>` (luật 11) chứ
            không phải một ký tự cảnh báo dán vào chuỗi. */}
        <div className="bg-surface-ink/5 flex items-start gap-3 rounded-md p-4">
          <Icon icon={TriangleAlert} size={16} className="text-warning mt-1 shrink-0" />
          <p className="text-[11.5px] leading-[1.5]">
            Đề nghị này đi qua Hộp duyệt; được gật thì hợp đồng mới được tạo, và từ đó không gỡ được
            từ giao diện.
            {owner && (
              <>
                {' '}
                Hoa hồng ghi cho <span className="font-semibold">{owner.name}</span>.
              </>
            )}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <MetaPill>{op.name}</MetaPill>
          {op.amount !== null && op.currency !== null && (
            <MetaPill mono>đơn đang ghi {billions(toMoneyVnd(op.amount, op.currency))}</MetaPill>
          )}
        </div>
      </div>
    </Drawer>
  )
}
