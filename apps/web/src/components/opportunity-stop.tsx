import { useState, type ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Octagon, X } from '@pv/ui'
import {
  Badge,
  Button,
  Drawer,
  GlassCard,
  Icon,
  SectionTitle,
  Select,
  Skeleton,
  Textarea,
  cn,
} from '@pv/ui'
import {
  LEAD_STATE_LABEL,
  LOSS_REASON_DO_NOT_CONTACT_LABEL,
  OPPORTUNITY_STAGE_LABEL,
  OPPORTUNITY_STOP_NOTE_MAX,
  OPPORTUNITY_STOP_REASON_OTHER,
  OPPORTUNITY_STOP_REASON_OTHER_LABEL,
  type OpportunityRow,
} from '@pv/contracts'
import { userMessage } from '@/app/api'
import { toastDone } from '@/app/toast'
import { dmhm } from '@/lib/date'
import {
  opportunityStageHistoryQuery,
  opportunityStopReasonsQuery,
  useStopDeal,
} from '@/data/opportunities-write'
import { Field } from './ops-fields'

/** Module 3 · stopping a deal, and what a stopped deal remembers (ADR 0069 §1).
 *
 *  A stop is final: no reopen door, re-nurturing goes through the lead. So the
 *  drawer says that before the press, and a lost deal prints its fail log —
 *  rung, reason, note, who, when — in place of the moves it no longer has.
 *  Reasons are the stage-scoped `LOSS_REASON` catalogue from the stop-reasons
 *  door; a key travels, never a label, and `other` needs a note (the contract's
 *  own refine, mirrored). */

export function StopDrawer({
  op,
  open,
  onClose,
}: {
  op: OpportunityRow
  open: boolean
  onClose: () => void
}) {
  const [reasonKey, setReasonKey] = useState('')
  const [note, setNote] = useState('')
  const stop = useStopDeal(op.code)
  const { data: catalog } = useQuery(opportunityStopReasonsQuery)
  /* `stage: null` is offered in every column — the rule the server checks the key by. */
  const reasons = (catalog?.rows ?? []).filter((r) => r.stage === null || r.stage === op.stage)
  const flagged = new Set(reasons.filter((r) => r.doNotContact).map((r) => r.id))
  const busy = stop.isPending
  const noteNeeded = reasonKey === OPPORTUNITY_STOP_REASON_OTHER
  const ready = reasonKey !== '' && (!noteNeeded || note.trim() !== '') && !busy

  const submit = () =>
    stop.mutate(
      { reasonKey, ...(note.trim() === '' ? {} : { note: note.trim() }) },
      {
        /* Closes only once the server accepted, so a refusal cannot vanish. */
        onSuccess: () => {
          toastDone(`Đã dừng ${op.code}.`)
          setReasonKey('')
          setNote('')
          onClose()
        },
      },
    )

  /* The empty first row makes "nobody chose yet" a state; the flag rides in
     the label because a Select row carries text only. */
  const options = [
    { value: '', label: 'Chọn lý do…' },
    ...reasons.map((r) => ({
      value: r.id,
      label: r.doNotContact ? `${r.name} · ${LOSS_REASON_DO_NOT_CONTACT_LABEL}` : r.name,
    })),
    { value: OPPORTUNITY_STOP_REASON_OTHER, label: OPPORTUNITY_STOP_REASON_OTHER_LABEL },
  ]

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title="Dừng cơ hội"
      subtitle={
        <>
          <span className="font-mono">{op.code}</span> · {op.account} — dừng là không mở lại được.
          Muốn chăm lại thì đi từ lead.
        </>
      }
      footer={
        <div className="flex flex-wrap items-center justify-between gap-4">
          <span
            className={cn(
              'min-w-0 flex-1 text-[11.5px] leading-[1.5]',
              stop.error ? 'text-destructive-foreground' : 'text-muted-foreground',
            )}
            aria-live="polite"
          >
            {stop.error
              ? userMessage(stop.error)
              : busy
                ? 'Đang dừng cơ hội…'
                : ready
                  ? `Nếu đây là cơ hội cuối còn chạy của lead và chưa ký gì, lead về "${LEAD_STATE_LABEL.nurturing}".`
                  : noteNeeded
                    ? `Chọn "${OPPORTUNITY_STOP_REASON_OTHER_LABEL}" thì phải ghi rõ lý do.`
                    : 'Chọn một lý do trong danh mục.'}
          </span>
          <div className="flex shrink-0 gap-2">
            <Button
              size="md"
              variant="ghost"
              className="pointer-coarse:h-12"
              disabled={busy}
              onClick={onClose}
            >
              <Icon icon={X} size={16} />
              Huỷ
            </Button>
            <Button
              size="md"
              variant="destructive"
              className="pointer-coarse:h-12"
              disabled={!ready}
              onClick={submit}
            >
              <Icon icon={Octagon} size={16} />
              {busy ? 'Đang dừng…' : 'Dừng cơ hội'}
            </Button>
          </div>
        </div>
      }
    >
      <div className="flex flex-col gap-6">
        <Field
          label="Lý do"
          required
          plain
          hint="Danh mục lý do ở màn Thiết lập, cắt theo đúng bậc cơ hội đang đứng. Thiếu lý do nào thì thêm ở đó."
        >
          <Select
            label="Lý do dừng"
            hideLabel
            value={reasonKey}
            onChange={setReasonKey}
            options={options}
            size="lg"
            className="w-full"
          />
        </Field>
        {/* `flex` keeps the badge at its own width inside this column. */}
        {flagged.has(reasonKey) && (
          <span className="flex">
            <Badge tone="warning" className="whitespace-normal">
              {LOSS_REASON_DO_NOT_CONTACT_LABEL}: cờ này được ghi cùng lý do vào nhật ký dừng.
            </Badge>
          </span>
        )}

        <Field
          label="Ghi chú"
          required={noteNeeded}
          hint="Câu của riêng cơ hội này — khách nói gì, ai đổi ý."
        >
          <Textarea
            autoGrow
            rows={3}
            value={note}
            aria-label="Ghi chú khi dừng cơ hội"
            aria-required={noteNeeded}
            maxLength={OPPORTUNITY_STOP_NOTE_MAX}
            onChange={(e) => setNote(e.target.value)}
          />
        </Field>
      </div>
    </Drawer>
  )
}

