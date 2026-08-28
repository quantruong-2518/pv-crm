import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { FileSpreadsheet, FileUp, TriangleAlert } from '../icons'
import { Button } from '../ui/button'
import { Icon } from '../ui/icon'
import { cn } from '../lib/cn'

/** M-13 · FileDrop — nhận MỘT tệp, bằng SÁU đường.
 *
 *  ------------------------------------------------------------------
 *  KÉO-THẢ LÀ ĐƯỜNG NHANH NHẤT, KHÔNG PHẢI ĐƯỜNG DUY NHẤT
 *  ------------------------------------------------------------------
 *  Một vùng chỉ nhận kéo-thả là một vùng chết với: người dùng bàn phím, người
 *  dùng trình đọc màn hình, iPad không có cửa sổ thứ hai để kéo từ đó sang, và
 *  người đang mở đúng cái bảng trong Excel mà chưa lưu ra tệp. Bốn nhóm đó
 *  không phải trường hợp hiếm — cộng lại họ là phần lớn người dùng thật.
 *
 *  Sáu đường, xếp theo thứ tự người ta hay dùng:
 *   1 · kéo tệp thả vào vùng;
 *   2 · bấm vào vùng — cả tấm là chỗ bấm được, không phải mỗi cái nút;
 *   3 · nút "Chọn tệp" — nút THẬT, tab tới được, Enter mở hộp chọn;
 *   4 · dán (Ctrl+V) một mảng ô copy thẳng từ Excel — đường thoát cho người
 *       không muốn lưu tệp; bật khi có `onPasteText`;
 *   5 · `hint` — chỗ để chủ màn treo link tải tệp mẫu về điền;
 *   6 · trình duyệt không có kéo-thả thì bốn đường trên vẫn nguyên.
 *
 *  ------------------------------------------------------------------
 *  DẢI CHẤM KHÔNG PHẢI BOX BORDER — LUẬT 4
 *  ------------------------------------------------------------------
 *  Mép chấm người dùng yêu cầu được vẽ bằng bốn dải radial-gradient trong
 *  `.drop-dots`, không dùng `border`. Vì vậy vùng vẫn borderless; lúc kéo vào,
 *  mặt đổi sang azure của `.glass-ai` còn dải chấm vẫn đứng yên làm mốc thả.
 *
 *  ------------------------------------------------------------------
 *  LỖI HIỆN TRONG KHUNG, KHÔNG BẮN TOAST
 *  ------------------------------------------------------------------
 *  Thả nhầm tệp là lỗi của thao tác VỪA XONG, và chỗ sửa nó nằm ngay đây. Toast
 *  bay ở góc màn bắt mắt đi tìm rồi bắt quay lại — mà lúc quay lại thì vùng thả
 *  vẫn trống trơn không nói gì. Toast để dành cho việc đã CHẠY XONG (nạp xong
 *  412 dòng), không phải cho việc chưa bắt đầu được.
 *
 *  Component KHÔNG đọc tệp: nó kiểm đuôi, kiểm cỡ, kiểm số tệp rồi trả `File`
 *  cho chủ màn. Đọc là việc của tầng biết định dạng. */
export type FileDropProps = {
  /** Đuôi tệp nhận, có dấu chấm: `['.csv', '.xlsx']`. Cũng là chuỗi `accept`
   *  của ô chọn tệp, nên hộp chọn của hệ điều hành lọc sẵn. */
  accept: readonly string[]
  /** Trần dung lượng, byte. Bắt buộc — không có trần thì một tệp 2 GB thả vào
   *  sẽ làm treo tab trước khi bất kỳ dòng nào được đọc. */
  maxBytes: number
  /** Tệp đã qua ba lần kiểm. Chủ màn nhận rồi tự đọc. */
  onPick: (file: File) => void
  /** Có mặt thì bật đường dán: Ctrl+V một mảng ô từ Excel, chuỗi TSV rơi vào
   *  đây. Bỏ trống thì không hiện lối dán — đừng quảng cáo đường mình không mở. */
  onPasteText?: (text: string) => void
  /** Lỗi của chủ màn (đọc hỏng, thiếu cột) — hiện cùng chỗ với lỗi của chính
   *  component để người dùng chỉ phải nhìn MỘT chỗ. */
  error?: string
  /** Câu dưới nút — chỗ treo link tải tệp mẫu. Bấm vào đây KHÔNG mở hộp chọn. */
  hint?: ReactNode
  /** Đang đọc: khoá cả sáu đường. Thả tệp thứ hai đè lên tệp đang đọc dở là
   *  cách nhanh nhất để hai bộ kết quả trộn vào nhau. */
  busy?: boolean
  /** Tên tệp đã nhận — vùng thả đổi mặt để nói "đang giữ cái này". */
  fileName?: string
  className?: string
}

