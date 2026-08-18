import type { ReactNode } from 'react'
import { cn } from '@/lib/cn'

/** Nền màn — ĐÚNG 4 lớp, không có lớp thứ 5 (luật 12 · CLAUDE.md):
 *  quầng aurora → lưới 32px → lưới 160px → hạt nhiễu.
 *  Hai lớp hạt phủ trên cùng (overlay + soft-light) là phần "sần" của mặt kính,
 *  vẫn thuộc lớp 4 chứ không phải lớp mới.
 *  Chỉ đặt ở KHUNG NGOÀI CÙNG của mỗi màn, mọi lớp đều pointer-events:none. */

type Blob = {
  size: number
  /** vị trí theo mép khung */
  top: string
  left?: string
  right?: string
  tone: 'azure' | 'azure-soft' | 'blue'
  /** 14–26s */
  duration: number
  reverse?: boolean
}

/** Năm quầng của theme kit, trải dọc trang để blur luôn có gì để làm mờ. */
const BLOBS: Blob[] = [
  { size: 720, top: '-240px', right: '-120px', tone: 'azure', duration: 14 },
  { size: 560, top: '6%', left: '-160px', tone: 'blue', duration: 18, reverse: true },
  { size: 640, top: '28%', left: '24%', tone: 'azure-soft', duration: 22 },
  { size: 600, top: '50%', right: '-140px', tone: 'blue', duration: 26, reverse: true },
  { size: 680, top: '72%', left: '-180px', tone: 'azure-soft', duration: 20 },
]

const toneVar: Record<Blob['tone'], string> = {
  azure: 'var(--aurora-azure)',
  'azure-soft': 'var(--aurora-azure-soft)',
  blue: 'var(--aurora-blue)',
}

export function AuroraField({
  children,
  className,
}: {
  children: ReactNode
  className?: string
}) {
  return (
    <div className={cn('aurora-field relative min-h-screen overflow-hidden', className)}>
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
            animationDuration: `${blob.duration}s`,
            animationDirection: blob.reverse ? 'alternate-reverse' : 'alternate',
          }}
        />
      ))}
      {/* 2 · lưới 32px */}
      <div className="aurora-grid-fine" />
      {/* 3 · lưới 160px */}
      <div className="aurora-grid-major" />
      <div className="aurora-vignette" />
      {/* 4 · hạt nhiễu */}
      <div className="aurora-noise" />

      {children}

      <div className="aurora-grain-overlay z-[3]" />
      <div className="aurora-grain-soft z-[3]" />
    </div>
  )
}
