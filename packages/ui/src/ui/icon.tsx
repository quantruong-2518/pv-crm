import { useId } from 'react'
import { HugeiconsIcon } from '@hugeicons/react'
import { cn } from '../lib/cn'
import { AiMark, CrmAgentMark, type IconGlyph } from '../icons'

/** Luật 11 · docs/design-system/laws.md — Hugeicons Stroke Rounded, stroke 1.75,
 *  size 16 trong nút / 20 trong nav. Hai dấu AI là ngoại lệ có mặt màu. */
export type IconProps = {
  icon: IconGlyph
  /** 16 trong nút · 20 trong nav · 24–30 cho AI và empty state · 56 cho
   *  icon CRM Agent nổi trong vùng bấm 56px · 64 chỉ
   *  dành cho watermark trang trí chìm trong nền StatCard
   *  14 chỉ dành cho icon delta nằm cùng dòng với chữ 11.5px trong StatCard,
   *  và ổ khoá của NavItem `locked` — nó đứng chỗ badge số 10.5px, 16 sẽ to hơn badge */
  /* 12 is only for `AiFieldMark`: the AI mark riding a 12px caption line under a field. */
  size?: 12 | 14 | 16 | 17 | 18 | 20 | 24 | 26 | 30 | 52 | 56 | 64
  /** 1.75 mặc định; 1.9 chỉ cho icon nằm trên nền azure đặc (nút quét, khối AI) */
  strokeWidth?: 1.75 | 1.9
  /** Only for the two PV AI marks. Press feedback is handled by the owning button. */
  aiState?: 'idle' | 'loading' | 'done' | 'failed'
  className?: string
}

export function Icon({
  icon,
  size = 16,
  strokeWidth = 1.75,
  aiState = 'idle',
  className,
}: IconProps) {
  if (icon === AiMark || icon === CrmAgentMark) {
    return (
      <AiFamilyIcon
        agent={icon === CrmAgentMark}
        size={size}
        state={aiState}
        className={className}
      />
    )
  }
  return (
    <HugeiconsIcon
      icon={icon}
      size={size}
      strokeWidth={strokeWidth}
      aria-hidden
      className={cn('inline-flex shrink-0', className)}
    />
  )
}

/** CRM Agent keeps the PV open corner; shared AI uses a companion silhouette. */
const AI_FRAME =
  'M18 6h25c8 0 13 5 13 13v17h-8V19c0-3-2-5-5-5H18c-3 0-5 2-5 5v24c0 3 2 5 5 5h20l-7 8H18C10 56 5 51 5 43V19C5 11 10 6 18 6Z'
const AI_COMPANION = 'M31 8C19 8 10 16 10 28v14c0 8 5 13 13 13h16l16-13V28C55 16 45 8 31 8Z'

function AiFamilyIcon({
  agent,
  size,
  state,
  className,
}: {
  agent: boolean
  size: NonNullable<IconProps['size']>
  state: NonNullable<IconProps['aiState']>
  className?: string
}) {
  const gradientId = useId()
  const front = `${gradientId}-front`
  const edge = `${gradientId}-edge`
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 64 64"
      width={size}
      height={size}
      fill="none"
      aria-hidden="true"
      focusable="false"
      data-ai-state={state}
      className={cn('pv-ai-mark inline-flex shrink-0', className)}
    >
      <defs>
        <linearGradient id={front} x1="0" y1="0" x2="1" y2="1">
          <stop stopColor="color-mix(in srgb, var(--primary) 48%, white)" />
          <stop offset=".36" stopColor="var(--primary)" />
          <stop offset="1" stopColor="var(--primary-strong)" />
        </linearGradient>
        <linearGradient id={edge} x1="0" y1="0" x2="1" y2="1">
          <stop stopColor="var(--primary-strong)" />
          <stop offset="1" stopColor="color-mix(in srgb, var(--primary-strong) 78%, black)" />
        </linearGradient>
      </defs>
      {agent ? (
        <>
          <path d={AI_FRAME} transform="translate(2 2)" fill={`url(#${edge})`} />
          <path
            d="M18 14h25a5 5 0 0 1 5 5v17L38 48H18a5 5 0 0 1-5-5V19a5 5 0 0 1 5-5Z"
            fill="var(--primary-foreground)"
          />
          <path d={AI_FRAME} fill={`url(#${front})`} />
          <path
            className="pv-ai-glint"
            d="M5 19C5 11 10 6 18 6h25l-2 3H18c-6 0-10 4-10 10v24l-3 3Z"
            fill="var(--primary-foreground)"
            opacity=".35"
          />
          <path
            d="M38 48l10-12h8L43 53l-5 3h-7Z"
            fill="color-mix(in srgb, var(--primary-strong) 82%, black)"
          />
          <path d="M48 36h8L43 53l-5-5Z" fill="color-mix(in srgb, var(--primary) 68%, white)" />
        </>
      ) : (
        <>
          <path d={AI_COMPANION} transform="translate(2 2)" fill={`url(#${edge})`} />
          <path d={AI_COMPANION} fill={`url(#${front})`} />
          <path
            className="pv-ai-glint"
            d="M14 28c0-9 8-16 17-16 3 0 5 .3 7 1-10 0-17 6-20 15-1 3-1 6-1 9-2-3-3-6-3-9Z"
            fill="var(--primary-foreground)"
            opacity=".32"
          />
          <path
            d="M39 55l16-13V31c0 10-6 19-16 24Z"
            fill="color-mix(in srgb, var(--primary-strong) 82%, black)"
          />
          <path d="M39 55l16-13h-9l-9 10Z" fill="color-mix(in srgb, var(--primary) 68%, white)" />
        </>
      )}
      {agent && state !== 'loading' ? (
        <g className="pv-ai-face">
          <path
            d="M25 28v2m13-2v2"
            stroke="var(--primary-strong)"
            strokeWidth="4"
            strokeLinecap="round"
            className="pv-ai-eyes"
          />
          <path
            d="M24.5 37c3 4 10 4 13 0"
            stroke="var(--primary-strong)"
            strokeWidth="3.5"
            strokeLinecap="round"
          />
        </g>
      ) : null}
      {!agent && state !== 'loading' ? (
        <path
          className="pv-ai-face"
          d="M18 42l7-21h7l7 21h-5.5l-1.3-4.5h-7.4L23.5 42H18Zm8.2-9h4.7l-2.3-7.7-2.4 7.7ZM42 21h5v21h-5V21Z"
          fill="var(--primary-foreground)"
          fillRule="evenodd"
        />
      ) : null}
      {state === 'loading' ? (
        <g
          className="pv-ai-loading-dots"
          fill={agent ? 'var(--primary-strong)' : 'var(--primary-foreground)'}
        >
          <circle cx="24" cy="32" r="2.5" />
          <circle cx="31" cy="32" r="2.5" />
          <circle cx="38" cy="32" r="2.5" />
        </g>
      ) : null}
      {state === 'done' || state === 'failed' ? (
        <g className="pv-ai-result">
          {agent && (
            <path
              d="M48 36h8L43 53l-5-5Z"
              fill={state === 'done' ? 'var(--success)' : 'var(--destructive)'}
            />
          )}
          <path
            d={state === 'done' ? 'M24 32l5 5 11-12' : 'M26 26l12 12m0-12L26 38'}
            fill="none"
            stroke={
              agent
                ? state === 'done'
                  ? 'var(--success)'
                  : 'var(--destructive)'
                : 'var(--primary-foreground)'
            }
            strokeWidth="4"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </g>
      ) : null}
    </svg>
  )
}
