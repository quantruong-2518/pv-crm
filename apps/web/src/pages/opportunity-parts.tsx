import { useState, type ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  CalendarClock,
  Check,
  Handshake,
  ListChecks,
  Mail,
  Phone,
  RotateCcw,
  TriangleAlert,
  Users,
  X,
  type IconGlyph,
} from '@pv/ui'
import {
  Avatar,
  Badge,
  Button,
  ContextRail,
  Drawer,
  FlowVector,
  GlassCard,
  Icon,
  Input,
  MetaPill,
  ScreenHeader,
  SectionTitle,
  Select,
  Separator,
  Skeleton,
  Textarea,
  cn,
} from '@pv/ui'
import {
  campaignLabel,
  OPPORTUNITY_CARE_NOTE_MAX,
  OPPORTUNITY_CARE_REASON_OTHER,
  OPPORTUNITY_STAGE_LABEL,
  OPPORTUNITY_STAGE_NOTE_MAX,
  type LeadProfile,
  type OpportunityMilestoneKind,
  type OpportunityProfileResponse,
  type OpportunityRow,
} from '@pv/contracts'
import { userMessage } from '@/app/api'
import { toastDone } from '@/app/toast'
import { dm, dmhm } from '@/lib/date'
import { phoneText } from '@/lib/phone'
import { realContact } from '@/data/lead-profile'
import { BADGE_INK, milestonesOf, standingLabel, STATE_TONE } from '@/data/opportunities'
import { useCareReasonLabel, useCareReasons } from '@/data/sales-config'
import {
  opportunityStageHistoryQuery,
  useLogMilestone,
  usePushToCare,
  useReactivateDeal,
} from '@/data/opportunities-write'
import type { DealDraft } from '@/data/deal-draft'
import type { FlowVectorStep, RailObject } from '@pv/ui'
import type { TouchEvent, TouchFocus } from '@/data/touches'
import { Field } from '@/components/ops-fields'
import { ActivityTimeline } from '@/components/lead-history-card'

/** Module 3 · the blocks of the deal screen, around the form card itself.
 *
 *  The page keeps the query, the four ways it fails to draw, and the assembly;
 *  everything that PAINTS is here, the same split `lead-detail.tsx` /
 *  `lead-parts.tsx` runs on. The form card has a file of its own because all
 *  three doors share it — see `opportunity-form-card.tsx`. */

/** The header, with no glass around it.
 *
 *  Identity on the left, the person to call on the right, and ONE row under
 *  the title carrying both provenance and the object chain. The card that used
 *  to wrap this is gone: it split a header into two halves that competed, and
 *  law 12 counts every surface.
 *
 *  THE RAIL RIDES IN THAT ROW rather than standing under the header as a strip
 *  of its own. Law 10 is satisfied either way, and the deal's own lead code was
 *  being printed twice — once as a dead pill, once as the rail's chip. The chip
 *  wins: it opens the record, the pill did not. */
