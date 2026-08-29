import { useEffect, useMemo, useState } from 'react'
import { PenLine, TriangleAlert, X } from '@pv/ui'
import { Button, Chip, Drawer, Icon, Input, MetaPill, Select, billions, cn, dong } from '@pv/ui'
import { CURRENCIES, toDong, type CurrencyCode } from '@pv/engines/fixtures/das-vina'
import type { ContractSign, OpportunityRow } from '@pv/contracts'
import { userMessage } from '@/app/api'
import { peopleIdOptions, useSalesPeople } from '@/data/directory'
import { saleOwnersOf } from '@/data/ops'
import { useSignContract } from '@/data/ops-write'
import { Field } from './ops-fields'
import { dmy } from '@/lib/date'

/** Ký hợp đồng cho một cơ hội — panel đè lên hồ sơ đơn.
 *
 *  ------------------------------------------------------------------
 *  BA Ô, VÀ CẢ BA ĐỀU LÀ Ô XÁC NHẬN CHỨ KHÔNG PHẢI Ô BẮT BUỘC
 *  ------------------------------------------------------------------
 *  `ContractSign` để cả ba trường tuỳ chọn: vắng số tiền là lấy theo đơn, vắng
 *  ngày là lấy lúc này, vắng người là lấy Sale đầu tiên đứng đơn. Nghĩa là một
 *  lượt ký đúng bằng số đã chào, hôm nay, bởi người đang đứng đơn — trường hợp
 *  chín trên mười — gửi lên một thân rỗng cũng chạy.
 *
 *  Panel vẫn bày cả ba ra, và vì một lý do khác hẳn "máy chủ đòi": ký là thao
 *  tác KHÔNG GỠ ĐƯỢC từ giao diện. Không có `DELETE`, và sẽ không có — gỡ một
 *  chữ ký đã sang tay kế toán phải là một đề nghị có người duyệt. Một nút bấm
 *  phát một mà tạo ra dòng không rút lại được thì phải cho người bấm nhìn thấy
 *  ba con số họ đang ký TRƯỚC khi bấm, kể cả khi cả ba đều đã đúng sẵn.
 *
 *  ------------------------------------------------------------------
 *  VÌ SAO DRAWER, KHÔNG PHẢI MỘT MÀN
 *  ------------------------------------------------------------------
 *  Cùng lý do với `convert-dialog.tsx`, và cùng ngôn ngữ đè màn: người bấm đang
 *  ĐỌC DỞ hồ sơ đơn — họ vừa xem số tiền, ai đứng đơn, đơn nằm cột nào. Ba ô
 *  của panel này lấy đúng từ đó. Đóng panel lại là đọc tiếp, không mất chỗ.
 *
 *  ------------------------------------------------------------------
 *  KHÔNG BAO GIỜ TỰ VẼ TRẠNG THÁI "ĐÃ KÝ"
 *  ------------------------------------------------------------------
 *  Panel đóng lại khi máy chủ đã nhận, và chỉ khi đó. Nó không chạm gì vào cache
 *  — `useSignContract` ghi nửa `opportunity` của phản hồi vào đúng khoá hồ sơ,
 *  nên `contractCode` mọc lên và thanh công cụ tự đổi nút thành pill. Đóng
 *  trước rồi mới gửi là cách chắc chắn nhất để một lượt ký bị từ chối biến mất
 *  không dấu vết, mà người dùng thì tin là đã xong. */

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

/** `YYYY-MM-DD` của ô nhập → `Moc` (ISO 8601 có múi giờ) mà hợp đồng đòi.
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
function mocOf(day: string): string {
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
    ...(form.signedDate === '' ? {} : { signedAt: mocOf(form.signedDate) }),
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
      title="Chốt thắng"
      subtitle={
        <>
          <span className="font-mono">{op.code}</span> · {op.account} — ký xong đơn rời năm cột và
          đứng ở "Đã ký".
        </>
      }
      meta={<Chip>{op.code}</Chip>}
      footer={
        <div className="flex flex-wrap items-center justify-between gap-4">
          <span
            className={cn(
              'text-[11.5px] leading-[1.5]',
              sign.error ? 'text-warning' : 'text-muted-foreground',
            )}
            aria-live="polite"
          >
            {/* Lỗi máy chủ thắng mọi câu khác — người vừa bấm mà bị từ chối cần
                biết vì sao trước khi biết chuyện gì lẽ ra đã xảy ra. 409 ở cửa
                này nghĩa là đơn đã ký rồi, hoặc đã thua; `userMessage` dịch
                nguyên câu của máy chủ thay vì đoán lại. */}
            {sign.error
              ? userMessage(sign.error)
              : busy
                ? 'Đang ghi hợp đồng…'
                : 'Máy chủ cấp số hợp đồng lúc ký, theo dãy mã của sổ.'}
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
                sign.mutate(bodyOf(form), { onSuccess: () => onClose() })
              }}
            >
              <Icon icon={PenLine} size={16} />
              {busy ? 'Đang ký…' : 'Ký hợp đồng'}
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
                ? `${dong(form.amount)} · ${billions(form.amount)}`
                : `${form.amount.toLocaleString('vi-VN')} ${symbol} · ${billions(toDong(form.amount, form.currency))} quy ra đồng`}
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
        <div className="flex items-start gap-3 rounded-md bg-white/5 p-4">
          <Icon icon={TriangleAlert} size={16} className="text-warning mt-1 shrink-0" />
          <p className="text-[11.5px] leading-[1.5]">
            Ký xong không gỡ được từ giao diện. Không có nút huỷ ký, và sẽ không có — một chữ ký đã
            sang tay kế toán và sang tay khách thì gỡ nó phải là một đề nghị có người duyệt.
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
            <MetaPill mono>đơn đang ghi {billions(toDong(op.amount, op.currency))}</MetaPill>
          )}
        </div>
      </div>
    </Drawer>
  )
}
