import { useEffect, useMemo, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { CircleX, FileText, Trash2 } from '@pv/ui'
import { Button, Icon, Input, Select, Textarea } from '@pv/ui'
import {
  CURRENCIES,
  OPPORTUNITY_STOP_NOTE_MAX,
  OPPORTUNITY_STOP_REASON_OTHER,
  OPPORTUNITY_STOP_REASON_OTHER_LABEL,
  QUOTATION_OUTCOME_LABEL,
  type ContractKind,
  type CurrencyCode,
  type OpportunityMoneyNegotiation,
  type OpportunityProfileResponse,
  type QuotationReason,
  type QuotationRow,
} from '@pv/contracts'
import { isApiError, userMessage } from '@/app/api'
import { useCan } from '@/app/auth'
import { message, translate, useI18n } from '@/app/i18n'
import { toastDone, toastFail } from '@/app/toast'
import { dmy } from '@/lib/date'
import { fileSizeLabel } from '@/data/comm-record-detail'
import { refusalOf, vnToday } from '@/data/opportunities'
import {
  atOfDay,
  quotationReasonsQuery,
  useCloseQuotation,
  usePatchQuotation,
  useRecordQuotation,
  vnDayOf,
} from '@/data/quotations-write'
import {
  MAX_PER_DROP,
  checkFiles,
  useRefreshDocuments,
  useUploadDocument,
  type DocumentUpload,
} from '@/data/workstream-documents'
import { useContractKindLabel, useContractKindOptions } from '@/data/sales-config'
import { ContractKindField } from '@/components/contract-kind-field'
import { Field } from '@/components/ops-fields'
import { compactMoney, symbolOf } from '@/components/deal-money/money'
import { FormModal } from '@/components/deal-pay/form-modal'
import { NumberBox } from '@/components/deal-pay/number-box'
import { DropArea } from '@/components/run/run-documents'

/** The write side of the quotation ledger (ADR 0090): record a send, close a
 *  negotiation, fill what a mailed round lacks. The server judges every rule;
 *  these forms mirror a few only to keep the button honest, and print its
 *  sentence when it refuses. */

const msg = (vi: string, en: string, ko: string) => translate(message(vi, en, ko))
const NOT_CLOSED = message(QUOTATION_OUTCOME_LABEL['not-closed'], 'Not closed', '미체결')
const OTHER = message(OPPORTUNITY_STOP_REASON_OTHER_LABEL, 'Other', '기타')
const uploadFailed = (name: string) =>
  message(
    `Không tải lên được “${name}”.`,
    `Could not upload “${name}”.`,
    `“${name}”을(를) 업로드하지 못했습니다.`,
  )
const recordedNote = (n: number) =>
  message(
    `Đã ghi báo giá lần ${n}.`,
    `Quotation round ${n} recorded.`,
    `견적서 ${n}차를 기록했습니다.`,
  )
const roundText = (n: number) => msg(`Lần ${n}`, `Round ${n}`, `${n}차`)

const CURRENCY_OPTIONS = CURRENCIES.map((c) => ({ value: c.code as string, label: c.label }))

const range = (min: string | undefined) =>
  min === undefined
    ? msg('Không sau hôm nay.', 'Not after today.', '오늘 이후는 선택할 수 없습니다.')
    : msg(`Từ ${dmy(min)} đến hôm nay.`, `From ${dmy(min)} to today.`, `${dmy(min)}부터 오늘까지.`)

/** What the press does to the round still waiting, as a sentence. */
function closesText(negotiation: OpportunityMoneyNegotiation): string {
  const round = negotiation.rounds.find((r) => r.id === negotiation.pendingId)
  const head = [
    round && roundText(round.roundNo),
    negotiation.amount !== null && compactMoney(negotiation.amount, negotiation.currency),
  ]
    .filter(Boolean)
    .join(' · ')
  return msg(
    `${head || 'Báo giá đang chờ'} sẽ đóng là ${NOT_CLOSED.vi}`, // i18n-ignore
    `${head || 'The waiting quotation'} will be closed as ${NOT_CLOSED.en}`,
    `${head || '대기 중인 견적서'}은(는) ${NOT_CLOSED.ko}(으)로 종료됩니다`,
  )
}

/** What the press will record, once the boxes are filled: the round it
 *  becomes (only known when a round is being replaced), value and kind. */
function summaryOf(
  form: Form,
  waiting: OpportunityMoneyNegotiation | null,
  resolveKind: (code: string) => string,
): string {
  if (form.amount === null || form.kind === '') return ''
  const round = waiting?.rounds.find((r) => r.id === waiting.pendingId)
  return [
    round && roundText(round.roundNo + 1),
    compactMoney(form.amount, form.currency),
    resolveKind(form.kind),
  ]
    .filter(Boolean)
    .join(' · ')
}

/** What the new round does to the one still waiting: it closes unsigned, and
 *  the reason is asked first because it is the one thing the form cannot guess. */
function ClosesBlock({
  waiting,
  reason,
  onChange,
}: {
  waiting: OpportunityMoneyNegotiation
  reason: Reason
  onChange: (next: Reason) => void
}) {
  return (
    <div className="bg-warning/12 flex flex-col gap-6 rounded-md p-4">
      <p className="text-on-tint-warning m-0 text-[13px] font-semibold leading-[1.5]">
        {closesText(waiting)}
      </p>
      <ReasonFields value={reason} onChange={onChange} />
    </div>
  )
}

type Reason = { reasonId: string; note: string }
const NO_REASON: Reason = { reasonId: '', note: '' }

const reasonBlocker = (r: Reason) =>
  r.reasonId === ''
    ? msg(
        `Chọn lý do ${NOT_CLOSED.vi.toLowerCase()}.`,
        'Choose a reason for not closing.',
        `${NOT_CLOSED.ko} 사유를 선택하세요.`,
      )
    : r.reasonId === OPPORTUNITY_STOP_REASON_OTHER && r.note.trim() === ''
      ? msg(
          `Chọn "${OTHER.vi}" thì phải nhập ghi chú.`,
          `Add a note when you choose "${OTHER.en}".`,
          `"${OTHER.ko}"을(를) 선택하면 메모를 입력해야 합니다.`,
        )
      : ''

const reasonBody = (r: Reason): QuotationReason => ({
  reasonId: r.reasonId,
  ...(r.note.trim() === '' ? {} : { note: r.note.trim() }),
})

function ReasonFields({ value, onChange }: { value: Reason; onChange: (next: Reason) => void }) {
  const { t } = useI18n()
  const { data } = useQuery(quotationReasonsQuery)
  const noteNeeded = value.reasonId === OPPORTUNITY_STOP_REASON_OTHER
  const options = [
    { value: '', label: t(message('Chọn lý do…', 'Choose a reason…', '사유 선택…')) },
    ...(data?.rows ?? []).map((r) => ({ value: r.id as string, label: r.name })),
    { value: OPPORTUNITY_STOP_REASON_OTHER, label: t(OTHER) },
  ]

  return (
    <>
      <Field label={t(message('Lý do', 'Reason', '사유'))} required plain>
        <Select
          label={t(
            message(
              `Lý do ${NOT_CLOSED.vi.toLowerCase()}`,
              'Reason for not closing',
              `${NOT_CLOSED.ko} 사유`,
            ),
          )}
          hideLabel
          size="lg"
          value={value.reasonId}
          onChange={(reasonId) => onChange({ ...value, reasonId })}
          options={options}
          className="w-full"
        />
      </Field>
      <Field label={t(message('Ghi chú', 'Note', '메모'))} required={noteNeeded}>
        <Textarea
          autoGrow
          rows={2}
          value={value.note}
          aria-label={t(message('Ghi chú về lý do', 'Note on the reason', '사유 메모'))}
          aria-required={noteNeeded}
          maxLength={OPPORTUNITY_STOP_NOTE_MAX}
          onChange={(e) => onChange({ ...value, note: e.target.value })}
        />
      </Field>
    </>
  )
}

function AmountRow({
  amount,
  currency,
  onAmount,
  onCurrency,
}: {
  amount: number | null
  currency: CurrencyCode
  onAmount: (next: number | null) => void
  onCurrency: (next: CurrencyCode) => void
}) {
  const { t } = useI18n()
  const valueLabel = t(message('Giá trị báo giá', 'Quotation value', '견적 금액'))
  return (
    <Field label={valueLabel} required plain>
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <NumberBox
            label={valueLabel}
            unit={symbolOf(currency)}
            value={amount}
            onChange={onAmount}
          />
        </div>
        <Select
          label={t(message('Đồng tiền', 'Currency', '통화'))}
          hideLabel
          size="lg"
          value={currency}
          neutralValue={currency}
          onChange={(v) => onCurrency(v as CurrencyCode)}
          options={CURRENCY_OPTIONS}
          className="w-40 shrink-0"
        />
      </div>
    </Field>
  )
}

/** Files picked before the round exists: held here, uploaded once it does. */
function StagedFiles({
  files,
  busy,
  onChange,
}: {
  files: File[]
  busy: boolean
  onChange: (next: File[]) => void
}) {
  const { t } = useI18n()
  const [problems, setProblems] = useState<string[]>([])

  const stage = (list: FileList | null) => {
    const picked = Array.from(list ?? [])
    if (picked.length === 0) return
    const { ok, problems: refused } = checkFiles(picked, MAX_PER_DROP - files.length)
    onChange([...files, ...ok])
    setProblems(refused)
  }

  return (
    <div className="flex flex-col gap-3">
      <DropArea busy={busy} problems={problems} onPick={stage} />
      {files.length > 0 && (
        <ul className="m-0 flex list-none flex-col gap-1 p-0">
          {files.map((file, i) => (
            <li key={`${file.name}-${i}`} className="flex min-w-0 items-center gap-3">
              <Icon icon={FileText} size={16} className="text-muted-foreground shrink-0" />
              <span className="text-foreground min-w-0 flex-1 truncate text-[13px]">
                {file.name}
              </span>
              <span className="text-muted-foreground tnum shrink-0 text-[12px]">
                {fileSizeLabel(file.size)}
              </span>
              <Button
                size="sm"
                variant="ghost"
                aria-label={t(
                  message(`Bỏ ${file.name}`, `Remove ${file.name}`, `${file.name} 제거`),
                )}
                title={t(message('Bỏ tệp', 'Remove file', '파일 제거'))}
                className="pointer-coarse:size-12 size-8 shrink-0 px-0"
                disabled={busy}
                onClick={() => onChange(files.filter((_, j) => j !== i))}
              >
                <Icon icon={Trash2} size={16} />
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

type Form = {
  amount: number | null
  currency: CurrencyCode
  kind: ContractKind | ''
  day: string
  validUntil: string
  files: File[]
  reason: Reason
}

const seedOf = (op: OpportunityProfileResponse, negotiation: OpportunityMoneyNegotiation | null) =>
  ({
    amount: null,
    currency: negotiation?.currency ?? op.currency ?? 'VND',
    kind: negotiation?.kind ?? '',
    day: vnToday(),
    validUntil: '',
    files: [],
    reason: NO_REASON,
  }) satisfies Form

const sendBeforeValid = () =>
  msg(
    'Hiệu lực đến không được trước ngày gửi.',
    'Valid-until date cannot be before the send date.',
    '유효 기한은 발송일보다 빠를 수 없습니다.',
  )

/** What still stops the press, in the order the boxes stand; '' = ready. */
function blockerOf(
  op: OpportunityProfileResponse,
  form: Form,
  min: string | undefined,
  needsReason: boolean,
): string {
  const { amount, kind, day, validUntil } = form
  return (
    refusalOf(op.acts.quotation) ??
    (amount === null || amount <= 0
      ? msg('Nhập giá trị báo giá.', 'Enter the quotation value.', '견적 금액을 입력하세요.')
      : kind === ''
        ? msg('Chọn loại hợp đồng.', 'Choose a contract type.', '계약 유형을 선택하세요.')
        : day === ''
          ? msg('Chọn ngày gửi.', 'Choose the send date.', '발송일을 선택하세요.')
          : day > vnToday() || (min !== undefined && day < min)
            ? range(min)
            : validUntil !== '' && validUntil < day
              ? sendBeforeValid()
              : needsReason
                ? reasonBlocker(form.reason)
                : '')
  )
}

export function QuotationModal({
  op,
  negotiation,
  open,
  onClose,
}: {
  op: OpportunityProfileResponse
  negotiation: OpportunityMoneyNegotiation | null
  open: boolean
  onClose: () => void
}) {
  const { t } = useI18n()
  const resolveKind = useContractKindLabel()
  const seed = useMemo(() => seedOf(op, negotiation), [op, negotiation])
  const [form, setForm] = useState<Form>(seed)
  const [uploading, setUploading] = useState(false)
  const wasOpen = useRef(false)
  const record = useRecordQuotation(op.code)
  const workstream = op.workstream?.code ?? ''
  const upload = useUploadDocument(workstream)
  const refresh = useRefreshDocuments(workstream)
  const canFiles = useCan('workstream.view') && workstream !== ''

  /* Reset on the opening only: a re-read of the deal must not wipe typed boxes. */
  useEffect(() => {
    if (open && !wasOpen.current) {
      setForm(seed)
    }
    wasOpen.current = open
  }, [open, seed])

  const set = <K extends keyof Form>(key: K, value: Form[K]) =>
    setForm((f) => ({ ...f, [key]: value }))

  /* A kind locked by the negotiation wins; otherwise the kind picked may
     already have a round waiting, and that round has to be given a reason. */
  const locked = negotiation !== null && negotiation.kind !== null
  const superseded = locked
    ? negotiation
    : form.kind === ''
      ? null
      : (op.money.open.find((n) => n.kind === form.kind && n.pendingId !== null) ?? null)
  const waiting = superseded !== null && superseded.pendingId !== null ? superseded : null

  const min = op.floors.quotationFrom ?? undefined
  const max = vnToday()
  const { amount, kind, day, validUntil } = form
  const blocker = blockerOf(op, form, min, waiting !== null)

  const send = async (quotationId: string) => {
    setUploading(true)
    for (const file of form.files) {
      const job: DocumentUpload = { file, step: { kind: 'quotation', quotationId } }
      await upload.mutateAsync(job).catch((e: unknown) => {
        toastFail(t(uploadFailed(file.name)), isApiError(e) ? userMessage(e) : undefined)
      })
    }
    await refresh()
    setUploading(false)
  }

  const submit = () => {
    if (blocker || amount === null || kind === '') return
    const at = atOfDay(day)
    record.mutate(
      {
        kind,
        amount,
        currency: form.currency,
        ...(at ? { sentAt: at } : {}),
        ...(validUntil === '' ? {} : { validUntil }),
        ...(waiting ? { supersede: reasonBody(form.reason) } : {}),
      },
      {
        onSuccess: async (row) => {
          toastDone(t(recordedNote(row.roundNo)))
          if (canFiles && form.files.length > 0) await send(row.id)
          onClose()
        },
      },
    )
  }

  return (
    <FormModal
      open={open}
      onClose={onClose}
      title={t(message('Ghi báo giá', 'Record quotation', '견적서 기록'))}
      subtitle={
        <>
          <span className="font-mono">{op.code}</span> · {op.account}
        </>
      }
      line={blocker || summaryOf(form, waiting, resolveKind)}
      error={record.error}
      busy={record.isPending || uploading}
      busyLabel={
        uploading
          ? t(message('Đang tải tệp…', 'Uploading files…', '파일 업로드 중…'))
          : t(message('Đang ghi…', 'Recording…', '기록 중…'))
      }
      submitLabel={t(message('Ghi báo giá', 'Record quotation', '견적서 기록'))}
      icon={FileText}
      ready={blocker === ''}
      onSubmit={submit}
    >
      {waiting && (
        <ClosesBlock waiting={waiting} reason={form.reason} onChange={(r) => set('reason', r)} />
      )}
      <AmountRow
        amount={amount}
        currency={form.currency}
        onAmount={(next) => set('amount', next)}
        onCurrency={(next) => set('currency', next)}
      />
      <ContractKindField value={kind} locked={locked} onChange={(v) => set('kind', v)} />
      <Field label={t(message('Ngày gửi', 'Send date', '발송일'))} required hint={range(min)}>
        <Input
          type="date"
          aria-label={t(message('Ngày gửi', 'Send date', '발송일'))}
          className="pointer-coarse:h-12"
          value={day}
          min={min}
          max={max}
          onChange={(e) => set('day', e.target.value)}
        />
      </Field>
      <Field label={t(message('Hiệu lực đến', 'Valid until', '유효 기한'))}>
        <Input
          type="date"
          aria-label={t(message('Hiệu lực đến', 'Valid until', '유효 기한'))}
          className="pointer-coarse:h-12"
          value={validUntil}
          min={day}
          onChange={(e) => set('validUntil', e.target.value)}
        />
      </Field>

      {canFiles && (
        <StagedFiles
          files={form.files}
          busy={uploading}
          onChange={(files) => set('files', files)}
        />
      )}
    </FormModal>
  )
}

export function CloseNegotiationDialog({
  op,
  negotiation,
  open,
  onClose,
}: {
  op: OpportunityProfileResponse
  negotiation: OpportunityMoneyNegotiation
  open: boolean
  onClose: () => void
}) {
  const { t } = useI18n()
  const [reason, setReason] = useState<Reason>(NO_REASON)
  const close = useCloseQuotation(op.code)
  const pendingId = negotiation.pendingId
  const blocker =
    pendingId === null
      ? t(
          message(
            'Vòng này không còn báo giá nào chờ khách.',
            'This round has no quotation waiting on the customer.',
            '이 차수에는 고객 회신을 기다리는 견적서가 없습니다.',
          ),
        )
      : reasonBlocker(reason)

  useEffect(() => {
    if (open) setReason(NO_REASON)
  }, [open])

  return (
    <FormModal
      open={open}
      onClose={onClose}
      title={t(message('Đóng vòng báo giá', 'Close quotation round', '견적 차수 종료'))}
      subtitle={
        <>
          <span className="font-mono">{op.code}</span> · {op.account}
        </>
      }
      line={blocker}
      error={close.error}
      busy={close.isPending}
      busyLabel={t(message('Đang đóng…', 'Closing…', '종료 중…'))}
      submitLabel={t(message('Đóng vòng báo giá', 'Close quotation round', '견적 차수 종료'))}
      icon={CircleX}
      ready={blocker === ''}
      onSubmit={() => {
        if (blocker || pendingId === null) return
        close.mutate(
          { id: pendingId, body: reasonBody(reason) },
          {
            onSuccess: () => {
              toastDone(
                t(
                  message(
                    'Đã đóng vòng báo giá.',
                    'Quotation round closed.',
                    '견적 차수를 종료했습니다.',
                  ),
                ),
              )
              onClose()
            },
          },
        )
      }}
    >
      <p className="m-0 text-[13px] leading-[1.6]">{closesText(negotiation)}.</p>
      <ReasonFields value={reason} onChange={setReason} />
    </FormModal>
  )
}

export function QuotationPatchDialog({
  op,
  round,
  open,
  onClose,
}: {
  op: OpportunityProfileResponse
  round: QuotationRow
  open: boolean
  onClose: () => void
}) {
  const { t } = useI18n()
  const [kind, setKind] = useState('')
  const [amount, setAmount] = useState<number | null>(null)
  const [currency, setCurrency] = useState<CurrencyCode>(round.currency ?? op.currency ?? 'VND')
  const [validUntil, setValidUntil] = useState('')
  const patch = usePatchQuotation(op.code)
  const kindOptions = useContractKindOptions()
  const kindPicked = kindOptions.some((o) => o.value === kind)
  const sentDay = vnDayOf(round.sentAt)
  const missing = {
    kind: round.kind === null,
    amount: round.amount === null,
    validUntil: round.validUntil === null,
  }

  useEffect(() => {
    if (!open) return
    setKind('')
    setAmount(null)
    setValidUntil('')
  }, [open])

  const filled = {
    kind: missing.kind && kindPicked,
    amount: missing.amount && amount !== null && amount > 0,
    validUntil: missing.validUntil && validUntil !== '',
  }
  const blocker = !Object.values(missing).some(Boolean)
    ? t(
        message(
          'Báo giá này đã đủ thông tin.',
          'This quotation is already complete.',
          '이 견적서는 이미 정보가 모두 입력되어 있습니다.',
        ),
      )
    : !Object.values(filled).some(Boolean)
      ? t(
          message(
            'Nhập thông tin còn thiếu.',
            'Enter the missing information.',
            '누락된 정보를 입력하세요.',
          ),
        )
      : filled.validUntil && validUntil < sentDay
        ? sendBeforeValid()
        : ''

  return (
    <FormModal
      open={open}
      onClose={onClose}
      title={t(message('Bổ sung báo giá', 'Complete quotation', '견적서 보완'))}
      subtitle={
        <>
          <span className="font-mono">{op.code}</span> ·{' '}
          {t(
            message(
              `lần ${round.roundNo}, gửi ${dmy(round.sentAt)}`,
              `round ${round.roundNo}, sent ${dmy(round.sentAt)}`,
              `${round.roundNo}차, ${dmy(round.sentAt)} 발송`,
            ),
          )}
        </>
      }
      line={blocker}
      error={patch.error}
      busy={patch.isPending}
      busyLabel={t(message('Đang lưu…', 'Saving…', '저장 중…'))}
      submitLabel={t(message('Lưu', 'Save', '저장'))}
      icon={FileText}
      ready={blocker === ''}
      onSubmit={() =>
        patch.mutate(
          {
            id: round.id,
            body: {
              ...(filled.kind ? { kind } : {}),
              ...(filled.amount && amount !== null ? { amount, currency } : {}),
              ...(filled.validUntil ? { validUntil } : {}),
            },
          },
          {
            onSuccess: () => {
              toastDone(
                t(message('Đã bổ sung báo giá.', 'Quotation completed.', '견적서를 보완했습니다.')),
              )
              onClose()
            },
          },
        )
      }
    >
      {missing.amount && (
        <AmountRow
          amount={amount}
          currency={currency}
          onAmount={setAmount}
          onCurrency={setCurrency}
        />
      )}
      {missing.kind && <ContractKindField value={kind} onChange={setKind} />}
      {missing.validUntil && (
        <Field label={t(message('Hiệu lực đến', 'Valid until', '유효 기한'))}>
          <Input
            type="date"
            aria-label={t(message('Hiệu lực đến', 'Valid until', '유효 기한'))}
            className="pointer-coarse:h-12"
            value={validUntil}
            min={sentDay}
            onChange={(e) => setValidUntil(e.target.value)}
          />
        </Field>
      )}
    </FormModal>
  )
}