export function DealHeader({
  op,
  lead,
  rail,
  onBack,
  onOpenLead,
}: {
  op: OpportunityRow
  lead: LeadProfile | null
  /** The object chain, already dressed by `railOf`. Law 10. */
  rail: RailObject[]
  onBack: () => void
  onOpenLead: () => void
}) {
  /* Read from the REAL profile, the same translation `lead-detail` runs on. */
  const contact = lead ? realContact(lead) : null

  return (
    <ScreenHeader
      back={{ label: 'Sổ cơ hội', onClick: onBack }}
      kicker={
        <span className="flex items-center gap-2">
          <span className="font-sans">Cơ hội</span>
          {op.code}
        </span>
      }
      title={op.name}
      actions={
        <>
          {contact ? (
            <span className="flex min-w-0 items-center gap-2">
              <Avatar name={contact.name} size="sm" />
              <span className="flex min-w-0 flex-col">
                <span className="truncate text-[12.5px] font-semibold">{contact.name}</span>
                <span className="text-muted-foreground truncate text-[11px] leading-[1.5]">
                  {[contact.title, phoneText(contact.phone)].filter(Boolean).join(' · ') ||
                    'chưa có kênh gọi'}
                </span>
              </span>
            </span>
          ) : (
            <span className="text-warning text-[11.5px] leading-[1.5]">
              Chưa đọc được người liên hệ.
            </span>
          )}

          {/* ICON ONLY, so it needs a name of its own — and `tel:` rather than
              a button that only lights up: a button that does nothing on press
              reads as a broken screen, not as a missing feature. */}
          <Button
            size="md"
            variant="secondary"
            aria-label={contact ? `Gọi ${contact.name}` : 'Gọi khách'}
            title={phoneText(contact?.phone) || 'Chưa moi được kênh gọi lại được'}
            disabled={!contact?.phone}
            className="pointer-coarse:size-12 size-10 shrink-0 px-0"
            onClick={() => {
              if (contact?.phone) window.location.href = `tel:${contact.phone}`
            }}
          >
            <Icon icon={Phone} size={16} />
          </Button>

          {/* 40px on a mouse, 48px on a finger (law 13). NOT `size="lg"`: that
              is 48px everywhere and would swell the header on the desktop. */}
          <Button size="md" className="pointer-coarse:h-12" onClick={onOpenLead}>
            <Icon icon={Users} size={16} />
            Hồ sơ lead
          </Button>
        </>
      }
      meta={
        <>
          {/* ALWAYS drawn (law 10), even as one chip: the deal's own azure chip
              marks where it stands in lead → deal → contract, and a reader cut
              off from the lead still needs that mark. */}
          <ContextRail objects={rail} />
          {lead ? (
            <>
              <MetaPill>{lead.province ?? '—'}</MetaPill>
              <MetaPill>{campaignLabel(lead.source)}</MetaPill>
            </>
          ) : (
            <span className="text-muted-foreground text-[11.5px] leading-[1.5]">
              Chưa đọc được hồ sơ lead <span className="font-mono">{op.leadCode}</span> — có thể nó
              nằm ngoài phạm vi quyền của bạn.
            </span>
          )}
        </>
      }
    />
  )
}

/** The history tab — who has carried the deal, what happened to it, and which
 *  columns it stood in.
 *
 *  Drawn WITHOUT a card of its own: it lives inside the form card's glass, and
 *  a second sheet of glass inside the first is the fifth layer law 12 refuses.
 *  That is why it reaches for `ActivityTimeline` rather than `ActivityCard`. */
export function DealHistoryTab({
  op,
  touches,
  vector,
  me,
  focus,
  onFocusStep,
}: {
  op: OpportunityRow
  touches: readonly TouchEvent[]
  vector: readonly FlowVectorStep[]
  me?: string
  focus: TouchFocus | null
  onFocusStep: (id: string) => void
}) {
  const history = useQuery(opportunityStageHistoryQuery(op.code))
  const rows = history.data?.rows ?? []

  return (
    <div className="flex min-w-0 flex-col gap-5">
      {vector.length > 0 && <FlowVector steps={vector} you={me} onOpen={onFocusStep} />}

      <ActivityTimeline history={touches} focus={focus} />

      <Separator />

      <SectionTitle size="sm" hint="Mỗi lượt đổi cột, và đơn đã đứng đó bao lâu.">
        Đã đi qua
      </SectionTitle>

      {history.isPending ? (
        <Skeleton className="h-16 w-full" />
      ) : rows.length === 0 ? (
        <p className="text-muted-foreground text-[11.5px] leading-[1.5]">
          Chưa có lượt đổi cột nào được ghi. Đơn mở trước ngày sổ lịch sử chạy thì bắt đầu từ lượt
          chuyển tiếp theo — số cũ không suy ngược lại được.
        </p>
      ) : (
        <ol className="flex flex-col gap-3">
          {rows.map((e) => (
            <li key={e.id} className="flex flex-col gap-1">
              <span className="text-[12px] leading-[1.5]">
                {/* A missing end is a real event, not missing data: entering
                    the board when the deal opened, leaving it when the deal
                    was signed or lost. */}
                {e.from === null
                  ? `Vào bảng ở ${e.to === null ? '—' : stageName(e.to)}`
                  : e.to === null
                    ? `Ra khỏi bảng từ ${stageName(e.from)}`
                    : `${stageName(e.from)} → ${stageName(e.to)}`}
              </span>
              <span className="text-muted-foreground text-[11px] leading-[1.5]">
                {dm(e.at)} · {e.by}
                {e.daysInFrom !== null && ` · đứng ${e.daysInFrom} ngày`}
              </span>
              {e.note !== undefined && (
                <span className="text-muted-foreground text-[11px] leading-[1.5]">{e.note}</span>
              )}
            </li>
          ))}
        </ol>
      )}
    </div>
  )
}

