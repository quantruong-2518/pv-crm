import { useEffect, useMemo, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { CircleX, FileText, Trash2 } from '@pv/ui'
import { Button, Icon, Input, Select, Textarea } from '@pv/ui'
import {
  CONTRACT_KIND_LABEL,
  CURRENCIES,
  ContractKind,
  OPPORTUNITY_STOP_NOTE_MAX,
  OPPORTUNITY_STOP_REASON_OTHER,
  OPPORTUNITY_STOP_REASON_OTHER_LABEL,
  QUOTATION_OUTCOME_LABEL,
  type CurrencyCode,
  type OpportunityMoneyNegotiation,
  type OpportunityProfileResponse,
  type QuotationReason,
  type QuotationRow,
} from '@pv/contracts'
import { isApiError, userMessage } from '@/app/api'
import { useCan } from '@/app/auth'
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
import { Field } from '@/components/ops-fields'
import { compactMoney, symbolOf } from '@/components/deal-money/money'
import { FormModal } from '@/components/deal-pay/form-modal'
import { NumberBox } from '@/components/deal-pay/number-box'
import { DropArea } from '@/components/run/run-documents'

/** The write side of the quotation ledger (ADR 0090): record a send, close a
 *  negotiation, fill what a mailed round lacks. The server judges every rule;
 *  these forms mirror a few only to keep the button honest, and print its
 *  sentence when it refuses. */

const NOT_CLOSED = QUOTATION_OUTCOME_LABEL['not-closed']

const KIND_OPTIONS = [
  { value: '', label: 'Chọn loại hợp đồng…' },
  ...ContractKind.options.map((k) => ({ value: k, label: CONTRACT_KIND_LABEL[k] })),
]

const CURRENCY_OPTIONS = CURRENCIES.map((c) => ({ value: c.code as string, label: c.label }))

const range = (min: string | undefined) =>
  min === undefined ? 'Không sau hôm nay.' : `Từ ${dmy(min)} đến hôm nay.`

/** What the press does to the round still waiting, as a sentence. */
function closesText(negotiation: OpportunityMoneyNegotiation): string {
  const round = negotiation.rounds.find((r) => r.id === negotiation.pendingId)
  const head = [
    round && `Lần ${round.roundNo}`,
    negotiation.amount !== null && compactMoney(negotiation.amount, negotiation.currency),
  ]
    .filter(Boolean)
    .join(' · ')
  return `${head || 'Báo giá đang chờ'} sẽ đóng là ${NOT_CLOSED}`
}

/** What the press will record, once the boxes are filled: the round it
 *  becomes (only known when a round is being replaced), value and kind. */
function summaryOf(form: Form, waiting: OpportunityMoneyNegotiation | null): string {
  if (form.amount === null || form.kind === '') return ''
  const round = waiting?.rounds.find((r) => r.id === waiting.pendingId)
  return [
    round && `Lần ${round.roundNo + 1}`,
    compactMoney(form.amount, form.currency),
    CONTRACT_KIND_LABEL[form.kind],
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
    ? `Chọn lý do ${NOT_CLOSED.toLowerCase()}.`
    : r.reasonId === OPPORTUNITY_STOP_REASON_OTHER && r.note.trim() === ''
      ? `Chọn "${OPPORTUNITY_STOP_REASON_OTHER_LABEL}" thì phải nhập ghi chú.`
      : ''

const reasonBody = (r: Reason): QuotationReason => ({
  reasonId: r.reasonId,
  ...(r.note.trim() === '' ? {} : { note: r.note.trim() }),
})

function ReasonFields({ value, onChange }: { value: Reason; onChange: (next: Reason) => void }) {
  const { data } = useQuery(quotationReasonsQuery)
  const noteNeeded = value.reasonId === OPPORTUNITY_STOP_REASON_OTHER
  const options = [
    { value: '', label: 'Chọn lý do…' },
    ...(data?.rows ?? []).map((r) => ({ value: r.id as string, label: r.name })),
    { value: OPPORTUNITY_STOP_REASON_OTHER, label: OPPORTUNITY_STOP_REASON_OTHER_LABEL },
  ]

  return (
    <>
      <Field label="Lý do" required plain>
        <Select
          label={`Lý do ${NOT_CLOSED.toLowerCase()}`}
          hideLabel
          size="lg"
          value={value.reasonId}
          onChange={(reasonId) => onChange({ ...value, reasonId })}
          options={options}
          className="w-full"
        />
      </Field>
      <Field label="Ghi chú" required={noteNeeded}>
        <Textarea
          autoGrow
          rows={2}
          value={value.note}
          aria-label="Ghi chú về lý do"
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
  return (
    <Field label="Giá trị báo giá" required plain>
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <NumberBox
            label="Giá trị báo giá"
            unit={symbolOf(currency)}
            value={amount}
            onChange={onAmount}
          />
        </div>
        <Select
          label="Đồng tiền"
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
                aria-label={`Bỏ ${file.name}`}
                title="Bỏ tệp"
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
      ? 'Nhập giá trị báo giá.'
      : kind === ''
        ? 'Chọn loại hợp đồng.'
        : day === ''
          ? 'Chọn ngày gửi.'
          : day > vnToday() || (min !== undefined && day < min)
            ? range(min)
            : validUntil !== '' && validUntil < day
              ? 'Hiệu lực đến không được trước ngày gửi.'
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
        toastFail(`Không tải lên được “${file.name}”.`, isApiError(e) ? userMessage(e) : undefined)
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
          toastDone(`Đã ghi báo giá lần ${row.roundNo}.`)
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
      title="Ghi báo giá"
      subtitle={
        <>
          <span className="font-mono">{op.code}</span> · {op.account}
        </>
      }
      line={blocker || summaryOf(form, waiting)}
      error={record.error}
      busy={record.isPending || uploading}
      busyLabel={uploading ? 'Đang tải tệp…' : 'Đang ghi…'}
      submitLabel="Ghi báo giá"
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
      <Field label="Loại hợp đồng" required plain>
        {locked ? (
          <span className="bg-input text-foreground pointer-coarse:h-12 flex h-10 items-center rounded-md px-4 text-[12.5px]">
            {kind === '' ? '' : CONTRACT_KIND_LABEL[kind]}
          </span>
        ) : (
          <Select
            label="Loại hợp đồng"
            hideLabel
            size="lg"
            value={kind}
            onChange={(v) => set('kind', v as ContractKind | '')}
            options={KIND_OPTIONS}
            className="w-full"
          />
        )}
      </Field>
      <Field label="Ngày gửi" required hint={range(min)}>
        <Input
          type="date"
          aria-label="Ngày gửi"
          className="pointer-coarse:h-12"
          value={day}
          min={min}
          max={max}
          onChange={(e) => set('day', e.target.value)}
        />
      </Field>
      <Field label="Hiệu lực đến">
        <Input
          type="date"
          aria-label="Hiệu lực đến"
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
  const [reason, setReason] = useState<Reason>(NO_REASON)
  const close = useCloseQuotation(op.code)
  const pendingId = negotiation.pendingId
  const blocker =
    pendingId === null ? 'Vòng này không còn báo giá nào chờ khách.' : reasonBlocker(reason)

  useEffect(() => {
    if (open) setReason(NO_REASON)
  }, [open])

  return (
    <FormModal
      open={open}
      onClose={onClose}
      title="Đóng vòng báo giá"
      subtitle={
        <>
          <span className="font-mono">{op.code}</span> · {op.account}
        </>
      }
      line={blocker}
      error={close.error}
      busy={close.isPending}
      busyLabel="Đang đóng…"
      submitLabel="Đóng vòng báo giá"
      icon={CircleX}
      ready={blocker === ''}
      onSubmit={() => {
        if (blocker || pendingId === null) return
        close.mutate(
          { id: pendingId, body: reasonBody(reason) },
          {
            onSuccess: () => {
              toastDone('Đã đóng vòng báo giá.')
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
  const [kind, setKind] = useState('')
  const [amount, setAmount] = useState<number | null>(null)
  const [currency, setCurrency] = useState<CurrencyCode>(round.currency ?? op.currency ?? 'VND')
  const [validUntil, setValidUntil] = useState('')
  const patch = usePatchQuotation(op.code)
  const pickedKind = ContractKind.safeParse(kind)
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
    kind: missing.kind && pickedKind.success,
    amount: missing.amount && amount !== null && amount > 0,
    validUntil: missing.validUntil && validUntil !== '',
  }
  const blocker = !Object.values(missing).some(Boolean)
    ? 'Báo giá này đã đủ thông tin.'
    : !Object.values(filled).some(Boolean)
      ? 'Nhập thông tin còn thiếu.'
      : filled.validUntil && validUntil < sentDay
        ? 'Hiệu lực đến không được trước ngày gửi.'
        : ''

  return (
    <FormModal
      open={open}
      onClose={onClose}
      title="Bổ sung báo giá"
      subtitle={
        <>
          <span className="font-mono">{op.code}</span> · lần {round.roundNo}, gửi{' '}
          {dmy(round.sentAt)}
        </>
      }
      line={blocker}
      error={patch.error}
      busy={patch.isPending}
      busyLabel="Đang lưu…"
      submitLabel="Lưu"
      icon={FileText}
      ready={blocker === ''}
      onSubmit={() =>
        patch.mutate(
          {
            id: round.id,
            body: {
              ...(filled.kind && pickedKind.success ? { kind: pickedKind.data } : {}),
              ...(filled.amount && amount !== null ? { amount, currency } : {}),
              ...(filled.validUntil ? { validUntil } : {}),
            },
          },
          {
            onSuccess: () => {
              toastDone('Đã bổ sung báo giá.')
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
      {missing.kind && (
        <Field label="Loại hợp đồng" required plain>
          <Select
            label="Loại hợp đồng"
            hideLabel
            size="lg"
            value={kind}
            onChange={setKind}
            options={KIND_OPTIONS}
            className="w-full"
          />
        </Field>
      )}
      {missing.validUntil && (
        <Field label="Hiệu lực đến">
          <Input
            type="date"
            aria-label="Hiệu lực đến"
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