/** The fail log of a lost deal. "Who" is not on the row: it is the stage
 *  event that took the deal off the board (`to: null`), read from the same
 *  cached history the history tab draws. */
export function FailLogCard({ op }: { op: OpportunityRow }) {
  /* Both resolved server-side, so a reader without `config.view` still reads why. */
  const reason = op.stopReasonLabel
  const history = useQuery(opportunityStageHistoryQuery(op.code))
  const exit = (history.data?.rows ?? [])
    .filter((e) => e.to === null)
    .reduce<{ at: string; by: string } | null>(
      (last, e) => (last && last.at > e.at ? last : e),
      null,
    )

  const rows: { term: string; value: ReactNode }[] = [
    {
      term: 'Dừng ở bậc',
      value: op.stoppedAtStage ? OPPORTUNITY_STAGE_LABEL[op.stoppedAtStage] : 'Không ghi',
    },
    {
      term: 'Lý do',
      value: (
        <span className="flex flex-wrap items-center gap-2">
          {reason ?? 'Không ghi'}
          {op.stopDoNotContact && <Badge tone="warning">{LOSS_REASON_DO_NOT_CONTACT_LABEL}</Badge>}
        </span>
      ),
    },
    { term: 'Ghi chú', value: op.stopNote ?? 'Không có ghi chú' },
    { term: 'Ngày dừng', value: op.closedAt ? dmhm(op.closedAt) : 'Không ghi' },
    {
      term: 'Người kết luận',
      value: history.isPending ? (
        <Skeleton className="h-4 w-32" />
      ) : (
        (exit?.by ?? 'Sổ đổi bậc chưa ghi lượt dừng này.')
      ),
    },
  ]

  return (
    <GlassCard variant="b" className="flex flex-col gap-4 p-4 sm:p-5" aria-label="Nhật ký dừng">
      <SectionTitle
        size="detail"
        hint={`Cơ hội đã dừng, không mở lại được. Muốn chăm lại thì đi từ lead — lead có thể đang ở "${LEAD_STATE_LABEL.nurturing}".`}
      >
        Nhật ký dừng
      </SectionTitle>
      <dl className="grid gap-x-6 gap-y-3 text-[12.5px] leading-[1.6] sm:grid-cols-[auto_1fr]">
        {rows.map((row) => (
          <div key={row.term} className="contents">
            <dt className="text-muted-foreground">{row.term}</dt>
            <dd className="text-foreground min-w-0 break-words">{row.value}</dd>
          </div>
        ))}
      </dl>
    </GlassCard>
  )
}