/** A column's label, from the ONE table the server prints from as well — no
 *  fallback, because `StageKey` and this record are the same five keys. */
const stageName = (key: NonNullable<OpportunityRow['stage']>) => OPPORTUNITY_STAGE_LABEL[key]

/** The sticky bar — what BLOCKS on the left, where to go on the right.
 *
 *  Solid ground (`bg-hc-surface`), no `backdrop-blur`: `.glass-b` sits at alpha
 *  .84 so only 16% of the background comes through, and blurring a static
 *  ground at 16% strength is work the eye never sees — on an element that
 *  repaints every scrolled frame. */
export function DealToolsBar({
  draft,
  op,
  onSign,
  quotationLogged = false,
  canSendEmail = false,
  composeBlocked,
  onCompose,
}: {
  draft: DealDraft
  /** `null` on the create door — nothing is signed and nothing is dirty yet. */
  op: OpportunityProfileResponse | null
  onSign: () => void
  /** Has a `quotation-sent` touch been recorded? The sign door 409s without one
   *  (ADR 0064 §3), so the button says so BEFORE the press rather than after. */
  quotationLogged?: boolean
  /** `lead.send-email`, scoped — the permission `data/mas.ts` declares. */
  canSendEmail?: boolean
  /** Why this deal cannot be written to, when it cannot. */
  composeBlocked?: string
  /** Absent on the create door: there is no deal to write about yet. */
  onCompose?: () => void
}) {
  const creating = draft.mode === 'create'
  const blocking = Boolean(draft.error) || draft.missing.length > 0

  /* Three states ruling each other out: signed prints a static pill for every
     role, a parked deal draws no sign button (409 — the reopen button beside it
     is the way back), anything else opens the panel for `opportunity.close`. */
  const signed = op?.contractCode !== undefined
  const parked = op?.state === 'care'
  const pending = op?.pendingSign

  return (
    <div className="z-10 lg:sticky lg:bottom-4">
      <GlassCard
        variant="b"
        className="bg-hc-surface shadow-panel flex flex-wrap items-center gap-3 p-3"
        aria-label="Thanh công cụ"
      >
        {/* WHERE THE DEAL STANDS, on its own line above the actions: the row
            below is already full of buttons. Absent on the create door — a deal
            that does not exist yet stands nowhere. */}
        {op && <DealMoves op={op} canEdit={draft.canEdit} />}

        <div className="flex min-w-0 flex-1 items-center gap-2">
          <span
            className={cn(
              'flex min-w-0 items-center gap-2 text-[11.5px] leading-[1.5]',
              blocking && 'text-destructive-foreground',
            )}
            aria-live="polite"
          >
            {blocking && <Icon icon={TriangleAlert} size={16} className="shrink-0" />}
            {/* A refusal from the server wins every other sentence: whoever
                just pressed Save and saw nothing change needs the reason
                before they need a count of unsaved boxes. */}
            {draft.error
              ? userMessage(draft.error)
              : draft.missing.length > 0
                ? `Còn thiếu ${draft.missing.join(' · ')}`
                : creating
                  ? 'Phiếu đã đủ — bấm Tạo cơ hội để ghi vào sổ.'
                  : draft.dirty.length > 0
                    ? `${draft.dirty.length} ô chưa lưu — rời màn bây giờ là mất.`
                    : 'Phiếu đã khớp với bản trên máy chủ.'}
          </span>
        </div>

        <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
          {signed && (
            <MetaPill icon={Handshake} tone="success" mono>
              Đã ký · {op?.contractCode}
            </MetaPill>
          )}
          {pending && (
            <MetaPill tone="warning">
              Chờ duyệt ký · {pending.raisedBy} gửi {dmhm(pending.raisedAt)}
            </MetaPill>
          )}

          {/* Every button in this bar clears law 13's 48px floor on a coarse
              pointer, and keeps the bar's 40px rhythm on a mouse. A bar where
              half the buttons are reachable is worse than one that is all small. */}
          {/* Locked buttons say WHY on the title, the same way the lead toolbar
              does: a panel filled in and then refused with a 403 is the one
              outcome a disabled button is here to prevent. */}
          {onCompose && (
            <Button
              size="md"
              variant="secondary"
              className="pointer-coarse:h-12"
              disabled={!canSendEmail || Boolean(composeBlocked)}
              title={canSendEmail ? composeBlocked : 'Cần quyền gửi email cho lead.'}
              onClick={onCompose}
            >
              <Icon icon={Mail} size={16} />
              Gửi mail cho khách
            </Button>
          )}

          {draft.canEdit && (
            <Button
              size="md"
              variant="ghost"
              className="pointer-coarse:h-12"
              disabled={draft.dirty.length === 0 || draft.busy}
              onClick={draft.reset}
            >
              Bỏ sửa
            </Button>
          )}

          {/* HIDDEN OUTRIGHT without `opportunity.close` — decision 4 of ADR
              `docs/decisions/0018-opportunity-module-decisions.md`. Hiding is
              NOT the fence: the real one stays at the api layer. */}
          {/* Shut until a quotation has been sent, reason on the title: the door
              answers 409 otherwise, and a seller who filled in the whole panel
              first deserves to have been told before pressing. */}
          {!creating && !signed && !parked && draft.canClose && (
            <Button
              size="md"
              variant="success"
              className="pointer-coarse:h-12"
              disabled={Boolean(pending) || !quotationLogged}
              title={
                quotationLogged
                  ? undefined
                  : 'Chưa ghi mốc Quotation — gửi báo giá và ghi mốc trước khi chốt.'
              }
              onClick={onSign}
            >
              <Icon icon={Check} size={16} />
              Chốt thắng
            </Button>
          )}

          {/* Hidden, not greyed, for a read-only role — the same call ADR 0018
              makes for the sign button above. */}
          {draft.canEdit && (
            <Button
              size="md"
              className="pointer-coarse:h-12"
              disabled={!draft.canSubmit}
              onClick={draft.submit}
            >
              <Icon icon={Check} size={16} />
              {draft.busy ? 'Đang lưu…' : creating ? 'Tạo cơ hội' : 'Lưu phiếu'}
            </Button>
          )}

          {/* Room for the floating AI button (60px, `bottom-8 right-8` of
              AppShell) — without it, it covers the last action on the bar. */}
          <span aria-hidden className="hidden shrink-0 lg:block lg:size-[60px]" />
        </div>
      </GlassCard>
    </div>
  )
}

