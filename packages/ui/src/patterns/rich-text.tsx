import * as React from 'react'
import type { LucideIcon } from 'lucide-react'
import { Bold, Code, ImagePlus, Italic, List } from 'lucide-react'
import { Icon } from '../ui/icon'
import { cn } from '../lib/cn'

/** M-11 · RichText — trình soạn nội dung, mức POC.
 *
 *  DỰNG BẰNG `contentEditable` + `document.execCommand`. `execCommand` đã bị
 *  đánh dấu deprecated nhưng vẫn chạy ở mọi trình duyệt hiện hành, và nó là cách
 *  DUY NHẤT có định dạng cơ bản mà không kéo thêm dependency — quyết định đã
 *  chốt cho giai đoạn POC. Đây là chỗ để thay bằng editor thật (Lexical /
 *  TipTap) khi nội dung đợt cần bảng, nhúng, hoặc lịch sử sửa: đổi ruột file
 *  này, giữ nguyên hợp đồng props, màn không phải sửa.
 *
 *  Con trỏ nhảy: React không sở hữu phần bên trong ô soạn. Nếu cứ mỗi lần
 *  `value` đổi mà ghi đè `innerHTML` thì mỗi ký tự gõ vào sẽ đẩy caret về đầu.
 *  Vì vậy chỉ đồng bộ khi ô KHÔNG focus và HTML bên trong thật sự khác `value`. */
export type RichTextProps = {
  /** HTML */
  value: string
  onChange: (html: string) => void
  /** nhãn cho aria-label — BẮT BUỘC, khối soạn không nhãn là khối câm */
  label: string
  placeholder?: string
  /** px, mặc định 120 */
  minHeight?: number
  className?: string
}

function ToolButton({
  icon,
  label,
  active,
  disabled,
  onClick,
}: {
  icon: LucideIcon
  label: string
  active?: boolean
  disabled?: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={active}
      disabled={disabled}
      // Giữ vùng chọn trong ô soạn: mousedown mặc định sẽ lấy focus khỏi nó,
      // và execCommand không còn biết phải tô đậm đoạn nào.
      onMouseDown={(event) => event.preventDefault()}
      onClick={onClick}
      className={cn(
        'motion-std flex size-8 items-center justify-center rounded-md',
        disabled && 'text-muted-foreground cursor-not-allowed opacity-55',
        !disabled && active && 'bg-primary/24 text-accent-foreground',
        !disabled && !active && 'text-muted-foreground hover:text-foreground hover:bg-white/9',
      )}
    >
      <Icon icon={icon} size={16} />
    </button>
  )
}

/** Kiểu của thứ NGƯỜI DÙNG gõ vào, không phải của khung soạn.
 *
 *  Preflight của Tailwind gỡ chấm của `ul` và số của `ol`, và ảnh dán vào thì
 *  giữ nguyên kích thước gốc. Trong một trang bình thường đó là điều đúng — ở
 *  đây thì không: bấm "gạch đầu dòng" mà không thấy chấm nào đọc thành "nút
 *  hỏng", còn một ảnh chụp màn hình 2000px chèn vào sẽ xé toạc thẻ đợt.
 *
 *  Dùng chung cho cả ô soạn và mọi chỗ vẽ lại nội dung đã soạn — hai nơi lệch
 *  nhau thì bản xem trước không còn là thứ người ta vừa gõ. */
const CONTENT_STYLE =
  '[&_ul]:list-disc [&_ol]:list-decimal [&_ul]:pl-5 [&_ol]:pl-5 [&_li]:mt-1 [&_img]:my-2 [&_img]:max-w-full [&_img]:rounded-md [&_a]:underline [&_b]:font-semibold [&_strong]:font-semibold'

/** Rỗng thật sự = không chữ và không thẻ tự đóng mang nội dung (ảnh, kẻ ngang). */
const isBlank = (html: string) =>
  html.replace(/<[^>]*>/g, '').trim() === '' && !/<(img|hr|iframe)\b/i.test(html)

