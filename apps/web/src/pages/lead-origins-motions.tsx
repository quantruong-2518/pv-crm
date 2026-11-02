import { useState, type ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  Button,
  Checkbox,
  EmptyState,
  GlassCard,
  Icon,
  Input,
  MetaPill,
  SectionTitle,
  SegmentedControl,
  Send,
  Skeleton,
  TriangleAlert,
  cn,
} from '@pv/ui'
import {
  MOTION_LABEL,
  MOTION_SIDE,
  MotionAsks,
  type MotionPolicy,
  type MotionPolicyPatch,
} from '@pv/contracts'
import { isApiError, userMessage } from '@/app/api'
import { useCan } from '@/app/auth'
import { message, useI18n } from '@/app/i18n'
import { toastDone } from '@/app/toast'
import { leadAsksText, leadMotionText, leadSideText } from '@/data/lead-copy'
import { motionLabelOf, salesMotionsQuery, useProposeMotion } from '@/data/sales-motions'
import { sentCopy } from './sales-config-copy'

/** Level 1 of a lead's origin — the six motions, as the create form offers them.
 *
 *  Same door as §5.9 of the sales config screen (`sales-config-parts.tsx`):
 *  `PATCH /sales/config/motions/:motion` answers with a RECEIPT, and the row
 *  changes only once somebody approves. So the row is never repainted from what
 *  was typed; it re-reads, and still shows the stored value until then. This
 *  section edits the three picker-facing fields only — label, on/off, and what
 *  the form asks next — and leaves the four policy fields to §5.9.
 *
 *  `bare` drops the heading only: the config screen wraps the list in its
 *  own `Section`, the lead-origins screen has no such frame. */
export function MotionPickerSection({ bare = false }: { bare?: boolean }) {
  const { t } = useI18n()
  const { data: rows, isPending, error, refetch } = useQuery(salesMotionsQuery())

  const body = isPending ? (
    <Skeleton className="h-32 w-full" />
  ) : error || !rows ? (
    <EmptyState
      tone="danger"
      icon={TriangleAlert}
      message={`${t(
        message(
          'Không tải được phương án tiếp cận.',
          'Could not load approaches.',
          '접근 방식을 불러오지 못했습니다.',
        ),
      )} ${isApiError(error) ? userMessage(error) : t(message('Thử lại.', 'Try again.', '다시 시도하세요.'))}`}
      action={{
        label: t(message('Thử lại', 'Retry', '다시 시도')),
        onClick: () => void refetch(),
      }}
      className="py-12"
    />
  ) : (
    <div className="flex flex-col gap-2">
      <MotionHead
        cols={PICKER_COLS}
        labels={[
          t(message('Phương án', 'Approach', '접근 방식')),
          t(message('Tên hiện', 'Display name', '표시 이름')),
          t(message('Đang dùng', 'In use', '사용 중')),
          t(message('Hỏi gì sau khi chọn', 'Asked after choosing', '선택 후 질문')),
        ]}
      />
      <ul className="flex flex-col gap-2">
        {[...rows]
          .sort((a, b) => a.ord - b.ord)
          .map((row) => (
            <MotionPickerRow key={row.motion} row={row} />
          ))}
      </ul>
    </div>
  )

  /* Law 8 · the list sits on ONE glass-b either way, never one inside another. */
  if (bare) {
    return (
      <GlassCard variant="b" className="p-4">
        {body}
      </GlassCard>
    )
  }

  return (
    <GlassCard
      variant="b"
      className="flex flex-col gap-4 p-5"
      aria-label={t(message('Phương án tiếp cận', 'Approach', '접근 방식'))}
    >
      <SectionTitle
        hint={t(
          message(
            'Đổi gì cũng thành một đề nghị chờ duyệt.',
            'Every change becomes a proposal awaiting approval.',
            '모든 변경은 승인 대기 중인 제안이 됩니다.',
          ),
        )}
      >
        {t(message('Phương án tiếp cận', 'Approach', '접근 방식'))}
      </SectionTitle>
      {body}
    </GlassCard>
  )
}

/** Each row is its own grid, so the tracks are fractions only: an `auto` track
 *  would size per row and the columns would not line up under the header. */
const PICKER_COLS = 'lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_minmax(0,0.6fr)_minmax(0,1.8fr)]'

export const MOTION_ROW = 'bg-surface-ink/5 flex flex-col gap-2 rounded-md p-3'
export const MOTION_LINE = 'flex min-w-0 flex-wrap items-end gap-3 lg:grid lg:items-center'
export const MOTION_NAME = 'flex w-full min-w-0 flex-wrap items-center gap-2 lg:w-auto'

/** Column names of a motion list, on `lg+` only. Hidden from assistive tech:
 *  every control in a row carries its own name. */