/** Where the deal STANDS, and the three doors that move it (ADR 0064 §3).
 *
 *  A read-only badge, never a picker: `PATCH :code/stage` is gone, and a seller
 *  picks neither state nor column. Every button here carries a FACT instead — a
 *  milestone that really happened, a parking with a reason, a reopen — and the
 *  server's single stage writer draws the conclusion from it.
 *
 *  WHICH milestone buttons appear is `milestonesOf`'s answer rather than this
 *  block's: it applies the same rank rule the door refuses by, so no button on
 *  screen can earn a 409 for naming the wrong column. */
function DealMoves({ op, canEdit }: { op: OpportunityProfileResponse; canEdit: boolean }) {
  const [note, setNote] = useState('')
  const [caring, setCaring] = useState(false)
  const milestone = useLogMilestone(op.code)
  const reopen = useReactivateDeal(op.code)
  const careReason = useCareReasonLabel(op.careReason)

  const offers = milestonesOf(op)
  const parked = op.state === 'care'
  const signed = op.contractCode !== undefined
  const busy = milestone.isPending || reopen.isPending
  const failure = milestone.error ?? reopen.error

  /* The note box is shared by every milestone button rather than repeated per
     button: one deal moves one column at a time, and four note boxes on a
     sticky bar is four boxes nobody fills in. */
  const record = (kind: OpportunityMilestoneKind, label: string) => {
    const typed = note.trim()
    milestone.mutate(
      { kind, ...(typed === '' ? {} : { note: typed }) },
      {
        onSuccess: () => {
          setNote('')
          toastDone(`Đã ghi mốc ${label}.`)
        },
      },
    )
  }

  return (
    <div className="flex basis-full flex-wrap items-center gap-2">
      {/* `BADGE_INK` only on the parked tone — law 13; see its own note. */}
      <Badge tone={STATE_TONE[op.state]} className={cn(op.state === 'care' && BADGE_INK)}>
        {standingLabel(op)}
      </Badge>

      {op.daysInStage !== null && (
        <span className="text-muted-foreground text-[11px] leading-[1.5]">
          {op.daysInStage} ngày ở cột này
        </span>
      )}

      {/* A parked deal prints WHY it is parked, right beside the reopen button:
          whoever comes back to it a month later is reading this bar to decide.
          The stored value is a catalogue id, so it is read through the book. */}
      {parked && careReason !== undefined && (
        <span className="text-muted-foreground min-w-0 truncate text-[11px] leading-[1.5]">
          Lý do: {careReason}
          {op.careNote !== undefined && ` · ${op.careNote}`}
        </span>
      )}

      {/* A deal that has not taken its PIC records nothing, and the door says so
          in a 409 — print the reason instead of three refusable buttons. */}
      {canEdit && !signed && !parked && offers.length === 0 && op.stage !== null && (
        <span className="text-muted-foreground text-[11px] leading-[1.5]">
          Chưa đủ PIC nên chưa ghi mốc được — cần một trưởng phòng và ít nhất một người nữa đứng
          đơn.
        </span>
      )}

      {canEdit && !signed && (
        <>
          {offers.length > 0 && (
            <Input
              value={note}
              aria-label="Ghi chú mốc"
              placeholder="Ghi chú mốc (tuỳ chọn)"
              maxLength={OPPORTUNITY_STAGE_NOTE_MAX}
              className="w-full sm:w-[220px]"
              onChange={(e) => setNote(e.target.value)}
            />
          )}

          {offers.map((offer) => (
            <Button
              key={offer.kind}
              size="md"
              variant="secondary"
              className="pointer-coarse:h-12"
              disabled={busy}
              /* The repeat wording is the whole point of `repeat`: pressing
                 Quotation again is another Nego round, not a mistake. */
              title={
                offer.repeat
                  ? 'Ghi thêm một lần nữa ở đúng cột này — cột và đồng hồ giữ nguyên.'
                  : undefined
              }
              onClick={() => record(offer.kind, OPPORTUNITY_STAGE_LABEL[offer.stage])}
            >
              <Icon icon={ListChecks} size={16} />
              {offer.repeat ? 'Ghi lại ' : 'Ghi mốc '}
              {OPPORTUNITY_STAGE_LABEL[offer.stage]}
            </Button>
          ))}

          {parked ? (
            <Button
              size="md"
              variant="secondary"
              className="pointer-coarse:h-12"
              disabled={busy}
              onClick={() =>
                reopen.mutate(undefined, {
                  onSuccess: () => toastDone('Đã mở lại đơn — về đúng cột cũ.'),
                })
              }
            >
              <Icon icon={RotateCcw} size={16} />
              Mở lại
            </Button>
          ) : (
            <Button
              size="md"
              variant="ghost"
              className="pointer-coarse:h-12"
              disabled={busy}
              onClick={() => setCaring(true)}
            >
              <Icon icon={CalendarClock} size={16} />
              Đẩy sang danh sách chăm sóc
            </Button>
          )}
        </>
      )}

      {failure && (
        <span
          role="alert"
          className="text-destructive-foreground min-w-0 text-[11px] leading-[1.5]"
        >
          {userMessage(failure)}
        </span>
      )}

      <CareDrawer op={op} open={caring} onClose={() => setCaring(false)} />
    </div>
  )
}

