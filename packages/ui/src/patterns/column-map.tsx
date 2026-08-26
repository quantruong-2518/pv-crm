import { TriangleAlert } from 'lucide-react'
import { Icon } from '../ui/icon'
import { Select } from '../ui/select'
import { cn } from '../lib/cn'

/** M-15 · ColumnMap — bảng khớp cột, hai cột.
 *
 *  Trái là cột NHƯ NÓ NẰM TRONG FILE của người dùng, kèm ba giá trị mẫu thật —
 *  không có ba giá trị đó thì người khớp phải đoán "Company" là tên pháp nhân
 *  hay tên người liên hệ. Phải là ô đích của hệ, chọn bằng `<Select>` gốc (A-15):
 *  bàn phím, chạm, tìm theo chữ cái đã có sẵn.
 *
 *  LUẬT CỦA COMPONENT:
 *   · Danh mục ô đích do MÀN truyền vào (`targets`). @pv/ui không biết 15 cột
 *     chuẩn của module nào — biết là biết engine, mà thư viện thì không được biết.
 *   · "Chưa chọn" KHÁC "Bỏ qua cột này". Ô rỗng là chưa ai quyết; bỏ qua là một
 *     lựa chọn đã quyết. Vì vậy mục "Bỏ qua" là một dòng trong `targets` do màn
 *     truyền, còn dòng rỗng do component tự chèn và mang `value === ''`.
 *   · Component KHÔNG tự khớp gì cả, và không chứa khối AI. Đề nghị ánh xạ cả bộ
 *     là một khối `AiAction` (M-09) do màn đặt PHÍA TRÊN bảng — ở đó `basis` và
 *     nút xác nhận đã bị cưỡng chế ở tầng kiểu (luật 9). Bảng này mở ra ở trạng
 *     thái chưa ánh xạ gì và chỉ đổi khi có người bấm.
 *   · Bảng nằm trên `.glass-b`, component không tự vẽ mặt kính — khối cha phải là
 *     `<GlassCard variant="b">` (luật 8), cùng hợp đồng với DataTable (M-07). */
export type ColumnMapTarget = {
  value: string
  label: string
}

export type ColumnMapRow = {
  /** tên cột đúng như trong hàng tiêu đề của file */
  source: string
  /** ba giá trị mẫu thật, lấy từ ba dòng đầu */
  samples: string[]
  /** ô đích đang chọn; `''` là chưa ai chọn */
  value: string
  /** cảnh báo của riêng dòng — không chặn, ví dụ 0/3 mẫu không có "@" */
  warning?: string
  /** lỗi của riêng dòng — chặn, ví dụ hai cột cùng trỏ một ô đích */
  error?: string
}

export type ColumnMapProps = {
  rows: ColumnMapRow[]
  /** danh mục ô đích của hệ, kể cả mục "Bỏ qua cột này" */
  targets: ColumnMapTarget[]
  onChange: (source: string, value: string) => void
  /** nhãn của dòng rỗng trong Select */
  placeholder?: string
  className?: string
}

export function ColumnMap({
  rows,
  targets,
  onChange,
  placeholder = 'Chưa chọn ô đích',
  className,
}: ColumnMapProps) {
  const options = [{ value: '', label: placeholder }, ...targets]

  return (
    <div className={className} role="table">
      <div
        role="row"
        className="border-b-white/6 text-muted-foreground grid grid-cols-2 gap-4 border-b pb-2 text-[11px]"
      >
        <span role="columnheader">Cột trong file</span>
        <span role="columnheader">Ô đích trong hệ</span>
      </div>

      {rows.map((row, i) => (
        <div
          key={row.source}
          role="row"
          className={cn(
            'grid grid-cols-2 items-center gap-4 py-3',
            i < rows.length - 1 && 'border-b-white/6 border-b',
            row.error && 'bg-destructive/13',
          )}
        >
          <span role="cell" className="flex min-w-0 flex-col gap-1">
            <span className="truncate font-mono text-[12.5px]">{row.source}</span>
            {/* Ba mẫu là BẰNG CHỨNG, không phải trang trí: người khớp đọc chúng
                rồi mới chọn. Ô trống trong file hiện thành "—" chứ không biến
                mất — biến mất thì đọc ra như file chỉ có hai mẫu. */}
            <span className="text-muted-foreground truncate text-[11px] leading-[1.5]">
              {row.samples.map((s) => (s.trim() === '' ? '—' : s)).join(' · ')}
            </span>
          </span>

          <span role="cell" className="flex min-w-0 flex-col gap-1">
            <Select
              label={`Ô đích cho cột ${row.source}`}
              hideLabel
              value={row.value}
              neutralValue=""
              options={options}
              onChange={(value) => onChange(row.source, value)}
            />
            {row.error ? (
              <span
                className="text-destructive-foreground flex items-center gap-1 text-[11px] leading-[1.5]"
                role="alert"
              >
                <Icon icon={TriangleAlert} size={14} />
                {row.error}
              </span>
            ) : (
              row.warning && (
                <span className="text-warning flex items-center gap-1 text-[11px] leading-[1.5]">
                  <Icon icon={TriangleAlert} size={14} />
                  {row.warning}
                </span>
              )
            )}
          </span>
        </div>
      ))}
    </div>
  )
}
