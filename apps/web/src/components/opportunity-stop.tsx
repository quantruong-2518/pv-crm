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
  LOSS_REASON_DO_NOT_CONTACT_LABEL,
  OPPORTUNITY_STOP_NOTE_MAX,
  OPPORTUNITY_STOP_REASON_OTHER,
  OPPORTUNITY_STOP_REASON_OTHER_LABEL,
  QUOTATION_OUTCOME_LABEL,
  type OpportunityProfileResponse,
  type OpportunityRow,
} from '@pv/contracts'
import { userMessage } from '@/app/api'
import { message, useI18n, type Message } from '@/app/i18n'
import { leadStateLabel } from '@/data/sales-labels-i18n'
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

const OTHER_LABEL = message(OPPORTUNITY_STOP_REASON_OTHER_LABEL, 'Other', '기타')
const FLAG_LABEL = message(LOSS_REASON_DO_NOT_CONTACT_LABEL, 'Do not contact', '연락 금지')

/** The lead's own meetings go too when the stop parks the lead. */
function stopSubjects(op: OpportunityProfileResponse): MeetingSubject[] {
  return [
    { kind: 'opportunity', code: op.code },
    ...(op.parksLead ? [{ kind: 'lead' as const, code: op.leadCode }] : []),
  ]
}

/** The footer's line while nothing is sent: what the form still lacks. */
function missingLine(
  t: (copy: Message) => string,
  reasonKey: string,
  noteMissing: boolean,
  dayMissing: boolean,
) {
  if (reasonKey === '')
    return t(message('Chọn một lý do.', 'Choose a reason.', '사유를 선택하세요.'))
  if (noteMissing) {
    const other = t(OTHER_LABEL)
    return t(
      message(
        `Chọn "${OPPORTUNITY_STOP_REASON_OTHER_LABEL}" thì phải nhập ghi chú.`,
        `Add a note when you choose "${other}".`,
        `"${other}"을(를) 선택하면 메모를 입력해야 합니다.`,
      ),
    )
  }
  return dayMissing
    ? t(message('Chọn ngày liên hệ lại.', 'Choose a recontact date.', '재연락 날짜를 선택하세요.'))
    : null
}

const waitingNote = (n: number) =>
  message(
    `${n} báo giá đang chờ khách sẽ đóng là ${QUOTATION_OUTCOME_LABEL['not-closed']}.`,
    `${n} quotation(s) waiting on the customer will be closed as “Not closed”.`,
    `고객 회신을 기다리는 견적서 ${n}건이 “미체결”로 종료됩니다.`,
  )

const flagNote = (flag: string) =>
  message(
    `Cờ “${LOSS_REASON_DO_NOT_CONTACT_LABEL}” chỉ ghi vào nhật ký dừng, chưa chặn gọi hay gửi mail cho lead.`,
    `The “${flag}” flag is only recorded in the stop log; it does not yet block calls or emails to the lead.`,
    `“${flag}” 표시는 중단 기록에만 남으며 리드에 대한 전화나 메일을 아직 막지 않습니다.`,
  )

const PARKS_LEAD = message(
  'Lead của cơ hội này sẽ chuyển vào Nhóm chờ chăm sóc.',
  `The lead of this opportunity will move to ${leadStateLabel('nurturing', 'en')}.`,
  `이 기회의 리드는 ${leadStateLabel('nurturing', 'ko')}(으)로 이동합니다.`,
)

/* The empty first row makes "nobody chose yet" a state; the flag rides in
   the label because a Select row carries text only, worded as a recorded flag
   since nothing enforces it yet (ADR 0076 §5). */
function reasonOptions(
  t: (copy: Message) => string,
  reasons: { id: string; name: string; doNotContact: boolean }[],
) {
  return [
    { value: '', label: t(message('Chọn lý do…', 'Choose a reason…', '사유 선택…')) },
    ...reasons.map((r) => ({
      value: r.id,
      label: r.doNotContact
        ? t(
            message(
              `${r.name} · ghi cờ “${LOSS_REASON_DO_NOT_CONTACT_LABEL}”`,
              `${r.name} · flagged “${t(FLAG_LABEL)}”`,
              `${r.name} · “${t(FLAG_LABEL)}” 표시`,
            ),
          )
        : r.name,
    })),
    { value: OPPORTUNITY_STOP_REASON_OTHER, label: t(OTHER_LABEL) },
  ]
}