/** Park a deal on the care list — a panel over the profile, the same overlay
 *  language `SignDrawer` uses and for the same reason: whoever presses the button
 *  is half way through reading this deal.
 *
 *  THE REASON IS PICKED, NOT TYPED. The catalogue lives in `sales.config_entry`
 *  (ADR 0064 §6) and the server refuses a key that is not in it, so a text box
 *  here could only invite a 400: what travels is the configuration row's `id`.
 *  The list is cut to the column the deal stands in, exactly as the door cuts
 *  it, plus the `other` row for the reason nobody has written down yet.
 *
 *  The note is required for the `other` reason and optional otherwise — the
 *  contract's own refine, mirrored so the button says whether it will be
 *  accepted before the press. Every reason in the catalogue names itself. */
function CareDrawer({
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
  const care = usePushToCare(op.code)
  const reasons = useCareReasons(op.stage)
  const busy = care.isPending
  const noteNeeded = reasonKey === OPPORTUNITY_CARE_REASON_OTHER
  const ready = reasonKey !== '' && (!noteNeeded || note.trim() !== '') && !busy

  const submit = () =>
    care.mutate(
      { reasonKey, ...(note.trim() === '' ? {} : { note: note.trim() }) },
      {
        /* Closes ONLY once the server has accepted. Closing first and sending
           after is the surest way for a refusal to vanish without a trace. */
        onSuccess: () => {
          toastDone(`Đã đẩy ${op.code} sang danh sách chăm sóc.`)
          setReasonKey('')
          setNote('')
          onClose()
        },
      },
    )

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title="Đẩy sang danh sách chăm sóc"
      subtitle={
        <>
          <span className="font-mono">{op.code}</span> · {op.account} — đơn rời năm cột, và mở lại
          thì về đúng cột nó đang đứng.
        </>
      }
      footer={
        <div className="flex flex-wrap items-center justify-between gap-4">
          <span
            className={cn(
              'min-w-0 flex-1 text-[11.5px] leading-[1.5]',
              care.error ? 'text-destructive-foreground' : 'text-muted-foreground',
            )}
            aria-live="polite"
          >
            {care.error
              ? userMessage(care.error)
              : busy
                ? 'Đang đẩy sang chăm sóc…'
                : ready
                  ? 'Lead gốc KHÔNG đổi trạng thái — chỉ đơn này rời bảng.'
                  : noteNeeded
                    ? 'Chọn "Khác" thì phải ghi rõ lý do.'
                    : 'Chọn một lý do trong danh mục.'}
          </span>
          <div className="flex shrink-0 gap-2">
            <Button size="md" variant="ghost" disabled={busy} onClick={onClose}>
              <Icon icon={X} size={16} />
              Huỷ
            </Button>
            <Button size="md" disabled={!ready} onClick={submit}>
              <Icon icon={CalendarClock} size={16} />
              {busy ? 'Đang đẩy…' : 'Đẩy sang chăm sóc'}
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
          hint="Danh mục lý do ở màn Thiết lập, cắt theo đúng cột đơn đang đứng. Thiếu lý do nào thì thêm ở đó, không gõ tay ở đây."
        >
          <Select
            label="Lý do đẩy sang chăm sóc"
            hideLabel
            value={reasonKey}
            onChange={setReasonKey}
            options={careReasonOptions(reasons)}
            className="w-full"
          />
        </Field>

        <Field
          label="Ghi chú"
          required={noteNeeded}
          hint="Câu của riêng đơn này — khách nói gì, ai đổi ý, bao giờ nên gọi lại."
        >
          <Textarea
            autoGrow
            rows={3}
            value={note}
            aria-label="Ghi chú khi đẩy sang chăm sóc"
            aria-required={noteNeeded}
            maxLength={OPPORTUNITY_CARE_NOTE_MAX}
            onChange={(e) => setNote(e.target.value)}
          />
        </Field>
      </div>
    </Drawer>
  )
}

/** The picker's rows: the catalogue for this column, then the `other` row.
 *
 *  The empty first row is what makes "nobody has chosen yet" a state the drawer
 *  can be in — a select opening on the first real reason would let one press
 *  send a reason nobody read. */
function careReasonOptions(reasons: readonly { id: string; label: string }[]) {
  return [
    { value: '', label: 'Chọn lý do…' },
    ...reasons.map((r) => ({ value: r.id, label: r.label })),
    { value: OPPORTUNITY_CARE_REASON_OTHER, label: 'Khác' },
  ]
}

/** The screen that would not open — ONE block, four sentences, glyph follows
 *  the sentence. Four near-identical empty blocks would drift apart on the
 *  second edit; what differs is the SENTENCE, so the sentence is the prop. */
export function EmptyOp({
  icon,
  note,
  onBack,
}: {
  icon: IconGlyph
  note: ReactNode
  onBack: () => void
}) {
  return (
    <div className="flex flex-col items-center gap-3 py-12 text-center">
      <Icon icon={icon} size={26} className="text-muted-foreground" />
      <p className="text-muted-foreground text-[12.5px] leading-[1.65]">{note}</p>
      <Button size="sm" variant="ghost" onClick={onBack}>
        Về sổ cơ hội
      </Button>
    </div>
  )
}