export function RichText({
  value,
  onChange,
  label,
  placeholder,
  minHeight = 120,
  className,
}: RichTextProps) {
  const bodyRef = React.useRef<HTMLDivElement>(null)
  const fileRef = React.useRef<HTMLInputElement>(null)
  const [source, setSource] = React.useState(false)

  React.useEffect(() => {
    const el = bodyRef.current
    if (!el || source) return
    if (document.activeElement === el) return
    if (el.innerHTML !== value) el.innerHTML = value
  }, [value, source])

  const emit = () => onChange(bodyRef.current?.innerHTML ?? '')

  const exec = (command: string, arg?: string) => {
    bodyRef.current?.focus()
    document.execCommand(command, false, arg)
    emit()
  }

  const pickImage = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    // Cho phép chọn lại đúng file vừa chọn — input file không bắn change nếu
    // giá trị không đổi.
    event.target.value = ''
    if (!file) return
    const reader = new FileReader()
    // POC: ảnh nằm ngay trong HTML dưới dạng data URL. Có backend thì đổi thành
    // upload rồi chèn URL thật — nội dung đợt không nên mang cả file trong nó.
    reader.onload = () => exec('insertImage', String(reader.result))
    reader.readAsDataURL(file)
  }

  return (
    <div className={cn('flex flex-col gap-2', className)}>
      <div className="flex items-center gap-1">
        <ToolButton icon={Bold} label="Đậm" disabled={source} onClick={() => exec('bold')} />
        <ToolButton
          icon={Italic}
          label="Nghiêng"
          disabled={source}
          onClick={() => exec('italic')}
        />
        <ToolButton
          icon={List}
          label="Gạch đầu dòng"
          disabled={source}
          onClick={() => exec('insertUnorderedList')}
        />
        <ToolButton
          icon={ImagePlus}
          label="Chèn ảnh"
          disabled={source}
          onClick={() => fileRef.current?.click()}
        />
        <ToolButton
          icon={Code}
          label="Xem và sửa HTML"
          active={source}
          onClick={() => setSource((on) => !on)}
        />
        <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={pickImage} />
      </div>

      {source ? (
        <textarea
          aria-label={`${label} — HTML thô`}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          style={{ minHeight }}
          className="bg-input text-glass-foreground w-full rounded-md p-3 font-mono text-[12.5px] leading-[1.7] outline-none focus-visible:shadow-[0_0_0_2px_color-mix(in_srgb,var(--ring)_55%,transparent)]"
        />
      ) : (
        <div className="relative">
          {placeholder && isBlank(value) && (
            <span className="text-muted-foreground pointer-events-none absolute left-3 top-3 text-[12.5px] leading-[1.7]">
              {placeholder}
            </span>
          )}
          <div
            ref={bodyRef}
            role="textbox"
            aria-label={label}
            aria-multiline
            contentEditable
            suppressContentEditableWarning
            onInput={emit}
            onBlur={emit}
            style={{ minHeight }}
            className={cn(
              'bg-input text-glass-foreground rounded-md p-3 text-[12.5px] leading-[1.7] outline-none focus-visible:shadow-[0_0_0_2px_color-mix(in_srgb,var(--ring)_55%,transparent)]',
              CONTENT_STYLE,
            )}
          />
        </div>
      )}
    </div>
  )
}

/** Bản CHỈ ĐỌC của cùng nội dung — dùng ở chỗ xem lại đợt đã soạn.
 *
 *  Dùng chung `CONTENT_STYLE` với ô soạn, nên thứ người ta thấy sau khi lưu
 *  đúng bằng thứ họ vừa gõ.
 *
 *  `dangerouslySetInnerHTML` ở đây là HTML do CHÍNH người dùng của màn soạn ra
 *  và chưa rời máy họ (POC, không có backend). Khi nội dung đi qua máy chủ và
 *  quay về, chỗ này phải lọc trước khi vẽ — làm sạch ở tầng nhận, đừng tin vào
 *  một chuỗi HTML lạ. */
export function RichTextView({ html, className }: { html: string; className?: string }) {
  if (isBlank(html)) return null
  return (
    <div
      className={cn('text-glass-foreground text-[12px] leading-[1.7]', CONTENT_STYLE, className)}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  )
}