function StopFooter({
  t,
  error,
  busy,
  ready,
  missing,
  onClose,
  onSubmit,
}: {
  t: (copy: Message) => string
  error: Parameters<typeof userMessage>[0] | null
  busy: boolean
  ready: boolean
  missing: string | null
  onClose: () => void
  onSubmit: () => void
}) {
  const stopLabel = t(message('Dừng cơ hội', 'Stop opportunity', '기회 중단'))
  return (
    <div className="flex flex-wrap items-center justify-between gap-4">
      <span
        className={cn(
          'min-w-0 flex-1 text-[11.5px] leading-[1.5]',
          error ? 'text-destructive-foreground' : 'text-muted-foreground',
        )}
        aria-live="polite"
      >
        {error
          ? userMessage(error)
          : busy
            ? t(message('Đang dừng cơ hội…', 'Stopping opportunity…', '기회 중단 중…'))
            : missing}
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
          {t(message('Huỷ', 'Cancel', '취소'))}
        </Button>
        <Button
          size="md"
          variant="destructive"
          className="pointer-coarse:h-12"
          disabled={!ready}
          onClick={onSubmit}
        >
          <Icon icon={Octagon} size={16} />
          {busy ? t(message('Đang dừng…', 'Stopping…', '중단 중…')) : stopLabel}
        </Button>
      </div>
    </div>
  )
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
  const { t } = useI18n()
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
    t,
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
          toastDone(
            t(
              message(
                `Đã dừng ${op.code}.`,
                `${op.code} stopped.`,
                `${op.code}을(를) 중단했습니다.`,
              ),
            ),
          )
          setReasonKey('')
          setNote('')
          setRecontact(RECONTACT_DEFAULT)
          onClose()
        },
      },
    )

  const options = reasonOptions(t, reasons)

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title={t(message('Dừng cơ hội', 'Stop opportunity', '기회 중단'))}
      subtitle={
        <>
          <span className="font-mono">{op.code}</span> · {op.account}.{' '}
          {t(
            message(
              'Dừng rồi không mở lại được.',
              'A stopped opportunity cannot be reopened.',
              '중단하면 다시 열 수 없습니다.',
            ),
          )}
        </>
      }
      footer={
        <StopFooter
          t={t}
          error={stop.error}
          busy={busy}
          ready={ready}
          missing={missing}
          onClose={onClose}
          onSubmit={submit}
        />
      }
    >
      <div className="flex flex-col gap-6">
        <Field label={t(message('Lý do', 'Reason', '사유'))} required plain>
          <Select
            label={t(message('Lý do dừng', 'Reason for stopping', '중단 사유'))}
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
              {t(flagNote(t(FLAG_LABEL)))}
            </Badge>
          </span>
        )}

        {waiting > 0 && (
          <p className="text-muted-foreground m-0 text-[12.5px] leading-[1.6]">
            {t(waitingNote(waiting))}
          </p>
        )}

        <MeetingsCancelNote enabled={open} subjects={stopSubjects(op)} />

        <Field label={t(message('Ghi chú', 'Note', '메모'))} required={noteNeeded}>
          <Textarea
            autoGrow
            rows={3}
            value={note}
            aria-label={t(
              message(
                'Ghi chú khi dừng cơ hội',
                'Note on stopping the opportunity',
                '기회 중단 메모',
              ),
            )}
            aria-required={noteNeeded}
            maxLength={OPPORTUNITY_STOP_NOTE_MAX}
            onChange={(e) => setNote(e.target.value)}
          />
        </Field>

        {op.parksLead && (
          <>
            <p className="text-muted-foreground m-0 text-[12.5px] leading-[1.6]">{t(PARKS_LEAD)}</p>
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
  const { t } = useI18n()
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
      term: t(message('Lý do', 'Reason', '사유')),
      value: (
        <span className="flex flex-wrap items-center gap-2">
          {reason ?? t(message('Không ghi', 'Not recorded', '기록 없음'))}
          {op.stopDoNotContact && <Badge tone="warning">{t(FLAG_LABEL)}</Badge>}
        </span>
      ),
    },
    {
      term: t(message('Ghi chú', 'Note', '메모')),
      value: op.stopNote ?? t(message('Không có ghi chú', 'No note', '메모 없음')),
    },
    {
      term: t(message('Người kết luận', 'Concluded by', '결정한 사람')),
      value: history.isPending ? (
        <Skeleton className="h-4 w-32" />
      ) : (
        (exit?.by ?? t(message('Chưa ghi', 'Not recorded', '기록 없음')))
      ),
    },
  ]

  return (
    <GlassCard
      variant="b"
      className="flex flex-col gap-4 p-4 sm:p-5"
      aria-label={t(message('Nhật ký dừng', 'Stop log', '중단 기록'))}
    >
      <SectionTitle
        size="detail"
        hint={t(
          message(
            'Cơ hội đã dừng, không mở lại được.',
            'This opportunity is stopped and cannot be reopened.',
            '중단된 기회는 다시 열 수 없습니다.',
          ),
        )}
      >
        {t(message('Nhật ký dừng', 'Stop log', '중단 기록'))}
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
