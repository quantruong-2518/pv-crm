import type { ReactNode } from 'react'
import { cn } from '../lib/cn'

/** Nền màn — ĐÚNG 4 lớp, không có lớp thứ 5 (luật 12 · docs/luat-thiet-ke.md):
 *  quầng aurora (2 blob blur 90px) → lưới 32px → lưới 160px → hạt nhiễu.
 *  Chỉ đặt ở KHUNG NGOÀI CÙNG của mỗi màn, mọi lớp đều pointer-events:none.
 *
 *  Nền này TĨNH — xem lý do ở `.aurora-blob` trong packages/tokens/globals.css.
 *
 *  **`overflow-clip` chứ không `overflow-hidden`.** Hai cái cắt giống hệt nhau —
 *  quầng blur 90px tràn mép vẫn bị xén như cũ — nhưng `hidden` đẻ ra một hộp
 *  cuộn, và một hộp cuộn ở khung NGOÀI CÙNG thì mọi `position: sticky` bên
 *  trong màn neo vào hộp đó thay vì vào cửa sổ, tức là không bao giờ dính. Thanh
 *  liên hệ + next action ở đáy màn hồ sơ lead là chỗ đầu tiên vấp phải.
 *  `overflow: clip` cắt mà không tạo hộp cuộn. */

type Blob = {
  size: number
  /** vị trí theo mép khung */
  top: string
  left?: string
  right?: string
  tone: 'azure' | 'blue'
}

/** Đúng hai quầng, theo nguyên văn luật 12. Bản trước dựng năm quầng — vừa
 *  quá số luật cho, vừa nhân năm lần chi phí raster của blur 90px. */
const BLOBS: Blob[] = [
  { size: 720, top: '-240px', right: '-120px', tone: 'azure' },
  { size: 640, top: '38%', left: '-160px', tone: 'blue' },
]

const toneVar: Record<Blob['tone'], string> = {
  azure: 'var(--aurora-azure)',
  blue: 'var(--aurora-blue)',
}

export function AuroraField({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn('aurora-field relative min-h-screen overflow-clip', className)}>
      {/* 1 · quầng aurora */}
      {BLOBS.map((blob, i) => (
        <div
          key={i}
          className="aurora-blob"
          style={{
            width: blob.size,
            height: blob.size,
            top: blob.top,
            left: blob.left,
            right: blob.right,
            background: toneVar[blob.tone],
          }}
        />
      ))}
      {/* 2 · lưới 32px */}
      <div className="aurora-grid-fine" />
      {/* 3 · lưới 160px */}
      <div className="aurora-grid-major" />
      {/* 4 · hạt nhiễu.
          KHÔNG có lớp thứ 5. `.aurora-vignette` đứng ở đây tới 20/08 — cùng
          loại vi phạm với hai lớp hạt phủ đã bỏ ở globals.css, chỉ là bị sót
          lại. Luật 12 đếm đúng bốn lớp và không có chỗ cho một lớp làm tối
          đáy màn. */}
      <div className="aurora-noise" />

      {children}
    </div>
  )
}
