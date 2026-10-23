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
  OPPORTUNITY_STOP_NOTE_MAX,
  OPPORTUNITY_STOP_REASON_OTHER,
  OPPORTUNITY_STOP_REASON_OTHER_LABEL,
  QUOTATION_OUTCOME_LABEL,
  type OpportunityProfileResponse,
  type OpportunityRow,
} from '@pv/contracts'
import { userMessage } from '@/app/api'
import type { MeetingSubject } from '@/data/meetings'
import { toastDone } from '@/app/toast'
import {
  opportunityStageHistoryQuery,
  opportunityStopReasonsQuery,
  useStopDeal,
} from '@/data/opportunities-write'
import { MeetingsCancelNote } from './meetings-cancel-note'
import { Field } from './ops-fields'
import { RecontactField } from './recontact-field'
import { RECONTACT_DEFAULT, recontactOnOf } from './recontact-pick'

/** Module 3 · stopping a deal, and what a stopped deal remembers (ADR 0069 §1).
 *
 *  A stop is final: no reopen door, re-nurturing goes through the lead. So the
 *  drawer says that before the press, and a lost deal prints its fail log —
 *  reason, note and who concluded — in place of the moves it no longer has.
 *  Reasons are the stage-scoped `LOSS_REASON` catalogue from the stop-reasons
 *  door; a key travels, never a label, and `other` needs a note (the contract's
 *  own refine, mirrored). On the lead's last live deal the lead parks by
 *  itself (ADR 0109), so the drawer says so. */

/** The lead's own meetings go too when the stop parks the lead. */
function stopSubjects(op: OpportunityProfileResponse): MeetingSubject[] {
  return [
    { kind: 'opportunity', code: op.code },
    ...(op.parksLead ? [{ kind: 'lead' as const, code: op.leadCode }] : []),
  ]
}

/** The footer's line while nothing is sent: what the form still lacks. */
function missingLine(reasonKey: string, noteMissing: boolean, dayMissing: boolean) {
  if (reasonKey === '') return 'Chọn một lý do.'
  if (noteMissing) return `Chọn "${OPPORTUNITY_STOP_REASON_OTHER_LABEL}" thì phải nhập ghi chú.`
  return dayMissing ? 'Chọn ngày liên hệ lại.' : null
}

export function StopDrawer({
  op,
  open,
  onClose,
}: {
  op: OpportunityProfileResponse
  open: boolean
  onClose: () => void
}) {
  const waiting = op.money.open.filter((n) => n.pendingId !== null).length
  const [reasonKey, setReasonKey] = useState('')
  const [note, setNote] = useState('')
  const [recontact, setRecontact] = useState(RECONTACT_DEFAULT)
  const stop = useStopDeal(op.code)
  const { data: catalog } = useQuery(opportunityStopReasonsQuery)
  /* `stage: null` is offered in every column — the rule the server checks the key by. */
  const reasons = (catalog?.rows ?? []).filter((r) => r.stage === null || r.stage === op.stage)
  const flagged = new Set(reasons.filter((r) => r.doNotContact).map((r) => r.id))
  const busy = stop.isPending
  const noteNeeded = reasonKey === OPPORTUNITY_STOP_REASON_OTHER
  /* The day applies to the lead, so it is asked only when this stop parks it. */
  const recontactOn = op.parksLead ? recontactOnOf(recontact) : null
  const missing = missingLine(
    reasonKey,
    noteNeeded && note.trim() === '',
    recontactOn === undefined,
  )
  const ready = missing === null && !busy

  const submit = () =>
    stop.mutate(
      {
        reasonKey,
        ...(note.trim() === '' ? {} : { note: note.trim() }),
        ...(op.parksLead ? { recontactOn } : {}),
      },
      {
        /* Closes only once the server accepted, so a refusal cannot vanish. */
        onSuccess: () => {
          toastDone(`Đã dừng ${op.code}.`)
          setReasonKey('')
          setNote('')
          setRecontact(RECONTACT_DEFAULT)
          onClose()
        },
      },
    )

  /* The empty first row makes "nobody chose yet" a state; the flag rides in
     the label because a Select row carries text only, worded as a recorded flag
     since nothing enforces it yet (ADR 0076 §5). */
  const options = [
    { value: '', label: 'Chọn lý do…' },
    ...reasons.map((r) => ({
      value: r.id,
      label: r.doNotContact ? `${r.name} · ghi cờ “${LOSS_REASON_DO_NOT_CONTACT_LABEL}”` : r.name,
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
          <span className="font-mono">{op.code}</span> · {op.account}. Dừng rồi không mở lại được.
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
            {stop.error ? userMessage(stop.error) : busy ? 'Đang dừng cơ hội…' : missing}
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
        <Field label="Lý do" required plain>
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
              Cờ “{LOSS_REASON_DO_NOT_CONTACT_LABEL}” chỉ ghi vào nhật ký dừng, chưa chặn gọi hay
              gửi mail cho lead.
            </Badge>
          </span>
        )}

        {waiting > 0 && (
          <p className="text-muted-foreground m-0 text-[12.5px] leading-[1.6]">
            {waiting} báo giá đang chờ khách sẽ đóng là {QUOTATION_OUTCOME_LABEL['not-closed']}.
          </p>
        )}

        <MeetingsCancelNote enabled={open} subjects={stopSubjects(op)} />

        <Field label="Ghi chú" required={noteNeeded}>
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

        {op.parksLead && (
          <>
            <p className="text-muted-foreground m-0 text-[12.5px] leading-[1.6]">
              Lead của cơ hội này sẽ chuyển vào {LEAD_STATE_LABEL.nurturing}.
            </p>
            <RecontactField value={recontact} onChange={setRecontact} disabled={busy} />
          </>
        )}
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

  /* No rung and no date: the todo card's stepper marks both on the stopped rung. */
  const rows: { term: string; value: ReactNode }[] = [
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
    {
      term: 'Người kết luận',
      value: history.isPending ? <Skeleton className="h-4 w-32" /> : (exit?.by ?? 'Chưa ghi'),
    },
  ]

  return (
    <GlassCard variant="b" className="flex flex-col gap-4 p-4 sm:p-5" aria-label="Nhật ký dừng">
      <SectionTitle size="detail" hint="Cơ hội đã dừng, không mở lại được.">
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
