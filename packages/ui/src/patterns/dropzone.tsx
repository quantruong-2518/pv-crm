import { useState, type DragEvent } from 'react'
import { FileText, TriangleAlert, Upload } from 'lucide-react'
import { Button, buttonVariants } from '../ui/button'
import { Icon } from '../ui/icon'
import { cn } from '../lib/cn'

/** M-14 · Dropzone — vùng thả một file, cho luồng nhập danh sách.
 *
 *  POC KHÔNG upload. Component chỉ đưa `File` ra cho màn; màn tự đọc bằng
 *  FileReader ở phía trình duyệt. Không có tiến trình phần trăm, không có huỷ
 *  giữa chừng — vì không có gì đang chạy để huỷ.
 *
 *  Bốn trạng thái, đọc được bằng mắt và không chồng lên nhau:
 *   · trống  — chưa có file, chờ thả hoặc bấm chọn
 *   · đang kéo vào — con trỏ đang giữ file trên vùng (`over`, tự giữ trong
 *     component vì nó là chuyện của con trỏ chứ không phải của màn)
 *   · đã có file — hiện tên file + một dòng meta (dung lượng · số dòng · dấu
 *     phân tách hệ đã tự nhận). Meta do MÀN tính, ở đây chỉ hiện.
 *   · lỗi — có `error` thì lỗi thắng mọi trạng thái khác, vì một file sai
 *     định dạng vẫn là một file đã chọn, và cái người dùng cần đọc là câu lỗi.
 *
 *  Ô nhập file thật nằm trong `<label>` và `sr-only` — bàn phím và trình đọc
 *  màn hình vào được bằng đúng control gốc, không phải một `<div>` giả nút.
 *  Nút "Chọn file" cao 48px (size lg) — ngưỡng chạm tablet, luật 13. */
export type DropzoneProps = {
  /** danh sách phần mở rộng nhận, đi thẳng vào `accept` của input — ".csv,.txt" */
  accept?: string
  /** tên file đang giữ. Có tên = đã có file. */
  fileName?: string
  /** dòng dưới tên file: "148 KB · 1.254 dòng · dấu phân tách: chấm phẩy" */
  fileMeta?: string
  /** câu lỗi. Có lỗi thì vùng chuyển sang trạng thái lỗi và nói ra lý do. */
  error?: string
  /** một câu hướng dẫn cho trạng thái trống */
  hint?: string
  /** người dùng thả hoặc chọn một file */
  onFile: (file: File) => void
  /** bỏ file đang giữ. Không truyền thì không hiện nút bỏ. */
  onClear?: () => void
  className?: string
}

export function Dropzone({
  accept,
  fileName,
  fileMeta,
  error,
  hint = 'Kéo file vào đây, hoặc bấm để chọn.',
  onFile,
  onClear,
  className,
}: DropzoneProps) {
  const [over, setOver] = useState(false)

  const hold = (event: DragEvent<HTMLElement>, next: boolean) => {
    event.preventDefault()
    setOver(next)
  }

  const drop = (event: DragEvent<HTMLElement>) => {
    event.preventDefault()
    setOver(false)
    const file = event.dataTransfer.files.item(0)
    if (file) onFile(file)
  }

  const state = error ? 'error' : over ? 'over' : fileName ? 'ready' : 'idle'

  return (
    <div className={className}>
      <label
        onDragOver={(e) => hold(e, true)}
        onDragEnter={(e) => hold(e, true)}
        onDragLeave={(e) => hold(e, false)}
        onDrop={drop}
        className={cn(
          'motion-std flex min-h-[148px] cursor-pointer flex-col items-center justify-center gap-3 rounded-md px-4 py-6 text-center',
          state === 'idle' && 'hover:bg-white/8 bg-white/5',
          state === 'over' &&
            'bg-primary/16 shadow-[0_0_0_2px_color-mix(in_srgb,var(--primary)_55%,transparent)]',
          state === 'ready' && 'bg-success/13',
          state === 'error' &&
            'bg-destructive/13 shadow-[0_0_0_2px_color-mix(in_srgb,var(--destructive)_50%,transparent)]',
          'focus-within:shadow-[0_0_0_2px_color-mix(in_srgb,var(--ring)_55%,transparent)]',
        )}
      >
        <input
          type="file"
          accept={accept}
          className="sr-only"
          onChange={(e) => {
            const file = e.target.files?.item(0)
            if (file) onFile(file)
            // Cho phép chọn LẠI đúng file vừa chọn: nếu không xoá value thì
            // trình duyệt coi lần chọn thứ hai là "không đổi" và không báo gì.
            e.target.value = ''
          }}
        />

        <Icon
          icon={state === 'error' ? TriangleAlert : fileName ? FileText : Upload}
          size={26}
          className={cn(
            state === 'error' && 'text-destructive-foreground',
            state === 'ready' && 'text-success',
            (state === 'idle' || state === 'over') && 'text-muted-foreground',
          )}
        />

        {/* Chữ phụ ở đây dùng `--glass-foreground`, KHÔNG dùng màu chữ phụ
            thường — cùng lý do đã ghi ở rich-text.tsx: mặt nào của vùng thả
            cũng là một nền ĐÃ NHUỘM nằm trong GlassCard glass-a, nên nền hiệu
            dụng sáng hơn mặt kính trần và #93A1B8 tụt xuống dưới 4,5:1 (luật
            13). Đo trên glass-a ở đáy gradient `.aurora-field` (#16233F), cùng
            cách đo của globals.css:

                                    #93A1B8   #B4BECD
              idle  bg-white/5        3,98      5,54
              over  bg-primary/16     4,09      5,70
              ready bg-success/13     3,82      5,32
              error bg-destructive/13 4,46      6,21

            Cả bốn trạng thái đều trượt với màu chữ phụ, nên đổi cả hai dòng
            chứ không chỉ dòng meta — bốn mặt của một component nói cùng một
            giọng. Không cần token mới. */}
        {fileName ? (
          <div className="flex flex-col gap-1">
            <span className="text-[13px] font-semibold">{fileName}</span>
            {fileMeta && (
              <span className="text-glass-foreground tnum text-[11.5px] leading-[1.5]">
                {fileMeta}
              </span>
            )}
          </div>
        ) : (
          <p className="text-glass-foreground text-pretty text-[12.5px] leading-[1.65]">
            {state === 'over' ? 'Thả file ra là hệ đọc.' : hint}
          </p>
        )}

        {/* Cố ý KHÔNG phải <button>: một nút thật nằm trong <label> nuốt mất
            cú bấm — trình duyệt bỏ qua việc kích hoạt control được gán nhãn khi
            đích bấm tự nó đã tương tác được, nên hộp chọn file sẽ không mở.
            Control thật là chính <input> ở trên; đây là mặt nút của nó, cao 48px
            cho ngưỡng chạm tablet (luật 13). */}
        <span
          aria-hidden
          className={cn(buttonVariants({ size: 'lg', variant: fileName ? 'ghost' : 'default' }))}
        >
          {fileName ? 'Chọn file khác' : 'Chọn file'}
        </span>
      </label>

      {error && (
        <p className="text-destructive-foreground mt-3 text-[11.5px] leading-[1.5]" role="alert">
          {error}
        </p>
      )}

      {fileName && onClear && (
        <div className="mt-3">
          <Button
            size="sm"
            variant="ghost"
            onClick={onClear}
            aria-label={`Bỏ file ${fileName}`}
            type="button"
          >
            Bỏ file này
          </Button>
        </div>
      )}
    </div>
  )
}