/** Đuôi tệp, viết thường, có dấu chấm. Rỗng nếu tên không có đuôi. */
function extensionOf(name: string): string {
  const dot = name.lastIndexOf('.')
  return dot < 0 ? '' : name.slice(dot).toLowerCase()
}

/** Cỡ tệp cho người đọc. Không dùng `toLocaleString` với đơn vị vì hai máy
 *  khác locale sẽ in hai chuỗi khác nhau cho cùng một tệp. */
function sizeText(bytes: number): string {
  const mb = bytes / 1_048_576
  return mb >= 1
    ? `${mb.toFixed(1).replace('.', ',')} MB`
    : `${Math.max(1, Math.round(bytes / 1024))} KB`
}

export function FileDrop({
  accept,
  maxBytes,
  onPick,
  onPasteText,
  error,
  hint,
  busy = false,
  fileName,
  className,
}: FileDropProps) {
  const input = useRef<HTMLInputElement>(null)
  const [over, setOver] = useState(false)
  const [own, setOwn] = useState<string>()
  const describedBy = useId()

  /* Đếm dragenter/dragleave chứ không bật-tắt theo từng sự kiện: con trỏ đi qua
     một phần tử con bắn `dragleave` của cha, nên bật-tắt thẳng sẽ làm cả tấm
     nhấp nháy suốt lúc kéo. Đếm vào trừ ra thì chỉ về 0 khi con trỏ rời hẳn. */
  const depth = useRef(0)

  const shown = error ?? own

  /** Ba lần kiểm, theo thứ tự rẻ tới đắt. Trả `true` nếu tệp đi tiếp được. */
  const take = (files: FileList | null) => {
    setOwn(undefined)
    if (!files || files.length === 0) return

    if (files.length > 1) {
      setOwn(`Thả ${files.length} tệp cùng lúc — mỗi lần một tệp thôi.`)
      return
    }

    const file = files[0]!
    const ext = extensionOf(file.name)
    if (!accept.includes(ext)) {
      setOwn(
        ext === ''
          ? `Tệp "${file.name}" không có đuôi. Cần ${accept.join(' · ')}.`
          : `Không nhận ${ext}. Cần ${accept.join(' · ')}.`,
      )
      return
    }

    if (file.size === 0) {
      setOwn(`Tệp "${file.name}" rỗng — 0 byte.`)
      return
    }

    if (file.size > maxBytes) {
      setOwn(`Tệp nặng ${sizeText(file.size)}, trần là ${sizeText(maxBytes)}.`)
      return
    }

    onPick(file)
  }

  const openPicker = () => {
    if (busy) return
    /* Xoá giá trị cũ trước khi mở: chọn LẠI đúng tệp vừa chọn thì `change`
       không bắn (giá trị không đổi), và người dùng ngồi chờ một màn hình không
       bao giờ động đậy. */
    if (input.current) input.current.value = ''
    input.current?.click()
  }

  /* Dán nghe ở `document` chứ không ở phần tử này: người dùng bấm Ctrl+V ngay
     khi panel vừa mở, lúc đó tiêu điểm còn nằm ở nút đóng của panel. Bắt người
     ta bấm vào đúng ô trước khi dán được là dựng lại chính cái rào mình vừa gỡ.

     Bỏ qua khi tiêu điểm đang ở một ô nhập: ở đó Ctrl+V là dán chữ vào ô, và
     cướp phím tắt đó là lỗi tệ hơn thiếu tính năng. */
  /* `take` dựng lại mỗi lượt vẽ nên không kê được vào mảng phụ thuộc — kê vào
     thì listener gỡ ra gắn lại sau từng phím gõ. Giữ bản mới nhất trong một ref
     để listener gắn ĐÚNG MỘT LẦN mà vẫn không bao giờ gọi bản cũ. */
  const latest = useRef({ take, onPasteText })
  latest.current = { take, onPasteText }

  useEffect(() => {
    if (!onPasteText || busy) return

    const onPaste = (e: ClipboardEvent) => {
      const target = e.target as HTMLElement | null
      if (target?.closest('input, textarea, [contenteditable="true"]')) return

      const clip = e.clipboardData
      if (!clip) return

      /* Tệp trong khay dán (chụp màn hình, copy tệp ở Explorer) đi đường tệp,
         không đi đường chữ. */
      if (clip.files.length > 0) {
        e.preventDefault()
        latest.current.take(clip.files)
        return
      }

      const text = clip.getData('text/plain')
      if (text.trim() === '') return
      e.preventDefault()
      setOwn(undefined)
      latest.current.onPasteText?.(text)
    }

    document.addEventListener('paste', onPaste)
    return () => document.removeEventListener('paste', onPaste)
  }, [onPasteText, busy])

  return (
    <div className={className}>
      <div
        onDragEnter={(e) => {
          e.preventDefault()
          if (busy) return
          depth.current += 1
          setOver(true)
        }}
        onDragOver={(e) => {
          /* Không chặn `dragover` thì trình duyệt tự mở tệp trong tab và cả
             trang biến mất. Đây là mặc định của web, không phải lỗi hiếm. */
          e.preventDefault()
          if (!busy) e.dataTransfer.dropEffect = 'copy'
        }}
        onDragLeave={() => {
          depth.current = Math.max(0, depth.current - 1)
          if (depth.current === 0) setOver(false)
        }}
        onDrop={(e) => {
          e.preventDefault()
          depth.current = 0
          setOver(false)
          if (busy) return
          take(e.dataTransfer.files)
        }}
        onClick={openPicker}
        className={cn(
          'drop-dots motion-std relative flex flex-col items-center gap-4 rounded-lg px-4 py-8 text-center',
          busy ? 'cursor-progress bg-white/[3%]' : 'cursor-pointer',
          !busy && over && 'glass-ai',
          !busy && !over && (fileName ? 'bg-primary/12' : 'hover:bg-white/8 bg-white/[4.5%]'),
        )}
      >
        <Icon
          icon={fileName ? FileSpreadsheet : FileUp}
          size={64}
          strokeWidth={over ? 1.9 : 1.75}
          className={
            over || fileName
              ? 'text-accent-foreground opacity-80'
              : 'text-muted-foreground opacity-60'
          }
        />

        <div className="flex flex-col gap-2">
          <p className="text-[13px] font-semibold">
            {busy
              ? 'Đang đọc tệp…'
              : over
                ? 'Thả ra là nhận'
                : fileName
                  ? fileName
                  : 'Kéo và thả tệp dữ liệu vào đây'}
          </p>
          <p id={describedBy} className="text-muted-foreground text-[11.5px]">
            {accept.join(' · ')} · tối đa {sizeText(maxBytes)}
            {onPasteText && ' · hoặc Ctrl+V dán từ Excel'}
          </p>
        </div>

        <input
          ref={input}
          type="file"
          accept={accept.join(',')}
          aria-describedby={describedBy}
          onChange={(e) => take(e.target.files)}
          className="hidden"
        />

        <Button
          type="button"
          variant="ghost"
          size="md"
          disabled={busy}
          onClick={(e) => {
            /* Nút nằm TRONG tấm bấm được: không chặn thì một cú bấm mở hộp chọn
               hai lần, và trình duyệt bỏ qua lần thứ hai một cách im lặng. */
            e.stopPropagation()
            openPicker()
          }}
        >
          {fileName ? 'Chọn tệp khác' : 'Chọn tệp từ máy'}
        </Button>

        {hint && (
          /* Bấm vào đây là bấm vào link tải tệp mẫu, không phải bấm mở hộp
             chọn tệp — hai việc khác nhau trên cùng một tấm. */
          <div
            onClick={(e) => e.stopPropagation()}
            className="text-muted-foreground text-[11.5px] leading-[1.7]"
          >
            {hint}
          </div>
        )}
      </div>

      {shown && (
        <p
          role="alert"
          className="text-destructive-foreground mt-3 flex items-start gap-2 text-[11.5px] leading-[1.7]"
        >
          <Icon icon={TriangleAlert} size={14} className="mt-1" />
          {shown}
        </p>
      )}
    </div>
  )
}
