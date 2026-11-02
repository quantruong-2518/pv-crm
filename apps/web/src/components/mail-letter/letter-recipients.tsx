import type { ReactNode } from 'react'
import type { Actor } from '@pv/engines'
import { Check, Lock, TriangleAlert, Users, X } from '@pv/ui'
import { Avatar, GlassCard, Icon, Select } from '@pv/ui'
import { SALES_INBOX } from '@pv/contracts'
import { message, useI18n } from '@/app/i18n'
import type { ToCell } from './letter-model'

/** The recipients card of the one-screen composer (G-Compose, G7). To is the
 *  one contact the letter was opened from and cannot be changed here; only CC
 *  takes colleagues. The address rides in the chip's `title`. */

export function RecipientsCard({
  cells,
  cc,
  colleagues,
  onAddCc,
  onDropCc,
}: {
  cells: readonly ToCell[]
  cc: readonly Actor[]
  /** Everyone who may be copied in, already-copied ones included. */
  colleagues: readonly Actor[]
  onAddCc: (id: string) => void
  onDropCc: (id: string) => void
}) {
  const { t } = useI18n()
  const addable = colleagues.filter((person) => !cc.some((c) => c.id === person.id))

  return (
    <GlassCard variant="b" className="flex min-w-0 flex-col gap-3 p-4">
      <span className="flex items-center gap-2 text-[13px] font-semibold leading-5">
        <Icon icon={Users} size={16} />
        {t(message('Người nhận', 'Recipients', '받는 사람'))}
      </span>

      <Row label="To">
        {cells.map((cell) => (
          <ToChip key={cell.code} cell={cell} />
        ))}
      </Row>

      <Row label="CC">
        {cc.map((person) => (
          <span
            key={person.id}
            title={person.email}
            className="bg-surface-ink/9 flex h-12 max-w-full items-center gap-2 rounded-md pl-2"
          >
            <Avatar name={person.name} size="sm" />
            <span className="truncate text-[13px] font-medium">{person.name}</span>
            <DropButton
              label={t(
                message(`Bỏ ${person.name}`, `Remove ${person.name}`, `${person.name} 제거`),
              )}
              onClick={() => onDropCc(person.id)}
            />
          </span>
        ))}
        <span
          title={t(
            message(
              'Luôn CC, không bỏ được',
              'Always CC’d, cannot be removed',
              '항상 참조되며 제거할 수 없습니다',
            ),
          )}
          className="bg-surface-ink/9 flex h-12 items-center gap-2 rounded-md pl-2 pr-3"
        >
          <span
            role="img"
            aria-label={t(message('Khoá', 'Locked', '잠금'))}
            className="text-muted-foreground flex"
          >
            <Icon icon={Lock} size={14} />
          </span>
          <span className="whitespace-nowrap font-mono text-[12px]">{SALES_INBOX}</span>
        </span>
        {addable.length > 0 && (
          <Select
            label={t(
              message('Thêm đồng nghiệp vào CC', 'Add a colleague to CC', '동료를 참조에 추가'),
            )}
            hideLabel
            size="lg"
            className="w-[240px]"
            value=""
            onChange={(id) => id && onAddCc(id)}
            options={[
              { value: '', label: t(message('Thêm đồng nghiệp', 'Add a colleague', '동료 추가')) },
              ...addable.map((person) => ({ value: person.id, label: person.name })),
            ]}
          />
        )}
      </Row>
    </GlassCard>
  )
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid min-w-0 grid-cols-[48px_minmax(0,1fr)] items-start gap-3">
      <span className="text-muted-foreground pt-4 text-[12px] font-medium leading-4">{label}</span>
      <div className="flex min-w-0 flex-wrap items-center gap-2">{children}</div>
    </div>
  )
}

function ToChip({ cell }: { cell: ToCell }) {
  const { t } = useI18n()
  return (
    <span
      title={cell.line}
      className="bg-surface-ink/9 flex h-12 max-w-full items-center gap-2 rounded-md px-3"
    >
      <Avatar name={cell.name} size="sm" />
      <span className="truncate text-[13px] font-medium">{cell.name}</span>
      {cell.flag && <span className="text-warning whitespace-nowrap text-[12px]">{cell.flag}</span>}
      {cell.ok && (
        <span
          role="img"
          aria-label={t(message('Sẽ nhận', 'Will receive', '수신 예정'))}
          className="text-success flex"
        >
          <Icon icon={Check} size={14} />
        </span>
      )}
      {cell.flag && (
        <span
          role="img"
          aria-label={t(message('Không nhận', 'Will not receive', '수신 안 됨'))}
          className="text-warning flex"
        >
          <Icon icon={TriangleAlert} size={14} />
        </span>
      )}
    </span>
  )
}

function DropButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className="text-muted-foreground motion-std hover:bg-surface-ink/9 hover:text-foreground flex size-12 shrink-0 items-center justify-center rounded-md"
    >
      <Icon icon={X} size={14} />
    </button>
  )
}