export function MotionHead({ cols, labels }: { cols: string; labels: string[] }) {
  return (
    <div
      aria-hidden
      className={cn(
        'text-muted-foreground hidden gap-3 px-3 text-[11px] font-semibold lg:grid',
        cols,
      )}
    >
      {labels.map((label) => (
        <span key={label}>{label}</span>
      ))}
    </div>
  )
}

/** One control of a motion row. Below `lg` there is no header row, so the
 *  column's name is printed above the control instead. */
export function MotionCell({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-1 basis-40 flex-col gap-1">
      <span aria-hidden className="text-muted-foreground text-[11px] lg:hidden">
        {label}
      </span>
      {children}
    </div>
  )
}

/** The send of one motion row — drawn only once the row differs from the
 *  stored one, so a clean list shows no buttons at all. */
export function MotionSend({
  changed,
  blocked,
  failure,
  onSend,
}: {
  changed: number
  blocked: boolean
  failure: string | null
  onSend: () => void
}) {
  const { t } = useI18n()
  if (changed === 0 && !failure) return null
  return (
    <div className="flex flex-wrap items-center gap-3">
      {changed > 0 && (
        <>
          <Button size="sm" className="pointer-coarse:h-12" disabled={blocked} onClick={onSend}>
            <Icon icon={Send} size={16} />
            {t(message('Gửi đề nghị', 'Send proposal', '제안 보내기'))}
          </Button>
          <span className="text-muted-foreground tnum text-[11.5px]">
            {t(
              message(
                `${changed} thay đổi · chưa gửi`,
                `${changed} ${changed === 1 ? 'change' : 'changes'} · not sent`,
                `변경 ${changed}건 · 미전송`,
              ),
            )}
          </span>
        </>
      )}
      {failure && (
        <p role="alert" className="text-destructive-foreground m-0 text-[11.5px]">
          {failure}
        </p>
      )}
    </div>
  )
}

function MotionPickerRow({ row }: { row: MotionPolicy }) {
  const { t, lang } = useI18n()
  const canPropose = useCan('config.propose')
  const [label, setLabel] = useState(row.label ?? '')
  const [active, setActive] = useState(row.active)
  const [asks, setAsks] = useState(row.asks)
  const propose = useProposeMotion(row.motion)
  /* Sent is not saved: the controls fall back to the stored row, so a second
     press cannot file a duplicate. */
  const sent = () => {
    setLabel(row.label ?? '')
    setActive(row.active)
    setAsks(row.asks)
    toastDone(sentCopy())
  }

  /* Only what differs travels — the approver reads the request as a claim. */
  const patch: MotionPolicyPatch = {}
  const typed = label.trim() === '' ? null : label.trim()
  if (typed !== row.label) patch.label = typed
  if (active !== row.active) patch.active = active
  if (asks !== row.asks) patch.asks = asks

  return (
    <li className={MOTION_ROW}>
      <fieldset
        disabled={!canPropose || propose.isPending}
        className={cn(MOTION_LINE, PICKER_COLS)}
      >
        <div className={MOTION_NAME}>
          <span className="text-[12.5px] font-semibold">
            {leadMotionText(row.motion, motionLabelOf(row), lang)}
          </span>
          <MetaPill>{leadSideText(MOTION_SIDE[row.motion], lang)}</MetaPill>
          <MetaPill mono>{row.motion}</MetaPill>
        </div>
        <MotionCell label={t(message('Tên hiện', 'Display name', '표시 이름'))}>
          <Input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder={leadMotionText(row.motion, MOTION_LABEL[row.motion], lang)}
            aria-label={t(
              message(
                `Tên hiện: ${row.motion}`,
                `Display name: ${row.motion}`,
                `표시 이름: ${row.motion}`,
              ),
            )}
            className="pointer-coarse:h-12"
          />
        </MotionCell>
        <Checkbox
          checked={active}
          onChange={setActive}
          label={<span className="lg:sr-only">{t(message('Đang dùng', 'In use', '사용 중'))}</span>}
          className="pointer-coarse:min-h-12"
        />
        <MotionCell
          label={t(message('Hỏi gì sau khi chọn', 'Asked after choosing', '선택 후 질문'))}
        >
          <SegmentedControl
            label={t(
              message(
                `Hỏi gì sau khi chọn: ${row.motion}`,
                `Asked after choosing: ${row.motion}`,
                `선택 후 질문: ${row.motion}`,
              ),
            )}
            hideLabel
            value={asks}
            options={MotionAsks.options.map((a) => ({ value: a, label: leadAsksText(a, lang) }))}
            onChange={(v) => setAsks(v as MotionAsks)}
          />
        </MotionCell>
      </fieldset>

      {canPropose && (
        <MotionSend
          changed={Object.keys(patch).length}
          blocked={propose.isPending}
          failure={isApiError(propose.error) ? userMessage(propose.error) : null}
          onSend={() => propose.mutate(patch, { onSuccess: sent })}
        />
      )}
    </li>
  )
}
